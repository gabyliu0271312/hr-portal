<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useUserStore } from '@/stores/user'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh, VideoPlay, Edit, Delete, Clock, RefreshRight } from '@element-plus/icons-vue'
import { api } from '@/api/client'
import { schedulerApi } from '@/api/scheduler'
import ScheduleConfigDialog from '@/components/common/ScheduleConfigDialog.vue'

const userStore = useUserStore()
const jobs = ref<any[]>([])
const runs = ref<any[]>([])
const loading = ref(false)

async function load() {
  loading.value = true
  try { const res = await api.get('/warehouse/snapshots'); jobs.value = res.data.items } catch { jobs.value = [] }
  finally { loading.value = false }
}

const dialogVisible = ref(false); const editId = ref<number | null>(null)
const form = ref({ name: '', source_table: '', target_table: '', snapshot_keys: [] as string[], period: 'monthly', retention: 12 })
const saving = ref(false); const keysInput = ref('')

function openCreate() { editId.value = null; form.value = { name: '', source_table: '', target_table: '', snapshot_keys: [], period: 'monthly', retention: 12 }; dialogVisible.value = true }
function openEdit(j: any) { editId.value = j.id; form.value = { name: j.name, source_table: j.source_table, target_table: j.target_table, snapshot_keys: j.snapshot_keys || [], period: j.period || 'monthly', retention: j.retention || 12 }; dialogVisible.value = true }

function addKey() { const v = keysInput.value.trim(); if (v && !form.value.snapshot_keys.includes(v)) form.value.snapshot_keys.push(v); keysInput.value = '' }
function removeKey(k: string) { form.value.snapshot_keys = form.value.snapshot_keys.filter(x => x !== k) }

async function save() {
  saving.value = true
  try {
    if (editId.value) { await api.patch(`/warehouse/snapshots/${editId.value}`, form.value); ElMessage.success('已更新') }
    else { await api.post('/warehouse/snapshots', form.value); ElMessage.success('已创建') }
    dialogVisible.value = false; load()
  } catch (e: any) { ElMessage.error(e?.response?.data?.detail || '保存失败') } finally { saving.value = false }
}

async function doDelete(id: number) {
  try { await ElMessageBox.confirm('确定删除？', '确认', { type: 'warning' }); await api.delete(`/warehouse/snapshots/${id}`); ElMessage.success('已删除'); load() } catch { }
}

const triggerVisible = ref(false); const triggerJobId = ref<number | null>(null); const triggerPeriod = ref(''); const triggering = ref(false)
const runsVisible = ref(false); const runsJobId = ref(0)
const retrying = ref<Set<number>>(new Set())

function openTrigger(jobId: number) { triggerJobId.value = jobId; triggerPeriod.value = new Date().toISOString().substring(0, 7); triggerVisible.value = true }
async function doTrigger() {
  triggering.value = true
  try { await api.post(`/warehouse/snapshots/${triggerJobId.value}/trigger`, { period_value: triggerPeriod.value }); ElMessage.success('快照已触发'); triggerVisible.value = false; load() }
  catch (e: any) { ElMessage.error(e?.response?.data?.detail || '触发失败') } finally { triggering.value = false }
}

async function showRuns(jobId: number) {
  runsJobId.value = jobId
  try { const res = await api.get('/warehouse/snapshots/runs', { params: { job_id: jobId, page_size: 50 } }); runs.value = res.data.items; runsVisible.value = true } catch { runs.value = [] }
}

async function retryRun(runId: number) {
  retrying.value.add(runId)
  try {
    const res = await schedulerApi.retryRun(runId, '手动重试快照')
    if (res.ok) { ElMessage.success('重跑成功'); showRuns(runsJobId.value) }
    else { ElMessage.error(res.message || '重跑失败') }
  } catch (e: any) { ElMessage.error(e?.response?.data?.detail || '重跑失败') }
  finally { retrying.value.delete(runId) }
}

// 定时配置
const scheduleVisible = ref(false)
const scheduleBizId = ref(0)
const scheduleBizName = ref('')

function openSchedule(j: any) {
  scheduleBizId.value = j.id
  scheduleBizName.value = j.name
  scheduleVisible.value = true
}

onMounted(load)
</script>

<template>
  <div style="padding:24px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2 style="margin:0;font-size:20px">快照管理</h2>
      <el-button v-if="userStore.hasOp('warehouse.modeling','C')" type="primary" :icon="Plus" @click="openCreate">新建快照</el-button>
    </div>
    <el-card shadow="never">
      <el-table v-loading="loading" :data="jobs" border stripe size="small" empty-text="暂无快照任务">
        <el-table-column prop="name" label="名称" min-width="140" />
        <el-table-column prop="source_table" label="来源表" width="140" />
        <el-table-column label="标识字段" min-width="120"><template #default="{ row }"><el-tag v-for="k in row.snapshot_keys" :key="k" size="small" style="margin-right:4px">{{ k }}</el-tag></template></el-table-column>
        <el-table-column prop="period" label="周期" width="70" />
        <el-table-column prop="retention" label="保留期" width="70" align="center"><template #default="{ row }">{{ row.retention }} 期</template></el-table-column>
        <el-table-column label="状态" width="70" align="center"><template #default="{ row }"><el-tag size="small" :type="row.enabled?'success':'info'">{{ row.enabled ? '启用' : '停用' }}</el-tag></template></el-table-column>
        <el-table-column label="上次执行" width="140"><template #default="{ row }">{{ row.last_run_at?.substring(0, 19) || '—' }}</template></el-table-column>
        <el-table-column label="操作" width="280" fixed="right">
          <template #default="{ row }">
            <el-button text size="small" :icon="VideoPlay" type="success" @click="openTrigger(row.id)">执行</el-button>
            <el-button text size="small" :icon="Edit" @click="openEdit(row)">编辑</el-button>
            <el-button text size="small" @click="showRuns(row.id)">记录</el-button>
            <el-button text size="small" :icon="Clock" @click="openSchedule(row)">定时</el-button>
            <el-button text size="small" type="danger" :icon="Delete" @click="doDelete(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新建/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="editId ? '编辑快照' : '新建快照'" width="520px">
      <el-form label-width="80px" size="small">
        <el-form-item label="名称" required><el-input v-model="form.name" maxlength="128" /></el-form-item>
        <el-form-item label="来源表" required><el-input v-model="form.source_table" placeholder="ODS/DWD 表名" /></el-form-item>
        <el-form-item label="目标表前缀" required><el-input v-model="form.target_table" placeholder="snap_employee" /></el-form-item>
        <el-form-item label="标识字段"><div style="display:flex;gap:6px;width:100%"><el-input v-model="keysInput" placeholder="如 employee_id" @keyup.enter="addKey" /><el-button @click="addKey">添加</el-button></div><div style="margin-top:6px"><el-tag v-for="k in form.snapshot_keys" :key="k" closable size="small" style="margin-right:4px" @close="removeKey(k)">{{ k }}</el-tag></div></el-form-item>
        <el-form-item label="周期"><el-select v-model="form.period"><el-option label="每日" value="daily" /><el-option label="每周" value="weekly" /><el-option label="每月" value="monthly" /><el-option label="每季" value="quarterly" /><el-option label="每年" value="yearly" /></el-select></el-form-item>
        <el-form-item label="保留期"><el-input-number v-model="form.retention" :min="1" :max="120" /> 期</el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogVisible=false">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存</el-button></template>
    </el-dialog>

    <!-- 触发弹窗 -->
    <el-dialog v-model="triggerVisible" title="触发快照" width="360px">
      <el-form label-width="80px" size="small"><el-form-item label="周期值" required><el-input v-model="triggerPeriod" placeholder="2026-07" /></el-form-item></el-form>
      <template #footer><el-button @click="triggerVisible=false">取消</el-button><el-button type="primary" :loading="triggering" @click="doTrigger">执行</el-button></template>
    </el-dialog>

    <!-- 运行记录 -->
    <el-dialog v-model="runsVisible" title="快照记录" width="780px" @close="runs = []">
      <el-table :data="runs" size="small" border max-height="400">
        <el-table-column prop="period_value" label="周期值" width="100" />
        <el-table-column prop="status" label="状态" width="80"><template #default="{ row }"><el-tag size="small" :type="row.status==='success'?'success':'danger'">{{ row.status }}</el-tag></template></el-table-column>
        <el-table-column prop="row_count" label="行数" width="80" align="center" />
        <el-table-column prop="started_at" label="开始时间" width="150"><template #default="{ row }">{{ row.started_at?.substring(0, 19) }}</template></el-table-column>
        <el-table-column prop="finished_at" label="结束时间" width="150"><template #default="{ row }">{{ row.finished_at?.substring(0, 19) }}</template></el-table-column>
        <el-table-column prop="error_message" label="错误" min-width="120" show-overflow-tooltip />
        <el-table-column label="操作" width="70" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status === 'failed'" text size="small" type="warning" :icon="RefreshRight" :loading="retrying.has(row.id)" @click="retryRun(row.id)">重跑</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>

    <!-- 定时配置弹窗 -->
    <ScheduleConfigDialog
      v-model:visible="scheduleVisible"
      kind="snapshot_run"
      :business-id="scheduleBizId"
      :business-name="scheduleBizName"
      :payload="{ job_id: scheduleBizId }"
    />
  </div>
</template>
