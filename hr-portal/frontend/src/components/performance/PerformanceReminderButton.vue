<template>
  <button type="button" class="performance-remind-button" :class="[`performance-remind-button--${variant}`, legacyClass]" :aria-label="ariaLabel" :title="title" :disabled="disabled" @click="emit('click')">
    <BellOutlinedIcon />
    <span v-if="variant !== 'icon'">催办</span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import BellOutlinedIcon from './BellOutlinedIcon.vue'

const props = withDefaults(defineProps<{
  variant?: 'icon' | 'outline' | 'text'
  ariaLabel?: string
  title?: string
  disabled?: boolean
}>(), { variant: 'outline', ariaLabel: '催办', title: '催办', disabled: false })

const legacyClass = computed(() => ({ icon: 'performance-reminder-button', outline: 'performance-stage-empty__remind', text: 'evaluate-ratio-remind-btn' })[props.variant])
const emit = defineEmits<{ click: [] }>()
</script>

<style scoped>
.performance-remind-button{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;border-radius:6px;color:var(--color-primary);cursor:pointer;font:400 14px/22px var(--font-sans);transition:color .1s ease-in,background-color .1s ease-in,border-color .1s ease-in}.performance-remind-button:disabled{cursor:not-allowed;opacity:.5}.performance-remind-button svg{display:block;width:14px;height:14px;flex:none}.performance-remind-button--outline{min-width:80px;height:32px;gap:4px;padding:4px 11px;border:1px solid var(--color-primary);background:#fff}.performance-remind-button--outline:hover:not(:disabled),.performance-remind-button--outline:focus-visible{background:#f2f3f5;outline:0}.performance-remind-button--icon{width:80px;min-width:80px;height:32px;padding:4px 11px;border:1px solid var(--color-primary);background:#c2d4ff}.performance-remind-button--icon:hover:not(:disabled),.performance-remind-button--icon:focus-visible{background:#abc4ff;outline:0}.performance-remind-button--icon:active:not(:disabled){background:#9ebaff}.performance-remind-button--text{height:22px;gap:6px;padding:0 4px;border:0;background:transparent;color:var(--color-primary-hover);line-height:18px}.performance-remind-button--text:hover:not(:disabled),.performance-remind-button--text:focus-visible{background:rgba(20,86,240,.2);outline:0}
</style>
