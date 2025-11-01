import fs from "fs";
import fse from "fs-extra";
import path from "path";
import { pipeline } from "stream/promises";
import { parseFile } from "music-metadata";
import mime from "mime-types";
import * as NodeID3 from "node-id3";
import { config } from "../utils/config";

export interface CacheMetadata {
  id: number;
  tag: string;
  title?: string;
  artists?: string[];
  album?: string;
  sourceUrl: string;
  mimeType: string;
  extension: string;
  size: number;
  createdAt: string;
  lastAccessedAt: string;
  audioFile: string;
  lyricsFile?: string;
  coverFile?: string;
  folder: string;
  durationSeconds?: number;
  bitrateKbps?: number;
}

export interface CacheEntry {
  audioPath: string;
  metadataPath: string;
  lyricsPath?: string;
  coverPath?: string;
  metadata: CacheMetadata;
  transient?: boolean;
}

export const safeTag = (tag: string): string => {
  return tag
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\-]+/gi, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$|^$/g, "") || "untagged";
};

const safeSegment = (value: string, fallback = "unknown"): string => {
  return (value || fallback)
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 80) || fallback;
};

interface EntryPaths {
  tagDir: string;
  songDir: string;
  audioPath: string;
  metadataPath: string;
  lyricsPath: string;
  coverPath: string;
  indexPath: string;
}

// thresholds moved to config.cache.minSizeBytes / minBitrateKbps

export class AudioCache {
  private readonly baseDir: string;
  private readonly maxSizeBytes: number;
  private readonly ttlMs: number;

  constructor(options: { baseDir: string; maxSizeBytes: number; ttlMs: number }) {
    this.baseDir = options.baseDir;
    this.maxSizeBytes = Math.max(options.maxSizeBytes, 0);
    this.ttlMs = Math.max(options.ttlMs, 0);
  }

  async init(): Promise<void> {
    await fse.ensureDir(this.baseDir);
  }

  private legacyPaths(tag: string, songId: number) {
    const normalisedTag = safeTag(tag);
    const tagDir = path.join(this.baseDir, normalisedTag);
    const base = path.join(tagDir, String(songId));
    return {
      tagDir,
      songDir: tagDir,
      audioPath: `${base}.bin`,
      metadataPath: `${base}.json`,
      lyricsPath: `${base}.lrc`,
      coverPath: `${base}.cover`,
      indexPath: path.join(tagDir, `${songId}.index.json`),
    } satisfies EntryPaths;
  }

  private async resolvePaths(tag: string, songId: number): Promise<EntryPaths | null> {
    const normalisedTag = safeTag(tag);
    const tagDir = path.join(this.baseDir, normalisedTag);
    const indexPath = path.join(tagDir, `${songId}.index.json`);

    if (await fse.pathExists(indexPath)) {
      const index = await fse.readJSON(indexPath);
      const songDir = path.join(tagDir, index.folder as string);
      const metadataPath = path.join(songDir, "metadata.json");
      const audioPath = path.join(songDir, index.audioFile as string);
      const defaultLyricsName = index.audioFile ? `${path.parse(index.audioFile as string).name}.lrc` : "lyrics.lrc";
      const lyricsFile = index.lyricsFile ? path.join(songDir, index.lyricsFile as string) : path.join(songDir, defaultLyricsName);
      const coverFile = index.coverFile ? path.join(songDir, index.coverFile as string) : path.join(songDir, "cover.jpg");
      return {
        tagDir,
        songDir,
        metadataPath,
        audioPath,
        lyricsPath: lyricsFile,
        coverPath: coverFile,
        indexPath,
      };
    }

    const legacy = this.legacyPaths(tag, songId);
    if (await fse.pathExists(legacy.metadataPath)) {
      return legacy;
    }

    return null;
  }

  private async readMetadata(tag: string, songId: number): Promise<{ metadata: CacheMetadata; paths: EntryPaths } | null> {
    const resolved = await this.resolvePaths(tag, songId);
    if (!resolved) return null;

    try {
      const metadata = (await fse.readJSON(resolved.metadataPath)) as CacheMetadata;
      if (this.ttlMs > 0) {
        const created = new Date(metadata.createdAt).getTime();
        if (!Number.isFinite(created) || Date.now() - created > this.ttlMs) {
          await this.remove(tag, songId).catch(() => undefined);
          return null;
        }
      }
      await fse.access(resolved.audioPath, fs.constants.R_OK);
      return { metadata, paths: resolved };
    } catch {
      return null;
    }
  }

  async get(tag: string, songId: number): Promise<CacheEntry | null> {
    const existing = await this.readMetadata(tag, songId);
    if (!existing) return null;
    existing.metadata.lastAccessedAt = new Date().toISOString();
    await fse.writeJSON(existing.paths.metadataPath, existing.metadata, { spaces: 2 });
    return {
      audioPath: existing.paths.audioPath,
      metadataPath: existing.paths.metadataPath,
      lyricsPath: (await fse.pathExists(existing.paths.lyricsPath)) ? existing.paths.lyricsPath : undefined,
      coverPath: (await fse.pathExists(existing.paths.coverPath)) ? existing.paths.coverPath : undefined,
      metadata: existing.metadata,
    };
  }

  async remove(tag: string, songId: number): Promise<void> {
    const resolved = await this.resolvePaths(tag, songId);
    if (!resolved) return;
    await Promise.allSettled([
      fse.remove(resolved.songDir),
      fse.remove(resolved.indexPath),
    ]);
  }

  async save(options: {
    tag: string;
    songId: number;
    stream: NodeJS.ReadableStream;
    mimeType: string;
    extension: string;
    sourceUrl: string;
    metadata?: {
      title?: string;
      artists?: string[];
      album?: string;
      bitrateKbps?: number;
    };
    lyrics?: {
      content?: string;
    };
    cover?: {
      buffer?: Buffer;
      fileName?: string;
    };
  }): Promise<CacheEntry> {
    const { tag, songId, stream, mimeType, extension, sourceUrl, metadata, lyrics, cover } = options;
    const meta = metadata ?? {};

    const normalisedTag = safeTag(tag);
    const tagDir = path.join(this.baseDir, normalisedTag);
    const primaryArtist = meta.artists?.[0] || "Unknown Artist";
    const artistDirName = safeSegment(primaryArtist, "artist");
    const titleSegment = safeSegment(meta.title || `Song-${songId}`);
    const songDirName = `${titleSegment} (${songId})`;
    const songDir = path.join(tagDir, artistDirName, songDirName);
    const audioFileName = `${titleSegment}.${extension}`;
    const audioPath = path.join(songDir, audioFileName);
    const metadataPath = path.join(songDir, "metadata.json");
    const lyricsFileName = lyrics?.content ? `${titleSegment}.lrc` : undefined;
    const lyricsPath = lyricsFileName ? path.join(songDir, lyricsFileName) : path.join(songDir, `${titleSegment}.lrc`);
    const coverFileName = cover?.fileName || "cover.jpg";
    const coverPath = path.join(songDir, coverFileName);
    const indexPath = path.join(tagDir, `${songId}.index.json`);

    await fse.ensureDir(songDir);

    const tempAudio = `${audioPath}.tmp`;
    await pipeline(stream, fs.createWriteStream(tempAudio));
    const stats = await fse.stat(tempAudio);

    await fse.move(tempAudio, audioPath, { overwrite: true });

    let durationSeconds: number | undefined;
    let bitrateKbps: number | undefined = meta.bitrateKbps;
    try {
      const parsed = await parseFile(audioPath);
      if (typeof parsed.format.duration === "number") {
        durationSeconds = parsed.format.duration;
      }
      if (typeof parsed.format.bitrate === "number") {
        bitrateKbps = Math.round(parsed.format.bitrate / 1000);
      }
    } catch {
      // ignore parse errors
    }

    const finalMetadata: CacheMetadata = {
      id: songId,
      tag: normalisedTag,
      sourceUrl,
      mimeType,
      extension,
      size: stats.size,
      createdAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
      title: meta.title,
      artists: meta.artists,
      album: meta.album,
      audioFile: audioFileName,
      lyricsFile: lyricsFileName,
      coverFile: cover?.buffer ? coverFileName : undefined,
      folder: path.relative(tagDir, songDir) || ".",
      durationSeconds,
      bitrateKbps,
    };

    await fse.writeJSON(metadataPath, finalMetadata, { spaces: 2 });

    if (lyricsFileName && lyrics?.content) {
      await fse.writeFile(lyricsPath, lyrics.content, "utf8");
    }

    if (cover?.buffer) {
      await fse.writeFile(coverPath, cover.buffer as Buffer);
    }

    await this.embedMetadataIntoAudio({
      audioPath,
      metadata: finalMetadata,
      lyrics: lyricsFileName && lyrics?.content ? lyrics.content : undefined,
      coverBuffer: cover?.buffer,
      coverMime: cover?.buffer ? mime.lookup(coverFileName) || undefined : undefined,
    });

    await fse.writeJSON(indexPath, {
      folder: finalMetadata.folder,
      audioFile: finalMetadata.audioFile,
      lyricsFile: finalMetadata.lyricsFile,
      coverFile: finalMetadata.coverFile,
    });

    const isLowQuality =
      stats.size < (config.cache.minSizeBytes ?? 0) ||
      ((bitrateKbps ?? 0) > 0 && (bitrateKbps ?? 0) < (config.cache.minBitrateKbps ?? 0));

    await this.ensureCapacity();

    const result: CacheEntry = {
      audioPath,
      metadataPath,
      lyricsPath: lyricsFileName ? lyricsPath : undefined,
      coverPath: cover?.buffer ? coverPath : undefined,
      metadata: finalMetadata,
      transient: isLowQuality,
    };

    return result;
  }

  async list(): Promise<CacheEntry[]> {
    const entries: CacheEntry[] = [];
    if (!(await fse.pathExists(this.baseDir))) {
      return entries;
    }
    const tags = await fse.readdir(this.baseDir);
    for (const tag of tags) {
      const tagDir = path.join(this.baseDir, tag);
      const files = await fse.readdir(tagDir);
      for (const file of files) {
        if (file.endsWith(".index.json")) {
          const songId = Number.parseInt(file.replace(/\.index\.json$/, ""), 10);
          if (!Number.isFinite(songId)) continue;
          const entry = await this.get(tag, songId);
          if (entry) entries.push(entry);
        } else if (file.endsWith(".json")) {
          const songId = Number.parseInt(file.replace(/\.json$/, ""), 10);
          if (!Number.isFinite(songId)) continue;
          const entry = await this.get(tag, songId);
          if (entry) entries.push(entry);
        }
      }
    }
    return entries;
  }

  private async embedMetadataIntoAudio(options: {
    audioPath: string;
    metadata: CacheMetadata;
    lyrics?: string;
    coverBuffer?: Buffer;
    coverMime?: string | false | undefined;
  }): Promise<void> {
    const extension = options.metadata.extension?.toLowerCase();
    if (extension !== "mp3") {
      return;
    }

    try {
      const title = options.metadata.title || path.parse(options.metadata.audioFile).name;
      const artist = options.metadata.artists?.length ? options.metadata.artists.join(" / ") : undefined;

      const tags: NodeID3.Tags = {
        title,
        artist,
        album: options.metadata.album,
        comment: {
          language: "eng",
          text: "Cached via GWM Music Server",
        },
      };

      if (options.lyrics) {
        tags.unsynchronisedLyrics = {
          language: "chi",
          text: options.lyrics,
        };
      }

      if (options.coverBuffer) {
        const picture = {
          type: { id: 3, name: "front cover" },
          description: options.metadata.title || "Cover",
          mime: typeof options.coverMime === "string" ? options.coverMime : "image/jpeg",
          imageBuffer: options.coverBuffer,
        };
        (tags as any).image = picture;
      }

      const success = NodeID3.update(tags as any, options.audioPath, { encoding: "utf16le" } as any);
      if (!success) {
        console.warn(`Failed to embed ID3 tags for ${options.audioPath}`);
      }
    } catch (error) {
      console.warn(`Error embedding metadata for ${options.audioPath}:`, error);
    }
  }

  private async ensureCapacity(): Promise<void> {
    if (this.maxSizeBytes === 0) return;
    const entries = await this.list();
    let total = entries.reduce((acc, entry) => acc + entry.metadata.size, 0);
    if (total <= this.maxSizeBytes) return;
    const sorted = entries.sort((a, b) =>
      new Date(a.metadata.lastAccessedAt).getTime() - new Date(b.metadata.lastAccessedAt).getTime(),
    );
    for (const entry of sorted) {
      if (total <= this.maxSizeBytes) break;
      await this.remove(entry.metadata.tag, entry.metadata.id);
      total -= entry.metadata.size;
    }
  }
}





























