import type { Role } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ACCESS_COOKIE } from '../lib/cookies.js';
import { prisma } from '../lib/prisma.js';
import { verifyAccessToken } from '../lib/tokens.js';

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const accessToken = request.cookies[ACCESS_COOKIE];

  if (!accessToken) {
    reply.code(401).send({ error: 'unauthorized', message: 'Access token missing' });
    return;
  }

  try {
    const payload = verifyAccessToken(accessToken);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        banned: true,
      },
    });

    if (!user || user.banned) {
      reply.code(403).send({ error: 'forbidden', message: 'Account is banned or unavailable' });
      return;
    }

    request.authUser = {
      id: user.id,
      email: user.email,
      role: user.role,
    };
  } catch {
    reply.code(401).send({ error: 'unauthorized', message: 'Invalid access token' });
  }
}

export function requireRole(role: Role) {
  return async function roleGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.authUser) {
      reply.code(401).send({ error: 'unauthorized', message: 'Authentication required' });
      return;
    }

    if (request.authUser.role !== role) {
      reply.code(403).send({ error: 'forbidden', message: `Requires ${role} role` });
      return;
    }
  };
}
