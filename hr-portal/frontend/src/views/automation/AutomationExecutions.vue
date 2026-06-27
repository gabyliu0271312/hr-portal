<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, List } from '@element-plus/icons-vue'
import { automationApi, type AutomationExecutionOut } from '@/api/automation'

const router = useRouter()
const executions = ref<AutomationExecutionOut[]>([])
const loading = ref(false)

async function loadExecutions() {
  loading.value = true
  try {
    executions.value = await automationApi.listExecutions()
  } catch (e: any) {
    console.error(e?.response?.data?.detail || '加载失败')
  } finally {
    loading.value = false
  }
}

function getStatusType(status: string) {
  if (status === 'success') return 'success'
  if (status === 'failed') return 'danger'
  if (status === 'partial_success') return 'warning'
  return 'info'
}

function getStatusLabel(status: string) {
  const map: Record<string, string> = {
    pending: '等待中',
    running: '执行中',
    success: '成功',
    failed: '失败',
    partial_success: '部分成功',
  }
  return map[status] || status
}

function handleBack() {
  router.push({ name: 'AutomationRuleList' })
}

onMounted(() => {
  loadExecutions()
})
</script>

<template>
  <div class="are-exec-root">
    <!-- 顶部导航 -->
    <div class="topbar">
      <button class="back-btn" @click="handleBack">
        <el-icon><ArrowLeft /></el-icon>
        <span>返回通知列表</span>
      </button>
      <h1 class="topbar-title">
        <el-icon><List /></el-icon>
        通知记录
      </h1>
    </div>

    <div class="exec-content">
      <el-table :data="executions" v-loading="loading" border stripe class="exec-table">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="rule_id" label="通知 ID" width="100" />
        <el-table-column label="触发器" width="160">
          <template #default="{ row }">
            {{ row.trigger_type }}
          </template>
        </el-table-column>
        <el-table-column label="业务类型" width="120">
          <template #default="{ row }">
            {{ row.biz_type || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="业务 ID" width="120">
          <template #default="{ row }">
            {{ row.biz_id || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)" size="small">
              {{ getStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="error_message" label="错误信息" min-width="200" show-overflow-tooltip />
        <el-table-column prop="started_at" label="开始时间" width="180" />
      </el-table>

      <el-empty
        v-if="!loading && executions.length === 0"
        description="暂无通知记录"
        :image-size="80"
      />
    </div>
  </div>
</template>

<style scoped>
.are-exec-root {
  min-height: calc(100vh - var(--layout-topbar-height));
  background: var(--color-bg-page);
}
.topbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 24px;
  background: var(--color-bg-card);
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  z-index: 10;
}
.back-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--color-text-secondary);
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 0;
  transition: color var(--duration-fast);
}
.back-btn:hover { color: var(--color-primary); }
.topbar-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.exec-content {
  padding: 24px;
}
.exec-table {
  font-size: 13px;
}
</style>
