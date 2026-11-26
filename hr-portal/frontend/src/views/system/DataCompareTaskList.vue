<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { formatDateTime } from '@/utils/datetime'
import { dataCompareApi, type SkillOut, type CompareResult, type TaskOut, type RunOut, type RunDetail } from '@/api/data-compare'
import CompareDraftDialog from '@/components/data-compare/CompareDraftDialog.vue'
import CompareResultCard from '@/components/ai/CompareResultCard.vue'
import ScheduleBindingDialog from '@/components/ai/ScheduleBindingDialog.vue'
import PermissionButton from '@/components/PermissionButton.vue'
import UiSurface from '@/components/ui/UiSurface.vue'
import UiTable from '@/components/ui/UiTable.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiDialogShell from '@/components/ui/UiDialogShell.vue'
import UiListToolbar from '@/components/ui/UiListToolbar.vue'
import UiPagination from '@/components/ui/UiPagination.vue'
import UiCheckbox from '@/components/ui/UiCheckbox.vue'

const activeTab = ref('skills'), filterStatus = ref('')
const loading = ref(false), taskLoading = ref(false), taskSaving = ref(false)
const skills = ref<SkillOut[]>([]), skillsForSelect = ref<SkillOut[]>([]), tasks = ref<TaskOut[]>([])
const showCreateDialog = ref(false), showResult = ref(false), showTaskDialog = ref(false), showScheduleDialog = ref(false)
const editingSkill = ref<SkillOut | null>(null), scheduleTask = ref<TaskOut | null>(null)
const runningId = ref<number | null>(null), runningTaskId = ref<number | null>(null)
const lastResult = ref<CompareResult | null>(null)
const filterEnabled = ref<boolean | null>(null)
const taskForm = ref({ name: '', skill_id: null as number | null, description: '' })
const showHistory = ref(false), historyLoading = ref(false), historyTask = ref<number | null>(null)
const runs = ref<RunOut[]>([]), historyPage = ref(1), historyTotal = ref(0)
const showRun = ref(false), resultLoading = ref(false), runDetail = ref<RunDetail | null>(null), resultError = ref('')
const selected = ref<{ period: string; metric_id: string } | null>(null), onlyDiff = ref(true), detailPage = ref(1)
const groups = ref<Record<string, any>[]>([]), groupTotal = ref(0)
let resultSequence = 0, historySequence = 0
const taskColumns = [{ key: 'name', label: '任务名称' }, { key: 'compare_type', label: '类型' }, { key: 'sources', label: '来源' }, { key: 'cron_expression', label: '定时' }, { key: 'last_status', label: '上次执行' }, { key: 'actions', label: '操作', minWidth: 280 }]
const runColumns = [{ key: 'id', label: '运行编号' }, { key: 'started_at', label: '开始时间' }, { key: 'status', label: '状态' }, { key: 'diff_count', label: '差异数' }, { key: 'actions', label: '操作' }]
const summaryColumns = [{ key: 'period', label: '月份' }, { key: 'label', label: '指标' }, { key: 'amount_a', label: '报表 A' }, { key: 'amount_b', label: '注册表 B' }, { key: 'diff', label: '差额' }, { key: 'status', label: '状态' }, { key: 'actions', label: '维度差异' }]
const groupColumns = [{ key: 'dimension', label: '对齐后的维度分组' }, { key: 'amount_a', label: 'A 金额' }, { key: 'amount_b', label: 'B 金额' }, { key: 'diff', label: '差额' }, { key: 'status', label: '状态' }]
function errorText(e: any) { return e?.response?.data?.detail || e?.message || '请求失败' }
function reportSkill(s: SkillOut) { return 'kind' in s.params && s.params.kind === 'report_amount_v1' }
function reportTask(t: TaskOut) { return t.compare_type === 'report_amount_v1' || skillsForSelect.value.some(s => s.id === t.skill_id && reportSkill(s)) }
function typeLabel(type: string) { return ({ roster: '名单对比', field: '字段对比', amount: '金额对比', report_amount_v1: '报表金额' } as Record<string, string>)[type] || type }
function statusLabel(status: string) { return ({ active: '已启用', draft: '草稿', archived: '已归档', match: '一致', diff: '有差异', success: '成功', partial_diff: '有差异', failed: '失败', partial_success: '部分完成', data_incomplete: '数据不完整', permission_denied: '无权限', snapshot_invalid: '配置已变更，请重跑', unsupported: '暂不支持', only_in_a: '仅 A 有值', only_in_b: '仅 B 有值' } as Record<string, string>)[status] || status || '未执行' }
function editSkill(skill: SkillOut | null) { editingSkill.value = skill; showCreateDialog.value = true }
async function loadSkills() {
  loading.value = true
  try { skills.value = (await dataCompareApi.listSkills({ status: filterStatus.value || undefined })).items }
  catch (e) { ElMessage.error(errorText(e)) } finally { loading.value = false }
}
async function loadTasks() {
  taskLoading.value = true
  try {
    const [data, options] = await Promise.all([dataCompareApi.listTasks({ enabled: filterEnabled.value ?? undefined }), dataCompareApi.listSkills({ status: 'active' })])
    tasks.value = data.items; skillsForSelect.value = options.items
  } catch (e) { ElMessage.error(errorText(e)) } finally { taskLoading.value = false }
}
async function runSkill(skill: SkillOut) {
  if (reportSkill(skill)) { activeTab.value = 'tasks'; await loadTasks(); taskForm.value = { name: skill.name, skill_id: skill.id, description: '' }; showTaskDialog.value = true; return }
  runningId.value = skill.id
  try { lastResult.value = (await dataCompareApi.invokeSkill(skill.id)).result; showResult.value = true; await loadSkills() }
  catch (e) { ElMessage.error(errorText(e)) } finally { runningId.value = null }
}
async function deleteSkill(id: number) {
  try { await dataCompareApi.deleteSkill(id); await loadSkills() } catch (e) { ElMessage.error(errorText(e)) }
}
async function saveTask() {
  if (!taskForm.value.name.trim() || !taskForm.value.skill_id) { ElMessage.warning('请填写任务名称并选择配置'); return }
  taskSaving.value = true
  try { await dataCompareApi.createTask(taskForm.value); showTaskDialog.value = false; taskForm.value = { name: '', skill_id: null, description: '' }; await loadTasks(); ElMessage.success('任务已创建，请手动执行') }
  catch (e) { ElMessage.error(errorText(e)) } finally { taskSaving.value = false }
}
async function runTask(id: number) {
  runningTaskId.value = id
  try { const run = await dataCompareApi.runTask(id); await loadTasks(); await openRun(run.id) }
  catch (e) { ElMessage.error(errorText(e)) } finally { runningTaskId.value = null }
}
async function deleteTask(id: number) {
  try { await dataCompareApi.deleteTask(id); await loadTasks() } catch (e) { ElMessage.error(errorText(e)) }
}
async function viewRuns(taskId: number, page = 1) {
  historyTask.value = taskId; historyPage.value = page; showHistory.value = true; historyLoading.value = true
  const request = ++historySequence
  runs.value = []
  try { const data = await dataCompareApi.listRuns(taskId, { limit: 20, offset: (page - 1) * 20 }); if (request === historySequence) { runs.value = data.items; historyTotal.value = data.total } }
  catch (e) { if (request === historySequence) ElMessage.error(errorText(e)) } finally { if (request === historySequence) historyLoading.value = false }
}
async function openRun(id: number) {
  const request = ++resultSequence
  showRun.value = true; resultLoading.value = true; runDetail.value = null; selected.value = null; groups.value = []; resultError.value = ''
  try { const data = await dataCompareApi.getRun(id); if (request === resultSequence && showRun.value) runDetail.value = data }
  catch (e) { if (request === resultSequence) resultError.value = errorText(e) } finally { if (request === resultSequence) resultLoading.value = false }
}
async function drill(row: { period: string; metric_id: string }, page = 1) {
  if (!runDetail.value) return
  const runId = runDetail.value.id, request = ++resultSequence
  selected.value = row; detailPage.value = page; resultLoading.value = true; groups.value = []; groupTotal.value = 0; resultError.value = ''
  try {
    const data = await dataCompareApi.getRun(runId, { ...row, only_diff: onlyDiff.value, limit: 20, offset: (page - 1) * 20 })
    if (request !== resultSequence || !showRun.value) return
    groups.value = data.detail?.items || []; groupTotal.value = data.detail?.total || 0
  } catch (e) { if (request === resultSequence) resultError.value = errorText(e) } finally { if (request === resultSequence) resultLoading.value = false }
}
onMounted(loadSkills)
</script>

<template>
  <div class="data-compare-page"><UiSurface min-width="0">
    <h2>数据对比</h2>
    <el-tabs v-model="activeTab" @tab-change="activeTab === 'tasks' && loadTasks()">
      <el-tab-pane label="对比配置" name="skills">
        <UiListToolbar keyword=""><template #search /><template #filters><el-select v-model="filterStatus" placeholder="状态筛选" clearable @change="loadSkills"><el-option label="草稿" value="draft" /><el-option label="已启用" value="active" /><el-option label="已归档" value="archived" /></el-select></template><template #actions><PermissionButton menu="system.data_compare" op="C" type="primary" @click="editSkill(null)">新建对比</PermissionButton></template></UiListToolbar>
        <UiTable :rows="skills" :columns="[{ key: 'name', label: '配置名称' }, { key: 'type', label: '类型' }, { key: 'status', label: '状态' }, { key: 'instruction', label: '需求', minWidth: 260 }, { key: 'actions', label: '操作', minWidth: 240 }]" :loading="loading" row-key="id">
          <template #cell="{ row, column, value }">
            <span v-if="column.key === 'type'">{{ reportSkill(row) ? '报表金额' : typeLabel(row.params.compare_type) }}</span>
            <span v-else-if="column.key === 'status'">{{ statusLabel(row.status) }}</span>
            <template v-else-if="column.key === 'actions'"><PermissionButton menu="system.data_compare" op="U" size="small" :loading="runningId === row.id" @click="runSkill(row)">{{ reportSkill(row) ? '创建手动任务' : '运行' }}</PermissionButton><PermissionButton menu="system.data_compare" op="U" size="small" @click="editSkill(row)">编辑</PermissionButton><el-popconfirm title="确定删除此配置？" @confirm="deleteSkill(row.id)"><template #reference><PermissionButton menu="system.data_compare" op="D" size="small" type="danger" text>删除</PermissionButton></template></el-popconfirm></template>
            <span v-else>{{ value }}</span>
          </template>
        </UiTable>
      </el-tab-pane>
      <el-tab-pane label="任务与运行记录" name="tasks">
        <UiListToolbar keyword=""><template #search /><template #filters><el-select v-model="filterEnabled" placeholder="启用状态" clearable @change="loadTasks"><el-option label="已启用" :value="true" /><el-option label="未启用" :value="false" /></el-select></template><template #actions><PermissionButton menu="system.data_compare" op="C" type="primary" @click="showTaskDialog = true">新建任务</PermissionButton></template></UiListToolbar>
        <UiTable :columns="taskColumns" :rows="tasks" :loading="taskLoading" row-key="id"><template #cell="{ row, column, value }">
          <span v-if="column.key === 'compare_type'">{{ typeLabel(row.compare_type) }}</span><span v-else-if="column.key === 'sources'">{{ row.table_a }} → {{ row.table_b }}</span><span v-else-if="column.key === 'last_status'">{{ statusLabel(row.last_status) }}</span><span v-else-if="column.key === 'cron_expression'">{{ reportTask(row) ? '仅手动运行' : row.cron_expression || '未绑定' }}</span>
          <template v-else-if="column.key === 'actions'"><PermissionButton menu="system.data_compare" op="U" size="small" :loading="runningTaskId === row.id" @click="runTask(row.id)">执行</PermissionButton><PermissionButton v-if="!reportTask(row)" menu="system.data_compare" op="U" size="small" @click="scheduleTask = row; showScheduleDialog = true">定时</PermissionButton><PermissionButton menu="system.data_compare" op="V" size="small" @click="viewRuns(row.id)">记录</PermissionButton><el-popconfirm title="确定删除此任务？" @confirm="deleteTask(row.id)"><template #reference><PermissionButton menu="system.data_compare" op="D" size="small" type="danger" text>删除</PermissionButton></template></el-popconfirm></template><span v-else>{{ value }}</span>
        </template></UiTable>
      </el-tab-pane>
    </el-tabs>
    <CompareDraftDialog v-model="showCreateDialog" :skill="editingSkill" @saved="loadSkills" />
    <UiDialogShell v-model="showResult" title="对比结果"><CompareResultCard v-if="lastResult" :result="lastResult" /><template #footer><UiButton @click="showResult = false">关闭</UiButton></template></UiDialogShell>
    <UiDialogShell v-model="showTaskDialog" title="新建任务" :loading="taskSaving">
      <el-form label-position="top"><el-form-item label="任务名称" required><el-input v-model="taskForm.name" /></el-form-item><el-form-item label="关联配置" required><el-select v-model="taskForm.skill_id" filterable><el-option v-for="s in skillsForSelect" :key="s.id" :label="s.name" :value="s.id" /></el-select></el-form-item><el-form-item label="描述"><el-input v-model="taskForm.description" type="textarea" /></el-form-item></el-form>
      <template #footer><UiButton @click="showTaskDialog = false">取消</UiButton><PermissionButton menu="system.data_compare" op="C" type="primary" :loading="taskSaving" @click="saveTask">创建（不执行）</PermissionButton></template>
    </UiDialogShell>
    <ScheduleBindingDialog v-model="showScheduleDialog" :task="scheduleTask" @saved="loadTasks" />
    <UiDialogShell v-model="showHistory" title="运行历史" width="90vw">
      <UiTable :columns="runColumns" :rows="runs" :loading="historyLoading" row-key="id"><template #cell="{ row, column, value }"><UiButton v-if="column.key === 'actions'" @click="openRun(row.id)">查看结果</UiButton><span v-else-if="column.key === 'started_at'">{{ formatDateTime(value) }}</span><span v-else-if="column.key === 'status'">{{ statusLabel(value) }}</span><span v-else>{{ value }}</span></template></UiTable>
      <UiPagination :page="historyPage" :page-size="20" :total="historyTotal" :show-size="false" @page-change="viewRuns(historyTask!, $event)" />
      <template #footer><UiButton @click="showHistory = false">关闭</UiButton></template>
    </UiDialogShell>
    <UiDialogShell v-model="showRun" :title="`运行结果 #${runDetail?.id || ''}`" width="90vw" @close="resultSequence++">
      <el-alert v-if="resultError" :title="resultError" type="error" :closable="false" />
      <template v-if="runDetail?.summary?.items">
        <p>以下总额来自本次运行完整快照，筛选及翻页不改变总额；一致月份也可查看组间抵消差异。</p>
        <UiTable :columns="summaryColumns" :rows="runDetail.summary.items" :loading="resultLoading" row-key="metric_id"><template #cell="{ row, column, value }"><UiButton v-if="column.key === 'actions'" @click="drill({ period: row.period, metric_id: row.metric_id })">查看维度</UiButton><span v-else-if="column.key === 'status'">{{ statusLabel(value) }}</span><span v-else>{{ value ?? '—' }}</span></template></UiTable>
        <template v-if="selected"><h3>{{ selected.period }} · {{ selected.metric_id }}</h3><UiCheckbox v-model="onlyDiff" :disabled="resultLoading" @update:model-value="drill(selected!)">仅看差异组</UiCheckbox><UiTable :columns="groupColumns" :rows="groups" :loading="resultLoading"><template #cell="{ column, value }"><span>{{ column.key === 'status' ? statusLabel(value) : value ?? '—' }}</span></template></UiTable><UiPagination :page="detailPage" :page-size="20" :total="groupTotal" :show-size="false" @page-change="drill(selected!, $event)" /></template>
      </template>
      <CompareResultCard v-else-if="runDetail?.detail?.compare_type" :result="runDetail.detail as unknown as CompareResult" />
      <el-alert v-else-if="runDetail" :title="runDetail.error_message || statusLabel(runDetail.status)" type="info" :closable="false" />
      <p v-else-if="resultLoading">正在读取运行快照…</p>
      <template #footer><UiButton @click="showRun = false; resultSequence++">关闭</UiButton></template>
    </UiDialogShell>
  </UiSurface></div>
</template>

<style scoped>
.data-compare-page { padding: var(--spacing-6); }
h2 { margin: 0 0 var(--spacing-4); font-size: var(--font-size-lg); }
h3 { font-size: var(--font-size-md); margin-top: var(--spacing-4); }
p { color: var(--color-text-secondary); font-size: var(--font-size-sm); }
</style>
