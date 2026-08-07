import { describe, expect, it } from 'vitest'
import { formatReportValue } from './reportNumberFormat'

describe('formatReportValue', () => {
  it('uses the fixed default format', () => {
    expect(formatReportValue('0.125')).toBe('0.13')
    expect(formatReportValue('1234567.891234')).toBe('1,234,567.89')
  })

  it('formats number units and precision', () => {
    expect(formatReportValue('1234567.891234', {
      type: 'number', precision: 3, unit: 'ten_thousand', thousands_separator: true, rounding_rule: 'half_up',
    })).toBe('123.457 万')
  })

  it('formats percentages as value times 100', () => {
    expect(formatReportValue('0.125', { type: 'percent', precision: 2, rounding_rule: 'half_up' })).toBe('12.50%')
  })

  it('supports ceiling and floor for positive and negative values', () => {
    expect(formatReportValue('1.231', { type: 'number', precision: 2, unit: 'none', thousands_separator: false, rounding_rule: 'ceil' })).toBe('1.24')
    expect(formatReportValue('1.239', { type: 'number', precision: 2, unit: 'none', thousands_separator: false, rounding_rule: 'floor' })).toBe('1.23')
    expect(formatReportValue('-1.231', { type: 'number', precision: 2, unit: 'none', thousands_separator: false, rounding_rule: 'ceil' })).toBe('-1.23')
    expect(formatReportValue('-1.231', { type: 'number', precision: 2, unit: 'none', thousands_separator: false, rounding_rule: 'floor' })).toBe('-1.24')
  })
})
