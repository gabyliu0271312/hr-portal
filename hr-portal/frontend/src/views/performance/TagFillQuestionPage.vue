<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { performanceTagFillQuestionApi, type PerformanceTagFillQuestionPayload } from '@/api/performance'
import FullScreenModal from '@/components/performance/FullScreenModal.vue'
import TagFillQuestionForm from '@/components/performance/TagFillQuestionForm.vue'
import type { TagFillQuestionRecord } from '@/components/performance/tagFillQuestionFixtures'

const route = useRoute()
const router = useRouter()
const mode = computed<'create' | 'edit'>(() => route.name === 'TaggedFillQuestionEdit' ? 'edit' : 'create')
const recordId = computed(() => String(route.params.id || ''))
const title = computed(() => mode.value === 'edit' ? form.value.name || '编辑标签型填写题' : '新建标签型填写题')
const form = ref<TagFillQuestionRecord>({ id: '', name: '', description: '', creator: '', createdAt: '', remark: '', tags: [{ id: 'draft-tag-1', name: '', description: '', prompt: '' }] })
const formRef = ref<InstanceType<typeof TagFillQuestionForm> | null>(null)
const preview = ref<TagFillQuestionRecord | null>(null)
const submitting = ref(false)

function back() {
  void router.push({ name: 'TaggedFillQuestionManagement' })
}

function showPreview(value: TagFillQuestionRecord) {
  preview.value = value
}

function closePreview() {
  preview.value = null
}

function payload(value: TagFillQuestionRecord): PerformanceTagFillQuestionPayload {
  return {
    language: 'zh-CN',
    name: value.name,
    description: value.description,
    remark: value.remark,
    tags: value.tags,
  }
}

async function submit(value: TagFillQuestionRecord) {
  submitting.value = true
  try {
    if (mode.value === 'edit') await performanceTagFillQuestionApi.update(recordId.value, payload(value))
    else await performanceTagFillQuestionApi.create(payload(value))
    ElMessage.success(mode.value === 'edit' ? '编辑成功' : '创建成功')
    back()
  } catch {
    ElMessage.error(mode.value === 'edit' ? '编辑失败' : '创建失败')
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  if (mode.value !== 'edit') return
  try {
    form.value = await performanceTagFillQuestionApi.get(recordId.value)
  } catch {
    ElMessage.error('标签型填写题加载失败')
    back()
  }
})
</script>

<template>
  <FullScreenModal
    :title="title"
    :submitting="submitting"
    @back="back"
    @submit="formRef?.submit()"
    @preview="formRef?.preview()"
    @cancel="back"
  >
    <TagFillQuestionForm ref="formRef" v-model="form" :mode="mode" @preview="showPreview" @submit="submit" />
  </FullScreenModal>

  <el-dialog :model-value="preview !== null" title="预览" width="600px" destroy-on-close @close="closePreview">
    <div class="preview-content">
      <h3>{{ preview?.name }}</h3>
      <p v-if="preview?.description">{{ preview.description }}</p>
      <div class="preview-tags">
        <span v-for="tag in preview?.tags" :key="tag.id" class="preview-tag">{{ tag.name }}</span>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.preview-content { color: #1f2329; }
:deep(.full-screen-modal), :deep(.full-screen-modal-content) { background: #fff; }
:deep(.full-screen-modal-content) { display: block; min-height: 0; overflow-x: hidden; overflow-y: auto; padding-bottom: 96px; box-sizing: border-box; }
.preview-content h3 { margin: 0 0 12px; font-size: 16px; }
.preview-content p { margin: 0 0 16px; color: #646a73; }
.preview-tags { display: flex; flex-wrap: wrap; gap: 8px; }
.preview-tag { padding: 2px 8px; border-radius: 999px; background: #e1eaff; color: #0c296e; }
</style>
