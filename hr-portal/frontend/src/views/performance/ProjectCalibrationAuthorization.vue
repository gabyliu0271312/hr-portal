<template>
  <div class="calibration-authorization">
    <UiPageHeader title="校准任务授权" @back="goBack" />
    <div class="calibration-toolbar">
      <PerformanceSearchSelect class="cycle-select" selection-style="plain" :model-value="String(cycleId)" :options="cycleOptions" aria-label="选择绩效周期" placeholder="选择绩效周期" @update:model-value="selectCycle" />
    </div>
    <section class="calibration-surface">
      <div class="info-banner">以下校准任务均在你的管理范围内，你可协助校准人再将相应任务授权他人校准。校准任务阶段时间以当前周期流程配置为准。</div>
      <PerformanceListToolbar v-model:keyword="keyword" search-placeholder="搜索成员" search-aria-label="搜索成员" search-fill search-width="100%" :gap="12" filter-disabled @search="load" @clear="load" />
      <PerformanceManagementTable
        :rows="pageRows"
        :columns="columns"
        :loading="loading"
        loading-text="正在加载校准授权…"
        :empty-text="error || '暂无校准授权记录'"
        table-aria-label="校准任务授权"
        pagination-aria-label="校准授权分页"
        :page="page"
        :page-size="50"
        :total="rows.length"
        scroll-mode="page"
        row-key="id"
        @page-change="page = $event"
      >
        <template #cell="{ row, column }">
          <span v-if="column.key === 'status'" class="status-cell" :class="{ 'is-pending': row.status !== '已校准' }"><i />{{ row.status }}</span>
          <span v-else-if="column.key === 'scope'" class="scope-tag">{{ row.scope }}</span>
          <span v-else-if="column.key === 'authorized_count'" class="count-link">{{ row.authorized_count }}</span>
          <span v-else-if="column.key === 'unauthorized_count'" class="count-link">{{ row.unauthorized_count ?? '--' }}</span>
          <span v-else-if="column.key === 'action'" class="actions"><button type="button" :disabled="!row.allow_authorize || !row.task_ids.length || loading" @click="openAuthorization(row)">协助授权</button><button type="button" :disabled="!row.authorizations.length || loading" @click="revoke(row)">撤销授权</button></span>
          <span v-else-if="column.key === 'authorized_at'">{{ formatDate(row.authorized_at) }}</span>
          <span v-else>{{ row[column.key] || '--' }}</span>
        </template>
      </PerformanceManagementTable>
      <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    </section>
    <PerformanceTaskDelegationDialog v-model="dialogOpen" action="AUTHORIZE" calibration :read-only="target?.status === '已校准'" :tasks="delegationTasks" @completed="authorized" />
    <PerformanceConfirmDialog v-model="confirmOpen" :message="`确认撤销${revokeTarget?.calibrator || '该校准人'}的任务授权？`" description="本次将撤销该行全部有效授权，历史内容保留。" confirm-text="撤销授权" confirm-variant="primary" :loading="saving" @confirm="confirmRevoke" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { projectManagementApi, type ProjectCalibrationAuthorization } from '@/api/performance'
import { usePerformanceProjectContextStore } from '@/stores/performanceProjectContext'
import UiPageHeader from '@/components/ui/UiPageHeader.vue'
import PerformanceSearchSelect from '@/components/performance/PerformanceSearchSelect.vue'
import PerformanceListToolbar from '@/components/performance/PerformanceListToolbar.vue'
import PerformanceManagementTable from '@/components/performance/PerformanceManagementTable.vue'
import PerformanceTaskDelegationDialog from '@/components/performance/PerformanceTaskDelegationDialog.vue'
import PerformanceConfirmDialog from '@/components/performance/PerformanceConfirmDialog.vue'

const route = useRoute()
const router = useRouter()
const cycleStore = usePerformanceProjectContextStore()
const cycleId = ref(Number(route.query.cycle_id || cycleStore.activeCycleId || 0))
const cycleOptions = computed(() => cycleStore.cycles.map(item => ({ value: String(item.cycle_id), label: item.cycle_name })))
const keyword = ref('')
const rows = ref<Array<ProjectCalibrationAuthorization & { allow: string }>>([])
const loading = ref(false)
const error = ref('')
const notice = ref('')
const page = ref(1)
const pageRows = computed(() => rows.value.slice((page.value - 1) * 50, page.value * 50))
let sequence = 0
const dialogOpen = ref(false)
const saving = ref(false)
const confirmOpen = ref(false)
const revokeTarget = ref<ProjectCalibrationAuthorization | null>(null)
const target = ref<ProjectCalibrationAuthorization | null>(null)
const delegationTasks = computed(() => target.value ? target.value.task_ids.map(task_id => ({ task_id, project_id: target.value!.project_id, ...target.value!.task_people?.find(person => person.task_id === task_id) })) : [])
const columns = [
  { key: 'calibrator', label: '被授权人', width: 224, fixed: true }, { key: 'status', label: '校准状态', width: 144 },
  { key: 'scope', label: '校准范围', width: 180 }, { key: 'authorized_count', label: '可校准人数', width: 144 },
  { key: 'allow', label: '是否允许授权他人', width: 176 }, { key: 'unauthorized_count', label: '未授权人数', width: 144 },
  { key: 'distribution_rule', label: '分布规则', width: 168 }, { key: 'authorized_by', label: '授权者', width: 180 },
  { key: 'authorized_at', label: '最近授权时间', width: 180 }, { key: 'action', label: '操作', width: 180 },
]
async function load() {
  if (!cycleId.value) { error.value = '请选择绩效周期'; return }
  const current = ++sequence
  loading.value = true; error.value = ''; rows.value = []; page.value = 1
  try {
    const result = await projectManagementApi.calibrationAuthorization(cycleId.value)
    if (current !== sequence) return
    rows.value = result.items.filter(item => !keyword.value.trim() || item.calibrator.toLowerCase().includes(keyword.value.trim().toLowerCase())).map(item => ({ ...item, allow: item.allow_authorize ? '是' : '否' }))
  } catch { if (current === sequence) error.value = '校准授权加载失败，请稍后重试' } finally { if (current === sequence) loading.value = false }
}
function openAuthorization(row: ProjectCalibrationAuthorization) { target.value = row; dialogOpen.value = true }
function authorized(count: number, _notificationStatus?: string, _recordId?: number, skippedCount = 0) { notice.value = `已授权 ${count} 个任务${skippedCount ? `，跳过 ${skippedCount} 个无原处理人任务` : ''}`; void load() }
function revoke(row: ProjectCalibrationAuthorization) { if (saving.value || !row.authorizations.length) return; revokeTarget.value = row; confirmOpen.value = true }
async function confirmRevoke() {
  const row = revokeTarget.value
  if (!row || saving.value) return
  saving.value = true
  confirmOpen.value = false
  try { for (const record of row.authorizations) await projectManagementApi.revokeTaskAuthorization(row.project_id, record.task_id, record.id); await load(); notice.value = '授权已撤销，历史内容保留' } catch { notice.value = '部分撤销结果未确认，请刷新后重试' } finally { saving.value = false; revokeTarget.value = null }
}
function formatDate(value: string | null) { return value ? new Date(value).toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).slice(0, 16) + '（GMT+8）' : '--' }
function selectCycle(value: string | string[] | null) { cycleId.value = Number(value); page.value = 1; void router.replace({ query: { ...route.query, cycle_id: String(cycleId.value) } }) }
function goBack() { void router.push({ name: 'PerformanceProjectManagement', query: { cycle_id: String(cycleId.value) } }) }
watch(cycleId, () => void load())
onMounted(async () => { try { if (!cycleStore.navigationReady) await cycleStore.ensureNavigation(cycleId.value); await load() } catch { error.value = '校准授权加载失败，请稍后重试' } })
</script>

<style scoped>
.calibration-authorization :deep(.performance-sort-header) { font-weight:400; height:22px; }
.calibration-authorization :deep(thead .feishu-cell) { font-weight:400; }

:where(.project-management-page, .project-reminder-page, .authorization-records, .calibration-authorization) { font-family: 'Helvetica Neue', Tahoma, 'PingFang SC', 'Microsoft Yahei', Arial, 'Hiragino Sans GB', sans-serif; }

.calibration-authorization { position:relative; display:flex; width:100vw; height:100vh; min-width:0; min-height:0; flex-direction:column; overflow:auto; background:#f5f6f7; color:#1f2329; }
.calibration-toolbar { display:flex; justify-content:flex-end; padding:calc(var(--layout-topbar-height) + 20px) 24px 12px; }
.calibration-toolbar :deep(.cycle-select) { flex:0 0 186px; width:186px; }
.calibration-surface { min-width:0; min-height:0; flex:1; margin:0 20px 24px; padding:24px; border-radius:8px; background:#fff; }
.info-banner { margin-bottom:24px; padding:12px 16px; border-radius:8px; background:#eff3ff; color:#1f2329; font-size:14px; line-height:22px; }
.status-cell { display:inline-flex; align-items:center; gap:8px; }
.status-cell.is-pending i { background: var(--color-text-warning-strong); }
.status-cell i { width:8px; height:8px; border-radius:50%; background:#34b658; }
.scope-tag { padding:4px 8px; border-radius:4px; background:#eff0f1; }
.count-link { color:#3370ff; }
.notice { color:#646a73; }
</style>

<style scoped>
.actions { display:inline-flex; gap:12px; }
.actions button { padding:0; border:0; background:transparent; color:#3370ff; font:inherit; cursor:pointer; }
.actions button:disabled { color:#bbbfc4; cursor:not-allowed; }
textarea { width:100%; box-sizing:border-box; border:1px solid #d0d3d6; border-radius:6px; padding:8px; font:inherit; }
</style>
