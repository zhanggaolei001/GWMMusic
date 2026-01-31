/// <reference path="../types/sqljs.d.ts" />
import path from "path";
import fs from "fs";
import fse from "fs-extra";
import type { SqlJsStatic, Database as SqlDatabase } from "sql.js";

export type CacheIndexRow = {
  tag: string;
  id: number;
  folder: string;
  audioFile: string;
  lyricsFile?: string | null;
  coverFile?: string | null;
  durationSeconds?: number | null;
  bitrateKbps?: number | null;
  size: number;
  createdAt: string;
  lastAccessedAt: string;
  mimeType?: string | null;
  extension?: string | null;
  sourceUrl?: string | null;
};

export class CacheIndex {
  private readonly dbPath: string;
  private SQL: SqlJsStatic | null = null;
  private db: SqlDatabase | null = null;

  constructor(baseDir: string) {
    this.dbPath = path.join(baseDir, "_index.db");
  }

  async init(): Promise<void> {
    fse.ensureDirSync(path.dirname(this.dbPath));
    const initSqlJs = (await import("sql.js")).default;
    this.SQL = await initSqlJs({
      locateFile: (file: string) => require.resolve(`sql.js/dist/${file}`),
    });
    let data: Uint8Array | undefined;
    if (fs.existsSync(this.dbPath)) {
      data = new Uint8Array(fs.readFileSync(this.dbPath));
    }
    this.db = new this.SQL.Database(data);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entries (
        tag TEXT NOT NULL,
        id INTEGER NOT NULL,
        folder TEXT NOT NULL,
        audioFile TEXT NOT NULL,
        lyricsFile TEXT,
        coverFile TEXT,
        durationSeconds REAL,
        bitrateKbps INTEGER,
        size INTEGER NOT NULL,
        createdAt TEXT NOT NULL,
        lastAccessedAt TEXT NOT NULL,
        mimeType TEXT,
        extension TEXT,
        sourceUrl TEXT,
        PRIMARY KEY (tag, id)
      );
      CREATE INDEX IF NOT EXISTS idx_entries_lastAccessed ON entries(lastAccessedAt);
    `);
    this.flush();
  }

  private get conn(): SqlDatabase {
    if (!this.db) throw new Error("CacheIndex not initialized");
    return this.db;
  }

  private flush(): void {
    if (!this.dbPath || !this.db) return;
    const binary = this.db.export();
    fs.writeFileSync(this.dbPath, Buffer.from(binary));
  }

  upsert(row: CacheIndexRow): void {
    const sql = `
      INSERT INTO entries (
        tag, id, folder, audioFile, lyricsFile, coverFile,
        durationSeconds, bitrateKbps, size, createdAt, lastAccessedAt,
        mimeType, extension, sourceUrl
      ) VALUES (
        $tag, $id, $folder, $audioFile, $lyricsFile, $coverFile,
        $durationSeconds, $bitrateKbps, $size, $createdAt, $lastAccessedAt,
        $mimeType, $extension, $sourceUrl
      )
      ON CONFLICT(tag, id) DO UPDATE SET
        folder=excluded.folder,
        audioFile=excluded.audioFile,
        lyricsFile=excluded.lyricsFile,
        coverFile=excluded.coverFile,
        durationSeconds=excluded.durationSeconds,
        bitrateKbps=excluded.bitrateKbps,
        size=excluded.size,
        createdAt=excluded.createdAt,
        lastAccessedAt=excluded.lastAccessedAt,
        mimeType=excluded.mimeType,
        extension=excluded.extension,
        sourceUrl=excluded.sourceUrl;
    `;
    const stmt = this.conn.prepare(sql);
    stmt.bind({
      $tag: row.tag,
      $id: row.id,
      $folder: row.folder,
      $audioFile: row.audioFile,
      $lyricsFile: row.lyricsFile ?? null,
      $coverFile: row.coverFile ?? null,
      $durationSeconds: row.durationSeconds ?? null,
      $bitrateKbps: row.bitrateKbps ?? null,
      $size: row.size,
      $createdAt: row.createdAt,
      $lastAccessedAt: row.lastAccessedAt,
      $mimeType: row.mimeType ?? null,
      $extension: row.extension ?? null,
      $sourceUrl: row.sourceUrl ?? null,
    });
    stmt.step();
    stmt.free();
    this.flush();
  }

  touch(tag: string, id: number, iso: string): void {
    const stmt = this.conn.prepare(`UPDATE entries SET lastAccessedAt=$iso WHERE tag=$tag AND id=$id`);
    stmt.bind({ $tag: tag, $id: id, $iso: iso });
    stmt.step();
    stmt.free();
    this.flush();
  }

  remove(tag: string, id: number): void {
    const stmt = this.conn.prepare(`DELETE FROM entries WHERE tag=$tag AND id=$id`);
    stmt.bind({ $tag: tag, $id: id });
    stmt.step();
    stmt.free();
    this.flush();
  }

  totalSize(): number {
    const stmt = this.conn.prepare(`SELECT COALESCE(SUM(size),0) AS total FROM entries`);
    stmt.step();
    const row = stmt.getAsObject() as any;
    stmt.free();
    return Number(row.total || 0);
  }

  count(): number {
    const stmt = this.conn.prepare(`SELECT COUNT(1) AS cnt FROM entries`);
    stmt.step();
    const row = stmt.getAsObject() as any;
    stmt.free();
    return Number(row.cnt || 0);
  }

  listAll(): CacheIndexRow[] {
    const out: CacheIndexRow[] = [];
    const stmt = this.conn.prepare(`SELECT * FROM entries`);
    while (stmt.step()) {
      out.push(stmt.getAsObject() as unknown as CacheIndexRow);
    }
    stmt.free();
    return out;
  }

  listOldestFirst(): CacheIndexRow[] {
    const out: CacheIndexRow[] = [];
    const stmt = this.conn.prepare(
      `SELECT * FROM entries ORDER BY datetime(lastAccessedAt) ASC, datetime(createdAt) ASC`,
    );
    while (stmt.step()) {
      out.push(stmt.getAsObject() as unknown as CacheIndexRow);
    }
    stmt.free();
    return out;
  }
}
