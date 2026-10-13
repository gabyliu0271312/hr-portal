<script setup lang="ts">
withDefaults(defineProps<{ label?: string; required?: boolean }>(), { label: '', required: true })
</script>

<template>
  <span class="performance-required-label">
    <span class="performance-required-label__text"><slot>{{ label }}</slot></span>
    <span v-if="required" class="performance-required-label__mark" aria-hidden="true">*</span>
  </span>
</template>

<style scoped>
.performance-required-label { display: inline-flex; align-items: center; color: inherit; }
.performance-required-label__text { display: inline-block; }
.performance-required-label__mark {
  display: flex; flex: 0 0 var(--performance-required-mark-width); align-items: center; width: var(--performance-required-mark-width); height: 22px;
  margin-left: var(--performance-required-mark-gap); padding: 0; box-sizing: border-box; background-color: transparent;
  color: var(--performance-field-error-color); font-family: SimSun, sans-serif; font-size: var(--font-size-md);
  font-weight: 400; line-height: 22px; letter-spacing: normal; text-align: left;
  border-radius: 0; overflow: visible;
}
</style>

