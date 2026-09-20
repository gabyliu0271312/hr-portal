<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import PerformanceTextField from './PerformanceTextField.vue'
import TagItemEditor from './TagItemEditor.vue'
import type { TagFillQuestionRecord } from './tagFillQuestionFixtures'

const props = withDefaults(defineProps<{
  modelValue: TagFillQuestionRecord
  mode?: 'create' | 'edit'
}>(), { mode: 'create' })

const emit = defineEmits<{
  'update:modelValue': [value: TagFillQuestionRecord]
  preview: [value: TagFillQuestionRecord]
  submit: [value: TagFillQuestionRecord]
}>()

const draft = reactive<TagFillQuestionRecord>(clone(props.modelValue))
const submitted = ref(false)

function clone(value: TagFillQuestionRecord): TagFillQuestionRecord {
  return { ...value, tags: value.tags.map((tag) => ({ ...tag })) }
}

watch(draft, () => emit('update:modelValue', clone(draft)), { deep: true })

watch(() => props.modelValue, (value) => {
  if (JSON.stringify(value) === JSON.stringify(draft)) return
  Object.assign(draft, clone(value))
}, { deep: true })

function addTag() {
  draft.tags = [
    ...draft.tags,
    { id: `draft-${Date.now()}-${draft.tags.length}`, name: '', description: '', prompt: '' },
  ]
}

function removeTag(index: number) {
  if (draft.tags.length <= 1) return
  draft.tags.splice(index, 1)
}

function validate() {
  submitted.value = true
  const valid = Boolean(draft.name.trim()) && draft.tags.every((tag) => Boolean(tag.name.trim()))
  if (!valid) ElMessage.error('请完善必填内容')
  return valid
}

function preview() {
  if (validate()) emit('preview', clone(draft))
}

function submit() {
  if (validate()) emit('submit', clone(draft))
}

defineExpose({ preview, submit })
</script>

<template>
  <div class="tag-fill-question-form" :data-mode="mode">
    <div class="language-bar">
      <button class="language-tab is-active" type="button">中文</button>
      <button class="language-config" type="button">◎ 多语言配置</button>
    </div>

    <label class="form-field">
      <span class="field-label">名称<span class="required-mark">*</span></span>
      <PerformanceTextField v-model="draft.name" variant="feishu-input" placeholder="请输入名称" :maxlength="500" :invalid="submitted && !draft.name.trim()" />
      <span v-if="submitted && !draft.name.trim()" class="field-error">名称为必填</span>
    </label>

    <label class="form-field">
      <span class="field-label">描述</span>
      <PerformanceTextField v-model="draft.description" type="textarea" placeholder="请输入描述" :maxlength="20000" show-count />
    </label>

    <section class="tags-section">
      <h2 class="section-title">标签</h2>
      <TagItemEditor
        v-for="(tag, index) in draft.tags"
        :key="tag.id"
        :model-value="tag"
        :can-remove="draft.tags.length > 1"
        :submitted="submitted"
        @update:model-value="draft.tags[index] = $event"
        @remove="removeTag(index)"
      />
      <button class="add-tag" type="button" @click="addTag"><span>＋</span> 添加标签</button>
    </section>

    <label class="form-field">
      <span class="field-label">备注</span>
      <PerformanceTextField v-model="draft.remark" type="textarea" placeholder="填写帮助管理员理解此问题的内容，备注仅展示在飞书绩效管理后台" :maxlength="2000" show-count />
    </label>
  </div>
</template>

<style scoped>
.tag-fill-question-form { width: 752px; max-width: 100%; min-height: max-content; margin: 8px auto 24px; background: #fff; color: #1f2329; font: 400 14px/22px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
.language-bar { display: flex; align-items: center; height: 46px; margin-bottom: 20px; border-bottom: 1px solid #dee0e3; }
.language-tab, .language-config { border: 0; background: transparent; color: #3370ff; cursor: pointer; font: inherit; }
.language-tab { align-self: stretch; padding: 0 0 2px; border-bottom: 3px solid #3370ff; }
.language-config { margin-left: auto; color: #646a73; }
.form-field { display: block; margin: 0 0 20px; }
.field-label { display: block; margin-bottom: 8px; font-weight: 600; }
.required-mark { margin-left: 2px; color: #f54a45; }
.field-error { display: block; margin-top: 2px; color: #f54a45; font-size: 13px; }
.tags-section { margin-bottom: 20px; }
.section-title { margin: 0 0 10px; font-size: 14px; line-height: 22px; }
.add-tag { display: inline-flex; align-items: center; border: 0; background: transparent; color: #3370ff; cursor: pointer; font: inherit; }
.add-tag span { margin-right: 2px; font-size: 18px; }
:deep(.performance-text-field) { width: 100% !important; }
:deep(.native-textarea) { resize: vertical; }
</style>
