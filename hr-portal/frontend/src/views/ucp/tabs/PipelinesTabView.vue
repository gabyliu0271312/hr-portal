<template>
  <div class="pipelines-tab">
    <!-- KPI 卡片横排 (蓝本 v2 场景 7) -->
    <div class="kpi-row">
      <div class="kpi-card kpi-all">
        <div class="kpi-label">总流水线</div>
        <div class="kpi-value">{{ pipelines.length }}</div>
        <div class="kpi-sub">跨系统编排</div>
      </div>
      <div class="kpi-card kpi-active">
        <div class="kpi-label">启用中</div>
        <div class="kpi-value">{{ activeCount }}</div>
        <div class="kpi-sub">定时/事件/手动 三种</div>
      </div>
      <div class="kpi-card kpi-scheduled">
        <div class="kpi-label">定时触发</div>
        <div class="kpi-value">{{ scheduledCount }}</div>
        <div class="kpi-sub">SCHEDULED</div>
      </div>
      <div class="kpi-card kpi-event">
        <div class="kpi-label">事件触发</div>
        <div class="kpi-value">{{ eventCount }}</div>
        <div class="kpi-sub">EVENT</div>
      </div>
    </div>

    <div class="action-bar">
      <el-input
        v-model="searchKw"
        placeholder="搜索流水线"
        clearable
        style="width: 240px"
      >
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
      <el-select v-model="filterTrigger" placeholder="触发方式" clearable style="width: 140px">
        <el-option label="全部" value="" />
        <el-option label="定时 SCHEDULED" value="SCHEDULED" />
        <el-option label="事件 EVENT" value="EVENT" />
        <el-option label="手动 MANUAL" value="MANUAL" />
      </el-select>
      <el-select v-model="filterStatus" placeholder="状态" clearable style="width: 120px">
        <el-option label="全部" value="" />
        <el-option label="启用" :value="1" />
        <el-option label="停用" :value="2" />
        <el-option label="未启用" :value="0" />
      </el-select>
      <div class="spacer" />
      <el-button type="primary" @click="goDesigner">
        <el-icon><Plus /></el-icon>创建流水线
      </el-button>
    </div>

    <el-table :data="filtered" v-loading="loading" stripe style="width: 100%">
      <el-table-column label="名称" min-width="200">
        <template #default="{ row }">
          <a class="pipe-name" @click="openDesigner(row)">{{ row.pipeline_name }}</a>
          <div class="pipe-code">{{ row.pipeline_code }}</div>
        </template>
      </el-table-column>
      <el-table-column label="触发方式" width="140">
        <template #default="{ row }">
          <el-tag v-if="row.trigger_type === 'SCHEDULED'" type="primary" size="small">定时</el-tag>
          <el-tag v-else-if="row.trigger_type === 'EVENT'" type="warning" size="small">事件</el-tag>
          <el-tag v-else-if="row.trigger_type === 'MANUAL'" size="small">手动</el-tag>
          <el-tag v-else size="small">{{ row.trigger_type }}</el-tag>
          <div v-if="row.trigger_type === 'SCHEDULED' && row.trigger_config?.cron" class="cron-hint">
            {{ row.trigger_config.cron }}
          </div>
          <div v-else-if="row.trigger_type === 'EVENT' && row.trigger_config?.event_type" class="cron-hint">
            {{ row.trigger_config.event_type }}
          </div>
        </template>
      </el-table-column>
      <el-table-column label="步骤" width="80" align="center">
        <template #default="{ row }">
          <el-tag size="small" type="info">{{ row.steps_count }} 步</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="涉及系统/资源" min-width="220">
        <template #default="{ row }">
          <div class="sys-tags">
            <el-tag
              v-for="s in row.systems_involved || []"
              :key="s.system_code"
              size="small"
              type="info"
              class="sys-tag"
            >
              {{ s.system_code }}
              <span v-if="s.resource_codes?.length" class="res-count">{{ s.resource_codes.length }}表</span>
            </el-tag>
            <span v-if="!row.systems_involved?.length" class="text-muted">未配置</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag v-if="row.status === 1" type="success" size="small">启用</el-tag>
          <el-tag v-else-if="row.status === 2" type="info" size="small">停用</el-tag>
          <el-tag v-else type="warning" size="small">未启用</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="最近执行" width="120">
        <template #default="{ row }">
          <span v-if="row.last_run_status" :class="'last-run-' + row.last_run_status">
            {{ lastRunLabel(row.last_run_status) }}
          </span>
          <span v-else class="text-muted">未运行</span>
          <div v-if="row.last_run_at" class="cron-hint">{{ row.last_run_at }}</div>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button size="small" link type="primary" @click="openDesigner(row)">编辑</el-button>
          <el-button size="small" link type="success" @click="runNow(row)">执行</el-button>
          <el-button size="small" link :type="row.status === 1 ? 'warning' : 'primary'" @click="toggleStatus(row)">
            {{ row.status === 1 ? '停用' : '启用' }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-if="!loading && filtered.length === 0" description="暂无流水线，点击右上角创建" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search } from '@element-plus/icons-vue'
import { ucpApi } from '@/api/ucp'

defineProps<{ currentSystemCode?: string }>()

const router = useRouter()
const loading = ref(false)
const searchKw = ref('')
const filterTrigger = ref<string>('')
const filterStatus = ref<number | ''>('')
const pipelines = ref<any[]>([])

// 反向展开：每条 pipeline 涉及的 system/resource（在 steps 数组里）
function deriveSystemsInvolved(steps: any[]) {
  if (!Array.isArray(steps)) return []
  const m = new Map<string, { system_code: string; resource_codes: string[] }>()
  for (const s of steps) {
    if (s.type === 'CONNECTOR' && s.config?.system_code) {
      const sys = s.config.system_code
      if (!m.has(sys)) m.set(sys, { system_code: sys, resource_codes: [] })
      if (s.config.resource_code) m.get(sys)!.resource_codes.push(s.config.resource_code)
    }
  }
  return Array.from(m.values())
}

const filtered = computed(() => {
  let arr = pipelines.value
  if (filterTrigger.value) arr = arr.filter((p) => p.trigger_type === filterTrigger.value)
  if (filterStatus.value !== '') arr = arr.filter((p) => p.status === filterStatus.value)
  if (searchKw.value.trim()) {
    const kw = searchKw.value.trim().toLowerCase()
    arr = arr.filter(
      (p) =>
        (p.pipeline_code || '').toLowerCase().includes(kw) ||
        (p.pipeline_name || '').toLowerCase().includes(kw)
    )
  }
  return arr
})

const activeCount = computed(() => pipelines.value.filter((p) => p.status === 1).length)
const scheduledCount = computed(() => pipelines.value.filter((p) => p.trigger_type === 'SCHEDULED').length)
const eventCount = computed(() => pipelines.value.filter((p) => p.trigger_type === 'EVENT').length)

function lastRunLabel(s: string) {
  return { SUCCESS: '成功', FAILED: '失败', PARTIAL_SUCCESS: '部分成功', RUNNING: '运行中' }[s] || s
}

async function load() {
  loading.value = true
  try {
    const list: any[] = []
    let offset = 0
    const pageSize = 100
    while (true) {
      const r = await ucpApi.pipelines().catch(() => ({ items: [] } as any))
      const items = (r as any).items || []
      if (items.length === 0) break
      list.push(...items)
      if (items.length < pageSize) break
      offset += pageSize
      if (offset > 500) break
    }
    // 拉每条详情补全 steps
    const detailed = await Promise.all(
      list.map(async (p) => {
        try {
          const d: any = await ucpApi.pipelineDetail(p.id)
          return {
            ...p,
            steps: d.steps || [],
            systems_involved: deriveSystemsInvolved(d.steps || []),
            last_run_status: d.last_run_status,
            last_run_at: d.last_run_at,
          }
        } catch {
          return p
        }
      })
    )
    pipelines.value = detailed
  } catch (_e) {
  } finally {
    loading.value = false
  }
}

function openDesigner(row: any) {
  router.push({ name: 'UcpPipelineDesigner', params: { id: String(row.id) } })
}
function goDesigner() {
  router.push({ name: 'UcpPipelineDesigner' })
}
async function runNow(row: any) {
  try {
    await ucpApi.runPipeline(row.pipeline_code, { dry_run: false })
    ElMessage.success(`流水线「${row.pipeline_name}」已触发`)
    load()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '执行失败')
  }
}
async function toggleStatus(row: any) {
  const newStatus = row.status === 1 ? 2 : 1
  try {
    await ucpApi.togglePipeline(row.id, newStatus)
    ElMessage.success(newStatus === 1 ? '已启用' : '已停用')
    load()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '操作失败')
  }
}
</script>

<style scoped>
.pipelines-tab .kpi-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}
.kpi-card {
  background: #fff;
  border-radius: 8px;
  padding: 16px 20px;
  border: 1px solid #e5e6eb;
  border-left: 3px solid #c9cdd4;
}
.kpi-all { border-left-color: #3b82f6; }
.kpi-active { border-left-color: #10b981; }
.kpi-scheduled { border-left-color: #f59e0b; }
.kpi-event { border-left-color: #8b5cf6; }
.kpi-label { font-size: 12px; color: #8f959e; margin-bottom: 4px; }
.kpi-value { font-size: 24px; font-weight: 600; color: #1f2329; }
.kpi-sub { font-size: 11px; color: #8f959e; margin-top: 4px; }

.action-bar { display: flex; gap: 8px; align-items: center; margin-bottom: 16px; }
.spacer { flex: 1; }
.pipe-name { color: #1f2329; cursor: pointer; font-weight: 500; }
.pipe-name:hover { color: #3b82f6; }
.pipe-code { font-size: 11px; color: #8f959e; font-family: monospace; margin-top: 2px; }
.cron-hint { font-size: 11px; color: #8f959e; margin-top: 4px; font-family: monospace; }
.sys-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.sys-tag .res-count { margin-left: 4px; opacity: 0.7; font-size: 10px; }
.last-run-SUCCESS { color: #10b981; font-size: 13px; }
.last-run-FAILED { color: #ef4444; font-size: 13px; }
.last-run-PARTIAL_SUCCESS { color: #f59e0b; font-size: 13px; }
.last-run-RUNNING { color: #3b82f6; font-size: 13px; }
.text-muted { color: #c9cdd4; font-size: 12px; }
</style>
