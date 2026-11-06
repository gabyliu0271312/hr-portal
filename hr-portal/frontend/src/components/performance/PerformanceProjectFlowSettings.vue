<template>
  <div class="project-flow-settings" aria-label="流程设置">
    <div v-if="loading" class="flow-state" role="status">正在加载流程设置...</div>
    <div v-else-if="error" class="flow-state flow-state--error" role="alert">{{ error }}</div>
    <div v-else-if="!nodes.length" class="flow-state">当前绩效模板暂无流程环节</div>
    <article v-for="node in nodes" v-else :key="node.node_id || `${node.node_type}-${node.order}`" class="flow-node-card">
      <header class="flow-node-header">
        <span class="flow-node-icon" aria-hidden="true"><PerformanceWorkflowStageIcon :type="node.node_type" /></span>
        <div class="flow-node-heading">
          <h2>{{ node.name }}</h2>
          <p v-if="descriptionFor(node)">{{ descriptionFor(node) }}</p>
        </div>
      </header>

      <section v-if="is360SettingsNode(node)" class="node-settings invite-settings" aria-label="360°评估人设置">
        <div class="settings-heading">
          <div><h3>360°评估人设置</h3><p>该配置对所有 360° 相关环节生效</p></div>
          <button class="outline-button" type="button" @click="openInviteDrawer(node)">设置</button>
        </div>
        <div class="invite-summary">
          <div><span>默认邀请</span><strong>{{ inviteLabel(inviteSettings(node).default_invite) }}</strong></div>
          <div><span>最少邀请人数</span><strong>{{ inviteSettings(node).minimum_invited_count }} 人</strong></div>
          <div><span>允许自愿评估</span><strong>{{ inviteSettings(node).allow_voluntary_evaluation ? '允许' : '不允许' }}</strong></div>
        </div>
      </section>

      <section v-else-if="node.node_type === 'calibration'" class="node-settings calibration-settings" aria-label="校准规则设置">
        <div class="calibration-distribution-heading">
          <strong>绩效结果强制 / 建议分布</strong>
          <PerformanceDisabledReason :disabled="Boolean(distributionReason(node))" :reason="distributionReason(node)" variant="popover">
            <UiSwitch :model-value="calibrationSettings(node).force_distribution_enabled" :disabled="Boolean(distributionReason(node))" aria-label="绩效结果强制建议分布" @update:model-value="setDistributionEnabled(node, $event)" />
          </PerformanceDisabledReason>
        </div>
        <p v-if="distributionReason(node)" class="setting-disabled-reason">{{ distributionReason(node) }}</p>
        <p class="calibration-distribution-help">开启后，可以选择一个评估项，针对评估项的等级设置强制分布和建议分布规则</p>
        <div v-if="calibrationSettings(node).force_distribution_enabled" class="distribution-settings">
          <PerformanceRadioGroup
            :model-value="distributionSettings(node).mode"
            :options="distributionModeOptions"
            :name="`distribution-mode-${nodeKey(node)}`"
            direction="horizontal"
            aria-label="分布规则配置模式"
            :disabled="Boolean(distributionReason(node))"
            @update:model-value="setDistributionMode(node, $event)"
          />
          <div v-if="distributionSettings(node).mode === 'UNIFIED'" class="distribution-rule-summary">
            <strong>分布规则</strong>
            <div v-for="(rule,index) in distributionSettings(node).rules" :key="rule.assessment_item_id" class="distribution-rule-summary__row">
              <div class="distribution-rule-card__header">
                <span>分布规则 {{ index + 1 }}</span>
                <div class="distribution-rule-card__actions">
                  <PerformanceIconButton icon="EditOutlined" :label="`编辑分布规则 ${index + 1}`" :disabled="Boolean(distributionReason(node))" @click="openDistributionEditor(node,index)" />
                  <PerformanceIconButton icon="DeleteTrashOutlined" :label="`删除分布规则 ${index + 1}`" :disabled="Boolean(distributionReason(node))" @click="removeDistributionRule(node,index)" />
                </div>
              </div>
              <div class="distribution-rule-card__meta"><span>{{ distributionAssessmentLabel(rule.assessment_item_id) }}</span><span>{{ distributionOperatorLabel(rule.min_people_operator) }} {{ rule.min_people_count }} 人</span></div>
              <span class="distribution-rule-card__label">分布规则</span>
              <div class="distribution-rule-card__conditions">
                <div v-for="(condition,conditionIndex) in rule.conditions" :key="conditionIndex" class="distribution-rule-card__condition">
                  <span>{{ distributionControlLabel(condition.control_mode) }}</span>
                  <span>{{ condition.grade_codes.map(code => distributionGradeCode(rule.assessment_item_id, code)).join('、') }}</span>
                  <span>{{ distributionOperatorLabel(condition.operator) }} {{ condition.value }} {{ distributionUnitLabel(condition.unit) }}</span>
                </div>
              </div>
              <div class="distribution-rule-card__rounding"><span class="distribution-rule-card__label">取整方式</span><span>{{ distributionRoundingLabel(rule.rounding_method) }}</span></div>
            </div>
            <PerformanceTextButton class="distribution-add-rule" label="＋ 添加分布规则" :disabled="Boolean(distributionReason(node))" @click="openDistributionEditor(node)" />
          </div>
        </div>
        <div class="settings-heading calibration-heading"><div><h3>校准规则设置 <span class="required-mark">*</span><PerformanceInfoPopover content="校准人可查看并调整其校准范围内的绩效结果" :width="320" /></h3></div></div>
        <div class="calibration-summary"><span class="info-circle">i</span><span v-if="assignmentStats[nodeKey(node)]">当前共 {{ assignmentStats[nodeKey(node)]!.evaluated_count }} 个被评估人，{{ assignmentStats[nodeKey(node)]!.assigned_count }} 人已分配校准，{{ assignmentStats[nodeKey(node)]!.unassigned_count }} 人未分配校准人。</span><span v-else>{{ assignmentError || (assignmentLoading ? '正在计算校准分配…' : '校准分配尚未计算') }}</span><PerformanceTextButton label="查看校准详情" /></div>
        <div v-for="(phase, phaseIndex) in calibrationSettings(node).phases" :key="phase.phase_id || phaseIndex" class="calibration-phase">
          <div class="phase-heading"><div class="phase-title">第 {{ phaseIndex + 1 }} 阶段</div><PerformanceDisabledReason :disabled="Boolean(phaseDeleteReason(node, phaseIndex))" :reason="phaseDeleteReason(node, phaseIndex)" variant="popover"><PerformanceIconButton icon="DeleteTrashOutlined" :label="`删除第 ${phaseIndex + 1} 阶段`" :disabled="Boolean(phaseDeleteReason(node, phaseIndex))" @click="openDeletePhase(node, phaseIndex)" /></PerformanceDisabledReason></div>
          <div class="rule-table">
            <div class="rule-table-header"><span>校准人</span><span>校准范围</span><span>是否允许授权他人</span><span>操作</span></div>
            <div v-for="(rule, ruleIndex) in phase.rules" :key="ruleIndex" class="rule-row">
              <span class="rule-person"><span class="rule-tag">{{ subjectLabel(rule.subject_type) }}</span><span>{{ rule.operator === 'INCLUDE' ? '包含...' : '不包含...' }}</span></span>
              <span class="rule-scope-tag">{{ scopeLabel(rule.scope) }}</span>
              <PerformanceDisabledReason :disabled="ruleLocked(node, phaseIndex, ruleIndex)" reason="项目已启动，已有校准规则内容不可编辑，可新增或删除规则" variant="popover"><PerformanceCheckbox :model-value="rule.allow_authorize" label="" :disabled="ruleLocked(node, phaseIndex, ruleIndex)" @update:model-value="setRuleAuthorization(node, phaseIndex, ruleIndex, $event)" /></PerformanceDisabledReason>
              <span class="rule-actions"><PerformanceTextButton label="编辑" :disabled="ruleLocked(node, phaseIndex, ruleIndex)" @click="openRuleEditor(node, phaseIndex, ruleIndex)" /><PerformanceTextButton label="删除" :disabled="phase.rules.length <= 1" @click="openDeleteRule(node, phaseIndex, ruleIndex)" /></span>
            </div>
            <PerformanceTextButton class="link-button add-rule" label="＋ 添加校准规则" @click="openRuleEditor(node, phaseIndex)" />
          </div>
        </div>
        <PerformanceTextButton class="link-button add-phase" label="＋ 添加校准阶段" :disabled="flowSaving" @click="addPhase(node)" />
        <p v-if="phaseSaveError" class="phase-save-error" role="alert">{{ phaseSaveError }}</p>
      </section>

      <section v-else-if="node.node_type === 'result_view'" class="node-settings result-view-settings" aria-label="绩效结果查看设置">
        <h3>结果开通方式 <span class="required-mark">*</span></h3>
        <div class="result-view-choices" :class="{ 'result-view-choices--error': openingInvalid(node) }">
          <PerformanceCheckbox :model-value="resultViewSettings(node).automatic_enabled" label="按流程自动开通" @update:model-value="setOpeningMode(node, 'automatic_enabled', $event)" />
          <PerformanceRadioGroup
            v-if="resultViewSettings(node).automatic_enabled"
            :model-value="resultViewSettings(node).automatic_rule"
            :name="`result-opening-${nodeKey(node)}`"
            :options="openingRuleOptions(node)"
            direction="vertical"
            aria-label="自动开通条件"
            @update:model-value="setAutomaticRule(node, $event)"
          />
          <PerformanceDisabledReason
            :disabled="manualOpeningDisabled(node)"
            :reason="manualOpeningSettingLoaded ? '组织内暂不允许手动开通绩效结果' : '正在加载组织设置，请稍后重试'"
            variant="popover"
          >
            <PerformanceCheckbox
              :model-value="resultViewSettings(node).manual_enabled"
              label="手动开通"
              :disabled="manualOpeningDisabled(node)"
              @update:model-value="setOpeningMode(node, 'manual_enabled', $event)"
            />
          </PerformanceDisabledReason>
        </div>
        <p v-if="openingInvalid(node)" class="result-view-error" role="alert">请至少选择一种方式</p>
        <p class="setting-help">指定角色可以手动为被评估人开通绩效结果，不论被评估人的评估流程是否结束。有开通权限的角色以权限管理模块配置为准</p>
      </section>

      <section v-else-if="node.node_type === 'result_reconsideration'" class="node-settings reconsideration-settings" aria-label="结果复议处理设置">
        <h3>无法找到复议处理人时，由以下人员处理</h3>
        <PerformancePersonSelect
          :model-value="reconsiderationSettings(node).handler_employee_nos"
          :options="reconsiderationPeopleOptions"
          class="reconsideration-handler-select"
          selection-style="plain"
          aria-label="兜底复议处理人"
          placeholder="请选择人员"
          multiple
          :remote-search="false"
          @open="emit('open-options')"
          @update:model-value="setReconsiderationHandlers(node, $event)"
        />
      </section>
    </article>
    <PerformanceConfirmDialog v-model="deleteOpen" :message="deletion?.ruleIndex == null ? '确定删除该校准阶段吗？' : '确定删除该校准规则吗？'" description="保存成功后，失去规则来源的校准任务及操作权限将被撤销，历史结果保留。" cancel-text="取消" confirm-text="删除" :loading="deleteSaving" :error-message="deleteError" @confirm="confirmDeletion">
      <template #check><PerformanceCheckbox v-model="notifyCalibrators" label="通知校准人任务已删除" :disabled="deleteSaving" /></template>
    </PerformanceConfirmDialog>
    <PerformanceDistributionRuleDrawer
      v-if="distributionEditor"
      v-model="distributionDrawerOpen"
      :assessment-options="distributionAssessmentOptions"
      :used-assessment-ids="distributionUsedAssessmentIds"
      :initial-value="distributionEditor.rule"
      @confirm="saveDistributionRule"
      @cancel="distributionEditor = null"
    />
    <PerformanceProject360InviteSettingsDrawer
      v-if="inviteDrawerNode"
      v-model="inviteDrawerOpen"
      :settings="inviteSettings(inviteDrawerNode)"
      :people-options="peopleOptions"
      :saving="inviteSaving"
      :save-error="inviteSaveError"
      @confirm="saveInviteSettings"
    />
    <PerformanceCalibrationRuleDrawer
      v-if="ruleEditor"
      v-model="drawerOpen"
      :mode="ruleEditor.ruleIndex === null ? 'create' : 'edit'"
      :rule="ruleEditor.rule"
      :people-options="peopleOptions"
      :organization-tree="organizationTree"
      :hire-date-range="hireDateRange"
      :assessment-options="distributionAssessmentOptions"
      :position-level-options="positionLevelOptions"
      :distribution-mode="distributionReason(ruleEditor.node) ? 'UNIFIED' : distributionSettings(ruleEditor.node).mode"
      @open-options="emit('open-options')"
      :saving="calibrationSaving"
      :save-error="calibrationSaveError"
      @confirm="saveRuleEditor"
      @cancel="ruleEditor = null"
    />
  </div>
</template>

<script setup lang="ts">
import PerformanceSearchSelect from './PerformanceSearchSelect.vue'
import PerformancePersonSelect from './PerformancePersonSelect.vue'
import { createCalibrationPhaseId, createCalibrationRuleId, calibrationPhaseKey, ensureCalibrationPhaseIds, syncCalibrationPhaseTimes, initializeProjectFlow, projectFlowWithLocalTimes, projectFlowWithUtcTimes, mergeProjectDisplayChanges, calibrationOperations, calibrationHasNewPhases, calibrationSavedTimestamp, type ProjectEditingPolicy, type ProjectSettingsResponse, type ProjectSettingsPatch } from './performanceProjectCalibration'
import PerformanceConfirmDialog from './PerformanceConfirmDialog.vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { PerformanceCalibrationAssignment, PerformanceDistributionAssessmentOption, PerformanceDistributionMode, PerformanceDistributionRule, PerformanceDistributionRounding, PerformanceHrbpOrganizationNode, PerformanceProjectFlowRule, PerformanceProjectFlowSettings, PerformanceProjectPayload, PerformanceWorkflowNode } from '@/api/performance'
import { performanceProjectApi } from '@/api/performance'
import PerformanceCheckbox from '@/components/performance/PerformanceCheckbox.vue'
import PerformanceDisabledReason from '@/components/performance/PerformanceDisabledReason.vue'
import PerformanceDistributionRuleDrawer from '@/components/performance/PerformanceDistributionRuleDrawer.vue'
import PerformanceInfoPopover from '@/components/performance/PerformanceInfoPopover.vue'
import PerformanceRadioGroup from '@/components/performance/PerformanceRadioGroup.vue'
import PerformanceIconButton from '@/components/performance/PerformanceIconButton.vue'
import PerformanceTextButton from '@/components/performance/PerformanceTextButton.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import PerformanceCalibrationRuleDrawer from '@/components/performance/PerformanceCalibrationRuleDrawer.vue'
import PerformanceProject360InviteSettingsDrawer from '@/components/performance/PerformanceProject360InviteSettingsDrawer.vue'
import { isReviewer360Node } from '@/components/performance/performanceExecutorOptions'
import PerformanceWorkflowStageIcon from '@/views/performance/PerformanceWorkflowStageIcon.vue'

type PeopleOption = { value: string; label: string }
type RuleEditorState = {
  open: boolean
  node: PerformanceWorkflowNode
  phaseIndex: number
  ruleIndex: number | null
  rule: PerformanceProjectFlowRule | null
}

const props = withDefaults(defineProps<{
  nodes: PerformanceWorkflowNode[]
  modelValue?: PerformanceProjectFlowSettings
  peopleOptions?: PeopleOption[]
  organizationTree?: PerformanceHrbpOrganizationNode[]
  hireDateRange?: { min: string | null; max: string | null }
  evaluatedCount?: number
  projectId?: number | null
  projectPayload?: PerformanceProjectPayload | null
  savedFlowSettings?: PerformanceProjectFlowSettings
  baselineFlowSettings?: PerformanceProjectFlowSettings
  projectStatus?: string
  editingPolicy?: ProjectEditingPolicy
  calibrationBaseDigest?: string
  loading?: boolean
  error?: string
  manualResultOpeningEnabled?: boolean
  manualOpeningSettingLoaded?: boolean
  distributionAssessmentOptions?: PerformanceDistributionAssessmentOption[]
  positionLevelOptions?: Array<{ value: string; label: string }>
  showOpeningError?: boolean
}>(), { modelValue: () => ({ node_settings: {}, node_times: {} }), peopleOptions: () => [], organizationTree: () => [], distributionAssessmentOptions: () => [], positionLevelOptions: () => [], evaluatedCount: 0, loading: false, error: '', showOpeningError: false, manualResultOpeningEnabled: true, manualOpeningSettingLoaded: true })
const emit = defineEmits<{ 'update:modelValue': [value: PerformanceProjectFlowSettings]; 'open-options': []; saved: [project: ProjectSettingsResponse, submitted?: PerformanceProjectFlowSettings]; 'pending-change': [value: boolean] }>()
const savedFlow = ref(cloneSettings(props.savedFlowSettings || props.modelValue))
const baselineFlow = ref(props.baselineFlowSettings ? projectFlowWithLocalTimes(props.baselineFlowSettings) : cloneSettings(props.modelValue))
initializeProjectFlow(props.nodes, baselineFlow.value)
const savedPolicy = ref(props.editingPolicy)
const baseDigest = ref(props.calibrationBaseDigest)
const serverClockOffset = ref(props.editingPolicy ? Date.parse(props.editingPolicy.server_now) - Date.now() : 0)
const clock = ref(Date.now())
const clockTimer = setInterval(() => { clock.value = Date.now() }, 1000)
const deletion = ref<{ node: PerformanceWorkflowNode; phaseIndex: number; ruleIndex?: number } | null>(null)
const deleteSaving = ref(false)
const deleteError = ref('')
const notifyCalibrators = ref(false)
const deleteOpen = computed({ get: () => Boolean(deletion.value), set: value => { if (!value && !deleteSaving.value) deletion.value = null } })
const draft = ref<PerformanceProjectFlowSettings>(cloneSettings(props.modelValue))
const lastEmitted = ref(JSON.stringify(draft.value))
const ruleEditor = ref<RuleEditorState | null>(null)
const calibrationSaving = ref(false)
const calibrationSaveError = ref('')
const drawerOpen = computed({ get: () => Boolean(ruleEditor.value), set: value => { if (!value && !calibrationSaving.value) ruleEditor.value = null } })
const inviteDrawerNode = ref<PerformanceWorkflowNode | null>(null)
const distributionEditor = ref<{ node: PerformanceWorkflowNode; ruleIndex: number | null; rule: PerformanceDistributionRule | null } | null>(null)
const distributionDrawerOpen = computed({ get: () => Boolean(distributionEditor.value), set: value => { if (!value) distributionEditor.value = null } })
const distributionModeOptions = [
  { value: 'UNIFIED', label: '统一配置规则' },
  { value: 'BY_CALIBRATION_SCOPE', label: '按校准范围配置规则', description: '按校准范围分别配置分布规则' },
]
const distributionAssessmentOptions = computed(() => props.distributionAssessmentOptions)
const distributionUsedAssessmentIds = computed(() => distributionEditor.value ? distributionSettings(distributionEditor.value.node).rules.map(rule => rule.assessment_item_id) : [])
const inviteSaving = ref(false)
const flowSaving = computed(() => calibrationSaving.value || deleteSaving.value || inviteSaving.value)
const phaseSaveError = ref('')
const inviteSaveError = ref('')
const inviteDrawerOpen = computed({ get: () => Boolean(inviteDrawerNode.value), set: value => { if (!value) inviteDrawerNode.value = null } })
const REVIEWER_360_SETTINGS_HINT = '「360°评估人设置」在首个 360° 环节设置，对所有 360° 环节生效'
const descriptions: Record<string, string> = {
  calibration: '校准人可按校准范围查看和修改最终绩效结果（不受汇报线限制）',
}
const first360NodeKey = computed(() => {
  const node = props.nodes.find(isReviewer360Node)
  return node ? nodeKey(node) : null
})
const peopleOptions = computed(() => props.peopleOptions)
const reconsiderationPeopleOptions = computed(() => {
  const selected = props.nodes.flatMap(node => {
    const settings = draft.value.node_settings[nodeKey(node)]?.result_reconsideration
    return (settings?.handler_employee_nos || []).map(employeeNo => ({ value: employeeNo, label: employeeNo }))
  })
  return Array.from(new Map([...props.peopleOptions, ...selected].map(option => [option.value, option])).values())
})

function is360SettingsNode(node: PerformanceWorkflowNode) { return first360NodeKey.value !== null && nodeKey(node) === first360NodeKey.value }
function cloneSettings(value?: PerformanceProjectFlowSettings): PerformanceProjectFlowSettings {
  return JSON.parse(JSON.stringify(value || { node_settings: {}, node_times: {} }))
}
function nodeKey(node: PerformanceWorkflowNode) { return node.node_id || `${node.node_type}-${node.order}` }
function savedPhases(node: PerformanceWorkflowNode) { return baselineFlow.value.node_settings[nodeKey(node)]?.calibration?.phases || [] }
function existingPhase(node: PerformanceWorkflowNode, index: number) {
  const phase = calibrationSettings(node).phases[index]
  return phase && savedPhases(node).some((item, oldIndex) => calibrationPhaseKey(item, oldIndex) === calibrationPhaseKey(phase, index))
}
function existingRule(node: PerformanceWorkflowNode, phaseIndex: number, ruleIndex: number) {
  if (!existingPhase(node, phaseIndex)) return false
  const rule = calibrationSettings(node).phases[phaseIndex].rules[ruleIndex] as PerformanceProjectFlowRule & { rule_id?: string }
  const oldPhase = savedPhases(node).find((phase, index) => calibrationPhaseKey(phase, index) === calibrationPhaseKey(calibrationSettings(node).phases[phaseIndex], phaseIndex))
  return rule.rule_id ? oldPhase?.rules.some(item => (item as typeof rule).rule_id === rule.rule_id) : Boolean(oldPhase?.rules[ruleIndex])
}
function ruleLocked(node: PerformanceWorkflowNode, phaseIndex: number, ruleIndex: number) {
  return existingRule(node, phaseIndex, ruleIndex) && !(savedPolicy.value?.calibration_nodes[nodeKey(node)]?.can_edit_rule_content ?? props.projectStatus !== 'STARTED')
}
function distributionReason(node: PerformanceWorkflowNode) {
  const policy = savedPolicy.value?.calibration_nodes[nodeKey(node)]
  if (policy?.can_edit_distribution === false) return policy.distribution_disabled_reason || '校准阶段已开始，无法修改分布规则'
  const phases = savedPhases(node)
  const time = savedFlow.value.node_times[nodeKey(node)]
  const now = clock.value + serverClockOffset.value
  if (phases.some((phase, index) => {
    const start = time?.phase_times?.[calibrationPhaseKey(phase, index)]?.start_at || (index === 0 ? time?.start_at : undefined)
    const timestamp = calibrationSavedTimestamp(start)
    return Number.isFinite(timestamp) ? now >= timestamp : props.projectStatus === 'STARTED'
  })) return '校准阶段已开始，无法修改分布规则'
  return ''
}
function phaseDeleteReason(node: PerformanceWorkflowNode, index: number) {
  if (calibrationSettings(node).phases.length <= 1) return '至少保留一个校准阶段'
  if (!existingPhase(node, index) || !props.projectId && !props.editingPolicy) return ''
  const phaseId = calibrationPhaseKey(calibrationSettings(node).phases[index], index)
  const policy = savedPolicy.value?.calibration_nodes[nodeKey(node)]?.phases[phaseId]
  if (policy?.can_delete === false) return policy.delete_disabled_reason || '阶段已截止，请先延期并保存后再删除'
  const time = savedFlow.value.node_times[nodeKey(node)]
  const oldIndex = savedPhases(node).findIndex((phase, i) => calibrationPhaseKey(phase, i) === phaseId)
  const end = time?.phase_times?.[phaseId]?.end_at || (oldIndex === 0 ? time?.end_at : undefined)
  const timestamp = calibrationSavedTimestamp(end)
  return Number.isFinite(timestamp) && clock.value + serverClockOffset.value >= timestamp ? '阶段已截止，请先延期并保存后再删除' : ''
}
function setDistributionEnabled(node: PerformanceWorkflowNode, value: boolean) { if (!distributionReason(node)) calibrationSettings(node).force_distribution_enabled = value }
function setRuleAuthorization(node: PerformanceWorkflowNode, phaseIndex: number, ruleIndex: number, value: boolean) { if (!ruleLocked(node, phaseIndex, ruleIndex)) calibrationSettings(node).phases[phaseIndex].rules[ruleIndex].allow_authorize = value }
const hasPendingPhases = computed(() => calibrationHasNewPhases(baselineFlow.value, draft.value))
function settingsForSave(settings: PerformanceProjectFlowSettings) {
  return cloneSettings(mergeProjectDisplayChanges(savedFlow.value, projectFlowWithUtcTimes(baselineFlow.value), projectFlowWithUtcTimes(settings)))
}
function acceptSaved(project: ProjectSettingsResponse, submitted: PerformanceProjectFlowSettings) {
  savedFlow.value = cloneSettings(project.flow_settings || submitted)
  draft.value = projectFlowWithLocalTimes(savedFlow.value)
  ensureAllNodes()
  baselineFlow.value = cloneSettings(draft.value)
  lastEmitted.value = JSON.stringify(draft.value)
  if (project.calibration_base_digest !== undefined) baseDigest.value = project.calibration_base_digest
  if (project.editing_policy) { savedPolicy.value = project.editing_policy; serverClockOffset.value = Date.parse(project.editing_policy.server_now) - Date.now() }
  emit('update:modelValue', cloneSettings(draft.value))
  emit('saved', { ...project, flow_settings: cloneSettings(savedFlow.value) }, submitted)
}
async function persistFlow(settings: PerformanceProjectFlowSettings, notify = false) {
  const submitted = settingsForSave(settings)
  const patch: ProjectSettingsPatch = { flow_settings: submitted }
  const operations = calibrationOperations(baselineFlow.value, settings)
  if (operations.some(operation => operation.operation === 'add_phase')) throw new Error('请在下一步“起止时间”中填写新增阶段时间，点击“完成”统一保存')
  if (operations.length) patch.calibration_operations = operations
  if (baseDigest.value) patch.calibration_base_digest = baseDigest.value
  if (operations.some(operation => operation.operation.startsWith('delete_'))) patch.notify_calibrators = notify
  const project = await performanceProjectApi.update(props.projectId!, patch) as ProjectSettingsResponse
  acceptSaved(project, submitted)
}
function defaultFor(node: PerformanceWorkflowNode) {
  if (is360SettingsNode(node)) return { invite: { default_invite: 'DIRECT_SUBORDINATES' as const, minimum_invited_count: 5, exclude_default_invite_from_limit: true, recommended_invite: [], allow_voluntary_evaluation: false } }
  if (node.node_type === 'calibration') return { calibration: { force_distribution_enabled: false, distribution: { mode: 'UNIFIED' as const, rules: [], scope_configured: false }, phases: [{ rules: [{ subject_type: 'PERSON' as const, operator: 'INCLUDE' as const, scope: 'PROJECT_ALL' as const, allow_authorize: false }] }] } }
  if (node.node_type === 'result_view') return { result_view: { automatic_enabled: false, manual_enabled: false, automatic_rule: 'PREVIOUS_AND_START' as const } }
  if (node.node_type === 'result_reconsideration') return { result_reconsideration: { handler_employee_nos: [] } }
  return {}
}
function ensureNode(node: PerformanceWorkflowNode) {
  const key = nodeKey(node)
  const defaults = defaultFor(node) as typeof draft.value.node_settings[string]
  if (!draft.value.node_settings[key]) draft.value.node_settings[key] = defaults
  const settings = draft.value.node_settings[key]
  if (is360SettingsNode(node) && !settings.invite) settings.invite = defaults.invite
  if (node.node_type === 'result_view' && !settings.result_view) settings.result_view = defaults.result_view
  if (node.node_type === 'result_reconsideration') {
    if (!settings.result_reconsideration) settings.result_reconsideration = defaults.result_reconsideration
    const reconsideration = settings.result_reconsideration as { handler_employee_nos?: unknown; handler?: unknown }
    if (!Array.isArray(reconsideration.handler_employee_nos)) {
      const legacy = typeof reconsideration.handler === 'string' && reconsideration.handler.trim() ? [reconsideration.handler.trim()] : []
      reconsideration.handler_employee_nos = legacy
    }
    delete reconsideration.handler
  }
  if (node.node_type === 'calibration') {
    const calibration = settings.calibration || defaults.calibration!
    if (!settings.calibration) settings.calibration = calibration
    calibration.distribution ||= { mode: 'UNIFIED', rules: [], scope_configured: false }
    if (!calibration.phases?.length) calibration.phases = defaults.calibration!.phases
    calibration.phases.forEach(phase => { if (!phase.rules?.length) phase.rules = [{ subject_type: 'PERSON', operator: 'INCLUDE', scope: 'PROJECT_ALL', allow_authorize: false }] })
  }
}
function ensureAllNodes() { props.nodes.forEach(ensureNode); ensureCalibrationPhaseIds(draft.value.node_settings); syncCalibrationPhaseTimes(draft.value.node_settings, draft.value.node_times) }
function inviteSettings(node: PerformanceWorkflowNode) { ensureNode(node); return draft.value.node_settings[nodeKey(node)].invite! }
function calibrationSettings(node: PerformanceWorkflowNode) { ensureNode(node); return draft.value.node_settings[nodeKey(node)].calibration! }
function distributionSettings(node: PerformanceWorkflowNode) { const calibration = calibrationSettings(node); return calibration.distribution ||= { mode: 'UNIFIED', rules: [], scope_configured: false } }
function setDistributionMode(node: PerformanceWorkflowNode, value: string) { if (!distributionReason(node)) distributionSettings(node).mode = value as PerformanceDistributionMode }
function openDistributionEditor(node: PerformanceWorkflowNode, ruleIndex: number | null = null) {
  if (distributionReason(node)) return
  const rule = ruleIndex === null ? null : distributionSettings(node).rules[ruleIndex]
  distributionEditor.value = { node, ruleIndex, rule: rule ? JSON.parse(JSON.stringify(rule)) : null }
}
function saveDistributionRule(rule: PerformanceDistributionRule) {
  const editor = distributionEditor.value
  if (!editor || distributionReason(editor.node)) return
  const rules = distributionSettings(editor.node).rules
  if (editor.ruleIndex === null) rules.push(rule)
  else rules.splice(editor.ruleIndex, 1, rule)
  distributionEditor.value = null
}
function removeDistributionRule(node: PerformanceWorkflowNode, index: number) { if (!distributionReason(node)) distributionSettings(node).rules.splice(index, 1) }
function distributionAssessmentOption(id: string) { return props.distributionAssessmentOptions.find(option => option.id === id) }
function distributionAssessmentLabel(id: string) { return distributionAssessmentOption(id)?.label || id }
function distributionGradeCode(assessmentId: string, value: string) {
  const grade = distributionAssessmentOption(assessmentId)?.grade_options.find(option => option.value === value || option.legacy_value === value)
  return grade?.value || value
}
function distributionControlLabel(value: string) { return value === 'HARD' ? '强制' : '建议' }
function distributionOperatorLabel(value?: string) { return { EQ: '等于', LT: '小于', LTE: '小于等于', GT: '大于', GTE: '大于等于' }[value || 'GTE'] }
function distributionUnitLabel(value: string) { return value === 'PERCENT' ? '%' : '人' }
function distributionRoundingLabel(value: PerformanceDistributionRounding) { return { ROUND: '四舍五入', CEIL: '向上取整', FLOOR: '向下取整', NONE: '不强制取整' }[value] }
function resultViewSettings(node: PerformanceWorkflowNode) { ensureNode(node); return draft.value.node_settings[nodeKey(node)].result_view! }
function reconsiderationSettings(node: PerformanceWorkflowNode) { ensureNode(node); return draft.value.node_settings[nodeKey(node)].result_reconsideration! }
function descriptionFor(node: PerformanceWorkflowNode) { return node.description || (is360SettingsNode(node) ? REVIEWER_360_SETTINGS_HINT : descriptions[node.node_type] || '') }
function inviteLabel(value: string) { return value === 'DIRECT_SUBORDINATES' ? '直属下级' : '暂未配置' }
function openInviteDrawer(node: PerformanceWorkflowNode) {
  if (hasPendingPhases.value) { phaseSaveError.value = '请先在“起止时间”中填写新增阶段时间并点击“完成”，或移除未保存的新增阶段'; return }
  inviteSaveError.value = ''; inviteDrawerNode.value = node
}
async function saveInviteSettings(value: NonNullable<PerformanceProjectFlowSettings['node_settings'][string]['invite']>) {
  if (!inviteDrawerNode.value || inviteSaving.value) return
  if (hasPendingPhases.value) { inviteSaveError.value = '请先在“起止时间”中完成新增阶段，或移除未保存的新增阶段'; return }
  const key = nodeKey(inviteDrawerNode.value)
  const activeNode = inviteDrawerNode.value
  inviteSaveError.value = ''
  if (props.projectId && props.projectPayload) {
    inviteSaving.value = true
    try {
      const settings = cloneSettings(draft.value)
      settings.node_settings[key] = { ...settings.node_settings[key], invite: value }
      await persistFlow(settings)
      if (inviteDrawerNode.value !== activeNode) return
    } catch (error: any) {
      inviteSaveError.value = error?.response?.data?.detail || '360°评估人设置保存失败'
      return
    } finally {
      inviteSaving.value = false
    }
  } else {
    draft.value.node_settings[key] = { ...draft.value.node_settings[key], invite: value }
  }
  inviteDrawerNode.value = null
}
function subjectLabel(value: string) { return value === 'PERSON' ? '人员' : value }
function scopeLabel(value: string) { return value === 'PROJECT_ALL' ? '项目全员' : value }
function openRuleEditor(node: PerformanceWorkflowNode, phaseIndex: number, ruleIndex: number | null = null) {
  if (ruleIndex !== null && ruleLocked(node, phaseIndex, ruleIndex)) return
  calibrationSaveError.value = ''
  const rule = ruleIndex === null ? null : calibrationSettings(node).phases[phaseIndex].rules[ruleIndex]
  ruleEditor.value = { open: true, node, phaseIndex, ruleIndex, rule: rule ? JSON.parse(JSON.stringify(rule)) : null }
}
async function saveRuleEditor(rule: PerformanceProjectFlowRule) {
  const editor = ruleEditor.value
  if (!editor || calibrationSaving.value || editor.ruleIndex !== null && ruleLocked(editor.node, editor.phaseIndex, editor.ruleIndex)) return
  const settings = cloneSettings(draft.value)
  const key = nodeKey(editor.node)
  const rules = settings.node_settings[key]?.calibration?.phases[editor.phaseIndex]?.rules
  if (!rules) return
  const next = { ...rule, ...(distributionReason(editor.node) ? { distribution_rules: editor.ruleIndex === null ? [] : rules[editor.ruleIndex].distribution_rules } : {}), rule_id: editor.ruleIndex === null ? createCalibrationRuleId() : rules[editor.ruleIndex].rule_id }
  if (editor.ruleIndex === null) rules.push(next)
  else rules.splice(editor.ruleIndex, 1, next)
  calibrationSaveError.value = ''
  if (hasPendingPhases.value) { draft.value = settings; ruleEditor.value = null; return }
  if (props.projectId && props.projectPayload) {
    calibrationSaving.value = true
    try {
      await persistFlow(settings)
      if (ruleEditor.value !== editor) return
      try { await performanceProjectApi.get(props.projectId!) } catch { /* PATCH response is already the saved baseline. */ }
    } catch (error: any) {
      calibrationSaveError.value = error?.response?.data?.detail?.message || error?.response?.data?.detail || '校准规则保存失败，请重试'
      return
    } finally { calibrationSaving.value = false }
  } else draft.value = settings
  ruleEditor.value = null
}
function setInviteDefault(node: PerformanceWorkflowNode, event: Event) { inviteSettings(node).default_invite = (event.target as HTMLSelectElement).value as 'DIRECT_SUBORDINATES' | 'NONE' }
function setMinimumInviteCount(node: PerformanceWorkflowNode, event: Event) { inviteSettings(node).minimum_invited_count = Number((event.target as HTMLInputElement).value) }
function openDeleteRule(node: PerformanceWorkflowNode, phaseIndex: number, ruleIndex: number) {
  if (calibrationSettings(node).phases[phaseIndex].rules.length <= 1) return
  if (props.projectId && hasPendingPhases.value && existingRule(node, phaseIndex, ruleIndex)) { phaseSaveError.value = '请先在“起止时间”中填写新增阶段时间并点击“完成”，或移除未保存的新增阶段，再删除已有规则'; return }
  deleteError.value = ''; notifyCalibrators.value = false; deletion.value = { node, phaseIndex, ruleIndex }
}
function openDeletePhase(node: PerformanceWorkflowNode, phaseIndex: number) {
  if (phaseDeleteReason(node, phaseIndex)) return
  if (props.projectId && hasPendingPhases.value && existingPhase(node, phaseIndex)) { phaseSaveError.value = '请先在“起止时间”中填写新增阶段时间并点击“完成”，或移除未保存的新增阶段，再删除已有阶段'; return }
  deleteError.value = ''; notifyCalibrators.value = false; deletion.value = { node, phaseIndex }
}
async function confirmDeletion() {
  const target = deletion.value
  if (!target || deleteSaving.value) return
  if (target.ruleIndex === undefined && phaseDeleteReason(target.node, target.phaseIndex)) { deleteError.value = phaseDeleteReason(target.node, target.phaseIndex); return }
  const settings = cloneSettings(draft.value)
  const phases = settings.node_settings[nodeKey(target.node)].calibration!.phases
  if (target.ruleIndex === undefined) phases.splice(target.phaseIndex, 1)
  else { if (phases[target.phaseIndex].rules.length <= 1) return; phases[target.phaseIndex].rules.splice(target.ruleIndex, 1) }
  syncCalibrationPhaseTimes(settings.node_settings, settings.node_times)
  if (!props.projectId || hasPendingPhases.value) { draft.value = settings; deletion.value = null; return }
  deleteSaving.value = true
  try { await persistFlow(settings, notifyCalibrators.value); deletion.value = null }
  catch (error: any) { deleteError.value = error?.response?.data?.detail?.message || error?.response?.data?.detail || '删除保存失败，请重试' }
  finally { deleteSaving.value = false }
}
function addPhase(node: PerformanceWorkflowNode) {
  if (flowSaving.value) return
  phaseSaveError.value = ''
  calibrationSettings(node).phases.push({ phase_id: createCalibrationPhaseId(), rules: [{ rule_id: createCalibrationRuleId(), subject_type: 'PERSON', operator: 'INCLUDE', scope: 'PROJECT_ALL', allow_authorize: false } as PerformanceProjectFlowRule] })
}
function setReconsiderationHandlers(node: PerformanceWorkflowNode, value: string | string[] | null) {
  const values = Array.isArray(value) ? value : value ? [value] : []
  reconsiderationSettings(node).handler_employee_nos = [...new Set(values.filter(Boolean))]
}
function openingInvalid(node: PerformanceWorkflowNode) { const view = resultViewSettings(node); return props.showOpeningError && !view.automatic_enabled && !view.manual_enabled }
function manualOpeningDisabled(node: PerformanceWorkflowNode) {
  if (node.node_type !== 'result_view') return false
  const manualEnabled = resultViewSettings(node).manual_enabled
  if (props.projectId && manualEnabled) return false
  return !props.manualOpeningSettingLoaded || !props.manualResultOpeningEnabled
}
function openingRuleOptions(node: PerformanceWorkflowNode) {
  const previousIndex = props.nodes.findIndex(item => nodeKey(item) === nodeKey(node)) - 1
  const previousName = previousIndex >= 0 ? props.nodes[previousIndex].name : '项目启动'
  return [
    { value: 'PREVIOUS_AND_START', label: `完成${previousName}，且到${node.name}开始时间时开通` },
    { value: 'PREVIOUS_IMMEDIATE', label: `完成${previousName}，立即开通` },
  ]
}
function setOpeningMode(node: PerformanceWorkflowNode, field: 'automatic_enabled' | 'manual_enabled', enabled: boolean) {
  if (field === 'manual_enabled' && enabled && manualOpeningDisabled(node)) return
  resultViewSettings(node)[field] = enabled
}
function setAutomaticRule(node: PerformanceWorkflowNode, value: string) { resultViewSettings(node).automatic_rule = value as 'PREVIOUS_AND_START' | 'PREVIOUS_IMMEDIATE' }
const assignmentStats = ref<Record<string, PerformanceCalibrationAssignment | null>>({})
const assignmentLoading = ref(false)
const assignmentError = ref('')
let assignmentRequest = 0
let assignmentTimer: ReturnType<typeof setTimeout> | undefined
watch(() => JSON.stringify({ projectId: props.projectId, payload: props.projectPayload, settings: draft.value }), () => {
  const request = ++assignmentRequest
  clearTimeout(assignmentTimer)
  assignmentStats.value = {}
  assignmentError.value = ''
  assignmentLoading.value = false
  if (!props.projectId || !props.projectPayload || !props.nodes.some(node => node.node_type === 'calibration')) return
  assignmentLoading.value = true
  assignmentTimer = setTimeout(async () => {
    try {
      const stats = await performanceProjectApi.calibrationPreview(props.projectId!, { ...props.projectPayload!, flow_settings: cloneSettings(draft.value) })
      if (request === assignmentRequest) assignmentStats.value = stats
    } catch {
      if (request === assignmentRequest) assignmentError.value = '校准分配计算失败，请检查规则或重新加载项目'
    } finally {
      if (request === assignmentRequest) assignmentLoading.value = false
    }
  }, 150)
}, { immediate: true })
onBeforeUnmount(() => { assignmentRequest++; clearTimeout(assignmentTimer); clearInterval(clockTimer) })
watch(() => props.savedFlowSettings, value => { if (value) savedFlow.value = cloneSettings(value) }, { deep: true })
watch(() => props.baselineFlowSettings, value => { if (value) { baselineFlow.value = projectFlowWithLocalTimes(value); initializeProjectFlow(props.nodes, baselineFlow.value) } }, { deep: true })
watch(() => props.editingPolicy, value => { savedPolicy.value = value; if (value) serverClockOffset.value = Date.parse(value.server_now) - Date.now() })
watch(() => props.calibrationBaseDigest, value => { baseDigest.value = value })
watch(() => Boolean(ruleEditor.value || deletion.value || inviteDrawerNode.value || distributionEditor.value || flowSaving.value), value => emit('pending-change', value), { immediate: true })
watch(() => props.modelValue, value => { const next = JSON.stringify(value || { node_settings: {}, node_times: {} }); if (next !== lastEmitted.value) { draft.value = cloneSettings(value); ensureAllNodes(); lastEmitted.value = JSON.stringify(draft.value) } }, { deep: true })
watch(() => props.nodes, ensureAllNodes, { deep: true, immediate: true })
watch(draft, value => { ensureCalibrationPhaseIds(value.node_settings); syncCalibrationPhaseTimes(value.node_settings, value.node_times); const next = JSON.stringify(value); if (next === lastEmitted.value) return; lastEmitted.value = next; emit('update:modelValue', cloneSettings(value)) }, { deep: true })
</script>

<style scoped>
.setting-disabled-reason{margin:4px 0;color:var(--color-text-secondary);font-size:14px;line-height:22px}.phase-save-error{color:var(--color-danger);font-size:14px;line-height:22px}
.distribution-settings{display:flex;flex-direction:column;gap:var(--spacing-3);margin-top:var(--spacing-3)}.distribution-settings :deep(.performance-radio-group){gap:var(--spacing-6)!important}.distribution-rule-summary{display:flex;flex-direction:column;align-items:flex-start;gap:var(--spacing-2)}.distribution-rule-summary>strong{font-size:var(--font-size-md);line-height:22px}.distribution-rule-summary__row{display:flex;width:100%;flex-direction:column;gap:var(--spacing-1);margin:var(--spacing-1) 0 var(--spacing-2);padding:var(--spacing-4) var(--spacing-5);box-sizing:border-box;border-radius:var(--radius-sm);background:var(--performance-review-readonly-surface);color:var(--color-text-primary);font-size:var(--font-size-md);line-height:22px}.distribution-rule-card__header{display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--spacing-1)}.distribution-rule-card__actions{display:flex;align-items:center;gap:var(--spacing-3)}.distribution-rule-card__actions :deep(.performance-icon-button){--performance-icon-button-size:20px;padding:2px}.distribution-rule-card__meta{display:flex;align-items:center;gap:var(--spacing-5);margin-bottom:var(--spacing-2)}.distribution-rule-card__label{color:var(--color-text-secondary)}.distribution-rule-card__conditions{display:flex;flex-direction:column}.distribution-rule-card__condition{display:flex;align-items:center;gap:var(--spacing-2)}.distribution-rule-card__rounding{display:flex;flex-direction:column;gap:var(--spacing-1);margin-top:var(--spacing-3)}.distribution-add-rule{margin-top:0}.distribution-scope-placeholder{padding:var(--spacing-3);border:1px dashed var(--color-line-control);border-radius:var(--radius-md);color:var(--color-text-secondary);font-size:var(--font-size-md);line-height:22px}.calibration-distribution-heading{display:flex;align-items:center;gap:var(--spacing-2)}.calibration-distribution-heading strong{font-size:var(--font-size-md);line-height:22px}.calibration-distribution-help{margin:var(--spacing-1) 0 0;color:var(--color-text-secondary);font-size:var(--font-size-md);line-height:22px}.calibration-heading h3{display:flex;align-items:center;gap:var(--spacing-1)}
.result-view-choices--error :deep(.ud__checkbox__wallpaper){border-color:var(--performance-field-error-color)}
.result-view-choices .performance-radio-group{display:flex;margin:8px 0 12px 24px;max-width:100%}
.result-view-choices :deep(.performance-radio-option){height:auto;min-height:22px;white-space:normal}
.result-view-choices :deep(.radio-label){white-space:normal}
.result-view-error{margin:4px 0;color:var(--performance-field-error-color);font-size:var(--font-size-md)}
.project-flow-settings{display:grid;width:100%;gap:16px}.flow-state{padding:32px;color:#646a73;text-align:center}.flow-state--error{color:#f04438}.flow-node-card{width:100%;box-sizing:border-box;padding:24px 32px;border-radius:8px;background:#fff;box-shadow:0 1px 4px rgba(31,35,41,.05)}.flow-node-header{display:flex;align-items:flex-start;gap:12px}.flow-node-icon{display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:8px;background:#f5f6f7;color:#3370ff}.flow-node-icon :deep(.stage-icon){width:24px;height:24px}.flow-node-heading{min-width:0;padding-top:3px}.flow-node-heading h2{margin:0;color:#1f2329;font-size:16px;line-height:24px}.flow-node-heading p{margin:4px 0 0;color:#646a73;font-size:14px;line-height:22px}.node-settings{margin:20px 0 0 52px}.settings-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}.settings-heading h3,.node-settings h3{margin:0;color:#1f2329;font-size:14px;line-height:22px}.settings-heading p,.calibration-distribution-help,.setting-help{margin:4px 0 0;color:#646a73;font-size:14px;line-height:22px}.outline-button{height:32px;padding:4px 20px;border:1px solid #d0d3d6;border-radius:6px;background:#fff;color:#1f2329;font:inherit;cursor:pointer}.invite-grid{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:16px;padding:16px;border-radius:8px;background:#f5f6f7}.invite-summary{display:flex;flex-direction:column;gap:8px;margin-top:16px;padding:12px 16px;border-radius:6px;background:#f5f6f7}.invite-summary div{display:flex;align-items:center;justify-content:space-between;gap:16px}.invite-summary span{color:#646a73}.invite-summary strong{color:#1f2329;font-weight:400}.invite-column{min-width:0}.field-label{display:block;margin:0 0 8px;color:#646a73;font-size:14px;line-height:22px}.invite-count-label{margin-top:18px}.field-control{width:100%;height:32px;padding:4px 10px;border:1px solid #d0d3d6;border-radius:6px;background:#fff;color:#1f2329;font:inherit}.setting-value{margin:0;color:#1f2329;font-size:14px;line-height:22px}.number-field{display:flex;align-items:center;gap:8px;color:#646a73;font-size:14px;line-height:32px}.number-field input{width:72px;height:32px;padding:4px 8px;box-sizing:border-box;border:1px solid #d0d3d6;border-radius:6px;background:#fff;font:inherit}.check-line{display:block;margin-top:8px}.calibration-heading{margin-top:20px}.required-mark{color:#f04438}.info-mark,.info-circle{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:#3370ff;color:#fff;font-size:11px;font-style:normal}.info-mark{margin-left:4px}.calibration-summary{display:flex;align-items:center;gap:8px;margin-top:12px;padding:12px 16px;border-radius:6px;background:#f0f4ff;color:#1f2329;font-size:14px;line-height:22px}.calibration-summary .link-button{margin-left:auto}.link-button,.text-button{padding:0;border:0;background:transparent;color:#3370ff;font:inherit;cursor:pointer}.calibration-phase{margin-top:20px}.phase-heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}.phase-heading :deep(.performance-icon-button){--performance-icon-button-size:24px;width:24px;height:24px}.phase-title{color:#1f2329;font-size:14px;line-height:22px}.rule-table{padding:0 16px;border-radius:8px;background:#f5f6f7}.rule-table-header{display:grid;grid-template-columns:140px minmax(180px,1fr) 140px 72px;align-items:center;gap:8px;min-height:47px;border-bottom:1px solid #dee0e3;color:#646a73;font-size:14px;line-height:22px}.rule-row{display:grid;grid-template-columns:140px minmax(180px,1fr) 140px 72px;align-items:center;gap:8px;min-height:52px;border-bottom:1px solid #dee0e3}.rule-row select{height:32px;padding:4px 8px;border:1px solid #d0d3d6;border-radius:6px;background:#fff;font:inherit}.scope-editor{display:grid;grid-template-columns:120px minmax(120px,1fr);gap:8px}.rule-person{display:flex;align-items:center;gap:8px;min-width:0}.rule-tag,.rule-scope-tag{display:inline-flex;align-items:center;min-height:24px;padding:1px 6px;border-radius:4px;background:#e5e6e8;color:#1f2329;white-space:nowrap}.rule-person>span:last-child{overflow:hidden;color:#1f2329;text-overflow:ellipsis;white-space:nowrap}.rule-scope-tag{width:max-content}.rule-actions{display:flex;gap:8px;white-space:nowrap}.text-button{padding:0;border:0;background:transparent;color:#3370ff;font:inherit;cursor:pointer}.add-rule{display:block;margin-top:12px}.add-phase{margin-top:12px}.result-view-settings h3{margin-bottom:12px}.result-view-settings :deep(.performance-checkbox){margin:8px 0}.setting-help{max-width:720px}.reconsideration-settings{max-width:520px}.reconsideration-settings h3{margin-bottom:12px}
@media (max-width:800px){.flow-node-card{padding:20px}.node-settings{margin-left:0}.invite-grid{grid-template-columns:1fr}.rule-row{grid-template-columns:1fr 1fr;}.rule-delegation{display:none}}
</style>
