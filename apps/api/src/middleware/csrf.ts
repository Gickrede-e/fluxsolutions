import type { FastifyReply, FastifyRequest } from 'fastify';
import { CSRF_COOKIE } from '../lib/cookies.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const EXEMPT_ROUTES = new Set([
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/csrf',
]);

export async function csrfProtection(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const routePath = request.url.split('?')[0] ?? request.url;

  if (SAFE_METHODS.has(request.method)) {
    return;
  }

  if (
    EXEMPT_ROUTES.has(routePath) ||
    routePath.startsWith('/s/') ||
    routePath.startsWith('/healthz') ||
    routePath.startsWith('/readyz') ||
    routePath.startsWith('/metrics')
  ) {
    return;
  }

  const csrfCookie = request.cookies[CSRF_COOKIE];
  const csrfHeader = request.headers['x-csrf-token'];

  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    reply.code(403).send({
      error: 'csrf_validation_failed',
      message: 'CSRF token missing or invalid',
    });
    return;
  }
}
