// 催办页不展示「授权他人处理 / 转交他人处理」的环节：被评估人本人（工作总结、
// 执行人为被评估人的评估环节）、360°评估人、绩效校准。与后端
// `_REMINDER_DELEGATION_HIDDEN_NODE_KEYS` 保持一致。
export const REMINDER_DELEGATION_HIDDEN_NODE_KEYS = new Set(['work-summary', 'self-review', 'review-360', 'calibration'])
