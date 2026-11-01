import { ref, watch } from 'vue'

export type PerformanceWriteMode = 'fullScreenMode' | 'basicWriteMode'
export const PERFORMANCE_SPLIT_MIN_WIDTH = 1061

export function readPerformanceSplitOffset() {
  try {
    const stored = localStorage.getItem('draggableContainerOffset')
    const value = stored === null || !stored.trim() ? NaN : Number(stored)
    return Number.isFinite(value) ? value : -3
  } catch { return -3 }
}

export function savePerformanceSplitOffset(value: number) {
  try { localStorage.setItem('draggableContainerOffset', String(value)) } catch {}
}

export function usePerformanceWriteMode() {
  let initial: PerformanceWriteMode = 'basicWriteMode'
  try {
    const stored = localStorage.getItem('userMode')
    if (stored === 'fullScreenMode' || stored === 'basicWriteMode') initial = stored
  } catch {}
  const mode = ref<PerformanceWriteMode>(initial)
  watch(mode, value => { try { localStorage.setItem('userMode', value) } catch {} })
  return { mode }
}
