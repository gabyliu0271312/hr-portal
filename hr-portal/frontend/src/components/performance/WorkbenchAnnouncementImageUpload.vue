<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { performanceWorkbenchSettingsApi } from '@/api/performance'
import UiButton from '../ui/UiButton.vue'

const props = withDefaults(defineProps<{ modelValue: number | null; label?: string; disabled?: boolean }>(), { label: '中文配图', disabled: false })
const emit = defineEmits<{ 'update:modelValue': [value: number | null]; state: [value: { busy: boolean; invalid: boolean }] }>()
const input = ref<HTMLInputElement>()
const preview = ref('')
const error = ref('')
const busy = ref(false)
const dragging = ref(false)
const failedFile = ref<File | null>(null)
let request = 0
let disposed = false
function state() { emit('state', { busy: busy.value, invalid: Boolean(failedFile.value) }) }
function release() { if (preview.value) URL.revokeObjectURL(preview.value); preview.value = '' }
async function load(id: number) {
  const current = ++request
  busy.value = true
  error.value = ''
  release()
  try {
    const blob = await performanceWorkbenchSettingsApi.announcementImage(id)
    if (disposed || current !== request) return
    preview.value = URL.createObjectURL(blob)
  } catch {
    if (current === request && !disposed) error.value = '图片加载失败，请重试或替换'
  } finally {
    if (current === request && !disposed) { busy.value = false; state() }
  }
}
watch(() => props.modelValue, id => {
  ++request
  failedFile.value = null
  busy.value = false
  error.value = ''
  release()
  state()
  if (id != null) void load(id)
}, { immediate: true })
function reject(message: string) { error.value = message; state() }
async function upload(file: File) {
  if (props.disabled) return
  if (!/\.(jpe?g|png)$/i.test(file.name) || !['image/jpeg', 'image/png'].includes(file.type)) { reject('仅支持 JPG、JPEG、PNG 图片'); return }
  if (file.size > 10 * 1024 * 1024) { reject('图片不能超过 10 MiB'); return }
  const current = ++request
  failedFile.value = file
  busy.value = true
  error.value = ''
  state()
  try {
    const result = await performanceWorkbenchSettingsApi.uploadAnnouncementImage(file)
    if (disposed || current !== request) return
    failedFile.value = null
    busy.value = false
    state()
    emit('update:modelValue', result.id)
  } catch {
    if (current === request && !disposed) error.value = '图片上传失败，请重试或替换'
  } finally {
    if (current === request && !disposed) { busy.value = false; state() }
  }
}
function choose(files: FileList | File[] | null) {
  if (props.disabled || !files?.length) return
  if (files.length !== 1) { reject('每种语言仅支持一张图片'); return }
  void upload(files[0])
}
function onInput(event: Event) { const target = event.target as HTMLInputElement; choose(target.files); target.value = '' }
function onDrop(event: DragEvent) { dragging.value = false; choose(event.dataTransfer?.files || null) }
function remove() {
  if (props.disabled) return
  ++request
  failedFile.value = null
  busy.value = false
  error.value = ''
  release()
  state()
  emit('update:modelValue', null)
}
function retry() { if (failedFile.value) void upload(failedFile.value); else if (props.modelValue != null) void load(props.modelValue) }
function imageFailed() { release(); error.value = '图片预览失败，请重试或替换' }
onBeforeUnmount(() => { disposed = true; ++request; release() })
</script>

<template>
  <div class="announcement-upload" :class="{ 'is-empty': !modelValue && !failedFile && !busy, 'is-dragging': dragging && !disabled, 'is-disabled': disabled, 'is-error': error }" :aria-label="label" :aria-busy="busy" @dragenter.prevent="dragging = true" @dragover.prevent @dragleave.prevent="dragging = false" @drop.prevent="onDrop">
    <input ref="input" class="announcement-upload__input" type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" :aria-label="`${label}选择文件`" :disabled="disabled" @change="onInput" />
    <span class="announcement-upload__language">{{ label === '英文配图' ? '英文' : '中文' }}</span>
    <div v-if="busy" class="announcement-upload__status" role="status">{{ failedFile ? '正在上传…' : '正在加载…' }}</div>
    <img v-if="preview" :src="preview" :alt="`${label}预览`" @error="imageFailed" />
    <div v-else-if="modelValue || failedFile || busy" class="announcement-upload__empty">图片预览</div>
    <div v-else class="announcement-upload__empty">拖拽文件至此或<UiButton variant="link" :disabled="disabled" :aria-label="`${label}上传`" @click="input?.click()">选择文件上传</UiButton></div>
    <p>JPG / JPEG / PNG，每张不超过 10 MiB</p>
    <div v-if="modelValue || failedFile || busy" class="announcement-upload__actions">
      <UiButton size="small" :disabled="disabled" :aria-label="`${label}替换`" @click="input?.click()">替换图片</UiButton>
      <UiButton v-if="error && (failedFile || modelValue)" size="small" :disabled="disabled || busy" @click="retry">重试</UiButton>
      <UiButton size="small" variant="text" :disabled="disabled" :aria-label="`${label}移除`" @click="remove">移除</UiButton>
    </div>
    <p v-if="error" class="announcement-upload__error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.announcement-upload { position: relative; width: 100%; box-sizing: border-box; min-width: 0; padding: var(--spacing-3); border: 1px dashed var(--performance-field-border); border-radius: var(--radius-lg); background: var(--color-bg-card); }
.announcement-upload.is-empty { padding: var(--performance-announcement-upload-empty-padding); }
.announcement-upload:hover:not(.is-disabled), .announcement-upload:focus-within, .announcement-upload.is-dragging { border-color: var(--color-primary); }
.announcement-upload:focus-within { box-shadow: var(--performance-control-focus-ring); }
.announcement-upload.is-dragging { background: var(--color-bg-hover); }
.announcement-upload.is-error { border-color: var(--performance-field-border-invalid); }
.announcement-upload.is-disabled { background: var(--performance-field-disabled-background); color: var(--performance-field-disabled-text); }
.announcement-upload__input { display: none; }
.announcement-upload__language { position: absolute; top: 8px; right: 8px; padding: 0 6px; border-radius: var(--radius-sm); background: var(--performance-workbench-editor-language-tag-bg); color: var(--performance-workbench-editor-language-tag-color); font-size: var(--font-size-xs); line-height: 20px; }
.announcement-upload__status { color: var(--color-text-secondary); font-size: var(--font-size-sm); }
.announcement-upload img { display: block; width: 100%; max-height: var(--performance-announcement-upload-preview-height); margin-top: var(--spacing-2); object-fit: contain; }
.announcement-upload__empty { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; color: var(--color-text-secondary); line-height: 22px; }
.announcement-upload p { margin: var(--spacing-2) 0 0; color: var(--color-text-secondary); font-size: var(--font-size-sm); text-align: center; }
.announcement-upload__actions { display: flex; flex-wrap: wrap; gap: var(--spacing-2); margin-top: var(--spacing-2); }
.announcement-upload p.announcement-upload__error { color: var(--color-text-danger-strong); }
</style>
