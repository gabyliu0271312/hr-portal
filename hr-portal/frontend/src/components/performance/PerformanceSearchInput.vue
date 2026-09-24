<script setup lang="ts">
import SearchOutlinedIcon from './SearchOutlinedIcon.vue'

withDefaults(defineProps<{
  modelValue: string
  placeholder: string
  width?: string
  ariaLabel?: string
  disabled?: boolean
}>(), {
  width: '224px',
  ariaLabel: '搜索',
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  search: []
  clear: []
}>()
</script>

<template>
  <label class="performance-search-input" :style="{ width }">
    <SearchOutlinedIcon class="search-icon" />
    <input
      :value="modelValue"
      :placeholder="placeholder"
      :aria-label="ariaLabel"
      :disabled="disabled"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      @keyup.enter="emit('search')"
    />
    <button v-if="modelValue && !disabled" type="button" aria-label="清除搜索" @click="emit('update:modelValue', ''); emit('clear')">×</button>
  </label>
</template>

<style scoped>
.performance-search-input { display: inline-flex; align-items: center; box-sizing: border-box; height: var(--performance-control-height); padding: 4px 8px 4px var(--performance-input-padding-x); background: var(--color-bg-card); border: 1px solid var(--performance-field-border); border-radius: var(--performance-control-radius); color: var(--color-text-primary); transition: border-color var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard); }
.performance-search-input:focus-within { border-color: var(--performance-field-border-focus); outline: 0; box-shadow: var(--performance-field-focus-ring); }
.search-icon { flex: 0 0 var(--performance-icon-size); width: var(--performance-icon-size); height: var(--performance-icon-size); color: var(--color-text-secondary); }
.performance-search-input input { min-width: 0; flex: 1; height: var(--performance-input-line-height); margin-left: var(--performance-field-label-gap); padding: 0; border: 0; outline: 0; background: transparent; color: inherit; font: inherit; line-height: var(--performance-input-line-height); }
.performance-search-input input::placeholder { color: var(--color-text-placeholder); }
.performance-search-input input:disabled { cursor: not-allowed; }
.performance-search-input button { flex: 0 0 var(--performance-icon-size); width: var(--performance-icon-size); height: var(--performance-icon-size); padding: 0; border: 0; border-radius: var(--performance-button-radius); background: transparent; color: var(--color-text-placeholder); cursor: pointer; font-size: var(--font-size-lg); line-height: var(--performance-icon-size); }
.performance-search-input button:hover,.performance-search-input button:focus-visible { background: var(--color-surface-disabled); color: var(--color-action-primary-hover); outline: 0; }
</style>
