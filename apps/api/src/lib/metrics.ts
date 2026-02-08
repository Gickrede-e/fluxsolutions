import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';

const globalMetrics = globalThis as unknown as {
  fluxMetrics:
    | {
        register: Registry;
        requestDuration: Histogram<string>;
        uploadsCompleted: Counter<string>;
      }
    | undefined;
};

function initMetrics() {
  const register = new Registry();

  collectDefaultMetrics({
    register,
    prefix: 'fluxsolutions_',
  });

  const requestDuration = new Histogram({
    name: 'fluxsolutions_http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
    registers: [register],
  });

  const uploadsCompleted = new Counter({
    name: 'fluxsolutions_uploads_completed_total',
    help: 'Total number of successful completed multipart uploads',
    registers: [register],
  });

  return {
    register,
    requestDuration,
    uploadsCompleted,
  };
}

export const metrics = globalMetrics.fluxMetrics ?? initMetrics();

if (!globalMetrics.fluxMetrics) {
  globalMetrics.fluxMetrics = metrics;
}
