import { describe, expect, it } from 'vitest'
import { formatDateTime, formatDisplayDateTime, shanghaiLocalToUtcIso, utcToShanghaiLocal } from './datetime'
import { formatDisplayDateTime as formatJsDisplayDateTime } from './datetime.js'

it.each([formatDisplayDateTime, formatJsDisplayDateTime])('formats business timestamps without changing log precision', format => {
  for (const value of [
    '2022-12-06T10:06:59.123456Z',
    '2022-12-06T18:06:59+08:00',
    '2022-12-06T10:06:59',
    '2022-12-06 18:06:59',
    '2022-12-06 18:06',
    new Date('2022-12-06T10:06:59Z'),
    Date.parse('2022-12-06T10:06:59Z'),
  ]) expect(format(value)).toBe('2022-12-06 18:06')
  expect(format('2022-12-31T16:01:59Z')).toBe('2023-01-01 00:01')
  expect(format('2022-12-06T10:06:59.999Z')).toBe('2022-12-06 18:06')
  for (const value of [null, undefined, '', 'invalid', new Date('invalid')]) expect(format(value)).toBe('—')
  expect(format(null, '--')).toBe('--')
  expect(formatDateTime('2022-12-06T10:06:59Z')).toContain('18:06:59')
})

describe('performance cycle datetime helpers', () => {
  it('treats datetime-local input as Asia/Shanghai wall time', () => {
    expect(shanghaiLocalToUtcIso('2026-01-01T09:00')).toBe('2026-01-01T01:00:00.000Z')
  })

  it('returns Beijing wall time for UTC input', () => {
    expect(utcToShanghaiLocal('2026-01-01T01:00:00.000Z')).toBe('2026-01-01T09:00')
  })
})
