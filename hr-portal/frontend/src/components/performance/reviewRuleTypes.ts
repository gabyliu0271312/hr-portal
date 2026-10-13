export type ReviewRuleMethod = 'rating' | 'score' | 'score_mapping'

export const REVIEW_RULE_METHOD_LABELS: Record<ReviewRuleMethod, string> = {
  rating: '评级',
  score: '评分',
  score_mapping: '评分映射等级型',
}

export interface ReviewRule {
  id: string
  name: string
  method: ReviewRuleMethod
  creator: string
  creatorAvatar?: string
  createdAt: string
  remark: string
  deletable?: boolean
  isUsed?: boolean
}
