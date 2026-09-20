<template>
  <div class="performance-checkbox" :class="{ 'performance-checkbox--disabled': disabled }" :style="{ '--performance-checkbox-checked-color': checkedColor }">
    <label class="performance-checkbox__control">
      <span class="ud__checkbox">
        <input class="ud__checkbox__input" type="checkbox" :checked="modelValue" :disabled="disabled" :aria-label="label" @change="$emit('update:modelValue', ($event.target as HTMLInputElement).checked)" />
        <span class="ud__checkbox__wallpaper" :class="{ 'ud__checkbox__wallpaper--checked': modelValue }" aria-hidden="true">
          <svg v-if="modelValue" width="12" height="12" viewBox="0 0 12 12" fill="none" class="ud__checkbox__checked-svg" data-icon="CheckboxChecked"><path d="M9.589 2.903l.808.809a.35.35 0 010 .495L5.18 9.425a.35.35 0 01-.495 0l-2.981-2.98a.35.35 0 010-.496l.808-.808a.35.35 0 01.495 0l1.925 1.925 4.163-4.163a.35.35 0 01.495 0z" fill="currentColor" /></svg>
        </span>
      </span>
    </label>
    <span class="performance-checkbox__label">{{ label }}</span>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ modelValue: boolean; label: string; disabled?: boolean; checkedColor?: string }>(), { disabled: false, checkedColor: '#0442d2' })
defineEmits<{ (event: 'update:modelValue', value: boolean): void }>()
</script>

<style scoped>
.performance-checkbox{display:flex;align-items:center;width:100%;height:22px;margin:0;box-sizing:border-box;color:var(--color-text-primary);font:400 var(--font-size-md)/22px var(--font-sans)}.performance-checkbox__control{display:inline-flex;position:relative;align-items:baseline;flex:0 0 var(--performance-checkbox-size);width:var(--performance-checkbox-size);height:22px;margin:0;padding:0;box-sizing:border-box;cursor:pointer}.ud__checkbox{position:relative;display:block;width:var(--performance-checkbox-size);height:22px;box-sizing:border-box}.ud__checkbox__input{position:absolute;top:50%;left:0;z-index:1;width:var(--performance-checkbox-size);height:var(--performance-checkbox-size);margin:0;opacity:0;transform:translateY(-50%);cursor:pointer}.ud__checkbox__wallpaper{position:absolute;top:50%;left:0;display:block;width:var(--performance-checkbox-size);height:var(--performance-checkbox-size);box-sizing:border-box;border:.666667px solid var(--color-text-placeholder);border-radius:var(--radius-sm);background:var(--color-bg-card);color:var(--color-bg-card);transform:translateY(-50%);transition:var(--duration-base) cubic-bezier(.34,.69,.1,1)}.ud__checkbox__wallpaper--checked{border-color:transparent;background:var(--performance-checkbox-checked-color, var(--performance-checkbox-checked))}.ud__checkbox__checked-svg{position:absolute;top:50%;left:50%;display:block;width:12px;height:12px;overflow:hidden;color:var(--color-bg-card);transform:translate(-50%,-50%);transition:var(--duration-base) cubic-bezier(.34,.69,.1,1)}.performance-checkbox__label{display:block;flex:0 0 auto;height:22px;margin-left:var(--performance-field-label-gap);color:inherit;font:inherit;line-height:22px}.performance-checkbox--disabled{color:var(--color-border)}.performance-checkbox--disabled .performance-checkbox__control,.performance-checkbox--disabled .ud__checkbox__input{cursor:not-allowed}.performance-checkbox--disabled .ud__checkbox__wallpaper{border-color:var(--performance-checkbox-disabled);background:var(--color-surface-disabled)}.performance-checkbox--disabled .ud__checkbox__wallpaper--checked{background:var(--performance-checkbox-disabled)}
</style>
