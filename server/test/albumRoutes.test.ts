import express from 'express';
import request from 'supertest';

import { createAlbumRouter } from '../src/routes/albumRoutes';

jest.mock('../src/services/songService', () => ({
  fetchAndCacheSong: jest.fn(),
}));

const { fetchAndCacheSong } = require('../src/services/songService');

describe('albumRoutes', () => {
  function buildApp(depsOverrides: Partial<any> = {}) {
    const client = { call: jest.fn() };
    const cache = { get: jest.fn(), remove: jest.fn() };
    const deps = { client, cache, ...depsOverrides } as any;
    const app = express();
    app.use(express.json());
    app.use('/api', createAlbumRouter(deps));
    // JSON error handler
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const status = err.status || 500;
      res.status(status).json({ status, message: err.message || 'Internal Server Error' });
    });
    return { app, deps };
  }

  test('GET /api/albums/search missing q -> 400', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/albums/search');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Missing album search query/);
  });

  test('GET /api/albums/search proxies to client and maps fields', async () => {
    const { app, deps } = buildApp();
    (deps.client.call as jest.Mock).mockResolvedValue({
      result: {
        albums: [
          { id: 1, name: 'A', artist: { name: 'X' }, artists: [{ name: 'X' }], size: 10, picUrl: 'u', publishTime: 1, company: 'c', description: 'd' },
        ],
        albumCount: 1,
      },
    });
    const res = await request(app).get('/api/albums/search').query({ q: 'jay', limit: 5, offset: 0 });
    expect(res.status).toBe(200);
    expect(res.body.albums[0].id).toBe(1);
    expect(deps.client.call).toHaveBeenCalledWith(
      'cloudsearch',
      expect.objectContaining({ keywords: 'jay', type: 10, limit: 5, offset: 0 }),
      expect.any(Object),
    );
  });

  test('GET /api/albums/:id returns album + tracks mapping', async () => {
    const { app, deps } = buildApp();
    (deps.client.call as jest.Mock).mockResolvedValue({
      album: { id: 123, name: 'Al', description: 'D', picUrl: 'p', publishTime: 2, company: 'co', size: 2 },
      songs: [
        { id: 9, name: 't', ar: [{ name: 'a' }], dt: 1000, privilege: { br: 192000 }, al: { name: 'Al' } },
      ],
    });
    const res = await request(app).get('/api/albums/123');
    expect(res.status).toBe(200);
    expect(res.body.album.id).toBe(123);
    expect(Array.isArray(res.body.tracks)).toBe(true);
    expect(deps.client.call).toHaveBeenCalledWith('album', { id: '123' }, expect.any(Object));
  });

  test('POST /api/albums/:id/cache validates body', async () => {
    const { app } = buildApp();
    const res = await request(app).post('/api/albums/999/cache').send({ trackIds: [] });
    expect(res.status).toBe(400);
  });

  test('POST /api/albums/:id/cache dedup + status mapping + transient removal', async () => {
    const { app, deps } = buildApp();
    // first track already cached (non-transient)
    (deps.cache.get as jest.Mock).mockResolvedValueOnce({ transient: false });
    // second track not cached -> fetch transient
    (deps.cache.get as jest.Mock).mockResolvedValueOnce(null);
    (fetchAndCacheSong as jest.Mock).mockResolvedValueOnce({ transient: true });

    const res = await request(app)
      .post('/api/albums/555/cache')
      .send({ trackIds: [1, 2, 1], tag: 'test', bitrate: 128000 });
    expect(res.status).toBe(200);
    const statuses = res.body.results.map((r: any) => r.status);
    expect(statuses).toEqual(expect.arrayContaining(['cached', 'transient']));
    expect(deps.cache.remove).toHaveBeenCalledWith('test', 2);
  });

  test('POST /api/songs/details returns mapped list', async () => {
    const { app, deps } = buildApp();
    (deps.client.call as jest.Mock).mockResolvedValue({
      songs: [
        { id: 11, name: 'n', ar: [{ name: 'a' }], al: { name: 'al' }, dt: 2000 },
      ],
    });
    const res = await request(app).post('/api/songs/details').send({ ids: [11] });
    expect(res.status).toBe(200);
    expect(res.body.songs[0].id).toBe(11);
    expect(deps.client.call).toHaveBeenCalledWith('song_detail', { ids: '11' }, expect.any(Object));
  });
});

