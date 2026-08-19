<template>
  <section class="cost-center-page">
    <header class="page-header">
      <div>
        <div class="eyebrow">数据仓库 / ODS → DWD</div>
        <h1>成本中心映射</h1>
        <p class="subtitle">按月维护成本中心规则、确认差异，并在发布后进入 DWD 重算。</p>
      </div>
      <div class="header-actions">
        <el-tag :type="periodState?.status === 'published' ? 'success' : 'warning'" effect="plain">
          {{ periodState ? (periodState.status === 'published' ? '已发布' : '草稿') : '未初始化' }}
        </el-tag>
        <el-button :loading="loading" @click="loadPeriod">刷新</el-button>
      </div>
    </header>

    <el-card class="period-card" shadow="never">
      <div class="period-toolbar">
        <el-form inline @submit.prevent>
          <el-form-item label="映射期间">
            <el-input v-model="period" maxlength="6" placeholder="YYYYMM" style="width: 150px" @keyup.enter="loadPeriod" />
          </el-form-item>
        </el-form>
        <div class="period-actions">
          <el-button type="primary" :loading="loading" @click="initializePeriod">初始化期间</el-button>
        </div>
      </div>
    </el-card>

    <el-alert v-if="errorMessage" class="page-alert" type="error" :title="errorMessage" :closable="false" />

    <div v-if="periodState" class="status-grid">
      <el-card shadow="never">
        <div class="status-label">差异确认</div>
        <div class="status-value" :class="periodState.reviewRequired ? 'warning' : 'success'">
          {{ periodState.reviewRequired ? `${periodState.pendingDiffCount} 项待确认` : '已确认' }}
        </div>
        <div class="status-meta">版本 {{ periodState.version }} · 来源 {{ periodState.sourceCount }} 个</div>
      </el-card>
      <el-card shadow="never">
        <div class="status-label">DWD 重算</div>
        <div class="status-value">{{ rebuildStatusLabel }}</div>
        <div class="status-meta">{{ periodState.rebuildRunId ? `Run #${periodState.rebuildRunId}` : '发布后生成重算记录' }}</div>
      </el-card>
      <el-card shadow="never">
        <div class="status-label">通知投递</div>
        <div class="status-value">{{ notificationStatusLabel }}</div>
        <div class="status-meta">{{ periodState.notifications.length }} 条通知 · 幂等键去重</div>
      </el-card>
    </div>

    <div v-if="periodState" class="workspace-layout">
      <el-card shadow="never" class="mapping-card">
        <template #header>
          <div class="section-heading">
            <div>
              <strong>规则工作区</strong>
              <span>默认自映射不展开保存，仅持久化例外</span>
            </div>
            <el-button type="primary" :disabled="periodState.status === 'published'" :loading="saving" @click="saveException">
              保存例外
            </el-button>
          </div>
        </template>
        <MappingWorkspace
          ref="mappingWorkspaceRef"
          v-model="mappingDocument"
          :policy="mappingPolicy"
          :source-fields="sourceFields"
          :target-fields="targetFields"
          :preview-rows="[]"
          @dirty="mappingDirty = $event"
        />
      </el-card>

      <aside class="side-column">
        <el-card shadow="never">
          <template #header><strong>待确认差异</strong></template>
          <el-empty v-if="!periodState.diffs.length" description="暂无周期差异" :image-size="60" />
          <div v-for="diff in periodState.diffs" :key="diff.id" class="diff-row">
            <div>
              <div class="diff-title">{{ diff.sourceCode }} <el-tag size="small" effect="plain">{{ diff.diffType }}</el-tag></div>
              <div class="diff-meta">{{ diff.status === 'confirmed' ? '已确认' : '需要人工确认' }}</div>
            </div>
            <el-button v-if="diff.status === 'pending'" size="small" type="primary" link @click="confirmDiff(diff.id)">确认</el-button>
          </div>
        </el-card>

        <el-card shadow="never">
          <template #header><strong>发布与门禁</strong></template>
          <el-alert v-if="dwdGate?.status === 'review_required'" type="warning" :closable="false" title="当前期间尚未满足 DWD 执行门禁" />
          <el-alert v-else-if="dwdGate?.status === 'allowed'" type="success" :closable="false" title="已允许进入 DWD 执行" />
          <el-button class="publish-button" type="success" :disabled="periodState.status === 'published' || periodState.reviewRequired" :loading="publishing" @click="publishPeriod">
            发布当前周期
          </el-button>
          <div v-if="periodState.publishAuditId" class="audit-meta">发布审计 #{{ periodState.publishAuditId }}</div>
        </el-card>

        <el-card shadow="never">
          <template #header><strong>通知投递</strong></template>
          <el-empty v-if="!periodState.notifications.length" description="发布后创建通知" :image-size="50" />
          <div v-for="notification in periodState.notifications" :key="notification.id" class="notification-row">
            <div>
              <div class="notification-title">{{ notification.notificationKey }}</div>
              <div class="diff-meta">{{ notification.status }} · 重试 {{ notification.retryCount }} 次</div>
              <div v-if="notification.lastError" class="notification-error">{{ notification.lastError }}</div>
            </div>
            <el-button v-if="notification.status === 'retrying' || notification.status === 'exhausted'" size="small" link type="warning" @click="retryNotification(notification.id)">人工重试</el-button>
          </div>
        </el-card>
      </aside>
    </div>

    <el-empty v-else-if="!loading" description="请选择期间并初始化，或加载已有周期" />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import MappingWorkspace from '@/components/mapping/MappingWorkspace.vue'
import {
  costCenterMappingApi,
  createEmptyDocument,
  mappingApi,
  type CostCenterDiff,
  type CostCenterPeriodState,
  type MappingCallerPolicy,
  type MappingDocument,
} from '@/api/mapping'

const now = new Date()
const period = ref(`${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`)
const periodState = ref<CostCenterPeriodState | null>(null)
const dwdGate = ref<{ status: 'allowed' | 'review_required'; reason?: string } | null>(null)
const mappingDocument = ref<MappingDocument>(createCostCenterDocument())
const mappingDirty = ref(false)
const loading = ref(false)
const saving = ref(false)
const publishing = ref(false)
const errorMessage = ref('')

const sourceFields = ref([
  { code: 'code', label: '成本中心编码', type: 'string' },
  { code: 'name', label: '成本中心名称', type: 'string' },
  { code: 'status', label: '启用状态', type: 'string' },
])
const targetFields = ref([...sourceFields.value])
const mappingPolicy = ref<MappingCallerPolicy>(createFallbackPolicy())

function createFallbackPolicy(): MappingCallerPolicy {
  return {
    caller: 'warehouse',
    allowedRuleTypes: ['identity_with_overrides', 'reference_lookup', 'field', 'value_map', 'type_convert', 'format', 'split_merge'],
    source: { assetId: 'cost_center_monthly', schemaHash: '', allowedFieldIds: sourceFields.value.map((item) => item.code) },
    target: { assetId: 'dwd_cost_center_monthly', schemaHash: '', allowedFieldIds: targetFields.value.map((item) => item.code), readonlyFieldIds: [], protectedKeyFieldIds: ['code'] },
    referenceLookup: { allowedDatasetIds: [], allowedFieldIds: [], maxRules: 20 },
    effects: { allowPreview: false, allowSave: false, allowPublish: false, allowExecute: false, allowRebuild: false },
    legacy: { sourceFormat: 'standardization_rules', allowLegacyRead: true, allowLegacyWrite: false, allowMigration: false },
    metadata: { policyVersion: 1, permissionScope: 'warehouse.modeling', issuedAt: '' },
  }
}

const rebuildStatusLabel = computed(() => ({ not_started: '未开始', pending: '待执行', running: '执行中', success: '已完成', failed: '失败' }[periodState.value?.rebuildStatus || 'not_started']))
const notificationStatusLabel = computed(() => ({ not_started: '未开始', pending: '待投递', retrying: '重试中', sent: '已送达', exhausted: '重试耗尽' }[periodState.value?.notificationStatus || 'not_started']))

function createCostCenterDocument(): MappingDocument {
  const document = createEmptyDocument('cost_center_monthly', '成本中心月度映射')
  document.ruleSet.sourceAsset = 'cost_center_monthly'
  document.ruleSet.targetAsset = 'dwd_cost_center_monthly'
  document.ruleSet.rules = [
    { id: 'cost-center-identity', type: 'identity_with_overrides', enabled: true, displayOrder: 0, sourceFields: ['code'], targetFields: ['code'], config: { defaultBehavior: 'keep_source', overrides: {}, unmatched: 'keep' } },
  ]
  return document
}

async function loadTrustedPolicy() {
  const policy = await mappingApi.resolvePolicy(
    'warehouse',
    'cost_center_monthly',
    'dwd_cost_center_monthly',
  )
  mappingPolicy.value = {
    ...policy,
    legacy: {
      ...policy.legacy,
      sourceFormat: 'standardization_rules',
      allowLegacyWrite: false,
      allowMigration: false,
    },
  }
  sourceFields.value = policy.source.allowedFieldIds.map((code) => ({ code, label: code === 'code' ? '成本中心编码' : code === 'name' ? '成本中心名称' : code, type: 'string' }))
  targetFields.value = policy.target.allowedFieldIds.map((code) => ({ code, label: code === 'code' ? '成本中心编码' : code === 'name' ? '成本中心名称' : code, type: 'string' }))
  mappingDocument.value.ruleSet.sourceSchemaHash = policy.source.schemaHash
  mappingDocument.value.ruleSet.targetSchemaHash = policy.target.schemaHash
}

function normalizePeriod() {
  period.value = period.value.replace(/\D/g, '').slice(0, 6)
  if (!/^\d{6}$/.test(period.value)) throw new Error('期间必须为 YYYYMM')
}

async function loadPeriod() {
  errorMessage.value = ''
  try {
    normalizePeriod()
    loading.value = true
    await loadTrustedPolicy()
    periodState.value = await costCenterMappingApi.getPeriod(period.value)
    dwdGate.value = await costCenterMappingApi.getDwdGate(period.value)
  } catch (error: any) {
    periodState.value = null
    dwdGate.value = null
    errorMessage.value = error?.response?.data?.detail || error?.message || '加载成本中心期间失败'
  } finally {
    loading.value = false
  }
}

async function initializePeriod() {
  try {
    normalizePeriod()
    loading.value = true
    periodState.value = await costCenterMappingApi.initialize(period.value, { source_snapshot: {} })
    dwdGate.value = await costCenterMappingApi.getDwdGate(period.value).catch(() => ({ status: 'review_required' as const, reason: 'cost_center_mapping_not_published' }))
    ElMessage.success(`已初始化 ${period.value}`)
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.detail || error?.message || '初始化失败'
  } finally {
    loading.value = false
  }
}

async function saveException() {
  if (!periodState.value) return
  try {
    saving.value = true
    const rule = mappingDocument.value.ruleSet.rules.find((item) => item.type === 'identity_with_overrides')
    const overrides = rule && 'overrides' in rule.config ? rule.config.overrides : {}
    const first = Object.entries(overrides || {})[0]
    if (!first) {
      ElMessage.info('当前没有待保存的例外')
      return
    }
    periodState.value = await costCenterMappingApi.updateException(period.value, { source_code: first[0], target_code: String(first[1]), expected_version: periodState.value.expectedVersion })
    mappingDirty.value = false
    ElMessage.success('例外已保存')
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.detail || error?.message || '保存例外失败'
  } finally {
    saving.value = false
  }
}

async function confirmDiff(diffId: number) {
  if (!periodState.value) return
  try {
    periodState.value = await costCenterMappingApi.confirmDiff(period.value, { diff_id: diffId, expected_version: periodState.value.expectedVersion, actor: 'current-user' })
    ElMessage.success('差异已确认')
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.detail || error?.message || '确认差异失败'
  }
}

async function publishPeriod() {
  if (!periodState.value) return
  try {
    publishing.value = true
    const result = await costCenterMappingApi.publish(period.value, { expected_version: periodState.value.expectedVersion, actor: 'current-user' })
    periodState.value = await costCenterMappingApi.getPeriod(period.value)
    dwdGate.value = result.status === 'published' ? { status: 'allowed' } : { status: 'review_required', reason: result.reason }
    ElMessage[result.status === 'published' ? 'success' : 'warning'](result.status === 'published' ? '周期已发布，等待 DWD 重算' : '仍有差异待确认')
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.detail || error?.message || '发布失败'
  } finally {
    publishing.value = false
  }
}

async function retryNotification(notificationId: number) {
  try {
    await costCenterMappingApi.retryNotification(period.value, notificationId)
    periodState.value = await costCenterMappingApi.getPeriod(period.value)
    ElMessage.success('已创建人工重试任务')
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.detail || error?.message || '通知重试失败'
  }
}

onMounted(loadPeriod)
</script>

<style scoped>
.cost-center-page { padding: 24px; background: var(--el-bg-color-page); min-height: calc(100vh - 64px); }
.page-header, .period-toolbar, .section-heading, .header-actions, .period-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.page-header { margin-bottom: 18px; }
.eyebrow { color: var(--el-color-primary); font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }
h1 { margin: 4px 0; color: var(--el-text-color-primary); font-size: 24px; }
.subtitle, .section-heading span, .status-meta, .diff-meta, .audit-meta { color: var(--el-text-color-secondary); font-size: 13px; }
.subtitle { margin: 0; }
.period-card, .status-grid .el-card, .mapping-card, .side-column .el-card { border-color: var(--el-border-color-lighter); }
.period-toolbar { flex-wrap: wrap; }
.page-alert { margin: 16px 0; }
.status-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 16px 0; }
.status-label { color: var(--el-text-color-secondary); font-size: 13px; }
.status-value { margin: 8px 0 4px; font-size: 20px; font-weight: 650; color: var(--el-text-color-primary); }
.status-value.warning { color: var(--el-color-warning); }
.status-value.success { color: var(--el-color-success); }
.workspace-layout { display: grid; grid-template-columns: minmax(0, 1.65fr) minmax(300px, .85fr); gap: 16px; align-items: start; }
.section-heading { width: 100%; }
.section-heading > div { display: flex; flex-direction: column; gap: 4px; }
.side-column { display: grid; gap: 16px; }
.diff-row, .notification-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--el-border-color-lighter); }
.diff-row:last-child, .notification-row:last-child { border-bottom: 0; }
.diff-title, .notification-title { color: var(--el-text-color-primary); font-size: 13px; font-weight: 600; }
.publish-button { width: 100%; margin-top: 14px; }
.audit-meta { margin-top: 10px; }
.notification-error { max-width: 210px; margin-top: 4px; color: var(--el-color-danger); font-size: 12px; overflow-wrap: anywhere; }
@media (max-width: 900px) { .workspace-layout, .status-grid { grid-template-columns: 1fr; } .page-header { align-items: flex-start; flex-direction: column; } }
</style>
