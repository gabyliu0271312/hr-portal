<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { PushRunOut } from '@/api/push_targets'
import { pushTargetsApi } from '@/api/push_targets'
import { formatDateTime } from '@/utils/datetime'

const props = defineProps<{ pushTargetId: number }>()

const runs = ref<PushRunOut[]>([])
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    runs.value = await pushTargetsApi.runs(props.pushTargetId)
  } catch {
    ElMessage.error('加载推送历史失败')
  } finally {
    loading.value = false
  }
}

onMounted(load)
defineExpose({ reload: load })
</script>

<template>
  <div v-loading="loading">
    <el-empty v-if="!runs.length" description="暂无推送记录" />
    <div v-else style="overflow-x: auto">
      <el-table :data="runs" stripe style="width: 100%" max-height="300">
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag
              size="small"
              :type="row.status === 'success' ? 'success' : row.status === 'failed' ? 'danger' : 'info'"
              effect="plain"
            >{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="推送行数" width="90" prop="rows" />
        <el-table-column label="消息" min-width="200" prop="message" />
        <el-table-column label="触发方式" width="90" prop="triggered_by" />
        <el-table-column label="开始时间" min-width="160">
          <template #default="{ row }">
            {{ formatDateTime(row.started_at) }}
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>
