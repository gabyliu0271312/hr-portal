<script setup lang="ts">
import { reactive, watch } from 'vue'
import type { ReviewQuestion, ReviewQuestionForm, ReviewRuleOption } from './reviewQuestionTypes'
import PerformanceButton from './PerformanceButton.vue'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import ReviewQuestionFormType from './ReviewQuestionFormType.vue'

const props = withDefaults(defineProps<{
  modelValue: boolean
  question: ReviewQuestion | null
  mode: 'create' | 'edit'
  options?: ReviewRuleOption[]
}>(), { options: () => [] })

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: [form: ReviewQuestionForm]
  preview: [form: ReviewQuestionForm]
}>()

const form = reactive<ReviewQuestionForm>({
  language: '中文',
  name: '',
  description: '',
  type: 'regular',
  rule_id: null,
  remark: '',
})

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      form.language = '中文'
      form.name = props.question?.name ?? ''
      form.description = ''
      form.type = props.question?.type || 'regular'
      form.rule_id = props.question?.rule_id ?? null
      form.remark = props.question?.remark ?? ''
    }
  },
)

function close() { emit('update:modelValue', false) }
function handleSubmit() {
  emit('submit', { ...form })
  close()
}
</script>

<template>
  <PerformanceDialogShell
    :model-value="modelValue"
    :title="mode === 'create' ? '新建评估题' : '编辑评估题'"
    width="640px"
    @close="close"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-form label-width="96px" label-position="left">
      <el-form-item label="语言">
        <el-radio-group v-model="form.language">
          <el-radio value="中文">中文</el-radio>
          <el-radio value="英文">英文</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="名称" required>
        <el-input v-model="form.name" placeholder="请输入名称" />
      </el-form-item>
      <el-form-item label="描述">
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="3"
          maxlength="1000"
          show-word-limit
          placeholder="描述将展示给评估人，以帮助其进行评估"
        />
      </el-form-item>
      <el-form-item label="类型" required>
        <ReviewQuestionFormType v-model="form.type" />
      </el-form-item>
      <el-form-item label="评估规则">
        <el-select v-model="form.rule_id" placeholder="请选择" style="width: 100%">
          <el-option v-for="option in options" :key="option.id" :label="option.name" :value="option.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="备注">
        <el-input v-model="form.remark" type="textarea" :rows="2" maxlength="2000" show-word-limit />
      </el-form-item>
    </el-form>

    <template #footer>
      <div class="review-question-edit-footer">
        <PerformanceButton variant="secondary" @click="close">取消</PerformanceButton>
        <PerformanceButton variant="secondary" @click="emit('preview', { ...form })">预览</PerformanceButton>
        <PerformanceButton variant="primary" @click="handleSubmit">提交</PerformanceButton>
      </div>
    </template>
  </PerformanceDialogShell>
</template>

<style scoped>
.review-question-edit-footer { display: flex; justify-content: flex-end; gap: var(--performance-button-gap); }
.review-question-edit-footer :deep(.performance-button) { min-width: var(--performance-button-min-width); }
</style>
