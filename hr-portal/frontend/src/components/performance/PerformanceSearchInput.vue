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
.performance-search-input { display: inline-flex; align-items: center; box-sizing: border-box; height: 32px; padding: 4px 8px 4px 11px; background: #fff; border: 1px solid #d0d3d6; border-radius: 6px; color: #1f2329; }
.performance-search-input:focus-within { border-color: #3370ff; outline: 2px solid rgba(51,112,255,.2); }
.search-icon { flex: 0 0 16px; width: 16px; height: 16px; color: #646a73; }
.performance-search-input input { min-width: 0; flex: 1; height: 22px; margin-left: 8px; padding: 0; border: 0; outline: 0; background: transparent; color: inherit; font: inherit; line-height: 22px; }
.performance-search-input input::placeholder { color: #8f959e; }
.performance-search-input input:disabled { cursor: not-allowed; }
.performance-search-input button { flex: 0 0 16px; width: 16px; height: 16px; padding: 0; border: 0; background: transparent; color: #8f959e; cursor: pointer; font-size: 16px; line-height: 16px; }
</style>
