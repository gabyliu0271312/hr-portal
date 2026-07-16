<script setup lang="ts">
import { formatDateTime } from '@/utils/datetime'
import { ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Clock } from '@element-plus/icons-vue'
import ScheduleSelector from './ScheduleSelector.vue'
import { schedulerApi, type ScheduledJobItem } from '@/api/scheduler'

const props = defineProps<{
  visible: boolean
  kind: string
  businessId: number
  businessName?: string
  payload?: Record<string, any>
}>()

const emit = defineEmits<{
  'update:visible': [v: boolean]
  saved: []
  deleted: []
}>()

const loading = ref(false)
const saving = ref(false)
const job = ref<ScheduledJobItem | null>(null)
const cron = ref('手动触发')
const enabled = ref(true)

async function load() {
  loading.value = true
  try {
    const jobs = await schedulerApi.jobs({ kind: props.kind })
    job.value = jobs.find(j => j.business_id === props.businessId) || null
    if (job.value) {
      cron.value = job.value.cron
      enabled.value = job.value.enabled
    } else {
      cron.value = '手动触发'
      enabled.value = true
    }
  } catch {
    job.value = null
  } finally {
    loading.value = false
  }
}

watch(() => props.visible, (v) => {
  if (v) load()
})

async function save() {
  saving.value = true
  try {
    if (job.value) {
      await schedulerApi.updateJob(job.value.id, {
        cron: cron.value,
        payload: props.payload || job.value.payload,
        enabled: enabled.value,
      })
      ElMessage.success('定时配置已更新')
    } else {
      await schedulerApi.createJob({
        kind: props.kind,
        business_id: props.businessId,
        cron: cron.value,
        payload: props.payload || {},
        enabled: enabled.value,
      })
      ElMessage.success('定时配置已创建')
    }
    emit('saved')
    emit('update:visible', false)
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
  } finally {
    saving.value = false
  }
}

async function remove() {
  if (!job.value) return
  try {
    await ElMessageBox.confirm('确定删除定时配置？', '确认', { type: 'warning' })
    await schedulerApi.deleteJob(job.value.id)
    job.value = null
    cron.value = '手动触发'
    enabled.value = true
    ElMessage.success('定时配置已删除')
    emit('deleted')
    emit('update:visible', false)
  } catch { /* 取消 */ }
}

const kindLabels: Record<string, string> = {
  dataset_build: '数据集构建',
  snapshot_run: '快照任务',
  metric_compute: '指标计算',
  quality_run: '质量检查',
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="emit('update:visible', $event)"
    title="定时配置"
    width="480px"
    @close="job = null"
  >
    <div v-loading="loading">
      <div v-if="businessName" style="color:#909399;font-size:13px;margin-bottom:16px">
        {{ kindLabels[kind] || kind }} · {{ businessName }}
      </div>

      <el-form label-width="80px" size="small">
        <el-form-item label="调度计划">
          <ScheduleSelector v-model:schedule="cron" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="enabled" active-text="启用" inactive-text="停用" />
        </el-form-item>
      </el-form>

      <div v-if="job" style="margin-top:16px;padding:10px 12px;background:#f5f7fa;border-radius:6px;font-size:12px;color:#909399">
        <div>上次执行：{{ formatDateTime(job.last_run_at) || '—' }}</div>
        <div>上次状态：<span :style="{color:job.last_status==='success'?'#67c23a':'#f56c6c'}">{{ job.last_status || '—' }}</span></div>
      </div>
    </div>

    <template #footer>
      <div style="display:flex;justify-content:space-between">
        <el-button v-if="job" type="danger" text @click="remove">删除定时</el-button>
        <div>
          <el-button @click="emit('update:visible', false)">取消</el-button>
          <el-button type="primary" :loading="saving" @click="save">保存</el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>
