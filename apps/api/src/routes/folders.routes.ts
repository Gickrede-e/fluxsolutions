import { folderCreateSchema } from '@fluxsolutions/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { writeAuditLog } from '../services/audit.service.js';
import { getRequestIp, getUserAgent } from '../utils/http.js';

const folderIdParamsSchema = z.object({
  id: z.string().cuid(),
});

const foldersRoutes: FastifyPluginAsync = async (app) => {
  app.get('/folders', { preHandler: [requireAuth] }, async (request, reply) => {
    const authUser = request.authUser;
    if (!authUser) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const folders = await prisma.folder.findMany({
      where: {
        ownerId: authUser.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return reply.send({ folders });
  });

  app.post('/folders', { preHandler: [requireAuth] }, async (request, reply) => {
    const authUser = request.authUser;
    if (!authUser) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const parsed = folderCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation_failed', details: parsed.error.flatten() });
    }

    try {
      const folder = await prisma.folder.create({
        data: {
          ownerId: authUser.id,
          name: parsed.data.name,
        },
      });

      await writeAuditLog({
        actorId: authUser.id,
        action: 'folder.create',
        targetType: 'folder',
        targetId: folder.id,
        ip: getRequestIp(request),
        userAgent: getUserAgent(request),
      });

      return reply.code(201).send({ folder });
    } catch {
      return reply.code(409).send({ error: 'folder_exists', message: 'Folder name already exists' });
    }
  });

  app.delete('/folders/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const authUser = request.authUser;
    if (!authUser) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const parsedParams = folderIdParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.code(400).send({ error: 'validation_failed', details: parsedParams.error.flatten() });
    }

    const folder = await prisma.folder.findFirst({
      where: {
        id: parsedParams.data.id,
        ownerId: authUser.id,
      },
      select: {
        id: true,
      },
    });

    if (!folder) {
      return reply.code(404).send({ error: 'folder_not_found' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.file.updateMany({
        where: {
          folderId: folder.id,
          ownerId: authUser.id,
          deletedAt: null,
        },
        data: {
          folderId: null,
        },
      });

      await tx.folder.delete({
        where: {
          id: folder.id,
        },
      });
    });

    await writeAuditLog({
      actorId: authUser.id,
      action: 'folder.delete',
      targetType: 'folder',
      targetId: folder.id,
      ip: getRequestIp(request),
      userAgent: getUserAgent(request),
    });

    return reply.code(204).send();
  });
};

export default foldersRoutes;
