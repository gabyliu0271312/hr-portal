<template>
  <label class="search-input" :class="`is-${variant}`" :style="{ width }">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="search-input__icon" aria-hidden="true">
      <path d="M16.473 17.887A9.46 9.46 0 0 1 10.5 20a9.5 9.5 0 1 1 9.5-9.5 9.46 9.46 0 0 1-2.113 5.973l3.773 3.773a.996.996 0 0 1-.007 1.407.996.996 0 0 1-1.407.007l-3.773-3.773ZM18 10.5a7.5 7.5 0 1 0-15 0 7.5 7.5 0 0 0 15 0Z" fill="currentColor" />
    </svg>
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

<script setup lang="ts">
withDefaults(defineProps<{
  modelValue: string
  placeholder: string
  width?: string
  variant?: 'default' | 'compact'
  ariaLabel?: string
  disabled?: boolean
}>(), {
  width: '224px',
  ariaLabel: '搜索',
  disabled: false,
  variant: 'default',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  search: []
  clear: []
}>()
</script>

<style scoped>
.search-input { display: inline-flex; align-items: center; box-sizing: border-box; height: var(--control-height); padding: 4px 8px 4px var(--input-padding-x); background: var(--color-bg-card); border: 1px solid var(--control-border); border-radius: var(--control-radius); color: var(--color-text-primary); transition: border-color var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard); }
.search-input.is-compact { height: var(--input-compact-height); }
.search-input:focus-within { border-color: var(--control-focus-border); outline: 0; box-shadow: none; }
.search-input__icon { flex: 0 0 var(--icon-size); width: var(--icon-size); height: var(--icon-size); color: var(--color-text-secondary); }
.search-input input { min-width: 0; flex: 1; height: var(--input-line-height); margin-left: var(--field-label-gap); padding: 0; border: 0; outline: 0; background: transparent; color: inherit; font: inherit; line-height: var(--input-line-height); }
.search-input input::placeholder { color: var(--color-text-placeholder); }
.search-input input:disabled { cursor: not-allowed; }
.search-input button { flex: 0 0 var(--icon-size); width: var(--icon-size); height: var(--icon-size); padding: 0; border: 0; border-radius: var(--button-radius); background: transparent; color: var(--color-text-placeholder); cursor: pointer; font-size: var(--font-size-lg); line-height: var(--icon-size); }
.search-input button:hover,.search-input button:focus-visible { background: var(--color-surface-disabled); color: var(--color-action-primary-hover); outline: 0; }
</style>
