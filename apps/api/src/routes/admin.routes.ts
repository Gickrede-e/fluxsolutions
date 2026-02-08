import { Prisma } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { writeAuditLog } from '../services/audit.service.js';
import { getRequestIp, getUserAgent } from '../utils/http.js';
import { asNumber } from '../utils/string.js';

const adminUserParamsSchema = z.object({
  id: z.string().cuid(),
});

const banBodySchema = z.object({
  banned: z.boolean().default(true),
});

const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().optional(),
});

const adminRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/admin/users',
    { preHandler: [requireAuth, requireRole('ADMIN')] },
    async (request, reply) => {
      const authUser = request.authUser;
      if (!authUser) {
        return reply.code(401).send({ error: 'unauthorized' });
      }

      const parsedQuery = listUsersQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply
          .code(400)
          .send({ error: 'validation_failed', details: parsedQuery.error.flatten() });
      }

      const where = parsedQuery.data.q
        ? {
            email: {
              contains: parsedQuery.data.q,
              mode: 'insensitive' as const,
            },
          }
        : {};

      const [total, users] = await Promise.all([
        prisma.user.count({ where }),
        prisma.user.findMany({
          where,
          orderBy: {
            createdAt: 'desc',
          },
          skip: (parsedQuery.data.page - 1) * parsedQuery.data.pageSize,
          take: parsedQuery.data.pageSize,
          select: {
            id: true,
            email: true,
            role: true,
            banned: true,
            createdAt: true,
          },
        }),
      ]);

      return reply.send({
        total,
        page: parsedQuery.data.page,
        pageSize: parsedQuery.data.pageSize,
        users,
      });
    },
  );

  app.post(
    '/admin/users/:id/ban',
    { preHandler: [requireAuth, requireRole('ADMIN')] },
    async (request, reply) => {
      const authUser = request.authUser;
      if (!authUser) {
        return reply.code(401).send({ error: 'unauthorized' });
      }

      const parsedParams = adminUserParamsSchema.safeParse(request.params);
      const parsedBody = banBodySchema.safeParse(request.body ?? {});

      if (!parsedParams.success || !parsedBody.success) {
        return reply.code(400).send({
          error: 'validation_failed',
          details: {
            params: parsedParams.success ? undefined : parsedParams.error.flatten(),
            body: parsedBody.success ? undefined : parsedBody.error.flatten(),
          },
        });
      }

      let updatedUser: { id: string; email: string; role: 'USER' | 'ADMIN'; banned: boolean };
      try {
        updatedUser = await prisma.user.update({
          where: {
            id: parsedParams.data.id,
          },
          data: {
            banned: parsedBody.data.banned,
          },
          select: {
            id: true,
            email: true,
            role: true,
            banned: true,
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
          return reply.code(404).send({ error: 'user_not_found' });
        }

        throw error;
      }

      if (parsedBody.data.banned) {
        await prisma.refreshToken.updateMany({
          where: {
            userId: updatedUser.id,
            revokedAt: null,
          },
          data: {
            revokedAt: new Date(),
          },
        });
      }

      await writeAuditLog({
        actorId: authUser.id,
        action: parsedBody.data.banned ? 'admin.user.ban' : 'admin.user.unban',
        targetType: 'user',
        targetId: updatedUser.id,
        ip: getRequestIp(request),
        userAgent: getUserAgent(request),
      });

      return reply.send({ user: updatedUser });
    },
  );

  app.get(
    '/admin/stats',
    { preHandler: [requireAuth, requireRole('ADMIN')] },
    async (_request, reply) => {
      const [
        totalUsers,
        totalBannedUsers,
        totalFiles,
        storageAggregation,
        recentUploads,
        recentAuditLogs,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { banned: true } }),
        prisma.file.count({ where: { deletedAt: null } }),
        prisma.file.aggregate({
          _sum: {
            size: true,
          },
          where: {
            deletedAt: null,
          },
        }),
        prisma.file.findMany({
          where: {
            deletedAt: null,
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 10,
          select: {
            id: true,
            filename: true,
            size: true,
            createdAt: true,
            owner: {
              select: {
                id: true,
                email: true,
              },
            },
          },
        }),
        prisma.auditLog.findMany({
          orderBy: {
            createdAt: 'desc',
          },
          take: 30,
        }),
      ]);

      return reply.send({
        totals: {
          users: totalUsers,
          bannedUsers: totalBannedUsers,
          files: totalFiles,
          storageBytes: asNumber(storageAggregation._sum.size ?? 0),
        },
        recentUploads: recentUploads.map((upload) => ({
          ...upload,
          size: asNumber(upload.size),
        })),
        auditLogs: recentAuditLogs,
      });
    },
  );
};

export default adminRoutes;
