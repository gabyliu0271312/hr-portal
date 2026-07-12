<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Refresh, CircleClose, Warning } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import { getWarehouseFeatures, emergencyStopL4, resumeL4, getL4Status, getL4Summary, type WarehouseFeatureFlags } from '@/api/warehouse'

const userStore = useUserStore()
const isAdmin = userStore.hasOp('warehouse.metrics', 'U')

const features = ref<WarehouseFeatureFlags | null>(null)
const emergencyStopped = ref(false)
const runningCount = ref(0)
const partialFailedCount = ref(0)
const loading = ref(true)

async function load() {
  loading.value = true
  try {
    features.value = await getWarehouseFeatures()
    try { const s = await getL4Status(); emergencyStopped.value = s?.emergency_stop || false } catch { }
    try {
      const sum = await getL4Summary()
      runningCount.value = (sum?.total || 0) - (sum?.success || 0) - (sum?.failed || 0) - (sum?.blocked || 0)
      partialFailedCount.value = sum?.failed || 0
    } catch { }
  } catch { features.value = null }
  finally { loading.value = false }
}

async function doEmergencyStop() {
  try {
    const { ElMessageBox, ElMessage } = await import('element-plus')
    await ElMessageBox.confirm('确定紧急停止所有 L4 全自动级联任务？', '紧急停止', { type: 'error', confirmButtonText: '确定停止', cancelButtonText: '取消' })
    await emergencyStopL4()
    emergencyStopped.value = true
    ElMessage.success('已紧急停止')
  } catch { /* cancelled */ }
}

async function doResume() {
  try {
    await resumeL4()
    emergencyStopped.value = false
    const { ElMessage } = await import('element-plus')
    ElMessage.success('已恢复运行')
  } catch { /* ignore */ }
}

onMounted(load)
defineExpose({ load })
</script>

<template>
  <div class="status-bar">
    <div class="status-items">
      <span class="status-item">
        <el-tag :type="features?.ods_dwd_automation ? 'warning' : 'info'" size="small" effect="dark">ODS→DWD</el-tag>
        <span class="status-text">{{ features?.ods_dwd_automation ? '试点中' : '未启用' }}</span>
      </span>
      <span class="status-item">
        <el-tag :type="features?.metric_automation ? 'warning' : 'info'" size="small" effect="dark">指标自动化</el-tag>
        <span class="status-text">{{ features?.metric_automation ? '试点中' : '未启用' }}</span>
      </span>
      <span class="status-item">
        <el-tag :type="!features?.l4_full_auto ? 'info' : emergencyStopped ? 'danger' : 'success'" size="small" effect="dark">L4</el-tag>
        <span class="status-text">{{ !features?.l4_full_auto ? '未启用' : emergencyStopped ? `紧急停止中 | 待处理: ${partialFailedCount}` : `试点中 | 进行中: ${Math.max(0, runningCount)}` }}</span>
      </span>
    </div>
    <div class="status-actions">
      <template v-if="isAdmin">
        <el-button v-if="features?.l4_full_auto && emergencyStopped" type="success" size="small" @click="doResume">恢复运行</el-button>
        <el-button v-else-if="features?.l4_full_auto" type="danger" size="small" :icon="CircleClose" @click="doEmergencyStop">紧急停止</el-button>
      </template>
      <el-button size="small" :icon="Refresh" @click="load" :loading="loading">刷新</el-button>
    </div>
  </div>
</template>

<style scoped>
.status-bar { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: #f5f7fa; border-radius: 6px; margin-bottom: 12px; }
.status-items { display: flex; gap: 16px; }
.status-item { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.status-text { color: #606266; }
.status-actions { display: flex; gap: 6px; }
</style>
