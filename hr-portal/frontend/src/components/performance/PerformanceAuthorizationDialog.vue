<template>
  <PerformanceDialogShell
    :model-value="modelValue"
    :title="mode === 'users' ? '添加授权' : '添加规则'"
    width="var(--performance-dialog-wide-width)"
    dialog-class="performance-authorization-dialog"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="authorization-dialog-content">
      <p class="authorization-dialog-intro">{{ mode === 'users' ? '为指定用户配置绩效管理角色' : '按用户范围配置绩效管理角色' }}</p>
      <PerformanceFormItem :label="mode === 'users' ? '选择用户' : '用户范围'" required>
        <PerformanceSearchSelect
          :model-value="null"
          :options="[]"
          :aria-label="mode === 'users' ? '选择用户' : '用户范围'"
          :placeholder="mode === 'users' ? '请选择用户' : '请选择用户范围'"
          disabled
        />
        <span class="authorization-dialog-hint">选项将在下一步接入实际数据</span>
      </PerformanceFormItem>
      <PerformanceFormItem label="授权角色" required>
        <PerformanceSearchSelect
          :model-value="null"
          :options="[]"
          aria-label="授权角色"
          placeholder="请选择授权角色"
          disabled
        />
        <span class="authorization-dialog-hint">角色选项将在下一步接入授权数据</span>
      </PerformanceFormItem>
    </div>
    <template #footer>
      <div class="authorization-dialog-actions">
        <PerformanceButton variant="secondary" @click="emit('update:modelValue', false)">取消</PerformanceButton>
        <PerformanceButton variant="primary" disabled @click="emit('next')">下一步</PerformanceButton>
      </div>
    </template>
  </PerformanceDialogShell>
</template>

<script setup lang="ts">
import PerformanceButton from './PerformanceButton.vue'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformanceFormItem from './PerformanceFormItem.vue'
import PerformanceSearchSelect from './PerformanceSearchSelect.vue'

withDefaults(defineProps<{
  modelValue: boolean
  mode: 'users' | 'rules'
}>(), {
  modelValue: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  next: []
}>()
</script>

<style scoped>
.authorization-dialog-content { min-width: 0; }
.authorization-dialog-intro { margin: 0 0 var(--spacing-6); color: var(--color-text-secondary); font-size: var(--font-size-md); line-height: var(--performance-input-line-height); }
.authorization-dialog-hint { display: block; margin-top: var(--performance-field-error-gap); color: var(--performance-field-help-color); font-size: var(--font-size-sm); line-height: var(--performance-field-error-line-height); }
.authorization-dialog-actions { display: flex; justify-content: flex-end; gap: var(--performance-dialog-footer-gap); }
</style>
