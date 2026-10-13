import { computed, nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { isAxiosError } from 'axios'
import { ElMessage } from 'element-plus'
import { performanceMetricFieldsApi } from '@/api/performanceMetricFields'
import { performanceMetricTypesApi, type PerformanceMetricTypeDraft } from '@/api/performanceMetricTypes'
import { formatDateTime } from '@/utils/datetime'

export function usePerformanceMetricTypes(enabled: Ref<boolean>) {
  const types = ref<Awaited<ReturnType<typeof performanceMetricTypesApi.list>>['items']>([])
  const fieldOptions = ref<Awaited<ReturnType<typeof performanceMetricFieldsApi.list>>['items']>([])
  const keyword = ref('')
  const page = ref(1)
  const pageSize = ref(10)
  const total = ref(0)
  const loading = ref(false)
  const loadError = ref('')
  const canCreate = ref(false)
  const createOpen = ref(false)
  const editing = ref<PerformanceMetricTypeDraft | null>(null)
  const saving = ref(false)
  const saveError = ref('')
  let requestId = 0

  const rows = computed(() => types.value.map(type => ({
    id: type.id,
    name: type.name,
    fields: type.fields,
    fieldIds: type.field_ids,
    updatedBy: type.updated_by,
    updatedAt: formatDateTime(type.updated_at, '--'),
  })))

  async function load(saved = false) {
    if (!enabled.value) return
    const current = ++requestId
    loading.value = true
    loadError.value = ''
    canCreate.value = false
    try {
      const [typeResult, fieldResult] = await Promise.all([
        performanceMetricTypesApi.list({ keyword: keyword.value.trim(), offset: (page.value - 1) * pageSize.value, limit: pageSize.value }),
        performanceMetricFieldsApi.list({ keyword: '', offset: 0, limit: 100 }),
      ])
      if (current !== requestId) return
      types.value = typeResult.items
      total.value = typeResult.total
      fieldOptions.value = fieldResult.items
      canCreate.value = true
    } catch (error) {
      if (current !== requestId) return
      total.value = 0
      loadError.value = isAxiosError(error) && error.response?.status === 403
        ? '无权限管理指标类型'
        : saved ? '指标类型已保存，列表加载失败，请重试' : '指标类型加载失败，请重试'
    } finally {
      if (current === requestId) loading.value = false
    }
  }

  function openCreate() {
    if (!canCreate.value || saving.value) return
    saveError.value = ''
    editing.value = null
    createOpen.value = true
  }

  function openEdit(row: { id: number; name: string; fieldIds?: number[] }) {
    if (!canCreate.value || saving.value) return
    saveError.value = ''
    editing.value = { id: row.id, name: row.name, field_ids: row.fieldIds || [] }
    createOpen.value = true
  }

  async function save(value: PerformanceMetricTypeDraft) {
    if (saving.value || !canCreate.value) return
    saving.value = true
    saveError.value = ''
    let saved = false
    try {
      const payload = { name: value.name.trim(), field_ids: value.field_ids }
      if (value.id) await performanceMetricTypesApi.update(value.id, payload)
      else await performanceMetricTypesApi.create(payload)
      saved = true
      createOpen.value = false
      editing.value = null
      keyword.value = ''
      page.value = 1
      ElMessage.success(value.id ? '指标类型已更新' : '指标类型已创建')
      await nextTick()
    } catch (error) {
      const status = isAxiosError(error) ? error.response?.status : undefined
      saveError.value = status === 409 ? '该指标类型名称已存在，请重新输入'
        : status === 403 ? '无权限管理指标类型'
          : status === 422 ? '指标类型内容不符合要求，请检查名称和指标字段' : '指标类型保存失败，请重试'
      if (status === 403) canCreate.value = false
    } finally {
      saving.value = false
    }
    if (saved) await load(true)
  }

  watch(keyword, () => { page.value = 1 })
  watch(pageSize, () => { page.value = 1 })
  watch([enabled, keyword, page, pageSize], () => {
    if (!enabled.value) {
      requestId++
      loading.value = false
      canCreate.value = false
      types.value = []
      fieldOptions.value = []
      if (!saving.value) createOpen.value = false
    } else if (!saving.value) void load()
  }, { immediate: true })
  onBeforeUnmount(() => { requestId++ })

  return { rows, fieldOptions, keyword, page, pageSize, total, loading, loadError, canCreate, createOpen, editing, saving, saveError, load, openCreate, openEdit, save }
}
