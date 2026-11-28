import { computed, ref, type Ref } from 'vue'
import type { PerformanceFilterValues } from '@/components/performance/performanceFilterTypes'

function cloneValues<T extends PerformanceFilterValues>(values: T): T {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, [...value]])) as T
}

export function usePerformanceFilterDraft<T extends PerformanceFilterValues>(initial: () => T) {
  const applied = ref(cloneValues(initial())) as Ref<T>
  const draft = ref(cloneValues(initial())) as Ref<T>
  const activeCount = computed(() => Object.values(applied.value).filter(value => value.length > 0).length)

  function open() { draft.value = cloneValues(applied.value) }
  function confirm() { applied.value = cloneValues(draft.value) }
  function cancel() { draft.value = cloneValues(applied.value) }
  function clear() { draft.value = cloneValues(initial()) }
  function reset() {
    applied.value = cloneValues(initial())
    draft.value = cloneValues(initial())
  }

  return { applied, draft, activeCount, open, confirm, cancel, clear, reset }
}
