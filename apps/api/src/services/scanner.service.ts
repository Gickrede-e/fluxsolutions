import type { FastifyBaseLogger } from 'fastify';
import { env } from '../config/env.js';
import { scanReadableWithClamav } from '../lib/clamav.js';
import { getObjectStream } from '../lib/s3.js';
import { prisma } from '../lib/prisma.js';
import { writeAuditLog } from './audit.service.js';

export async function scanFileById(fileId: string, logger: FastifyBaseLogger): Promise<void> {
  if (!env.enableClamav) {
    return;
  }

  const file = await prisma.file.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      ownerId: true,
      storageKey: true,
      scanStatus: true,
      filename: true,
    },
  });

  if (!file || file.scanStatus !== 'PENDING') {
    return;
  }

  try {
    const stream = await getObjectStream(file.storageKey);
    const result = await scanReadableWithClamav({
      stream,
      host: env.CLAMAV_HOST,
      port: env.CLAMAV_PORT,
    });

    const nextStatus = result.clean ? 'CLEAN' : 'INFECTED';

    await prisma.file.update({
      where: { id: file.id },
      data: { scanStatus: nextStatus },
    });

    await writeAuditLog({
      actorId: file.ownerId,
      action: result.clean ? 'file.scan.clean' : 'file.scan.infected',
      targetType: 'file',
      targetId: file.id,
      metadata: {
        filename: file.filename,
        signature: result.signature ?? null,
      },
    });

    logger.info({ fileId: file.id, scanStatus: nextStatus }, 'ClamAV scan completed');
  } catch (error) {
    logger.error({ error, fileId: file.id }, 'ClamAV scan failed');
  }
}

export function triggerAsyncScan(fileId: string, logger: FastifyBaseLogger): void {
  if (!env.enableClamav) {
    return;
  }

  setImmediate(() => {
    void scanFileById(fileId, logger);
  });
}

export async function scanPendingFilesBatch(logger: FastifyBaseLogger, limit = 5): Promise<void> {
  if (!env.enableClamav) {
    return;
  }

  const pendingFiles = await prisma.file.findMany({
    where: {
      scanStatus: 'PENDING',
      deletedAt: null,
    },
    orderBy: {
      createdAt: 'asc',
    },
    take: limit,
    select: {
      id: true,
    },
  });

  for (const pendingFile of pendingFiles) {
    await scanFileById(pendingFile.id, logger);
  }
}
