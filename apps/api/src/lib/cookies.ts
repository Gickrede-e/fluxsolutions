import type { FastifyReply } from 'fastify';
import { env } from '../config/env.js';

export const ACCESS_COOKIE = 'fluxsolutions_access_token';
export const REFRESH_COOKIE = 'fluxsolutions_refresh_token';
export const CSRF_COOKIE = 'fluxsolutions_csrf_token';

function cookieBaseOptions() {
  return {
    domain: env.COOKIE_DOMAIN,
    secure: env.cookieSecure,
    sameSite: 'lax' as const,
  };
}

export function setCsrfCookie(reply: FastifyReply, csrfToken: string): void {
  reply.setCookie(CSRF_COOKIE, csrfToken, {
    ...cookieBaseOptions(),
    httpOnly: false,
    path: '/',
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
  });
}

export function setAuthCookies(reply: FastifyReply, accessToken: string, refreshToken: string): void {
  reply.setCookie(ACCESS_COOKIE, accessToken, {
    ...cookieBaseOptions(),
    httpOnly: true,
    path: '/',
    maxAge: env.ACCESS_TOKEN_TTL_SECONDS,
  });

  reply.setCookie(REFRESH_COOKIE, refreshToken, {
    ...cookieBaseOptions(),
    sameSite: 'strict',
    httpOnly: true,
    path: '/auth',
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
  });
}

export function clearAuthCookies(reply: FastifyReply): void {
  reply.clearCookie(ACCESS_COOKIE, {
    ...cookieBaseOptions(),
    path: '/',
  });

  reply.clearCookie(REFRESH_COOKIE, {
    ...cookieBaseOptions(),
    path: '/auth',
  });
}
