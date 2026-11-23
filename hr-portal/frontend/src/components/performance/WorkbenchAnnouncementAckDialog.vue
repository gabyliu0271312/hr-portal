<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import UiDialogShell from '@/components/ui/UiDialogShell.vue'
import UiButton from '@/components/ui/UiButton.vue'
import type { PerformanceWorkbenchAnnouncementFeedItem } from '@/api/performance'

const props = withDefaults(defineProps<{
  announcement: PerformanceWorkbenchAnnouncementFeedItem
  submitting?: boolean
  error?: string
  imageUrl?: string
  imageLoading?: boolean
  imageError?: boolean
  language?: string
}>(), { submitting: false, error: '', imageUrl: '', imageLoading: false, imageError: false, language: 'zh' })
const emit = defineEmits<{ acknowledge: []; retryImage: [] }>()
const root = ref<HTMLElement>()
const english = computed(() => props.language.startsWith('en'))
const title = computed(() => english.value && props.announcement.title_en || props.announcement.title)
const description = computed(() => english.value && props.announcement.description_en || props.announcement.description)
const link = computed(() => english.value && props.announcement.link_en || props.announcement.link)
const imageId = computed(() => english.value && props.announcement.image_en_id || props.announcement.image_id)
const imageFailed = ref(false)
const panel = () => root.value?.querySelector<HTMLElement>('[role="dialog"]')
function keydown(event: KeyboardEvent) {
  if (event.key !== 'Tab') return
  const controls = [...(panel()?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]') || [])]
  const first = controls[0], last = controls[controls.length - 1]
  if (!first) { event.preventDefault(); panel()?.focus() }
  else if (event.shiftKey && (document.activeElement === first || document.activeElement === panel())) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && (document.activeElement === last || !root.value?.contains(document.activeElement))) { event.preventDefault(); first.focus() }
  event.stopPropagation()
}
function keepFocus(event: FocusEvent) {
  if (root.value && !root.value.contains(event.target as Node)) panel()?.focus()
}
function viewDetails() { if (!props.submitting && link.value) window.open(link.value, '_blank', 'noopener,noreferrer') }
function retryImage() { imageFailed.value = false; emit('retryImage') }
watch(() => [props.announcement.id, props.imageUrl], () => { imageFailed.value = false })
watch(() => props.submitting, async () => { await nextTick(); if (!root.value?.contains(document.activeElement) || (document.activeElement as HTMLButtonElement)?.disabled) panel()?.focus() })
onMounted(() => {
  document.addEventListener('keydown', keydown, true)
  document.addEventListener('focusin', keepFocus)
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', keydown, true)
  document.removeEventListener('focusin', keepFocus)
})
</script>

<template>
  <Teleport to="body">
    <div ref="root">
      <UiDialogShell :model-value="true" :title="title" :show-close="false" :dismissible="false" :teleport="false" width="var(--performance-dialog-wide-width)">
        <div class="announcement-body" :aria-busy="submitting || undefined">
          <p v-if="description" class="announcement-description">{{ description }}</p>
          <div v-if="imageId" class="announcement-image">
            <div v-if="imageLoading" class="announcement-image-placeholder" role="status">图片加载中...</div>
            <div v-else-if="imageError || imageFailed || !imageUrl" class="announcement-image-placeholder" role="status">
              <span>图片加载失败</span><UiButton variant="text" :disabled="submitting" @click="retryImage">重试图片</UiButton>
            </div>
            <img v-else :src="imageUrl" :alt="`${title}配图`" @error="imageFailed = true" />
          </div>
          <p v-if="error" class="announcement-error" role="alert">{{ error }}</p>
        </div>
        <template #footer>
          <div class="announcement-actions">
            <UiButton v-if="link" class="announcement-details" :disabled="submitting" @click="viewDetails">查看详情</UiButton>
            <UiButton class="announcement-acknowledge" variant="primary" :loading="submitting" @click="!submitting && emit('acknowledge')">{{ error ? '重试知悉' : '我已知悉' }}</UiButton>
          </div>
        </template>
      </UiDialogShell>
    </div>
  </Teleport>
</template>

<style scoped>
.announcement-body { display: grid; gap: var(--spacing-4); overflow-wrap: anywhere; }
.announcement-description { margin: 0; white-space: pre-wrap; color: var(--color-text-primary); }
.announcement-image img { display: block; width: 100%; height: auto; border-radius: var(--radius-md); }
.announcement-image-placeholder { display: flex; min-height: 120px; align-items: center; justify-content: center; gap: var(--spacing-3); border-radius: var(--radius-md); background: var(--color-bg-page); color: var(--color-text-secondary); }
.announcement-error { margin: 0; color: var(--color-text-danger-strong); }
.announcement-actions { display: flex; justify-content: flex-end; gap: var(--spacing-3); }
:deep(.performance-dialog__header h2) { overflow-wrap: anywhere; }
</style>
