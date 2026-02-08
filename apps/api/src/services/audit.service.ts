import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export interface AuditInput {
  actorId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Prisma.InputJsonValue | null;
}

export async function writeAuditLog(input: AuditInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      ip: input.ip,
      userAgent: input.userAgent,
      metadata: input.metadata === null ? Prisma.JsonNull : input.metadata,
    },
  });
}
