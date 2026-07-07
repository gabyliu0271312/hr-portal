<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh, VideoPlay, Edit, Delete, InfoFilled, Search } from '@element-plus/icons-vue'
import { api } from '@/api/client'
import { useUserStore } from '@/stores/user'
import ScheduleConfigDialog from '@/components/common/ScheduleConfigDialog.vue'

const userStore = useUserStore()

const configs = ref<any[]>([])
const runs = ref<any[]>([])
const loading = ref(false)

async function load() {
  loading.value = true
  try { const res = await api.get('/warehouse/scd-configs'); configs.value = res.data.items } catch { configs.value = [] }
  finally { loading.value = false }
}

// ── 候选字段检测 ──────────────────────────────
const candidateLoading = ref(false)
const candidates = ref<Record<string, any> | null>(null)

async function detectCandidates(tableName: string) {
  if (!tableName) return
  candidateLoading.value = true
  try {
    const res = await api.get('/warehouse/scd-detect-candidates', { params: { table_name: tableName } })
    candidates.value = res.data
  } catch (e: any) {
    candidates.value = null
    ElMessage.error(e?.response?.data?.detail || '检测失败')
  } finally { candidateLoading.value = false }
}

// ── 创建/编辑弹窗 ──────────────────────────────
const dialogVisible = ref(false); const editId = ref<number | null>(null)
const form = ref({
  name: '', source_table: '', target_table: '',
  business_key: '', effective_from_field: 'effective_from',
  effective_to_field: 'effective_to', current_flag_field: 'current_flag',
  compare_fields: [] as string[],
})
const saving = ref(false)
const compareInput = ref('')

function openCreate() {
  editId.value = null
  form.value = { name: '', source_table: '', target_table: '', business_key: '', effective_from_field: 'effective_from', effective_to_field: 'effective_to', current_flag_field: 'current_flag', compare_fields: [] }
  candidates.value = null
  dialogVisible.value = true
}

function openEdit(c: any) {
  editId.value = c.id
  form.value = {
    name: c.name, source_table: c.source_table, target_table: c.target_table,
    business_key: c.business_key || '',
    effective_from_field: c.effective_from_field || 'effective_from',
    effective_to_field: c.effective_to_field || 'effective_to',
    current_flag_field: c.current_flag_field || 'current_flag',
    compare_fields: c.compare_fields || [],
  }
  candidates.value = null
  dialogVisible.value = true
}

async function save() {
  saving.value = true
  try {
    const payload = { ...form.value, compare_fields: form.value.compare_fields.filter(Boolean) }
    if (editId.value) { await api.patch(`/warehouse/scd-configs/${editId.value}`, payload); ElMessage.success('已更新') }
    else { await api.post('/warehouse/scd-configs', payload); ElMessage.success('已创建') }
    dialogVisible.value = false; load()
  } catch (e: any) { ElMessage.error(e?.response?.data?.detail || '保存失败') }
  finally { saving.value = false }
}

async function doDelete(id: number) {
  try { await ElMessageBox.confirm('确定删除？', '确认', { type: 'warning' }); await api.delete(`/warehouse/scd-configs/${id}`); ElMessage.success('已删除'); load() } catch { }
}

// ── 执行 ───────────────────────────────────────
const executing = ref<Set<number>>(new Set())

async function doExecute(configId: number) {
  executing.value.add(configId)
  try {
    const res = await api.post(`/warehouse/scd-configs/${configId}/execute`)
    ElMessage.success(`拉链完成：新增 ${res.data.new_count}，变更 ${res.data.updated_count}，关闭 ${res.data.closed_count}`)
    load()
  } catch (e: any) { ElMessage.error(e?.response?.data?.detail || '执行失败') }
  finally { executing.value.delete(configId) }
}

// ── 运行记录 ───────────────────────────────────
const runsVisible = ref(false); const runsConfigId = ref(0)

async function showRuns(configId: number) {
  runsConfigId.value = configId
  try { const res = await api.get('/warehouse/scd-runs', { params: { config_id: configId, page_size: 50 } }); runs.value = res.data.items } catch { runs.value = [] }
  runsVisible.value = true
}

// ── 定时配置 ───────────────────────────────────
const scheduleVisible = ref(false); const scheduleBizId = ref(0); const scheduleBizName = ref('')

function openSchedule(c: any) {
  scheduleBizId.value = c.id; scheduleBizName.value = c.name; scheduleVisible.value = true
}

onMounted(load)
</script>

<template>
  <div style="padding:24px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2 style="margin:0;font-size:20px">SCD 拉链管理</h2>
      <el-button v-if="userStore.hasOp('warehouse.modeling','C')" type="primary" :icon="Plus" @click="openCreate">新建 SCD 配置</el-button>
    </div>

    <el-alert type="warning" :closable="false" show-icon style="margin-bottom:12px">
      <template #title>SCD Type 2（缓慢变化维度）注意事项</template>
      <ul style="margin:4px 0 0;padding-left:20px;font-size:13px;line-height:1.6">
        <li>拉链表 Target 不可与 Source 为同一张表</li>
        <li>业务键必须能唯一标识实体（如 employee_id + company_id）</li>
        <li>Source 表需具备变更时间字段（如 updated_at）作为 effective_from</li>
        <li>每次执行会比较 compare_fields，仅将变更记录写入新版本</li>
      </ul>
    </el-alert>

    <el-card shadow="never">
      <el-table v-loading="loading" :data="configs" border stripe size="small" empty-text="暂无 SCD 配置">
        <el-table-column prop="name" label="名称" min-width="140" />
        <el-table-column prop="source_table" label="来源表" width="140" />
        <el-table-column prop="target_table" label="拉链表" width="140" />
        <el-table-column prop="business_key" label="业务键" width="150" />
        <el-table-column label="对比字段" min-width="160">
          <template #default="{ row }">
            <el-tag v-for="f in (row.compare_fields||[]).slice(0,5)" :key="f" size="small" style="margin-right:4px">{{ f }}</el-tag>
            <span v-if="(row.compare_fields||[]).length > 5" style="color:#909399;font-size:12px">+{{ row.compare_fields.length - 5 }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="row.last_status === 'success' ? 'success' : row.last_status === 'failed' ? 'danger' : 'info'">
              {{ row.last_status || '—' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="上次执行" width="140">
          <template #default="{ row }">{{ row.last_run_at?.substring(0, 19) || '—' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <el-button text size="small" :icon="VideoPlay" type="success" :loading="executing.has(row.id)" @click="doExecute(row.id)">执行</el-button>
            <el-button text size="small" :icon="Edit" @click="openEdit(row)">编辑</el-button>
            <el-button text size="small" @click="showRuns(row.id)">记录</el-button>
            <el-button text size="small" @click="openSchedule(row)">定时</el-button>
            <el-button text size="small" type="danger" :icon="Delete" @click="doDelete(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新建/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="editId ? '编辑 SCD 配置' : '新建 SCD 配置'" width="620px">
      <el-form label-width="110px" size="small">
        <el-form-item label="名称" required><el-input v-model="form.name" maxlength="128" /></el-form-item>
        <el-form-item label="来源表" required>
          <el-input v-model="form.source_table" placeholder="源表名" @change="(v: string) => { if (v) detectCandidates(v) }" />
        </el-form-item>
        <el-form-item label="拉链表 Target" required>
          <el-input v-model="form.target_table" placeholder="目标拉链表名（需不同于来源表）" />
        </el-form-item>
        <el-form-item label="业务键" required>
          <el-input v-model="form.business_key" placeholder="逗号分隔，如 employee_id" />
          <div v-if="candidates?.business_key_candidates?.length" style="font-size:11px;color:#909399;margin-top:4px">
            候选：<el-button v-for="k in candidates.business_key_candidates" :key="k" link size="small" @click="form.business_key = form.business_key ? form.business_key + ',' + k : k">{{ k }}</el-button>
          </div>
        </el-form-item>
        <el-form-item label="生效起始字段">
          <el-input v-model="form.effective_from_field" style="width:200px" />
        </el-form-item>
        <el-form-item label="生效结束字段">
          <el-input v-model="form.effective_to_field" style="width:200px" />
        </el-form-item>
        <el-form-item label="当前标记字段">
          <el-input v-model="form.current_flag_field" style="width:200px" />
        </el-form-item>
        <el-form-item label="对比变更字段">
          <div style="display:flex;gap:6px;width:100%">
            <el-input v-model="compareInput" placeholder="字段名（回车添加）" @keyup.enter="(e: any) => { const v = e.target?.value?.trim(); if (v && !form.compare_fields.includes(v)) { form.compare_fields.push(v); e.target.value = '' } }" />
          </div>
          <div v-if="candidates?.compare_candidates?.length" style="font-size:11px;color:#909399;margin:4px 0">
            候选：
            <el-checkbox-group v-model="form.compare_fields" size="small">
              <el-checkbox v-for="f in candidates.compare_candidates" :key="f" :label="f" :value="f" style="margin-right:12px">{{ f }}</el-checkbox>
            </el-checkbox-group>
          </div>
          <div style="margin-top:6px">
            <el-tag v-for="f in form.compare_fields" :key="f" closable size="small" style="margin-right:4px" @close="form.compare_fields = form.compare_fields.filter(x => x !== f)">{{ f }}</el-tag>
          </div>
        </el-form-item>

        <div v-if="candidates" style="background:#f5f7fa;border-radius:6px;padding:12px;margin-top:8px">
          <div style="font-size:13px;font-weight:600;color:#303133;margin-bottom:8px">
            <el-icon style="margin-right:4px"><InfoFilled /></el-icon>检测结果：{{ candidates.table_name }}
          </div>
          <div v-for="w in candidates.risk_warnings" :key="w" style="font-size:12px;color:#e6a23c;line-height:1.6">⚠ {{ w }}</div>
          <div style="margin-top:6px">
            <span style="font-size:12px;color:#909399">字段列表（{{ candidates.columns?.length || 0 }} 列）：</span>
            <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">
              <el-tag v-for="col in candidates.columns" :key="col.name" size="small" type="info" effect="plain">
                {{ col.name }}<span style="color:#a0a0a0;margin-left:4px;font-size:10px">{{ col.type }}</span>
              </el-tag>
            </div>
          </div>
        </div>
      </el-form>
      <template #footer><el-button @click="dialogVisible=false">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存</el-button></template>
    </el-dialog>

    <!-- 运行记录 -->
    <el-dialog v-model="runsVisible" title="SCD 执行记录" width="780px" @close="runs = []">
      <el-table :data="runs" size="small" border max-height="400">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="status" label="状态" width="80">
          <template #default="{ row }"><el-tag size="small" :type="row.status==='success'?'success':'danger'">{{ row.status }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="new_count" label="新增" width="70" align="center" />
        <el-table-column prop="updated_count" label="变更" width="70" align="center" />
        <el-table-column prop="closed_count" label="关闭" width="70" align="center" />
        <el-table-column prop="started_at" label="开始时间" width="150"><template #default="{ row }">{{ row.started_at?.substring(0, 19) }}</template></el-table-column>
        <el-table-column prop="finished_at" label="结束时间" width="150"><template #default="{ row }">{{ row.finished_at?.substring(0, 19) }}</template></el-table-column>
        <el-table-column prop="error_message" label="错误" min-width="140" show-overflow-tooltip />
      </el-table>
    </el-dialog>

    <ScheduleConfigDialog
      v-model:visible="scheduleVisible"
      kind="scd_run"
      :business-id="scheduleBizId"
      :business-name="scheduleBizName"
      :payload="{ config_id: scheduleBizId }"
    />
  </div>
</template>
