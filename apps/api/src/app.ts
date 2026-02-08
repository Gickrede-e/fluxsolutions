import type { FastifyBaseLogger } from 'fastify';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { env } from './config/env.js';
import { metrics } from './lib/metrics.js';
import { prisma } from './lib/prisma.js';
import { ensureBucketExists } from './lib/s3.js';
import { csrfProtection } from './middleware/csrf.js';
import adminRoutes from './routes/admin.routes.js';
import authRoutes from './routes/auth.routes.js';
import filesRoutes from './routes/files.routes.js';
import foldersRoutes from './routes/folders.routes.js';
import healthRoutes from './routes/health.routes.js';
import meRoutes from './routes/me.routes.js';
import sharesRoutes from './routes/shares.routes.js';
import { hashPassword } from './lib/password.js';
import { normalizeEmail } from './utils/string.js';
import { scanPendingFilesBatch } from './services/scanner.service.js';

async function bootstrapAdmin(logger: FastifyBaseLogger): Promise<void> {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    return;
  }

  const email = normalizeEmail(env.ADMIN_EMAIL);

  const existingAdmin = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingAdmin) {
    return;
  }

  const passwordHash = await hashPassword(env.ADMIN_PASSWORD);

  await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: 'ADMIN',
    },
  });

  logger.info({ email }, 'Bootstrap admin account created');
}

export async function buildApp() {
  const app = Fastify({
    trustProxy: true,
    requestIdHeader: 'x-request-id',
    logger: {
      level: env.LOG_LEVEL,
      ...(env.NODE_ENV !== 'production'
        ? {
            transport: {
              target: 'pino-pretty',
              options: {
                translateTime: 'SYS:standard',
                colorize: true,
              },
            },
          }
        : {}),
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
        remove: true,
      },
    },
  });

  await app.register(sensible);

  await app.register(cookie, {
    hook: 'onRequest',
  });

  await app.register(cors, {
    credentials: true,
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (env.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('CORS origin denied'), false);
    },
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'x-csrf-token', 'x-request-id'],
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });

  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
    keyGenerator: (request) => request.ip,
  });

  app.addHook('onRequest', async (request) => {
    request.requestStartAt = process.hrtime.bigint();
  });

  app.addHook('preHandler', csrfProtection);

  app.addHook('onResponse', async (request, reply) => {
    if (!request.requestStartAt) {
      return;
    }

    const elapsedNs = process.hrtime.bigint() - request.requestStartAt;
    const elapsedSeconds = Number(elapsedNs) / 1_000_000_000;

    metrics.requestDuration.observe(
      {
        method: request.method,
        route: request.routeOptions.url ?? request.url,
        status_code: String(reply.statusCode),
      },
      elapsedSeconds,
    );
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ error }, 'Unhandled request error');
    reply.code(500).send({ error: 'internal_server_error' });
  });

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(meRoutes);
  await app.register(foldersRoutes);
  await app.register(filesRoutes);
  await app.register(sharesRoutes);
  await app.register(adminRoutes);

  app.get('/', async () => ({
    service: 'fluxsolutions-api',
    version: '1.0.0',
  }));

  let scannerInterval: NodeJS.Timeout | null = null;

  app.addHook('onReady', async () => {
    if (!env.skipStartupChecks) {
      await prisma.$connect();
      await ensureBucketExists();
      await bootstrapAdmin(app.log);

      if (env.enableClamav) {
        scannerInterval = setInterval(() => {
          void scanPendingFilesBatch(app.log);
        }, 60_000);

        void scanPendingFilesBatch(app.log);
        app.log.info('ClamAV background scanner enabled');
      }
    } else {
      app.log.warn('Startup dependency checks were skipped by configuration');
    }
  });

  app.addHook('onClose', async () => {
    if (scannerInterval) {
      clearInterval(scannerInterval);
    }

    if (!env.skipStartupChecks) {
      await prisma.$disconnect();
    }
  });

  return app;
}
