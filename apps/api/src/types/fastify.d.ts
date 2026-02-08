import type { Role } from '@prisma/client';

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: {
      id: string;
      email: string;
      role: Role;
    };
    requestStartAt?: bigint;
  }
}
