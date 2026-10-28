<template>
  <PerformanceDrawerShell
    v-model="open"
    :title="mode === 'edit' ? '编辑校准规则' : '添加校准规则'"
    width="680px"
    variant="captured"
    @close="cancel"
  >
    <template #header>
      <div class="calibration-rule-header">
        <h2>{{ mode === 'edit' ? '编辑校准规则' : '添加校准规则' }}</h2>
        <div v-if="isDistributionFlow" class="calibration-step-guide" aria-label="校准规则配置步骤">
          <span :class="{ current: step === 0, done: step === 1 }"><b>{{ step === 1 ? '✓' : '1' }}</b>校准规则</span>
          <i aria-hidden="true"></i>
          <span :class="{ current: step === 1 }"><b>2</b>分布规则</span>
        </div>
      </div>
    </template>
    <div class="calibration-rule-drawer" aria-label="校准规则编辑">
      <template v-if="step === 0 || !isDistributionFlow">
      <section class="calibration-rule-section" aria-labelledby="calibrator-title">
        <h3 id="calibrator-title" class="calibration-rule-section__title"><span class="required-mark">*</span>校准人</h3>
        <div class="calibration-radio-group" role="radiogroup" aria-label="校准人来源">
          <label><input v-model="draft.subject_source" type="radio" value="RULE" /> <span>按规则设置</span></label>
          <label><input v-model="draft.subject_source" type="radio" value="IMPORT" disabled /> <span>导入人员名单</span></label>
        </div>
        <template v-if="draft.subject_source === 'RULE'">
          <template v-for="(group, groupIndex) in draft.subject_groups" :key="groupIndex">
            <PerformanceCalibrationConditionGroup
              v-model="draft.subject_groups[groupIndex]"
              :title="`条件组 ${groupIndex + 1}`"
              field-label="校准人"
              :field-options="subjectFieldOptions"
              :value-options="peopleOptions"
              count-suffix="有可校准的被评估人"
              :removable="draft.subject_groups.length > 1"
              @update:model-value="subjectDirty = true; validationError = ''"
              @remove="removeSubjectGroup(groupIndex)"
            />
            <div v-if="groupIndex < draft.subject_groups.length - 1" class="calibration-rule-group-or">或</div>
          </template>
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
          <label><input v-model="draft.scope_mode" type="radio" value="RULE" /> <span>按指定校准规则</span></label>
        </div>
        <template v-if="draft.scope_mode === 'RULE'">
          <template v-for="(group, groupIndex) in draft.scope_groups" :key="groupIndex">
            <PerformanceCalibrationConditionGroup
              v-model="draft.scope_groups[groupIndex]"
              :title="`条件组 ${groupIndex + 1}`"
              field-label="校准范围"
              :field-options="scopeFieldOptions"
              :value-options="peopleOptions"
              :organization-tree="organizationTree"
              :hire-date-range="hireDateRange"
              :removable="draft.scope_groups.length > 1"
              @open-options="emit('open-options')"
              @update:model-value="validationError = ''"
              @remove="removeScopeGroup(groupIndex)"
            />
            <div v-if="groupIndex < draft.scope_groups.length - 1" class="calibration-rule-group-or">或</div>
          </template>
        </template>
        <button v-if="draft.scope_mode === 'RULE'" type="button" class="calibration-rule-link" @click="addScopeGroup">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.709 4.058C12.595 4 12.445 4 12.147 4h-.294c-.298 0-.448 0-.562.058a.534.534 0 0 0-.233.233C11 4.405 11 4.555 11 4.853V11H4.853c-.298 0-.448 0-.562.058a.534.534 0 0 0-.233.233C4 11.405 4 11.555 4 11.853v.294c0 .298 0 .448.058.562.051.1.133.182.233.233.114.058.264.058.562.058H11v6.147c0 .298 0 .448.058.562.051.1.133.182.233.233.114.058.264.058.562.058h.294c.298 0 .448 0 .562-.058a.535.535 0 0 0 .233-.233c.058-.114.058-.264.058-.562V13h6.147c.298 0 .448 0 .562-.058a.535.535 0 0 0 .233-.233c.058-.114.058-.264.058-.562v-.294c0-.298 0-.448-.058-.562a.535.535 0 0 0-.233-.233C19.595 11 19.445 11 19.147 11H13V4.853c0-.298 0-.448-.058-.562a.534.534 0 0 0-.233-.233Z" fill="currentColor" /></svg>
          添加条件组
        </button>
        <p v-if="validationError" class="calibration-rule-error" role="alert">{{ validationError }}</p>
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
      </template>
      <template v-else-if="isDistributionFlow">
        <section class="calibration-rule-section calibration-distribution-section" aria-labelledby="distribution-title">
          <h3 id="distribution-title" class="calibration-rule-section__title">分布规则</h3>
          <div v-if="draft.distribution_rules.length" class="calibration-distribution-list">
            <article v-for="(distribution, index) in draft.distribution_rules" :key="index" class="calibration-distribution-card">
              <div class="calibration-distribution-card__header">
                <span>分布规则 {{ index + 1 }}</span>
                <PerformanceIconButton icon="DeleteTrashOutlined" :label="`删除分布规则 ${index + 1}`" :disabled="saving" @click="removeDistributionRule(index)" />
              </div>
              <PerformanceDistributionRuleEditor
                :model-value="distribution"
                :assessment-options="assessmentOptions"
                :organization-tree="organizationTree"
                :position-level-options="positionLevelOptions"
                show-execution-scope
                :submitted="distributionSubmitted"
                :disabled="saving"
                @open-options="emit('open-options')"
                @update:model-value="updateDistributionRule(index, $event)"
              />
            </article>
          </div>
          <div v-else class="calibration-distribution-empty" role="status">
            <MetricTemplateEmptyIllustration />
            <p>暂无分布规则</p>
            <PerformanceTextButton label="＋ 添加分布规则" :disabled="saving" @click="addDistributionRule" />
          </div>
          <PerformanceTextButton v-if="draft.distribution_rules.length" class="calibration-distribution-add" label="＋ 添加分布规则" :disabled="saving" @click="addDistributionRule" />
        </section>
      </template>
    </div>
    <template #footer>
      <p v-if="saveError" class="calibration-rule-error" role="alert">{{ saveError }}</p>
      <PerformanceDrawerFooter variant="captured" :confirm-text="isDistributionFlow && step === 0 ? '下一步' : '确定'" :cancel-text="isDistributionFlow && step === 1 ? '上一步' : '取消'" :confirm-disabled="saving" @confirm="confirm" @cancel="isDistributionFlow && step === 1 ? backStep() : cancel()" />
    </template>
  </PerformanceDrawerShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PerformanceCalibrationConditionGroup as CalibrationGroup, PerformanceDistributionAssessmentOption, PerformanceDistributionRule, PerformanceHrbpOrganizationNode, PerformanceProjectFlowRule } from '@/api/performance'
import type { PerformanceSearchSelectOption } from './PerformanceSearchSelect.vue'
import PerformanceDrawerFooter from './PerformanceDrawerFooter.vue'
import PerformanceDrawerShell from './PerformanceDrawerShell.vue'
import PerformanceCalibrationConditionGroup from './PerformanceCalibrationConditionGroup.vue'
import PerformanceDistributionRuleEditor from './PerformanceDistributionRuleEditor.vue'
import PerformanceIconButton from './PerformanceIconButton.vue'
import PerformanceTextButton from './PerformanceTextButton.vue'
import MetricTemplateEmptyIllustration from './MetricTemplateEmptyIllustration.vue'
import { HIRE_DATE_OPERATOR_OPTIONS, PERFORMANCE_CONDITION_FIELDS, conditionValueOptions, validHireDateCondition } from './performanceConditionFields'
import PerformanceSwitch from './PerformanceSwitch.vue'

type PeopleOption = { value: string; label: string }
type RuleDraft = {
  subject_source: 'RULE'
  subject_groups: CalibrationGroup[]
  scope_mode: 'PROJECT_ALL' | 'RULE'
  scope_groups: CalibrationGroup[]
  description: string
  allow_authorize: boolean
  distribution_rules: PerformanceDistributionRule[]
}

const props = withDefaults(defineProps<{
  modelValue: boolean
  rule?: PerformanceProjectFlowRule | null
  mode?: 'create' | 'edit'
  peopleOptions?: PeopleOption[]
  organizationTree?: PerformanceHrbpOrganizationNode[]
  hireDateRange?: { min: string | null; max: string | null }
  assessmentOptions?: PerformanceDistributionAssessmentOption[]
  positionLevelOptions?: PerformanceSearchSelectOption[]
  saving?: boolean
  saveError?: string
}>(), { rule: null, mode: 'create', peopleOptions: () => [], organizationTree: () => [], assessmentOptions: () => [], positionLevelOptions: () => [], saving: false, saveError: '' })
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; confirm: [rule: PerformanceProjectFlowRule]; cancel: []; 'open-options': [] }>()
const open = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const subjectFieldOptions = [{ value: 'employee', label: PERFORMANCE_CONDITION_FIELDS.employee.label }]
const scopeFieldOptions = ['department', 'employee', 'hire_date', 'calibrator_relation'].map(value => ({ value, label: PERFORMANCE_CONDITION_FIELDS[value as keyof typeof PERFORMANCE_CONDITION_FIELDS].label }))
const peopleOptions = computed(() => conditionValueOptions('employee', { people: props.peopleOptions }))
const draft = ref<RuleDraft>(createDraft(props.rule))
const validationError = ref('')
const subjectDirty = ref(false)
const step = ref(0)
const distributionSubmitted = ref(false)
const isDistributionFlow = computed(() => props.assessmentOptions.length > 0)

function createGroup(field: 'employee' | 'calibrator_relation'): CalibrationGroup {
  return { conditions: [{ field, operator: 'INCLUDE', values: [] }] }
}
function createDraft(rule?: PerformanceProjectFlowRule | null): RuleDraft {
  return {
    subject_source: rule?.subject_source || 'RULE',
    subject_groups: rule?.subject_groups?.length ? clone(rule.subject_groups) : [createGroup('employee')],
    scope_mode: rule?.scope === 'PROJECT_ALL' ? 'PROJECT_ALL' : 'RULE',
    scope_groups: rule?.scope_groups?.length ? clone(rule.scope_groups) : [createGroup('calibrator_relation')],
    description: rule?.description || '',
    allow_authorize: rule?.allow_authorize || false,
    distribution_rules: rule?.distribution_rules ? clone(rule.distribution_rules) : [],
  }
}
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }
function addSubjectGroup() { subjectDirty.value = true; validationError.value = ''; draft.value.subject_groups.push(createGroup('employee')) }
function removeSubjectGroup(index: number) { if (draft.value.subject_groups.length > 1) { subjectDirty.value = true; validationError.value = ''; draft.value.subject_groups.splice(index, 1) } }
function addScopeGroup() { validationError.value = ''; draft.value.scope_groups.push(createGroup('calibrator_relation')) }
function removeScopeGroup(index: number) { if (draft.value.scope_groups.length > 1) { validationError.value = ''; draft.value.scope_groups.splice(index, 1) } }
function emptyDistributionRule(): PerformanceDistributionRule { return { assessment_item_id: '', min_people_count: 0, conditions: [{ control_mode: 'HARD', grade_codes: [], operator: 'GTE', value: 0, unit: 'PERCENT' }], rounding_method: 'ROUND', execution_scope: { calibration_scope: false, department: false, other_dimension: false, rules: [] } } }
function addDistributionRule() { draft.value.distribution_rules.push(emptyDistributionRule()); distributionSubmitted.value = false }
function removeDistributionRule(index: number) { draft.value.distribution_rules.splice(index, 1) }
function updateDistributionRule(index: number, value: PerformanceDistributionRule) { draft.value.distribution_rules[index] = value; distributionSubmitted.value = false }
function validDistributionRule(rule: PerformanceDistributionRule) {
  const scope = rule.execution_scope
  const scopeValid = !scope || (scope.calibration_scope || scope.department || scope.other_dimension) && (!scope.department || scope.rules.filter(item => item.type === 'DEPARTMENT' || item.type === 'DEPARTMENT_LEVEL').every(item => item.values.length)) && (!scope.other_dimension || scope.rules.filter(item => item.type === 'POSITION_LEVEL').every(item => item.values.length))
  return Boolean(rule.assessment_item_id && rule.min_people_count >= 0 && rule.conditions.length && rule.conditions.every(condition => condition.grade_codes.length && condition.value > 0 && (condition.unit !== 'PERCENT' || condition.value <= 100)) && scopeValid)
}
function nextStep() {
  if (!validGroups(draft.value.subject_groups) || (draft.value.scope_mode === 'RULE' && !validGroups(draft.value.scope_groups))) {
    validationError.value = !validGroups(draft.value.subject_groups) ? '请完善校准人条件组中的条件值' : '请完善校准范围条件组中的条件值'
    return
  }
  validationError.value = ''; step.value = 1
}
function backStep() { step.value = 0; distributionSubmitted.value = false }
function validGroups(groups: CalibrationGroup[]) {
  return groups.length > 0 && groups.every(group => group.conditions.length > 0 && group.conditions.every(condition => condition.field === 'hire_date'
    ? validHireDateCondition(condition.operator, condition.values)
    : condition.values.length > 0 && !HIRE_DATE_OPERATOR_OPTIONS.some(option => option.value === condition.operator)))
}
function toRule(): PerformanceProjectFlowRule {
  const subjectCondition = draft.value.subject_groups[0]?.conditions[0]
  return {
    subject_type: 'PERSON',
    operator: subjectCondition?.operator === 'EXCLUDE' ? 'EXCLUDE' : 'INCLUDE',
    scope: draft.value.scope_mode,
    allow_authorize: draft.value.allow_authorize,
    ...(!props.rule || subjectDirty.value || props.rule.subject_groups ? { subject_source: draft.value.subject_source, subject_groups: clone(draft.value.subject_groups) } : {}),
    ...(draft.value.scope_mode === 'RULE' ? { scope_groups: clone(draft.value.scope_groups) } : {}),
    ...(!draft.value.distribution_rules.length ? {} : { distribution_rules: clone(draft.value.distribution_rules) }),
    description: draft.value.description,
  }
}
function cancel() {
  if (props.saving) return
  validationError.value = ''
  emit('cancel')
  open.value = false
}
function confirm() {
  if (props.saving) return
  if (!isDistributionFlow.value) {
    if ((!props.rule || subjectDirty.value || props.rule.subject_groups) && !validGroups(draft.value.subject_groups)) {
      validationError.value = '请完善校准人条件组中的条件值'
      return
    }
    if (draft.value.scope_mode === 'RULE' && !validGroups(draft.value.scope_groups)) {
      validationError.value = '请完善校准范围条件组中的条件值'
      return
    }
    validationError.value = ''
    emit('confirm', toRule())
    return
  }
  if (step.value === 0) { nextStep(); return }
  distributionSubmitted.value = true
  if (draft.value.distribution_rules.some(rule => !validDistributionRule(rule))) return
  if ((!props.rule || subjectDirty.value || props.rule.subject_groups) && !validGroups(draft.value.subject_groups)) {
    validationError.value = '请完善校准人条件组中的条件值'
    step.value = 0
    return
  }
  if (draft.value.scope_mode === 'RULE' && !validGroups(draft.value.scope_groups)) {
    validationError.value = '请完善校准范围条件组中的条件值'
    step.value = 0
    return
  }
  validationError.value = ''
  emit('confirm', toRule())
}
watch(() => [props.modelValue, props.rule, props.mode], () => {
  if (props.modelValue) {
    draft.value = createDraft(props.rule)
    subjectDirty.value = false
    validationError.value = ''
    step.value = 0
    distributionSubmitted.value = false
  }
}, { deep: false })
</script>

<style scoped>
.calibration-rule-error{margin:8px 0 0;color:#f54a45;font-size:14px;line-height:22px}
.calibration-rule-header{display:flex;align-items:center;gap:32px;min-width:0}.calibration-rule-header h2{margin:0;white-space:nowrap}.calibration-step-guide{display:flex;align-items:center;gap:12px;color:#8f959e;font-size:14px;line-height:22px}.calibration-step-guide span{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}.calibration-step-guide b{display:inline-flex;width:20px;height:20px;align-items:center;justify-content:center;border:1px solid #d0d3d6;border-radius:50%;font-size:12px;font-weight:400}.calibration-step-guide span.current,.calibration-step-guide span.done{color:#3370ff}.calibration-step-guide span.current b,.calibration-step-guide span.done b{border-color:#3370ff;background:#3370ff;color:#fff}.calibration-step-guide i{width:28px;border-top:1px solid #d0d3d6}
.calibration-distribution-list{display:flex;flex-direction:column;gap:12px}.calibration-distribution-card{padding:16px 20px;border-radius:4px;background:#f5f6f7}.calibration-distribution-card__header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;font-weight:600}.calibration-distribution-empty{display:flex;flex-direction:column;align-items:center;padding:32px 0;color:#646a73}.calibration-distribution-empty :deep(svg){width:80px;height:80px}.calibration-distribution-empty p{margin:12px 0}.calibration-distribution-add{margin-top:12px}
.calibration-rule-group-or{margin:16px -20px 8px;padding:12px 20px 0;border-top:1px solid var(--color-line-divider);color:var(--color-text-secondary);font:400 14px/22px var(--font-sans)}
.calibration-rule-section :deep(.performance-condition-logic-group__rows > .calibration-condition-group + .calibration-condition-group){margin-top:8px}
.calibration-condition-group+.calibration-condition-group{margin-top:8px}.calibration-rule-drawer{display:flex;flex-direction:column;gap:20px;min-width:0;color:#1f2329;font:400 14px/22px var(--font-sans)}.calibration-rule-section{min-width:0}.calibration-rule-section__title{display:flex;align-items:center;margin:0;font:600 14px/22px var(--font-sans)}.required-mark{margin-right:4px;color:#f54a45}.calibration-radio-group{display:flex;flex-wrap:wrap;gap:8px 24px;margin:8px 0 20px}.calibration-radio-group--vertical{flex-direction:column;margin-bottom:0}.calibration-radio-group label{display:flex;align-items:center;min-height:22px;cursor:pointer}.calibration-radio-group input{width:16px;height:16px;margin:0 8px 0 0;accent-color:#1456f0}.calibration-rule-link{display:inline-flex;align-items:center;margin-top:8px;padding:0;border:0;background:transparent;color:#3370ff;font:400 14px/22px var(--font-sans);cursor:pointer}.calibration-rule-link svg{width:16px;height:16px;margin-right:4px}.calibration-rule-empty{margin:8px 0 0;color:#646a73}.calibration-rule-help{margin:8px 0 12px;color:#646a73}.calibration-rule-example{margin-left:8px;padding:0;border:0;background:transparent;color:#1456f0;font:inherit;cursor:pointer}.calibration-description-input{display:flex;align-items:center;min-height:32px;padding:4px 8px 4px 11px;border:1px solid #d0d3d6;border-radius:6px;background:#fff;box-sizing:border-box}.calibration-description-input:focus-within{border-color:#3370ff;box-shadow:0 0 0 2px rgba(51,112,255,.18)}.calibration-description-input input{flex:1;min-width:20px;height:22px;padding:0;border:0;outline:0;background:transparent;color:#1f2329;font:400 14px/22px var(--font-sans)}.calibration-description-input>span:not(.calibration-description-input__count){margin-left:8px;padding:0 6px;border-radius:4px;background:rgba(31,35,41,.1);color:#646a73;font-size:12px;line-height:20px}.calibration-description-input__count{display:none}.calibration-rule-delegation{margin-top:0}.calibration-rule-delegation .calibration-rule-section__title{gap:8px}.calibration-rule-delegation .calibration-rule-help{margin-bottom:0}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
</style>
