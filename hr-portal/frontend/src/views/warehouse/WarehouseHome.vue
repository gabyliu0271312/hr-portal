<script setup lang="ts">
import { formatDateTime } from '@/utils/datetime'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { DataBoard, Folder, Edit, TrendCharts, Checked, Warning, Setting } from '@element-plus/icons-vue'
import { listAssets, listModels, listMetrics, getL4Summary, type Asset, type ModelListItem, type MetricListItem } from '@/api/warehouse'
import LayerStatsPanel from '@/components/warehouse/LayerStatsPanel.vue'

const router = useRouter()

// L4 运行摘要
const l4Summary = ref<any>(null)

async function loadL4Summary() {
  try { l4Summary.value = await getL4Summary() } catch { l4Summary.value = null }
}

// 指标卡片
const assetTotal = ref<number | null>(null)
const modelTotal = ref<number | null>(null)
const metricTotal = ref<number | null>(null)
const alertCount = ref<number | null>(null)
const statsLoading = ref(false)

// 最新动态（当前阶段拉取最近发布/创建作为简易动态）
const activities = ref<{ time: string; text: string; type: string }[]>([])
const activityLoading = ref(false)

// 快捷入口
const quickLinks = [
  { label: '数据资产', icon: Folder, route: '/warehouse/assets' },
  { label: '数据建模', icon: Edit, route: '/warehouse/modeling' },
  { label: '指标管理', icon: TrendCharts, route: '/warehouse/metrics' },
  { label: '数据治理', icon: Checked, route: '/warehouse/governance' },
  { label: '自动化配置', icon: Setting, route: '/warehouse/automation' },
]

async function loadStats() {
  statsLoading.value = true
  try {
    const [assetRes, modelRes, metricRes, alertRes] = await Promise.all([
      listAssets({ page_size: 1 }),
      listModels({ page_size: 1 }),
      listMetrics({ page_size: 1 }),
      listAssets({ page_size: 200 }),
    ])
    assetTotal.value = assetRes.total
    modelTotal.value = modelRes.total
    metricTotal.value = metricRes.total
    alertCount.value = alertRes.items.filter(
      (a: Asset) => a.last_quality_status === 'fail' || a.last_quality_status === 'warn'
    ).length
  } catch {
    ElMessage.error('加载统计指标失败')
  } finally {
    statsLoading.value = false
  }
}

async function loadActivities() {
  activityLoading.value = true
  try {
    const [models, metrics] = await Promise.all([
      listModels({ page_size: 5 }),
      listMetrics({ page_size: 5 }),
    ])
    const items: { time: string; text: string; type: string }[] = []
    for (const m of models.items) {
      if (m.published_at) {
        items.push({ time: m.published_at, text: `模型「${m.name}」已发布`, type: 'success' })
      } else if (m.created_at) {
        items.push({ time: m.created_at, text: `模型「${m.name}」已创建`, type: 'primary' })
      }
    }
    for (const m of metrics.items) {
      if (m.published_at) {
        items.push({ time: m.published_at, text: `指标「${m.metric_name}」已发布`, type: 'success' })
      } else if (m.created_at) {
        items.push({ time: m.created_at, text: `指标「${m.metric_name}」已创建`, type: 'primary' })
      }
    }
    items.sort((a, b) => b.time.localeCompare(a.time))
    activities.value = items.slice(0, 10)
  } catch {
    // 动态加载失败不弹错误，静默降级
  } finally {
    activityLoading.value = false
  }
}

onMounted(() => {
  loadStats()
  loadActivities()
  loadL4Summary()
})
</script>

<template>
  <div class="warehouse-home">
    <!-- 页头 -->
    <div class="page-header">
      <h2><el-icon :size="22"><DataBoard /></el-icon> 数据仓库</h2>
      <p class="subtitle">数据资产 · 建模 · 指标 · 治理</p>
    </div>

    <!-- 指标卡片区 -->
    <el-row :gutter="16" style="margin-bottom: 16px">
      <el-col :xs="12" :sm="6">
        <el-card shadow="hover" v-loading="statsLoading" class="stat-card">
          <div class="stat-label">数据表</div>
          <div class="stat-value">{{ assetTotal ?? '—' }}</div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card shadow="hover" v-loading="statsLoading" class="stat-card">
          <div class="stat-label">数据模型</div>
          <div class="stat-value">{{ modelTotal ?? '—' }}</div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card shadow="hover" v-loading="statsLoading" class="stat-card">
          <div class="stat-label">指标</div>
          <div class="stat-value">{{ metricTotal ?? '—' }}</div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card shadow="hover" v-loading="statsLoading" class="stat-card stat-card--warning">
          <div class="stat-label">质量告警</div>
          <div class="stat-value" :class="{ 'text-warning': alertCount && alertCount > 0 }">
            <el-icon v-if="alertCount && alertCount > 0" style="margin-right: 4px"><Warning /></el-icon>
            {{ alertCount ?? '—' }}
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 分层概览 -->
    <el-card style="margin-bottom: 16px">
      <template #header><span style="font-weight: 600">数据分层概览</span></template>
      <LayerStatsPanel />
    </el-card>

    <!-- L4 运行摘要 -->
    <el-card v-if="l4Summary" style="margin-bottom: 16px">
      <template #header>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-weight: 600">L4 全自动级联运行摘要（最近 24h）</span>
          <el-link :underline="false" @click="router.push('/warehouse/automation')">查看全部 →</el-link>
        </div>
      </template>
      <el-row :gutter="16">
        <el-col :span="4"><div class="stat-num">{{ l4Summary.total }}</div><div class="stat-label">总执行</div></el-col>
        <el-col :span="5"><div class="stat-num success">{{ l4Summary.success }}</div><div class="stat-label">成功</div></el-col>
        <el-col :span="5"><div class="stat-num warning">{{ l4Summary.blocked }}</div><div class="stat-label">阻断</div></el-col>
        <el-col :span="5"><div class="stat-num danger">{{ l4Summary.failed }}</div><div class="stat-label">失败</div></el-col>
        <el-col :span="5"><div class="stat-num" :class="l4Summary.emergency_stopped ? 'danger' : ''">{{ l4Summary.emergency_stopped ? '⚠' : '✓' }}</div><div class="stat-label">运行状态</div></el-col>
      </el-row>
    </el-card>

    <!-- 最新动态 + 快捷入口 -->
    <el-row :gutter="16">
      <!-- 最新动态 -->
      <el-col :sm="14" style="margin-bottom: 16px">
        <el-card>
          <template #header><span style="font-weight: 600">最新动态</span></template>
          <div v-loading="activityLoading">
            <el-timeline v-if="activities.length">
              <el-timeline-item
                v-for="(a, i) in activities"
                :key="i"
                :timestamp="formatDateTime(a.time)"
                :type="a.type as any"
                placement="top"
              >
                {{ a.text }}
              </el-timeline-item>
            </el-timeline>
            <el-empty v-else description="暂无动态" :image-size="80" />
          </div>
        </el-card>
      </el-col>

      <!-- 快捷入口 -->
      <el-col :sm="10" style="margin-bottom: 16px">
        <el-card>
          <template #header><span style="font-weight: 600">快捷入口</span></template>
          <div class="quick-links">
            <el-button
              v-for="lk in quickLinks"
              :key="lk.route"
              :icon="lk.icon"
              style="width: 100%; margin-bottom: 8px; justify-content: flex-start"
              @click="router.push(lk.route)"
            >
              {{ lk.label }}
            </el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.stat-num { font-size: 24px; font-weight: 700; text-align: center; color: #303133; }
.stat-num.success { color: #67C23A; }
.stat-num.warning { color: #E6A23C; }
.stat-num.danger { color: #F56C6C; }
.stat-label { font-size: 12px; color: #909399; text-align: center; margin-top: 4px; }

.warehouse-home {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}
.page-header {
  margin-bottom: 20px;
}
.page-header h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 4px 0;
  font-size: 20px;
}
.subtitle {
  color: var(--color-text-secondary, #909399);
  margin: 0;
  font-size: 13px;
}
.stat-card {
  text-align: center;
}
.stat-card--warning {
  border-left: 3px solid #e6a23c;
}
.stat-label {
  font-size: 13px;
  color: var(--color-text-secondary, #909399);
  margin-bottom: 8px;
}
.stat-value {
  font-size: 28px;
  font-weight: 600;
  color: var(--color-text-primary, #303133);
}
.text-warning {
  color: #e6a23c;
}
.layer-item {
  padding: 12px;
  border: 1px solid var(--color-border, #e4e7ed);
  border-radius: 4px;
}
.layer-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.layer-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.layer-code {
  font-weight: 600;
  font-size: 15px;
}
.layer-label {
  font-size: 12px;
  color: var(--color-text-secondary, #909399);
}
.layer-stats {
  font-size: 13px;
  color: var(--color-text-regular, #606266);
}
.quick-links {
  display: flex;
  flex-direction: column;
}
</style>
