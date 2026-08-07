export type DisplayFormatType = 'default' | 'number' | 'percent'
export type DisplayRoundingRule = 'half_up' | 'ceil' | 'floor'
export type DisplayUnit = 'none' | 'thousand' | 'ten_thousand' | 'million' | 'ten_million' | 'hundred_million' | 'K' | 'M'

export interface DisplayFormat {
  type: DisplayFormatType
  precision?: number
  unit?: DisplayUnit
  thousands_separator?: boolean
  rounding_rule?: DisplayRoundingRule
}

export const DEFAULT_DISPLAY_FORMAT: Required<Pick<DisplayFormat, 'type' | 'precision' | 'thousands_separator' | 'rounding_rule'>> = {
  type: 'default',
  precision: 2,
  thousands_separator: true,
  rounding_rule: 'half_up',
}

const UNIT_DIVISORS: Record<DisplayUnit, number> = {
  none: 1,
  thousand: 1_000,
  ten_thousand: 10_000,
  million: 1_000_000,
  ten_million: 10_000_000,
  hundred_million: 100_000_000,
  K: 1_000,
  M: 1_000_000,
}

export const DISPLAY_UNIT_LABELS: Record<DisplayUnit, string> = {
  none: '无',
  thousand: '千',
  ten_thousand: '万',
  million: '百万',
  ten_million: '千万',
  hundred_million: '亿',
  K: 'K',
  M: 'M',
}

function decimalParts(raw: string) {
  let value = raw.trim()
  let sign = ''
  if (value.startsWith('-') || value.startsWith('+')) {
    sign = value[0] === '-' ? '-' : ''
    value = value.slice(1)
  }
  const [integer = '0', fraction = ''] = value.split('.')
  return { sign, integer: integer.replace(/^0+(?=\d)/, '') || '0', fraction }
}

function addStrings(a: string, b: string): string {
  const scale = Math.max(a.length, b.length)
  let carry = 0
  let out = ''
  for (let i = 1; i <= scale; i += 1) {
    const sum = Number(a.at(-i) || 0) + Number(b.at(-i) || 0) + carry
    out = `${sum % 10}${out}`
    carry = Math.floor(sum / 10)
  }
  return `${carry ? '1' : ''}${out}`
}

function roundDecimal(raw: string, precision: number, rule: DisplayRoundingRule): string {
  const { sign, integer, fraction } = decimalParts(raw)
  const negative = sign === '-'
  const kept = fraction.padEnd(precision, '0').slice(0, precision)
  const discarded = fraction.slice(precision)
  let increment = false
  if (rule === 'half_up') increment = discarded[0] >= '5'
  if (rule === 'ceil') increment = !negative && /[1-9]/.test(discarded)
  if (rule === 'floor') increment = negative && /[1-9]/.test(discarded)
  let whole = integer
  let fractionOut = kept
  if (increment) {
    const unit = precision ? `0.${'0'.repeat(precision - 1)}1` : '1'
    if (precision) {
      const next = addStrings(kept || '0', unit.split('.')[1]!)
      if (next.length > precision) {
        whole = addStrings(whole, '1')
        fractionOut = '0'.repeat(precision)
      } else fractionOut = next.padStart(precision, '0')
    } else whole = addStrings(whole, '1')
  }
  return `${negative ? '-' : ''}${whole}${precision ? `.${fractionOut}` : ''}`
}

function formatGrouped(raw: string, useThousands: boolean): string {
  const { sign, integer, fraction } = decimalParts(raw)
  const grouped = useThousands ? integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : integer
  return `${sign}${grouped}${fraction ? `.${fraction}` : ''}`
}

function scaleDecimal(value: string, divisor: number, multiplier = 1): string {
  const { sign, integer, fraction } = decimalParts(value)
  const scale = fraction.length
  const divisorZeros = String(divisor).length - 1
  const rawDigits = BigInt(`${integer}${fraction}` || '0') * BigInt(multiplier)
  const outputScale = scale + divisorZeros
  const digitsOut = rawDigits.toString().padStart(outputScale + 1, '0')
  const cut = digitsOut.length - outputScale
  const whole = digitsOut.slice(0, cut) || '0'
  const decimals = outputScale > 0 ? digitsOut.slice(cut).replace(/0+$/, '') : ''
  return `${sign}${whole}${decimals ? `.${decimals}` : ''}`
}

export function resolveDisplayFormat(format?: DisplayFormat | null): Required<DisplayFormat> {
  if (!format || format.type === 'default') return { ...DEFAULT_DISPLAY_FORMAT, type: 'default', unit: 'none' }
  return {
    type: format.type,
    precision: Math.min(6, Math.max(0, Number.isInteger(format.precision) ? format.precision! : 2)),
    unit: format.type === 'number' ? (format.unit || 'none') : 'none',
    thousands_separator: format.type === 'number' ? format.thousands_separator !== false : false,
    rounding_rule: format.rounding_rule || 'half_up',
  }
}

export function formatReportValue(value: unknown, format?: DisplayFormat | null): string {
  if (value === null || value === undefined || value === '') return '0'
  const raw = String(value).replace(/,/g, '').trim()
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(raw)) return String(value)
  const resolved = resolveDisplayFormat(format)
  const scaled = resolved.type === 'percent'
    ? scaleDecimal(raw, 1, 100)
    : scaleDecimal(raw, UNIT_DIVISORS[resolved.unit])
  const rounded = roundDecimal(scaled, resolved.precision, resolved.rounding_rule)
  const grouped = formatGrouped(rounded, resolved.type === 'default' ? true : resolved.thousands_separator)
  if (resolved.type === 'percent') return `${grouped}%`
  const suffix = resolved.type === 'number' && resolved.unit !== 'none' ? DISPLAY_UNIT_LABELS[resolved.unit] : ''
  return suffix ? `${grouped} ${suffix}` : grouped
}