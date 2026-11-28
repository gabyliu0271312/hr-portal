<template>
  <div class="performance-counted-textarea">
    <div class="performance-counted-textarea__label" :class="{ 'is-hidden': hideLabel }">
      <label :for="inputId">{{ label }}</label><span v-if="required" class="required-mark">*</span>
    </div>
    <div class="performance-counted-textarea__control">
      <textarea :id="inputId" class="performance-counted-textarea__input" :style="height ? { height, minHeight: height } : undefined" :value="modelValue" :disabled="disabled" @input="handleInput" />
      <span class="performance-counted-textarea__suffix" :class="{ 'has-language': language }" aria-hidden="true"><span v-if="language" class="performance-counted-textarea__language">{{ language }}</span><span v-if="!language || showLanguageAndCount" class="performance-counted-textarea__count">{{ Array.from(modelValue).length }}/{{ maxLength }}</span></span>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{ modelValue: string; label: string; maxLength: number; inputId: string; required?: boolean; disabled?: boolean; hideLabel?: boolean; language?: string; height?: string; showLanguageAndCount?: boolean }>(), { required: false, disabled: false, hideLabel: false, language: '', height: '', showLanguageAndCount: false })
const emit = defineEmits<{ (event: 'update:modelValue', value: string): void }>()
function handleInput(event: Event) {
  const textarea = event.target as HTMLTextAreaElement
  const value = Array.from(textarea.value).slice(0, props.maxLength).join('')
  if (value !== textarea.value) textarea.value = value
  emit('update:modelValue', value)
}
</script>

<style scoped>
.performance-counted-textarea{width:calc(var(--performance-dialog-wide-width) - 2 * var(--performance-dialog-padding));max-width:100%;margin:0 0 var(--spacing-5);box-sizing:border-box;color:var(--color-text-primary);font:var(--font-weight-normal) var(--font-size-md)/var(--performance-input-line-height) var(--font-sans)}.performance-counted-textarea__label{display:flex;align-items:baseline;margin-bottom:var(--spacing-2);font-weight:600}.required-mark{margin-left:var(--performance-required-mark-gap);color:var(--color-text-danger-strong);font-family:SimSun,sans-serif;font-weight:400}.performance-counted-textarea__control{position:relative;width:100%;min-width:0}.performance-counted-textarea__input{display:block;width:100%;height:var(--performance-textarea-min-height);min-width:0;min-height:var(--performance-textarea-min-height);max-width:100%;padding:var(--performance-input-padding-y) var(--performance-input-padding-x) var(--performance-input-textarea-padding-bottom);box-sizing:border-box;overflow:auto;resize:vertical;border:var(--ui-control-border-width) solid var(--performance-control-border);border-radius:var(--performance-control-radius);outline:none;background:var(--color-surface-card);color:var(--color-text-primary);font:var(--font-weight-normal) var(--font-size-md)/var(--performance-input-line-height) var(--font-sans);white-space:pre-wrap}.performance-counted-textarea__input:focus{border-color:var(--performance-field-border-focus)}.performance-counted-textarea__input:disabled{cursor:not-allowed;background:var(--performance-field-disabled-background);color:var(--performance-field-disabled-text);resize:none}.performance-counted-textarea__suffix{position:absolute;right:var(--spacing-2);bottom:var(--spacing-2);display:block;height:var(--performance-count-badge-height);line-height:0;pointer-events:none}.performance-counted-textarea__count{display:inline-flex;align-items:center;height:var(--performance-count-badge-height);max-width:100%;padding:0 var(--spacing-1);box-sizing:border-box;overflow:hidden;border-radius:var(--radius-sm);background:var(--performance-count-badge-bg);color:var(--performance-count-badge-text);font-size:var(--performance-count-badge-font-size);font-weight:400;line-height:var(--performance-count-badge-height);white-space:nowrap}
.performance-counted-textarea__label.is-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.performance-counted-textarea__suffix.has-language { height: var(--performance-language-tag-height); right: var(--spacing-2); }
.performance-counted-textarea__language { display: inline-flex; padding: 0 var(--performance-language-tag-padding-inline); border-radius: var(--radius-sm); background: var(--color-surface-disabled); color: var(--performance-settings-text-secondary); font-size: var(--font-size-xs); line-height: var(--performance-language-tag-height); }
</style>
