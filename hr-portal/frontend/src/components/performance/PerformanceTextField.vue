<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: string
  type?: 'input' | 'textarea'
  width?: string
  maxlength?: number
  inputId?: string
  placeholder?: string
  showCount?: boolean
  disabled?: boolean
  invalid?: boolean
  variant?: 'default' | 'feishu-input' | 'fixed-score'
}>(), {
  type: 'input',
  width: '100%',
  maxlength: undefined,
  inputId: undefined,
  placeholder: '',
  showCount: false,
  disabled: false,
  invalid: false,
  variant: 'default',
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const textareaRef = ref<HTMLTextAreaElement | null>(null)

function resizeTextarea(textarea = textareaRef.value) {
  if (!textarea) return
  textarea.style.height = 'auto'
  textarea.style.height = `${textarea.scrollHeight}px`
}

function updateTextarea(event: Event) {
  const textarea = event.target as HTMLTextAreaElement
  emit('update:modelValue', textarea.value)
  resizeTextarea(textarea)
}

onMounted(() => { void nextTick(() => resizeTextarea()) })
watch(() => props.modelValue, () => { void nextTick(() => resizeTextarea()) })
</script>

<template>
  <div class="performance-text-field" :class="{ 'is-textarea': type === 'textarea', 'is-feishu-input': variant === 'feishu-input', 'is-fixed-score': variant === 'fixed-score' }" :style="{ width }">
    <label v-if="type === 'input' && variant === 'feishu-input'" class="feishu-input-wrap">
      <div class="feishu-input-placeholder-wrapper">
        <div v-if="!modelValue && placeholder" class="feishu-input-placeholder">{{ placeholder }}</div>
        <input class="native-input" :class="{ error: invalid }" :id="inputId" :value="modelValue" :maxlength="maxlength" :disabled="disabled" :aria-invalid="invalid || undefined" @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)" />
      </div>
      <span class="feishu-input-suffix" aria-hidden="true"></span>
    </label>
    <input
      v-else-if="type === 'input'"
      class="native-input"
      :class="{ error: invalid }"
      :id="inputId"
      :value="modelValue"
      :maxlength="maxlength"
      :placeholder="placeholder"
      :disabled="disabled"
      :aria-invalid="invalid || undefined"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <textarea
      v-else
      class="native-textarea"
      :class="{ error: invalid }"
      :id="inputId"
      :value="modelValue"
      :maxlength="maxlength"
      :placeholder="placeholder"
      :disabled="disabled"
      :aria-invalid="invalid || undefined"
      ref="textareaRef"
      @input="updateTextarea"
    />
    <span v-if="type === 'textarea' && showCount && maxlength" class="count">{{ modelValue.length }}/{{ maxlength }}</span>
  </div>
</template>

<style scoped>
.performance-text-field { position: relative; max-width: 100%; min-width: 0; }
.native-input, .native-textarea { display: block; width: 100%; box-sizing: border-box; border: 1px solid var(--performance-control-border); border-radius: var(--performance-control-radius); outline: none; color: var(--color-text-primary); font: 400 var(--font-size-md)/var(--performance-input-line-height) inherit; }
.native-input { height: var(--performance-input-height); padding: var(--performance-input-padding-y) var(--performance-input-padding-x); }
.feishu-input-wrap { display: flex; width: 100%; height: var(--performance-input-compact-height); padding: var(--performance-input-padding-y) 8px var(--performance-input-padding-y) var(--performance-input-padding-x); box-sizing: border-box; border: 1px solid var(--performance-control-border); border-radius: var(--performance-control-radius); color: var(--color-text-primary); font: 400 var(--font-size-md)/var(--performance-input-line-height) inherit; cursor: text; }
.feishu-input-placeholder-wrapper { position: relative; display: flex; flex: 1 1 auto; align-items: center; min-width: 0; box-sizing: border-box; }
.feishu-input-placeholder { position: absolute; inset: 0 auto 0 0; width: 70px; height: var(--performance-input-line-height); overflow: hidden; box-sizing: border-box; color: var(--color-text-primary); font: 400 var(--font-size-md)/var(--performance-input-line-height) inherit; white-space: nowrap; pointer-events: none; }
.feishu-input-wrap .native-input { position: relative; width: 730.333px; min-width: 20px; height: var(--performance-input-line-height); margin: 0; padding: 0; border: 0; background: transparent; font: 400 var(--font-size-md)/var(--performance-input-line-height) inherit; }
.feishu-input-suffix { display: flex; align-items: center; margin-left: var(--performance-field-label-gap); }
.feishu-input-wrap:focus-within { border-color: var(--performance-control-focus-border); }
.native-textarea { height: var(--performance-textarea-min-height); min-height: var(--performance-textarea-min-height); padding: var(--performance-input-padding-y) var(--performance-input-padding-x) var(--performance-input-textarea-padding-bottom); resize: none; overflow-y: hidden; }
.native-input:focus, .native-textarea:focus { border-color: var(--performance-control-focus-border); }
.native-input.error, .native-textarea.error { border-color: var(--color-text-danger-strong); }
.native-input:disabled, .native-textarea:disabled { background: var(--color-surface-page); color: var(--color-text-placeholder); cursor: not-allowed; }
.count { position: absolute; right: 8px; bottom: 8px; display: inline-flex; align-items: center; box-sizing: border-box; height: var(--performance-count-badge-height); padding: 0 4px; border-radius: var(--radius-sm); overflow: hidden; background: var(--performance-count-badge-bg); color: var(--performance-count-badge-text); font-size: 10px; font-weight: 400; line-height: 0; pointer-events: none; }
</style>

