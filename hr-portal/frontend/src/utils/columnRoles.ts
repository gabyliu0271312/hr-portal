const TECHNICAL_CODES = new Set(['id', 'pk_hash', 'synced_at'])

export function isTechnicalColumn(code: string | null | undefined): boolean {
  const value = (code || '').trim().toLowerCase()
  return !value || TECHNICAL_CODES.has(value) || value.startsWith('raw_') || value.startsWith('src_') || value.startsWith('_') || value.endsWith('_hash')
}
