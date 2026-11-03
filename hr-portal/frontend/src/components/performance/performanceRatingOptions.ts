import type { PerformanceTemplateOption } from '@/api/performance'

function legacyOption(option: PerformanceTemplateOption): PerformanceTemplateOption {
  const next = { ...option }
  const legacy = option as PerformanceTemplateOption & { level_description?: string }
  if (next.description === undefined && legacy.level_description !== undefined) next.description = legacy.level_description
  return next
}

/**
 * 展示兜底合并：本地（条目自身）等级优先，仅用 fallback 补齐缺失的代号/名称/描述。
 * 用于预览渲染等已经有自己一份等级定义的场景。
 */
export function mergeRatingOptions(local: PerformanceTemplateOption[] | undefined, fallback: PerformanceTemplateOption[] = []): PerformanceTemplateOption[] {
  if (local === undefined) return fallback.map(option => ({ ...option }))
  if (local.length === 0) return []
  return local.map(option => {
    const source = fallback.find(level => level.id === option.id)
      ?? fallback.find(level => level.code && (level.code === option.code || level.code === option.id))
    const next = legacyOption(option)
    if (source) {
      for (const key of ['code', 'name', 'description', 'color'] as const) {
        if (next[key] === undefined && source[key] !== undefined) next[key] = source[key]
      }
    }
    return next
  })
}

/**
 * 评级等级以评级题库为唯一权威（对齐飞书的共享 indicator.props.options）：
 * 题库返回等级时一律以题库定义为准，本地快照只作为题库缺失（题库项被删除或离线）时的兜底。
 * 这样可以保证在题库里改了等级代号/名称/描述后，所有引用该评级内容的环节都会同步。
 */
export function resolveRatingOptions(local: PerformanceTemplateOption[] | undefined, authority: PerformanceTemplateOption[] = []): PerformanceTemplateOption[] {
  if (!authority.length) return (local ?? []).map(legacyOption)
  return authority.map(option => ({ ...option }))
}
