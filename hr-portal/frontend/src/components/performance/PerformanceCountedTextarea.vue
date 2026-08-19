<template>
  <div class="performance-counted-textarea">
    <div class="performance-counted-textarea__label">
      <label :for="inputId">{{ label }}</label><span v-if="required" class="required-mark">*</span>
    </div>
    <div class="performance-counted-textarea__control">
      <textarea :id="inputId" class="performance-counted-textarea__input" :value="modelValue" :disabled="disabled" @input="handleInput" />
      <span class="performance-counted-textarea__suffix" aria-hidden="true"><span class="performance-counted-textarea__count">{{ modelValue.length }}/{{ maxLength }}</span></span>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{ modelValue: string; label: string; maxLength: number; inputId: string; required?: boolean; disabled?: boolean }>(), { required: false, disabled: false })
const emit = defineEmits<{ (event: 'update:modelValue', value: string): void }>()
function handleInput(event: Event) {
  const textarea = event.target as HTMLTextAreaElement
  const value = textarea.value.slice(0, props.maxLength)
  if (value !== textarea.value) textarea.value = value
  emit('update:modelValue', value)
}
</script>

<style scoped>
.performance-counted-textarea{width:552px;max-width:100%;margin:0 0 20px;box-sizing:border-box;color:#1f2329;font:400 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif}.performance-counted-textarea__label{display:flex;align-items:baseline;height:23px;margin-bottom:8px;font-weight:600}.required-mark{margin-left:2px;color:#f54a45;font-family:SimSun,sans-serif;font-weight:400}.performance-counted-textarea__control{position:relative;width:100%;min-width:0}.performance-counted-textarea__input{display:block;width:100%;height:49.3333px;min-width:0;min-height:49.3333px;max-width:100%;max-height:2.23696e7px;padding:4px 11px 22px;box-sizing:border-box;overflow:auto;resize:vertical;border:.666667px solid #d0d3d6;border-radius:6px;outline:none;background:#fff;color:#1f2329;font:400 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;white-space:pre-wrap}.performance-counted-textarea__input:focus{border-color:#1456f0}.performance-counted-textarea__input:disabled{cursor:not-allowed;background:#f5f6f7;color:#8f959e;resize:none}.performance-counted-textarea__suffix{position:absolute;right:9px;bottom:9px;display:block;height:16px;line-height:0;pointer-events:none}.performance-counted-textarea__count{display:inline-flex;align-items:center;height:16px;max-width:100%;padding:0 4px;box-sizing:border-box;overflow:hidden;border-radius:4px;background:#eff0f1;color:#646a73;font-size:10px;font-weight:400;line-height:16px;white-space:nowrap}
</style>
