import { onBeforeUnmount, ref, watch } from 'vue'
import { performanceProjectApi, type PerformanceEvaluatorOptions } from '@/api/performance'

export function usePerformanceSnapshotOptions(props: { cycleId?: number | null; disabled?: boolean }, externallyProvided: () => boolean) {
  const options = ref<PerformanceEvaluatorOptions>()
  const loading = ref(false)
  const error = ref('')
  let requestId = 0

  function reset() {
    requestId += 1
    options.value = undefined
    loading.value = false
    error.value = ''
  }
  watch(() => [props.cycleId, externallyProvided()], reset)
  onBeforeUnmount(reset)

  async function load() {
    if (props.disabled || externallyProvided() || loading.value || options.value) return
    if (!props.cycleId) { error.value = '请选择绩效周期'; return }
    const id = ++requestId
    const cycleId = props.cycleId
    loading.value = true
    error.value = ''
    try {
      const result = await performanceProjectApi.listEvaluatorOptions(cycleId)
      if (id === requestId) options.value = result
    } catch (cause: any) {
      if (id === requestId) error.value = cause?.response?.data?.detail || '快照选项加载失败，请重试'
    } finally {
      if (id === requestId) loading.value = false
    }
  }

  return { options, loading, error, load }
}
