import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

/** Deep-get a value from an object by dot-path. Returns undefined if not found. */
export function getPath(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<unknown>((acc, key) => {
    if (acc !== null && typeof acc === 'object' && !Array.isArray(acc)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/** Parse a price string/number to integer cents. Returns null if unparseable. */
export function parsePriceCents(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = parseFloat(String(raw).replace(',', '.'));
  if (isNaN(n)) return null;
  return Math.round(n * 100);
}

/** Parse date strings in common feed formats to 'YYYY-MM-DD'. Returns null if unparseable. */
export function parseDate(raw: unknown): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  // Already ISO: 2025-07-14
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // Dutch dd-mm-yyyy or dd/mm/yyyy
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  }
  // Timestamp: 2025-07-14T10:00:00Z
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  return null;
}

/** SHA-256 of a buffer, hex-encoded */
export function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

/** Ensure a directory exists */
export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

/** Write raw feed bytes to a local cache path, return the path */
export function saveFeedFile(sourceId: string, buf: Buffer): string {
  const dir = path.join(process.cwd(), '.feed-cache', sourceId);
  ensureDir(dir);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(dir, `${ts}.xml`);
  writeFileSync(filePath, buf);
  return filePath;
}

export function readFeedFile(filePath: string): Buffer {
  return readFileSync(filePath);
}
