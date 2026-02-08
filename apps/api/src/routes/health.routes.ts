import type { FastifyPluginAsync } from 'fastify';
import { env } from '../config/env.js';
import { metrics } from '../lib/metrics.js';
import { prisma } from '../lib/prisma.js';
import { isBucketReachable } from '../lib/s3.js';

const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/healthz', async () => {
    return {
      service: 'fluxsolutions-api',
      status: 'ok',
      ts: new Date().toISOString(),
    };
  });

  app.get('/readyz', async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      const bucketReady = await isBucketReachable();

      if (!bucketReady) {
        return reply.code(503).send({
          status: 'not_ready',
          dependencies: {
            database: 'ok',
            object_storage: 'down',
          },
        });
      }

      return reply.send({
        status: 'ready',
        dependencies: {
          database: 'ok',
          object_storage: 'ok',
        },
      });
    } catch {
      return reply.code(503).send({
        status: 'not_ready',
        dependencies: {
          database: 'down',
          object_storage: 'unknown',
        },
      });
    }
  });

  app.get('/metrics', async (_request, reply) => {
    if (!env.enableMetrics) {
      return reply.code(404).send({ error: 'metrics_disabled' });
    }

    reply.header('Content-Type', metrics.register.contentType);
    return reply.send(await metrics.register.metrics());
  });
};

export default healthRoutes;
