<script setup lang="ts">
withDefaults(defineProps<{ modelValue: boolean; disabled?: boolean }>(), { disabled: false })
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <label class="ui-checkbox" :class="{ 'is-disabled': disabled }">
    <span class="ui-checkbox__control">
      <input type="checkbox" :checked="modelValue" :disabled="disabled" @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)" />
      <span class="ui-checkbox__box" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="m3.5 8 3 3 6-6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg></span>
    </span>
    <span class="ui-checkbox__label"><slot /></span>
  </label>
</template>

<style scoped>
.ui-checkbox { display: inline-flex; flex: 0 0 auto; align-items: center; gap: var(--ui-checkbox-gap); min-height: var(--ui-toolbar-control-height); color: var(--color-text-primary); font-size: var(--font-size-md); line-height: var(--ui-checkbox-line-height); cursor: pointer; }
.ui-checkbox__control { position: relative; display: inline-flex; flex: 0 0 var(--ui-checkbox-size); width: var(--ui-checkbox-size); height: var(--ui-checkbox-size); }
.ui-checkbox input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: inherit; }
.ui-checkbox__box { display: inline-flex; box-sizing: border-box; width: 100%; height: 100%; border: var(--ui-control-border-width) solid var(--ui-checkbox-border); border-radius: var(--ui-checkbox-radius); background: var(--color-bg-card); color: var(--color-bg-card); pointer-events: none; }
.ui-checkbox__box svg { width: 100%; height: 100%; visibility: hidden; }
.ui-checkbox input:hover + .ui-checkbox__box, .ui-checkbox input:focus-visible + .ui-checkbox__box { border-color: var(--ui-checkbox-checked); }
.ui-checkbox input:checked + .ui-checkbox__box { background: var(--ui-checkbox-checked); border-color: var(--ui-checkbox-checked); }
.ui-checkbox input:checked + .ui-checkbox__box svg { visibility: visible; }
.ui-checkbox input:checked:hover + .ui-checkbox__box, .ui-checkbox input:checked:focus-visible + .ui-checkbox__box { background: var(--ui-checkbox-hover); border-color: var(--ui-checkbox-hover); }
.ui-checkbox input:active + .ui-checkbox__box { border-color: var(--ui-checkbox-active); }
.ui-checkbox input:checked:active + .ui-checkbox__box { background: var(--ui-checkbox-active); }
.ui-checkbox.is-disabled { color: var(--ui-checkbox-disabled); cursor: not-allowed; }
.ui-checkbox input:disabled + .ui-checkbox__box { background: var(--color-surface-disabled); border-color: var(--ui-checkbox-disabled); }
.ui-checkbox input:checked:disabled + .ui-checkbox__box { background: var(--ui-checkbox-disabled); color: var(--color-surface-disabled); }
</style>
