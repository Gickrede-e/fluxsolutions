import { shareCreateSchema } from '@fluxsolutions/shared';
import type { FastifyPluginAsync } from 'fastify';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { env } from '../config/env.js';
import { verifyPassword, hashPassword } from '../lib/password.js';
import { prisma } from '../lib/prisma.js';
import { evaluateShareAvailability } from '../lib/share-policy.js';
import { getPresignedDownloadUrl } from '../lib/s3.js';
import { signShareVerificationToken, verifyShareVerificationToken } from '../lib/tokens.js';
import { requireAuth } from '../middleware/auth.js';
import { writeAuditLog } from '../services/audit.service.js';
import { getRequestIp, getUserAgent } from '../utils/http.js';
import { asNumber } from '../utils/string.js';

const shareTokenParamsSchema = z.object({
  token: z.string().min(16).max(128),
});

const verifyShareSchema = z.object({
  password: z.string().min(1).max(128),
});

const downloadQuerySchema = z.object({
  verificationToken: z.string().optional(),
});

const sharesRoutes: FastifyPluginAsync = async (app) => {
  app.post('/shares', { preHandler: [requireAuth] }, async (request, reply) => {
    const authUser = request.authUser;
    if (!authUser) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const parsed = shareCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation_failed', details: parsed.error.flatten() });
    }

    if (parsed.data.expiresAt && new Date(parsed.data.expiresAt) <= new Date()) {
      return reply.code(400).send({ error: 'invalid_expiry', message: 'expiresAt must be in the future' });
    }

    const file = await prisma.file.findFirst({
      where: {
        id: parsed.data.fileId,
        ownerId: authUser.id,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!file) {
      return reply.code(404).send({ error: 'file_not_found' });
    }

    const shareToken = nanoid(32);
    const passwordHash = parsed.data.password ? await hashPassword(parsed.data.password) : null;

    const share = await prisma.share.create({
      data: {
        fileId: parsed.data.fileId,
        token: shareToken,
        passwordHash,
        expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
        oneTime: parsed.data.oneTime,
        maxDownloads: parsed.data.maxDownloads,
      },
      select: {
        id: true,
        token: true,
        fileId: true,
        expiresAt: true,
        maxDownloads: true,
        downloadsCount: true,
        oneTime: true,
      },
    });

    const publicUrl = `${env.WEB_BASE_URL}/s/${share.token}`;

    await writeAuditLog({
      actorId: authUser.id,
      action: 'share.created',
      targetType: 'share',
      targetId: share.id,
      ip: getRequestIp(request),
      userAgent: getUserAgent(request),
      metadata: {
        fileId: share.fileId,
        oneTime: share.oneTime,
        maxDownloads: share.maxDownloads,
        expiresAt: share.expiresAt ? share.expiresAt.toISOString() : null,
        passwordProtected: Boolean(passwordHash),
      },
    });

    return reply.code(201).send({
      share: {
        ...share,
        url: publicUrl,
        passwordProtected: Boolean(passwordHash),
      },
    });
  });

  app.get('/s/:token', async (request, reply) => {
    const parsedParams = shareTokenParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.code(400).send({ error: 'validation_failed', details: parsedParams.error.flatten() });
    }

    const share = await prisma.share.findUnique({
      where: {
        token: parsedParams.data.token,
      },
      include: {
        file: {
          select: {
            id: true,
            filename: true,
            size: true,
            mime: true,
            scanStatus: true,
            deletedAt: true,
          },
        },
      },
    });

    if (!share || !share.file) {
      return reply.code(404).send({ error: 'share_not_found' });
    }

    const availability = evaluateShareAvailability(share, share.file);

    return reply.send({
      token: share.token,
      file: {
        id: share.file.id,
        filename: share.file.filename,
        size: asNumber(share.file.size),
        mime: share.file.mime,
        scanStatus: share.file.scanStatus,
      },
      passwordRequired: Boolean(share.passwordHash),
      expiresAt: share.expiresAt,
      oneTime: share.oneTime,
      maxDownloads: share.maxDownloads,
      downloadsCount: share.downloadsCount,
      availability,
    });
  });

  app.post('/s/:token/verify', async (request, reply) => {
    const parsedParams = shareTokenParamsSchema.safeParse(request.params);
    const parsedBody = verifyShareSchema.safeParse(request.body);

    if (!parsedParams.success || !parsedBody.success) {
      return reply.code(400).send({
        error: 'validation_failed',
        details: {
          params: parsedParams.success ? undefined : parsedParams.error.flatten(),
          body: parsedBody.success ? undefined : parsedBody.error.flatten(),
        },
      });
    }

    const share = await prisma.share.findUnique({
      where: {
        token: parsedParams.data.token,
      },
      include: {
        file: {
          select: {
            deletedAt: true,
            scanStatus: true,
          },
        },
      },
    });

    if (!share || !share.file) {
      return reply.code(404).send({ error: 'share_not_found' });
    }

    const availability = evaluateShareAvailability(share, share.file);
    if (!availability.available) {
      return reply.code(410).send({ error: availability.reason });
    }

    if (!share.passwordHash) {
      return reply.send({
        verificationToken: null,
        passwordRequired: false,
      });
    }

    const validPassword = await verifyPassword(share.passwordHash, parsedBody.data.password);
    if (!validPassword) {
      return reply.code(401).send({ error: 'invalid_password' });
    }

    const verificationToken = signShareVerificationToken({
      shareId: share.id,
      token: share.token,
    });

    return reply.send({
      verificationToken,
      passwordRequired: true,
    });
  });

  app.get('/s/:token/download', async (request, reply) => {
    const parsedParams = shareTokenParamsSchema.safeParse(request.params);
    const parsedQuery = downloadQuerySchema.safeParse(request.query);

    if (!parsedParams.success || !parsedQuery.success) {
      return reply.code(400).send({
        error: 'validation_failed',
        details: {
          params: parsedParams.success ? undefined : parsedParams.error.flatten(),
          query: parsedQuery.success ? undefined : parsedQuery.error.flatten(),
        },
      });
    }

    const share = await prisma.share.findUnique({
      where: {
        token: parsedParams.data.token,
      },
      include: {
        file: {
          select: {
            id: true,
            filename: true,
            storageKey: true,
            deletedAt: true,
            scanStatus: true,
          },
        },
      },
    });

    if (!share || !share.file) {
      return reply.code(404).send({ error: 'share_not_found' });
    }

    const availability = evaluateShareAvailability(share, share.file);
    if (!availability.available) {
      return reply.code(410).send({ error: availability.reason });
    }

    if (share.passwordHash) {
      const token = parsedQuery.data.verificationToken;
      if (!token) {
        return reply.code(401).send({ error: 'password_verification_required' });
      }

      try {
        const payload = verifyShareVerificationToken(token);
        if (payload.shareId !== share.id || payload.token !== share.token) {
          return reply.code(401).send({ error: 'invalid_verification_token' });
        }
      } catch {
        return reply.code(401).send({ error: 'invalid_verification_token' });
      }
    }

    const incremented = await prisma.share.updateMany({
      where: {
        id: share.id,
        ...(share.expiresAt ? { expiresAt: { gt: new Date() } } : {}),
        ...(share.oneTime ? { downloadsCount: { lt: 1 } } : {}),
        ...(share.maxDownloads ? { downloadsCount: { lt: share.maxDownloads } } : {}),
      },
      data: {
        downloadsCount: {
          increment: 1,
        },
      },
    });

    if (incremented.count === 0) {
      return reply.code(410).send({ error: 'share_limit_reached' });
    }

    const cacheControl =
      share.passwordHash || share.oneTime || share.maxDownloads || share.expiresAt
        ? 'private, no-store'
        : 'public, max-age=31536000, immutable';

    const downloadUrl = await getPresignedDownloadUrl({
      key: share.file.storageKey,
      filename: share.file.filename,
      cacheControl,
    });

    await writeAuditLog({
      actorId: null,
      action: 'share.download',
      targetType: 'share',
      targetId: share.id,
      ip: getRequestIp(request),
      userAgent: getUserAgent(request),
      metadata: {
        fileId: share.file.id,
      },
    });

    return reply.redirect(downloadUrl);
  });
};

export default sharesRoutes;
