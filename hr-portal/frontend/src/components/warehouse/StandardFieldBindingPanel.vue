<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PermissionButton from '@/components/PermissionButton.vue'
import {
  standardFieldsApi,
  type StandardFieldBindingCandidate,
  type StandardFieldBindingRef,
} from '@/api/standardFields'

const props = defineProps<{
  fieldId: number
  activeVersionId: number | null
  bindings: StandardFieldBindingRef[]
}>()
const emit = defineEmits<{ changed: [] }>()

const rows = ref<StandardFieldBindingCandidate[]>([])
const loading = ref(false)
const savingKey = ref('')
const error = ref('')
const keyword = ref('')
const targetKind = ref<'all' | StandardFieldBindingCandidate['target_kind']>('all')
const revisionById = computed(() => new Map(props.bindings.map(binding => [binding.id, binding.binding_version])))
const visibleRows = computed(() => rows.value.filter(row => row.is_visible && !row.is_sensitive && (targetKind.value === 'all' || row.target_kind === targetKind.value)))

function message(errorValue: any, fallback: string) {
  return errorValue?.response?.data?.detail || fallback
}
async function load() {
  loading.value = true
  error.value = ''
  try {
    const result = await standardFieldsApi.bindingCandidates(props.fieldId, { keyword: keyword.value.trim() || undefined })
    rows.value = result
  } catch (cause: any) {
    rows.value = []
    error.value = cause?.response?.status === 403 ? '无权读取绑定候选。' : message(cause, '绑定候选加载失败，请重试。')
  } finally {
    loading.value = false
  }
}
function statusLabel(status: string | null) {
  return ({ unmapped: '未绑定', suggested: '待确认', confirmed: '已确认', invalid: '已失效' } as Record<string, string>)[status || ''] || '未绑定'
}
function targetLabel(row: StandardFieldBindingCandidate) {
  return row.target_kind === 'dataset_output_field' ? `DWD 单表 · ${row.dataset_name || '数据集'}` : `物理字段 · ${row.table_name || '来源表'}`
}
async function suggest(row: StandardFieldBindingCandidate) {
  if (!props.activeVersionId || row.existing_binding_id || savingKey.value) return
  savingKey.value = `${row.target_kind}:${row.target_id}`
  try {
    await standardFieldsApi.createBinding(props.fieldId, {
      target_kind: row.target_kind,
      target_id: row.target_id,
      standard_field_version_id: props.activeVersionId,
    })
    ElMessage.success('已创建待确认绑定')
    await load()
    emit('changed')
  } catch (cause: any) {
    ElMessage.error(message(cause, '创建建议绑定失败，请重新加载后重试。'))
  } finally {
    savingKey.value = ''
  }
}
async function confirm(row: StandardFieldBindingCandidate) {
  if (!row.existing_binding_id || row.existing_binding_status !== 'suggested' || savingKey.value) return
  try {
    const result = await ElMessageBox.prompt('请填写确认原因；确认后绑定才可参与发布准入。', '确认标准字段绑定', {
      inputValidator: value => Boolean(value.trim()) || '请填写原因',
      confirmButtonText: '确认绑定', cancelButtonText: '取消',
    })
    const expectedRevision = revisionById.value.get(row.existing_binding_id)
    if (expectedRevision === undefined) {
      ElMessage.error('绑定版本已缺失，请重新加载后再确认。')
      return
    }
    savingKey.value = `${row.target_kind}:${row.target_id}`
    await standardFieldsApi.confirmBinding(props.fieldId, row.existing_binding_id, {
      expected_revision: expectedRevision,
      reason: result.value.trim(),
    })
    ElMessage.success('绑定已确认')
    await load()
    emit('changed')
  } catch (cause: any) {
    if (cause?.message === 'cancel') return
    ElMessage.error(message(cause, '确认失败；请重新加载并核对绑定版本。'))
  } finally {
    savingKey.value = ''
  }
}
watch(() => props.fieldId, () => { void load() })
onMounted(() => { void load() })
</script>

<template>
  <section class="binding-panel">
    <div class="binding-panel__heading">
      <div><strong>绑定候选</strong><p>仅展示可用于治理的非敏感字段元数据；候选不会自动获得授权。</p></div>
      <el-tag v-if="!activeVersionId" size="small" type="warning">需先启用语义版本</el-tag>
    </div>
    <el-form inline @submit.prevent="load">
      <el-form-item label="候选类型"><el-select v-model="targetKind" style="width: 150px"><el-option label="全部" value="all" /><el-option label="物理字段" value="table_column" /><el-option label="DWD 单表输出" value="dataset_output_field" /></el-select></el-form-item>
      <el-form-item label="搜索"><el-input v-model="keyword" clearable placeholder="字段编码或名称" @keyup.enter="load" /></el-form-item>
      <el-form-item><el-button type="primary" @click="load">查询</el-button></el-form-item>
    </el-form>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <div style="overflow-x: auto">
      <el-table v-loading="loading" :data="visibleRows" stripe style="width: 100%" max-height="360" empty-text="暂无可用候选；敏感或不可见字段不会展示">
        <el-table-column label="候选" min-width="180"><template #default="{ row }"><span>{{ targetLabel(row) }}</span><small class="binding-panel__sub">{{ row.column_code }}</small></template></el-table-column>
        <el-table-column prop="display_name" label="显示名称" min-width="140" />
        <el-table-column prop="data_type" label="类型" min-width="90" />
        <el-table-column label="绑定状态" min-width="100"><template #default="{ row }"><el-tag size="small">{{ statusLabel(row.existing_binding_status) }}</el-tag></template></el-table-column>
        <el-table-column label="操作" width="280" fixed="right"><template #default="{ row }">
          <PermissionButton v-if="!row.existing_binding_id" menu="warehouse.standard_fields.catalog" op="U" size="small" :disabled="!activeVersionId || savingKey !== ''" @click="suggest(row)">建议绑定</PermissionButton>
          <PermissionButton v-else-if="row.existing_binding_status === 'suggested'" menu="warehouse.standard_fields.catalog" op="U" size="small" :disabled="savingKey !== ''" @click="confirm(row)">确认绑定</PermissionButton>
          <span v-else class="binding-panel__muted">无需操作</span>
        </template></el-table-column>
      </el-table>
    </div>
  </section>
</template>

<style scoped>
.binding-panel { display: grid; gap: 12px; padding-top: 16px; border-top: 1px solid var(--color-border); }
.binding-panel__heading { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
.binding-panel__heading p, .binding-panel__sub { display: block; margin: 6px 0 0; color: var(--color-text-secondary); font-size: 12px; }
.binding-panel__muted { color: var(--color-text-secondary); font-size: 12px; }
</style>
