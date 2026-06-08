<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '@/api/client'

interface SystemLog {
  id: number
  category: string
  action: string
  status: string
  user_id: number | null
  request_summary: string | null
  response_summary: string | null
  error: string | null
  trace_id: string | null
  latency_ms: number | null
  created_at: string
}

const loading = ref(false)
const rows = ref<SystemLog[]>([])

async function load() {
  loading.value = true
  try {
    rows.value = await api.get<SystemLog[]>('/system-logs', { params: { category: 'ai_call' } }).then((r) => r.data)
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '加载日志失败')
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <el-card>
      <template #header>
        <div class="page-head">
          <div>
            <div class="page-title">AI 调用日志</div>
            <div class="page-subtitle">统一日志管理中的 AI 调用记录。</div>
          </div>
          <el-button @click="load">刷新</el-button>
        </div>
      </template>
      <el-table v-loading="loading" :data="rows" stripe style="width: 100%" max-height="680">
        <el-table-column prop="created_at" label="时间" min-width="170" />
        <el-table-column prop="action" label="动作" min-width="130" />
        <el-table-column prop="status" label="状态" min-width="100" />
        <el-table-column prop="request_summary" label="请求摘要" min-width="240" show-overflow-tooltip />
        <el-table-column prop="response_summary" label="响应摘要" min-width="240" show-overflow-tooltip />
        <el-table-column prop="error" label="错误" min-width="220" show-overflow-tooltip />
        <el-table-column prop="trace_id" label="Trace" min-width="160" show-overflow-tooltip />
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
.page {
  padding: 24px;
}
.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.page-title {
  font-size: 16px;
  font-weight: 600;
}
.page-subtitle {
  margin-top: 4px;
  color: var(--color-text-placeholder);
  font-size: 13px;
}
</style>
