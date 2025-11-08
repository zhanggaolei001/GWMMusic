import { promises as fs } from "fs";
import path from "path";

type CookieRecord = {
  value: string;
  updatedAt: string;
};

const DATA_DIR = path.resolve(__dirname, "..", ".data");
const COOKIE_FILE = path.join(DATA_DIR, "netease_cookie.json");

let defaultCookie = "";
let updatedAt: string | undefined;

async function ensureDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {}
}

async function readCookieFile(): Promise<CookieRecord | null> {
  try {
    const raw = await fs.readFile(COOKIE_FILE, "utf8");
    const parsed = JSON.parse(raw) as CookieRecord;
    if (parsed && typeof parsed.value === "string") return parsed;
  } catch {}
  return null;
}

async function writeCookieFile(record: CookieRecord): Promise<void> {
  await ensureDir();
  await fs.writeFile(COOKIE_FILE, JSON.stringify(record, null, 2), "utf8");
}

// Initialize from persisted file or ENV once on module load
(async () => {
  const saved = await readCookieFile();
  if (saved?.value) {
    defaultCookie = saved.value;
    updatedAt = saved.updatedAt;
  } else if (process.env.NETEASE_COOKIE) {
    defaultCookie = process.env.NETEASE_COOKIE;
    updatedAt = new Date().toISOString();
    // Persist ENV-provided cookie so future runs don't rely on ENV
    try { await writeCookieFile({ value: defaultCookie, updatedAt }); } catch {}
  }
})();

export function getDefaultCookie(): string {
  return defaultCookie || "";
}

export async function setDefaultCookie(cookie: string): Promise<void> {
  defaultCookie = cookie || "";
  updatedAt = new Date().toISOString();
  await writeCookieFile({ value: defaultCookie, updatedAt });
}

export async function clearDefaultCookie(): Promise<void> {
  defaultCookie = "";
  updatedAt = new Date().toISOString();
  await writeCookieFile({ value: defaultCookie, updatedAt });
}

export function getCookieStatus(): { hasCookie: boolean; updatedAt?: string; masked?: string } {
  const hasCookie = Boolean(defaultCookie && defaultCookie.trim());
  let masked: string | undefined;
  if (hasCookie) {
    const v = defaultCookie.trim();
    const head = v.slice(0, Math.min(6, v.length));
    const tail = v.slice(Math.max(0, v.length - 6));
    masked = `${head}...${tail}`;
  }
  return { hasCookie, updatedAt, masked };
}

