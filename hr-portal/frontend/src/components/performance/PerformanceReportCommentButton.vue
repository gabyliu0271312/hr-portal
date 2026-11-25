<template>
  <div class="report-note" :aria-busy="loading || saving">
    <p v-if="loading" role="status">正在加载备注…</p>
    <template v-else-if="editing">
      <PerformanceTextField v-model="draft" type="textarea" aria-label="个人图表备注" :maxlength="2000" :show-count="true" :disabled="saving" :invalid="!!error" />
      <div class="report-note-actions"><UiButton :disabled="saving" @click="cancel">取消</UiButton><UiButton variant="primary" :loading="saving" @click="save">确定</UiButton></div>
    </template>
    <template v-else>
      <p v-if="note.content" class="report-note-content">{{ note.content }}</p>
      <button class="performance-report-comment-button" type="button" :disabled="!!error" @click="edit">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" data-icon="AddCommentOutlined"><path d="M7 11a1 1 0 1 1 1-1h8a1 1 0 1 1 0 2H8a1 1 0 0 1-1-1Z" fill="currentColor" /><path d="M2 5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v11.5a2 2 0 0 1-2 2h-3.812a.5.5 0 0 0-.33.124l-2.541 2.224a.5.5 0 0 1-2.634 0l-2.542-2.224a.5.5 0 0 0-.329-.124H4a2 2 0 0 1-2-2V5Zm2 0v11.5h3.812a2.5 2.5 0 0 1 1.646.619L12 19.343l2.542-2.224a2.5 2.5 0 0 1 1.646-.619H20V5H4Z" fill="currentColor" /></svg>
        <span>{{ note.content ? '编辑备注（仅自己可见）' : '添加备注（仅自己可见）' }}</span>
      </button>
    </template>
    <div v-if="error" class="report-note-error" role="alert">{{ error }}<UiButton v-if="!editing" variant="link" @click="load">重新加载</UiButton><UiButton v-else-if="conflict" variant="link" @click="load">加载最新备注</UiButton></div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import UiButton from '@/components/ui/UiButton.vue'
import PerformanceTextField from './PerformanceTextField.vue'
import { reportNotesApi, type ReportNote, type ReportNoteScope } from '@/api/performanceReportNotes'
const props = withDefaults(defineProps<{ cycleId: number; section: string; scope?: ReportNoteScope; identityKey?: string }>(), { scope: () => ({}) })
const note = ref<ReportNote>({ content: '', version: 0 })
const draft = ref('')
const editing = ref(false)
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const conflict = ref(false)
let generation = 0
async function load() {
  const id = ++generation
  note.value = { content: '', version: 0 }; draft.value = ''; editing.value = false; error.value = ''; conflict.value = false; saving.value = false
  loading.value = true
  try {
    const value = await reportNotesApi.read(props.cycleId, props.section, props.scope)
    if (id === generation) note.value = value
  } catch { if (id === generation) error.value = '备注加载失败或无权访问，请重新加载' }
  finally { if (id === generation) loading.value = false }
}
function edit() { draft.value = note.value.content; editing.value = true; error.value = ''; conflict.value = false }
function cancel() { editing.value = false; draft.value = note.value.content; error.value = ''; conflict.value = false }
async function save() {
  if (saving.value || conflict.value) return
  const id = generation
  saving.value = true; error.value = ''
  try {
    const value = await reportNotesApi.save(props.cycleId, props.section, props.scope, { content: draft.value.trim(), version: note.value.version })
    if (id === generation) { note.value = value; editing.value = false }
  } catch (cause) {
    if (id !== generation) return
    conflict.value = (cause as { response?: { status?: number } }).response?.status === 409
    error.value = conflict.value ? '备注已在其他窗口更新，请先加载最新备注' : '备注保存失败或无权访问，输入内容已保留'
  } finally { if (id === generation) saving.value = false }
}
watch(() => [props.cycleId, props.section, JSON.stringify(props.scope), props.identityKey], load, { immediate: true })
onBeforeUnmount(() => { generation++ })
</script>

<style scoped>
.report-note { margin-top: var(--spacing-4); color: var(--color-text-secondary); font-size: var(--font-size-md); }
.performance-report-comment-button { display: inline-flex; align-items: center; gap: var(--spacing-1); padding: var(--spacing-1); border: 0; border-radius: var(--performance-control-radius); background: transparent; color: var(--color-text-secondary); cursor: pointer; font: inherit; }
.performance-report-comment-button:hover { background: var(--performance-button-text-neutral-hover-background); }
.performance-report-comment-button:focus-visible { outline: none; box-shadow: var(--performance-button-focus-ring); }
.performance-report-comment-button:disabled { cursor: not-allowed; color: var(--color-text-disabled); }
.performance-report-comment-button svg { flex: 0 0 auto; }
.report-note-actions { display: flex; justify-content: flex-end; gap: var(--spacing-3); margin-top: var(--spacing-3); }
.report-note-content { white-space: pre-wrap; overflow-wrap: anywhere; color: var(--color-text-primary); margin: 0 0 var(--spacing-2); }
.report-note-error { display: flex; align-items: center; flex-wrap: wrap; gap: var(--spacing-2); color: var(--color-danger); margin-top: var(--spacing-2); }
</style>
