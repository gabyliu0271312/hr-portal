<script setup lang="ts">
defineProps<{
  steps: Array<{ key: string; label: string }>
  currentStep: number
  ariaLabel?: string
}>()
</script>

<template>
  <nav class="performance-step-flow" :aria-label="ariaLabel || '配置步骤'">
    <template v-for="(step, index) in steps" :key="step.key">
      <span class="performance-step-flow__item" :class="{ current: index === currentStep }">{{ step.label }}</span>
      <span v-if="index < steps.length - 1" class="performance-step-flow__separator" aria-hidden="true"></span>
    </template>
  </nav>
</template>

<style scoped>
.performance-step-flow {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  font-size: 14px;
  line-height: 24px;
  pointer-events: none;
}
.performance-step-flow__item { color: #646a73; }
.performance-step-flow__item.current { color: #3370ff; font-weight: 600; }
.performance-step-flow__separator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  margin: 0 8px;
  color: #bbbfc4;
}
.performance-step-flow__separator::before {
  width: 8px;
  height: 8px;
  border-top: 2px solid currentColor;
  border-right: 2px solid currentColor;
  content: '';
  transform: rotate(45deg);
}
</style>
