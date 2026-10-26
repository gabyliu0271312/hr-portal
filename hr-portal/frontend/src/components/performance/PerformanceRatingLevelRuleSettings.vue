<script setup lang="ts">
import { ElMessage } from 'element-plus'
import PerformanceButton from './PerformanceButton.vue'
import PerformanceSwitch from './PerformanceSwitch.vue'

const props = withDefaults(defineProps<{ modelValue?: boolean; disabled?: boolean }>(), { modelValue: false, disabled: false })
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

function openRules() {
  ElMessage.info('添加规则弹窗暂未开放')
}
</script>

<template>
  <div class="rating-level-rule-settings" aria-label="评分评级可选等级规则设置">
    <div class="rating-level-rule-settings__row">
      <span class="rating-level-rule-settings__label">按规则配置可选等级</span>
      <PerformanceSwitch :model-value="props.modelValue" :disabled="props.disabled" aria-label="按规则配置可选等级" @update:model-value="emit('update:modelValue', $event)" />
    </div>
    <div v-if="props.modelValue" class="rating-level-rule-settings__details">
      <p>当满足条件时，当前评估题仅可选如下规则配置的可选项，当不满足所有规则时，当前评估题可选任意选项。</p>
      <PerformanceButton variant="secondary" :disabled="props.disabled" class="rating-level-rule-settings__button" @click="openRules">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" data-icon="GanttsetOutlined">
          <path d="M4 4h16v7h2V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h8v-2H4V4Z" fill="currentColor" />
          <path d="M15.5 21.425a.552.552 0 0 1-.507-.211 4.672 4.672 0 0 1-.675-1.296.553.553 0 0 1 .084-.5l.408-.56a.963.963 0 0 0 0-1.134l-.345-.474a.553.553 0 0 1-.077-.523c.193-.5.47-.963.82-1.369a.553.553 0 0 1 .482-.18l.539.058a.962.962 0 0 0 .986-.57l.22-.503a.552.552 0 0 1 .398-.328 4.59 4.59 0 0 1 1.588-.024c.186.03.339.158.414.33l.23.524a.963.963 0 0 0 .987.571l.64-.07c.18-.02.361.043.48.18.329.378.594.807.787 1.27a.553.553 0 0 1-.073.535l-.417.573a.962.962 0 0 0 0 1.133l.483.664a.55.55 0 0 1 .08.514 4.673 4.673 0 0 1-.643 1.191.552.552 0 0 1-.507.21l-.83-.09a.963.963 0 0 0-.988.57l-.35.8a.552.552 0 0 1-.43.334 4.6 4.6 0 0 1-1.312-.02.552.552 0 0 1-.414-.33l-.343-.784a.963.963 0 0 0-.987-.57l-.727.08Zm3.196-1.449c.85 0 1.54-.696 1.54-1.555 0-.86-.69-1.556-1.54-1.556-.851 0-1.54.696-1.54 1.556 0 .859.689 1.555 1.54 1.555ZM6.5 11a1 1 0 1 0 0 2H14a1 1 0 1 0 0-2H6.5ZM9 8a1 1 0 0 1 1-1h7a1 1 0 1 1 0 2h-7a1 1 0 0 1-1-1Zm-1 7a1 1 0 1 0 0 2h3a1 1 0 1 0 0-2H8Z" fill="currentColor" />
        </svg>
        添加规则
      </PerformanceButton>
    </div>
  </div>
</template>

<style scoped>
.rating-level-rule-settings{display:flex;flex-direction:column;width:var(--performance-content-settings-width);max-width:100%;color:var(--color-text-primary);font:400 var(--font-size-md)/var(--performance-input-line-height) var(--font-sans)}
.rating-level-rule-settings__row{display:flex;align-items:center;width:100%;min-height:var(--performance-input-line-height)}
.rating-level-rule-settings__label{font-weight:600;white-space:nowrap}
.rating-level-rule-settings__row :deep(.performance-switch){margin-left:var(--spacing-2);flex-shrink:0}
.rating-level-rule-settings__details{margin-top:var(--spacing-2);color:var(--performance-settings-text-secondary);font-size:var(--font-size-md);line-height:var(--performance-settings-help-line-height)}
.rating-level-rule-settings__details p{margin:0}
.rating-level-rule-settings__button{display:flex;width:100%;height:var(--performance-control-height);min-width:0;margin-top:var(--spacing-2);padding:var(--performance-input-padding-y) var(--performance-input-padding-x);border:var(--performance-rule-button-border-width) dashed var(--color-line-control);border-radius:var(--performance-control-radius);background:var(--color-surface-disabled);color:var(--color-primary);font-weight:400}
.rating-level-rule-settings__button:hover:not(:disabled){background:var(--color-bg-hover);border-color:var(--color-primary)}
.rating-level-rule-settings__button:active:not(:disabled){background:var(--color-surface-disabled);border-color:var(--color-primary-hover)}
.rating-level-rule-settings__button :deep(svg){width:var(--font-size-md);height:var(--font-size-md);margin-right:var(--spacing-1)}
</style>
