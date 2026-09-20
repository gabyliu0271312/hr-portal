<script setup lang="ts">
import { reactive, watch } from 'vue'
import type { ReviewQuestion, ReviewQuestionForm, ReviewRuleOption } from './reviewQuestionTypes'
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

function handleSubmit() {
  emit('submit', { ...form })
  emit('update:modelValue', false)
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="mode === 'create' ? '新建评估题' : '编辑评估题'"
    width="640px"
    :close-on-click-modal="false"
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
        <el-input
          v-model="form.remark"
          type="textarea"
          :rows="2"
          maxlength="2000"
          show-word-limit
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button @click="emit('preview', { ...form })">预览</el-button>
      <el-button type="primary" @click="handleSubmit">提交</el-button>
    </template>
  </el-dialog>
</template>
