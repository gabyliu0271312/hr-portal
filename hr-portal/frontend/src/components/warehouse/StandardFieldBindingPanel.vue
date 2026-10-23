<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PermissionButton from '@/components/PermissionButton.vue'
import { datasetsApi, type DatasetItem } from '@/api/datasets'
import { useUserStore } from '@/stores/user'
import { standardFieldsApi, type StandardFieldBindingCandidate, type StandardFieldBindingRef } from '@/api/standardFields'

const props = defineProps<{
  fieldId: number
  activeVersionId: number | null
  bindings: StandardFieldBindingRef[]
  datasetId?: number | null
  tableName?: string | null
}>()
const emit = defineEmits<{ changed: [] }>()
const userStore = useUserStore()
const canView = computed(() => userStore.menus.some(menu => menu.code === 'warehouse.standard_fields.catalog'))
const canUpdate = () => canView.value && userStore.hasOp('warehouse.standard_fields.catalog', 'U')
const rows = ref<StandardFieldBindingCandidate[]>([])
const datasets = ref<DatasetItem[]>([])
const tables = ref<{ table_name: string; label: string }[]>([])
const scopeKind = ref<'dataset' | 'table'>('dataset')
const selectedDataset = ref<number | undefined>()
const selectedTable = ref('')
const loading = ref(false)
const savingKey = ref('')
const error = ref('')
const scopeError = ref('')
const keyword = ref('')
const scope = computed(() => ({
  dataset_id: scopeKind.value === 'dataset' ? selectedDataset.value : undefined,
  table_name: scopeKind.value === 'table' ? selectedTable.value.trim() || undefined : undefined,
}))
const hasScope = computed(() => Boolean(scope.value.dataset_id || scope.value.table_name))
const revisionById = computed(() => new Map(props.bindings.map(binding => [binding.id, binding.binding_version])))
const visibleRows = computed(() => rows.value.filter(row => row.is_visible && !row.is_sensitive && (
  scopeKind.value === 'dataset'
    ? row.target_kind === 'dataset_output_field' && row.dataset_id === scope.value.dataset_id
    : row.target_kind === 'table_column' && row.table_name === scope.value.table_name
)))
let requestId = 0
let contextId = 0
let optionsId = 0

function message(cause: any, fallback: string) {
  let detail = cause?.response?.data?.detail
  if (typeof detail === 'string') { try { detail = JSON.parse(detail) } catch { return detail || fallback } }
  return typeof detail === 'string' ? detail : typeof detail?.message === 'string' ? detail.message : fallback
}
async function loadScopes() {
  const current = ++optionsId
  datasets.value = []; tables.value = []; scopeError.value = ''
  if (!canView.value) return
  const result = await Promise.allSettled([datasetsApi.list(), datasetsApi.visibleTables()])
  if (current !== optionsId || !canView.value) return
  if (result[0].status === 'fulfilled') datasets.value = result[0].value
  if (result[1].status === 'fulfilled') tables.value = result[1].value
  if (result.some(item => item.status === 'rejected')) scopeError.value = '部分来源范围加载失败，请重新加载来源。'
}
async function load() {
  const current = ++requestId
  rows.value = []; error.value = ''; loading.value = false
  if (!canView.value || !hasScope.value) return
  loading.value = true
  try {
    const result = await standardFieldsApi.bindingCandidates(props.fieldId, { ...scope.value, keyword: keyword.value.trim() || undefined })
    if (current === requestId) rows.value = result
  } catch (cause: any) {
    if (current === requestId) error.value = cause?.response?.status === 403 ? '无权读取绑定候选。' : message(cause, '绑定候选加载失败，请重试。')
  } finally {
    if (current === requestId) loading.value = false
  }
}
function statusLabel(status: string | null) {
  return ({ unmapped: '未绑定', suggested: '待确认', confirmed: '已确认', invalid: '已失效' } as Record<string, string>)[status || ''] || '未绑定'
}
function targetLabel(row: StandardFieldBindingCandidate) {
  return row.target_kind === 'dataset_output_field' ? `数据集输出 · ${row.dataset_name || row.dataset_id}` : `物理字段 · ${row.table_name}`
}
async function suggest(row: StandardFieldBindingCandidate) {
  if (!canUpdate() || !props.activeVersionId || row.existing_binding_id || savingKey.value || !visibleRows.value.includes(row)) return
  const context = contextId
  const fieldId = props.fieldId
  savingKey.value = `${row.target_kind}:${row.target_id}`
  try {
    await standardFieldsApi.createBinding(fieldId, { target_kind: row.target_kind, target_id: row.target_id, standard_field_version_id: props.activeVersionId, ...(scope.value.dataset_id ? { dataset_id: scope.value.dataset_id } : {}) })
    if (context !== contextId || !canUpdate()) return
    ElMessage.success('已创建待确认绑定')
    await load()
    if (context === contextId && canUpdate()) emit('changed')
  } catch (cause: any) {
    if (context === contextId) ElMessage.error(message(cause, '创建建议绑定失败，请重新加载后重试。'))
  } finally {
    if (context === contextId) savingKey.value = ''
  }
}
async function confirm(row: StandardFieldBindingCandidate) {
  if (!canUpdate() || !row.existing_binding_id || row.existing_binding_status !== 'suggested' || savingKey.value || !visibleRows.value.includes(row)) return
  const context = contextId
  const fieldId = props.fieldId
  const bindingId = row.existing_binding_id
  const expectedRevision = revisionById.value.get(bindingId)
  if (expectedRevision === undefined) { ElMessage.error('绑定版本已缺失，请重新加载后再确认。'); return }
  savingKey.value = `${row.target_kind}:${row.target_id}`
  try {
    const result = await ElMessageBox.prompt('请填写确认原因；确认后绑定才可参与发布准入。', '确认标准字段绑定', {
      inputValidator: value => Boolean(value.trim()) || '请填写原因', confirmButtonText: '确认绑定', cancelButtonText: '取消',
    })
    if (context !== contextId || !canUpdate() || revisionById.value.get(bindingId) !== expectedRevision) return
    await standardFieldsApi.confirmBinding(fieldId, bindingId, { expected_revision: expectedRevision, reason: result.value.trim() })
    if (context !== contextId || !canUpdate()) return
    ElMessage.success('绑定已确认')
    await load()
    if (context === contextId && canUpdate()) emit('changed')
  } catch (cause: any) {
    if (cause === 'cancel' || cause === 'close' || cause?.message === 'cancel') return
    if (context === contextId) ElMessage.error(message(cause, '确认失败；请重新加载并核对绑定版本。'))
  } finally {
    if (context === contextId) savingKey.value = ''
  }
}
watch(() => [props.fieldId, props.datasetId, props.tableName, canView.value], () => {
  scopeKind.value = props.datasetId ? 'dataset' : props.tableName ? 'table' : 'dataset'
  selectedDataset.value = props.datasetId || undefined
  selectedTable.value = props.tableName || ''
  keyword.value = ''
  void loadScopes()
}, { immediate: true, flush: 'sync' })
watch(() => [props.fieldId, props.activeVersionId, scopeKind.value, selectedDataset.value, selectedTable.value, canView.value], () => {
  ++contextId; savingKey.value = ''; void load()
}, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => { ++requestId; ++contextId; ++optionsId })
</script>

<template>
  <section class="binding-panel">
    <div class="binding-panel__heading">
      <div><strong>绑定候选</strong><p>先选择数据集或来源物理表；仅展示该范围内的非敏感、可见字段元数据。</p></div>
      <el-tag v-if="!activeVersionId" size="small" type="warning">需先启用语义版本</el-tag>
    </div>
    <p v-if="!canView" role="alert">无权读取绑定候选。</p>
    <template v-else>
      <el-form inline @submit.prevent="load">
        <el-form-item label="来源范围"><el-select v-model="scopeKind" style="width: 150px"><el-option label="数据集输出" value="dataset" /><el-option label="来源物理表" value="table" /></el-select></el-form-item>
        <el-form-item v-if="scopeKind === 'dataset'" label="数据集"><el-select v-model="selectedDataset" clearable filterable placeholder="请选择数据集" style="width: 240px"><el-option v-for="item in datasets" :key="item.id" :label="`${item.label || item.name} (#${item.id})`" :value="item.id" /></el-select></el-form-item>
        <el-form-item v-else label="来源物理表"><el-select v-model="selectedTable" clearable filterable placeholder="请选择来源表" style="width: 240px"><el-option v-for="item in tables" :key="item.table_name" :label="`${item.label || item.table_name} (${item.table_name})`" :value="item.table_name" /></el-select></el-form-item>
        <el-form-item label="搜索"><el-input v-model="keyword" clearable placeholder="字段编码或名称" @keyup.enter="load" /></el-form-item>
        <el-form-item><PermissionButton menu="warehouse.standard_fields.catalog" op="V" type="primary" :disabled="!hasScope" @click="load">查询</PermissionButton><PermissionButton v-if="scopeError" menu="warehouse.standard_fields.catalog" op="V" @click="loadScopes">重新加载来源</PermissionButton></el-form-item>
      </el-form>
      <el-alert v-if="scopeError" :title="scopeError" type="warning" :closable="false" />
      <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
      <div style="overflow-x: auto">
        <el-table v-loading="loading" :data="visibleRows" stripe style="width: 100%" max-height="600" :empty-text="hasScope ? '该来源暂无可用候选；敏感或不可见字段不会展示' : '请先选择数据集或来源物理表'">
          <el-table-column label="候选" min-width="180"><template #default="{ row }"><span>{{ targetLabel(row) }}</span><small class="binding-panel__sub">{{ row.column_code }}</small></template></el-table-column>
          <el-table-column prop="display_name" label="显示名称" min-width="140" />
          <el-table-column prop="data_type" label="类型" min-width="90" />
          <el-table-column label="绑定状态" min-width="100"><template #default="{ row }"><el-tag size="small">{{ statusLabel(row.existing_binding_status) }}</el-tag></template></el-table-column>
          <el-table-column label="操作" width="280" fixed="right"><template #default="{ row }">
            <PermissionButton v-if="!row.existing_binding_id" menu="warehouse.standard_fields.catalog" op="U" size="small" :disabled="!activeVersionId || savingKey !== '' || loading" @click="suggest(row)">建议绑定</PermissionButton>
            <PermissionButton v-else-if="row.existing_binding_status === 'suggested'" menu="warehouse.standard_fields.catalog" op="U" size="small" :disabled="savingKey !== '' || loading" @click="confirm(row)">确认绑定</PermissionButton>
            <span v-else class="binding-panel__muted">无需操作</span>
          </template></el-table-column>
        </el-table>
      </div>
    </template>
  </section>
</template>

<style scoped>
.binding-panel { display: grid; gap: 12px; padding-top: 16px; border-top: 1px solid var(--color-border); }
.binding-panel__heading { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
.binding-panel__heading p, .binding-panel__sub { display: block; margin: 6px 0 0; color: var(--color-text-secondary); font-size: 12px; }
.binding-panel__muted { color: var(--color-text-secondary); font-size: 12px; }
</style>
