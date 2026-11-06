// Device-local flags in the `meta` table (never exported or synced).
import type { KilnDB } from '../data'

export async function getMeta(db: KilnDB, key: string): Promise<string | undefined> {
  return (await db.meta.get(key))?.value
}

export async function setMeta(db: KilnDB, key: string, value: string): Promise<void> {
  await db.meta.put({ key, value })
}

export async function deleteMeta(db: KilnDB, key: string): Promise<void> {
  await db.meta.delete(key)
}

/** 16 random bytes as 22 base64url characters: fits the Worker's 16-128 character `A-Za-z0-9_-` rule. */
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
