import type { FastifyRequest } from 'fastify';

export function getRequestIp(request: FastifyRequest): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim() ?? request.ip;
  }
  return request.ip;
}

export function getUserAgent(request: FastifyRequest): string {
  const userAgent = request.headers['user-agent'];
  return typeof userAgent === 'string' ? userAgent : 'unknown';
}
