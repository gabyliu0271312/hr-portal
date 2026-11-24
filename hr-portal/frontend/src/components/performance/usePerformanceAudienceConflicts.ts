import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { performanceProjectApi, type PerformanceEvaluatorPreviewPayload } from '@/api/performance'

export function usePerformanceAudienceConflicts(context: () => { cycleId: number; payload: PerformanceEvaluatorPreviewPayload } | null) {
  const total = ref(0)
  const loading = ref(false)
  const removing = ref(false)
  const error = ref('')
  const key = computed(() => JSON.stringify(context()))
  let revision = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: { key: string; promise: Promise<boolean> } | undefined
  let disposed = false

  async function check() {
    if (timer) clearTimeout(timer)
    const current = context()
    if (!current) return false
    const requestedKey = key.value
    if (pending?.key === requestedKey) return pending.promise
    const request = ++revision
    loading.value = true
    error.value = ''
    timer = undefined
    const promise = (async () => {
      try {
        const result = await performanceProjectApi.evaluatorConflicts(current.cycleId, JSON.parse(JSON.stringify(current.payload)))
        if (disposed || request !== revision || requestedKey !== key.value) return false
        total.value = result.total
        return result.total === 0
      } catch {
        if (!disposed && request === revision && requestedKey === key.value) error.value = '重复人员检查失败，请重试'
        return false
      } finally {
        if (!disposed && request === revision) { loading.value = false; pending = undefined }
      }
    })()
    pending = { key: requestedKey, promise }
    return promise
  }

  watch(key, () => {
    ++revision
    pending = undefined
    if (timer) clearTimeout(timer)
    total.value = 0
    error.value = ''
    loading.value = Boolean(context())
    if (context()) timer = setTimeout(() => { void check() }, 200)
  }, { immediate: true, flush: 'sync' })

  async function exclude() {
    const current = context()
    if (!current || removing.value || loading.value) return null
    const requestedKey = key.value
    removing.value = true
    error.value = ''
    try {
      const result = await performanceProjectApi.excludeEvaluatorConflicts(current.cycleId, JSON.parse(JSON.stringify(current.payload)))
      return !disposed && requestedKey === key.value ? result : null
    } catch {
      if (!disposed && requestedKey === key.value) error.value = '移除重复人员失败，请重试'
      return null
    } finally { if (!disposed) removing.value = false }
  }

  onBeforeUnmount(() => { disposed = true; ++revision; if (timer) clearTimeout(timer) })
  return { total, loading, removing, error, check, exclude }
}
