import { api } from './client'

// 接收人规则（discriminated union，与后端 ReceiverRule 一致）
export interface FixedUsersRule {
  type: 'fixed_users'
  user_ids: number[]
}

export interface FixedChatsRule {
  type: 'fixed_chats'
  chat_ids: string[]
}

export interface EmployeeFieldUserRule {
  type: 'employee_field_user'
  source_table?: string
  employee_key_field?: string
  target_field: string
  resolve_mode?: 'user_mapping'
}

export interface EmployeeDepartmentManagerRule {
  type: 'employee_department_manager'
  source_table?: string
  employee_key_field?: string
  department_field: string
  manager_source?: 'org_tree'
}

export type ReceiverRule =
  | FixedUsersRule
  | FixedChatsRule
  | EmployeeFieldUserRule
  | EmployeeDepartmentManagerRule

// 消息配置（与后端 MessageConfig 一致）
export interface MessageConfig {
  message_format: 'text' | 'markdown'
  title_template: string
  content_template: string
  resources: Array<{
    type: 'system_page' | 'feishu_doc' | 'external_url'
    title: string
    url_template: string
  }>
}

// 卡片按钮配置（与后端 CardButtonConfig 一致）
export interface CardButtonConfig {
  enabled: boolean
  text: string
  url: string
}

// 通知配置（与后端 NotificationConfig 一致）
export interface NotificationConfig {
  enabled: boolean
  receivers: ReceiverRule[]
  message: MessageConfig
  require_completion: boolean
  card_button?: CardButtonConfig
}

export interface FeishuChatTarget {
  id: number
  chat_id: string
  name: string
  description: string | null
}

export interface NotificationLog {
  id: number
  receiver_type: string
  receiver_id: string
  receiver_name: string | null
  status: string
  error_message: string | null
  message_content: string | null
  created_at: string
}

export interface CompletionRecord {
  id: number
  notification_log_id: number
  open_id: string
  display_name: string | null
  biz_type: string | null
  biz_id: string | null
  status: string
  completed_at: string
}

export const feishuApi = {
  // 获取飞书群列表
  listChatTargets: () =>
    api.get<FeishuChatTarget[]>('/feishu/chat-targets').then((r) => r.data),

  // 解析接收人（预览）
  resolveReceivers: (data: { config: NotificationConfig; context?: Record<string, any> }) =>
    api
      .post<{ ok: boolean; receivers: any[]; errors: any[] }>(
        '/feishu/notifications/resolve',
        data
      )
      .then((r) => r.data),

  // 预览消息
  previewMessage: (data: { message: MessageConfig; context: Record<string, any> }) =>
    api
      .post<{
        rendered_title: string
        rendered_content: string
        missing_variables: string[]
      }>('/feishu/notifications/message-preview', data)
      .then((r) => r.data),

  // 测试发送
  testSend: (data: { config: NotificationConfig; context?: Record<string, any> }) =>
    api
      .post<{
        ok: boolean
        status: string
        success_count: number
        failed_count: number
        errors: string[]
      }>('/feishu/notifications/test', data)
      .then((r) => r.data),

  // 获取发送日志
  getLogs: (params?: { rule_id?: number; limit?: number }) =>
    api.get<NotificationLog[]>('/feishu/notifications/logs', { params }).then((r) => r.data),

  // 获取标记完成记录
  getCompletions: (params?: {
    biz_type?: string
    biz_id?: string
    notification_log_id?: number
  }) =>
    api.get<{ items: CompletionRecord[]; total: number }>(
      '/feishu/notifications/completions',
      { params }
    ).then((r) => r.data),
}
