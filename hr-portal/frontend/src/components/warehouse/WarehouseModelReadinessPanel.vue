<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import PermissionButton from '@/components/PermissionButton.vue'
import WarehouseAuthorizationContractForm from './WarehouseAuthorizationContractForm.vue'
import {
  approveAuthorizationContract,
  approveConversion,
  getAuthorizationExecutionReadiness,
  getConversionReadiness,
  getModel,
  getReleaseReadiness,
  listAuthorizationContracts,
  listModelStandardFields,
  type AuthorizationExecutionReadiness,
  type ConversionReadiness,
  type DatasetReleaseReadiness,
  type ModelStandardFieldBinding,
  type ProductAuthorizationContract,
  type ModelTable,
} from '@/api/warehouse'

const props = defineProps<{ modelId: number; modelVersion: number; modelName: string }>()
const emit = defineEmits<{ ready: [eligible: boolean | null] }>()
defineExpose({ refresh: load })
const loading = ref(false)
const error = ref('')
const releaseReadiness = ref<DatasetReleaseReadiness | null>(null)
const conversion = ref<ConversionReadiness | null>(null)
const authorization = ref<AuthorizationExecutionReadiness | null>(null)
const checkIssues = computed(() => [
  ...(releaseReadiness.value?.issues || []),
  ...(conversion.value?.issues || []),
  ...(authorization.value?.issues || []),
])
const contracts = ref<ProductAuthorizationContract[]>([])
const modelOutputFields = ref<Array<{ output_code: string; agg_role: string; is_sensitive: boolean }>>([])
const standardFields = ref<ModelStandardFieldBinding[]>([])
const modelTables = ref<ModelTable[]>([])
const conversionReason = ref('')
const contractReason = ref('')
const conversionApproving = ref(false)
const contractApproving = ref(false)

function detail(cause: any, fallback: string) {
  return cause?.response?.data?.detail || fallback
}
function statusText(eligible: boolean) { return eligible ? '通过' : '阻断' }
async function load() {
  loading.value = true
  error.value = ''
  releaseReadiness.value = null
  conversion.value = null
  authorization.value = null
  emit('ready', null)
  try {
    const [release, conversionResult, authorizationResult, contractResult, model, standardFieldResult] = await Promise.all([
      getReleaseReadiness(props.modelId), getConversionReadiness(props.modelId),
      getAuthorizationExecutionReadiness(props.modelId), listAuthorizationContracts(props.modelId), getModel(props.modelId),
      listModelStandardFields(props.modelId),
    ])
    releaseReadiness.value = release
    conversion.value = conversionResult
    authorization.value = authorizationResult
    contracts.value = contractResult
    standardFields.value = standardFieldResult
    modelOutputFields.value = model.output_fields.map(field => ({ output_code: field.output_code, agg_role: field.agg_role, is_sensitive: field.is_sensitive }))
    modelTables.value = model.tables
  } catch (cause: any) {
    error.value = cause?.response?.status === 403 ? '无权查看建模校验结果。' : detail(cause, '建模校验结果加载失败，请重试。')
  } finally {
    loading.value = false
    emit('ready', releaseReadiness.value?.eligible === true && conversion.value?.eligible === true
      && authorization.value?.eligible === true && authorization.value.runtime_enabled === true)
  }
}
async function approveConversionAction() {
  if (!conversion.value?.run_id || !conversion.value.contract_id || !conversionReason.value.trim() || conversionApproving.value) return
  conversionApproving.value = true
  try {
    await approveConversion(props.modelId, { expected_run_id: conversion.value.run_id, expected_contract_id: conversion.value.contract_id, expected_dataset_version: conversion.value.dataset_version, reason: conversionReason.value.trim() })
    conversionReason.value = ''
    ElMessage.success('转换已批准')
    await load()
  } catch (cause: any) { ElMessage.error(detail(cause, '转换批准失败，请重新检查。')) }
  finally { conversionApproving.value = false }
}
async function approve(contract: ProductAuthorizationContract) {
  if (contract.status !== 'draft' || !contractReason.value.trim() || contractApproving.value) return
  contractApproving.value = true
  try {
    await approveAuthorizationContract(props.modelId, contract.id, { expected_revision: contract.revision, reason: contractReason.value.trim() })
    contractReason.value = ''
    ElMessage.success('授权合同已批准')
    await load()
  } catch (cause: any) { ElMessage.error(detail(cause, '授权合同批准失败，请重新加载。')) }
  finally { contractApproving.value = false }
}
watch(() => [props.modelId, props.modelVersion], () => { void load() }, { immediate: true })
</script>

<template>
  <div v-loading="loading" class="readiness-panel">
    <div class="readiness-panel__head">
      <strong>{{ modelName }}</strong>
      <el-button size="small" :loading="loading" @click="load">重新检查</el-button>
    </div>
      <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
      <p class="readiness-panel__note">这里展示服务端检查结果，不单独批准执行资格；发布时会重新复核。检查失败请在下方对应治理入口修复，不会自动批准或开放数据。</p>
      <div class="readiness-grid">
        <div class="readiness-card"><div><strong>字段与结构</strong><el-tag size="small" :type="releaseReadiness?.eligible ? 'success' : 'danger'">{{ releaseReadiness ? statusText(releaseReadiness.eligible) : '未检查' }}</el-tag></div><p>字段 {{ releaseReadiness?.confirmed_output_count ?? '—' }}/{{ releaseReadiness?.checked_output_count ?? '—' }} 已确认</p></div>
        <div class="readiness-card"><div><strong>来源转换</strong><el-tag size="small" :type="conversion?.eligible ? 'success' : 'danger'">{{ conversion ? statusText(conversion.eligible) : '未检查' }}</el-tag></div><p>仅展示当前验证结果，不显示转换内容。</p></div>
        <div class="readiness-card"><div><strong>权限与运行检查</strong><el-tag size="small" :type="authorization?.eligible ? 'success' : 'danger'">{{ authorization ? statusText(authorization.eligible) : '未检查' }}</el-tag></div><p>{{ authorization?.runtime_enabled ? '当前运行检查通过' : '运行条件由服务端检查' }}</p></div>
      </div>
      <section class="readiness-section"><strong>检查问题</strong><el-empty v-if="!releaseReadiness" description="尚未取得检查结果，请重新检查" :image-size="48" /><el-empty v-else-if="!checkIssues.length" description="当前没有发布阻断原因" :image-size="48" /><ul v-else><li v-for="(issue, index) in checkIssues" :key="`${issue.code}-${index}`">{{ issue.message }}</li></ul></section>
      <section class="readiness-section">
        <div class="isolation-head">
          <strong>隔离证明</strong>
          <el-tag v-if="releaseReadiness?.isolation" size="small" :type="releaseReadiness.isolation.isolated ? 'success' : 'danger'">{{ releaseReadiness.isolation.isolated ? '已隔离' : '未隔离' }}</el-tag>
        </div>
        <p class="readiness-panel__note">仅展示对象依赖计数，不展示业务数据或表内取值。</p>
        <el-descriptions v-if="releaseReadiness?.isolation" :column="2" size="small" border>
          <el-descriptions-item label="目标表">{{ releaseReadiness.isolation.target_tables.join('、') || '—' }}</el-descriptions-item>
          <el-descriptions-item label="来源表">{{ releaseReadiness.isolation.source_tables.join('、') || '—' }}</el-descriptions-item>
          <el-descriptions-item label="其他数据集引用目标表">{{ releaseReadiness.isolation.shared_target_dataset_count }}</el-descriptions-item>
          <el-descriptions-item label="其他数据集引用来源表">{{ releaseReadiness.isolation.shared_source_dataset_count }}</el-descriptions-item>
          <el-descriptions-item label="来源生成的其他目标">{{ releaseReadiness.isolation.source_other_target_count }}</el-descriptions-item>
          <el-descriptions-item label="活跃外部出口">{{ releaseReadiness.isolation.active_export_count }}</el-descriptions-item>
        </el-descriptions>
        <el-empty v-else description="尚未取得隔离检查结果" :image-size="48" />
      </section>
      <section class="readiness-section"><strong>转换批准</strong><div v-if="conversion && !conversion.eligible" class="reason-form"><el-input v-model="conversionReason" placeholder="批准原因（必填）" maxlength="1000" /><PermissionButton menu="warehouse.assets" op="U" size="small" :disabled="conversionApproving || !conversionReason.trim() || !conversion.run_id || !conversion.contract_id" @click="approveConversionAction">批准转换</PermissionButton></div></section>
      <section class="readiness-section">
        <strong>授权合同状态</strong>
        <WarehouseAuthorizationContractForm :model-id="modelId" :tables="modelTables" :outputs="modelOutputFields" :latest-version="contracts.reduce((max, item) => Math.max(max, item.contract_version), 0)" @created="load" />
        <el-empty v-if="!contracts.length" description="暂无授权合同" :image-size="48" />
        <div v-for="contract in contracts" :key="contract.id" class="contract-row">
          <span>合同 v{{ contract.contract_version }}</span>
          <el-tag v-if="contract.schema_version === 2" size="small" type="success">标准字段</el-tag>
          <el-tag size="small">{{ contract.status === 'active' ? '已启用' : contract.status === 'draft' ? '草稿' : '已停用' }}</el-tag>
          <template v-if="contract.status === 'draft'">
            <el-input v-model="contractReason" placeholder="批准原因（必填）" maxlength="1000" />
            <PermissionButton menu="warehouse.assets" op="U" size="small" :disabled="contractApproving || !contractReason.trim()" @click="approve(contract)">批准合同</PermissionButton>
          </template>
        </div>
      </section>
  </div>
</template>

<style scoped>
.readiness-panel { display: grid; gap: 16px; }
.readiness-panel__head { display: flex; align-items: center; justify-content: space-between; gap: var(--spacing-3); color: var(--color-text-primary); font-size: var(--font-size-md); }
.readiness-panel__note { margin: 0; color: var(--color-text-secondary); font-size: 13px; line-height: 1.6; }
.readiness-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.readiness-card { padding: 14px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-bg-hover); }
.readiness-card div, .contract-row { display: flex; align-items: center; gap: 8px; justify-content: space-between; }
.readiness-card p { margin: 10px 0 0; color: var(--color-text-secondary); font-size: 12px; }
.readiness-section { display: grid; gap: 10px; border-top: 1px solid var(--color-border); padding-top: 14px; }
.isolation-head { display: flex; align-items: center; gap: 8px; justify-content: space-between; }
.readiness-section ul { margin: 0; padding-left: 20px; color: var(--color-danger); }
.contract-row { justify-content: flex-start; padding: 8px 0; }
.reason-form { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.reason-form .el-input { max-width: 360px; }
@media (max-width: 720px) { .readiness-grid { grid-template-columns: 1fr; } }
</style>
