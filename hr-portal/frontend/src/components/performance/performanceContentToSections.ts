/**
 * 配置态 → 填写态的投影层（对齐飞书「同一份内容 + 一套声明」的渲染链路）
 *
 * 模板预览右栏不再复刻只读 DOM，而是把内容设置里的 content[] 投影成填写页用的
 * PerformanceTemplateSection[]，再交给 PerformanceTemplateRenderer 渲染：
 * 富文本是真编辑器、评级 / 单选 / 标签是真实控件、「添加」真实增行并带序号与删除图标。
 *
 * 与飞书实体链的对应关系：
 *   templateItem.type=evaluatedContent → content.type='work_summary'（条目 entry.type=multiple_texts）
 *   templateItem.type=question         → content.type='custom' + item.questionType
 *   templateItem.type=unit             → content.type='rating'
 *   templateItem.type=prompt           → content.type='prompt'（说明块，不占填写位）
 *   entry.type=multiple_texts          → section.allow_multiple
 *   subField.description               → field.placeholder
 */
import type {
  PerformanceTemplateContent,
  PerformanceTemplateElement,
  PerformanceTemplateField,
  PerformanceTemplateSection,
  PerformanceWorkflowNode,
} from '@/api/performance'
import { isFieldRendered, isFieldWritable, isPromptVisible, resolveFieldSettings } from './performanceContentSettingsResolver'
import { mergeRatingOptions } from './performanceRatingOptions'

export interface ContentToSectionsOptions {
  /** 环节只读（查看结果 / 校准预览）：字段照常渲染，但一律 readonly */
  readonly?: boolean
  /** 是否处于填写态，用于判定 onlyWhenFilling 的说明块（默认 true） */
  filling?: boolean
}

type FieldType = PerformanceTemplateField['type']

/** 内容块主键：与内容设置、内容库、节点绑定保持一致 */
export function performanceContentKey(content: PerformanceTemplateContent, index = 0): string {
  return String(content.content_id || content.id || `${content.type}-${content.name || index}`)
}

function fieldTypeOf(content: PerformanceTemplateContent, item: PerformanceTemplateContent['items'][number]): FieldType | null {
  if (item.kind === 'rating') return 'rating'
  if (content.type === 'rating' && item.kind === undefined) return 'rating'
  if (content.type === 'work_summary') return 'rich_text'
  if (content.type === 'custom' || (content.type === 'rating' && item.kind === 'fill')) {
    const questionType = item.questionType || content.questionType || 'text'
    if (questionType === 'tag') return 'tag_with_followup'
    if (questionType === 'single') return 'single_select'
    return 'rich_text'
  }
  return null
}

/**
 * 允许添加多条时，实例标题由渲染器统一追加序号（`${name} ${index}`），
 * 因此条目自身名字里的尾号要先去掉，否则会出现「重点工作 1 1」。
 */
function instanceLabel(label: string, allowMultiple: boolean): string {
  return allowMultiple ? label.replace(/\s\d+$/, '') : label
}

function contentAllowsMultiple(content: PerformanceTemplateContent): boolean {
  return content.settings?.allowMultiple === true
    || (content.items || []).some(item => item.settings?.allowMultiple === true)
}

export function contentToSections(
  node: PerformanceWorkflowNode | null | undefined,
  contents: PerformanceTemplateContent[],
  options: ContentToSectionsOptions = {},
): PerformanceTemplateSection[] {
  const readonly = options.readonly === true
  const filling = options.filling !== false
  const sections: PerformanceTemplateSection[] = []

  contents.forEach((content, index) => {
    if (content.type === 'reference') return
    const key = performanceContentKey(content, index)

    /* 说明块：不占填写位，作为只有 prompt 元素的 section 交给渲染器 */
    if (content.type === 'prompt') {
      if (!isPromptVisible(content.prompt, { filling })) return
      sections.push({
        id: key,
        name: '',
        description: '',
        fields: [],
        elements: [{ kind: 'prompt', id: `${key}:prompt`, prompt: content.prompt! }],
      })
      return
    }

    const allowMultiple = contentAllowsMultiple(content)
    const fields: PerformanceTemplateField[] = []
    const elements: PerformanceTemplateElement[] = []
    let hideDescription = false

    for (const item of content.items || []) {
      if (item.kind === 'prompt') {
        if (isPromptVisible(item.prompt, { filling })) elements.push({ kind: 'prompt', id: item.id, prompt: item.prompt! })
        continue
      }
      const type = fieldTypeOf(content, item)
      if (!type) continue
      const settings = resolveFieldSettings({ node, content, item, readonly })
      if (!isFieldRendered(settings)) continue
      hideDescription = hideDescription || settings.hideDescription
      const writable = isFieldWritable(settings)
      fields.push({
        id: item.id,
        type,
        label: instanceLabel(item.label, allowMultiple),
        required: settings.required && writable,
        placeholder: settings.placeholder,
        options: type === 'rating'
          ? mergeRatingOptions(item.options, content.options || [])
          : (item.options ?? content.options ?? []),
        display_mode: type === 'rating' ? (item.ratingDisplayMode || content.ratingDisplayMode) : undefined,
        hide_name: settings.hideName,
        allow_unknown: type === 'rating' ? content.settings?.allowUnknown === true : undefined,
        description: (item.hint || content.description || '').trim() || undefined,
        hide_description: settings.hideDescription,
        default_all: item.defaultAll ?? content.defaultAll ?? false,
        readonly: !writable,
      })
      elements.push({ kind: 'field', id: item.id })
    }

    if (!fields.length && !elements.length) return
    sections.push({
      id: key,
      name: content.name,
      description: hideDescription ? '' : content.description,
      allow_multiple: allowMultiple,
      fields,
      elements: elements.length ? elements : undefined,
    })
  })

  return sections
}
