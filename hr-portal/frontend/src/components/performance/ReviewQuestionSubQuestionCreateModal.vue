<script setup lang="ts">
import { reactive, watch } from 'vue'
import type { ReviewQuestionForm, ReviewRuleOption } from './reviewQuestionTypes'
import PerformanceButton from './PerformanceButton.vue'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformanceRequiredLabel from './PerformanceRequiredLabel.vue'
import PerformanceTextField from './PerformanceTextField.vue'
import ReviewQuestionFormType from './ReviewQuestionFormType.vue'
import ReviewQuestionRuleSelect from './ReviewQuestionRuleSelect.vue'

const props = withDefaults(defineProps<{
  open: boolean
  ruleOptions?: ReviewRuleOption[]
}>(), { ruleOptions: () => [] })

const emit = defineEmits<{
  'update:open': [value: boolean]
  submit: [form: ReviewQuestionForm]
}>()

const form = reactive<ReviewQuestionForm>({ language: '中文', name: '', description: '', type: 'regular', rule_id: null, remark: '' })

watch(() => props.open, (open) => {
  if (!open) return
  form.language = '中文'
  form.name = ''
  form.description = ''
  form.type = 'regular'
  form.rule_id = null
  form.remark = ''
})

function close() { emit('update:open', false) }
function submit() {
  if (!form.name.trim() || form.rule_id === null) return
  emit('submit', { ...form, name: form.name.trim() })
  close()
}
</script>

<template>
  <PerformanceDialogShell
    :model-value="props.open"
    overlay-class="sub-question-modal-mask"
    dialog-class="sub-question-create-modal"
    title-id="sub-question-create-title"
    :teleport="false"
    title="新建子评估题"
    width="600px"
    @close="close"
    @update:model-value="emit('update:open', $event)"
  >
    <div class="sub-question-modal-body">
      <section class="sub-question-modal-card">
        <h3>基本信息</h3>
        <div class="sub-question-modal-field">
          <span class="field-label">语言</span>
          <div class="language-options">
            <label><input type="checkbox" checked disabled />中文</label>
            <label><input type="checkbox" disabled />英文</label>
          </div>
        </div>
        <div class="sub-question-modal-field">
          <PerformanceRequiredLabel label="名称" />
          <input v-model="form.name" class="sub-question-modal-input" placeholder="请输入名称" />
        </div>
        <div class="sub-question-modal-field">
          <span class="field-label">描述</span>
          <PerformanceTextField v-model="form.description" type="textarea" :maxlength="1000" show-count />
        </div>
        <div class="sub-question-modal-field">
          <PerformanceRequiredLabel label="类型" />
          <ReviewQuestionFormType v-model="form.type" entry-mode="sub_question" />
        </div>
      </section>
      <section class="sub-question-modal-card">
        <h3>评估规则</h3>
        <div class="sub-question-modal-field">
          <PerformanceRequiredLabel label="评估规则" />
          <ReviewQuestionRuleSelect v-model="form.rule_id" :options="props.ruleOptions" />
        </div>
      </section>
      <section class="sub-question-modal-card remark-card">
        <h3>备注信息</h3>
        <div class="sub-question-modal-field">
          <span class="field-label">备注</span>
          <PerformanceTextField v-model="form.remark" type="textarea" :maxlength="2000" show-count />
        </div>
      </section>
    </div>

    <template #footer>
      <div class="sub-question-modal-footer">
        <PerformanceButton class="sub-question-modal-button secondary" variant="secondary" @click="close">取消</PerformanceButton>
        <PerformanceButton class="sub-question-modal-button primary" variant="primary" @click="submit">提交</PerformanceButton>
      </div>
    </template>
  </PerformanceDialogShell>
</template>

<style scoped>
.sub-question-modal-body { display: grid; gap: var(--spacing-4); }
.sub-question-modal-card { padding: var(--spacing-5) var(--spacing-5) 0; border-radius: var(--radius-lg); background: var(--color-bg-card); box-shadow: var(--shadow-card); }
.sub-question-modal-card h3 { margin: 0 0 var(--spacing-4); color: var(--color-text-primary); font-size: var(--font-size-lg); font-weight: 600; line-height: 24px; }
.sub-question-modal-field { margin-bottom: var(--spacing-5); }
.sub-question-modal-input { width: 100%; height: var(--performance-control-height); padding: 4px var(--performance-input-padding-x); box-sizing: border-box; border: 1px solid var(--performance-field-border); border-radius: var(--performance-control-radius); outline: none; font: inherit; transition: border-color var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard); }
.sub-question-modal-input:focus { border-color: var(--performance-field-border-focus); box-shadow: var(--performance-field-focus-ring); }
.language-options { display: flex; gap: var(--spacing-4); height: 22px; align-items: center; color: var(--color-text-secondary); }
.language-options label { display: inline-flex; gap: var(--spacing-2); align-items: center; }
.language-options input { width: 16px; height: 16px; margin: 0; }
.field-label { display: block; height: 22px; margin-bottom: var(--performance-field-label-gap); color: var(--color-text-primary); font-weight: 600; line-height: 22px; }
.sub-question-modal-footer { display: flex; justify-content: flex-end; gap: var(--performance-button-gap); }
.sub-question-modal-footer :deep(.performance-button) { min-width: var(--performance-button-min-width); }
</style>
