<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { PerformanceReviewer360Tag } from '@/api/performance'
import PerformanceButton from './PerformanceButton.vue'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformanceSortableList from './PerformanceSortableList.vue'
import PerformanceTextButton from './PerformanceTextButton.vue'
import PerformanceReviewer360TagRow from './PerformanceReviewer360TagRow.vue'

const props = withDefaults(defineProps<{
  modelValue: boolean
  tags: PerformanceReviewer360Tag[]
  version: number
  saving?: boolean
  saveError?: string
}>(), { saving: false, saveError: '' })
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: [value: { tags: PerformanceReviewer360Tag[]; version: number }]
}>()

const draftTags = ref<PerformanceReviewer360Tag[]>([])
const multilingual = ref(false)
const errors = ref<Record<string, Partial<Record<Exclude<keyof PerformanceReviewer360Tag, 'id'>, string>>>>({})
const form = ref<HTMLFormElement | null>(null)
const submitting = ref(false)
const locked = computed(() => props.saving || submitting.value)
let draftVersion = 0
let returnFocus: HTMLElement | null = null

function cloneTags(tags: PerformanceReviewer360Tag[]) {
  return tags.map(tag => ({ ...tag }))
}
function createTag(): PerformanceReviewer360Tag {
  return { id: crypto.randomUUID(), name_zh: '', name_en: '', description_zh: '', description_en: '' }
}
function focusInput(id: string) {
  void nextTick(() => document.getElementById(id)?.focus())
}
function addTag() {
  if (locked.value || draftTags.value.length >= 50) return
  const tag = createTag()
  draftTags.value.push(tag)
  focusInput(`reviewer-tag-${tag.id}-name_zh`)
}
function removeTag(id: string) {
  if (locked.value) return
  draftTags.value = draftTags.value.filter(tag => tag.id !== id)
  delete errors.value[id]
}
function reorder(from: number, to: number) {
  if (locked.value || from === to) return
  const next = draftTags.value.slice()
  const [moved] = next.splice(from, 1)
  if (moved) next.splice(to, 0, moved)
  draftTags.value = next
}
function codePoints(value: string) { return [...value].length }
function validation() {
  const nextErrors: typeof errors.value = {}
  const names = { name_zh: new Set<string>(), name_en: new Set<string>() }
  draftTags.value.forEach((tag, index) => {
    const fieldErrors: Partial<Record<Exclude<keyof PerformanceReviewer360Tag, 'id'>, string>> = {}
    const nameZh = tag.name_zh.trim()
    const nameEn = tag.name_en.trim()
    if (!nameZh) fieldErrors.name_zh = '请输入中文名称'
    if (codePoints(nameZh) > 100) fieldErrors.name_zh = '中文名称不能超过100个字符'
    if (nameZh) {
      const key = nameZh.toLowerCase()
      if (names.name_zh.has(key)) fieldErrors.name_zh = '中文名称不能重复'
      names.name_zh.add(key)
    }
    if (codePoints(nameEn) > 100) fieldErrors.name_en = '英文名称不能超过100个字符'
    if (nameEn) {
      const key = nameEn.toLowerCase()
      if (names.name_en.has(key)) fieldErrors.name_en = '英文名称不能重复'
      names.name_en.add(key)
    }
    if (codePoints(tag.description_zh) > 500) fieldErrors.description_zh = '中文描述不能超过500个字符'
    if (codePoints(tag.description_en) > 500) fieldErrors.description_en = '英文描述不能超过500个字符'
    if (Object.keys(fieldErrors).length) nextErrors[tag.id] = fieldErrors
    if (index >= 50) nextErrors[tag.id] = { ...nextErrors[tag.id], name_zh: '最多添加50个标签' }
  })
  errors.value = nextErrors
  return Object.keys(nextErrors).length === 0
}
function confirm() {
  if (locked.value) return
  if (!validation()) {
    const first = draftTags.value.find(tag => errors.value[tag.id])
    const field = first && Object.keys(errors.value[first.id])[0]
    if (field?.endsWith('_en')) multilingual.value = true
    if (first && field) focusInput(`reviewer-tag-${first.id}-${field}`)
    return
  }
  submitting.value = true
  emit('confirm', { tags: draftTags.value.map(tag => ({ ...tag, name_zh: tag.name_zh.trim(), name_en: tag.name_en.trim() })), version: draftVersion })
  void nextTick(() => { submitting.value = false })
}
function close() {
  if (!locked.value) emit('update:modelValue', false)
}
function handleUpdate(value: boolean) {
  if (value || locked.value) return
  close()
}
function trapFocus(event: KeyboardEvent) {
  if (event.key !== 'Tab') return
  const controls = Array.from(form.value?.closest('[role="dialog"]')?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [data-drag-handle]:not([aria-disabled="true"])') || [])
  if (!controls.length) { event.preventDefault(); return }
  const first = controls[0]
  const last = controls[controls.length - 1]
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}
watch(() => props.modelValue, async open => {
  if (open) {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    draftTags.value = cloneTags(props.tags)
    draftVersion = props.version
    errors.value = {}
    multilingual.value = false
    await nextTick()
    if (draftTags.value[0]) focusInput(`reviewer-tag-${draftTags.value[0].id}-name_zh`)
    else form.value?.querySelector<HTMLButtonElement>('[aria-label="添加标签"]')?.focus()
    document.addEventListener('keydown', trapFocus)
  } else {
    document.removeEventListener('keydown', trapFocus)
    returnFocus?.focus()
  }
}, { immediate: true })
onBeforeUnmount(() => document.removeEventListener('keydown', trapFocus))
</script>

<template>
  <PerformanceDialogShell
    :model-value="modelValue"
    title="编辑 360° 评估人标签"
    title-id="reviewer-360-tags-title"
    width="var(--performance-dialog-wide-width)"
    dialog-class="reviewer-tags-dialog performance-dialog--auto-header"
    :loading="locked"
    @update:model-value="handleUpdate"
  >
    <template #description>在360评估结果页，标签顺序将与当前的顺序保持一致。描述将展示给标记标签的被评估人及其leader、HRBP。标签名称和描述支持修改，修改后，已引用标签的地方将同步展示最新名称和描述。</template>
    <form ref="form" class="reviewer-tags-form" @submit.prevent="confirm" @keydown.esc.stop="!$event.defaultPrevented && close()">
      <div class="reviewer-tags-heading">标签</div>
      <PerformanceSortableList :items="draftTags" item-key="id" :gap="8" :disabled="locked" @reorder="reorder">
        <template #default="{ item, index, dragging, itemStyle }">
          <PerformanceReviewer360TagRow
            :tag="item"
            :index="index"
            :multiple="draftTags.length >= 2"
            :multilingual="multilingual"
            :dragging="dragging"
            :disabled="locked"
            :errors="errors[item.id]"
            :style="itemStyle"
            @update="!locked && (draftTags[index] = $event)"
            @remove="removeTag"
          />
        </template>
      </PerformanceSortableList>
      <PerformanceTextButton class="reviewer-tags-add" label="添加标签" aria-label="添加标签" :disabled="locked || draftTags.length >= 50" @click="addTag">
        <template #icon><svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2a1 1 0 0 0-1 1v8H3a1 1 0 1 0 0 2h8v8a1 1 0 0 0 2 0v-8h8a1 1 0 0 0 0-2h-8V3a1 1 0 0 0-1-1Z" fill="currentColor" /></svg></template>
      </PerformanceTextButton>
      <p v-if="saveError" class="reviewer-tags-error" role="alert">{{ saveError }}</p>
    </form>
    <template #footer>
      <div class="reviewer-tags-footer">
        <PerformanceButton variant="text" :disabled="locked" :aria-label="multilingual ? '收起多语言设置' : '展开多语言设置'" :aria-expanded="multilingual" @click="multilingual = !multilingual">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" data-icon="LanguageOutlined" aria-hidden="true"><path d="M12 1c6.075 0 11 4.925 11 11s-4.925 11-11 11S1 18.075 1 12 5.925 1 12 1ZM8.66 3.64A9.009 9.009 0 0 0 3.054 11h3.964c.015-3.2.981-6 1.64-7.36ZM20.944 11a9.009 9.009 0 0 0-5.604-7.36C16 5 16.966 8.2 16.98 11h3.964ZM12 3c-1.5 0-3 4.5-2.98 8h5.96C15 7.5 13.5 3 12 3Zm3.34 17.36A9.009 9.009 0 0 0 20.946 13h-3.964c-.015 3.2-.981 6-1.64 7.36ZM3.056 13a9.009 9.009 0 0 0 5.604 7.36C8 19 7.034 15.8 7.02 13H3.055ZM12 21c1.5 0 3-4.5 2.98-8H9.02C9 16.5 10.5 21 12 21Z" fill="currentColor" /></svg>
        </PerformanceButton>
        <div class="reviewer-tags-actions">
          <PerformanceButton :disabled="locked" @click="close">取消</PerformanceButton>
          <PerformanceButton variant="primary" :loading="locked" @click="confirm">确定</PerformanceButton>
        </div>
      </div>
    </template>
  </PerformanceDialogShell>
</template>

<style scoped>
:global(.reviewer-tags-dialog) { min-height: min(284px, calc(100vh - 32px)); }
:global(.reviewer-tags-dialog .performance-dialog__body) { flex: 1 1 auto; min-height: 0; }
.reviewer-tags-form { min-width: 0; min-height: 62px; }
.reviewer-tags-heading { margin-bottom: var(--spacing-2); color: var(--color-text-primary); font-weight: 600; line-height: 22px; }
.reviewer-tags-add { margin-top: var(--spacing-1); }
.reviewer-tags-add :deep(svg) { width: 14px; height: 14px; }
.reviewer-tags-error { margin: var(--spacing-3) 0 0; color: var(--performance-field-error-color); font-size: var(--font-size-md); line-height: 22px; overflow-wrap: anywhere; }
.reviewer-tags-footer { display: flex; align-items: center; justify-content: space-between; gap: var(--spacing-3); margin-bottom: -12px; }
.reviewer-tags-footer > :deep(.performance-button) { margin-bottom: 12px; }
.reviewer-tags-footer > :deep(.performance-button) svg { flex: 0 0 auto; margin-right: var(--spacing-1); }
.reviewer-tags-actions { display: flex; flex-wrap: wrap; gap: var(--performance-dialog-footer-gap); }
.reviewer-tags-actions :deep(.performance-button) { margin-bottom: 12px; }
@media (max-width: 632px) { :global(.reviewer-tags-dialog) { width: calc(100vw - 32px) !important; } .reviewer-tags-footer { align-items: flex-start; } }
</style>
