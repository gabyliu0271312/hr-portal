<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { schedulerApi, type JobRunItem } from '@/api/scheduler'
import { formatDateTime } from '@/utils/datetime'
import { datasourcesApi, type DataSourceListItem } from '@/api/datasources'

const route = useRoute()

const list = ref<JobRunItem[]>([])
const loading = ref(false)

const dsList = ref<DataSourceListItem[]>([])
const filterBiz = ref<number | null>(null)
const filterStatus = ref('')

const STATUS_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'success', label: '成功' },
  { value: 'failed', label: '失败' },
  { value: 'running', label: '运行中' },
]

const dsLabel = computed(() => {
  const map = new Map<number, string>()
  for (const d of dsList.value) map.set(d.id, d.table_label)
  return map
})

async function loadDsList() {
  try {
    dsList.value = await datasourcesApi.list()
  } catch {
    dsList.value = []
  }
}

async function load() {
  loading.value = true
  try {
    const params: Record<string, any> = { kind: 'datasource_sync', limit: 200 }
    if (filterBiz.value) params.business_id = filterBiz.value
    if (filterStatus.value) params.status = filterStatus.value
    list.value = await schedulerApi.runs(params)
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '加载失败')
  } finally {
    loading.value = false
  }
}

function statusType(s: string): 'success' | 'danger' | 'warning' | 'info' {
  if (s === 'success') return 'success'
  if (s === 'failed') return 'danger'
  if (s === 'running') return 'warning'
  return 'info'
}

function statusLabel(s: string): string {
  if (s === 'success') return '成功'
  if (s === 'failed') return '失败'
  if (s === 'running') return '运行中'
  return s
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return '—'
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`
}

watch([filterBiz, filterStatus], load)

onMounted(async () => {
  await loadDsList()
  // 支持从 Endpoints 跳转时带 ?ds=N 自动过滤
  const dsParam = route.query.ds
  if (dsParam) filterBiz.value = Number(dsParam)
  await load()
})
</script>

<template>
  <div style="padding: 24px">
    <!-- T0302: 迁移提示 -->
    <el-alert
      type="info"
      :closable="false"
      show-icon
      style="margin-bottom: 16px"
    >
      <template #title>
        各资产的同步历史已聚合到 数据仓库 &gt; 数据资产 &gt; 资产详情 &gt; 同步历史
      </template>
      <template #default>
        <div style="margin-top: 4px">
          当前页面为全局同步历史兼容入口。资产视角的同步历史请从数据仓库资产详情查看。
        </div>
        <div style="margin-top: 8px">
          <el-button type="primary" size="small" @click="$router.push({ name: 'WarehouseAssets' })">
            前往数据资产目录
          </el-button>
        </div>
      </template>
    </el-alert>

    <el-card>
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <span style="font-size: 16px; font-weight: 600">同步历史（共 {{ list.length }} 条）</span>
          <el-button @click="load">
            <el-icon style="margin-right: 4px"><Refresh /></el-icon>刷新
          </el-button>
        </div>
      </template>

      <el-form inline style="margin-bottom: 16px">
        <el-form-item label="数据表">
          <el-select v-model="filterBiz" placeholder="全部" clearable style="width: 220px">
            <el-option v-for="d in dsList" :key="d.id" :label="d.table_label" :value="d.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filterStatus" placeholder="全部" clearable style="width: 140px">
            <el-option v-for="s in STATUS_OPTIONS" :key="s.value" :label="s.label" :value="s.value" />
          </el-select>
        </el-form-item>
      </el-form>

      <div style="overflow-x: auto">
        <el-table v-loading="loading" :data="list" stripe style="width: 100%" max-height="600">
          <el-table-column label="数据表" min-width="200">
            <template #default="{ row }">
              <strong>{{ dsLabel.get(row.business_id) || `#${row.business_id}` }}</strong>
            </template>
          </el-table-column>
          <el-table-column label="开始时间" min-width="180">
            <template #default="{ row }">
              {{ formatDateTime(row.started_at) }}
            </template>
          </el-table-column>
          <el-table-column label="耗时" width="100">
            <template #default="{ row }">
              {{ formatDuration(row.started_at, row.finished_at) }}
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="statusType(row.status)" size="small">
                {{ statusLabel(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="行数" width="90">
            <template #default="{ row }">
              <span v-if="row.rows !== null">{{ row.rows }}</span>
              <span v-else style="color: var(--color-text-placeholder)">—</span>
            </template>
          </el-table-column>
          <el-table-column label="触发方式" width="120">
            <template #default="{ row }">
              <el-tag v-if="row.triggered_by === 'cron'" size="small" effect="plain">定时</el-tag>
              <el-tag v-else size="small" type="info" effect="plain">{{ row.triggered_by }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="消息 / 错误" min-width="280" show-overflow-tooltip>
            <template #default="{ row }">
              <span v-if="row.status === 'failed'" style="color: var(--color-danger)">{{ row.message }}</span>
              <span v-else>{{ row.message || '—' }}</span>
            </template>
          </el-table-column>
          <template #empty>
            <div style="padding: 32px 0; color: var(--color-text-placeholder); font-size: 13px">
              暂无同步记录
            </div>
          </template>
        </el-table>
      </div>
    </el-card>
  </div>
</template>
