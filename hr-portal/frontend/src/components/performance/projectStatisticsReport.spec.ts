import { describe, expect, it } from 'vitest'
import { mockProjectReportProvider, reportPercent, reportTotal } from './projectStatisticsReport'

describe('project statistics mock provider', () => {
  it('returns explicit, internally consistent synthetic data', async () => {
    const report = await mockProjectReportProvider({ cycleId: 1 })
    expect(report.source).toBe('mock')
    expect(report.ratings.map(item => item.label)).toEqual(['1星', '2星', '3星-', '3星', '3星+', '4星', '5星'])
    expect(reportTotal(report.distribution)).toBe(120)
    expect(report.totalParticipants).toBe(124)
    for (const rating of report.ratings) {
      expect(report.distribution[rating.key]).toBe(report.departments.reduce((sum, row) => sum + row.counts[rating.key], 0))
      const parent = report.departments[0]
      expect(parent.counts[rating.key]).toBe(parent.children!.reduce((sum, row) => sum + row.counts[rating.key], 0))
    }
    expect(report.departments.every(row => row.name.startsWith('示例'))).toBe(true)
  })

  it('provides fresh data and handles zero denominators', async () => {
    const first = await mockProjectReportProvider({ cycleId: 1 })
    first.distribution['rating-3'] = 999
    const second = await mockProjectReportProvider({ cycleId: 2 })
    expect(second.distribution['rating-3']).toBe(47)
    expect(reportPercent(47, 120)).toBe('39.2')
    expect(reportPercent(0, 0)).toBe('0.0')
    expect(reportTotal({})).toBe(0)
  })
})
