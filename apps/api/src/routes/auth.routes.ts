import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import { env } from '../config/env.js';
import { clearAuthCookies, REFRESH_COOKIE, setAuthCookies, setCsrfCookie } from '../lib/cookies.js';
import { randomToken, sha256 } from '../lib/hash.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { prisma } from '../lib/prisma.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  type RefreshTokenPayload,
} from '../lib/tokens.js';
import { sendPasswordResetEmail } from '../services/email.service.js';
import { writeAuditLog } from '../services/audit.service.js';
import { normalizeEmail } from '../utils/string.js';
import { getRequestIp, getUserAgent } from '../utils/http.js';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12).max(128),
});

const loginSchema = registerSchema;

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(32),
  password: z.string().min(12).max(128),
});

async function issueSession(input: {
  user: { id: string; email: string; role: 'USER' | 'ADMIN' };
  ip: string;
  userAgent: string;
  reply: FastifyReply;
}): Promise<void> {
  const accessToken = signAccessToken({
    sub: input.user.id,
    email: input.user.email,
    role: input.user.role,
  });

  const refreshPayload: Omit<RefreshTokenPayload, 'type'> = {
    sub: input.user.id,
    role: input.user.role,
    jti: randomToken(12),
  };

  const refreshToken = signRefreshToken(refreshPayload);
  const refreshTokenHash = sha256(refreshToken);
  const refreshTokenExpiresAt = new Date(
    Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  await prisma.refreshToken.create({
    data: {
      userId: input.user.id,
      tokenHash: refreshTokenHash,
      userAgent: input.userAgent,
      ip: input.ip,
      expiresAt: refreshTokenExpiresAt,
    },
  });

  const csrfToken = randomToken(16);
  setCsrfCookie(input.reply, csrfToken);
  setAuthCookies(input.reply, accessToken, refreshToken);
}

const authRoutes: FastifyPluginAsync = async (app) => {
  app.get('/auth/csrf', async (_request, reply) => {
    const csrfToken = randomToken(16);
    setCsrfCookie(reply, csrfToken);
    return { csrfToken };
  });

  app.post('/auth/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation_failed', details: parsed.error.flatten() });
    }

    const email = normalizeEmail(parsed.data.email);
    const passwordHash = await hashPassword(parsed.data.password);
    const ip = getRequestIp(request);
    const userAgent = getUserAgent(request);
    const role = env.ADMIN_EMAIL && normalizeEmail(env.ADMIN_EMAIL) === email ? 'ADMIN' : 'USER';

    try {
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          role,
        },
        select: {
          id: true,
          email: true,
          role: true,
        },
      });

      await issueSession({
        user,
        ip,
        userAgent,
        reply,
      });

      await writeAuditLog({
        actorId: user.id,
        action: 'auth.register',
        targetType: 'user',
        targetId: user.id,
        ip,
        userAgent,
      });

      return reply.code(201).send({ user });
    } catch (error) {
      request.log.error({ error }, 'Failed to register user');
      return reply.code(409).send({ error: 'email_exists', message: 'Email already registered' });
    }
  });

  app.post('/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation_failed', details: parsed.error.flatten() });
    }

    const email = normalizeEmail(parsed.data.email);
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        role: true,
        banned: true,
        passwordHash: true,
      },
    });

    if (!user) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }

    if (user.banned) {
      return reply.code(403).send({ error: 'account_banned' });
    }

    const validPassword = await verifyPassword(user.passwordHash, parsed.data.password);
    if (!validPassword) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }

    const ip = getRequestIp(request);
    const userAgent = getUserAgent(request);

    await issueSession({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      ip,
      userAgent,
      reply,
    });

    await writeAuditLog({
      actorId: user.id,
      action: 'auth.login',
      targetType: 'user',
      targetId: user.id,
      ip,
      userAgent,
    });

    return reply.send({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });
  });

  app.post('/auth/refresh', async (request, reply) => {
    const refreshToken = request.cookies[REFRESH_COOKIE];
    if (!refreshToken) {
      return reply.code(401).send({ error: 'missing_refresh_token' });
    }

    let payload: RefreshTokenPayload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      clearAuthCookies(reply);
      return reply.code(401).send({ error: 'invalid_refresh_token' });
    }

    const hashedRefreshToken = sha256(refreshToken);
    const now = new Date();
    const ip = getRequestIp(request);
    const userAgent = getUserAgent(request);

    const currentSession = await prisma.refreshToken.findFirst({
      where: {
        userId: payload.sub,
        tokenHash: hashedRefreshToken,
        revokedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            banned: true,
          },
        },
      },
    });

    if (!currentSession || !currentSession.user || currentSession.user.banned) {
      clearAuthCookies(reply);
      return reply.code(401).send({ error: 'invalid_refresh_token' });
    }

    const nextRefreshToken = signRefreshToken({
      sub: currentSession.user.id,
      role: currentSession.user.role,
      jti: randomToken(12),
    });

    const nextRefreshTokenHash = sha256(nextRefreshToken);
    const nextRefreshTokenExpiresAt = new Date(
      Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    const nextAccessToken = signAccessToken({
      sub: currentSession.user.id,
      email: currentSession.user.email,
      role: currentSession.user.role,
    });

    await prisma.$transaction(async (tx) => {
      const rotated = await tx.refreshToken.create({
        data: {
          userId: currentSession.userId,
          tokenHash: nextRefreshTokenHash,
          userAgent,
          ip,
          expiresAt: nextRefreshTokenExpiresAt,
        },
      });

      await tx.refreshToken.update({
        where: { id: currentSession.id },
        data: {
          revokedAt: now,
          replacedById: rotated.id,
        },
      });
    });

    const csrfToken = randomToken(16);
    setCsrfCookie(reply, csrfToken);
    setAuthCookies(reply, nextAccessToken, nextRefreshToken);

    return reply.send({
      user: {
        id: currentSession.user.id,
        email: currentSession.user.email,
        role: currentSession.user.role,
      },
    });
  });

  app.post('/auth/logout', async (request, reply) => {
    const refreshToken = request.cookies[REFRESH_COOKIE];
    if (refreshToken) {
      await prisma.refreshToken.updateMany({
        where: {
          tokenHash: sha256(refreshToken),
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    }

    clearAuthCookies(reply);
    return reply.code(204).send();
  });

  app.post('/auth/forgot-password', async (request, reply) => {
    const parsed = forgotPasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation_failed', details: parsed.error.flatten() });
    }

    const email = normalizeEmail(parsed.data.email);
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });

    if (!user) {
      return reply.send({ message: 'If this email exists, reset instructions have been sent.' });
    }

    const token = randomToken(32);

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    await sendPasswordResetEmail({ email: user.email, token });

    await writeAuditLog({
      actorId: user.id,
      action: 'auth.password_reset.requested',
      targetType: 'user',
      targetId: user.id,
      ip: getRequestIp(request),
      userAgent: getUserAgent(request),
    });

    return reply.send({ message: 'If this email exists, reset instructions have been sent.' });
  });

  app.post('/auth/reset-password', async (request, reply) => {
    const parsed = resetPasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation_failed', details: parsed.error.flatten() });
    }

    const tokenHash = sha256(parsed.data.token);
    const now = new Date();

    const resetToken = await prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!resetToken) {
      return reply.code(400).send({ error: 'invalid_or_expired_token' });
    }

    const newPasswordHash = await hashPassword(parsed.data.password);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: resetToken.userId },
        data: {
          passwordHash: newPasswordHash,
        },
      });

      await tx.passwordResetToken.update({
        where: { id: resetToken.id },
        data: {
          usedAt: new Date(),
        },
      });

      await tx.refreshToken.updateMany({
        where: {
          userId: resetToken.userId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    });

    clearAuthCookies(reply);

    await writeAuditLog({
      actorId: resetToken.userId,
      action: 'auth.password_reset.completed',
      targetType: 'user',
      targetId: resetToken.userId,
      ip: getRequestIp(request),
      userAgent: getUserAgent(request),
    });

    return reply.send({ message: 'Password updated successfully' });
  });
};

export default authRoutes;
