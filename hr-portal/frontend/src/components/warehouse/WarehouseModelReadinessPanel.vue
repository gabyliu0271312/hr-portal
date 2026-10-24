<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import PermissionButton from '@/components/PermissionButton.vue'
import {
  approveAuthorizationContract,
  approveConversion,
  createAuthorizationContract,
  getAuthorizationExecutionReadiness,
  getConversionReadiness,
  getModel,
  getReleaseReadiness,
  listAuthorizationContracts,
  listModelStandardFields,
  releaseModel,
  type AuthorizationExecutionReadiness,
  type ConversionReadiness,
  type DatasetReleaseReadiness,
  type ModelStandardFieldBinding,
  type ProductAuthorizationContract,
} from '@/api/warehouse'

const props = defineProps<{ modelId: number; modelVersion: number; modelName: string; modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const loading = ref(false)
const releasing = ref(false)
const error = ref('')
const releaseMessage = ref('')
const releaseReadiness = ref<DatasetReleaseReadiness | null>(null)
const conversion = ref<ConversionReadiness | null>(null)
const authorization = ref<AuthorizationExecutionReadiness | null>(null)
const contracts = ref<ProductAuthorizationContract[]>([])
const modelOutputFields = ref<Array<{ output_code: string; agg_role: string; is_visible: boolean; is_sensitive: boolean }>>([])
const standardFields = ref<ModelStandardFieldBinding[]>([])
const useStandardContract = ref(true)
const contractForm = ref({ alias: 'current', tableName: '', factKey: '', employeeKey: '', costCenterKey: '', role: 'allocation_fact' })
const createContractSaving = ref(false)
const conversionReason = ref('')
const contractReason = ref('')
const conversionApproving = ref(false)
const contractApproving = ref(false)

function detail(cause: any, fallback: string) {
  return cause?.response?.data?.detail || fallback
}
function statusText(eligible: boolean) { return eligible ? '通过' : '阻断' }
async function load() {
  if (!props.modelValue) return
  loading.value = true
  error.value = ''
  releaseMessage.value = ''
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
    modelOutputFields.value = model.output_fields.map(field => ({ output_code: field.output_code, agg_role: field.agg_role, is_visible: field.is_visible, is_sensitive: field.is_sensitive }))
    if (!contractForm.value.tableName && model.tables.length === 1) contractForm.value.tableName = model.tables[0].table_name
  } catch (cause: any) {
    error.value = cause?.response?.status === 403 ? '无权查看模型准入状态。' : detail(cause, '模型准入状态加载失败，请重试。')
  } finally { loading.value = false }
}
async function release() {
  if (releasing.value || !releaseReadiness.value?.eligible) return
  releasing.value = true
  releaseMessage.value = ''
  try {
    await releaseModel(props.modelId, props.modelVersion)
    releaseMessage.value = '发布成功，模型已进入已发布状态。'
    ElMessage.success('模型发布成功')
    await load()
  } catch (cause: any) {
    releaseMessage.value = detail(cause, '发布未完成；请重新检查阻断原因。')
  } finally { releasing.value = false }
}
async function createContract() {
  const form = contractForm.value
  if (!form.tableName.trim() || !form.factKey.trim() || !form.employeeKey.trim() || createContractSaving.value) return
  createContractSaving.value = true
  try {
    const latestContractVersion = contracts.value.reduce((max, item) => Math.max(max, item.contract_version), 0)
    const visible = modelOutputFields.value.filter(field => field.is_visible && !field.is_sensitive)
    const fact = { alias: form.alias, table_name: form.tableName.trim(), fact_key: form.factKey.trim(), employee_key: form.employeeKey.trim(), cost_center_key: form.costCenterKey.trim() || null, allow_cost_center_summary: Boolean(form.costCenterKey.trim()), missing_assignment: 'reject', role: form.role }
    if (useStandardContract.value) {
      const byOutput = new Map(standardFields.value.map(item => [item.output_code, item.standard_field_code]))
      const outputCodes = visible.map(field => byOutput.get(field.output_code)).filter((code): code is string => Boolean(code))
      if (!outputCodes.length) {
        ElMessage.warning('当前数据集没有已确认标准字段的输出，无法创建标准字段合同')
        return
      }
      const dimensions = visible.filter(field => field.agg_role !== 'measure').map(field => byOutput.get(field.output_code)).filter((code): code is string => Boolean(code))
      const measures = visible.filter(field => field.agg_role === 'measure').map(field => byOutput.get(field.output_code)).filter((code): code is string => Boolean(code))
      const anchors = [form.employeeKey.trim(), form.costCenterKey.trim()].filter(Boolean)
      await createAuthorizationContract(props.modelId, {
        schema_version: 2,
        expected_version: latestContractVersion,
        standard_fields: [...new Set([...outputCodes, ...anchors])],
        output_fields: outputCodes,
        dimensions,
        measures,
        internal_fields: [],
        facts: [fact],
      })
      ElMessage.success('标准字段合同草稿已创建')
    } else {
      const outputs = visible.map(field => field.output_code)
      const dimensions = visible.filter(field => field.agg_role !== 'measure').map(field => field.output_code)
      const measures = visible.filter(field => field.agg_role === 'measure').map(field => field.output_code)
      await createAuthorizationContract(props.modelId, {
        expected_version: latestContractVersion, facts: [fact],
        output_fields: outputs.length ? outputs : ['__none__'], dimensions, measures, internal_fields: [],
      })
      ElMessage.success('授权合同草稿已创建')
    }
    await load()
  } catch (cause: any) { ElMessage.error(detail(cause, '授权合同创建失败，请核对模型来源与输出字段。')) }
  finally { createContractSaving.value = false }
}
async function approveConversionAction() {
  if (!conversion.value?.run_id || !conversion.value.contract_id || !conversionReason.value.trim() || conversionApproving.value) return
  conversionApproving.value = true
  try {
    await approveConversion(props.modelId, { expected_run_id: conversion.value.run_id, expected_contract_id: conversion.value.contract_id, expected_dataset_version: conversion.value.dataset_version, reason: conversionReason.value.trim() })
    conversionReason.value = ''
    ElMessage.success('转换已批准')
    await load()
  } catch (cause: any) { ElMessage.error(detail(cause, '转换批准失败，请重新加载准入状态。')) }
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
watch(() => props.modelValue, value => { if (value) void load() }, { immediate: true })
</script>

<template>
  <el-dialog :model-value="modelValue" :title="`模型准入 · ${modelName}`" width="min(920px, 94vw)" @close="emit('update:modelValue', false)">
    <div v-loading="loading" class="readiness-panel">
      <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
      <p class="readiness-panel__note">这里仅展示服务端准入判断。客户端不传运行时开关，也不会展示员工、金额、SQL 或来源敏感值。</p>
      <div class="readiness-grid">
        <div class="readiness-card"><div><strong>发布准入</strong><el-tag size="small" :type="releaseReadiness?.eligible ? 'success' : 'danger'">{{ releaseReadiness ? statusText(releaseReadiness.eligible) : '未检查' }}</el-tag></div><p>字段 {{ releaseReadiness?.confirmed_output_count ?? '—' }}/{{ releaseReadiness?.checked_output_count ?? '—' }} 已确认</p></div>
        <div class="readiness-card"><div><strong>转换准入</strong><el-tag size="small" :type="conversion?.eligible ? 'success' : 'danger'">{{ conversion ? statusText(conversion.eligible) : '未检查' }}</el-tag></div><p>仅展示当前验证结果，不显示转换内容。</p></div>
        <div class="readiness-card"><div><strong>授权执行准入</strong><el-tag size="small" :type="authorization?.eligible ? 'success' : 'danger'">{{ authorization ? statusText(authorization.eligible) : '未检查' }}</el-tag></div><p>{{ authorization?.runtime_enabled ? '服务端已判定可执行' : '运行开关由服务端控制' }}</p></div>
      </div>
      <el-alert v-if="releaseMessage" :title="releaseMessage" :type="releaseReadiness?.eligible ? 'success' : 'warning'" :closable="false" />
      <section class="readiness-section"><strong>阻断原因</strong><el-empty v-if="!releaseReadiness?.issues.length" description="当前没有发布阻断原因" :image-size="48" /><ul v-else><li v-for="issue in releaseReadiness.issues" :key="`${issue.code}-${issue.target_id || ''}`">{{ issue.message }}</li></ul></section>
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
        <div class="reason-form">
          <el-switch v-model="useStandardContract" active-text="标准字段合同（schema 2）" />
          <span class="readiness-panel__note">{{ useStandardContract ? '人员/中心锚点填写标准字段编码；事实表名与事实主键仍为物理标识。' : '旧合同模式：字段填写物理/输出编码。' }}</span>
        </div>
        <div class="reason-form">
          <el-input v-model="contractForm.tableName" placeholder="事实表名" maxlength="64" />
          <el-input v-model="contractForm.factKey" placeholder="事实主键（物理）" maxlength="128" />
          <el-input v-model="contractForm.employeeKey" :placeholder="useStandardContract ? '人员锚点（标准字段编码）' : '人员键'" maxlength="128" />
          <el-input v-model="contractForm.costCenterKey" :placeholder="useStandardContract ? '中心锚点（标准字段编码，可选）' : '中心键（可选）'" maxlength="128" />
          <PermissionButton menu="warehouse.assets" op="U" size="small" :disabled="createContractSaving || !contractForm.tableName.trim() || !contractForm.factKey.trim() || !contractForm.employeeKey.trim()" @click="createContract">创建合同草稿</PermissionButton>
        </div>
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
    <template #footer><el-button @click="emit('update:modelValue', false)">关闭</el-button><PermissionButton menu="warehouse.assets" op="U" type="primary" :disabled="releasing || !releaseReadiness?.eligible" @click="release">按当前版本发布</PermissionButton></template>
  </el-dialog>
</template>

<style scoped>
.readiness-panel { display: grid; gap: 16px; }
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
