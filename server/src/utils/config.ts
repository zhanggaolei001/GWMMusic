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

export const config = {
  port: intFromEnv(process.env.PORT, 4000),
  host: process.env.HOST || "0.0.0.0",
  baseUrl: process.env.PUBLIC_BASE_URL || "",
  cache: {
    baseDir: path.resolve(process.env.CACHE_DIR || path.join(process.cwd(), "..", DEFAULT_CACHE_SUBDIR)),
    maxSizeBytes: intFromEnv(process.env.CACHE_MAX_SIZE_MB, 2048) * 1024 * 1024,
    ttlMs: intFromEnv(process.env.CACHE_TTL_HOURS, 24) * 60 * 60 * 1000,
  },
  netease: {
    cookie: process.env.NETEASE_COOKIE || "",
    realIp: stringFromEnv(process.env.NETEASE_REAL_IP, "101.42.0.1"),
    proxy: stringFromEnv(process.env.NETEASE_PROXY),
    timeoutMs: intFromEnv(process.env.NETEASE_TIMEOUT_MS, 15000),
  },
};

export const defaultTag = "untagged";
