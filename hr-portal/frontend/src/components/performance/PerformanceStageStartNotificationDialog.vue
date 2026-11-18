<script setup lang="ts">
import { ref, watch } from 'vue'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformanceFormItem from './PerformanceFormItem.vue'
import PerformanceRadioGroup from './PerformanceRadioGroup.vue'
import PerformanceInfoPopover from './PerformanceInfoPopover.vue'
import UiButton from '../ui/UiButton.vue'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const holiday = ref('no')
const holidayHelp = '屏蔽后，法定节假日和周末将不发送通知。（调休上班日正常通知）\n备注：当前法定节假日覆盖中国大陆及部分非中国大陆的国家/地区。'
watch(() => props.modelValue, open => { if (open) holiday.value = 'no' })
function close() { emit('update:modelValue', false) }
</script>

<template>
  <PerformanceDialogShell
    :model-value="modelValue"
    title="编辑环节启动通知"
    width="var(--performance-notification-dialog-width)"
    dialog-class="stage-start-notification-dialog"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <form class="stage-start-notification-form" @submit.prevent="close">
      <PerformanceFormItem label="是否在节假日和周末时屏蔽" required>
        <template #label-extra>
          <PerformanceInfoPopover :content="holidayHelp" width="var(--performance-notification-holiday-help-width)" preserve-newlines aria-label="节假日屏蔽说明" />
        </template>
        <PerformanceRadioGroup
          v-model="holiday"
          :options="[{ value: 'yes', label: '屏蔽' }, { value: 'no', label: '不屏蔽' }]"
          name="stage-start-notification-holiday"
          aria-label="节假日和周末屏蔽"
          gap="var(--spacing-6)"
        />
      </PerformanceFormItem>
    </form>
    <template #footer>
      <div class="stage-start-notification-actions">
        <UiButton @click="close">取消</UiButton>
        <UiButton variant="primary" @click="close">确定</UiButton>
      </div>
    </template>
  </PerformanceDialogShell>
</template>

<style scoped>
:global(.stage-start-notification-dialog .performance-dialog__body) {
  min-height: var(--performance-stage-start-notification-body-min-height);
}
:global(.stage-start-notification-dialog) {
  --performance-required-mark-gap: var(--spacing-1);
  --performance-button-secondary-border: var(--performance-notification-cancel-border);
}
.stage-start-notification-form :deep(.performance-form-item) { margin-bottom: 0; }
.stage-start-notification-form :deep(.performance-form-item__label) {
  align-items: center;
  min-height: var(--performance-dialog-header-title-line-height);
  line-height: var(--performance-dialog-header-title-line-height);
}
.stage-start-notification-actions { display: flex; justify-content: flex-end; gap: var(--performance-dialog-footer-button-gap); }
</style>
