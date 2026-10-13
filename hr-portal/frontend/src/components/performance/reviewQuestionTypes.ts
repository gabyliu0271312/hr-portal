export type QuestionType = 'regular' | 'okr' | 'bonus' | 'deduction'

export const QUESTION_TYPE_OPTIONS: { key: QuestionType; label: string }[] = [
  { key: 'regular', label: '常规评估项' },
  { key: 'okr', label: 'OKR 评估项' },
  { key: 'bonus', label: '加分项' },
  { key: 'deduction', label: '减分项' },
]

export function questionTypeLabel(type: string): string {
  return QUESTION_TYPE_OPTIONS.find((item) => item.key === type)?.label ?? type
}

export interface ReviewQuestion {
  id: string
  name: string
  type: string
  creator?: string
  creatorAvatar?: string
  createdAt: string
  remark: string
  rule_id?: number
  is_sub_question?: boolean
  parent_question_id?: number | null
  display_mode?: '标签样式' | '下拉样式'
}

export interface ReviewQuestionForm {
  language: string
  name: string
  description: string
  type: string
  rule_id: number | null
  remark: string
}

export interface ReviewRuleOption {
  id: number
  name: string
  review_type: '评级' | '评分' | '评分映射等级型'
  status: 'active' | 'inactive'
  updated_at: string
  config_summary: Record<string, unknown>
}
