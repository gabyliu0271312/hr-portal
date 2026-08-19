<template>
  <div class="performance-checkbox" :class="{ 'performance-checkbox--disabled': disabled }">
    <label class="performance-checkbox__control">
      <span class="ud__checkbox">
        <input class="ud__checkbox__input" type="checkbox" :checked="modelValue" :disabled="disabled" :aria-label="label" @change="$emit('update:modelValue', ($event.target as HTMLInputElement).checked)" />
        <span class="ud__checkbox__wallpaper" :class="{ 'ud__checkbox__wallpaper--checked': modelValue }" aria-hidden="true">
          <svg v-if="modelValue" width="12" height="12" viewBox="0 0 12 12" fill="none" class="ud__checkbox__checked-svg"><path d="M9.589 2.903l.808.809a.35.35 0 010 .495L5.18 9.425a.35.35 0 01-.495 0l-2.981-2.98a.35.35 0 010-.496l.808-.808a.35.35 0 01.495 0l1.925 1.925 4.163-4.163a.35.35 0 01.495 0z" fill="currentColor" /></svg>
        </span>
      </span>
    </label>
    <span class="performance-checkbox__label">{{ label }}</span>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ modelValue: boolean; label: string; disabled?: boolean }>(), { disabled: false })
defineEmits<{ (event: 'update:modelValue', value: boolean): void }>()
</script>

<style scoped>
.performance-checkbox{display:flex;align-items:center;width:100%;height:22px;margin:0;box-sizing:border-box;color:#1f2329;font:400 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif}.performance-checkbox__control{display:inline-flex;position:relative;align-items:baseline;flex:0 0 16px;width:16px;height:22px;margin:0;padding:0;box-sizing:border-box;cursor:pointer}.ud__checkbox{position:relative;display:block;width:16px;height:22px;box-sizing:border-box}.ud__checkbox__input{position:absolute;top:50%;left:0;z-index:1;width:16px;height:16px;margin:0;opacity:0;transform:translateY(-50%);cursor:pointer}.ud__checkbox__wallpaper{position:absolute;top:50%;left:0;display:block;width:16px;height:16px;box-sizing:border-box;border:.666667px solid #8f959e;border-radius:4px;background:#fff;color:#fff;transform:translateY(-50%);transition:.2s cubic-bezier(.34,.69,.1,1)}.ud__checkbox__wallpaper--checked{border-color:transparent;background:#0442d2}.ud__checkbox__checked-svg{position:absolute;top:50%;left:50%;display:block;width:12px;height:12px;overflow:hidden;color:#fff;transform:translate(-50%,-50%);transition:.2s cubic-bezier(.34,.69,.1,1)}.performance-checkbox__label{display:block;flex:0 0 auto;height:22px;margin-left:8px;color:inherit;font:inherit;line-height:22px}.performance-checkbox--disabled{color:#bbbfc4}.performance-checkbox--disabled .performance-checkbox__control,.performance-checkbox--disabled .ud__checkbox__input{cursor:not-allowed}.performance-checkbox--disabled .ud__checkbox__wallpaper{border-color:#bbbfc4;background:#eff0f1}.performance-checkbox--disabled .ud__checkbox__wallpaper--checked{background:#bbbfc4}
</style>
