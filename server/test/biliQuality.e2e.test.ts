import request from 'supertest';
import axios from 'axios';
import { spawn, ChildProcess } from 'child_process';

let BASE_URL = process.env.BASE_URL || '';
const API = (p: string) => `${BASE_URL.replace(/\/$/, '')}${p}`;

jest.setTimeout(45000);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForHealth(base: string, timeoutMs = 20000) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const res = await axios.get(`${base.replace(/\/$/, '')}/api/health`, { timeout: 1500 });
      if (res.status === 200) return;
    } catch {}
    if (Date.now() - start > timeoutMs) throw new Error('health timeout');
    await sleep(300);
  }
}

describe('Bili Quality & Metadata', () => {
  let child: ChildProcess | null = null;

  beforeAll(async () => {
    if (!BASE_URL) {
      child = spawn(process.execPath, ['-e', "require('ts-node/register'); require('./src/index.ts');"], {
        cwd: __dirname + '/..',
        stdio: 'ignore',
        shell: false,
      });
      BASE_URL = 'http://localhost:4000';
    }
    await waitForHealth(BASE_URL, 25000);
  });

  afterAll(async () => {
    if (child) {
      try { child.kill('SIGTERM'); } catch {}
      child = null;
    }
  });

  async function getCache() {
    const res = await request(BASE_URL).get('/api/cache');
    expect(res.status).toBe(200);
    return res.body as any[];
  }

  async function biliDownloadByQuery(q: string, filename: string, format = 'mp3') {
    const url = `${API('/api/bili/downloadByQuery')}?q=${encodeURIComponent(q)}&tag=test&filename=${encodeURIComponent(filename)}&format=${encodeURIComponent(format)}`;
    let lastStatus = 0;
    for (let i = 0; i < 2; i++) {
      const res = await axios.get(url, { responseType: 'stream', validateStatus: () => true, timeout: 25000 });
      lastStatus = res.status;
      (res.data as any)?.destroy?.();
      if ([200, 206].includes(lastStatus)) return lastStatus;
      await sleep(500);
    }
    return lastStatus;
  }

  it('downloadByQuery: 周杰伦 以父之名 -> 以父之名.mp3 with cover+lyrics and >=192kbps', async () => {
    const query = '周杰伦 以父之名';
    const title = '以父之名';
    const status = await biliDownloadByQuery(query, title, 'mp3');
    expect([200, 206]).toContain(status);
    // wait up to 5s for enrichment to complete
    let found: any = null; let cache: any[] = [];
    const start = Date.now();
    while (Date.now() - start < 5000) {
      cache = await getCache();
      found = cache.find(e => String(e.title || '').includes(title));
      if (found && (found.hasCover || found.hasLyrics)) break;
      await sleep(300);
    }
    expect(found).toBeTruthy();
    if (found) {
      expect(String(found.mimeType)).toMatch(/mpeg/i);
      expect((found.bitrateKbps ?? 0)).toBeGreaterThanOrEqual(192);
      expect(found.hasCover).toBeTruthy();
      expect(found.hasLyrics).toBeTruthy();
      // folder sanity: include title in path
      expect(String(found.audioPath)).toMatch(/以父之名/);
    }
  });

  it('bvid download path also yields mp3 with metadata', async () => {
    // search bili for candidates first
    const search = await request(BASE_URL).get('/api/search').query({ q: '以父之名 周杰伦', type: 1, limit: 5, source: 'bili' });
    expect(search.status).toBe(200);
    const items = (search.body && (search.body.items || [])) || [];
    expect(items.length).toBeGreaterThan(0);
    const bvid = items[0].bvid || items[0].bvid_new || items[0].bvid_old;
    expect(typeof bvid).toBe('string');
    const url = `${API(`/api/bili/${encodeURIComponent(bvid)}/download`)}?tag=test&filename=${encodeURIComponent('以父之名')}&format=mp3`;
    const resp = await axios.get(url, { responseType: 'stream', validateStatus: () => true, timeout: 25000 });
    (resp.data as any)?.destroy?.();
    expect([200, 206]).toContain(resp.status);
    // wait up to 5s for enrichment
    let found: any = null; let cache: any[] = [];
    const start = Date.now();
    while (Date.now() - start < 5000) {
      cache = await getCache();
      found = cache.find(e => String(e.title || '').includes('以父之名'));
      if (found && (found.hasCover || found.hasLyrics)) break;
      await sleep(300);
    }
    expect(found).toBeTruthy();
    if (found) {
      expect(String(found.mimeType)).toMatch(/mpeg/i);
      expect((found.bitrateKbps ?? 0)).toBeGreaterThanOrEqual(192);
      expect(found.hasCover).toBeTruthy();
      expect(found.hasLyrics).toBeTruthy();
    }
  });
});
