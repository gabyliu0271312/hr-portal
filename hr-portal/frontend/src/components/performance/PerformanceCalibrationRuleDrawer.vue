<template>
  <PerformanceDrawerShell
    v-model="open"
    :title="mode === 'edit' ? '编辑校准规则' : '添加校准规则'"
    width="680px"
    variant="captured"
    @close="cancel"
  >
    <div class="calibration-rule-drawer" aria-label="校准规则编辑">
      <section class="calibration-rule-section" aria-labelledby="calibrator-title">
        <h3 id="calibrator-title" class="calibration-rule-section__title"><span class="required-mark">*</span>校准人</h3>
        <div class="calibration-radio-group" role="radiogroup" aria-label="校准人来源">
          <label><input v-model="draft.subject_source" type="radio" value="RULE" /> <span>按规则设置</span></label>
          <label><input v-model="draft.subject_source" type="radio" value="IMPORT" disabled /> <span>导入人员名单</span></label>
        </div>
        <template v-if="draft.subject_source === 'RULE'">
          <PerformanceCalibrationConditionGroup
            v-for="(group, groupIndex) in draft.subject_groups"
            :key="groupIndex"
            v-model="draft.subject_groups[groupIndex]"
            :title="`条件组 ${groupIndex + 1}`"
            field-label="校准人"
            :field-options="subjectFieldOptions"
            :value-options="peopleOptions"
            count-suffix="有可校准的被评估人"
          />
        </template>
        <button v-if="draft.subject_source === 'RULE'" type="button" class="calibration-rule-link" @click="addSubjectGroup">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.709 4.058C12.595 4 12.445 4 12.147 4h-.294c-.298 0-.448 0-.562.058a.534.534 0 0 0-.233.233C11 4.405 11 4.555 11 4.853V11H4.853c-.298 0-.448 0-.562.058a.534.534 0 0 0-.233.233C4 11.405 4 11.555 4 11.853v.294c0 .298 0 .448.058.562.051.1.133.182.233.233.114.058.264.058.562.058H11v6.147c0 .298 0 .448.058.562.051.1.133.182.233.233.114.058.264.058.562.058h.294c.298 0 .448 0 .562-.058a.535.535 0 0 0 .233-.233c.058-.114.058-.264.058-.562V13h6.147c.298 0 .448 0 .562-.058a.535.535 0 0 0 .233-.233c.058-.114.058-.264.058-.562v-.294c0-.298 0-.448-.058-.562a.535.535 0 0 0-.233-.233C19.595 11 19.445 11 19.147 11H13V4.853c0-.298 0-.448-.058-.562a.534.534 0 0 0-.233-.233Z" fill="currentColor" /></svg>
          添加条件组
        </button>
        <p v-else class="calibration-rule-empty">导入人员名单功能暂未开放。</p>
      </section>

      <section class="calibration-rule-section" aria-labelledby="scope-title">
        <h3 id="scope-title" class="calibration-rule-section__title"><span class="required-mark">*</span>校准范围</h3>
        <div class="calibration-radio-group calibration-radio-group--vertical" role="radiogroup" aria-label="校准范围">
          <label><input v-model="draft.scope_mode" type="radio" value="PROJECT_ALL" /> <span>项目全员</span></label>
          <label><input v-model="draft.scope_mode" type="radio" value="RULE" /> <span>按指定规则校准</span></label>
        </div>
        <template v-if="draft.scope_mode === 'RULE'">
          <PerformanceCalibrationConditionGroup
            v-for="(group, groupIndex) in draft.scope_groups"
            :key="groupIndex"
            v-model="draft.scope_groups[groupIndex]"
            :title="`条件组 ${groupIndex + 1}`"
            field-label="校准范围"
            :field-options="scopeFieldOptions"
            :value-options="scopeOptions"
          />
        </template>
        <button v-if="draft.scope_mode === 'RULE'" type="button" class="calibration-rule-link" @click="addScopeGroup">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.709 4.058C12.595 4 12.445 4 12.147 4h-.294c-.298 0-.448 0-.562.058a.534.534 0 0 0-.233.233C11 4.405 11 4.555 11 4.853V11H4.853c-.298 0-.448 0-.562.058a.534.534 0 0 0-.233.233C4 11.405 4 11.555 4 11.853v.294c0 .298 0 .448.058.562.051.1.133.182.233.233.114.058.264.058.562.058H11v6.147c0 .298 0 .448.058.562.051.1.133.182.233.233.114.058.264.058.562.058h.294c.298 0 .448 0 .562-.058a.535.535 0 0 0 .233-.233c.058-.114.058-.264.058-.562V13h6.147c.298 0 .448 0 .562-.058a.535.535 0 0 0 .233-.233c.058-.114.058-.264.058-.562v-.294c0-.298 0-.448-.058-.562a.535.535 0 0 0-.233-.233C19.595 11 19.445 11 19.147 11H13V4.853c0-.298 0-.448-.058-.562a.534.534 0 0 0-.233-.233Z" fill="currentColor" /></svg>
          添加条件组
        </button>
      </section>

      <section class="calibration-rule-section calibration-rule-description" aria-labelledby="description-title">
        <h3 id="description-title" class="calibration-rule-section__title">校准范围描述</h3>
        <p class="calibration-rule-help">如有校准范围描述，根校准任务的校准范围将优先展示描述，鼠标悬停时提示具体校准范围。</p>
        <label class="calibration-description-input">
          <span class="sr-only">校准范围描述</span>
          <input v-model="draft.description" maxlength="200" />
          <span>中文</span>
          <span class="calibration-description-input__count" aria-hidden="true">{{ draft.description.length }}/200</span>
        </label>
      </section>

      <section class="calibration-rule-section calibration-rule-delegation" aria-labelledby="delegation-title">
        <h3 id="delegation-title" class="calibration-rule-section__title">允许授权他人校准 <PerformanceSwitch v-model="draft.allow_authorize" aria-label="允许授权他人校准" /></h3>
        <p class="calibration-rule-help">开启后，校准人和项目管理角色可授权他人对校准范围内的人员进行校准</p>
      </section>
    </div>
    <template #footer>
      <PerformanceDrawerFooter variant="captured" @confirm="confirm" @cancel="cancel" />
    </template>
  </PerformanceDrawerShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PerformanceProjectFlowRule } from '@/api/performance'
import PerformanceDrawerFooter from './PerformanceDrawerFooter.vue'
import PerformanceDrawerShell from './PerformanceDrawerShell.vue'
import PerformanceCalibrationConditionGroup from './PerformanceCalibrationConditionGroup.vue'
import PerformanceSwitch from './PerformanceSwitch.vue'

type PeopleOption = { value: string; label: string }
type CalibrationCondition = {
  field: 'department' | 'employee_type' | 'employee' | 'calibrator_relation'
  operator: 'INCLUDE' | 'EXCLUDE'
  values: string[]
}
type CalibrationConditionGroup = { conditions: CalibrationCondition[] }
type RuleDraft = {
  subject_source: 'RULE' | 'IMPORT'
  subject_groups: CalibrationConditionGroup[]
  scope_mode: 'PROJECT_ALL' | 'RULE'
  scope_groups: CalibrationConditionGroup[]
  description: string
  allow_authorize: boolean
}

const props = withDefaults(defineProps<{
  modelValue: boolean
  rule?: PerformanceProjectFlowRule | null
  mode?: 'create' | 'edit'
  peopleOptions?: PeopleOption[]
  scopeOptions?: PeopleOption[]
}>(), { rule: null, mode: 'create', peopleOptions: () => [], scopeOptions: () => [] })
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; confirm: [rule: PerformanceProjectFlowRule]; cancel: [] }>()
const open = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const subjectFieldOptions = [{ value: 'employee', label: '人员' }]
const scopeFieldOptions = [{ value: 'calibrator_relation', label: '与校准人关系' }]
const peopleOptions = computed(() => props.peopleOptions)
const scopeOptions = computed(() => props.scopeOptions)
const draft = ref<RuleDraft>(createDraft())

function createGroup(field: 'employee' | 'calibrator_relation'): CalibrationConditionGroup {
  return { conditions: [{ field, operator: 'INCLUDE', values: [] }] }
}
function createDraft(rule?: PerformanceProjectFlowRule | null): RuleDraft {
  return {
    subject_source: 'RULE',
    subject_groups: [createGroup('employee')],
    scope_mode: rule?.scope === 'PROJECT_ALL' ? 'PROJECT_ALL' : 'RULE',
    scope_groups: [createGroup('calibrator_relation')],
    description: '',
    allow_authorize: rule?.allow_authorize || false,
  }
}
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }
function addSubjectGroup() { draft.value.subject_groups.push(createGroup('employee')) }
function addScopeGroup() { draft.value.scope_groups.push(createGroup('calibrator_relation')) }
function toRule(): PerformanceProjectFlowRule {
  const subjectCondition = draft.value.subject_groups[0]?.conditions[0]
  return {
    subject_type: 'PERSON',
    operator: subjectCondition?.operator || 'INCLUDE',
    scope: 'PROJECT_ALL',
    allow_authorize: draft.value.allow_authorize,
  }
}
function cancel() {
  emit('cancel')
  open.value = false
}
function confirm() {
  emit('confirm', toRule())
  open.value = false
}
watch(() => [props.modelValue, props.rule, props.mode], () => {
  if (props.modelValue) draft.value = createDraft(props.rule)
}, { deep: true })
</script>

<style scoped>
.calibration-condition-group+.calibration-condition-group{margin-top:8px}.calibration-rule-drawer{display:flex;flex-direction:column;gap:20px;min-width:0;color:#1f2329;font:400 14px/22px var(--font-sans)}.calibration-rule-section{min-width:0}.calibration-rule-section__title{display:flex;align-items:center;margin:0;font:600 14px/22px var(--font-sans)}.required-mark{margin-right:4px;color:#f54a45}.calibration-radio-group{display:flex;flex-wrap:wrap;gap:8px 24px;margin:8px 0 20px}.calibration-radio-group--vertical{flex-direction:column;margin-bottom:0}.calibration-radio-group label{display:flex;align-items:center;min-height:22px;cursor:pointer}.calibration-radio-group input{width:16px;height:16px;margin:0 8px 0 0;accent-color:#1456f0}.calibration-rule-link{display:inline-flex;align-items:center;margin-top:8px;padding:0;border:0;background:transparent;color:#3370ff;font:400 14px/22px var(--font-sans);cursor:pointer}.calibration-rule-link svg{width:16px;height:16px;margin-right:4px}.calibration-rule-empty{margin:8px 0 0;color:#646a73}.calibration-rule-help{margin:8px 0 12px;color:#646a73}.calibration-rule-example{margin-left:8px;padding:0;border:0;background:transparent;color:#1456f0;font:inherit;cursor:pointer}.calibration-description-input{display:flex;align-items:center;min-height:32px;padding:4px 8px 4px 11px;border:1px solid #d0d3d6;border-radius:6px;background:#fff;box-sizing:border-box}.calibration-description-input:focus-within{border-color:#3370ff;box-shadow:0 0 0 2px rgba(51,112,255,.18)}.calibration-description-input input{flex:1;min-width:20px;height:22px;padding:0;border:0;outline:0;background:transparent;color:#1f2329;font:400 14px/22px var(--font-sans)}.calibration-description-input>span:not(.calibration-description-input__count){margin-left:8px;padding:0 6px;border-radius:4px;background:rgba(31,35,41,.1);color:#646a73;font-size:12px;line-height:20px}.calibration-description-input__count{display:none}.calibration-rule-delegation{margin-top:0}.calibration-rule-delegation .calibration-rule-section__title{gap:8px}.calibration-rule-delegation .calibration-rule-help{margin-bottom:0}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
</style>
