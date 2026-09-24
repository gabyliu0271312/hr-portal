<template>
  <section class="notification-rule-summary">
    <div ref="nameRoot" class="notification-rule-summary__name" @click="onLabelClick">
      <PerformanceCheckbox :model-value="enabled" :label="label" :disabled="disabled" @update:model-value="onToggle" />
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 2C5.925 23 1 18.075 1 12S5.925 1 12 1s11 4.925 11 11-4.925 11-11 11Zm-1-7.5v-4a1 1 0 1 1 0-2h1.004c.55 0 .998.445.998.996.003 1.668-.002 3.336-.002 5.004h.5a1 1 0 1 1 0 2h-3a1 1 0 1 1 0-2h.5Zm1-7a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" fill="currentColor" /></svg>
    </div>
    <div v-if="enabled" class="notification-rule-summary__details">
      <div><span>通知频率</span><strong>{{ frequency }}</strong></div>
      <div><span>通知时间</span><strong>{{ time }}</strong></div>
      <div><span>是否在节假日和周末时屏蔽</span><strong>{{ holidayPolicy }}</strong></div>
      <PerformancePermissionButton :allowed="true" op="U" disabled class="notification-rule-summary__edit" :aria-label="`编辑${label}（暂不可用）`" title="配置功能待接入">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m17.57 7.244-.006-.006.37-.37a1 1 0 0 0 .001-1.412l-3.434-3.453-.002-.002a1 1 0 0 0-1.414 0l-.705.706.01.01L2 13.186V17a1 1 0 0 0 1 1h3.814L17.57 7.244Zm-3.273.389-2.015-2.015 1.487-1.515 2.023 2.034-1.495 1.496Zm-3.415-.587 2.002 2.002-6.913 6.92h-.004l-1.934-1.935v-.003l6.849-6.984ZM3 20a1 1 0 1 0 0 2h18a1 1 0 1 0 0-2H3Z" fill="currentColor" /></svg>
        编辑
      </PerformancePermissionButton>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import PerformanceCheckbox from './PerformanceCheckbox.vue'
import PerformancePermissionButton from './PerformancePermissionButton.vue'

const props = defineProps<{ label: string; enabled: boolean; disabled?: boolean; frequency: string; time: string; holidayPolicy: string }>()

const emit = defineEmits<{ (event: 'update:enabled', value: boolean): void }>()
const nameRoot = ref<HTMLElement | null>(null)

function onToggle(value: boolean) {
  const input = nameRoot.value?.querySelector<HTMLInputElement>('input[type=checkbox]')
  if (input) input.checked = props.enabled
  if (!props.disabled) emit('update:enabled', value)
}

function onLabelClick(event: MouseEvent) {
  if (!props.disabled && (event.target as HTMLElement).closest('.performance-checkbox__label')) {
    emit('update:enabled', !props.enabled)
  }
}
</script>

<style scoped>
.notification-rule-summary{margin-top:8px;color:#1f2329;font-size:14px;line-height:22px}
.notification-rule-summary__name{display:flex;align-items:center;gap:4px}
.notification-rule-summary__name :deep(.performance-checkbox){width:auto;color:#1f2329}
.notification-rule-summary__name svg{flex:none;color:#646a73}
.notification-rule-summary__name :deep(.performance-checkbox__label){cursor:pointer}
.notification-rule-summary__details{position:relative;display:grid;grid-template-columns:200px minmax(0,1fr) minmax(0,1fr);gap:20px;box-sizing:border-box;margin-top:10px;padding:12px 76px 12px 16px;border-radius:8px;background:#f5f6f7}
.notification-rule-summary__details>div{display:flex;min-width:0;flex-direction:column}
.notification-rule-summary__details span{margin-bottom:4px;color:#646a73}
.notification-rule-summary__details strong{font-weight:400;overflow-wrap:anywhere}
.notification-rule-summary__details :deep(.notification-rule-summary__edit){position:absolute;top:8px;right:12px;display:inline-flex;align-items:center;gap:4px;min-width:0;height:var(--performance-button-height);padding:4px var(--spacing-1);border-radius:var(--performance-button-radius);font-size:var(--performance-button-font-size);line-height:var(--performance-button-line-height)}.notification-rule-summary__details :deep(.notification-rule-summary__edit svg){width:14px;height:14px}.notification-rule-summary__details :deep(.notification-rule-summary__edit.is-disabled),.notification-rule-summary__details :deep(.notification-rule-summary__edit:disabled){cursor:not-allowed;opacity:.7}
@media (max-width:900px){.notification-rule-summary__details{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:560px){.notification-rule-summary__details{grid-template-columns:1fr;gap:8px;padding-right:16px;padding-top:40px}}
</style>
