import { computed, nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { isAxiosError } from 'axios'
import { ElMessage } from 'element-plus'
import { performanceMetricFieldsApi, metricFieldTypeLabels, type MetricField, type MetricFieldDraft } from '@/api/performanceMetricFields'
import { formatDateTime } from '@/utils/datetime'

function errorCode(error: unknown) {
  if (!isAxiosError(error)) return undefined
  const detail = error.response?.data?.detail
  try { return (typeof detail === 'string' ? JSON.parse(detail) : detail)?.code } catch { return undefined }
}
function errorMessage(error: unknown, action: string) {
  const status = isAxiosError(error) ? error.response?.status : undefined
  const code = errorCode(error)
  if (status === 401) return '登录已失效，请重新登录'
  if (status === 403) return code === 'PERFORMANCE_METRIC_FIELD_SYSTEM_PROTECTED' ? '系统预置字段，不允许修改或删除' : `无权限${action}指标字段`
  if (status === 404) return '该字段不存在或已被删除，请刷新列表'
  if (status === 409) return code === 'PERFORMANCE_METRIC_FIELD_IN_USE' || action === '删除'
    ? `该字段已被指标类型使用，不允许${action === '删除' ? '删除' : '修改类型'}` : '该字段名称已存在，请重新输入'
  if (status === 422) return '字段内容不符合要求，请检查名称和类型'
  if (status === 502 || status === 503 || status === 504) return '服务暂不可用，请稍后重试'
  return action === '读取' ? '字段读取失败，请重试' : action === '删除' ? '字段删除失败，请重试' : '字段保存失败，请重试'
}

export function usePerformanceMetricFields(enabled: Ref<boolean>) {
  const fields = ref<MetricField[]>([])
  const keyword = ref('')
  const page = ref(1)
  const pageSize = ref(10)
  const total = ref(0)
  const loading = ref(false)
  const loadError = ref('')
  const canCreate = ref(false)
  const createOpen = ref(false)
  const saving = ref(false)
  const saveError = ref('')
  const editing = ref<(MetricField & MetricFieldDraft) | null>(null)
  const opening = ref(false)
  const actionError = ref('')
  const removing = ref<MetricField | null>(null)
  const deleteOpen = ref(false)
  const deleting = ref(false)
  const deleteError = ref('')
  const deleteBlocked = ref(false)
  const busy = computed(() => saving.value || deleting.value || opening.value)
  let requestId = 0
  let adjustingPage = false
  let mounted = true
  const rows = computed(() => fields.value.map(field => ({
    id: field.id, displayId: field.display_id ?? field.id, name: field.name,
    type: metricFieldTypeLabels[field.field_type] || field.field_type,
    isSystem: field.is_system, inUse: field.in_use,
    updatedBy: field.updated_by, updatedAt: field.is_system ? '' : formatDateTime(field.updated_at, '--'),
  })))

  async function load(saved = false, succeeded = '') {
    if (!enabled.value || !mounted) return
    const current = ++requestId
    loading.value = true
    loadError.value = ''
    fields.value = []
    canCreate.value = false
    try {
      let result = await performanceMetricFieldsApi.list({ keyword: keyword.value.trim(), offset: (page.value - 1) * pageSize.value, limit: pageSize.value })
      if (current !== requestId) return
      const lastPage = Math.max(1, Math.ceil(result.total / pageSize.value))
      const targetPage = saved ? lastPage : Math.min(page.value, lastPage)
      if (page.value !== targetPage) {
        adjustingPage = true
        page.value = targetPage
        await nextTick()
        adjustingPage = false
        if (current !== requestId) return
        result = await performanceMetricFieldsApi.list({ keyword: keyword.value.trim(), offset: (page.value - 1) * pageSize.value, limit: pageSize.value })
        if (current !== requestId) return
      }
      fields.value = result.items
      total.value = result.total
      canCreate.value = true
    } catch (error) {
      if (current !== requestId) return
      total.value = 0
      const prefix = succeeded || (saved ? '字段已保存' : '')
      loadError.value = isAxiosError(error) && error.response?.status === 403
        ? '无权限管理指标字段' : prefix ? `${prefix}，列表加载失败，请重试` : '指标字段加载失败，请重试'
    } finally {
      if (current === requestId) loading.value = false
    }
  }
  function openCreate() {
    if (!canCreate.value || busy.value || createOpen.value || deleteOpen.value) return
    editing.value = null
    saveError.value = ''
    actionError.value = ''
    createOpen.value = true
  }
  async function openEdit(id: number) {
    const field = fields.value.find(item => item.id === id)
    if (!field || field.is_system || !canCreate.value || busy.value || createOpen.value || deleteOpen.value) return
    const current = requestId
    opening.value = true
    actionError.value = ''
    try {
      const value = await performanceMetricFieldsApi.get(id)
      if (current !== requestId || !enabled.value || !mounted) return
      if (value.is_system || value.field_type === 'person') { actionError.value = '系统预置字段，不允许编辑'; return }
      editing.value = { ...value, field_type: value.field_type }
      saveError.value = ''
      createOpen.value = true
    } catch (error) {
      if (current === requestId && mounted) actionError.value = errorMessage(error, '读取')
    } finally { opening.value = false }
  }
  async function save(value: MetricFieldDraft) {
    if (busy.value || !canCreate.value) return
    saving.value = true
    saveError.value = ''
    const id = editing.value?.id
    let saved = false
    try {
      if (id !== undefined) await performanceMetricFieldsApi.update(id, value)
      else await performanceMetricFieldsApi.create(value)
      saved = true
      createOpen.value = false
      if (id === undefined) { keyword.value = ''; page.value = 1 }
      ElMessage.success(id === undefined ? '字段已创建' : '字段已更新')
      await nextTick()
    } catch (error) {
      saveError.value = errorMessage(error, id === undefined ? '新建' : '编辑')
      if (editing.value && errorCode(error) === 'PERFORMANCE_METRIC_FIELD_IN_USE') editing.value.in_use = true
      if (isAxiosError(error) && error.response?.status === 403) canCreate.value = false
    } finally { saving.value = false }
    if (saved) await load(id === undefined, id === undefined ? '字段已保存' : '字段已更新')
  }
  function openRemove(id: number) {
    const field = fields.value.find(item => item.id === id)
    if (!field || field.is_system || field.in_use || !canCreate.value || busy.value || createOpen.value || deleteOpen.value) return
    removing.value = field
    deleteError.value = ''
    deleteBlocked.value = false
    actionError.value = ''
    deleteOpen.value = true
  }
  async function remove() {
    if (!removing.value || !deleteOpen.value || busy.value || deleteBlocked.value || !canCreate.value) return
    deleting.value = true
    deleteError.value = ''
    let removed = false
    try {
      await performanceMetricFieldsApi.remove(removing.value.id)
      removed = true
      deleteOpen.value = false
      ElMessage.success('字段已删除')
    } catch (error) {
      deleteError.value = errorMessage(error, '删除')
      const status = isAxiosError(error) ? error.response?.status : undefined
      deleteBlocked.value = status === 403 || status === 404 || status === 409
    } finally { deleting.value = false }
    if (removed) await load(false, '字段已删除')
    else if (deleteBlocked.value) await load()
  }
  watch(keyword, () => { page.value = 1 })
  watch(pageSize, () => { page.value = 1 })
  watch([enabled, keyword, page, pageSize], () => {
    if (!enabled.value) {
      requestId++
      loading.value = false
      canCreate.value = false
      fields.value = []
      if (!busy.value) { createOpen.value = false; deleteOpen.value = false }
    } else if (!busy.value && !adjustingPage) void load()
  }, { immediate: true })
  onBeforeUnmount(() => { mounted = false; requestId++ })
  return { rows, keyword, page, pageSize, total, loading, loadError, canCreate, createOpen, saving, saveError, editing, opening, actionError, busy, removing, deleteOpen, deleting, deleteError, deleteBlocked, load, openCreate, openEdit, openRemove, save, remove }
}
