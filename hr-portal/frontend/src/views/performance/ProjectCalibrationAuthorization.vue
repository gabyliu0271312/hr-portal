<template>
  <div class="calibration-authorization">
    <UiPageHeader title="校准任务授权" @back="goBack" />
    <div class="calibration-toolbar">
      <div class="cycle-picker"><PerformanceSearchSelect class="cycle-select" selection-style="plain" :model-value="String(cycleId)" :options="cycleOptions" aria-label="选择绩效周期" placeholder="选择绩效周期" @update:model-value="selectCycle" /></div>
    </div>
    <section class="calibration-surface">
      <PerformancePromptNotice type="info" multiline class="info-banner">以下校准任务均在你的管理范围内，你可协助校准人再将相应任务授权他人校准。{{ stageWindow ? `本阶段起止时间：${stageWindow.start} – ${stageWindow.end}` : '校准任务阶段时间以当前周期流程配置为准。' }}</PerformancePromptNotice>
      <PerformanceListToolbar v-model:keyword="keyword" search-placeholder="搜索成员" search-aria-label="搜索成员" search-fill filter-disabled @search="load" @clear="load" />
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
        :total="visibleRows.length"
        scroll-mode="page"
        row-key="id"
        @page-change="page = $event"
      >
        <template #cell="{ row, column }">
          <span v-if="column.key === 'calibrator'" class="authorization-person" :style="{ paddingLeft: `calc(${row.depth} * var(--performance-authorization-tree-indent))` }">
            <button v-if="row.hasChildren" class="authorization-expand" type="button" :aria-label="`${collapsed.has(row.id) ? '展开' : '收起'}${row.calibrator}的授权`" :aria-expanded="!collapsed.has(row.id)" @click="toggleAuthorization(row.id)"><svg :class="{ 'is-collapsed': collapsed.has(row.id) }" viewBox="0 0 24 24" aria-hidden="true"><path d="M11.22 18.46a1 1 0 0 0 1.56 0l8.305-10.334a1 1 0 0 0-.78-1.626H3.696a1 1 0 0 0-.78 1.626L11.22 18.46Z" fill="currentColor" /></svg></button>
            <span v-else class="authorization-expand-placeholder" aria-hidden="true" />
            <PerformanceMemberIdentity :display-name="row.calibrator" size="sm" />
          </span>
          <span v-else-if="column.key === 'status'" class="status-cell" :class="{ 'is-pending': row.status !== '已校准' }"><i />{{ row.status }}</span>
          <template v-else-if="column.key === 'scope'">
            <PerformanceCalibrationRuleSummary v-for="(rule, index) in row.scope_rules || []" v-show="!simpleScope(row)" :key="index" :rule="rule" :people-options="scopePeople(row)" />
            <span v-if="simpleScope(row) || !row.scope_rules?.length">{{ row.scope }}</span>
          </template>
          <button v-else-if="column.key === 'authorized_count'" type="button" class="count-link" @click="openPeople(row, false)">{{ row.authorized_count }}</button>
          <template v-else-if="column.key === 'unauthorized_count'"><button v-if="row.unauthorized_count != null" type="button" class="count-link" @click="openPeople(row, true)">{{ row.unauthorized_count }}</button><span v-else>-</span></template>
          <span v-else-if="column.key === 'distribution_rule'" class="distribution-cell">{{ row.distribution_rule || '--' }}<PerformanceInfoPopover v-if="row.distribution_info?.groups?.length || row.distribution_info?.lines?.length" class="distribution-info" :content="row.distribution_info?.lines || []" :groups="row.distribution_info?.groups" width="auto" aria-label="查看分布规则" /></span>
          <span v-else-if="column.key === 'action'" class="actions">
            <PerformanceInfoPopover :content="authorizeReason(row)" variant="disabled-action" width="auto"><button type="button" :disabled="!row.can_authorize || !row.allow_authorize || !row.task_ids.length || loading || saving" @click="openAuthorization(row)">协助授权</button></PerformanceInfoPopover>
            <PerformanceInfoPopover :content="revokeReason(row)" variant="disabled-action" :width="row.source === 'BACKEND' ? 206 : 'auto'"><button type="button" :disabled="row.source === 'BACKEND' || !row.can_revoke || !row.authorizations.length || loading || saving" @click="revoke(row)">撤销授权</button></PerformanceInfoPopover>
          </span>
          <span v-else-if="column.key === 'authorized_at'">{{ formatDate(row.authorized_at) }}</span>
          <span v-else>{{ row[column.key] || '--' }}</span>
        </template>
      </PerformanceManagementTable>
      <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    </section>
    <FocusGroupPeopleDialog v-model="peopleOpen" :title="peopleUnauthorized ? '未授权人员' : '可校准人员'" :subtitle="peopleSubtitle" :columns="peopleColumns" :rows="peopleRows" :loading="loading" :error="error" />
    <PerformanceTaskDelegationDialog v-model="dialogOpen" action="AUTHORIZE" calibration :read-only="target?.status === '已校准'" :tasks="delegationTasks" :distribution-lines="distributionLines" :has-distribution-rules="target?.distribution_info?.force_distribution_enabled" @completed="authorized" />
    <PerformanceConfirmDialog v-model="confirmOpen" message="确定撤销授权吗?" :details="revokeDetails" cancel-text="保留" confirm-text="撤销" :loading="saving" @confirm="confirmRevoke" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { projectManagementApi, type ProjectCalibrationAuthorization } from '@/api/performance'
import { usePerformanceProjectContextStore } from '@/stores/performanceProjectContext'
import UiPageHeader from '@/components/ui/UiPageHeader.vue'
import PerformanceSearchSelect from '@/components/performance/PerformanceSearchSelect.vue'
import PerformancePromptNotice from '@/components/performance/PerformancePromptNotice.vue'
import PerformanceMemberIdentity from '@/components/performance/PerformanceMemberIdentity.vue'
import PerformanceListToolbar from '@/components/performance/PerformanceListToolbar.vue'
import PerformanceManagementTable from '@/components/performance/PerformanceManagementTable.vue'
import PerformanceTaskDelegationDialog from '@/components/performance/PerformanceTaskDelegationDialog.vue'
import PerformanceConfirmDialog from '@/components/performance/PerformanceConfirmDialog.vue'
import PerformanceInfoPopover from '@/components/performance/PerformanceInfoPopover.vue'
import PerformanceCalibrationRuleSummary from '@/components/performance/PerformanceCalibrationRuleSummary.vue'
import FocusGroupPeopleDialog from '@/components/performance/focus-group/FocusGroupPeopleDialog.vue'

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
const stageWindow = ref<{ start: string; end: string } | null>(null)
const page = ref(1)
const collapsed = ref(new Set<string>())
const visibleRows = computed(() => {
  const children = new Map<string | null, typeof rows.value>()
  const ids = new Set(rows.value.map(row => row.id))
  for (const row of rows.value) {
    const parent = row.parent_id && row.parent_id !== row.id && ids.has(row.parent_id) ? row.parent_id : null
    children.set(parent, [...(children.get(parent) || []), row])
  }
  const visible: Array<typeof rows.value[number] & { depth: number; hasChildren: boolean }> = []
  const visited = new Set<string>()
  const visit = (row: typeof rows.value[number], depth: number) => {
    if (visited.has(row.id)) return
    visited.add(row.id)
    visible.push({ ...row, depth, hasChildren: Boolean(children.get(row.id)?.length) })
    if (!collapsed.value.has(row.id)) for (const child of children.get(row.id) || []) visit(child, depth + 1)
  }
  for (const row of children.get(null) || []) visit(row, 0)
  return visible
})
const pageRows = computed(() => visibleRows.value.slice((page.value - 1) * 50, page.value * 50))
function toggleAuthorization(id: string) {
  const next = new Set(collapsed.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  collapsed.value = next
  page.value = 1
}
let sequence = 0
const dialogOpen = ref(false)
const saving = ref(false)
const confirmOpen = ref(false)
const revokeTarget = ref<ProjectCalibrationAuthorization | null>(null)
const revokeDetails = computed(() => [
  '撤销后，被授权人的校准任务和由该任务授权产生的子任务将会回收。',
  ...(revokeTarget.value?.notify_original === true ? ['由于授权时选择了通知原校准人，故本次撤销也会通知原校准人。'] : revokeTarget.value?.notify_original === false ? ['由于授权时选择了不通知原校准人，故本次撤销也不会通知原校准人。'] : []),
])
const target = ref<ProjectCalibrationAuthorization | null>(null)
const peopleOpen = ref(false)
const peopleTarget = ref<ProjectCalibrationAuthorization | null>(null)
const peopleUnauthorized = ref(false)
const peopleRows = computed(() => {
  const row = peopleTarget.value
  const ids = new Set(row?.unauthorized_task_ids || [])
  return (row?.task_people || []).filter(person => !peopleUnauthorized.value || ids.has(person.task_id))
})
const peopleSubtitle = computed(() => peopleTarget.value ? `校准范围：${peopleTarget.value.scope}${peopleTarget.value.end_at ? `　截止时间：${formatDate(peopleTarget.value.end_at)}` : ''}` : '')
const peopleColumns = [
  { key: 'display_name', label: '被评估人', width: 284, fixed: true }, { key: 'department', label: '一级部门', width: 227 },
  { key: 'leaf_department', label: '末级部门', width: 227 }, { key: 'direct_supervisor_name', label: '直属上级', width: 227 }, { key: 'job_sequence', label: '序列', width: 227 },
]
function openPeople(row: ProjectCalibrationAuthorization, unauthorized: boolean) { peopleTarget.value = row; peopleUnauthorized.value = unauthorized; peopleOpen.value = true }
function simpleScope(row: ProjectCalibrationAuthorization) { return ['项目全员', '全部下级', '直属下级', '间接下级', '任务内全部人员', '被授权人的全部实线下级'].includes(row.scope) }
function scopePeople(row: ProjectCalibrationAuthorization) { return (row.task_people || []).map(person => ({ value: person.employee_no, label: person.display_name })) }
function authorizeReason(row: ProjectCalibrationAuthorization) { return !row.allow_authorize ? '此任务不允许授权他人校准' : !row.can_authorize ? '暂无校准任务授权权限' : '' }
function revokeReason(row: ProjectCalibrationAuthorization) { return row.source === 'BACKEND' ? '请联系管理员在「项目设置」中移除此用户的校准权限' : !row.can_revoke ? '暂无撤销授权权限' : '' }
const delegationTasks = computed(() => target.value ? target.value.task_ids.map(task_id => ({ task_id, project_id: target.value!.project_id, ...(target.value!.source_rule_id ? { source_rule_id: target.value!.source_rule_id } : {}), ...target.value!.task_people?.find(person => person.task_id === task_id), ...(target.value!.source_authorization_ids?.[String(task_id)] ? { source_authorization_id: target.value!.source_authorization_ids[String(task_id)] } : {}) })) : [])
const distributionLines = computed(() => target.value?.distribution_info?.lines ?? [])
const columns = computed(() => [
  { key: 'calibrator', label: '被授权人', width: 224, fixed: true }, { key: 'status', label: '校准状态', width: 144 },
  { key: 'scope', label: '校准范围', width: 180 }, { key: 'authorized_count', label: '可校准人数', width: 144 },
  { key: 'allow', label: '是否允许授权他人', width: 176 }, { key: 'unauthorized_count', label: '未授权人数', width: 144 },
  { key: 'distribution_rule', label: '分布规则', width: 168 }, { key: 'authorized_by', label: '授权人', width: 180 },
  { key: 'authorized_at', label: '发起授权时间', width: 200 }, { key: 'action', label: '操作', width: 180, fixed: 'right' as const },
].filter(column => column.key !== 'distribution_rule' || rows.value.some(row => row.distribution_info?.force_distribution_enabled)))
async function load() {
  if (!cycleId.value) { error.value = '请选择绩效周期'; return }
  const current = ++sequence
  loading.value = true; error.value = ''; rows.value = []; page.value = 1
  try {
    const result = await projectManagementApi.calibrationAuthorization(cycleId.value)
    if (current !== sequence) return
    stageWindow.value = result.start_at && result.end_at ? { start: formatDate(result.start_at), end: formatDate(result.end_at) } : null
    collapsed.value = new Set()
    rows.value = result.items.filter(item => !keyword.value.trim() || item.calibrator.toLowerCase().includes(keyword.value.trim().toLowerCase())).map(item => ({ ...item, allow: item.allow_authorize ? '是' : '否' }))
  } catch { if (current === sequence) error.value = '校准授权加载失败，请稍后重试' } finally { if (current === sequence) loading.value = false }
}
function openAuthorization(row: ProjectCalibrationAuthorization) { if (!row.can_authorize || !row.allow_authorize || !row.task_ids.length || loading.value || saving.value) return; target.value = row; dialogOpen.value = true }
function authorized(count: number, _notificationStatus?: string, _recordId?: number, skippedCount = 0) { notice.value = `已授权 ${count} 个任务${skippedCount ? `，跳过 ${skippedCount} 个无原处理人任务` : ''}`; void load() }
function revoke(row: ProjectCalibrationAuthorization) { if (row.source === 'BACKEND' || !row.can_revoke || loading.value || saving.value || !row.authorizations.length) return; revokeTarget.value = row; confirmOpen.value = true }
async function confirmRevoke() {
  const row = revokeTarget.value
  if (!row || saving.value) return
  saving.value = true
  confirmOpen.value = false
  try { for (const record of row.authorizations) await projectManagementApi.revokeTaskAuthorization(row.project_id, record.task_id, record.id); await load(); notice.value = '授权已撤销，历史内容保留' } catch { notice.value = '部分撤销结果未确认，请刷新后重试' } finally { saving.value = false; revokeTarget.value = null }
}
function formatDate(value: string | null) { return value ? new Date(value).toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).slice(0, 16) + '（GMT+8）' : '--' }
function selectCycle(value: string | string[] | null) {
  cycleId.value = Number(value)
  page.value = 1
  const { project_id: _project, ...query } = route.query
  void router.replace({ query: { ...query, cycle_id: String(cycleId.value) } })
}
function goBack() { void router.push({ name: 'PerformanceProjectManagement', query: { cycle_id: String(cycleId.value), management_role: route.query.management_role, project_id: route.query.project_id } }) }
watch(() => [route.query.cycle_id, route.query.management_role, route.query.project_id], () => {
  cycleId.value = Number(route.query.cycle_id || cycleStore.activeCycleId || 0)
  peopleOpen.value = false
  peopleTarget.value = null
  dialogOpen.value = false
  confirmOpen.value = false
  target.value = null
  revokeTarget.value = null
  stageWindow.value = null
  notice.value = ''
  void load()
})
onMounted(async () => { try { if (!cycleStore.navigationReady) await cycleStore.ensureNavigation(cycleId.value); await load() } catch { error.value = '校准授权加载失败，请稍后重试' } })
</script>

<style scoped>
.calibration-authorization :deep(.performance-sort-header) { font-weight:400; height:22px; }
.calibration-authorization :deep(thead .feishu-cell) { font-weight:400; }

:where(.project-management-page, .project-reminder-page, .authorization-records, .calibration-authorization) { font-family: 'Helvetica Neue', Tahoma, 'PingFang SC', 'Microsoft Yahei', Arial, 'Hiragino Sans GB', sans-serif; }

.calibration-authorization { position:relative; display:flex; width:100vw; height:100vh; min-width:0; min-height:0; flex-direction:column; overflow:auto; background:#f5f6f7; color:#1f2329; }
.calibration-toolbar { display:flex; justify-content:flex-end; padding:calc(var(--layout-topbar-height) + 20px) 24px 12px; }
.cycle-picker { flex:0 0 186px; width:186px; margin-left:auto; }
.cycle-picker :deep(.performance-select-shell) { width:100%; }
.calibration-surface { min-width:0; min-height:0; flex:1; margin:0 20px 24px; padding:24px; border-radius:8px; background:#fff; }
.info-banner { margin-bottom:var(--spacing-4); }
.authorization-person { display:flex; align-items:center; min-width:0; }
.authorization-expand, .authorization-expand-placeholder { display:inline-flex; align-items:center; justify-content:center; flex:0 0 var(--spacing-4); width:var(--spacing-4); height:var(--spacing-6); margin-right:var(--spacing-1); padding:0; border:0; background:transparent; color:var(--color-text-secondary); }
.authorization-expand { cursor:pointer; }
.authorization-expand svg { width:var(--spacing-2); height:var(--spacing-2); }
.authorization-expand svg.is-collapsed { transform:rotate(-90deg); }
.status-cell { display:inline-flex; align-items:center; gap:8px; }
.status-cell.is-pending i { background: var(--color-text-warning-strong); }
.status-cell i { width:8px; height:8px; border-radius:50%; background:#34b658; }
.count-link { padding:0; border:0; background:none; color:var(--color-primary); font:inherit; cursor:pointer; }
.count-link:hover { color:var(--color-primary-hover); }
.distribution-cell { display:inline-flex; align-items:center; gap:var(--spacing-1); }
.distribution-info { --performance-info-icon-size:14px; }
.distribution-info :deep(.performance-info-popover__anchor:hover) { color:var(--color-primary) !important; }
.notice { color:#646a73; }
</style>

<style scoped>
.actions { display:inline-flex; gap:12px; }
.actions button { padding:0; border:0; background:transparent; color:#3370ff; font:inherit; cursor:pointer; }
.actions button:disabled { color:#bbbfc4; cursor:not-allowed; }
textarea { width:100%; box-sizing:border-box; border:1px solid #d0d3d6; border-radius:6px; padding:8px; font:inherit; }
</style>
