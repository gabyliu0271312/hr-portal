<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { api } from '@/api/client'
import { formatDateTime } from '@/utils/datetime'
import ServiceStatusBadge from './ServiceStatusBadge.vue'

const props = defineProps<{
  serviceType?: string
  serviceId?: number
  compact?: boolean
}>()

const logs = ref<any[]>([])
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const params: any = { page_size: props.compact ? 10 : 50 }
    if (props.serviceType) params.service_type = props.serviceType
    const { data } = await api.get('/service-monitor/runs', { params })
    logs.value = data.items || []
  } catch { logs.value = [] }
  finally { loading.value = false }
}

watch(() => [props.serviceType, props.serviceId], () => load())
onMounted(() => load())

defineExpose({ reload: load })
</script>

<template>
  <div class="run-log-panel">
    <el-table :data="logs" v-loading="loading" size="small" :max-height="compact ? 280 : 500" stripe>
      <el-table-column prop="created_at" label="时间" width="170">
        <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
      </el-table-column>
      <el-table-column prop="service_type" label="类型" width="90" />
      <el-table-column prop="service_name" label="服务" min-width="140" show-overflow-tooltip />
      <el-table-column prop="status" label="状态" width="90">
        <template #default="{ row }"><ServiceStatusBadge :status="row.status" /></template>
      </el-table-column>
      <el-table-column prop="rows" label="行数" width="70" />
      <el-table-column prop="duration_ms" label="耗时" width="80">
        <template #default="{ row }">{{ row.duration_ms ? `${row.duration_ms}ms` : '-' }}</template>
      </el-table-column>
      <el-table-column prop="message" label="备注" min-width="120" show-overflow-tooltip>
        <template #default="{ row }">
          <span v-if="row.upstream_failure" style="color: #e6a23c">上游失败</span>
          <span v-else>{{ row.message || '-' }}</span>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>
