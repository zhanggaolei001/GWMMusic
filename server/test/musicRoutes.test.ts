import express from 'express';
import request from 'supertest';
import path from 'path';
import fs from 'fs';

import { createMusicRouter } from '../src/routes/musicRoutes';
import { CacheEntry } from '../src/services/audioCache';

jest.mock('../src/services/songService', () => ({
  fetchAndCacheSong: jest.fn(),
}));

const { fetchAndCacheSong } = require('../src/services/songService');

describe('musicRoutes', () => {
  function buildApp(depsOverrides: Partial<any> = {}) {
    const client = {
      call: jest.fn(),
    };
    const cache = {
      get: jest.fn(),
      remove: jest.fn(),
      list: jest.fn(),
    };
    const deps = { client, cache, ...depsOverrides } as any;
    const app = express();
    app.use('/api', createMusicRouter(deps));
    // minimal JSON error handler to match server/index.ts
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const status = err.status || 500;
      res.status(status).json({ status, message: err.message || 'Internal Server Error', details: err.details });
    });
    return { app, deps };
  }

  test('GET /api/health returns ok', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('GET /api/search missing q -> 400', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/search');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Missing search query/);
  });

  test('GET /api/search proxies to client', async () => {
    const { app, deps } = buildApp();
    (deps.client.call as jest.Mock).mockResolvedValue({ result: { songs: [{ id: 1 }] } });
    const res = await request(app).get('/api/search').query({ q: 'test', limit: 5, offset: 1, type: 1 });
    expect(res.status).toBe(200);
    expect(res.body.songs).toBeDefined();
    expect(deps.client.call).toHaveBeenCalledWith(
      'cloudsearch',
      expect.objectContaining({ keywords: 'test', limit: 5, offset: 1, type: 1 }),
      expect.any(Object),
    );
  });

  test('GET /api/playlists/:id returns detail', async () => {
    const { app, deps } = buildApp();
    (deps.client.call as jest.Mock).mockResolvedValue({ id: '123' });
    const res = await request(app).get('/api/playlists/123');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('123');
    expect(deps.client.call).toHaveBeenCalledWith('playlist_detail', { id: '123' }, expect.any(Object));
  });

  test('GET /api/playlists/:id/tracks returns tracks', async () => {
    const { app, deps } = buildApp();
    (deps.client.call as jest.Mock).mockResolvedValue({ songs: [] });
    const res = await request(app).get('/api/playlists/abc/tracks').query({ limit: 10 });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.songs)).toBe(true);
    expect(deps.client.call).toHaveBeenCalledWith('playlist_track_all', { id: 'abc', limit: 10 }, expect.any(Object));
  });

  test('GET /api/songs/:id returns detail', async () => {
    const { app, deps } = buildApp();
    (deps.client.call as jest.Mock).mockResolvedValue({ songs: [{ id: 1 }] });
    const res = await request(app).get('/api/songs/1');
    expect(res.status).toBe(200);
    expect(res.body.songs[0].id).toBe(1);
    expect(deps.client.call).toHaveBeenCalledWith('song_detail', { ids: '1' }, expect.any(Object));
  });

  test('GET /api/songs/:id/lyrics returns lyrics', async () => {
    const { app, deps } = buildApp();
    (deps.client.call as jest.Mock).mockResolvedValue({ lrc: { lyric: '...' } });
    const res = await request(app).get('/api/songs/2/lyrics');
    expect(res.status).toBe(200);
    expect(res.body.lrc).toBeDefined();
    expect(deps.client.call).toHaveBeenCalledWith('lyric', { id: '2' }, expect.any(Object));
  });

  test('GET /api/songs/:id/stream invalid id -> 400', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/songs/NaN/stream');
    expect(res.status).toBe(400);
  });

  function makeTempAudioFile(bytes = 16) {
    const dir = fs.mkdtempSync(path.join(process.cwd(), 'tmp-test-'));
    const file = path.join(dir, 'audio.mp3');
    const buf = Buffer.alloc(bytes, 1);
    fs.writeFileSync(file, buf);
    return { dir, file, buf };
  }

  function cacheEntryFor(filePath: string, size: number, transient?: boolean, options: { coverPath?: string; coverFile?: string } = {}): CacheEntry {
    return {
      audioPath: filePath,
      metadataPath: filePath + '.json',
      coverPath: options.coverPath,
      metadata: {
        id: 99,
        tag: 'untagged',
        sourceUrl: 'http://example/audio.mp3',
        mimeType: 'audio/mpeg',
        extension: 'mp3',
        size,
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        audioFile: 'audio.mp3',
        coverFile: options.coverFile,
        folder: '.',
      },
      transient,
    } as any;
  }

  function makeTempCoverFile(bytes = 12, ext = 'jpg') {
    const dir = fs.mkdtempSync(path.join(process.cwd(), 'tmp-cover-'));
    const file = path.join(dir, `cover.${ext}`);
    const buf = Buffer.alloc(bytes, 2);
    fs.writeFileSync(file, buf);
    return { dir, file, buf };
  }

  test('GET /api/songs/:id/stream serves from cache (inline)', async () => {
    const { app, deps } = buildApp();
    const { file, buf } = makeTempAudioFile(8);
    const entry = cacheEntryFor(file, buf.length);
    (deps.cache.get as jest.Mock).mockResolvedValue(entry);
    const res = await request(app).get('/api/songs/99/stream');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('audio/mpeg');
    expect(res.headers['content-length']).toBe(String(buf.length));
    expect(res.headers['content-disposition']).toMatch(/^inline; filename=/);
    expect(Buffer.compare(res.body, buf)).toBe(0);
  });

  test('GET /api/songs/:id/download serves as attachment', async () => {
    const { app, deps } = buildApp();
    const { file } = makeTempAudioFile(4);
    const entry = cacheEntryFor(file, 4);
    (deps.cache.get as jest.Mock).mockResolvedValue(entry);
    const res = await request(app).get('/api/songs/99/download');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename=/);
  });

  test('stream removes transient cache after send', async () => {
    const { app, deps } = buildApp();
    const { file } = makeTempAudioFile(4);
    const entry = cacheEntryFor(file, 4, true);
    (deps.cache.get as jest.Mock).mockResolvedValue(entry);
    const res = await request(app).get('/api/songs/99/stream');
    expect(res.status).toBe(200);
    expect(deps.cache.remove).toHaveBeenCalledWith('untagged', 99);
  });

  test('when not cached, fetchAndCacheSong is used', async () => {
    const { app, deps } = buildApp();
    (deps.cache.get as jest.Mock).mockResolvedValue(null);
    const { file } = makeTempAudioFile(4);
    const entry = cacheEntryFor(file, 4, true);
    (fetchAndCacheSong as jest.Mock).mockResolvedValue(entry);
    const res = await request(app).get('/api/songs/123/stream');
    expect(res.status).toBe(200);
    expect(fetchAndCacheSong).toHaveBeenCalledWith(
      expect.objectContaining({ songId: 123, tag: expect.any(String) })
    );
    expect(deps.cache.remove).toHaveBeenCalledWith(expect.any(String), 123);
  });

  test('GET /api/songs/:id/stream passes bitrate query to fetchAndCacheSong', async () => {
    const { app, deps } = buildApp();
    (deps.cache.get as jest.Mock).mockResolvedValue(null);
    const { file } = makeTempAudioFile(4);
    const entry = cacheEntryFor(file, 4, true);
    (fetchAndCacheSong as jest.Mock).mockResolvedValue(entry);
    const res = await request(app).get('/api/songs/321/stream').query({ br: '999000' });
    expect(res.status).toBe(200);
    expect(fetchAndCacheSong).toHaveBeenCalledWith(
      expect.objectContaining({ songId: 321, bitrate: 999000 })
    );
  });

  test('GET /api/songs/:id/cover returns cover image', async () => {
    const { app, deps } = buildApp();
    const { file: audioFile } = makeTempAudioFile(4);
    const { file: coverFile, buf } = makeTempCoverFile(6, 'png');
    const entry = cacheEntryFor(audioFile, 4, false, { coverPath: coverFile, coverFile: 'cover.png' });
    (deps.cache.get as jest.Mock).mockResolvedValue(entry);
    const res = await request(app).get('/api/songs/99/cover');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['content-length']).toBe(String(buf.length));
    expect(Buffer.compare(res.body, buf)).toBe(0);
  });

  test('GET /api/cache returns mapped entries', async () => {
    const { app, deps } = buildApp();
    const { file } = makeTempAudioFile(5);
    const entry = cacheEntryFor(file, 5);
    (deps.cache.list as jest.Mock).mockResolvedValue([entry]);
    const res = await request(app).get('/api/cache');
    expect(res.status).toBe(200);
    expect(res.body[0].id).toBe(99);
    expect(res.body[0].hasLyrics).toBe(false);
    expect(res.body[0].hasCover).toBe(false);
    expect(typeof res.body[0].audioPath).toBe('string');
  });

  test('DELETE /api/cache/:tag/:id removes entry', async () => {
    const { app, deps } = buildApp();
    const res = await request(app).delete('/api/cache/favorites/123');
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Deleted/i);
    expect(deps.cache.remove).toHaveBeenCalledWith('favorites', 123);
  });
});
