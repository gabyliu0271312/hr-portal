import type { PerformanceTemplateField } from '@/api/performance'

export const performanceTemplateFieldRegistry = {
  rich_text: { modes: ['edit', 'readonly'] },
  rating: { modes: ['edit', 'readonly'] },
  tag_with_followup: { modes: ['edit', 'readonly'] },
} as const

export function isRegisteredPerformanceTemplateField(field: PerformanceTemplateField, mode: 'edit' | 'readonly') {
  const renderer = performanceTemplateFieldRegistry[field.type]
  return renderer?.modes.includes(mode) ?? false
}
