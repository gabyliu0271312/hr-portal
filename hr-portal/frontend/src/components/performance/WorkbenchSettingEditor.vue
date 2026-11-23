<template>
  <PerformanceDialogShell :model-value="modelValue" :title="title" width="var(--performance-workbench-editor-width)" :loading="loading" dialog-class="workbench-setting-editor" @update:model-value="$emit('update:modelValue', $event)" @close="$emit('update:modelValue', false)">
    <form v-if="modelValue" :key="session" class="workbench-editor-form" @submit.prevent="submit('active')">
      <WorkbenchLocalizedField v-model="form.title" v-model:english="form.titleEn" :label="kind === 'announcement' ? '公告标题' : '入口标题'" :allow-english="kind === 'announcement'" required :maxlength="128" :disabled="loading" :error="errors.title" />
      <WorkbenchLocalizedField v-model="form.link" v-model:english="form.linkEn" label="跳转链接" :allow-english="kind === 'announcement'" required :maxlength="2048" :disabled="loading" :error="errors.link" :english-error="errors.linkEn" />
      <template v-if="kind === 'announcement'">
        <WorkbenchAnnouncementScopes v-model:cycle-scope="form.cycleScope" v-model:cycle-ref="form.cycleRef" v-model:visibility="form.visibility" v-model:roles="form.roles" :disabled="loading" :cycle-error="errors.cycle" :role-error="errors.roles" />
        <WorkbenchAnnouncementAcknowledgement v-model:enabled="form.requireAck" v-model:description="form.description" v-model:description-en="form.descriptionEn" v-model:image-id="form.imageId" v-model:image-en-id="form.imageEnId" :disabled="loading" :description-error="errors.description" :english-error="errors.descriptionEn" @blocked="imageBlocked = $event" />
      </template>
      <div v-else class="workbench-editor-field">
        <PerformanceRequiredLabel label="图标" :required="false" />
        <PerformanceTextField v-model="form.icon" :disabled="loading" :maxlength="128" placeholder="可选，填写图标标识" />
      </div>
      <p v-if="imageBlocked && form.requireAck" class="workbench-editor-error" role="status">请先完成图片上传，或移除上传失败的图片。</p>
    </form>
    <template #footer>
      <div class="workbench-editor-footer">
        <UiButton :disabled="loading" @click="$emit('update:modelValue', false)">取消</UiButton>
        <UiButton variant="outline-primary" :disabled="loading || (form.requireAck && imageBlocked)" :loading="loading && submitting === 'inactive'" @click="submit('inactive')">保存</UiButton>
        <UiButton variant="primary" :disabled="loading || (form.requireAck && imageBlocked)" :loading="loading && submitting === 'active'" @click="submit('active')">启用</UiButton>
      </div>
    </template>
  </PerformanceDialogShell>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { PerformanceWorkbenchAnnouncement, PerformanceWorkbenchAnnouncementPayload, PerformanceWorkbenchEntry, PerformanceWorkbenchEntryPayload, PerformanceWorkbenchVisibilityRole } from '@/api/performance'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformanceRequiredLabel from './PerformanceRequiredLabel.vue'
import PerformanceTextField from './PerformanceTextField.vue'
import WorkbenchLocalizedField from './WorkbenchLocalizedField.vue'
import WorkbenchAnnouncementScopes from './WorkbenchAnnouncementScopes.vue'
import WorkbenchAnnouncementAcknowledgement from './WorkbenchAnnouncementAcknowledgement.vue'
import UiButton from '../ui/UiButton.vue'

type Item = PerformanceWorkbenchEntry | PerformanceWorkbenchAnnouncement
const props = withDefaults(defineProps<{ modelValue: boolean; kind: 'entry' | 'announcement'; item?: Item | null; loading?: boolean }>(), { item: null, loading: false })
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; save: [payload: PerformanceWorkbenchEntryPayload | PerformanceWorkbenchAnnouncementPayload] }>()
const session = ref(0)
const imageBlocked = ref(false)
const submitting = ref<'active' | 'inactive'>('active')
const form = reactive({ title: '', titleEn: '', link: '', linkEn: '', icon: '', cycleScope: '所有周期', cycleRef: null as string | null, visibility: '所有人', roles: [] as PerformanceWorkbenchVisibilityRole[], requireAck: false, description: '', descriptionEn: '', imageId: null as number | null, imageEnId: null as number | null })
const errors = reactive({ title: '', link: '', linkEn: '', cycle: '', roles: '', description: '', descriptionEn: '' })
const title = computed(() => `${props.item ? '编辑' : '新建'}${props.kind === 'announcement' ? '公告' : '更多入口'}`)
watch(() => [props.modelValue, props.item, props.kind], () => {
  if (!props.modelValue) return
  const item = props.item
  const announcement = props.kind === 'announcement' ? item as PerformanceWorkbenchAnnouncement | null : null
  Object.assign(form, {
    title: item?.title || '', titleEn: announcement?.title_en || '', link: item?.link || '', linkEn: announcement?.link_en || '',
    icon: props.kind === 'entry' && item && 'icon' in item ? item.icon || '' : '',
    cycleScope: announcement?.cycle_label === '指定周期' ? '指定周期' : '所有周期', cycleRef: announcement?.cycle_ref || null,
    visibility: announcement?.visibility === '指定角色' ? '指定角色' : '所有人', roles: [...(announcement?.visibility_roles || [])],
    requireAck: announcement?.require_ack || false, description: announcement?.description || '', descriptionEn: announcement?.description_en || '', imageId: announcement?.image_id ?? null, imageEnId: announcement?.image_en_id ?? null,
  })
  Object.keys(errors).forEach(key => { errors[key as keyof typeof errors] = '' })
  imageBlocked.value = false
  session.value++
}, { immediate: true })
function validLink(value: string) {
  if (!value || /[\\\u0000-\u001f\u007f]/.test(value) || value.startsWith('//')) return false
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) return true
  try { return ['http:', 'https:'].includes(new URL(value).protocol) } catch { return false }
}
function submit(status: 'active' | 'inactive') {
  if (props.loading || (form.requireAck && imageBlocked.value)) return
  errors.title = form.title.trim() ? '' : `请输入${props.kind === 'announcement' ? '公告' : '入口'}标题`
  errors.link = !form.link.trim() ? '请输入跳转链接' : props.kind === 'entry' || validLink(form.link.trim()) ? '' : '请输入有效的 HTTP(S) 链接或站内路径'
  errors.linkEn = form.linkEn.trim() && !validLink(form.linkEn.trim()) ? '请输入有效的英文跳转链接' : ''
  errors.cycle = props.kind === 'announcement' && form.cycleScope === '指定周期' && !form.cycleRef ? '请选择周期' : ''
  errors.roles = props.kind === 'announcement' && form.visibility === '指定角色' && !form.roles.length ? '请至少选择一个角色' : ''
  errors.description = form.description.length > 1000 ? '公告描述不能超过 1000 字' : ''
  errors.descriptionEn = form.descriptionEn.length > 1000 ? '英文公告描述不能超过 1000 字' : ''
  if (Object.values(errors).some(Boolean)) return
  submitting.value = status
  if (props.kind === 'entry') { emit('save', { title: form.title.trim(), link: form.link.trim(), icon: form.icon.trim() || null, visibility: '所有人', status }); return }
  emit('save', {
    title: form.title.trim(), title_en: form.titleEn.trim(), link: form.link.trim(), link_en: form.linkEn.trim(),
    cycle_label: form.cycleScope, cycle_ref: form.cycleScope === '指定周期' ? form.cycleRef : null,
    visibility: form.visibility, visibility_roles: form.visibility === '指定角色' ? [...form.roles] : [],
    require_ack: form.requireAck, description: form.description, description_en: form.descriptionEn, image_id: form.imageId, image_en_id: form.imageEnId, status,
  })
}
</script>

<style scoped>
.workbench-editor-form { min-height: 0; color: var(--color-text-primary); }
.workbench-editor-field { display: flex; flex-direction: column; gap: var(--spacing-2); margin-bottom: var(--performance-workbench-editor-field-gap); }
.workbench-editor-footer { display: flex; justify-content: flex-end; gap: var(--spacing-3); }
.workbench-editor-footer > * { min-width: var(--performance-dialog-button-width); }
.workbench-editor-error { color: var(--color-text-danger-strong); font-size: var(--font-size-sm); }
:global(.workbench-setting-editor) { --ui-dialog-header-height: var(--performance-workbench-editor-header-height); --ui-dialog-padding: var(--performance-workbench-editor-padding-x); }
</style>
