import type { PerformanceTemplateOption } from '@/api/performance'

export function mergeRatingOptions(local: PerformanceTemplateOption[] | undefined, defaults: PerformanceTemplateOption[] = []): PerformanceTemplateOption[] {
  if (local === undefined) return defaults.map(option => ({ ...option }))
  if (local.length === 0) return []
  return local.map(option => {
    const source = defaults.find(level => level.id === option.id)
      ?? defaults.find(level => level.code && (level.code === option.code || level.code === option.id))
    const next = { ...option }
    const legacy = option as PerformanceTemplateOption & { level_description?: string }
    if (next.description === undefined && legacy.level_description !== undefined) next.description = legacy.level_description
    if (source) {
      for (const key of ['code', 'name', 'description', 'color'] as const) {
        if (next[key] === undefined && source[key] !== undefined) next[key] = source[key]
      }
    }
    return next
  })
}
