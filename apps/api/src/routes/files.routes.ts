import {
  fileRenameMoveSchema,
  MAX_MULTIPART_PARTS,
  sanitizeFilename,
} from '@fluxsolutions/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { env } from '../config/env.js';
import { metrics } from '../lib/metrics.js';
import { prisma } from '../lib/prisma.js';
import {
  completeMultipartUpload,
  createMultipartUpload,
  deleteObjectByKey,
  getMultipartPartUrls,
  getPresignedDownloadUrl,
  readObjectStartForMime,
} from '../lib/s3.js';
import { signUploadToken, verifyUploadToken } from '../lib/tokens.js';
import { requireAuth } from '../middleware/auth.js';
import { writeAuditLog } from '../services/audit.service.js';
import { triggerAsyncScan } from '../services/scanner.service.js';
import { getRequestIp, getUserAgent } from '../utils/http.js';
import { asNumber } from '../utils/string.js';
import { randomToken } from '../lib/hash.js';

const initiateUploadSchema = z.object({
  filename: z.string().min(1).max(255),
  mime: z.string().min(3).max(160),
  size: z.number().int().positive(),
  folderId: z.string().cuid().optional().nullable(),
});

const resumeUploadSchema = z.object({
  uploadToken: z.string().min(10),
  partNumbers: z.array(z.number().int().positive()).optional(),
});

const completeUploadSchema = z.object({
  uploadToken: z.string().min(10),
  parts: z
    .array(
      z.object({
        partNumber: z.number().int().positive(),
        eTag: z.string().min(1),
      }),
    )
    .min(1),
  checksum: z.string().max(128).optional(),
});

const listFilesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().optional(),
  folderId: z.string().cuid().optional(),
});

const fileIdParamsSchema = z.object({
  id: z.string().cuid(),
});

function buildStorageKey(ownerId: string, filename: string): string {
  const now = new Date();
  const safeFilename = sanitizeFilename(filename);
  const randomSuffix = randomToken(8);
  return `${ownerId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomSuffix}-${safeFilename}`;
}

function validateMimeType(mime: string): boolean {
  return env.allowedMimeTypes.includes(mime);
}

const filesRoutes: FastifyPluginAsync = async (app) => {
  app.post('/files/initiate-upload', { preHandler: [requireAuth] }, async (request, reply) => {
    const authUser = request.authUser;
    if (!authUser) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const parsed = initiateUploadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation_failed', details: parsed.error.flatten() });
    }

    const { filename, mime, size, folderId } = parsed.data;

    if (size > env.MAX_FILE_SIZE_BYTES) {
      return reply.code(413).send({
        error: 'file_too_large',
        message: `Max file size is ${env.MAX_FILE_SIZE_BYTES} bytes`,
      });
    }

    if (!validateMimeType(mime)) {
      return reply.code(415).send({
        error: 'unsupported_media_type',
        message: 'MIME type is not allowed by server policy',
      });
    }

    if (folderId) {
      const folder = await prisma.folder.findFirst({
        where: {
          id: folderId,
          ownerId: authUser.id,
        },
        select: {
          id: true,
        },
      });

      if (!folder) {
        return reply.code(404).send({ error: 'folder_not_found' });
      }
    }

    const partSize = env.MULTIPART_PART_SIZE_BYTES;
    const partCount = Math.ceil(size / partSize);

    if (partCount > MAX_MULTIPART_PARTS) {
      return reply.code(400).send({
        error: 'too_many_parts',
        message: `Multipart upload exceeds ${MAX_MULTIPART_PARTS} parts. Increase part size.`,
      });
    }

    const key = buildStorageKey(authUser.id, filename);

    const multipart = await createMultipartUpload({
      key,
      mime,
      cacheControl: 'private, no-store',
    });

    const partNumbers = Array.from({ length: partCount }, (_, index) => index + 1);
    const partUrls = await getMultipartPartUrls({
      key,
      uploadId: multipart.uploadId,
      partNumbers,
    });

    const uploadToken = signUploadToken({
      ownerId: authUser.id,
      filename: sanitizeFilename(filename),
      mime,
      size,
      folderId: folderId ?? null,
      key,
      uploadId: multipart.uploadId,
      partSize,
      partCount,
      type: 'multipart_upload',
    });

    await writeAuditLog({
      actorId: authUser.id,
      action: 'file.upload.initiated',
      targetType: 'file',
      targetId: null,
      ip: getRequestIp(request),
      userAgent: getUserAgent(request),
      metadata: {
        filename,
        size,
        mime,
        partCount,
      },
    });

    return reply.send({
      uploadToken,
      uploadId: multipart.uploadId,
      key,
      partSize,
      partCount,
      maxFileSize: env.MAX_FILE_SIZE_BYTES,
      parts: partUrls,
    });
  });

  app.post('/files/resume-upload', { preHandler: [requireAuth] }, async (request, reply) => {
    const authUser = request.authUser;
    if (!authUser) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const parsed = resumeUploadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation_failed', details: parsed.error.flatten() });
    }

    let uploadPayload;
    try {
      uploadPayload = verifyUploadToken(parsed.data.uploadToken);
    } catch {
      return reply.code(400).send({ error: 'invalid_upload_token' });
    }

    if (uploadPayload.ownerId !== authUser.id || uploadPayload.type !== 'multipart_upload') {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const requestedParts = parsed.data.partNumbers ??
      Array.from({ length: uploadPayload.partCount }, (_, index) => index + 1);

    const validPartNumbers = requestedParts.filter(
      (partNumber) => partNumber >= 1 && partNumber <= uploadPayload.partCount,
    );

    const partUrls = await getMultipartPartUrls({
      key: uploadPayload.key,
      uploadId: uploadPayload.uploadId,
      partNumbers: validPartNumbers,
    });

    return reply.send({
      uploadToken: parsed.data.uploadToken,
      uploadId: uploadPayload.uploadId,
      key: uploadPayload.key,
      partSize: uploadPayload.partSize,
      partCount: uploadPayload.partCount,
      parts: partUrls,
    });
  });

  app.post('/files/complete-upload', { preHandler: [requireAuth] }, async (request, reply) => {
    const authUser = request.authUser;
    if (!authUser) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const parsed = completeUploadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation_failed', details: parsed.error.flatten() });
    }

    let uploadPayload;
    try {
      uploadPayload = verifyUploadToken(parsed.data.uploadToken);
    } catch {
      return reply.code(400).send({ error: 'invalid_upload_token' });
    }

    if (uploadPayload.ownerId !== authUser.id || uploadPayload.type !== 'multipart_upload') {
      return reply.code(403).send({ error: 'forbidden' });
    }

    await completeMultipartUpload({
      key: uploadPayload.key,
      uploadId: uploadPayload.uploadId,
      parts: parsed.data.parts,
    });

    let finalMime = uploadPayload.mime;

    try {
      const detectedMime = await readObjectStartForMime(uploadPayload.key);

      if (detectedMime) {
        if (!validateMimeType(detectedMime)) {
          await deleteObjectByKey(uploadPayload.key);
          return reply.code(415).send({
            error: 'unsupported_media_type',
            message: `Detected MIME type ${detectedMime} is not allowed`,
          });
        }

        finalMime = detectedMime;
      }
    } catch (error) {
      request.log.warn({ error }, 'Could not inspect uploaded file MIME by content');
    }

    const file = await prisma.file.create({
      data: {
        ownerId: authUser.id,
        folderId: uploadPayload.folderId,
        filename: uploadPayload.filename,
        size: BigInt(uploadPayload.size),
        mime: finalMime,
        storageKey: uploadPayload.key,
        checksum: parsed.data.checksum,
        scanStatus: env.enableClamav ? 'PENDING' : 'DISABLED',
      },
      select: {
        id: true,
        ownerId: true,
        folderId: true,
        filename: true,
        size: true,
        mime: true,
        createdAt: true,
        scanStatus: true,
      },
    });

    if (env.enableClamav) {
      triggerAsyncScan(file.id, request.log);
    }

    metrics.uploadsCompleted.inc();

    await writeAuditLog({
      actorId: authUser.id,
      action: 'file.upload.completed',
      targetType: 'file',
      targetId: file.id,
      ip: getRequestIp(request),
      userAgent: getUserAgent(request),
      metadata: {
        filename: file.filename,
        mime: file.mime,
        size: asNumber(file.size),
      },
    });

    return reply.code(201).send({
      file: {
        ...file,
        size: asNumber(file.size),
      },
    });
  });

  app.get('/files', { preHandler: [requireAuth] }, async (request, reply) => {
    const authUser = request.authUser;
    if (!authUser) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const parsed = listFilesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation_failed', details: parsed.error.flatten() });
    }

    const where = {
      ownerId: authUser.id,
      deletedAt: null,
      ...(parsed.data.q
        ? {
            filename: {
              contains: parsed.data.q,
              mode: 'insensitive' as const,
            },
          }
        : {}),
      ...(parsed.data.folderId ? { folderId: parsed.data.folderId } : {}),
    };

    const [total, files] = await Promise.all([
      prisma.file.count({ where }),
      prisma.file.findMany({
        where,
        include: {
          folder: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: (parsed.data.page - 1) * parsed.data.pageSize,
        take: parsed.data.pageSize,
      }),
    ]);

    return reply.send({
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      total,
      items: files.map((file) => ({
        ...file,
        size: asNumber(file.size),
      })),
    });
  });

  app.patch('/files/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const authUser = request.authUser;
    if (!authUser) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const parsedParams = fileIdParamsSchema.safeParse(request.params);
    const parsedBody = fileRenameMoveSchema.safeParse(request.body);

    if (!parsedParams.success || !parsedBody.success) {
      return reply.code(400).send({
        error: 'validation_failed',
        details: {
          params: parsedParams.success ? undefined : parsedParams.error.flatten(),
          body: parsedBody.success ? undefined : parsedBody.error.flatten(),
        },
      });
    }

    const file = await prisma.file.findFirst({
      where: {
        id: parsedParams.data.id,
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

    if (parsedBody.data.folderId) {
      const folder = await prisma.folder.findFirst({
        where: {
          id: parsedBody.data.folderId,
          ownerId: authUser.id,
        },
        select: {
          id: true,
        },
      });

      if (!folder) {
        return reply.code(404).send({ error: 'folder_not_found' });
      }
    }

    const updated = await prisma.file.update({
      where: { id: file.id },
      data: {
        ...(parsedBody.data.filename ? { filename: sanitizeFilename(parsedBody.data.filename) } : {}),
        ...(Object.prototype.hasOwnProperty.call(parsedBody.data, 'folderId')
          ? { folderId: parsedBody.data.folderId ?? null }
          : {}),
      },
      include: {
        folder: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    await writeAuditLog({
      actorId: authUser.id,
      action: 'file.updated',
      targetType: 'file',
      targetId: updated.id,
      ip: getRequestIp(request),
      userAgent: getUserAgent(request),
      metadata: {
        filename: updated.filename,
        folderId: updated.folderId,
      },
    });

    return reply.send({
      file: {
        ...updated,
        size: asNumber(updated.size),
      },
    });
  });

  app.delete('/files/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const authUser = request.authUser;
    if (!authUser) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const parsedParams = fileIdParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      return reply.code(400).send({ error: 'validation_failed', details: parsedParams.error.flatten() });
    }

    const file = await prisma.file.findFirst({
      where: {
        id: parsedParams.data.id,
        ownerId: authUser.id,
        deletedAt: null,
      },
      select: {
        id: true,
        storageKey: true,
      },
    });

    if (!file) {
      return reply.code(404).send({ error: 'file_not_found' });
    }

    try {
      await deleteObjectByKey(file.storageKey);
    } catch (error) {
      request.log.warn({ error, fileId: file.id }, 'Failed to delete object from storage');
    }

    await prisma.$transaction(async (tx) => {
      await tx.file.update({
        where: { id: file.id },
        data: {
          deletedAt: new Date(),
        },
      });

      await tx.share.deleteMany({
        where: {
          fileId: file.id,
        },
      });
    });

    await writeAuditLog({
      actorId: authUser.id,
      action: 'file.deleted',
      targetType: 'file',
      targetId: file.id,
      ip: getRequestIp(request),
      userAgent: getUserAgent(request),
    });

    return reply.code(204).send();
  });

  app.get('/files/:id/download', { preHandler: [requireAuth] }, async (request, reply) => {
    const authUser = request.authUser;
    if (!authUser) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const parsedParams = fileIdParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.code(400).send({ error: 'validation_failed', details: parsedParams.error.flatten() });
    }

    const file = await prisma.file.findFirst({
      where: {
        id: parsedParams.data.id,
        ownerId: authUser.id,
        deletedAt: null,
      },
      select: {
        id: true,
        filename: true,
        storageKey: true,
        scanStatus: true,
      },
    });

    if (!file) {
      return reply.code(404).send({ error: 'file_not_found' });
    }

    if (file.scanStatus === 'PENDING') {
      return reply.code(423).send({ error: 'file_pending_scan' });
    }

    if (file.scanStatus === 'INFECTED') {
      return reply.code(403).send({ error: 'file_infected' });
    }

    const downloadUrl = await getPresignedDownloadUrl({
      key: file.storageKey,
      filename: file.filename,
      cacheControl: 'private, no-store',
    });

    return reply.redirect(downloadUrl);
  });
};

export default filesRoutes;
