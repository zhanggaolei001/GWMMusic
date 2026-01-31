import fs from "fs";
import fse from "fs-extra";
import path from "path";

import { config } from "../utils/config";
import { CacheIndex } from "../services/cacheIndex";

async function rebuild() {
  const baseDir = config.cache.baseDir;
  const indexPath = path.join(baseDir, "_index.db");
  await fse.ensureDir(baseDir);

  if (fs.existsSync(indexPath)) {
    await fse.remove(indexPath);
  }

  const index = new CacheIndex(baseDir);
  await index.init();

  let inserted = 0;
  let skipped = 0;

  const tags = (await fse.readdir(baseDir)).filter((t) => fs.statSync(path.join(baseDir, t)).isDirectory());
  for (const tag of tags) {
    const tagDir = path.join(baseDir, tag);
    const files = await fse.readdir(tagDir);
    for (const file of files) {
      try {
        if (file.endsWith(".index.json")) {
          const id = Number.parseInt(file.replace(/\.index\.json$/, ""), 10);
          if (!Number.isFinite(id)) { skipped++; continue; }
          const indexJson = await fse.readJSON(path.join(tagDir, file));
          const folder = String(indexJson.folder || ".");
          const audioFile = String(indexJson.audioFile || "");
          if (!audioFile) { skipped++; continue; }
          const songDir = path.join(tagDir, folder);
          const audioPath = path.join(songDir, audioFile);
          if (!fs.existsSync(audioPath)) { skipped++; continue; }
          const stats = await fse.stat(audioPath);
          const metadataPath = path.join(songDir, "metadata.json");
          let createdAt = new Date().toISOString();
          let lastAccessedAt = createdAt;
          let durationSeconds: number | undefined;
          let bitrateKbps: number | undefined;
          let mimeType: string | undefined;
          let extension: string | undefined;
          let sourceUrl: string | undefined;
          try {
            const meta = await fse.readJSON(metadataPath);
            createdAt = meta?.createdAt || createdAt;
            lastAccessedAt = meta?.lastAccessedAt || lastAccessedAt;
            durationSeconds = typeof meta?.durationSeconds === 'number' ? meta.durationSeconds : undefined;
            bitrateKbps = typeof meta?.bitrateKbps === 'number' ? meta.bitrateKbps : undefined;
            mimeType = typeof meta?.mimeType === 'string' ? meta.mimeType : undefined;
            extension = typeof meta?.extension === 'string' ? meta.extension : undefined;
            sourceUrl = typeof meta?.sourceUrl === 'string' ? meta.sourceUrl : undefined;
          } catch {}
          index.upsert({
            tag,
            id,
            folder,
            audioFile,
            lyricsFile: indexJson.lyricsFile || null,
            coverFile: indexJson.coverFile || null,
            durationSeconds: durationSeconds ?? null,
            bitrateKbps: bitrateKbps ?? null,
            size: stats.size,
            createdAt,
            lastAccessedAt,
            mimeType: mimeType ?? null,
            extension: extension ?? null,
            sourceUrl: sourceUrl ?? null,
          });
          inserted++;
          continue;
        }
        if (file.endsWith(".json")) {
          // legacy layout: <id>.json + <id>.bin in tag root
          const id = Number.parseInt(file.replace(/\.json$/, ""), 10);
          if (!Number.isFinite(id)) { skipped++; continue; }
          const audioFile = `${id}.bin`;
          const audioPath = path.join(tagDir, audioFile);
          if (!fs.existsSync(audioPath)) { skipped++; continue; }
          const stats = await fse.stat(audioPath);
          const metaJson = await fse.readJSON(path.join(tagDir, file));
          const createdAt = metaJson?.createdAt || new Date().toISOString();
          const lastAccessedAt = metaJson?.lastAccessedAt || createdAt;
          index.upsert({
            tag,
            id,
            folder: ".",
            audioFile,
            lyricsFile: fs.existsSync(path.join(tagDir, `${id}.lrc`)) ? `${id}.lrc` : null,
            coverFile: fs.existsSync(path.join(tagDir, `${id}.cover`)) ? `${id}.cover` : null,
            durationSeconds: typeof metaJson?.durationSeconds === 'number' ? metaJson.durationSeconds : null,
            bitrateKbps: typeof metaJson?.bitrateKbps === 'number' ? metaJson.bitrateKbps : null,
            size: stats.size,
            createdAt,
            lastAccessedAt,
            mimeType: typeof metaJson?.mimeType === 'string' ? metaJson.mimeType : null,
            extension: typeof metaJson?.extension === 'string' ? metaJson.extension : null,
            sourceUrl: typeof metaJson?.sourceUrl === 'string' ? metaJson.sourceUrl : null,
          });
          inserted++;
          continue;
        }
      } catch {
        skipped++;
      }
    }
  }

  console.log(JSON.stringify({ baseDir, indexPath, inserted, skipped }, null, 2));
}

rebuild().catch((err) => {
  console.error(err);
  process.exit(1);
});

