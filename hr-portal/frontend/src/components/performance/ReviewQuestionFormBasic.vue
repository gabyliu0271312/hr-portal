<script setup lang="ts">
import type { ReviewQuestionForm } from './reviewQuestionTypes'
import PerformanceTextField from './PerformanceTextField.vue'
import PerformanceCheckbox from './PerformanceCheckbox.vue'
import PerformanceRequiredLabel from './PerformanceRequiredLabel.vue'
const props = defineProps<{ modelValue: Pick<ReviewQuestionForm, 'language' | 'name' | 'description' | 'remark'> }>()
const emit = defineEmits<{ 'update:modelValue': [value: typeof props.modelValue] }>()
function update(key: keyof typeof props.modelValue, value: string) { emit('update:modelValue', { ...props.modelValue, [key]: value }) }
function updateEnglish(enabled: boolean) { update('language', enabled ? '英文' : '中文') }
</script>
<template>
  <el-form label-position="top" class="question-basic-form">
    <el-form-item><template #label><PerformanceRequiredLabel label="语言" /></template><div class="language-control"><PerformanceCheckbox :model-value="true" label="中文" disabled /><PerformanceCheckbox :model-value="modelValue.language === '英文'" label="英文" @update:model-value="updateEnglish" /></div></el-form-item>
    <el-form-item><template #label><PerformanceRequiredLabel label="名称" /></template><PerformanceTextField :model-value="modelValue.name" placeholder="请输入名称" @update:model-value="update('name', $event)" /></el-form-item>
    <el-form-item><template #label><span class="field-label">描述</span></template><PerformanceTextField :model-value="modelValue.description" type="textarea" :maxlength="1000" show-count placeholder="描述将展示给评估人，帮助其进行评估" @update:model-value="update('description', $event)" /></el-form-item>
  </el-form>
</template>
<style scoped>
.field-label { color: rgb(31,35,41); font-weight: 600; }
.question-basic-form :deep(.el-form-item) { margin-bottom: 2px; }
.question-basic-form :deep(.el-form-item:nth-child(1)) { margin-bottom: 10px; }
.question-basic-form :deep(.el-form-item:nth-child(2)) { margin-bottom: 24px; }
.question-basic-form :deep(.el-form-item:nth-child(3)) { margin-bottom: 21px; }
.question-basic-form :deep(.el-form-item__label) { height: 22px; margin-bottom: 8px; color: #1f2329; font-size: 14px; font-weight: 600; line-height: 22px; }
.question-basic-form :deep(.performance-text-field) { width: 100%; max-width: 759px; }
.language-control { display: flex; align-items: center; gap: 24px; }
.language-control :deep(.performance-checkbox) { width: auto; }
</style>
