<template>
  <button class="text-button" :class="{ 'icon-only': !label }" type="button" :aria-label="label || ariaLabel" @click="emit('click')">
    <span v-if="$slots.icon" class="text-button-icon"><slot name="icon" /></span>
    <span v-if="label">{{ label }}</span>
  </button>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  label?: string
  ariaLabel?: string
}>(), {
  label: '',
  ariaLabel: '',
})

const emit = defineEmits<{
  click: []
}>()
</script>

<style scoped>
.text-button { display: inline-flex; position: relative; justify-content: center; align-items: center; min-width: 0; min-height: 0; margin-top: -2px; padding: 2px 4px; box-sizing: border-box; border: 0; border-radius: 6px; background: transparent; color: #1456f0; cursor: pointer; font-family: inherit; font-size: 14px; font-weight: 400; line-height: 18px; text-align: center; white-space: nowrap; transition: color 0.1s ease-in, background-color 0.1s ease-in, border-color 0.1s ease-in; }
.text-button:hover { background: rgba(20, 86, 240, 0.2); }
.text-button:active { background: rgba(20, 86, 240, 0.32); }
.text-button-icon { display: block; width: 14px; height: 14px; }
.text-button-icon :deep(svg) { width: 100%; height: 100%; }
</style>
