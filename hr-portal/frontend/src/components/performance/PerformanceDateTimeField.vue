<template>
  <div class="performance-date-time-field">
    <input
      ref="input"
      :id="inputId"
      class="performance-date-time-field__input"
      type="datetime-local"
      :value="modelValue"
      :placeholder="placeholder"
      :required="required"
      :disabled="disabled"
      :aria-label="ariaLabel || undefined"
      :aria-invalid="invalid || undefined"
      :aria-describedby="describedBy || undefined"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <button class="performance-date-time-field__trigger" type="button" :disabled="disabled" :aria-label="ariaLabel || '打开日期时间选择器'" @click="openPicker">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 2a1 1 0 0 1 1 1h8a1 1 0 1 1 2 0h2a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2a1 1 0 0 1 1 1Zm9 3H8a1 1 0 1 1-2 0H4v15h16V5h-2a1 1 0 0 1-2 0ZM7 9h10v2H7V9Zm0 4h7v2H7v-2Z" fill="currentColor" /></svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

withDefaults(defineProps<{
  modelValue: string
  inputId?: string
  placeholder?: string
  required?: boolean
  disabled?: boolean
  ariaLabel?: string
  invalid?: boolean
  describedBy?: string
}>(), { inputId: undefined, placeholder: 'YYYY-MM-DD HH:MM', required: false, disabled: false, ariaLabel: '', invalid: false, describedBy: '' })
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const input = ref<HTMLInputElement | null>(null)
function openPicker() {
  if (!input.value) return
  const picker = input.value as HTMLInputElement & { showPicker?: () => void }
  if (picker.showPicker) picker.showPicker()
  else input.value.focus()
}
</script>

<style scoped>
.performance-date-time-field{position:relative;display:block;width:100%}.performance-date-time-field__input{display:block;width:100%;height:32px;padding:4px 38px 4px 10px;box-sizing:border-box;border:1px solid #d0d3d6;border-radius:6px;background:#fff;color:#1f2329;font:inherit;line-height:22px}.performance-date-time-field__input::placeholder{color:#8f959e}.performance-date-time-field__input:focus{border-color:#3370ff;outline:2px solid rgba(51,112,255,.2)}.performance-date-time-field__input::-webkit-calendar-picker-indicator{opacity:0;width:1px}.performance-date-time-field__trigger{position:absolute;top:0;right:0;display:grid;place-items:center;width:32px;height:32px;padding:0;border:0;border-radius:0 6px 6px 0;background:transparent;color:#646a73;cursor:pointer}.performance-date-time-field__trigger:hover,.performance-date-time-field__trigger:focus-visible{color:#3370ff;outline:0}.performance-date-time-field__trigger:disabled{cursor:not-allowed;opacity:.5}
</style>
