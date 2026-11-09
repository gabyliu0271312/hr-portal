<template>
  <div class="no-origin-choice">
    <p>以下 {{ peopleCount }} 名被评估人的 {{ tasks.length }} 项任务无原处理人；接收人：{{ recipient }}。</p>
    <ul><li v-for="task in tasks" :key="`${task.project_id}:${task.task_id}`">{{ task.display_name || task.employee_no || '未提供姓名' }} · {{ task.stage_label }} · {{ task.role_label || task.role_key }}</li></ul>
    <PerformanceRadioGroup :model-value="modelValue" :disabled="disabled" :options="[{ value:'AUTHORIZE', label:'授权接收人处理' }, { value:'SKIP', label:'不授权，跳过以上任务' }]" direction="vertical" name="no-origin-reviewer" aria-label="无原处理人任务授权选择" @update:model-value="$emit('update:modelValue', $event)" />
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import PerformanceRadioGroup from './PerformanceRadioGroup.vue'
const props = defineProps<{ modelValue: string; recipient: string; disabled?: boolean; tasks: Array<{ project_id: number; task_id: number; display_name?: string; employee_no?: string; stage_label: string; role_label: string | null; role_key: string | null }> }>()
defineEmits<{ 'update:modelValue': [value: string] }>()
const peopleCount = computed(() => new Set(props.tasks.map(task => `${task.project_id}:${task.employee_no || task.task_id}`)).size)
</script>
<style scoped>
.no-origin-choice { color:var(--color-text-primary); font-size:var(--font-size-md); }
.no-origin-choice p { margin:0 0 12px; }
.no-origin-choice ul { margin:0 0 16px; padding-left:20px; overflow-wrap:anywhere; }
</style>
