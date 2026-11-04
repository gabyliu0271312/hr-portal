/**
 * 内容设置解析层（对齐飞书 performance 的声明表语义）
 *
 * 飞书把「可编辑 / 隐藏 / 必填 / 允许添加多条」存成独立声明表
 * （entrySetting.viewType、permission.mode、allowMultiple、required），
 * 字段本身不知道自己是必填还是只读，渲染时按 (环节, 内容, 条目) 查表得到一份渲染指令。
 *
 * 我们的数据仍是内嵌形状（item.settings / content.settings），所以在这里做一次投影：
 * 所有消费方（内容设置工作区、模板预览）都调用本函数，设置只有一种读法，
 * 避免两套解释继续漂移。
 */
import type {
  PerformancePromptValue,
  PerformanceTemplateContent,
  PerformanceTemplateContentItem,
  PerformanceWorkflowNode,
} from '@/api/performance'

export type ResolvedViewType = 'edit' | 'hide'
export type ResolvedPermission = 'read' | 'write'

/** 一条「渲染指令」：对应飞书 entrySetting + permission 两张表查到的一行 */
export interface ResolvedFieldSettings {
  /** 对应 entrySetting.viewType：hide 表示整条不渲染 */
  viewType: ResolvedViewType
  /** 对应 permission.mode：read 表示照常渲染但不可写 */
  permission: ResolvedPermission
  required: boolean
  allowMultiple: boolean
  hideName: boolean
  hideDescription: boolean
  /** 对应 subField.description → 编辑器 data-placeholder */
  placeholder: string
  levelRulesEnabled: boolean
  allowView: boolean
}

export interface FieldSettingsContext {
  node?: PerformanceWorkflowNode | null
  content: PerformanceTemplateContent
  item: PerformanceTemplateContentItem
  /**
   * 环节级只读覆盖（例如预览里的「查看绩效结果」「绩效校准」环节）。
   * 只影响这一次渲染，不改变内容本身的声明。
   */
  readonly?: boolean
}

/** 只读环节：内容仍按模板渲染，但整环节不可写（飞书 permission.mode = read） */
export const READONLY_NODE_TYPES = ['result_view', 'reviewer_360_invite', 'result_reconsideration'] as const

export function isNodeReadonly(node?: PerformanceWorkflowNode | null): boolean {
  return Boolean(node && (READONLY_NODE_TYPES as readonly string[]).includes(node.node_type))
}

/** 校准环节在 item.settings 上追加的开关，类型声明里没有，单独收口 */
type ItemSettingsInput = PerformanceTemplateContentItem['settings'] & { allowModify?: boolean }

export function resolveFieldSettings({ node, content, item, readonly = false }: FieldSettingsContext): ResolvedFieldSettings {
  const itemSettings = (item.settings || {}) as ItemSettingsInput
  const contentSettings = content.settings || {}

  /* 隐藏优先：飞书 entrySetting.viewType=hide 时该条目在环节里根本不出现 */
  const viewType: ResolvedViewType = itemSettings.mode === 'hidden' ? 'hide' : 'edit'

  /* 只读判定：飞书没有 view 态，只读 = 可渲染但不可写（permission.mode=read） */
  const locked = readonly
    || isNodeReadonly(node)
    || content.content_slot === 'view'
    || itemSettings.mode === 'view'
    || itemSettings.allowModify === false
  const permission: ResolvedPermission = locked ? 'read' : 'write'

  return {
    viewType,
    permission,
    required: itemSettings.required ?? contentSettings.required ?? false,
    allowMultiple: contentSettings.allowMultiple === true || itemSettings.allowMultiple === true,
    hideName: itemSettings.hideName === true,
    hideDescription: itemSettings.hideDescription === true || contentSettings.hideDescription === true,
    placeholder: (item.hint || '').trim() || (content.description || '').trim(),
    levelRulesEnabled: itemSettings.levelRulesEnabled === true,
    allowView: itemSettings.allowView !== false,
  }
}

/** 该条目是否进入渲染（hide 的整条跳过） */
export function isFieldRendered(settings: ResolvedFieldSettings): boolean {
  return settings.viewType === 'edit'
}

/** 该条目是否可写（渲染 + 可写 = 真实控件；否则走只读答案渲染） */
export function isFieldWritable(settings: ResolvedFieldSettings): boolean {
  return settings.viewType === 'edit' && settings.permission === 'write'
}

/**
 * 说明块（prompt）的可见性：allowView=false 整块不展示；
 * onlyWhenFilling 只在填写场景展示（与填写页一致）。
 */
export function isPromptVisible(prompt: PerformancePromptValue | undefined | null, options: { filling?: boolean } = {}): boolean {
  if (!prompt) return false
  if (prompt.allowView === false) return false
  if (prompt.onlyWhenFilling && options.filling === false) return false
  return true
}
