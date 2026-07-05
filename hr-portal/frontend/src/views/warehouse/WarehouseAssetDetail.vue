<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Link, Edit, List, DataAnalysis, Connection, Refresh } from '@element-plus/icons-vue'
import {
  getAsset, updateAsset, getAssetEndpoints, getAssetSyncHistory,
  getUcpRoute,
  UCP_DISABLED_TEXT,
  UCP_NOT_CONNECTED_TEXT,
  type AssetDetail,
  type AssetEndpoints,
  type ConnectionEndpointSummary,
  type SyncHistoryEntry,
} from '@/api/warehouse'
import { useUserStore } from '@/stores/user'
import { formatDateTime } from '@/utils/datetime'
import { dataApi, type ColumnInfo } from '@/api/data'
import { datasourcesApi, type DataSourceListItem } from '@/api/datasources'
import { adminTablesApi } from '@/api/admin_tables'
import {
  SOURCE_TYPES,
  findSourceType,
  initFormForType,
} from '@/config/dataSources'
import ScheduleSelector from '@/components/common/ScheduleSelector.vue'
import PushTargetList from '@/components/push/PushTargetList.vue'
import PermissionButton from '@/components/PermissionButton.vue'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const tableName = route.params.tableName as string

const asset = ref<AssetDetail | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

// 来源与开放
const endpoints = ref<AssetEndpoints | null>(null)
const endpointsLoading = ref(false)

// 数据预览
const previewRows = ref<Record<string, any>[]>([])
const previewColumns = ref<ColumnInfo[]>([])
const previewLoading = ref(false)
const previewTotal = ref(0)
const previewPage = ref(1)
const PREVIEW_PAGE_SIZE = 20

async function loadPreview(resetPage = false) {
  if (resetPage) previewPage.value = 1
  previewLoading.value = true
  try {
    const res = await dataApi.query(tableName, { page: previewPage.value, page_size: PREVIEW_PAGE_SIZE })
    previewRows.value = res.items || []
    previewTotal.value = res.total || 0
    if (previewColumns.value.length === 0) {
      previewColumns.value = await dataApi.columns(tableName)
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '预览数据加载失败')
  } finally {
    previewLoading.value = false
  }
}

// 同步历史
const syncHistory = ref<SyncHistoryEntry[]>([])
const syncHistoryLoading = ref(false)

// DataSource 抽屉 (T0211) — 完整迁移旧 Endpoints.vue 的拉取接口配置
const dsDrawerVisible = ref(false)
const dsDrawerMode = ref<'create' | 'edit'>('create')
const dsEditId = ref<number | null>(null)
const dsEditRow = ref<DataSourceListItem | null>(null)
const dsForm = reactive<{
  source_type: string
  schedule: string
  is_active: boolean
  config: Record<string, string>
}>({
  source_type: 'beisen_report',
  schedule: '每日 06:00',
  is_active: true,
  config: {},
})
const dsSaving = ref(false)
const dsTesting = ref(false)
const dsTestResult = ref<{ ok: boolean; message: string } | null>(null)

// 月度自动偏移表
const injectTables = ref<Set<string>>(new Set())

const currentType = computed(() => findSourceType(dsForm.source_type))
const isPeriodTable = computed(() => injectTables.value.has(tableName))

const monthOffset = computed<number>({
  get: () => parseInt(dsForm.config['MONTH_OFFSET'] ?? '0', 10) || 0,
  set: (v) => (dsForm.config['MONTH_OFFSET'] = String(v ?? 0)),
})
const monthPreview = computed(() => {
  const d = new Date()
  const idx = d.getFullYear() * 12 + d.getMonth() + monthOffset.value
  const y = Math.floor(idx / 12)
  const m = (idx % 12) + 1
  return `${y}${String(m).padStart(2, '0')}`
})

const SECRET_KEY_SET = new Set([
  'BEISEN_APP_KEY', 'BEISEN_APP_SECRET', 'BEISEN_API_APP_KEY', 'BEISEN_API_APP_SECRET',
  'HTTP_CREDENTIAL', 'WEBHOOK_TOKEN', 'DB_PASSWORD', 'FEISHU_APP_ID', 'FEISHU_APP_SECRET',
])

function onTypeChange(newType: string) {
  const old = { ...dsForm.config }
  const t = findSourceType(newType)
  if (!t) return
  const fresh = initFormForType(newType)
  for (const k of Object.keys(fresh)) { if (old[k]) fresh[k] = old[k] }
  dsForm.config = fresh
  dsForm.schedule = t.defaultSchedule ?? dsForm.schedule
  dsTestResult.value = null
}

function fieldPlaceholder(key: string, original?: string): string {
  if (SECRET_KEY_SET.has(key) && dsEditRow.value?.has_secret?.[key])
    return '••• 已保存（留空不变；填新值则覆盖）'
  return original ?? ''
}

function hasSecret(key: string): boolean { return !!dsEditRow.value?.has_secret?.[key] }

function splitPayload(): { settings: Record<string, any>; secrets: Record<string, string> } {
  const settings: Record<string, any> = {}
  const secrets: Record<string, string> = {}
  for (const [k, v] of Object.entries(dsForm.config)) {
    if (SECRET_KEY_SET.has(k)) { if (v) secrets[k] = v }
    else settings[k] = v
  }
  return { settings, secrets }
}

async function openCreateDS() {
  dsDrawerMode.value = 'create'
  dsEditId.value = null
  dsEditRow.value = null
  const t = findSourceType('beisen_report')
  dsForm.source_type = 'beisen_report'
  dsForm.schedule = t?.defaultSchedule ?? '每日 06:00'
  dsForm.is_active = true
  dsForm.config = initFormForType('beisen_report')
  dsTestResult.value = null
  dsDrawerVisible.value = true
}

function openEditDS(ep: ConnectionEndpointSummary) {
  dsDrawerMode.value = 'edit'
  dsEditId.value = ep.endpoint_id
  const t = findSourceType(ep.summary_extra?.source_type || 'beisen_report') || findSourceType('beisen_report')
  const merged = initFormForType(ep.summary_extra?.source_type || 'beisen_report')
  if (injectTables.value.has(tableName) && !merged['MONTH_OFFSET']) merged['MONTH_OFFSET'] = '0'
  dsForm.source_type = ep.summary_extra?.source_type || 'beisen_report'
  dsForm.schedule = ep.schedule || t?.defaultSchedule || ''
  dsForm.is_active = ep.is_active
  dsForm.config = merged
  dsEditRow.value = { id: ep.endpoint_id, table_name: tableName, table_label: ep.name, source_type: dsForm.source_type, schedule: dsForm.schedule, settings: ep.summary_extra, has_secret: {} as any, is_active: ep.is_active, last_sync_at: ep.last_run_at, last_status: ep.last_status || '', last_rows: ep.last_rows, last_message: ep.last_message } as DataSourceListItem
  dsTestResult.value = null
  dsDrawerVisible.value = true
}

async function saveDS() {
  const t = currentType.value
  if (t) {
    for (const g of t.groups) {
      for (const f of g.fields) {
        if (!f.required) continue
        const val = dsForm.config[f.key]
        if (SECRET_KEY_SET.has(f.key)) { if (!val && !hasSecret(f.key)) { ElMessage.warning(`「${f.label}」为必填`); return } }
        else if (!val?.trim()) { ElMessage.warning(`「${f.label}」为必填`); return }
      }
    }
  }
  dsSaving.value = true
  try {
    const { settings, secrets } = splitPayload()
    if (dsDrawerMode.value === 'create') {
      await datasourcesApi.create({
        table_name: tableName,
        table_label: asset.value?.table_label || tableName,
        source_type: dsForm.source_type,
        schedule: dsForm.schedule,
        is_active: dsForm.is_active,
      })
      const allDs = await datasourcesApi.list()
      const created = allDs.find(d => d.table_name === tableName && d.source_type === dsForm.source_type)
      if (created) {
        await datasourcesApi.update(created.id, { source_type: dsForm.source_type, schedule: dsForm.schedule, settings, secrets, is_active: dsForm.is_active })
      }
      ElMessage.success('入仓来源已创建')
    } else if (dsEditId.value) {
      await datasourcesApi.update(dsEditId.value, { source_type: dsForm.source_type, schedule: dsForm.schedule, settings, secrets, is_active: dsForm.is_active })
      ElMessage.success('入仓来源已更新')
    }
    dsDrawerVisible.value = false
    endpoints.value = null
    loadEndpoints()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
  } finally {
    dsSaving.value = false
  }
}

async function dsTest() {
  if (!dsEditId.value && dsDrawerMode.value !== 'edit') { ElMessage.warning('请先保存后再测试连接'); return }
  dsTesting.value = true
  dsTestResult.value = null
  try {
    const { settings, secrets } = splitPayload()
    const res = await datasourcesApi.test(dsEditId.value!, { source_type: dsForm.source_type, schedule: dsForm.schedule, settings, secrets, is_active: dsForm.is_active })
    dsTestResult.value = { ok: res.ok, message: res.ok ? `连接成功${res.token_preview ? ` · token: ${res.token_preview}` : ''}` : res.message }
  } catch (e: any) {
    dsTestResult.value = { ok: false, message: e?.response?.data?.detail || '测试失败' }
  } finally { dsTesting.value = false }
}

async function dsSync(ep: ConnectionEndpointSummary) {
  try {
    ElMessage.info('正在触发同步...')
    const res = await datasourcesApi.sync(ep.endpoint_id)
    if (res.ok) ElMessage.success(`同步成功：${res.message}`)
    else ElMessage.error(`同步失败：${res.message}`)
    endpoints.value = null; loadEndpoints()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '触发失败')
  }
}

async function loadInjectTables() {
  try {
    const tables = await adminTablesApi.list()
    injectTables.value = new Set(tables.filter(t => t.period_source === 'inject').map(t => t.table_name))
  } catch { injectTables.value = new Set() }
}

// Tab
const activeTab = ref('overview')

// 编辑模式
const editMode = ref(false)
import { SCOPE_STRATEGY_OPTIONS } from '@/constants/scopeStrategy'

const editForm = ref({ warehouse_layer: '', subject_area: '', owner_name: '', asset_status: '', description: '', scope_strategy: '' })
const editSaving = ref(false)

const LAYER_OPTIONS = ['ODS', 'DWD', 'DWS', 'ADS']
const LAYER_LABELS: Record<string, string> = { ODS: 'ODS 原始数据层', DWD: 'DWD 明细数据层', DWS: 'DWS 汇总数据层', ADS: 'ADS 应用数据层' }
const STATUS_OPTIONS = ['draft', 'published', 'disabled', 'archived']
const STATUS_LABELS: Record<string, string> = { draft: '草稿', published: '已发布', disabled: '已禁用', archived: '已归档' }

const QUALITY_TAG: Record<string, string> = { unknown: 'info', pass: 'success', warn: 'warning', fail: 'danger' }
const RUN_STATUS_TAG: Record<string, string> = { success: 'success', failed: 'danger', running: 'warning' }
const RUN_STATUS_LABEL: Record<string, string> = { success: '成功', failed: '失败', running: '运行中' }

async function load() {
  loading.value = true
  error.value = null
  try {
    asset.value = await getAsset(tableName)
  } catch (e: any) {
    const detail = e?.response?.data?.detail
    if (e?.response?.status === 404) error.value = '资产不存在'
    else if (e?.response?.status === 403) error.value = '无权限访问该资产'
    else error.value = typeof detail === 'string' ? detail : '加载失败'
  } finally {
    loading.value = false
  }
}

async function loadEndpoints() {
  if (endpoints.value) return
  endpointsLoading.value = true
  try {
    endpoints.value = await getAssetEndpoints(tableName)
  } catch {
    // 静默降级
  } finally {
    endpointsLoading.value = false
  }
}

async function loadSyncHistory() {
  if (syncHistory.value.length) return
  syncHistoryLoading.value = true
  try {
    const res = await getAssetSyncHistory(tableName)
    syncHistory.value = res.entries
  } catch { /* 静默降级 */ } finally {
    syncHistoryLoading.value = false
  }
}

function handleTabChange(tab: string) {
  if (tab === 'endpoints') loadEndpoints()
  if (tab === 'sync') loadSyncHistory()
  if (tab === 'preview') loadPreview()
}

function goBack() { router.back() }
function handleUcpJump() {
  if (!asset.value) return
  const route = getUcpRoute(asset.value.ucp)
  if (route) router.push(route)
}

function enterEdit() {
  if (!asset.value) return
  editForm.value = {
    warehouse_layer: asset.value.warehouse_layer,
    subject_area: asset.value.subject_area || '',
    owner_name: asset.value.owner_name || '',
    asset_status: asset.value.asset_status,
    description: asset.value.description || '',
    scope_strategy: asset.value.scope_strategy || '',
  }
  editMode.value = true
}

function cancelEdit() { editMode.value = false }

async function saveEdit() {
  if (!asset.value) return
  editSaving.value = true
  try {
    await updateAsset(tableName, {
      warehouse_layer: editForm.value.warehouse_layer,
      subject_area: editForm.value.subject_area || null,
      owner_name: editForm.value.owner_name || null,
      asset_status: editForm.value.asset_status,
      description: editForm.value.description || null,
      scope_strategy: editForm.value.scope_strategy || null,
    })
    ElMessage.success('保存成功')
    editMode.value = false
    load()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
  } finally {
    editSaving.value = false
  }
}

function goFields() { router.push(`/warehouse/assets/${encodeURIComponent(tableName)}/columns`) }
function goPreview() { activeTab.value = 'preview'; loadPreview() }
function goImpact() { router.push(`/warehouse/impact?table=${encodeURIComponent(tableName)}`) }

// 端点辅助
function epFlat(): ConnectionEndpointSummary[] {
  if (!endpoints.value) return []
  return [...endpoints.value.pulls, ...endpoints.value.pushes, ...endpoints.value.exposes, ...endpoints.value.ucp_resources]
}

const layerTagType: Record<string, string> = { ODS: '', DWD: 'success', DWS: 'warning', ADS: 'danger' }
const statusTagType: Record<string, string> = { draft: 'info', published: 'success', disabled: 'warning', archived: 'info' }

onMounted(() => {
  load()
  loadInjectTables()
  if (route.query.tab === 'preview') { activeTab.value = 'preview'; loadPreview() }
})
</script>

<template>
  <div style="padding: 12px 16px">
    <el-button text size="small" :icon="ArrowLeft" @click="goBack" style="margin-bottom: 8px">返回</el-button>

    <el-skeleton v-if="loading" :rows="6" animated />

    <el-alert
      v-else-if="error"
      type="error"
      :title="error"
      show-icon
      :closable="false"
      style="margin-bottom: 16px"
    />

    <template v-else-if="asset">
      <!-- 头部 -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px">
        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap">
          <strong style="font-size: 16px">{{ asset.table_label }}</strong>
          <span style="color: #909399; font-size: 12px; font-family: monospace">{{ asset.table_name }}</span>
          <el-tag :type="statusTagType[asset.asset_status] || 'info'" size="small">
            {{ STATUS_LABELS[asset.asset_status] || asset.asset_status }}
          </el-tag>
          <el-tag :type="layerTagType[asset.warehouse_layer] || 'info'" size="small" effect="plain">
            {{ asset.warehouse_layer }}
          </el-tag>
        </div>
        <div style="display: flex; gap: 4px; flex-shrink: 0">
          <el-button v-if="userStore.hasOp('warehouse.assets','U')" size="small" :icon="Edit" :type="editMode ? 'default' : 'primary'" @click="editMode ? cancelEdit() : enterEdit()">
            {{ editMode ? '取消编辑' : '编辑资产' }}
          </el-button>
          <el-button size="small" :icon="List" @click="goFields()">字段</el-button>
          <el-button size="small" :icon="DataAnalysis" @click="goPreview()">预览</el-button>
          <el-button size="small" :icon="Connection" @click="goImpact()">影响</el-button>
        </div>
      </div>

      <!-- 编辑模式 -->
      <el-card v-if="editMode" style="margin-bottom: 10px">
        <template #header><span style="font-weight: 600">编辑资产</span></template>
        <el-form label-width="100px" size="small">
          <el-form-item label="描述">
            <el-input v-model="editForm.description" />
          </el-form-item>
          <el-form-item label="分层">
            <el-select v-model="editForm.warehouse_layer" style="width: 100%">
              <el-option v-for="l in LAYER_OPTIONS" :key="l" :label="LAYER_LABELS[l]" :value="l" />
            </el-select>
          </el-form-item>
          <el-form-item label="主题域">
            <el-input v-model="editForm.subject_area" placeholder="如：员工、薪酬" />
          </el-form-item>
          <el-form-item label="负责人">
            <el-input v-model="editForm.owner_name" placeholder="负责人姓名" />
          </el-form-item>
          <el-form-item label="状态">
            <el-select v-model="editForm.asset_status" style="width: 100%">
              <el-option v-for="s in STATUS_OPTIONS" :key="s" :label="STATUS_LABELS[s]" :value="s" />
            </el-select>
          </el-form-item>
          <el-form-item label="数据范围策略">
            <el-select v-model="editForm.scope_strategy" clearable style="width: 100%">
              <el-option v-for="item in SCOPE_STRATEGY_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
            <div style="font-size: 12px; color: #909399; margin-top: 2px">控制该表多个权限标签之间的取数关系</div>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="editSaving" @click="saveEdit">保存</el-button>
          </el-form-item>
        </el-form>
      </el-card>

      <!-- Tab 内容 -->
      <el-card>
        <el-tabs v-model="activeTab" @tab-change="handleTabChange">
          <!-- ====== 概览 ====== -->
          <el-tab-pane label="概览" name="overview">
            <el-descriptions :column="2" border size="small">
              <el-descriptions-item label="描述">{{ asset.description || '—' }}</el-descriptions-item>
              <el-descriptions-item label="来源系统">{{ asset.source_system || '—' }}</el-descriptions-item>
              <el-descriptions-item label="负责人">{{ asset.owner_name || '—' }}</el-descriptions-item>
              <el-descriptions-item label="字段数">{{ asset.columns_count ?? '—' }}</el-descriptions-item>
              <el-descriptions-item label="主题域">{{ asset.subject_area || '—' }}</el-descriptions-item>
              <el-descriptions-item label="质量状态">
                <el-tag :type="QUALITY_TAG[asset.last_quality_status] || 'info'" size="small">
                  {{ asset.last_quality_status }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="最近同步">
                {{ asset.last_synced_at ? formatDateTime(asset.last_synced_at) : '—' }}
              </el-descriptions-item>
              <el-descriptions-item label="创建时间">
                {{ asset.created_at ? formatDateTime(asset.created_at) : '—' }}
              </el-descriptions-item>
              <el-descriptions-item label="周期字段">{{ asset.period_col || '—' }}</el-descriptions-item>
              <el-descriptions-item label="数据范围策略">{{ asset.scope_strategy || '—' }}</el-descriptions-item>
            </el-descriptions>
          </el-tab-pane>

          <!-- ====== 来源与开放 T0202 ====== -->
          <el-tab-pane label="来源与开放" name="endpoints">
            <div v-loading="endpointsLoading">
              <!-- 入仓来源 -->
              <el-card shadow="never" class="ep-section">
                <template #header>
                  <div style="display: flex; justify-content: space-between; align-items: center">
                    <span>
                      <span style="font-weight: 600">入仓来源 Pull Sources</span>
                      <span style="color: #909399; font-size: 12px; margin-left: 8px">{{ endpoints?.pulls.length || 0 }} 个</span>
                    </span>
                    <PermissionButton menu="warehouse.assets" op="C" size="small" type="primary" @click="openCreateDS()">配置入仓来源</PermissionButton>
                  </div>
                </template>
                <div v-if="endpoints?.pulls.length">
                  <div v-for="ep in endpoints.pulls" :key="'pull-' + ep.endpoint_id" class="ep-row">
                    <div class="ep-info">
                      <span class="ep-name">{{ ep.name }}</span>
                      <el-tag v-if="ep.is_active" size="small" type="success" effect="plain">启用</el-tag>
                      <el-tag v-else size="small" type="info" effect="plain">停用</el-tag>
                      <span class="ep-meta" v-if="ep.schedule">调度：{{ ep.schedule }}</span>
                    </div>
                    <div class="ep-stats">
                      <span v-if="ep.last_status">
                        <el-tag :type="RUN_STATUS_TAG[ep.last_status] || 'info'" size="small">
                          {{ RUN_STATUS_LABEL[ep.last_status] || ep.last_status }}
                        </el-tag>
                      </span>
                      <span class="ep-meta" v-if="ep.last_rows != null">{{ ep.last_rows }} 行</span>
                      <span class="ep-meta">{{ ep.last_run_at ? formatDateTime(ep.last_run_at) : '—' }}</span>
                      <el-button text size="small" @click="openEditDS(ep)">编辑</el-button>
                      <el-button text size="small" @click="dsSync(ep)">同步</el-button>
                    </div>
                  </div>
                </div>
                <div v-else style="text-align: center; padding: 24px 0">
                  <p style="color: #909399; margin-bottom: 12px">暂无入仓来源</p>
                  <el-button type="primary" size="small" @click="openCreateDS()">配置入仓来源</el-button>
                </div>
              </el-card>

              <!-- 出仓目标 — 嵌入 PushTargetList 组件 -->
              <PushTargetList
                v-if="asset"
                :source-table="tableName"
                compact
              />

              <!-- API 暴露 -->
              <el-card v-if="endpoints?.exposes.length" shadow="never" class="ep-section">
                <template #header>
                  <span style="font-weight: 600">API 暴露</span>
                </template>
                <div v-for="ep in endpoints.exposes" :key="'exp-' + ep.endpoint_id" class="ep-row">
                  <div class="ep-info">
                    <span class="ep-name">{{ ep.name }}</span>
                    <el-tag v-if="ep.is_active" size="small" type="success" effect="plain">启用</el-tag>
                  </div>
                  <div class="ep-stats">
                    <span class="ep-meta">{{ ep.last_run_at ? formatDateTime(ep.last_run_at) : '—' }}</span>
                  </div>
                </div>
              </el-card>

              <!-- UCP 资源 -->
              <el-card v-if="endpoints?.ucp_resources.length" shadow="never" class="ep-section">
                <template #header>
                  <span style="font-weight: 600">UCP 资源</span>
                </template>
                <div v-for="ep in endpoints.ucp_resources" :key="'ucp-' + ep.endpoint_id" class="ep-row">
                  <div class="ep-info">
                    <span class="ep-name">{{ ep.name }}</span>
                    <span class="ep-meta" v-if="ep.summary_extra.system_name">系统：{{ ep.summary_extra.system_name }}</span>
                  </div>
                  <div class="ep-stats">
                    <span class="ep-meta" v-if="ep.summary_extra.resource_status">状态：{{ ep.summary_extra.resource_status }}</span>
                    <el-button v-if="ep.config_route" text size="small" :icon="Link" @click="router.push(ep.config_route)">跳转</el-button>
                  </div>
                </div>
              </el-card>

              <!-- 影响与治理 -->
              <el-card shadow="never" class="ep-section">
                <template #header><span style="font-weight: 600">影响与治理</span></template>
                <el-descriptions :column="2" size="small">
                  <el-descriptions-item label="入仓来源">{{ endpoints?.pulls.length || 0 }} 个</el-descriptions-item>
                  <el-descriptions-item label="出仓目标">{{ (endpoints?.pushes.length || 0) + (endpoints?.exposes.length || 0) }} 个</el-descriptions-item>
                  <el-descriptions-item label="UCP 关联">{{ endpoints?.ucp_resources.length || 0 }}{{ endpoints?.ucp_resources.length ? ' 个' : ' — 无' }}</el-descriptions-item>
                  <el-descriptions-item label="凭证已配置">{{ endpoints?.pulls.filter(e => e.has_secrets).length || 0 }} / {{ endpoints?.pulls.length || 0 }}</el-descriptions-item>
                </el-descriptions>
              </el-card>

              <!-- UCP 降级提示 -->
              <el-alert
                v-if="asset && !asset.ucp.enabled"
                type="info"
                :closable="false"
                show-icon
                style="margin-top: 12px"
              >
                <template #title>数据连接平台未启用，现有 DataSource 同步不受影响</template>
              </el-alert>
            </div>
          </el-tab-pane>

          <!-- ====== 同步历史 T0210 ====== -->
          <el-tab-pane label="同步历史" name="sync">
            <div v-loading="syncHistoryLoading">
              <div v-if="syncHistory.length === 0 && !syncHistoryLoading" style="text-align: center; padding: 24px 0; color: #909399">
                暂无同步/推送记录
              </div>
              <el-table v-else :data="syncHistory" border stripe size="small" empty-text="暂无记录">
                <el-table-column label="来源" width="100">
                  <template #default="{ row }">
                    <el-tag size="small" :type="row.source_type === 'datasource' ? 'primary' : 'success'" effect="plain">
                      {{ row.source_type === 'datasource' ? 'DataSource' : 'PushTarget' }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column prop="source_name" label="名称" min-width="120" show-overflow-tooltip />
                <el-table-column prop="status" label="状态" width="80" align="center">
                  <template #default="{ row }">
                    <el-tag size="small" :type="RUN_STATUS_TAG[row.status] || 'info'">
                      {{ RUN_STATUS_LABEL[row.status] || row.status }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="开始时间" width="160">
                  <template #default="{ row }">{{ row.started_at ? formatDateTime(row.started_at) : '—' }}</template>
                </el-table-column>
                <el-table-column label="耗时" width="100">
                  <template #default="{ row }">
                    <span v-if="row.started_at && row.finished_at">
                      {{ Math.round((new Date(row.finished_at).getTime() - new Date(row.started_at).getTime()) / 1000) }}s
                    </span>
                    <span v-else>—</span>
                  </template>
                </el-table-column>
                <el-table-column prop="rows" label="行数" width="80" align="center">
                  <template #default="{ row }">{{ row.rows ?? '—' }}</template>
                </el-table-column>
                <el-table-column prop="triggered_by" label="触发" width="80" align="center">
                  <template #default="{ row }">
                    <el-tag v-if="row.triggered_by === 'cron'" size="small" effect="plain">定时</el-tag>
                    <span v-else>{{ row.triggered_by || '—' }}</span>
                  </template>
                </el-table-column>
                <el-table-column prop="message" label="消息" min-width="160" show-overflow-tooltip>
                  <template #default="{ row }">
                    <span v-if="row.status === 'failed'" style="color: var(--color-danger)">{{ row.message }}</span>
                    <span v-else>{{ row.message || '—' }}</span>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </el-tab-pane>

          <!-- ====== 数据预览 ====== -->
          <el-tab-pane label="数据预览" name="preview">
            <div v-loading="previewLoading">
              <div v-if="previewRows.length === 0 && !previewLoading" style="text-align: center; padding: 48px 0; color: #909399">
                暂无数据
              </div>
              <template v-else>
                <span style="color: #909399; font-size: 12px; line-height: 1; display: block; margin-bottom: 6px">共 {{ previewTotal }} 条</span>
                <el-table :data="previewRows" border stripe size="small" max-height="calc(100vh - 300px)" empty-text="暂无数据">
                    <el-table-column
                      v-for="col in previewColumns"
                      :key="col.code"
                      :prop="col.code"
                      :label="col.label || col.code"
                      min-width="120"
                      show-overflow-tooltip
                    >
                      <template #default="{ row }">
                        <span>{{ row[col.code] ?? '—' }}</span>
                      </template>
                    </el-table-column>
                  </el-table>
              </template>
            </div>
          </el-tab-pane>

          <!-- ====== UCP 协同 ====== -->
          <el-tab-pane label="数据连接" name="ucp">
            <el-alert
              v-if="!asset.ucp.enabled"
              type="info"
              :title="UCP_DISABLED_TEXT"
              :description="'当前分支未部署 UCP 模块，数据连接能力暂不可用。'"
              show-icon
              :closable="false"
            />
            <el-alert
              v-else-if="!asset.ucp.resource_id"
              type="info"
              :title="UCP_NOT_CONNECTED_TEXT"
              description="该资产尚未关联 UCP 数据资源。"
              show-icon
              :closable="false"
            />
            <template v-else>
              <el-descriptions :column="2" border size="small" style="margin-bottom: 12px">
                <el-descriptions-item label="系统 ID">{{ asset.ucp.system_id ?? '—' }}</el-descriptions-item>
                <el-descriptions-item label="资源 ID">{{ asset.ucp.resource_id ?? '—' }}</el-descriptions-item>
                <el-descriptions-item label="连接器配置 ID">{{ asset.ucp.connector_config_id ?? '—' }}</el-descriptions-item>
                <el-descriptions-item label="跳转路由">{{ asset.ucp.config_route ?? '—' }}</el-descriptions-item>
              </el-descriptions>
              <el-button type="primary" :icon="Link" @click="handleUcpJump">前往 UCP 查看资源详情</el-button>
            </template>
          </el-tab-pane>
        </el-tabs>
      </el-card>
    </template>

    <!-- DataSource 抽屉 T0211 — 完整拉取接口配置 -->
    <el-drawer
      v-model="dsDrawerVisible"
      :title="dsDrawerMode === 'create' ? '新建入仓来源' : `配置入仓来源 · ${asset?.table_label || ''}`"
      size="600px"
      direction="rtl"
    >
      <el-form label-position="top" size="small" style="padding: 0 8px">
        <el-form-item label="数据表">
          <el-input :model-value="tableName" disabled />
        </el-form-item>

        <el-form-item label="接入类型">
          <el-select v-model="dsForm.source_type" style="width: 100%" @change="onTypeChange">
            <el-option v-for="t in SOURCE_TYPES" :key="t.code" :label="t.label" :value="t.code" />
          </el-select>
          <div v-if="currentType" style="margin-top: 6px; font-size: 12px; color: #909399; line-height: 1.5">
            {{ currentType.description }}
          </div>
        </el-form-item>

        <!-- 动态字段分组 -->
        <template v-if="currentType">
          <div v-for="grp in currentType.groups" :key="grp.title" style="margin-bottom: 8px">
            <div style="font-size: 12px; font-weight: 600; color: #909399; text-transform: uppercase; margin: 16px 0 12px; padding-bottom: 6px; border-bottom: 1px solid #f0f0f0">
              {{ grp.title }}
            </div>
            <el-form-item
              v-for="f in grp.fields" :key="f.key" :label="f.label" :required="f.required"
            >
              <el-input
                v-if="f.type === 'text' || f.type === 'url'"
                v-model="dsForm.config[f.key]"
                :placeholder="fieldPlaceholder(f.key, f.placeholder)"
              />
              <el-input
                v-else-if="f.type === 'password'"
                v-model="dsForm.config[f.key]"
                type="password" show-password
                :placeholder="fieldPlaceholder(f.key, f.placeholder)"
              />
              <el-input
                v-else-if="f.type === 'textarea'"
                v-model="dsForm.config[f.key]"
                type="textarea" :rows="4"
                :placeholder="f.placeholder"
              />
              <el-select
                v-else-if="f.type === 'select'"
                v-model="dsForm.config[f.key]"
                style="width: 100%"
              >
                <el-option v-for="opt in f.options" :key="opt.value" :label="opt.label" :value="opt.value" />
              </el-select>
              <div v-if="f.hint" style="font-size: 12px; color: #909399; margin-top: 4px">{{ f.hint }}</div>
            </el-form-item>
          </div>
        </template>

        <!-- 月度表月份偏移 -->
        <div v-if="isPeriodTable" style="margin-bottom: 8px">
          <div style="font-size: 12px; font-weight: 600; color: #909399; margin: 16px 0 12px; padding-bottom: 6px; border-bottom: 1px solid #f0f0f0">
            月份设置
          </div>
          <el-form-item label="月份偏移">
            <el-input-number v-model="monthOffset" :step="1" controls-position="right" style="width: 160px" />
            <div style="font-size: 12px; color: #909399; margin-top: 4px">
              当前将生成：<strong>{{ monthPreview }}</strong>
            </div>
          </el-form-item>
        </div>

        <!-- 调度与状态 -->
        <div style="margin-bottom: 8px">
          <div style="font-size: 12px; font-weight: 600; color: #909399; margin: 16px 0 12px; padding-bottom: 6px; border-bottom: 1px solid #f0f0f0">
            调度与状态
          </div>
          <el-form-item label="调度计划">
            <ScheduleSelector v-model:schedule="dsForm.schedule" :show-start-time="false" />
          </el-form-item>
          <el-form-item label="启用">
            <el-switch v-model="dsForm.is_active" active-text="启用" inactive-text="停用" />
          </el-form-item>
        </div>

        <!-- 测试结果 -->
        <div
          v-if="dsTestResult"
          :style="{
            padding: '10px 12px', borderRadius: 4, marginBottom: 12,
            background: dsTestResult.ok ? '#f0f9eb' : '#fef0f0',
            color: dsTestResult.ok ? '#67c23a' : '#f56c6c',
          }"
        >
          {{ dsTestResult.ok ? '✓' : '✕' }} {{ dsTestResult.message }}
        </div>
      </el-form>

      <template #footer>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <div>
            <el-button v-if="currentType?.testable" :loading="dsTesting" @click="dsTest" style="margin-right: 8px">
              测试连接
            </el-button>
          </div>
          <div>
            <el-button @click="dsDrawerVisible = false">取消</el-button>
            <el-button type="primary" :loading="dsSaving" @click="saveDS">保存</el-button>
          </div>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.ep-section {
  margin-bottom: 12px;
}
.ep-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}
.ep-row:last-child {
  border-bottom: none;
}
.ep-info {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ep-name {
  font-weight: 500;
  font-size: 14px;
}
.ep-meta {
  color: #909399;
  font-size: 12px;
}
.ep-stats {
  display: flex;
  align-items: center;
  gap: 12px;
}
</style>
