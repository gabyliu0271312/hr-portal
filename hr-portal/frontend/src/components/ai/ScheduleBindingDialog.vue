<template>
  <el-dialog
    v-model="visible"
    title="绑定定时执行"
    width="480px"
    @close="handleClose"
  >
    <el-form :model="form" label-width="100px">
      <el-form-item label="任务名称">
        <span>{{ task?.name }}</span>
      </el-form-item>

      <el-form-item label="启用定时">
        <el-switch v-model="form.enabled" />
      </el-form-item>

      <el-form-item label="执行频率">
        <el-select v-model="form.preset" placeholder="选择预设频率" @change="onPresetChange">
          <el-option label="每月1号 09:00" value="0 0 9 1 * *" />
          <el-option label="每月10号 09:00" value="0 0 9 10 * *" />
          <el-option label="每月15号 09:00" value="0 0 9 15 * *" />
          <el-option label="每周一 09:00" value="0 0 9 * * 1" />
          <el-option label="每天 09:00" value="0 0 9 * * *" />
          <el-option label="自定义" value="custom" />
        </el-select>
      </el-form-item>

      <el-form-item v-if="form.preset === 'custom'" label="Cron 表达式">
        <el-input v-model="form.cron_expression" placeholder="如: 0 0 9 1 * *" />
        <div class="cron-hint">格式: 秒 分 时 日 月 周（6位）</div>
      </el-form-item>

      <el-form-item v-if="form.cron_expression" label="下次执行">
        <span class="next-run">{{ nextRunPreview }}</span>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { dataCompareApi, type TaskOut, type TaskUpdate } from '@/api/data-compare'

const props = defineProps<{
  modelValue: boolean
  task: TaskOut | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: []
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const saving = ref(false)

const form = ref({
  enabled: false,
  preset: '',
  cron_expression: '',
})

watch(() => props.task, (task) => {
  if (task) {
    form.value.enabled = task.enabled
    form.value.cron_expression = task.cron_expression || ''
    // Try to match preset
    const presets: Record<string, string> = {
      '0 0 9 1 * *': '0 0 9 1 * *',
      '0 0 9 10 * *': '0 0 9 10 * *',
      '0 0 9 15 * *': '0 0 9 15 * *',
      '0 0 9 * * 1': '0 0 9 * * 1',
      '0 0 9 * * *': '0 0 9 * * *',
    }
    const matched = Object.entries(presets).find(([, v]) => v === task.cron_expression)
    form.value.preset = matched ? matched[1] : (task.cron_expression ? 'custom' : '')
  }
}, { immediate: true })

const nextRunPreview = computed(() => {
  if (!form.value.cron_expression) return '-'
  // Simple preview — just show the cron for now
  return `Cron: ${form.value.cron_expression}`
})

function onPresetChange(val: string) {
  if (val !== 'custom') {
    form.value.cron_expression = val
  }
}

async function handleSave() {
  if (!props.task) return
  saving.value = true
  try {
    const update: TaskUpdate = {
      enabled: form.value.enabled,
      cron_expression: form.value.cron_expression || null,
    }
    await dataCompareApi.updateTask(props.task.id, update)
    ElMessage.success('定时配置已保存')
    emit('saved')
    visible.value = false
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
  } finally {
    saving.value = false
  }
}

function handleClose() {
  visible.value = false
}
</script>

<style scoped>
.cron-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}
.next-run {
  color: var(--el-color-primary);
  font-size: 13px;
}
</style>
