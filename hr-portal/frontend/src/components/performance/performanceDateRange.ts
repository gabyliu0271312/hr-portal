export type PanelMode = 'date' | 'month' | 'year'
export type DateCell = { key: string; date: string; day: number; out: boolean }
export type MonthView = { key: string; year: number; month: number; cells: DateCell[] }
export type RangeBand = '' | 'start' | 'middle' | 'end'

export const YEAR_BLOCK_SIZE = 20

const pad = (value: number) => String(value).padStart(2, '0')

export function toDateString(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

export function parseDateString(value: string | null | undefined): { year: number; month: number; day: number } | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  return { year, month: month - 1, day }
}

export function displayDate(value: string): string {
  return value ? value.replace(/-/g, '/') : ''
}

export function buildMonthView(year: number, month: number): MonthView {
  const monthDate = new Date(year, month, 1)
  const resolvedYear = monthDate.getFullYear()
  const resolvedMonth = monthDate.getMonth()
  const startWeekday = monthDate.getDay()
  const cells: DateCell[] = []
  for (let index = 0; index < 42; index += 1) {
    const date = new Date(resolvedYear, resolvedMonth, index - startWeekday + 1)
    const day = date.getDate()
    cells.push({
      key: `${date.getFullYear()}-${date.getMonth()}-${day}`,
      date: toDateString(date.getFullYear(), date.getMonth(), day),
      day,
      out: date.getMonth() !== resolvedMonth,
    })
  }
  return { key: `${resolvedYear}-${resolvedMonth}`, year: resolvedYear, month: resolvedMonth + 1, cells }
}

export function rangeBand(date: string, start: string, end: string, hover: string | null): RangeBand {
  if (!start) return ''
  const other = end || (hover && hover !== start ? hover : '')
  if (!other) return ''
  const low = start < other ? start : other
  const high = start < other ? other : start
  if (date < low || date > high || low === high) return ''
  if (date === low) return 'start'
  if (date === high) return 'end'
  return 'middle'
}

export function yearBlockStart(year: number): number {
  return Math.floor(year / YEAR_BLOCK_SIZE) * YEAR_BLOCK_SIZE
}
