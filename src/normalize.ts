/**
 * ID normalization for PACT user_id and subscription names.
 *
 * Rules: lowercase, trim, spaces → hyphens.
 */

export function normalizeId(id: string): string {
  return id.trim().toLowerCase().replace(/\s+/g, "-");
}
