<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import PermissionButton from '@/components/PermissionButton.vue'
import WarehouseAuthorizationContractForm from './WarehouseAuthorizationContractForm.vue'
import {
  approveAuthorizationContract,
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
const emit = defineEmits<{
  ready: [eligible: boolean | null]
  navigate: [step: 'model' | 'fields']
}>()
const router = useRouter()
defineExpose({ refresh: load })
const loading = ref(false)
const error = ref('')
const releaseReadiness = ref<DatasetReleaseReadiness | null>(null)
const conversion = ref<ConversionReadiness | null>(null)
const authorization = ref<AuthorizationExecutionReadiness | null>(null)
const contracts = ref<ProductAuthorizationContract[]>([])
const modelOutputFields = ref<Array<{ output_code: string; agg_role: string; is_sensitive: boolean }>>([])
const standardFields = ref<ModelStandardFieldBinding[]>([])
const modelTables = ref<ModelTable[]>([])
const contractReason = ref('')
const contractApproving = ref(false)
const activeContract = computed(() => contracts.value.find(contract => contract.status === 'active') || null)
const contractStatus = computed(() => {
  if (!contracts.value.length) return { text: '未配置事实与权限用途声明', type: 'warning' as const }
  if (!activeContract.value) return { text: '草稿：尚未生效', type: 'warning' as const }
  const runtimeIssues = authorization.value?.issues || []
  const releaseIssues = releaseReadiness.value?.issues || []
  if (runtimeIssues.some(issue => issue.code.includes('drift'))) return { text: '已失效：模型结构已变化', type: 'danger' as const }
  if (releaseIssues.some(issue => issue.code.startsWith('output_') || issue.code.startsWith('technical_output'))) {
    return { text: '阻断：标准字段映射不完整', type: 'danger' as const }
  }
  if (conversion.value?.issues.some(issue => issue.code.startsWith('conversion_'))) {
    return { text: '阻断：来源转换证据失效', type: 'danger' as const }
  }
  if (runtimeIssues.length) return { text: '阻断：权限树或事实路径不可解析', type: 'danger' as const }
  const allowsCenterSummary = activeContract.value.facts.some(fact => fact.allow_cost_center_summary)
  return { text: allowsCenterSummary ? '已生效：人员范围 + 中心汇总' : '已生效：人员范围', type: 'success' as const }
})
const fieldIssues = computed(() => releaseReadiness.value?.issues.filter(issue => (
  issue.target_kind === 'dataset_output_field'
  || issue.code.startsWith('output_')
  || issue.code.startsWith('technical_output')
  || issue.code.startsWith('dataset_no_')
)) || [])
const conversionIssues = computed(() => {
  const issues = conversion.value?.issues || []
  const sourceCodes = new Set(['dataset_inactive', 'authorization_contract_unverified', 'authorization_contract_invalid', 'authorization_contract_drift'])
  return issues.filter(issue => issue.code.startsWith('conversion_') || sourceCodes.has(issue.code))
})
const authorizationIssues = computed(() => authorization.value?.issues || [])
const otherIssues = computed(() => releaseReadiness.value?.issues.filter(issue => !fieldIssues.value.includes(issue)) || [])

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
async function approve(contract: ProductAuthorizationContract) {
  if (contract.status !== 'draft' || !contractReason.value.trim() || contractApproving.value) return
  contractApproving.value = true
  try {
    await approveAuthorizationContract(props.modelId, contract.id, { expected_revision: contract.revision, reason: contractReason.value.trim() })
    contractReason.value = ''
    ElMessage.success('事实与权限用途声明已生效')
    await load()
  } catch (cause: any) { ElMessage.error(detail(cause, '事实与权限用途声明生效失败，请重新加载。')) }
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
    <p class="readiness-panel__note">这里集中展示服务端检查结果，不给用户授予数据权限，也不单独批准执行资格。发布时会按当前模型和当前主体重新复核。</p>
    <div class="readiness-grid">
      <div class="readiness-card">
        <div><strong>字段与结构</strong><el-tag size="small" :type="releaseReadiness?.fields_eligible ? 'success' : 'danger'">{{ releaseReadiness ? statusText(releaseReadiness.fields_eligible) : '未检查' }}</el-tag></div>
        <p>标准字段确认映射 {{ releaseReadiness?.confirmed_output_count ?? '—' }}/{{ releaseReadiness?.checked_output_count ?? '—' }}</p>
      </div>
      <div class="readiness-card">
        <div><strong>来源转换证据</strong><el-tag size="small" :type="conversion?.eligible ? 'success' : 'danger'">{{ conversion ? statusText(conversion.eligible) : '未检查' }}</el-tag></div>
        <p>只读核对最新加工运行、结构、规则、数据指纹与当前模型是否一致。</p>
      </div>
      <div class="readiness-card">
        <div><strong>当前主体运行校验</strong><el-tag size="small" :type="authorization?.eligible ? 'success' : 'danger'">{{ authorization ? statusText(authorization.eligible) : '未检查' }}</el-tag></div>
        <p>{{ authorization?.runtime_enabled ? '当前主体的资源、范围和运行路径检查通过' : '由服务端按当前主体检查数据集 ACL、范围、字段和权限树' }}</p>
      </div>
    </div>

    <section class="readiness-section">
      <div class="section-heading">
        <strong>字段与结构问题</strong>
        <div class="section-actions">
          <el-button text type="primary" @click="emit('navigate', 'fields')">前往输出字段</el-button>
          <el-button text type="primary" @click="router.push('/warehouse/standard-fields')">前往标准字段目录</el-button>
        </div>
      </div>
      <p class="readiness-panel__note">输出字段需确认到有效标准字段；类型、敏感分类、来源身份和权限锚点必须与当前物理结构一致。输出字段本身请回到“输出字段”步骤修复。</p>
      <el-empty v-if="!releaseReadiness" description="尚未取得字段检查结果" :image-size="48" />
      <el-empty v-else-if="!fieldIssues.length" description="字段与结构检查通过" :image-size="48" />
      <ul v-else><li v-for="(issue, index) in fieldIssues" :key="`${issue.code}-${index}`"><strong v-if="issue.target_code">{{ issue.target_code }}：</strong>{{ issue.message }}</li></ul>
    </section>

    <section class="readiness-section">
      <div class="section-heading">
        <strong>来源转换证据</strong>
        <el-button text type="primary" @click="router.push('/warehouse/data-recipe')">前往数据清洗</el-button>
      </div>
      <p class="readiness-panel__note">这里只展示当前证据，不提供人工签字操作。如证据缺失或失效，请在来源加工与映射入口重新运行或核对；服务端记录和发布阻断继续保留。</p>
      <el-empty v-if="!conversion" description="尚未取得来源转换证据" :image-size="48" />
      <el-empty v-else-if="!conversionIssues.length" description="来源转换证据有效" :image-size="48" />
      <ul v-else><li v-for="(issue, index) in conversionIssues" :key="`${issue.code}-${index}`">{{ issue.message }}</li></ul>
    </section>

    <section class="readiness-section">
      <div class="section-heading">
        <strong>当前主体运行校验</strong>
        <el-button text type="primary" @click="emit('navigate', 'model')">返回数据建模</el-button>
      </div>
      <p class="readiness-panel__note">这是当前登录主体的运行前检查，不是用户授权配置。功能权限、数据集 ACL、报表 ACL 及人员/组织/中心范围仍在各自现有入口维护。</p>
      <el-empty v-if="!authorization" description="尚未取得当前主体运行检查" :image-size="48" />
      <el-empty v-else-if="!authorizationIssues.length" description="当前主体运行检查通过" :image-size="48" />
      <ul v-else><li v-for="(issue, index) in authorizationIssues" :key="`${issue.code}-${index}`">{{ issue.message }}</li></ul>
    </section>

    <section v-if="otherIssues.length" class="readiness-section">
      <strong>其他发布阻断</strong>
      <ul><li v-for="(issue, index) in otherIssues" :key="`${issue.code}-${index}`">{{ issue.message }}</li></ul>
    </section>

    <section class="readiness-section">
      <div class="isolation-head">
        <div><strong>变更影响分析</strong><p class="readiness-panel__note">展示模型表、共享消费者、外部出口和自动写入影响，不代表当前用户是否有权访问数据。</p></div>
        <el-tag v-if="releaseReadiness?.isolation" size="small" :type="releaseReadiness.isolation.isolated ? 'success' : 'danger'">{{ releaseReadiness.isolation.isolated ? '影响已隔离' : '存在共享影响' }}</el-tag>
      </div>
      <el-descriptions v-if="releaseReadiness?.isolation" :column="2" size="small" border>
        <el-descriptions-item label="目标表">{{ releaseReadiness.isolation.target_tables.join('、') || '—' }}</el-descriptions-item>
        <el-descriptions-item label="来源表">{{ releaseReadiness.isolation.source_tables.join('、') || '—' }}</el-descriptions-item>
        <el-descriptions-item label="其他数据集引用目标表">{{ releaseReadiness.isolation.shared_target_dataset_count }}</el-descriptions-item>
        <el-descriptions-item label="其他数据集引用来源表">{{ releaseReadiness.isolation.shared_source_dataset_count }}</el-descriptions-item>
        <el-descriptions-item label="来源生成的其他目标">{{ releaseReadiness.isolation.source_other_target_count }}</el-descriptions-item>
        <el-descriptions-item label="活跃外部出口">{{ releaseReadiness.isolation.active_export_count }}</el-descriptions-item>
      </el-descriptions>
      <el-empty v-else description="尚未取得变更影响分析" :image-size="48" />
    </section>

    <section class="readiness-section">
      <div class="section-heading">
        <div>
          <strong>事实与权限用途声明</strong>
          <p class="readiness-panel__note">声明模型使用的事实、人员/成本中心键和汇总用途，不直接给任何用户授予数据权限。</p>
        </div>
        <el-tag size="small" :type="contractStatus.type">{{ contractStatus.text }}</el-tag>
      </div>
      <WarehouseAuthorizationContractForm :model-id="modelId" :tables="modelTables" :outputs="modelOutputFields" :latest-version="contracts.reduce((max, item) => Math.max(max, item.contract_version), 0)" @created="load" />
      <el-empty v-if="!contracts.length" description="暂无事实与权限用途声明" :image-size="48" />
      <div v-for="contract in contracts" :key="contract.id" class="contract-row">
        <span>声明 v{{ contract.contract_version }}</span>
        <el-tag v-if="contract.schema_version === 2" size="small" type="success">标准字段</el-tag>
        <el-tag size="small">{{ contract.status === 'active' ? '已生效' : contract.status === 'draft' ? '草稿' : '已停用' }}</el-tag>
        <template v-if="contract.status === 'draft'">
          <el-input v-model="contractReason" placeholder="生效原因（必填）" maxlength="1000" />
          <PermissionButton menu="warehouse.assets" op="U" size="small" :disabled="contractApproving || !contractReason.trim()" @click="approve(contract)">使声明生效</PermissionButton>
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
.section-heading, .isolation-head { display: flex; align-items: flex-start; gap: 12px; justify-content: space-between; }
.section-heading > div, .isolation-head > div { display: grid; gap: 6px; }
.readiness-section ul { margin: 0; padding-left: 20px; color: var(--color-danger); }
.contract-row { justify-content: flex-start; padding: 8px 0; }
.contract-row .el-input { max-width: 360px; }
@media (max-width: 720px) { .readiness-grid { grid-template-columns: 1fr; } .section-heading, .isolation-head { align-items: stretch; flex-direction: column; } }
</style>
