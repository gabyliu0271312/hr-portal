export const FIXED_SCORE_MAX = 1_000_000_000_000_000

export type FixedScoreError = 'required' | 'decimal' | 'max' | 'duplicate'

const fixedScorePattern = /^-?\d+(\.\d{0,2})?$/

export function getFixedScoreError(value: string, options: Array<{ value: string }>, index: number): FixedScoreError | undefined {
  const normalized = value.trim()
  if (!normalized) return 'required'
  if (!fixedScorePattern.test(normalized)) return 'decimal'

  const numericValue = Number(normalized)
  if (!Number.isFinite(numericValue)) return 'decimal'
  if (numericValue > FIXED_SCORE_MAX) return 'max'
  if (options.some((option, optionIndex) => optionIndex !== index && option.value.trim() && Number(option.value) === numericValue)) return 'duplicate'
  return undefined
}

export function getFixedScoreErrors(options: Array<{ value: string }>): Array<FixedScoreError | undefined> {
  return options.map((option, index) => getFixedScoreError(option.value, options, index))
}

export function fixedScoreErrorMessage(error?: FixedScoreError) {
  if (error === 'required') return '此项为必填'
  if (error === 'max') return '不可超过 1,000,000,000,000,000'
  if (error === 'duplicate') return '分值重复'
  if (error === 'decimal') return '最多支持2位小数'
  return ''
}
