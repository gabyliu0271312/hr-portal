<template>
  <div class="workflow-page">
    <div v-if="usageSummary.cycle_count > 0" class="usage-banner">
      <span class="banner-icon" aria-hidden="true">i</span>
      <div class="banner-copy"><a>{{ usageSummary.cycle_count }} 个周期的项目</a></div>
      <button class="banner-close" type="button" aria-label="关闭提示" @click="bannerVisible = false">×</button>
    </div>
    <div class="workflow-body" :class="{ 'with-banner': bannerVisible && usageSummary.cycle_count > 0 }">
      <section ref="workflowCanvas" class="workflow-canvas" aria-label="评估流程模板" @scroll.passive="updatePopoverPosition">
        <button class="template-entry" type="button">▣&nbsp;评估流程模板</button>
        <div class="flow-stack">
          <div class="system-node">项目启动</div>
          <button class="flow-connector" :class="{ open: popoverIndex === 0 }" type="button" @mouseenter="showPopover(0, $event)" @mouseleave="schedulePopoverClose" @focus="showPopover(0, $event)" @blur="schedulePopoverClose" @click="showPopover(0, $event)"><span class="flow-line"></span><span class="add-circle">+</span><span class="flow-line"></span><span class="triangle"></span></button>
          <template v-for="(node, index) in businessNodes" :key="node.node_id">
            <div class="stage-node" :class="{ selected: selectedId === node.node_id }" role="button" tabindex="0" @click="selectNode(node.node_id)" @keydown.enter="selectNode(node.node_id)" @keydown.space.prevent="selectNode(node.node_id)">
              <span class="node-title-row">
                <span class="node-icon" aria-hidden="true"><PerformanceWorkflowStageIcon :type="node.node_type" /></span>
                <span class="node-title">{{ node.name }}</span>
              </span>
              <span class="node-executor">执行人：{{ node.executor_label }}</span>
              <button v-if="canDeleteNode(node)" class="delete-node" type="button" :aria-label="`删除${node.name}`" @click.stop="removeNode(node.node_id)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M8 4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2h5a1 1 0 1 1 0 2h-1v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6H3a1 1 0 0 1 0-2h5ZM6 6v14h12V6H6Zm4 3a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0v-6a1 1 0 0 1 1-1Zm4 0a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0v-6a1 1 0 0 1 1-1Z" fill="currentColor" /></svg></button>
            </div>
            <button v-if="canAddAtConnector(index + 1)" class="flow-connector" :class="{ open: popoverIndex === index + 1 }" type="button" @mouseenter="showPopover(index + 1, $event)" @mouseleave="schedulePopoverClose" @focus="showPopover(index + 1, $event)" @blur="schedulePopoverClose" @click="showPopover(index + 1, $event)"><span class="flow-line"></span><span class="add-circle">+</span><span class="flow-line"></span><span class="triangle"></span></button>
            <div v-else class="flow-connector flow-connector--passive" aria-hidden="true"><span class="flow-line"></span><span class="triangle"></span></div>
          </template>
          <div class="system-node">项目结束</div>
        </div>
      </section>
      <aside class="config-panel">
        <template v-if="selectedNode">
          <div class="panel-title">{{ standardNodeLabel(selectedNode.node_type) }}</div>
          <div class="panel-scroll">
            <div class="panel-form">
              <WorkflowNodeBasicFields :node="selectedNode" :locked="locked" />
              <div class="form-row">
                <div class="form-label"><span>环节名称</span><span class="required-mark">*</span></div>
                <input v-model="selectedNode.name" class="form-control" :disabled="locked('name')" />
              </div>
              <div class="form-row">
                <div class="form-label">环节描述</div>
                <textarea v-model="selectedNode.description" class="form-control form-textarea" :disabled="locked('description')" />
              </div>
              <PerformanceMultiExecutorField
                v-if="selectedNode.node_type === 'result_reconsideration'"
                :model-value="resultReconsiderationExecutorConfig"
                :disabled="locked('executor_config')"
                :people-options="specifiedPeopleOptions"
                :error="resultExecutorError"
                @update:model-value="updateResultExecutorConfig"
              />
              <div v-if="selectedNode.node_type === 'result_reconsideration'" class="appeal-prompt-setting">
                <div class="appeal-prompt-header">
                  <div class="appeal-prompt-label"><h4>发起复议提示</h4></div>
                  <button ref="appealPreviewButton" class="appeal-preview-button" type="button" @mouseenter="scheduleAppealPreview" @mouseleave="hideAppealPreview" @focus="showAppealPreview" @blur="hideAppealPreview">预览</button>
                </div>
                <div class="appeal-prompt-control">
                  <div class="appeal-prompt-help">此提示内容将在被评估人填写复议理由时展示</div>
                <button class="appeal-prompt-edit" type="button" :disabled="locked('appeal_prompt_content')" @click="openAppealPromptEditor">
                  <span class="appeal-edit-icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="m17.57 7.244-.006-.006.37-.37a1 1 0 0 0 .001-1.412l-3.434-3.453-.002-.002a1 1 0 0 0-1.414 0l-.705.706.01.01L2 13.186V17a1 1 0 0 0 1 1h3.814L17.57 7.244Zm-3.273.389-2.015-2.015 1.487-1.515 2.023 2.034-1.495 1.496Zm-3.415-.587 2.002 2.002-6.913 6.92h-.004l-1.934-1.935v-.003l6.849-6.984ZM3 20a1 1 0 1 0 0 2h18a1 1 0 0 0 0-2H3Z" fill="currentColor" /></svg></span>编辑
                </button>
                </div>
              </div>
              <WorkflowFixedExecutorField
                v-if="fixedExecutorOptionByNodeType[selectedNode.node_type]"
                :executor="fixedExecutorOptionByNodeType[selectedNode.node_type]"
              />
              <PerformanceSwitchSettingRow
                v-if="selectedNode.node_type === 'result_view'"
                class="subject-confirm-setting"
                :model-value="Boolean(selectedNode.subject_confirm_required)"
                label="需要被评估人确认绩效结果"
                :disabled="locked('subject_confirm_required')"
                @update:model-value="updateSubjectConfirmation"
              />
              <div v-if="selectedNode.node_type === 'calibration'" class="calibration-reason-setting">
                <PerformanceSwitchSettingRow
                  class="calibration-reason-setting__title"
                  :model-value="Boolean(selectedNode.calibration_reason_enabled)"
                  label="填写调整原因"
                  :disabled="locked('calibration_reason_enabled')"
                  @update:model-value="updateCalibrationReasonEnabled"
                />
                <div class="calibration-reason-setting__help">在校准时调整评分或评级结果，需填写原因</div>
                <PerformanceCheckbox
                  v-if="selectedNode.calibration_reason_enabled"
                  class="calibration-reason-setting__required"
                  :model-value="Boolean(selectedNode.calibration_reason_required)"
                  label="必填"
                  :disabled="locked('calibration_reason_required')"
                  @update:model-value="selectedNode.calibration_reason_required = $event"
                />
              </div>
              <div v-if="selectedNode.node_type === 'reviewer_360_invite' && selectedNodeHasPrevious" class="previous-node-setting">
                <PerformanceSwitchSettingRow
                  v-model="selectedNode.require_previous_node_completion"
                  label="设置执行人需完成上一环节任务"
                  :info="previousNodeCompletionInfo"
                  info-color="#3370ff"
                  :disabled="locked('require_previous_node_completion')"
                />
              </div>
              <WorkflowExecutorField
                v-if="selectableExecutorNodeTypes.includes(selectedNode.node_type)"
                v-model="selectedExecutorMode"
                v-model:executor-types="selectedNode.executor_types"
                :options="selectedExecutorModeOptions"
                :manager-level-options="selectedManagerLevelOptions"
                :mode-disabled="locked('executor_label')"
                :types-disabled="locked('executor_types')"
              />
              <template v-if="selectedNode.node_type === 'evaluation'">
                <div class="form-row evaluation-type-row">
                  <h4 class="font-medium">评估类型</h4>
                  <div class="ud__radio-group">
                    <label v-for="option in evaluationTypeOptions" :key="option.value" class="ud__radio__wrapper" :class="{ 'ud__radio__wrapper--checked': selectedNode.evaluation_type === option.value, 'ud__radio__wrapper--disable': evaluationTypeDisabled }">
                      <span class="ud__radio">
                        <input v-model="selectedNode.evaluation_type" class="ud__radio__input" type="radio" :value="option.value" :disabled="evaluationTypeDisabled" />
                        <span class="ud__radio__wallpaper" />
                        <span class="ud__radio__checked-ink" />
                      </span>
                      <span class="ud__radio__label-content">
                        <span class="radio-label-inner"><span>{{ option.label }}</span><span class="radio-info-icon" aria-hidden="true"><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" data-icon="InfoOutlined"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 2C5.925 23 1 18.075 1 12S5.925 1 12 1s11 4.925 11 11-4.925 11-11 11Zm-1-7.5v-4a1 1 0 1 1 0-2h1.004c.55 0 .998.445.998.996.003 1.668-.002 3.336-.002 5.004h.5a1 1 0 1 1 0 2h-3a1 1 0 1 1 0-2h.5Zm1-7a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" fill="currentColor" /></svg></span></span>
                      </span>
                    </label>
                  </div>
                </div>
                <div v-if="selectedExecutorMode === '360°评估人'" class="invite-executor-setting">
                  <PerformanceSwitchSettingRow
                    class="invite-executor-title-row"
                    v-model="selectedNode.allow_invite_other_executors"
                    label="允许邀请其他评估环节执行人"
                    :info="inviteInfoLines"
                    :info-delay="138"
                    :disabled="locked('allow_invite_other_executors')"
                  />
                  <div v-if="selectedNode.allow_invite_other_executors" class="invite-scope-panel" :class="{ 'invite-scope-panel--error': inviteValidationNodeId === selectedNode.node_id }">
                    <div class="invite-scope-heading">选择允许邀请的执行人角色</div>
                    <div class="invite-scope-radio-group">
                      <label v-for="option in inviteScopeOptions" :key="option.value" class="ud__radio__wrapper" :class="{ 'ud__radio__wrapper--checked': selectedNode.invite_executor_scope === option.value }">
                        <span class="ud__radio">
                          <input v-model="selectedNode.invite_executor_scope" class="ud__radio__input" type="radio" :value="option.value" :disabled="locked('invite_executor_scope')" />
                          <span class="ud__radio__wallpaper" />
                          <span class="ud__radio__checked-ink" />
                        </span>
                        <span class="ud__radio__label-content">{{ option.label }}</span>
                      </label>
                    </div>
                    <div v-if="selectedNode.invite_executor_scope === 'PARTIAL'" class="invite-role-control">
                      <PerformanceRoleMultiSelect v-model="selectedNode.invite_executor_types" :options="inviteExecutorOptions" :disabled="locked('invite_executor_types')" :aria-invalid="inviteValidationNodeId === selectedNode.node_id" />
                      <span v-if="inviteValidationNodeId === selectedNode.node_id" class="invite-role-error">请选择允许邀请的执行人角色</span>
                    </div>
                  </div>
                </div>
                <div class="final-result-setting">
                  <div class="final-result-row">
                    <span class="final-result-label">设置此环节绩效结果为最终结果</span>
                    <div ref="finalResultSwitchAnchor" class="final-result-switch-anchor" :tabindex="isFinalResultRestricted ? 0 : -1" @mouseenter="scheduleFinalResultTooltip" @mouseleave="hideFinalResultTooltip" @focusin="scheduleFinalResultTooltip" @focusout="hideFinalResultTooltip">
                      <PerformanceSwitch v-model="selectedNode.include_final_result" :disabled="finalResultDisabled" aria-label="设置此环节绩效结果为最终结果" :aria-describedby="isFinalResultRestricted ? 'restricted-final-result-tooltip' : undefined" />
                    </div>
                  </div>
                  <div v-if="selectedNode.include_final_result" class="final-result-help">设置了最终绩效结果的环节必须在评估内容中添加评估型问题</div>
                </div>
                <Teleport to="body">
                  <div v-if="isFinalResultRestricted && finalResultTooltipVisible" id="restricted-final-result-tooltip" class="final-result-tooltip-popover" role="tooltip" :style="finalResultTooltipStyle">
                    <div class="final-result-tooltip-content">{{ finalResultRestrictionMessage }}</div>
                    <div class="final-result-tooltip-arrow"><svg width="16" height="8" viewBox="0 0 16 8" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8-.5H0v1c1.553 0 3.033.664 4.065 1.825l2.814 3.166a1.5 1.5 0 002.242 0l2.814-3.166A5.438 5.438 0 0116 .5v-1H8z" /></svg></div>
                  </div>
                </Teleport>
              </template>
            </div>
          </div>
        </template>
        <div v-else class="empty-panel">没有选中任何环节</div>
      </aside>
    </div>
    <Teleport to="body">
      <div v-if="appealPreviewVisible" class="appeal-preview-popover" role="dialog" aria-label="发起复议预览" :style="appealPreviewStyle" @mouseenter="cancelAppealPreviewHide" @mouseleave="hideAppealPreview">
        <div class="appeal-preview-relative">
          <div class="appeal-preview-overlay" aria-hidden="true"></div>
          <div class="appeal-preview-modal">
            <div class="appeal-preview-header">
              <div class="appeal-preview-title">发起复议</div>
              <div class="appeal-preview-description">确定发起复议后，{{ appealExecutorDescription }}会收到通知并负责跟进</div>
            </div>
            <div class="appeal-preview-body">
              <div class="appeal-preview-notice">
                <span class="appeal-preview-notice-icon" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M13 7.5a1 1 0 1 0-2 0 1 1 0 0 0 2 0Zm-2 4v4h-.5a1 1 0 1 0 0 2h3a1 1 0 1 0 0-2H13c0-.667 0-1.333.002-2 0-1.001.002-2.002 0-3.004a.998.998 0 0 0-.998-.996H11a1 1 0 1 0 0 2Z" fill="#fff" /></svg></span>
                <div class="appeal-preview-notice-main">{{ selectedNode?.appeal_prompt_content || DEFAULT_APPEAL_PROMPT }}</div>
              </div>
              <div class="appeal-preview-textarea">
                <textarea placeholder="请输入复议理由" readonly aria-label="复议理由" />
                <span class="appeal-preview-textarea-suffix" aria-hidden="true"></span>
              </div>
            </div>
            <div class="appeal-preview-footer"><div class="appeal-preview-actions"><button type="button">确定</button><button type="button">取消</button></div></div>
          </div>
        </div>
      </div>
    </Teleport>
    <Teleport to="body">
      <div v-if="appealPromptEditorOpen" class="appeal-modal-mask" @click.self="closeAppealPromptEditor">
        <section class="appeal-modal" role="dialog" aria-modal="true" aria-labelledby="appeal-modal-title">
          <header class="appeal-modal-header"><div id="appeal-modal-title">发起复议提示</div><button class="appeal-modal-close" type="button" aria-label="关闭" @click="closeAppealPromptEditor">×</button></header>
          <div class="appeal-modal-body">
            <PerformanceCountedTextarea v-model="appealPromptDraft" label="提示文案" input-id="appeal-prompt-input" :max-length="1500" required />
            <PerformanceCountedTextarea v-model="appealReasonInstructionDraft" label="填写说明" input-id="appeal-reason-instruction-input" :max-length="1000" required />
          </div>
          <footer class="appeal-modal-footer"><button class="appeal-button appeal-button--primary" type="button" @click="saveAppealPrompt">保存</button><button class="appeal-button" type="button" @click="closeAppealPromptEditor">取消</button></footer>
        </section>
      </div>
    </Teleport>
    <Teleport to="body">
      <div v-if="popoverIndex !== null" ref="stagePopover" class="stage-popover" :style="popoverPositionStyle" @mouseenter="cancelPopoverClose" @mouseleave="schedulePopoverClose">
        <svg class="popover-arrow" :style="{ top: `${popoverArrowCenter}px` }" width="8" height="16" viewBox="0 0 8 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M-.5 8v8h1c0-1.553.664-3.033 1.825-4.065l3.166-2.814a1.5 1.5 0 000-2.242L2.325 4.065A5.438 5.438 0 01.5 0h-1v8z" /></svg>
        <div class="stage-popover-content">
          <div class="popover-title">可添加环节</div>
          <button v-for="option in availableAddableOptions" :key="option.type" class="popover-stage" type="button" @click="addNode(option.type)"><span class="popover-icon" aria-hidden="true"><PerformanceWorkflowStageIcon :type="option.type" /></span>{{ option.label }}</button>
        </div>
      </div>
    </Teleport>
    <div v-if="saving" class="save-state">保存中…</div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { performanceTemplateApi, type PerformanceWorkflowNode } from '@/api/performance'
import PerformanceCheckbox from '@/components/performance/PerformanceCheckbox.vue'
import PerformanceCountedTextarea from '@/components/performance/PerformanceCountedTextarea.vue'
import PerformanceSwitch from '@/components/performance/PerformanceSwitch.vue'
import PerformanceSwitchSettingRow from '@/components/performance/PerformanceSwitchSettingRow.vue'
import WorkflowFixedExecutorField from '@/components/performance/WorkflowFixedExecutorField.vue'
import WorkflowExecutorField from '@/components/performance/WorkflowExecutorField.vue'
import PerformanceMultiExecutorField from '@/components/performance/PerformanceMultiExecutorField.vue'
import WorkflowNodeBasicFields from '@/components/performance/WorkflowNodeBasicFields.vue'
import {
  PERFORMANCE_EXECUTOR_OPTIONS,
  REAL_LINE_MANAGER_LEVEL_OPTIONS,
  RESULT_COMMUNICATION_EXECUTOR_OPTIONS,
  REVIEWER_360_CONFIRM_MANAGER_LEVEL_OPTIONS,
  CALIBRATION_EXECUTOR_OPTION,
  SUBJECT_EXECUTOR_OPTION,
} from '@/components/performance/performanceExecutorOptions'
import type { PerformanceExecutorOption } from '@/components/performance/performanceExecutorOptions'
import type { PerformanceExecutorConfig, PerformanceExecutorPerson } from '@/api/performance'
import PerformanceRoleMultiSelect from '@/components/performance/PerformanceRoleMultiSelect.vue'
import PerformanceWorkflowStageIcon from './PerformanceWorkflowStageIcon.vue'

const props = defineProps<{ templateId?: number | null }>()
const emit = defineEmits<{ (e: 'back'): void; (e: 'next'): void }>()
const saving = ref(false)
const bannerVisible = ref(true)
const popoverIndex = ref<number | null>(null)
const workflowCanvas = ref<HTMLElement | null>(null)
const stagePopover = ref<HTMLElement | null>(null)
const popoverArrowCenter = ref(16)
const popoverPositionStyle = ref<Record<string, string>>({ transform: 'translate3d(0, 0, 0)', visibility: 'hidden' })
let activeConnector: HTMLElement | null = null
let popoverResizeObserver: ResizeObserver | null = null
let popoverCloseTimer: ReturnType<typeof setTimeout> | null = null
const selectedId = ref<string | null>(null)
const usageSummary = ref({ cycle_count: 0, project_count: 0 })
const finalResultSwitchAnchor = ref<HTMLElement | null>(null)
const finalResultTooltipVisible = ref(false)
const finalResultTooltipStyle = ref<Record<string, string>>({})
let finalResultTooltipTimer: ReturnType<typeof setTimeout> | null = null
const inviteValidationNodeId = ref<string | null>(null)
const appealPromptEditorOpen = ref(false)
const appealPromptDraft = ref('')
const appealReasonInstructionDraft = ref('')
const appealPreviewButton = ref<HTMLElement | null>(null)
const appealPreviewVisible = ref(false)
const appealPreviewStyle = ref<Record<string, string>>({})
let appealPreviewTimer: ReturnType<typeof setTimeout> | null = null
let appealPreviewHideTimer: ReturnType<typeof setTimeout> | null = null
const DEFAULT_APPEAL_PROMPT = '如果你不认可本次绩效结果，请详细说明复议原因并提供事实依据'
const DEFAULT_APPEAL_REASON_INSTRUCTION = '请输入复议理由'
const executorLevelLabel: Record<string, string> = {
  DIRECT_MANAGER: '直属上级', LEVEL_1_MANAGER: '隔 1 级上级', CURRENT_DEPARTMENT: '所属部门负责人',
  PARENT_DEPARTMENT: '隔级部门负责人', LEVEL_1_DEPARTMENT: '所属一级部门负责人',
}
const appealExecutorDescription = computed(() => {
  const roles = selectedNode.value?.executor_config?.roles || [{ type: 'HRBP' as const }]
  const labels = roles.flatMap((role) => {
    if (role.type === 'HRBP') return ['HRBP']
    if (role.type === 'SPECIFIED_PERSON') return role.people.map((person) => person.display_name)
    return role.levels.map((level) => executorLevelLabel[level] || level)
  }).filter(Boolean)
  return labels.length ? labels.join('、') : 'HRBP'
})
const businessNodes = ref<PerformanceWorkflowNode[]>([
  { node_id: 'evaluation-1', node_type: 'evaluation', name: '评估型环节', description: '', order: 1, executor_types: ['DIRECT_MANAGER'], executor_label: '实线上级', evaluation_type: 'SINGLE', include_final_result: false, system: false, allow_invite_other_executors: false, invite_executor_scope: 'ALL', invite_executor_types: [], require_previous_node_completion: false },
  { node_id: 'result-view-1', node_type: 'result_view', name: '绩效结果查看环节', description: '', order: 2, executor_types: ['SUBJECT'], executor_label: '被评估人', evaluation_type: null, include_final_result: false, system: true, allow_invite_other_executors: false, invite_executor_scope: 'ALL', invite_executor_types: [], require_previous_node_completion: false, subject_confirm_required: false },
])
const selectedNode = computed(() => businessNodes.value.find((node) => node.node_id === selectedId.value))
const specifiedPeopleOptions = ref<PerformanceExecutorPerson[]>([])
const resultExecutorError = ref('')
const resultReconsiderationExecutorConfig = computed<PerformanceExecutorConfig>({
  get: () => selectedNode.value?.executor_config || { mode: 'MULTI_ROLE', roles: [{ type: 'HRBP' }] },
  set: (value) => updateResultExecutorConfig(value),
})
function updateResultExecutorConfig(value: PerformanceExecutorConfig) {
  if (!selectedNode.value || selectedNode.value.node_type !== 'result_reconsideration') return
  selectedNode.value.executor_config = value
  selectedNode.value.executor_types = value.roles.flatMap((role) => role.type === 'REAL_LINE_MANAGER' || role.type === 'DEPARTMENT_HEAD' ? role.levels : role.type === 'HRBP' ? ['HRBP'] : ['SPECIFIED_PERSON'])
  selectedNode.value.executor_label = value.roles.map((role) => ({ REAL_LINE_MANAGER: '实线上级', HRBP: 'HRBP', DEPARTMENT_HEAD: '部门负责人', SPECIFIED_PERSON: '指定人员' }[role.type])).join('、')
  resultExecutorError.value = ''
}
function openAppealPromptEditor() {
  if (!selectedNode.value || selectedNode.value.node_type !== 'result_reconsideration') return
  appealPromptDraft.value = selectedNode.value.appeal_prompt_content || DEFAULT_APPEAL_PROMPT
  appealReasonInstructionDraft.value = selectedNode.value.appeal_reason_instruction || DEFAULT_APPEAL_REASON_INSTRUCTION
  appealPromptEditorOpen.value = true
}
function closeAppealPromptEditor() { appealPromptEditorOpen.value = false }
function saveAppealPrompt() {
  if (!selectedNode.value || selectedNode.value.node_type !== 'result_reconsideration') return
  const value = appealPromptDraft.value.trim()
  const instruction = appealReasonInstructionDraft.value.trim()
  selectedNode.value.appeal_prompt_content = value || DEFAULT_APPEAL_PROMPT
  selectedNode.value.appeal_reason_instruction = instruction || DEFAULT_APPEAL_REASON_INSTRUCTION
  closeAppealPromptEditor()
}
function updateAppealPreviewPosition() {
  const button = appealPreviewButton.value
  if (!button) return
  const rect = button.getBoundingClientRect()
  const width = 421.333
  const height = 234.854
  const left = Math.min(Math.max(16, rect.right - width), Math.max(16, window.innerWidth - width - 16))
  const top = Math.max(16, rect.top - height - 8)
  appealPreviewStyle.value = { left: `${left}px`, top: `${top}px` }
}
function showAppealPreview() {
  if (appealPreviewTimer) { clearTimeout(appealPreviewTimer); appealPreviewTimer = null }
  if (appealPreviewHideTimer) { clearTimeout(appealPreviewHideTimer); appealPreviewHideTimer = null }
  appealPreviewVisible.value = true
  void nextTick(updateAppealPreviewPosition)
}
function scheduleAppealPreview() {
  if (appealPreviewTimer) clearTimeout(appealPreviewTimer)
  appealPreviewTimer = setTimeout(() => { appealPreviewTimer = null; showAppealPreview() }, 118)
}
function cancelAppealPreviewHide() {
  if (appealPreviewHideTimer) { clearTimeout(appealPreviewHideTimer); appealPreviewHideTimer = null }
}
function hideAppealPreview() {
  if (appealPreviewTimer) { clearTimeout(appealPreviewTimer); appealPreviewTimer = null }
  cancelAppealPreviewHide()
  appealPreviewVisible.value = false
}
const selectedNodeHasPrevious = computed(() => businessNodes.value.findIndex((node) => node.node_id === selectedId.value) > 0)
const evaluationNodeCount = computed(() => businessNodes.value.filter((node) => node.node_type === 'evaluation').length)
const executorModeOptions = PERFORMANCE_EXECUTOR_OPTIONS
const resultCommunicationExecutorModeOptions = RESULT_COMMUNICATION_EXECUTOR_OPTIONS
const subjectExecutorOption = SUBJECT_EXECUTOR_OPTION
const calibrationExecutorOption = CALIBRATION_EXECUTOR_OPTION
const fixedExecutorOptionByNodeType: Record<string, PerformanceExecutorOption> = {
  work_summary: subjectExecutorOption,
  reviewer_360_invite: subjectExecutorOption,
  result_view: subjectExecutorOption,
  calibration: calibrationExecutorOption,
}
const executorOptions = REAL_LINE_MANAGER_LEVEL_OPTIONS
const reviewer360ConfirmExecutorOptions = REVIEWER_360_CONFIRM_MANAGER_LEVEL_OPTIONS
const selectableExecutorNodeTypes = ['evaluation', 'result_communication', 'reviewer_360_confirm']
const evaluationTypeOptions = [{ value: 'SINGLE' as const, label: '单人评估' }, { value: 'MULTI' as const, label: '多人评估' }]
const inviteScopeOptions = [{ value: 'ALL' as const, label: '全部执行人' }, { value: 'PARTIAL' as const, label: '部分执行人' }]
const inviteInfoLines = [
  '此设置默认关闭，以避免同一评估人重复收到多个环节内容相同的评估任务。建议仅在本环节和其他评估环节的评估内容不相同时再开启此项。此设置在项目启动后仍允许修改。',
  '开启后，可邀请其他环节的执行人角色作为 360° 评估人。',
  '不属于“其他评估环节执行人”的人员，可正常邀请，不受此设置影响。',
]
const previousNodeCompletionInfo = '上一环节的执行人完成环节任务后，当前环节的执行人才可以完成此任务'
const standardAddableOptions = [{ type: 'evaluation', label: '评估型环节' }, { type: 'work_summary', label: '工作总结环节' }, { type: 'reviewer_360_invite', label: '360°邀请环节' }, { type: 'reviewer_360_confirm', label: '360°确认环节' }, { type: 'calibration', label: '校准环节' }, { type: 'result_communication', label: '结果沟通环节' }]
const resultReconsiderationOption = { type: 'result_reconsideration', label: '结果复议处理' }
const addableOptions = [...standardAddableOptions, resultReconsiderationOption]
const standardNodeLabels: Record<string, string> = {
  evaluation: '评估型环节',
  result_view: '绩效结果查看环节',
  result_reconsideration: '结果复议处理',
  work_summary: '工作总结环节',
  reviewer_360_invite: '360°邀请环节',
  reviewer_360_confirm: '360°确认环节',
  calibration: '校准环节',
  result_communication: '结果沟通环节',
}
const selectedExecutorModeOptions = computed(() => ['result_communication', 'reviewer_360_confirm'].includes(selectedNode.value?.node_type || '') ? resultCommunicationExecutorModeOptions : executorModeOptions)
const selectedManagerLevelOptions = computed(() => selectedNode.value?.node_type === 'reviewer_360_confirm' ? reviewer360ConfirmExecutorOptions : executorOptions)
const selectedExecutorMode = computed({
  get: () => selectedNode.value && selectableExecutorNodeTypes.includes(selectedNode.value.node_type) ? (selectedNode.value.executor_label || '实线上级') : '',
  set: (value: string) => {
    if (!selectedNode.value || !selectableExecutorNodeTypes.includes(selectedNode.value.node_type)) return
    selectedNode.value.executor_label = value
    if (['result_communication', 'reviewer_360_confirm'].includes(selectedNode.value.node_type)) {
      if (value === '实线上级' && selectedNode.value.executor_types.length === 0) selectedNode.value.executor_types = ['DIRECT_MANAGER']
      return
    }
    applyExecutorSelectionDefaults(selectedNode.value)
  },
})
const fixedEvaluationType = computed<'SINGLE' | 'MULTI' | null>(() => selectedExecutorMode.value === '360°评估人' ? 'MULTI' : ['被评估人', '实线上级'].includes(selectedExecutorMode.value) ? 'SINGLE' : null)
const isEvaluationTypeFixed = computed(() => selectedNode.value?.node_type === 'evaluation' && fixedEvaluationType.value !== null)
const isFinalResultRestricted = computed(() => selectedNode.value?.node_type === 'evaluation' && ['被评估人', '360°评估人', '虚线上级'].includes(selectedExecutorMode.value))
const evaluationTypeDisabled = computed(() => locked('evaluation_type') || isEvaluationTypeFixed.value)
const finalResultDisabled = computed(() => locked('include_final_result') || isFinalResultRestricted.value)
const finalResultRestrictionMessage = computed(() => `执行人为${selectedExecutorMode.value}时无法开启此功能。`)
const inviteExecutorOptions = computed(() => {
  const currentId = selectedNode.value?.node_id
  return [...new Set(businessNodes.value
    .filter((node) => node.node_type === 'evaluation' && node.node_id !== currentId && node.executor_label)
    .map((node) => node.executor_label))]
})
function ensureInviteDefaults(node: PerformanceWorkflowNode) {
  node.allow_invite_other_executors ??= false
  node.invite_executor_scope ??= 'ALL'
  node.invite_executor_types ??= []
  node.require_previous_node_completion ??= false
}
function candidateRolesFor(node: PerformanceWorkflowNode) {
  return new Set(businessNodes.value
    .filter((other) => other.node_type === 'evaluation' && other.node_id !== node.node_id && other.executor_label)
    .map((other) => other.executor_label))
}
function pruneInviteSelections() {
  for (const node of businessNodes.value) {
    ensureInviteDefaults(node)
    const allowed = candidateRolesFor(node)
    const filtered = [...new Set(node.invite_executor_types.filter((role) => allowed.has(role)))]
    if (filtered.length !== node.invite_executor_types.length || filtered.some((role, index) => role !== node.invite_executor_types[index])) node.invite_executor_types = filtered
  }
}
function invalidInviteNodeId() {
  const reviewers = businessNodes.value.filter((node) => node.node_type === 'evaluation' && node.executor_label === '360°评估人')
  const invalid = reviewers.filter((node) => node.allow_invite_other_executors && node.invite_executor_scope === 'PARTIAL' && node.invite_executor_types.length === 0)
  return reviewers.length > 0 && invalid.length === reviewers.length ? invalid[0].node_id : null
}
function normalizeRestrictedExecutor(node: PerformanceWorkflowNode) {
  if (node.node_type !== 'evaluation') return
  if (node.executor_label === '被评估人') node.evaluation_type = 'SINGLE'
  else if (node.executor_label === '360°评估人') node.evaluation_type = 'MULTI'
  else if (node.executor_label === '实线上级') { node.evaluation_type = 'SINGLE'; return }
  else if (node.executor_label === '虚线上级') { node.include_final_result = false; return }
  else return
  node.include_final_result = false
}
function normalizeSharedManagerExecutor(node: PerformanceWorkflowNode) {
  if (!['result_communication', 'reviewer_360_confirm'].includes(node.node_type)) return
  if (!resultCommunicationExecutorModeOptions.some((option) => option.label === node.executor_label)) node.executor_label = '实线上级'
  if (node.node_type === 'reviewer_360_confirm') {
    const allowed = new Set(reviewer360ConfirmExecutorOptions.map((option) => option.type))
    node.executor_types = [...new Set(node.executor_types.filter((type) => allowed.has(type)))]
  }
  if (node.executor_label === '实线上级' && node.executor_types.length === 0) node.executor_types = ['DIRECT_MANAGER']
}
function normalizeFixedSubjectExecutor(node: PerformanceWorkflowNode) {
  if (!['work_summary', 'reviewer_360_invite', 'result_view'].includes(node.node_type)) return
  node.executor_label = SUBJECT_EXECUTOR_OPTION.label
  node.executor_types = [SUBJECT_EXECUTOR_OPTION.type]
}
function normalizeSubjectConfirmation(node: PerformanceWorkflowNode) {
  node.subject_confirm_required = node.node_type === 'result_view' ? Boolean(node.subject_confirm_required) : false
}
function normalizeCalibrationExecutor(node: PerformanceWorkflowNode) {
  if (node.node_type !== 'calibration') return
  node.executor_label = calibrationExecutorOption.label
  node.executor_types = [calibrationExecutorOption.type]
}
function normalizeCalibrationReason(node: PerformanceWorkflowNode) {
  if (node.node_type !== 'calibration') {
    node.calibration_reason_enabled = false
    node.calibration_reason_required = false
    return
  }
  node.calibration_reason_enabled ??= true
  node.calibration_reason_required = Boolean(node.calibration_reason_enabled && node.calibration_reason_required)
}
function normalizePreviousNodeRequirement(node: PerformanceWorkflowNode, index: number) {
  node.require_previous_node_completion = node.node_type === 'reviewer_360_invite' && index > 0
    ? Boolean(node.require_previous_node_completion)
    : false
}
function normalizeNode(node: PerformanceWorkflowNode, index: number) {
  ensureInviteDefaults(node)
  normalizeRestrictedExecutor(node)
  normalizeSharedManagerExecutor(node)
  normalizeFixedSubjectExecutor(node)
  normalizeSubjectConfirmation(node)
  normalizeCalibrationExecutor(node)
  normalizeCalibrationReason(node)
  normalizePreviousNodeRequirement(node, index)
  if (node.node_type === 'result_reconsideration') node.appeal_prompt_content ||= DEFAULT_APPEAL_PROMPT
  if (node.node_type === 'result_reconsideration') node.appeal_reason_instruction ||= DEFAULT_APPEAL_REASON_INSTRUCTION
}
function updateCalibrationReasonEnabled(enabled: boolean) {
  if (!selectedNode.value || selectedNode.value.node_type !== 'calibration') return
  selectedNode.value.calibration_reason_enabled = enabled
  if (!enabled) selectedNode.value.calibration_reason_required = false
}
function updateSubjectConfirmation(enabled: boolean) {
  if (!selectedNode.value || selectedNode.value.node_type !== 'result_view') return
  selectedNode.value.subject_confirm_required = enabled
}
function applyExecutorSelectionDefaults(node: PerformanceWorkflowNode) {
  if (node.node_type !== 'evaluation') return
  normalizeRestrictedExecutor(node)
  if (node.executor_label !== '被评估人' && node.executor_label !== '360°评估人') {
    node.evaluation_type = 'SINGLE'
    node.include_final_result = false
  }
}
function updateFinalResultTooltipPosition() {
  if (!finalResultTooltipVisible.value || !finalResultSwitchAnchor.value) return
  const anchorRect = finalResultSwitchAnchor.value.getBoundingClientRect()
  finalResultTooltipStyle.value = {
    left: `${anchorRect.left + anchorRect.width / 2 - 209.167}px`,
    top: `${anchorRect.top - 57.333}px`,
  }
}
function scheduleFinalResultTooltip() {
  if (!isFinalResultRestricted.value) return
  if (finalResultTooltipTimer !== null) clearTimeout(finalResultTooltipTimer)
  finalResultTooltipTimer = setTimeout(() => {
    finalResultTooltipVisible.value = true
    finalResultTooltipTimer = null
    void nextTick(updateFinalResultTooltipPosition)
  }, 138)
}
function hideFinalResultTooltip() {
  if (finalResultTooltipTimer !== null) clearTimeout(finalResultTooltipTimer)
  finalResultTooltipTimer = null
  finalResultTooltipVisible.value = false
}
function nodeBeforeConnector(index: number) { return index > 0 ? businessNodes.value[index - 1] : undefined }
function standardNodeLabel(type: string) { return standardNodeLabels[type] ?? '流程环节' }
function hasNodeType(type: string) { return businessNodes.value.some((node) => node.node_type === type) }
function canAddAtConnector(index: number) { const previousType = nodeBeforeConnector(index)?.node_type; if (previousType === 'result_view') return !hasNodeType('result_reconsideration'); if (previousType === 'result_reconsideration') return false; return true }
const availableAddableOptions = computed(() => { const index = popoverIndex.value; if (index === null) return []; const previousType = nodeBeforeConnector(index)?.node_type; if (previousType === 'result_view') return hasNodeType('result_reconsideration') ? [] : [resultReconsiderationOption]; if (previousType === 'result_reconsideration') return []; return standardAddableOptions.filter((option) => option.type === 'evaluation' || !hasNodeType(option.type)) })
function cancelPopoverClose() { if (popoverCloseTimer !== null) { clearTimeout(popoverCloseTimer); popoverCloseTimer = null } }
function updatePopoverPosition() {
  updateFinalResultTooltipPosition()
  const canvas = workflowCanvas.value
  const popover = stagePopover.value
  const addCircle = activeConnector?.querySelector<HTMLElement>('.add-circle')
  if (!canvas || !popover || !addCircle || !activeConnector) return
  const addRect = addCircle.getBoundingClientRect()
  const canvasRect = canvas.getBoundingClientRect()
  const popoverRect = popover.getBoundingClientRect()
  const popoverContent = popover.querySelector<HTMLElement>('.stage-popover-content')
  const viewportTop = Math.max(0, canvasRect.top)
  const viewportBottom = Math.min(window.innerHeight, canvasRect.bottom)
  const availableHeight = Math.max(0, viewportBottom - viewportTop)
  const naturalPopoverHeight = Math.min(popoverContent?.scrollHeight || popoverRect.height, availableHeight)
  const addCenterY = addRect.top + addRect.height / 2
  const topArrowAvailableHeight = Math.max(32, viewportBottom - (addCenterY - 16))
  const bottomArrowAvailableHeight = Math.max(32, addCenterY + 16 - viewportTop)
  const useTopArrow = naturalPopoverHeight <= topArrowAvailableHeight || topArrowAvailableHeight >= bottomArrowAvailableHeight
  const placementAvailableHeight = Math.min(availableHeight, useTopArrow ? topArrowAvailableHeight : bottomArrowAvailableHeight)
  const popoverHeight = Math.min(naturalPopoverHeight, placementAvailableHeight)
  popoverArrowCenter.value = useTopArrow ? 16 : Math.max(16, popoverHeight - 16)
  const top = addCenterY - popoverArrowCenter.value
  popoverPositionStyle.value = {
    transform: `translate3d(${addRect.right + 10 + window.scrollX}px, ${top + window.scrollY}px, 0)`,
    transformOrigin: `0 ${popoverArrowCenter.value}px`,
    maxHeight: `${placementAvailableHeight}px`,
    visibility: 'visible',
  }
}
function observePopoverSize() {
  popoverResizeObserver?.disconnect()
  if (typeof ResizeObserver === 'undefined' || !stagePopover.value) return
  popoverResizeObserver = new ResizeObserver(updatePopoverPosition)
  popoverResizeObserver.observe(stagePopover.value)
}
function showPopover(index: number, event?: Event) {
  if (!canAddAtConnector(index)) return
  const connector = event?.currentTarget
  if (connector instanceof HTMLElement) activeConnector = connector
  cancelPopoverClose()
  popoverPositionStyle.value = { transform: 'translate3d(0, 0, 0)', visibility: 'hidden' }
  popoverIndex.value = index
  void nextTick(() => { updatePopoverPosition(); observePopoverSize() })
}
function closePopover() { popoverIndex.value = null; activeConnector = null; popoverResizeObserver?.disconnect() }
function schedulePopoverClose() { cancelPopoverClose(); popoverCloseTimer = setTimeout(() => { closePopover(); popoverCloseTimer = null }, 120) }
function selectNode(id: string | null) { if (!id) return; selectedId.value = id; closePopover() }
 function addNode(type: string) { const insertionIndex = popoverIndex.value; const option = addableOptions.find((item) => item.type === type); if (insertionIndex === null || !option) return; const previousType = nodeBeforeConnector(insertionIndex)?.node_type; if (type === 'result_reconsideration') { if (previousType !== 'result_view' || hasNodeType(type)) return } else if (previousType === 'result_view' || previousType === 'result_reconsideration' || (type !== 'evaluation' && hasNodeType(type))) return; const id = `${type}-${Date.now()}`; const fixedSubject = ['work_summary', 'reviewer_360_invite'].includes(type); const fixedCalibration = type === 'calibration'; const sharedManagerExecutor = ['evaluation', 'result_communication', 'reviewer_360_confirm'].includes(type); businessNodes.value.splice(insertionIndex, 0, { node_id: id, node_type: type, name: option.label, description: '', order: 0, executor_types: type === 'result_reconsideration' ? ['HRBP'] : fixedSubject ? [SUBJECT_EXECUTOR_OPTION.type] : fixedCalibration ? [CALIBRATION_EXECUTOR_OPTION.type] : ['DIRECT_MANAGER'], executor_label: type === 'result_reconsideration' ? 'HRBP' : fixedSubject ? SUBJECT_EXECUTOR_OPTION.label : fixedCalibration ? CALIBRATION_EXECUTOR_OPTION.label : sharedManagerExecutor ? '实线上级' : '直属上级', executor_config: type === 'result_reconsideration' ? { mode: 'MULTI_ROLE', roles: [{ type: 'HRBP' }] } : undefined, appeal_prompt_content: type === 'result_reconsideration' ? DEFAULT_APPEAL_PROMPT : undefined, appeal_reason_instruction: type === 'result_reconsideration' ? DEFAULT_APPEAL_REASON_INSTRUCTION : undefined, evaluation_type: type === 'evaluation' ? 'SINGLE' : null, include_final_result: false, system: false, allow_invite_other_executors: false, invite_executor_scope: 'ALL', invite_executor_types: [], require_previous_node_completion: false, calibration_reason_enabled: fixedCalibration, calibration_reason_required: false }); selectedId.value = id; closePopover(); renumber() }
function canDeleteNode(node: PerformanceWorkflowNode) { return !node.system && (node.node_type !== 'evaluation' || evaluationNodeCount.value > 1) }
function removeNode(id: string | null) { if (!id) return; const node = businessNodes.value.find((item) => item.node_id === id); if (!node || !canDeleteNode(node)) return; businessNodes.value = businessNodes.value.filter((item) => item.node_id !== id); selectedId.value = null; renumber() }
function renumber() { businessNodes.value.forEach((node, index) => { node.order = index + 1 }) }
function locked(field: string) { return usageSummary.value.cycle_count > 0 && !['description', 'appeal_prompt_content'].includes(field) }
watch(businessNodes, () => {
  pruneInviteSelections()
  if (inviteValidationNodeId.value && invalidInviteNodeId() !== inviteValidationNodeId.value) inviteValidationNodeId.value = null
}, { deep: true })
onMounted(async () => { window.addEventListener('resize', updatePopoverPosition); window.addEventListener('scroll', updatePopoverPosition, true); window.addEventListener('resize', updateAppealPreviewPosition); window.addEventListener('scroll', updateAppealPreviewPosition, true); if (!props.templateId) return; try { const data = await performanceTemplateApi.getWorkflow(props.templateId); usageSummary.value = data.usage_summary; if (data.nodes?.length) { data.nodes.forEach(normalizeNode); businessNodes.value = data.nodes; pruneInviteSelections() } } catch { /* API error is surfaced by the shared client interceptor. */ } })
onBeforeUnmount(() => { cancelPopoverClose(); hideFinalResultTooltip(); hideAppealPreview(); popoverResizeObserver?.disconnect(); window.removeEventListener('resize', updatePopoverPosition); window.removeEventListener('scroll', updatePopoverPosition, true); window.removeEventListener('resize', updateAppealPreviewPosition); window.removeEventListener('scroll', updateAppealPreviewPosition, true) })
async function save() {
  businessNodes.value.forEach(normalizeNode)
  pruneInviteSelections()
  inviteValidationNodeId.value = invalidInviteNodeId()
  if (inviteValidationNodeId.value) {
    selectedId.value = inviteValidationNodeId.value
    await nextTick()
    document.querySelector('.invite-role-error')?.scrollIntoView({ block: 'nearest' })
    return
  }
  if (!props.templateId) { emit('next'); return }
  saving.value = true
  try {
    renumber()
    const data = await performanceTemplateApi.updateWorkflow(props.templateId, { nodes: businessNodes.value })
    data.nodes.forEach(normalizeNode)
    businessNodes.value = data.nodes
    emit('next')
  } finally { saving.value = false }
}
defineExpose({ save })
</script>

<style scoped>
.workflow-page{flex:1 1 auto;width:100%;min-width:0;height:100%;background:#f5f6f7;color:#1f2329;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif}.usage-banner{display:flex;align-items:center;height:40px;padding:0 16px;box-sizing:border-box;background:#e1eaff;font-size:14px;line-height:22px}.banner-icon{width:16px;height:16px;margin-right:8px;border-radius:50%;background:#3370ff;color:#fff;text-align:center;font-size:12px;line-height:16px}.banner-copy{flex:1;min-width:0;overflow:hidden;white-space:nowrap}.banner-copy a{color:#1890ff}.banner-close{margin-left:8px;border:0;background:transparent;color:#646a73;font-size:20px;line-height:16px;cursor:pointer}.workflow-body{display:flex;width:100%;height:100%;min-height:0}.workflow-body.with-banner{height:calc(100% - 40px)}.workflow-canvas{position:relative;flex:1 1 auto;min-width:0;overflow:auto;background:#f5f6f7}.template-entry{position:absolute;top:20px;left:20px;height:32px;padding:4px 11px;border:.666667px solid #d0d3d6;border-radius:4px;background:#fff;color:#1f2329;font-size:14px}.flow-stack{display:flex;flex-direction:column;align-items:center;width:max-content;max-width:100%;min-height:441px;margin:0 auto;padding:40px;box-sizing:border-box}.system-node{display:flex;align-items:center;justify-content:center;flex:0 0 40px;width:100px;height:40px;box-sizing:border-box;border:.666667px solid rgba(187,191,196,.5);border-radius:64px;background:#f8f9fa;color:#646a73;font-size:14px;line-height:14px}.stage-node{position:relative;display:flex;align-items:center;justify-content:center;flex:0 0 66px;width:max-content;min-width:0;max-width:100%;height:66px;padding:12px 16px;box-sizing:border-box;border:.666667px solid #dee0e3;border-radius:6px;background:#fff;color:#1f2329;cursor:pointer}.stage-node.selected{border-color:#3370ff;background:rgba(51,112,255,.08);color:#3370ff}.stage-node.selected .node-icon,.stage-node.selected .node-copy strong{color:#3370ff}.node-icon{display:flex;align-items:center;justify-content:center;flex:0 0 20px;width:20px;height:20px;margin-right:8px;color:#646a73}.node-icon svg{display:block;width:20px;height:20px}.node-copy{display:flex;flex-direction:column;align-items:center;min-width:0;max-width:100%;white-space:nowrap}.node-copy strong{overflow:hidden;max-width:100%;font-size:14px;line-height:21px;font-weight:400}.node-copy small{overflow:hidden;max-width:100%;color:#646a73;font-size:12px;line-height:20px}.delete-node{position:absolute;top:21px;right:-28px;width:24px;height:24px;padding:4px;border:0;border-radius:6px;background:transparent;color:#646a73;line-height:16px}.flow-connector{display:flex;flex:0 0 41px;flex-direction:column;align-items:center;width:16px;height:41px;padding:0;border:0;background:transparent;cursor:pointer}.flow-connector--passive{cursor:default}.flow-connector--passive .flow-line{height:36.33333px}.flow-line{width:1px;height:10px;background:#bbbfc4}.add-circle{display:flex;align-items:center;justify-content:center;flex:0 0 16px;width:16px;height:16px;box-sizing:border-box;border:.666667px solid #bbbfc4;border-radius:999px;background:#fff;color:#bbbfc4;font-size:14px;line-height:14px}.flow-connector.open .add-circle{border-color:#3370ff;color:#3370ff}.triangle{width:0;height:0;border-top:4.66667px solid #bbbfc4;border-right:3.33333px solid transparent;border-left:3.33333px solid transparent}.config-panel{flex:0 0 320px;width:320px;overflow:auto;background:#fff;border-left:.666667px solid #dee0e3}.panel-scroll{padding:24px}.panel-scroll label,.panel-scroll fieldset{display:block;margin:0 0 20px;border:0;padding:0;font-size:14px;line-height:22px}.panel-scroll input:not([type=checkbox]):not([type=radio]),.panel-scroll textarea{display:block;width:100%;box-sizing:border-box;margin-top:8px;border:.666667px solid #d0d3d6;border-radius:4px;padding:4px 11px;font:inherit}.panel-scroll input:not([type=checkbox]):not([type=radio]){height:32px}.panel-scroll textarea{height:97px;resize:vertical}.check-row,.radio-row{display:flex!important;align-items:center;gap:8px;margin:8px 0!important}.empty-panel{display:flex;align-items:center;justify-content:center;height:100%;color:#8f959e}.stage-popover{position:absolute;top:0;left:0;overflow:visible;width:313px;box-sizing:border-box;z-index:2000}.stage-popover-content{overflow:auto;max-height:inherit;box-sizing:border-box;padding:12px 16px;border:.666667px solid #dee0e3;border-radius:8px;background:#fff;box-shadow:rgba(31,35,41,.04) 0 8px 24px 8px,rgba(31,35,41,.04) 0 6px 12px,rgba(31,35,41,.06) 0 4px 8px -8px}.popover-arrow{position:absolute;left:0;width:8px;height:16px;overflow:visible;transform:translate(calc(-100% + 1px),-50%) rotate(180deg);pointer-events:none}.popover-arrow path{fill:#fff;stroke:#dee0e3;stroke-width:.666667px}.popover-title{margin-bottom:12px;color:#646a73;font-size:14px;line-height:22px}.popover-stage{display:flex;align-items:center;width:280px;height:38px;margin-bottom:8px;padding:8px 12px;box-sizing:border-box;border:.666667px solid #dee0e3;border-radius:4px;background:#f5f6f7;color:#1f2329;font-size:14px;cursor:pointer}.popover-stage:last-child{margin-bottom:0}.popover-icon{display:flex;align-items:center;justify-content:center;flex:0 0 16px;width:16px;height:16px;margin-right:8px;color:#646a73}.popover-icon :deep(.stage-icon){width:16px;height:16px}
 .stage-node{flex-direction:column}.node-title-row{display:flex;justify-content:center;align-items:center;min-width:0;max-width:100%;font-size:14px;font-weight:400;line-height:21px}.node-title{overflow:hidden;min-width:0;max-width:100%;box-sizing:border-box;text-overflow:ellipsis;white-space:nowrap}.node-executor{overflow:hidden;min-width:0;max-width:100%;box-sizing:border-box;color:#646a73;font-size:12px;font-weight:400;line-height:20px;text-align:center;text-overflow:ellipsis;white-space:nowrap}.stage-node.selected .node-icon,.stage-node.selected .node-title{color:#3370ff}
.panel-title{height:48px;padding:12px 20px;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif;font-size:16px;font-weight:600;line-height:24px;color:rgba(0,0,0,.65);border-bottom:.666667px solid rgba(31,35,41,.15)}
.config-panel{display:flex;flex-direction:column;overflow:hidden}.panel-scroll{flex:1 1 auto;min-height:0;overflow:auto;scrollbar-width:none}.panel-scroll::-webkit-scrollbar{width:0;height:0}
.stage-node:hover,.stage-node:focus-visible{border-color:#3370ff;background:rgba(51,112,255,.08);color:#3370ff}.stage-node:hover .node-icon,.stage-node:hover .node-title,.stage-node:focus-visible .node-icon,.stage-node:focus-visible .node-title{color:#3370ff}.delete-node{display:inline-flex;justify-content:center;align-items:center;height:25px;visibility:hidden;opacity:0;pointer-events:none;transition:color .1s ease-in,background-color .1s ease-in,border-color .1s ease-in,width .2s ease-in}.delete-node::before{position:absolute;top:0;bottom:0;left:-4px;width:4px;content:""}.stage-node:hover .delete-node{visibility:visible;opacity:1;pointer-events:auto}.delete-node:hover,.delete-node:focus-visible{background-color:rgba(31,35,41,.2)}.delete-node svg{display:block;width:16px;height:16px}
.panel-form > .form-row:nth-of-type(2),.panel-form > .form-row:nth-of-type(3){display:none}.final-result-row{display:flex;align-items:center;gap:8px;color:#1f2329;font-size:14px;line-height:22px}.final-result-label{font-weight:600}.panel-form :deep(.performance-switch){flex:0 0 28px}
.evaluation-type-row{display:flex;flex-direction:column;align-items:stretch;gap:8px;width:100%;margin:0 0 20px;box-sizing:border-box}.evaluation-type-row>.font-medium{margin:0;color:rgba(0,0,0,.85);font:600 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif}.ud__radio-group{display:flex;flex-flow:column wrap;gap:8px 24px;width:100%;box-sizing:border-box}.panel-scroll .ud__radio__wrapper{position:relative;display:flex;align-items:center;width:100%;height:22px;margin:0!important;box-sizing:border-box;color:#1f2329;font:400 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif;cursor:pointer}.ud__radio{position:relative;display:block;flex:0 0 16px;width:16px;height:22px}.ud__radio__input{position:absolute;top:50%;left:0;z-index:1;width:16px;height:16px;margin:0;opacity:0;transform:translateY(-50%);cursor:pointer}.ud__radio__wallpaper{position:absolute;top:50%;left:0;display:block;width:16px;height:16px;box-sizing:border-box;border:.666667px solid #bbbfc4;border-radius:999999px;background:#fff;transform:translateY(-50%);transition:background .2s cubic-bezier(.34,.69,.1,1),border .2s cubic-bezier(.34,.69,.1,1)}.ud__radio__checked-ink{position:absolute;top:50%;left:50%;display:block;width:6px;height:6px;border-radius:999999px;background:#fff;opacity:0;transform:translate(-50%,-50%);transition:.2s cubic-bezier(.34,.69,.1,1)}.ud__radio__wrapper--checked .ud__radio__wallpaper{border-color:#3370ff;background:#3370ff}.ud__radio__wrapper--checked .ud__radio__checked-ink{opacity:1}.ud__radio__label-content{display:block;height:22px;margin-left:8px;color:inherit;font:inherit;line-height:22px}.radio-label-inner{display:flex;align-items:center;height:22px;gap:4px}.radio-info-icon{display:block;width:14px;height:14px;color:#646a73;font-size:14px;line-height:14px;cursor:default}.radio-info-icon svg{display:block;width:14px;height:14px}.panel-scroll .ud__radio__wrapper--disable{color:#bbbfc4;cursor:not-allowed}.ud__radio__wrapper--disable .ud__radio__input{cursor:not-allowed}.ud__radio__wrapper--disable .ud__radio__wallpaper{border-color:#bbbfc4;background:#eff0f1;cursor:not-allowed}.ud__radio__wrapper--checked.ud__radio__wrapper--disable .ud__radio__wallpaper{border-color:#bbbfc4;background:#bbbfc4}.ud__radio__wrapper--disable .ud__radio__checked-ink{background:#eff0f1}.final-result-switch-anchor{position:relative;display:block;flex:0 0 28px;width:28px;height:16px}.final-result-switch-anchor:focus-visible{outline:2px solid #1456f0;outline-offset:2px;border-radius:999999px}.final-result-tooltip-popover{position:fixed;z-index:1030;width:271.333px;height:47.333px;box-sizing:border-box;transform-origin:77.0885% 100%;pointer-events:auto}.final-result-tooltip-content{width:100%;height:100%;overflow:hidden;padding:12px 16px;box-sizing:border-box;border:.666667px solid #dee0e3;border-radius:8px;background:#fff;box-shadow:rgba(31,35,41,.04) 0 8px 24px 8px,rgba(31,35,41,.04) 0 6px 12px,rgba(31,35,41,.06) 0 4px 8px -8px;color:#1f2329;font:400 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif;white-space:nowrap}.final-result-tooltip-arrow{position:absolute;bottom:0;left:209.167px;line-height:0}.final-result-tooltip-arrow svg{position:absolute;display:flex;transform:translate(-50%,-1px)}.final-result-tooltip-arrow path{fill:#fff;stroke:#dee0e3;stroke-width:.666667px}
.final-result-setting{width:263.333px;max-width:100%}.final-result-setting .final-result-row{width:100%}.final-result-help{width:263.333px;max-width:100%;min-width:0;min-height:0;margin-top:4px;box-sizing:border-box;color:#646a73;font:400 14px/20px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif}
.previous-node-setting{width:263.333px;max-width:100%;margin:0 0 20px;box-sizing:border-box}.invite-executor-setting{width:263.333px;max-width:100%;margin:0 0 20px;box-sizing:border-box}.invite-scope-panel{width:263.333px;height:98px;margin-top:8px;padding:8px 12px;box-sizing:border-box;border-radius:6px;background:#f8f9fa;color:#1f2329}.invite-scope-panel:has(.invite-role-control){height:134px}.invite-scope-panel--error:has(.invite-role-control){height:156px}.invite-scope-heading{height:22px;margin-bottom:8px;color:#646a73;font:400 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif}.invite-scope-radio-group{display:flex;flex-direction:column;gap:8px}.invite-scope-panel .ud__radio__wrapper{height:22px}.invite-role-control{width:239.333px;height:32px;margin-top:4px;padding-left:24px;box-sizing:border-box;line-height:22px}.invite-scope-panel--error .invite-role-control{height:54px}.invite-role-error{display:inline;margin:0;padding:0;color:#f54a45;font:400 14px/22.001px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;text-align:start}
.calibration-reason-setting{width:271px;max-width:100%;margin:0 0 20px;box-sizing:border-box}.calibration-reason-setting__help{min-width:0;min-height:0;margin-top:4px;box-sizing:border-box;color:#646a73;font:400 14px/20px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif}.calibration-reason-setting__required{margin-top:8px}
.appeal-prompt-setting{width:263.333px;max-width:100%;margin:0 0 20px}.appeal-prompt-label{height:22px;color:rgba(0,0,0,.85);font:500 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif}.appeal-prompt-label h4{margin:0;font:inherit}.appeal-prompt-help{width:263.333px;margin-top:-8px;margin-bottom:12px;color:#646a73;font:400 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif}.appeal-prompt-edit{display:flex;align-items:center;justify-content:center;width:263.333px;height:32px;padding:4px 11px;box-sizing:border-box;border:.666667px solid #d0d3d6;border-radius:6px;background:#eff0f1;color:#1f2329;font:400 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif;cursor:pointer}.appeal-prompt-edit:disabled{cursor:not-allowed;opacity:.6}.appeal-edit-icon{display:block;margin-right:4px;line-height:0}.appeal-modal-mask{position:fixed;inset:0;z-index:3000;display:flex;align-items:center;justify-content:center;background:rgba(31,35,41,.45)}.appeal-modal{display:flex;flex-direction:column;width:600px;min-height:352px;box-sizing:border-box;border-radius:8px;background:#fff;color:#1f2329;box-shadow:0 8px 24px rgba(31,35,41,.12)}.appeal-modal-header{position:relative;padding:24px 56px 24px 24px;font:600 16px/24px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif}.appeal-modal-close{position:absolute;top:22px;right:20px;width:28px;height:28px;padding:4px;border:0;border-radius:6px;background:transparent;color:#646a73;font-size:20px;line-height:20px;cursor:pointer}.appeal-modal-body{position:relative;min-height:156px;margin-bottom:24px;padding:0 24px;box-sizing:border-box}.appeal-form-label{display:flex;align-items:baseline;height:23px;margin-bottom:8px;font:600 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif}.appeal-form-label span{margin-left:2px;color:#f54a45;font-family:SimSun,sans-serif;font-weight:400}.appeal-textarea{display:block;width:552px;height:49.333px;max-width:100%;padding:4px 11px 22px;box-sizing:border-box;resize:none;border:.666667px solid #1456f0;border-radius:6px;background:#fff;color:#1f2329;font:400 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif}.appeal-count{position:absolute;right:34px;bottom:8px;padding:0 4px;border-radius:4px;background:#eff0f1;color:#646a73;font:500 12px/19px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif}.appeal-modal-footer{display:flex;flex-direction:row-reverse;flex-wrap:wrap;margin-top:auto;margin-bottom:-12px;padding:0 24px 24px;box-sizing:border-box}.appeal-button{display:flex;align-items:center;justify-content:center;width:80px;height:32px;margin:0 0 12px 12px;padding:4px 11px;box-sizing:border-box;border:.666667px solid #d0d3d6;border-radius:6px;background:#eff0f1;color:#1f2329;font:400 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif;cursor:pointer}.appeal-button--primary{border-color:#245bdb;background:#245bdb;color:#fff}
.appeal-modal-mask{padding:32px 0;box-sizing:border-box}.appeal-modal{min-height:214px;max-height:100%}.appeal-modal-body{position:static;flex:1 1 auto;min-height:62px;overflow:auto}.appeal-button{background:#fff}.appeal-button--primary{border-color:#3370ff;background:#3370ff;color:#fff}
.appeal-prompt-setting{display:flex;flex-direction:column;row-gap:8px;margin-top:20px}
.appeal-prompt-header{position:relative;width:263.333px;height:22px}
.appeal-preview-button{position:absolute;top:-2px;right:0;z-index:10;width:36px;height:22px;padding:2px 4px;border:0;border-radius:6px;background:transparent;color:#3370ff;font:400 14px/18px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif;cursor:pointer}
.appeal-preview-button:hover,.appeal-preview-button:focus-visible{background:rgba(51,112,255,.1)}
.appeal-prompt-control{display:flex;flex-direction:column}
.appeal-prompt-edit{font-size:0}.appeal-prompt-edit::after{content:"编辑提示";font:400 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif}
.appeal-preview-popover{position:fixed;z-index:1030;width:421.333px;height:234.854px;box-sizing:border-box;overflow:hidden;border:0;border-radius:8px;background:transparent;box-shadow:none;pointer-events:auto}
.appeal-preview-modal{width:100%;height:100%;box-sizing:border-box;padding:24px;border:.666667px solid #dee0e3;border-radius:8px;background:#fff;color:#1f2329;box-shadow:rgba(31,35,41,.04) 0 8px 24px 8px,rgba(31,35,41,.04) 0 6px 12px,rgba(31,35,41,.06) 0 4px 8px -8px;font:400 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif}
.appeal-preview-title{font-size:16px;font-weight:600;line-height:24px}.appeal-preview-description{margin-top:8px;color:#646a73}.appeal-preview-notice{margin-top:16px;padding:8px 12px;border-radius:6px;background:#f5f6f7;color:#1f2329}.appeal-preview-actions{display:flex;flex-direction:row-reverse;gap:12px;margin-top:20px}.appeal-preview-actions button{width:80px;height:32px;border:.666667px solid #d0d3d6;border-radius:6px;background:#fff;color:#1f2329;font:400 14px/22px inherit}.appeal-preview-actions button:first-child{border-color:#3370ff;background:#3370ff;color:#fff}
.appeal-preview-relative{position:relative;width:600px;height:333.601px;min-width:0;min-height:0;box-sizing:border-box;zoom:.7;color:#1f2329;font:400 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif}
.appeal-preview-overlay{position:absolute;top:0;right:0;bottom:0;left:0;z-index:10;width:600px;height:333.601px;min-width:0;min-height:0;box-sizing:border-box;color:#1f2329;pointer-events:auto}
.appeal-preview-relative .appeal-preview-modal{width:600px;height:333.601px;min-height:333.601px;padding:24px;box-sizing:border-box}
.appeal-preview-relative .appeal-preview-modal{display:flex;flex-direction:column;padding:0;border:0;border-radius:8px;background:#fff;overflow:visible}
.appeal-preview-header{position:relative;width:600px;height:97.9613px;padding:24px;box-sizing:border-box}
.appeal-preview-header .appeal-preview-title{height:24px;color:#1f2329;font:600 16px/24px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif}
.appeal-preview-header .appeal-preview-description{width:552px;height:21.994px;margin-top:4px;color:#646a73;font:400 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif;white-space:nowrap}
.appeal-preview-body{width:600px;height:155.67px;margin:0 0 24px;padding:0 24px;box-sizing:border-box;overflow:auto}
.appeal-preview-notice{display:flex;align-items:flex-start;width:552px;height:39.9702px;margin:0 0 12px;padding:9px 0 9px 16px;box-sizing:border-box;border-radius:6px;background:#f0f4ff;color:#1f2329;font:400 14px/22.001px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif;overflow:hidden}
.appeal-preview-notice-icon{display:block;flex:0 0 16px;width:16px;height:16px;margin:3px 8px 0 0;color:#1456f0;font-size:16px;line-height:0}
.appeal-preview-notice-icon svg{display:block;width:16px;height:16px;border-radius:50%;background:#1456f0}
.appeal-preview-notice-main{display:flex;width:528.036px;height:21.994px;margin:0 -16px 0 0;overflow:hidden;color:#1f2329;font:400 14px/22.001px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif;white-space:nowrap}
.appeal-preview-textarea{position:relative;display:inline-block;width:552.024px;height:97.9048px;min-width:0;box-sizing:border-box;overflow:visible}
.appeal-preview-textarea textarea{display:block;width:552.024px;height:97.9048px;min-width:0;min-height:97.9048px;max-width:100%;max-height:9.0072e15px;padding:4px 11px;box-sizing:border-box;resize:vertical;overflow:auto;border:.952381px solid #d0d3d6;border-radius:6px;background:#fff;color:#1f2329;font:400 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif;white-space:pre-wrap;cursor:text}
.appeal-preview-textarea-suffix{display:block}
.appeal-preview-footer{width:600px;height:55.9821px;padding:0 24px 24px;box-sizing:border-box}
.appeal-preview-actions{display:flex;flex-direction:row-reverse;width:552px;height:43.9881px;margin:0 0 -12px;overflow:hidden}
.appeal-preview-actions button{position:relative;width:80px;height:31.994px;margin:0 0 12px 12px;padding:4px 11px;box-sizing:border-box;border:.952381px solid #3370ff;border-radius:6px;background:#3370ff;color:#fff;font:400 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif}
.appeal-preview-actions button:last-child{border-color:#d0d3d6;background:#fff;color:#1f2329}
</style>
