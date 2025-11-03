import express from 'express';
import request from 'supertest';

// Mock vendor bili helpers used by routes (virtual modules) BEFORE importing router
jest.mock('../../../vendor/util/biliApiHandler', () => ({
  createStreamProxy: jest.fn(async (_url: string, _opts: any, _req: any, res: any) => {
    res.status(200).set('Content-Type', 'text/plain').send('ok');
  }),
  updateCookie: jest.fn((_cookie: string) => true),
  getBilibiliCookies: jest.fn(async () => 'SESSDATA=abc'),
}), { virtual: true });

jest.mock('../../../vendor/util/biliRequest', () => ({
  cache: { buvid: '', wbiKeys: null, lastWbiKeysFetchTime: 0 },
}), { virtual: true });

import { createMusicRouter } from '../src/routes/musicRoutes';

describe('musicRoutes /bilibili* endpoints', () => {
  function buildApp() {
    const client = { call: jest.fn() };
    const cache = { get: jest.fn(), remove: jest.fn(), list: jest.fn() };
    const app = express();
    app.use(express.json());
    app.use('/api', createMusicRouter({ client: client as any, cache: cache as any }));
    // JSON error handler
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const status = err.status || 500;
      res.status(status).json({ status, message: err.message || 'Internal Server Error' });
    });
    return { app };
  }

  test('POST /api/bilibili/update-cookie validates and updates', async () => {
    const { app } = buildApp();
    const bad = await request(app).post('/api/bilibili/update-cookie').send({});
    expect(bad.status).toBe(400);
    const ok = await request(app).post('/api/bilibili/update-cookie').send({ cookie: 'a=b' });
    expect(ok.status).toBe(200);
    expect(ok.body.message).toMatch(/updated/i);
  });

  test('GET /api/bilibili/refresh-cookie returns hasCookie', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/bilibili/refresh-cookie');
    expect(res.status).toBe(200);
    expect(res.body.hasCookie).toBe(true);
  });

  test('GET /api/bilibili/clear-cache returns ok', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/bilibili/clear-cache');
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/cleared/i);
  });

  test('GET /api/bilibili/stream-proxy requires url -> 400', async () => {
    const { app } = buildApp();
    const bad = await request(app).get('/api/bilibili/stream-proxy');
    expect(bad.status).toBe(400);
  });
});
