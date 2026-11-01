import { effectScope, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readPerformanceSplitOffset, savePerformanceSplitOffset, usePerformanceWriteMode } from './usePerformanceWriteMode'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())
describe('performance write mode preferences', () => {
  it.each([null, 'invalid', 'basicWriteMode', 'fullScreenMode'])('loads only a valid mode: %s', stored => {
    if (stored) localStorage.setItem('userMode', stored)
    const scope = effectScope()
    const result = scope.run(usePerformanceWriteMode)!
    expect(result.mode.value).toBe(stored === 'fullScreenMode' ? 'fullScreenMode' : 'basicWriteMode')
    scope.stop()
  })
  it('persists a selected mode without writing business data', async () => {
    const scope = effectScope()
    const result = scope.run(usePerformanceWriteMode)!
    result.mode.value = 'fullScreenMode'
    await nextTick()
    expect(localStorage.getItem('userMode')).toBe('fullScreenMode')
    expect(localStorage.length).toBe(1)
    scope.stop()
  })
  it.each(['bad', 'Infinity', '', ' '])('falls back for invalid offsets: %s', stored => {
    localStorage.setItem('draggableContainerOffset', stored)
    expect(readPerformanceSplitOffset()).toBe(-3)
  })
  it('tolerates unavailable storage while preserving in-memory mode', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    const scope = effectScope()
    const result = scope.run(usePerformanceWriteMode)!
    expect(readPerformanceSplitOffset()).toBe(-3)
    expect(() => savePerformanceSplitOffset(20)).not.toThrow()
    result.mode.value = 'fullScreenMode'
    await nextTick()
    expect(result.mode.value).toBe('fullScreenMode')
    scope.stop()
  })
})
