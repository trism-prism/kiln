/** Lowercase slug for an id: letters, digits and hyphens, at most `max` characters. */
export function slugify(s: string, max = 64): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '')
}
