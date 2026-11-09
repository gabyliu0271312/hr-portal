import { computed, ref, shallowRef } from 'vue'
import { projectManagementApi } from '@/api/performance'

type Options = NonNullable<Parameters<typeof projectManagementApi.authorizeTask>[5]>
export type DelegationRequest = { project_id: number; task_id: number; action: 'AUTHORIZE' | 'TRANSFER'; recipient: string; options: Options; taskLabel?: string; recipientLabel?: string }
type Result = Awaited<ReturnType<typeof projectManagementApi.authorizeTask>>
type Entry = { request: DelegationRequest; result?: Result }

export function useTaskDelegationRequests(completed: (count: number, notification: string, id?: number, skippedCount?: number) => void, refresh: () => void) {
  const entries = new Map<string, Entry>()
  const pending = shallowRef<Entry[]>([])
  const saving = ref(false), message = ref('')
  const retrySummary = computed(() => [...new Set(pending.value.map(entry => entry.request.recipient))].join('、'))
  function fingerprint(request: DelegationRequest) { return JSON.stringify([request.project_id, request.task_id, request.action, request.recipient, request.options]) }
  function isUncertain(requests: DelegationRequest[]) {
    return requests.length > 0 && requests.every(request => pending.value.some(entry => fingerprint(request) === fingerprint({ ...entry.request, options: { ...entry.request.options, idempotency_key: undefined } })))
  }
  async function execute(batch: Entry[]) {
    if (saving.value) return
    saving.value = true
    try {
      for (const entry of batch) {
        if (entry.result) continue
        const request = entry.request
        entry.result = await projectManagementApi.authorizeTask(request.project_id, request.task_id, request.action, request.recipient, '', request.options)
      }
      const successful = batch.filter(entry => !entry.result?.skipped), skipped = batch.length - successful.length
      pending.value = pending.value.filter(entry => !batch.includes(entry)); message.value = `已处理 ${successful.length} 项，跳过 ${skipped} 项`
      completed(successful.length, successful.at(-1)?.result?.notification_status || '', successful[0]?.result?.id, skipped)
    } catch {
      pending.value = [...new Map([...pending.value, ...batch].map(entry => [fingerprint(entry.request), entry])).values()]
      const done = batch.filter(entry => entry.result && !entry.result.skipped).length, skipped = batch.filter(entry => entry.result?.skipped).length
      message.value = `已处理 ${done} 项，跳过 ${skipped} 项，其余结果未确认。可显式重试未确认项（接收人工号：${retrySummary.value}），将沿用原请求与请求键；关闭或刷新名单不会自动提交。刷新浏览器后无法恢复。`
      refresh()
    } finally { saving.value = false }
  }
  function submit(requests: DelegationRequest[]) {
    const batch = requests.map(request => {
      const fingerprintKey = fingerprint(request)
      let entry = entries.get(fingerprintKey)
      if (!entry) {
        const key = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
        entry = { request: { ...request, options: JSON.parse(JSON.stringify({ ...request.options, idempotency_key: key })) } }
        entries.set(fingerprintKey, entry)
      }
      return entry
    })
    return execute(batch)
  }
  return { saving, message, pending, isUncertain, submit, retry: () => execute(pending.value) }
}
