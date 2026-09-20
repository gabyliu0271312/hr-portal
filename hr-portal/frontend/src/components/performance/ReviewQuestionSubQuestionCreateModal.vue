<script setup lang="ts">
import { reactive, watch } from 'vue'
import type { ReviewQuestionForm, ReviewRuleOption } from './reviewQuestionTypes'
import ReviewQuestionFormType from './ReviewQuestionFormType.vue'
import PerformanceRequiredLabel from './PerformanceRequiredLabel.vue'
import PerformanceTextField from './PerformanceTextField.vue'
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
  <div v-if="props.open" class="sub-question-modal-mask" @click.self="close">
      <section class="sub-question-create-modal" role="dialog" aria-modal="true" aria-labelledby="sub-question-create-title">
        <header class="sub-question-modal-header">
          <h2 id="sub-question-create-title">新建子评估题</h2>
          <button class="sub-question-modal-close" type="button" aria-label="关闭" @click="close">×</button>
        </header>
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
        <footer class="sub-question-modal-footer">
          <button class="sub-question-modal-button secondary" type="button" @click="close">取消</button>
          <button class="sub-question-modal-button primary" type="button" @click="submit">提交</button>
        </footer>
      </section>
    </div>
</template>

<style scoped>
.sub-question-modal-mask { position: fixed; inset: 0; z-index: 2600; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.55); }
.sub-question-create-modal { position: relative; display: flex; flex-direction: column; width: 600px; max-height: calc(100vh - 64px); overflow: hidden; box-sizing: border-box; border-radius: 8px; background: #fff; color: #1f2329; font: 400 14px/22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif; }
.sub-question-modal-header { position: relative; flex: 0 0 72px; height: 72px; padding: 24px; box-sizing: border-box; }
.sub-question-modal-header h2 { margin: 0; font-size: 16px; font-weight: 600; line-height: 24px; }
.sub-question-modal-close { position: absolute; top: 24px; right: 24px; width: 24px; height: 24px; padding: 0; border: 0; background: transparent; color: #646a73; font-size: 24px; line-height: 24px; cursor: pointer; }
.sub-question-modal-body { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 0 24px; }
.sub-question-modal-card { margin-bottom: 16px; padding: 20px 20px 0; border-radius: 8px; background: #fff; box-shadow: rgba(31,35,41,.02) 0 1px 2px -2px, rgba(31,35,41,.02) 0 2px 4px 0, rgba(31,35,41,.02) 0 2px 8px 2px; }
.sub-question-modal-card h3 { margin: 0 0 16px; font-size: 16px; font-weight: 600; line-height: 24px; }
.sub-question-modal-field { margin-bottom: 20px; }
.sub-question-modal-input { width: 100%; height: 32px; padding: 4px 11px; box-sizing: border-box; border: 1px solid #d0d3d6; border-radius: 6px; outline: none; font: inherit; }
.sub-question-modal-input:focus { border-color: #1456f0; }
.language-options { display: flex; gap: 16px; height: 22px; align-items: center; color: #646a73; }
.language-options label { display: inline-flex; gap: 8px; align-items: center; }
.language-options input { width: 16px; height: 16px; margin: 0; }
.field-label { display: block; height: 22px; margin-bottom: 8px; color: #1f2329; font-weight: 600; line-height: 22px; }
.sub-question-modal-footer { display: flex; flex: 0 0 80px; justify-content: flex-end; gap: 12px; padding: 24px; box-sizing: border-box; }
.sub-question-modal-button { height: 32px; padding: 4px 16px; border-radius: 6px; font: 400 14px/22px inherit; cursor: pointer; }
.sub-question-modal-button.secondary { border: 1px solid #d0d3d6; background: #fff; color: #1f2329; }
.sub-question-modal-button.primary { border: 1px solid #3370ff; background: #3370ff; color: #fff; }
</style>
