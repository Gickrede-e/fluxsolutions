import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { verifyPassword, hashPassword } from '../lib/password.js';
import { writeAuditLog } from '../services/audit.service.js';
import { getRequestIp, getUserAgent } from '../utils/http.js';

const changePasswordSchema = z.object({
  currentPassword: z.string().min(12).max(128),
  newPassword: z.string().min(12).max(128),
});

const meRoutes: FastifyPluginAsync = async (app) => {
  app.get('/me', { preHandler: [requireAuth] }, async (request, reply) => {
    const authUser = request.authUser;
    if (!authUser) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: {
        id: true,
        email: true,
        role: true,
        banned: true,
        createdAt: true,
      },
    });

    if (!user) {
      return reply.code(404).send({ error: 'user_not_found' });
    }

    return reply.send({ user });
  });

  app.post('/me/change-password', { preHandler: [requireAuth] }, async (request, reply) => {
    const authUser = request.authUser;
    if (!authUser) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const parsed = changePasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation_failed', details: parsed.error.flatten() });
    }

    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: {
        id: true,
        passwordHash: true,
      },
    });

    if (!user) {
      return reply.code(404).send({ error: 'user_not_found' });
    }

    const isCurrentPasswordValid = await verifyPassword(user.passwordHash, parsed.data.currentPassword);
    if (!isCurrentPasswordValid) {
      return reply.code(401).send({ error: 'invalid_current_password' });
    }

    const newHash = await hashPassword(parsed.data.newPassword);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: authUser.id },
        data: {
          passwordHash: newHash,
        },
      });

      await tx.refreshToken.updateMany({
        where: {
          userId: authUser.id,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    });

    await writeAuditLog({
      actorId: authUser.id,
      action: 'auth.password.changed',
      targetType: 'user',
      targetId: authUser.id,
      ip: getRequestIp(request),
      userAgent: getUserAgent(request),
    });

    return reply.send({ message: 'Password updated. Please sign in again.' });
  });
};

export default meRoutes;
