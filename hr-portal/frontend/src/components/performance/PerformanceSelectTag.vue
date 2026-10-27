<template>
  <span :class="measuring ? 'performance-select-measure-tag' : 'performance-select-shell__tag'" @click.stop>
    <span :class="measuring ? 'performance-select-measure-content' : 'performance-select-shell__tag-content'">{{ label }}</span>
    <span v-if="closable && measuring" class="performance-select-measure-close" />
    <button v-else-if="closable" class="performance-select-shell__tag-close" type="button" :disabled="disabled" :aria-label="`移除${label}`" @click.stop="$emit('remove')">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="3" stroke-linecap="round" /></svg>
    </button>
  </span>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ label: string; closable?: boolean; disabled?: boolean; measuring?: boolean }>(), { closable: true, disabled: false, measuring: false })
defineEmits<{ remove: [] }>()
</script>

<style scoped>
.performance-select-shell__tag, .performance-select-measure-tag { display: inline-flex; overflow: hidden; min-width: 0; max-width: 100%; height: var(--performance-select-tag-height); flex: 0 0 auto; align-items: center; margin: 2px var(--performance-select-tag-gap) 2px 0; padding: 0 var(--performance-select-tag-padding-x); border-radius: var(--performance-select-tag-radius); background: var(--performance-select-tag-background); color: var(--performance-select-tag-text); font: 400 var(--font-size-md)/22px var(--font-sans); white-space: nowrap; }
.performance-select-shell__tag-content, .performance-select-measure-content { overflow: hidden; max-width: var(--performance-select-tag-content-max-width); text-overflow: ellipsis; white-space: nowrap; }
.performance-select-shell__tag-close, .performance-select-measure-close { display: inline-flex; align-items: center; justify-content: center; width: var(--performance-select-tag-close-size); height: var(--performance-select-tag-close-size); flex: 0 0 var(--performance-select-tag-close-size); margin-left: var(--spacing-1); padding: 0; border: 0; background: transparent; color: var(--performance-select-icon-color); cursor: pointer; }
.performance-select-shell__tag-close svg { width: 100%; height: 100%; }
.performance-select-shell__tag-close:disabled { cursor: not-allowed; }
</style>
