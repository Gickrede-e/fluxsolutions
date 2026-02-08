import { env } from './config/env.js';
import { buildApp } from './app.js';

async function bootstrap() {
  const app = await buildApp();

  try {
    await app.listen({
      host: env.HOST,
      port: env.PORT,
    });

    app.log.info(
      {
        host: env.HOST,
        port: env.PORT,
        env: env.NODE_ENV,
      },
      'fluxsolutions API started',
    );
  } catch (error) {
    app.log.error({ error }, 'Failed to start API');
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Shutting down API');
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

void bootstrap();
