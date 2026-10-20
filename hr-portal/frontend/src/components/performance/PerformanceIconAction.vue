<template>
  <PerformancePermissionButton :allowed="true" op="U" :disabled="disabled" class="other-settings-icon-action" :class="{ 'has-text': text }" :aria-label="label" @click="$emit('click')">
    <svg v-if="icon === 'edit'" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m17.57 7.244-.006-.006.37-.37a1 1 0 0 0 .001-1.412l-3.434-3.453-.002-.002a1 1 0 0 0-1.414 0l-.705.706.01.01L2 13.186V17a1 1 0 0 0 1 1h3.814L17.57 7.244Zm-3.273.389-2.015-2.015 1.487-1.515 2.023 2.034-1.495 1.496Zm-3.415-.587 2.002 2.002-6.913 6.92h-.004l-1.934-1.935v-.003l6.849-6.984ZM3 20a1 1 0 1 0 0 2h18a1 1 0 0 0 0-2H3Z" fill="currentColor" />
    </svg>
    <svg v-else viewBox="0 0 24 24" aria-hidden="true">
      <path d="m4.328 19.734-.31-.34a10.91 10.91 0 0 1-2.386-4.146l-.135-.436L3.545 12 1.497 9.188l.135-.436a10.91 10.91 0 0 1 2.385-4.147l.311-.339 3.442.377 1.398-3.187.448-.101A10.843 10.843 0 0 1 12 1.09c.809 0 1.607.089 2.384.264l.448.1 1.398 3.188 3.442-.377.31.34a10.91 10.91 0 0 1 2.386 4.146l.135.436L20.455 12l2.048 2.812-.135.436a10.91 10.91 0 0 1-2.385 4.147l-.311.339-3.442-.377-1.398 3.187-.448.101a10.848 10.848 0 0 1-4.768 0l-.448-.1-1.398-3.188-3.442.377Zm3.485-2.21a1.488 1.488 0 0 1 1.525.881l1.12 2.554a9.05 9.05 0 0 0 3.084 0l1.12-2.554a1.488 1.488 0 0 1 1.524-.881l2.755.3c.665-.8 1.19-1.71 1.547-2.69l-1.644-2.258a1.488 1.488 0 0 1 0-1.752l1.644-2.258a9.091 9.091 0 0 0-1.547-2.69l-2.755.3a1.488 1.488 0 0 1-1.524-.881l-1.12-2.554a9.053 9.053 0 0 0-3.084 0l-1.12 2.554a1.488 1.488 0 0 1-1.525.881l-2.754-.3a9.09 9.09 0 0 0-1.548 2.69l1.645 2.258c.38.522.38 1.23 0 1.752l-1.644 2.258c.358.98.882 1.89 1.547 2.69l2.754-.3ZM12 16.545c-2.502 0-4.528-2.036-4.528-4.545 0-2.51 2.026-4.545 4.528-4.545S16.528 9.49 16.528 12 14.502 16.545 12 16.545Zm0-1.818c1.496 0 2.71-1.22 2.71-2.727A2.719 2.719 0 0 0 12 9.273 2.719 2.719 0 0 0 9.29 12 2.719 2.719 0 0 0 12 14.727Z" fill="currentColor" />
    </svg>
    <span v-if="text" class="other-settings-icon-action__text">{{ text }}</span>
  </PerformancePermissionButton>
</template>

<script setup lang="ts">
import PerformancePermissionButton from './PerformancePermissionButton.vue'

withDefaults(defineProps<{ icon?: 'edit' | 'settings'; label: string; text?: string; disabled?: boolean }>(), { icon: 'edit', text: '' })
defineEmits<{ click: [] }>()
</script>

<style scoped>
.other-settings-icon-action { display: inline-flex; align-items: center; justify-content: center; min-width: 0; width: 24px; height: 24px; flex: 0 0 24px; padding: 2px 4px; border: 0; border-radius: var(--radius-md); background: transparent; color: var(--color-primary-hover); cursor: pointer; }
.other-settings-icon-action :deep(.performance-button__content) { line-height: 0; }
.other-settings-icon-action.has-text { width: auto; flex-basis: auto; }
.other-settings-icon-action__text { margin-left: var(--spacing-1); font-size: var(--font-size-md); line-height: 18px; }
.other-settings-icon-action svg { flex-shrink: 0; width: 14px; height: 14px; }
.other-settings-icon-action:hover { background: var(--performance-button-text-hover-background); }
.other-settings-icon-action:focus-visible { outline: 0; box-shadow: var(--performance-button-focus-ring); }
</style>
