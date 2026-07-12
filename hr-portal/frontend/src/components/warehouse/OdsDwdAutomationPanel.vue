<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Setting, CircleCheck, CircleClose, Loading, Clock, ArrowRight, VideoPause, VideoPlay, InfoFilled } from '@element-plus/icons-vue'
import {
  getOdsDwdAutomationConfig, updateOdsDwdAutomationConfig,
  listOdsDwdAutomationExecutions, getWarehouseFeatures,
  detectOdsSyncSemantics, listStandardizationRules,
  type OdsDwdAutomationConfig,
} from '@/api/warehouse'

const props = defineProps<{
  odsTableName: string
  targetTableName: string
}>()

const featureEnabled = ref(false)
const loadingFeature = ref(true)
const config = ref<OdsDwdAutomationConfig | null>(null)
const loading = ref(false)
const toggling = ref(false)
const expanded = ref(false)
const executions = ref<any[]>([])
const loadingExecs = ref(false)
const detectedSemantics = ref({ ods_sync_semantics: '', dwd_write_strategy: '', missing_row_strategy: '', business_key_fields: [] as string[] })

async function loadFeatureFlag() {
  try { const f = await getWarehouseFeatures(); featureEnabled.value = f.ods_dwd_automation } catch { featureEnabled.value = false }
  finally { loadingFeature.value = false }
}

async function loadConfig() {
  if (!props.odsTableName) return
  loading.value = true
  try {
    config.value = await getOdsDwdAutomationConfig(props.odsTableName)
    detectedSemantics.value = {
      ods_sync_semantics: config.value.ods_sync_semantics,
      dwd_write_strategy: config.value.dwd_write_strategy,
      missing_row_strategy: config.value.missing_row_strategy,
      business_key_fields: config.value.business_key_fields || [],
    }
    await loadExecutions()
    await refreshDetectedMode()
  } catch {
    config.value = null
    try { detectedSemantics.value = await detectOdsSyncSemantics(props.odsTableName) } catch { /* keep default */ }
    await refreshDetectedMode()
  }
  finally { loading.value = false }
}

async function loadExecutions() {
  if (!props.odsTableName) return
  loadingExecs.value = true
  try { executions.value = await listOdsDwdAutomationExecutions(props.odsTableName, 5) } catch { executions.value = [] }
  finally { loadingExecs.value = false }
}

async function toggle() {
  toggling.value = true
  const enabling = !config.value?.enabled
  try {
    if (!enabling) {
      await ElMessageBox.confirm('暂停后 ODS 变更将不再自动更新 DWD。确定？', '确认暂停', { confirmButtonText: '确定暂停', cancelButtonText: '取消', type: 'warning' })
    }
    if (config.value) {
      await updateOdsDwdAutomationConfig(props.odsTableName, { enabled: enabling })
    }
    ElMessage.success(enabling ? '已启用自动同步' : '已暂停自动同步')
    await loadConfig()
  } catch { /* cancelled */ }
  finally { toggling.value = false }
}

// 实时检测：有清洗规则→清洗规则，无→直通
const hasRules = ref(false)
const detectedMode = ref('')
async function refreshDetectedMode() {
  if (!props.odsTableName) return
  try {
    const rules = await listStandardizationRules({ asset_code: props.odsTableName, page_size: 1 })
    hasRules.value = (rules.items || []).some((r: any) => r.enabled)
  } catch { hasRules.value = false }
  try {
    const d = await detectOdsSyncSemantics(props.odsTableName)
    const sem: Record<string, string> = { incremental_upsert: '增量更新', full_snapshot: '全量快照', incremental_append: '增量追加' }
    const dwd: Record<string, string> = { incremental_upsert: '增量 upsert', full_refresh: '全量刷新', append: '追加' }
    detectedMode.value = `${sem[d.ods_sync_semantics] || d.ods_sync_semantics} → ${dwd[d.dwd_write_strategy] || d.dwd_write_strategy}`
  } catch { detectedMode.value = '自动检测' }
}

function statusIcon(status: string) { if (status === 'success') return CircleCheck; if (status === 'failed') return CircleClose; if (status === 'running') return Loading; return Clock }
function statusColor(status: string) { if (status === 'success') return '#67C23A'; if (status === 'failed') return '#F56C6C'; if (status === 'running') return '#409EFF'; return '#909399' }

// 展开面板时重新检测
watch(expanded, (val) => { if (val) refreshDetectedMode() })
watch(() => props.odsTableName, () => { if (props.odsTableName) { loadConfig(); refreshDetectedMode() } })
onMounted(() => { loadFeatureFlag(); if (props.odsTableName) { loadConfig(); refreshDetectedMode() } })

defineExpose({ refreshDetectedMode })
</script>

<template>
  <div class="automation-panel" v-if="!loadingFeature">
    <div v-if="!featureEnabled" class="flag-disabled-card">
      <el-alert type="info" :closable="false" show-icon title="ODS→DWD 自动化未启用" />
    </div>

    <template v-else-if="odsTableName">
      <div class="panel-header" @click="expanded = !expanded">
        <div class="panel-title">
          <el-icon><Setting /></el-icon>
          <span>ODS→DWD 自动同步</span>
          <el-tag v-if="config?.enabled !== false" size="small" type="success" effect="dark">运行中</el-tag>
          <el-tag v-else-if="config" size="small" type="warning">已暂停</el-tag>
          <el-tag v-if="config?.auto_created" size="small" type="info" effect="plain" style="margin-left:4px">自动生成</el-tag>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <el-button v-if="config?.enabled !== false" size="small" type="warning" plain @click.stop="toggle" :loading="toggling">
            <el-icon><VideoPause /></el-icon>暂停
          </el-button>
          <el-button v-else size="small" type="success" plain @click.stop="toggle" :loading="toggling">
            <el-icon><VideoPlay /></el-icon>启用
          </el-button>
          <el-icon class="expand-icon" :class="{ rotated: expanded }"><ArrowRight /></el-icon>
        </div>
      </div>

      <div class="panel-body" v-show="expanded">
        <div v-if="config?.auto_created" style="margin-bottom:10px;font-size:12px;color:#909399">
          <el-icon><InfoFilled /></el-icon> 系统已自动生成并启用配置 · 策略: {{ config.default_strategy }} · 风险: {{ config.risk_decision }}
        </div>
        <div class="status-row">
          <span class="status-label">更新方式</span>
          <el-tag :type="hasRules ? 'success' : ''" size="default">
            {{ hasRules ? '清洗规则' : '直通更新' }}
          </el-tag>
        </div>
        <div class="status-row">
          <span class="status-label">ODS 语义 → DWD 策略</span>
          <span style="font-size:13px;color:#606266">{{ detectedMode || '自动检测中...' }}</span>
        </div>
        <div v-if="config?.last_execution_at" class="status-row">
          <span class="status-label">上次同步</span>
          <span style="font-size:13px;color:#606266">{{ config.last_execution_at?.slice(0, 16) }}, {{ config.last_execution_rows ?? '-' }} 行</span>
          <el-tag v-if="config.last_execution_status" size="small" :type="config.last_execution_status === 'success' ? 'success' : 'danger'">
            {{ config.last_execution_status }}
          </el-tag>
        </div>
      </div>

      <div class="execution-records" v-show="expanded">
        <div class="exec-title">最近执行记录</div>
        <div v-if="loadingExecs" style="text-align:center;padding:12px"><el-icon class="is-loading"><Loading /></el-icon></div>
        <div v-else-if="executions.length === 0" class="exec-empty">暂无记录</div>
        <div v-else class="exec-list">
          <div v-for="e in executions" :key="e.id" class="exec-item">
            <component :is="statusIcon(e.status)" :style="{ color: statusColor(e.status), fontSize: '16px' }" />
            <span class="exec-time">{{ e.started_at?.slice(0, 16) || '-' }}</span>
            <el-tag :type="e.status === 'success' ? 'success' : 'danger'" size="small">{{ e.status }}</el-tag>
            <span class="exec-mode">{{ e.mode ? e.mode : e.trigger_label }}</span>
            <span v-if="e.rows" class="exec-rows">{{ e.rows }} 行</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.automation-panel { border: 1px solid #e4e7ed; border-radius: 8px; margin-top: 12px; background: #fff; }
.flag-disabled-card { padding: 16px; }
.panel-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; cursor: pointer; user-select: none; }
.panel-header:hover { background: #f5f7fa; }
.panel-title { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 14px; }
.expand-icon { transition: transform 0.2s; }
.expand-icon.rotated { transform: rotate(90deg); }
.panel-body { padding: 16px; border-top: 1px solid #ebeef5; }
.status-row { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
.status-label { font-size: 13px; color: #909399; min-width: 140px; }
.execution-records { border-top: 1px solid #ebeef5; padding: 12px 16px; }
.exec-title { font-size: 13px; font-weight: 600; color: #606266; margin-bottom: 8px; }
.exec-empty { font-size: 12px; color: #909399; text-align: center; padding: 12px; }
.exec-list { display: flex; flex-direction: column; gap: 6px; }
.exec-item { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #606266; padding: 4px 0; }
.exec-time { color: #909399; min-width: 100px; }
.exec-mode { color: #409EFF; }
.exec-rows { color: #909399; }
</style>
