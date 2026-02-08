import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';

let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('health endpoints', () => {
  it('returns API health', async () => {
    const response = await supertest(app.server).get('/healthz');

    expect(response.statusCode).toBe(200);
    expect(response.body.service).toBe('fluxsolutions-api');
    expect(response.body.status).toBe('ok');
  });

  it('returns Prometheus metrics output', async () => {
    const response = await supertest(app.server).get('/metrics');

    expect(response.statusCode).toBe(200);
    expect(response.text).toContain('fluxsolutions_http_request_duration_seconds');
  });
});
