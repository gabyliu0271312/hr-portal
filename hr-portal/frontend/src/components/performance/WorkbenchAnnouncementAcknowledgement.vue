<script setup lang="ts">
import { onBeforeUnmount, reactive, ref, watch } from 'vue'
import UiSwitch from '../ui/UiSwitch.vue'
import UiButton from '../ui/UiButton.vue'
import AddOutlinedIcon from './AddOutlinedIcon.vue'
import WorkbenchLocalizedField from './WorkbenchLocalizedField.vue'
import WorkbenchAnnouncementImageUpload from './WorkbenchAnnouncementImageUpload.vue'
import WorkbenchAnnouncementExample from './WorkbenchAnnouncementExample.vue'

withDefaults(defineProps<{ disabled?: boolean; descriptionError?: string; englishError?: string }>(), { disabled: false, descriptionError: '', englishError: '' })
const enabled = defineModel<boolean>('enabled', { required: true })
const description = defineModel<string>('description', { required: true })
const descriptionEn = defineModel<string>('descriptionEn', { required: true })
const imageId = defineModel<number | null>('imageId', { required: true })
const imageEnId = defineModel<number | null>('imageEnId', { required: true })
const englishImageVisible = ref(imageEnId.value != null)
watch(imageEnId, value => { if (value != null) englishImageVisible.value = true })
const emit = defineEmits<{ blocked: [value: boolean] }>()
const imageStates = reactive([{ busy: false, invalid: false }, { busy: false, invalid: false }])
function updateImageState(index: number, value: { busy: boolean; invalid: boolean }) {
  imageStates[index] = value
  emit('blocked', imageStates.some(state => state.busy || state.invalid))
}
onBeforeUnmount(() => emit('blocked', false))
</script>

<template>
  <div class="announcement-ack">
    <div class="announcement-ack__heading"><strong>弹窗并要求查看人确认知悉</strong><UiSwitch v-model="enabled" :disabled="disabled" aria-label="弹窗并要求查看人确认知悉" /></div>
    <p class="announcement-ack__help">开启后，公告将在工作台对应展示的周期对可见该公告的人员弹出，直到查看人确认‘已知悉’。<WorkbenchAnnouncementExample /></p>
    <div v-show="enabled" class="announcement-ack__content">
      <WorkbenchLocalizedField v-model="description" v-model:english="descriptionEn" label="描述" multiline :maxlength="1000" :disabled="disabled" :error="descriptionError" :english-error="englishError" />
      <div class="announcement-ack__label">配图</div>
      <div class="announcement-ack__images">
        <WorkbenchAnnouncementImageUpload v-model="imageId" label="中文配图" :disabled="disabled" @state="updateImageState(0, $event)" />
        <WorkbenchAnnouncementImageUpload v-if="englishImageVisible" v-model="imageEnId" label="英文配图" :disabled="disabled" @state="updateImageState(1, $event)" />
      </div>
      <UiButton v-if="!englishImageVisible" class="announcement-ack__add-image" variant="text" :disabled="disabled" @click="englishImageVisible = true"><AddOutlinedIcon />添加英文配图</UiButton>
    </div>
  </div>
</template>

<style scoped>
.announcement-ack__heading { display: flex; align-items: center; gap: var(--spacing-1); min-height: 22px; }
.announcement-ack__heading :deep(.performance-switch) { flex: 0 0 var(--performance-workbench-editor-compact-switch-width); width: var(--performance-workbench-editor-compact-switch-width); height: var(--performance-workbench-editor-compact-switch-height); }
.announcement-ack__heading :deep(.performance-switch:not(:disabled):hover) { filter: brightness(.96); }
.announcement-ack__heading :deep(.performance-switch:focus-visible) { outline: 0; box-shadow: var(--performance-control-focus-ring); }
.announcement-ack__heading :deep(.performance-switch:not(:disabled):active) { background: var(--color-primary-active); }
.announcement-ack__help { margin: var(--spacing-2) 0 var(--spacing-5); color: var(--color-text-secondary); font-size: var(--font-size-md); line-height: 22px; }
.announcement-ack__label { margin-bottom: var(--spacing-2); font-weight: 600; }
.announcement-ack__images { display: flex; flex-direction: column; gap: var(--spacing-3); }
.announcement-ack__add-image { height: 22px; margin-top: var(--spacing-2); }
.announcement-ack__add-image :deep(svg) { width: 14px; height: 14px; margin-right: var(--spacing-1); }
</style>
