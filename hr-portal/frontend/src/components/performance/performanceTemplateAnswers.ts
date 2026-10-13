import type { PerformanceTemplateField, PerformanceTemplateSection } from '@/api/performance'

function isLegacyTagArray(field: PerformanceTemplateField, value: unknown) {
  return field.type === 'tag_with_followup' && Array.isArray(value) && value.every(item => typeof item === 'string')
}

function defaultValue(field: PerformanceTemplateField) {
  return field.type === 'tag_with_followup' ? { tags: [], notes: {} } : ''
}

export function performanceTemplateFieldValues(section: PerformanceTemplateSection, field: PerformanceTemplateField, answers: Record<string, unknown>) {
  const value = answers[field.id]
  if (!section.allow_multiple || isLegacyTagArray(field, value)) return [value]
  return Array.isArray(value) ? value : [value]
}

export function performanceTemplateInstanceCount(section: PerformanceTemplateSection, answers: Record<string, unknown>) {
  if (!section.allow_multiple) return 1
  return Math.max(1, ...section.fields.map(field => performanceTemplateFieldValues(section, field, answers).length))
}

export function performanceTemplateFieldValue(section: PerformanceTemplateSection, field: PerformanceTemplateField, index: number, answers: Record<string, unknown>) {
  return performanceTemplateFieldValues(section, field, answers)[index]
}

export function performanceTemplateUpdatedFieldValue(section: PerformanceTemplateSection, field: PerformanceTemplateField, index: number, value: unknown, answers: Record<string, unknown>) {
  if (!section.allow_multiple) return value
  const count = performanceTemplateInstanceCount(section, answers)
  const values = performanceTemplateFieldValues(section, field, answers).slice()
  while (values.length < count) values.push(defaultValue(field))
  for (let itemIndex = 0; itemIndex < count; itemIndex += 1) if (values[itemIndex] == null) values[itemIndex] = defaultValue(field)
  values[index] = value
  return values
}

export function performanceTemplateAddedInstance(section: PerformanceTemplateSection, answers: Record<string, unknown>) {
  const count = performanceTemplateInstanceCount(section, answers)
  return Object.fromEntries(section.fields.map((field) => {
    const values = performanceTemplateFieldValues(section, field, answers).slice()
    while (values.length < count) values.push(defaultValue(field))
    for (let index = 0; index < count; index += 1) if (values[index] == null) values[index] = defaultValue(field)
    values.push(defaultValue(field))
    return [field.id, values]
  }))
}

export function performanceTemplateRemovedInstance(section: PerformanceTemplateSection, index: number, answers: Record<string, unknown>) {
  return Object.fromEntries(section.fields.map((field) => {
    const values = performanceTemplateFieldValues(section, field, answers).slice()
    while (values.length < performanceTemplateInstanceCount(section, answers)) values.push(defaultValue(field))
    for (let itemIndex = 0; itemIndex < values.length; itemIndex += 1) if (values[itemIndex] == null) values[itemIndex] = defaultValue(field)
    values.splice(index, 1)
    return [field.id, values.length ? values : [defaultValue(field)]]
  }))
}

export function performanceTemplateFieldErrorKey(section: PerformanceTemplateSection, field: PerformanceTemplateField, index: number) {
  return section.allow_multiple ? `${field.id}:${index}` : field.id
}
