<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '@/api/client'
import { formatDateTime } from '@/utils/datetime'

interface SystemLog {
  id: number
  category: string
  action: string
  status: string
  user_id: number | null
  user_display_name: string | null
  request_summary: string | null
  response_summary: string | null
  metadata_json: Record<string, any>
  error: string | null
  created_at: string
}

// 日志类型字典：后续新增日志类型只在此加一项
const LOG_TYPES = [{ value: 'compensation_calc', label: '补偿金计算' }]

const logType = ref('compensation_calc')
const loading = ref(false)
const rows = ref<SystemLog[]>([])

async function load() {
  loading.value = true
  try {
    rows.value = await api
      .get<SystemLog[]>('/system-logs', { params: { category: logType.value } })
      .then((r) => r.data)
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '加载日志失败')
    rows.value = []
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
            <div class="page-title">操作日志</div>
            <div class="page-subtitle">记录各业务模块的使用情况：谁、何时、操作了什么。</div>
          </div>
          <div class="page-actions">
            <el-select v-model="logType" style="width: 180px" @change="load">
              <el-option
                v-for="t in LOG_TYPES"
                :key="t.value"
                :label="t.label"
                :value="t.value"
              />
            </el-select>
            <el-button @click="load">刷新</el-button>
          </div>
        </div>
      </template>

      <div class="table-wrap">
        <el-table
          v-loading="loading"
          :data="rows"
          stripe
          style="width: 100%"
          max-height="680"
        >
          <el-table-column prop="created_at" label="操作时间" min-width="170">
            <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
          </el-table-column>
          <el-table-column label="操作人" min-width="120">
            <template #default="{ row }">
              {{ row.user_display_name || (row.user_id ? `用户#${row.user_id}` : '-') }}
            </template>
          </el-table-column>

          <!-- 补偿金计算专属列：被查员工 -->
          <template v-if="logType === 'compensation_calc'">
            <el-table-column label="被查员工" min-width="140">
              <template #default="{ row }">
                {{ row.metadata_json?.employee_name || '-' }}
              </template>
            </el-table-column>
            <el-table-column label="工号" min-width="110">
              <template #default="{ row }">
                {{ row.metadata_json?.employee_no || '-' }}
              </template>
            </el-table-column>
            <el-table-column label="公司" min-width="160" show-overflow-tooltip>
              <template #default="{ row }">
                {{ row.metadata_json?.company || '-' }}
              </template>
            </el-table-column>
            <el-table-column label="计算结果" min-width="180" show-overflow-tooltip>
              <template #default="{ row }">{{ row.response_summary || '-' }}</template>
            </el-table-column>
          </template>

          <el-table-column prop="status" label="状态" min-width="90" />
        </el-table>
      </div>
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
.page-actions {
  display: flex;
  align-items: center;
  gap: 12px;
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
.table-wrap {
  overflow-x: auto;
}
</style>
