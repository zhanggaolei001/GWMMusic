import path from "path";

const DEFAULT_CACHE_SUBDIR = "cache";

const intFromEnv = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const stringFromEnv = (value: string | undefined, fallback?: string) => {
  if (value === undefined || value === "") return fallback;
  return value;
};

const boolFromEnv = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  const v = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(v)) return true;
  if (["0", "false", "no", "n", "off"].includes(v)) return false;
  return fallback;
};

export const config = {
  port: intFromEnv(process.env.PORT, 4000),
  host: process.env.HOST || "0.0.0.0",
  baseUrl: process.env.PUBLIC_BASE_URL || "",
  cache: {
    baseDir: path.resolve(process.env.CACHE_DIR || path.join(process.cwd(), "..", DEFAULT_CACHE_SUBDIR)),
    maxSizeBytes: intFromEnv(process.env.CACHE_MAX_SIZE_MB, 2048) * 1024 * 1024,
    ttlMs: intFromEnv(process.env.CACHE_TTL_HOURS, 24) * 60 * 60 * 1000,
    // New: thresholds to decide whether an entry is transient (auto-removed after send)
    minSizeBytes: intFromEnv(process.env.CACHE_MIN_SIZE_MB, 4) * 1024 * 1024,
    minBitrateKbps: intFromEnv(process.env.CACHE_MIN_BITRATE_KBPS, 192),
  },
  features: {
    // Enforce using NetEase metadata naming (title/artist) when available
    forceNeteaseNaming: boolFromEnv(process.env.FORCE_NETEASE_NAMING, true),
    // Enable MusicBrainz fallback for metadata enrichment when NetEase has no result
    mbFallback: boolFromEnv(process.env.BILI_MB_FALLBACK ?? process.env.ENABLE_MB_FALLBACK, true),
    // User-Agent for MusicBrainz requests
    mbUserAgent: stringFromEnv(process.env.MB_USER_AGENT, "GWMMusic/0.1 (+https://github.com/zhanggaolei001/GWMMusic)"),
  },
  bili: {
    targetFormat: stringFromEnv(process.env.BILI_TARGET_FORMAT, "original"),
  },
  netease: {
    cookie: process.env.NETEASE_COOKIE || "",
    realIp: stringFromEnv(process.env.NETEASE_REAL_IP, "101.42.0.1"),
    proxy: stringFromEnv(process.env.NETEASE_PROXY),
    timeoutMs: intFromEnv(process.env.NETEASE_TIMEOUT_MS, 15000),
  },
};

export const defaultTag = "untagged";
