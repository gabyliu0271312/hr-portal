<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { performanceCycleApi, type PerformancePersonChangeItem } from '@/api/performance'

const props = defineProps<{
  modelValue: boolean
  cycleId: number
  employeeNo: string
  employeeName: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: boolean]; updated: [] }>()

const UPDATE_OPTIONS = [
  { field: 'job_family', label: '序列（职类）' },
  { field: 'position_level', label: '职级（职位层级）' },
  { field: 'direct_supervisor', label: '直属上级' },
  { field: 'department', label: '部门' },
] as const

const selected = ref<string[]>([])
const submitting = ref(false)

watch(() => props.modelValue, open => {
  if (open) selected.value = []
})

const canSubmit = computed(() => selected.value.length > 0 && !submitting.value)

function toggleAll(checked: boolean | string | number) {
  selected.value = checked ? UPDATE_OPTIONS.map(option => option.field) : []
}

async function submit() {
  if (!selected.value.length) return
  submitting.value = true
  try {
    const result = await performanceCycleApi.updatePersonInfo(props.cycleId, props.employeeNo, [...selected.value] as Array<'job_family' | 'position_level' | 'direct_supervisor' | 'department'>)
    if (result.changed.length) {
      ElMessage.success(`已更新 ${result.changed.length} 个字段：${result.changed.map((item: PerformancePersonChangeItem) => item.label).join('、')}`)
    } else {
      ElMessage.info('所选维度与当前周期快照一致，无需更新')
    }
    emit('updated')
    emit('update:modelValue', false)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="更新人员信息"
    width="600px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <p class="subject">{{ employeeName }}（{{ employeeNo }}）</p>
    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="更新信息内容 *"
      description="将从最新员工花名册同步所选信息维度到本周期的人员快照，实际发生的变更会记录在「查看更新记录」中。"
    />
    <el-checkbox
      class="select-all"
      :model-value="selected.length === UPDATE_OPTIONS.length"
      :indeterminate="selected.length > 0 && selected.length < UPDATE_OPTIONS.length"
      @change="toggleAll"
    >
      全选
    </el-checkbox>
    <el-checkbox-group v-model="selected" class="options">
      <el-checkbox v-for="option in UPDATE_OPTIONS" :key="option.field" :value="option.field">
        {{ option.label }}
      </el-checkbox>
    </el-checkbox-group>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="submitting" :disabled="!canSubmit" @click="submit">确定</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.subject {
  margin: 0 0 12px;
  color: var(--color-text-secondary, #646a73);
  font-size: 13px;
}
.select-all {
  margin: 14px 0 4px;
  font-weight: 600;
}
.options {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding-left: 4px;
}
.options .el-checkbox {
  height: 32px;
  margin-right: 0;
}
</style>
