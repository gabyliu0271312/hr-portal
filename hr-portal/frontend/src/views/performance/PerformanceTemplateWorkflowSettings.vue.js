/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { performanceTemplateApi } from '@/api/performance';
import PerformanceCheckbox from '@/components/performance/PerformanceCheckbox.vue';
import PerformanceCountedTextarea from '@/components/performance/PerformanceCountedTextarea.vue';
import PerformanceSwitch from '@/components/performance/PerformanceSwitch.vue';
import PerformanceSwitchSettingRow from '@/components/performance/PerformanceSwitchSettingRow.vue';
import WorkflowFixedExecutorField from '@/components/performance/WorkflowFixedExecutorField.vue';
import WorkflowExecutorField from '@/components/performance/WorkflowExecutorField.vue';
import PerformanceMultiExecutorField from '@/components/performance/PerformanceMultiExecutorField.vue';
import WorkflowNodeBasicFields from '@/components/performance/WorkflowNodeBasicFields.vue';
import { PERFORMANCE_EXECUTOR_OPTIONS, REAL_LINE_MANAGER_LEVEL_OPTIONS, RESULT_COMMUNICATION_EXECUTOR_OPTIONS, REVIEWER_360_CONFIRM_MANAGER_LEVEL_OPTIONS, CALIBRATION_EXECUTOR_OPTION, SUBJECT_EXECUTOR_OPTION, } from '@/components/performance/performanceExecutorOptions';
import PerformanceRoleMultiSelect from '@/components/performance/PerformanceRoleMultiSelect.vue';
import PerformanceWorkflowStageIcon from './PerformanceWorkflowStageIcon.vue';
const props = defineProps();
const emit = defineEmits();
const saving = ref(false);
const bannerVisible = ref(true);
const popoverIndex = ref(null);
const workflowCanvas = ref(null);
const stagePopover = ref(null);
const popoverArrowCenter = ref(16);
const popoverPositionStyle = ref({ transform: 'translate3d(0, 0, 0)', visibility: 'hidden' });
let activeConnector = null;
let popoverResizeObserver = null;
let popoverCloseTimer = null;
const selectedId = ref(null);
const usageSummary = ref({ cycle_count: 0, project_count: 0 });
const finalResultSwitchAnchor = ref(null);
const finalResultTooltipVisible = ref(false);
const finalResultTooltipStyle = ref({});
let finalResultTooltipTimer = null;
const inviteValidationNodeId = ref(null);
const appealPromptEditorOpen = ref(false);
const appealPromptDraft = ref('');
const appealReasonInstructionDraft = ref('');
const appealPreviewButton = ref(null);
const appealPreviewVisible = ref(false);
const appealPreviewStyle = ref({});
let appealPreviewTimer = null;
let appealPreviewHideTimer = null;
const DEFAULT_APPEAL_PROMPT = '如果你不认可本次绩效结果，请详细说明复议原因并提供事实依据';
const DEFAULT_APPEAL_REASON_INSTRUCTION = '请输入复议理由';
const executorLevelLabel = {
    DIRECT_MANAGER: '直属上级', LEVEL_1_MANAGER: '隔 1 级上级', CURRENT_DEPARTMENT: '所属部门负责人',
    PARENT_DEPARTMENT: '隔级部门负责人', LEVEL_1_DEPARTMENT: '所属一级部门负责人',
};
const appealExecutorDescription = computed(() => {
    const roles = selectedNode.value?.executor_config?.roles || [{ type: 'HRBP' }];
    const labels = roles.flatMap((role) => {
        if (role.type === 'HRBP')
            return ['HRBP'];
        if (role.type === 'SPECIFIED_PERSON')
            return role.people.map((person) => person.display_name);
        return role.levels.map((level) => executorLevelLabel[level] || level);
    }).filter(Boolean);
    return labels.length ? labels.join('、') : 'HRBP';
});
const businessNodes = ref([
    { node_id: 'evaluation-1', node_type: 'evaluation', name: '评估型环节', description: '', order: 1, executor_types: ['DIRECT_MANAGER'], executor_label: '实线上级', evaluation_type: 'SINGLE', include_final_result: false, system: false, allow_invite_other_executors: false, invite_executor_scope: 'ALL', invite_executor_types: [], require_previous_node_completion: false },
    { node_id: 'result-view-1', node_type: 'result_view', name: '绩效结果查看环节', description: '', order: 2, executor_types: ['SUBJECT'], executor_label: '被评估人', evaluation_type: null, include_final_result: false, system: true, allow_invite_other_executors: false, invite_executor_scope: 'ALL', invite_executor_types: [], require_previous_node_completion: false, subject_confirm_required: false },
]);
const selectedNode = computed(() => businessNodes.value.find((node) => node.node_id === selectedId.value));
const specifiedPeopleOptions = ref([]);
const resultExecutorError = ref('');
const resultReconsiderationExecutorConfig = computed({
    get: () => selectedNode.value?.executor_config || { mode: 'MULTI_ROLE', roles: [{ type: 'HRBP' }] },
    set: (value) => updateResultExecutorConfig(value),
});
function updateResultExecutorConfig(value) {
    if (!selectedNode.value || selectedNode.value.node_type !== 'result_reconsideration')
        return;
    selectedNode.value.executor_config = value;
    selectedNode.value.executor_types = value.roles.flatMap((role) => role.type === 'REAL_LINE_MANAGER' || role.type === 'DEPARTMENT_HEAD' ? role.levels : role.type === 'HRBP' ? ['HRBP'] : ['SPECIFIED_PERSON']);
    selectedNode.value.executor_label = value.roles.map((role) => ({ REAL_LINE_MANAGER: '实线上级', HRBP: 'HRBP', DEPARTMENT_HEAD: '部门负责人', SPECIFIED_PERSON: '指定人员' }[role.type])).join('、');
    resultExecutorError.value = '';
}
function openAppealPromptEditor() {
    if (!selectedNode.value || selectedNode.value.node_type !== 'result_reconsideration')
        return;
    appealPromptDraft.value = selectedNode.value.appeal_prompt_content || DEFAULT_APPEAL_PROMPT;
    appealReasonInstructionDraft.value = selectedNode.value.appeal_reason_instruction || DEFAULT_APPEAL_REASON_INSTRUCTION;
    appealPromptEditorOpen.value = true;
}
function closeAppealPromptEditor() { appealPromptEditorOpen.value = false; }
function saveAppealPrompt() {
    if (!selectedNode.value || selectedNode.value.node_type !== 'result_reconsideration')
        return;
    const value = appealPromptDraft.value.trim();
    const instruction = appealReasonInstructionDraft.value.trim();
    selectedNode.value.appeal_prompt_content = value || DEFAULT_APPEAL_PROMPT;
    selectedNode.value.appeal_reason_instruction = instruction || DEFAULT_APPEAL_REASON_INSTRUCTION;
    closeAppealPromptEditor();
}
function updateAppealPreviewPosition() {
    const button = appealPreviewButton.value;
    if (!button)
        return;
    const rect = button.getBoundingClientRect();
    const width = 421.333;
    const height = 234.854;
    const left = Math.min(Math.max(16, rect.right - width), Math.max(16, window.innerWidth - width - 16));
    const top = Math.max(16, rect.top - height - 8);
    appealPreviewStyle.value = { left: `${left}px`, top: `${top}px` };
}
function showAppealPreview() {
    if (appealPreviewTimer) {
        clearTimeout(appealPreviewTimer);
        appealPreviewTimer = null;
    }
    if (appealPreviewHideTimer) {
        clearTimeout(appealPreviewHideTimer);
        appealPreviewHideTimer = null;
    }
    appealPreviewVisible.value = true;
    void nextTick(updateAppealPreviewPosition);
}
function scheduleAppealPreview() {
    if (appealPreviewTimer)
        clearTimeout(appealPreviewTimer);
    appealPreviewTimer = setTimeout(() => { appealPreviewTimer = null; showAppealPreview(); }, 118);
}
function cancelAppealPreviewHide() {
    if (appealPreviewHideTimer) {
        clearTimeout(appealPreviewHideTimer);
        appealPreviewHideTimer = null;
    }
}
function hideAppealPreview() {
    if (appealPreviewTimer) {
        clearTimeout(appealPreviewTimer);
        appealPreviewTimer = null;
    }
    cancelAppealPreviewHide();
    appealPreviewVisible.value = false;
}
const selectedNodeHasPrevious = computed(() => businessNodes.value.findIndex((node) => node.node_id === selectedId.value) > 0);
const evaluationNodeCount = computed(() => businessNodes.value.filter((node) => node.node_type === 'evaluation').length);
const executorModeOptions = PERFORMANCE_EXECUTOR_OPTIONS;
const resultCommunicationExecutorModeOptions = RESULT_COMMUNICATION_EXECUTOR_OPTIONS;
const subjectExecutorOption = SUBJECT_EXECUTOR_OPTION;
const calibrationExecutorOption = CALIBRATION_EXECUTOR_OPTION;
const fixedExecutorOptionByNodeType = {
    work_summary: subjectExecutorOption,
    reviewer_360_invite: subjectExecutorOption,
    result_view: subjectExecutorOption,
    calibration: calibrationExecutorOption,
};
const executorOptions = REAL_LINE_MANAGER_LEVEL_OPTIONS;
const reviewer360ConfirmExecutorOptions = REVIEWER_360_CONFIRM_MANAGER_LEVEL_OPTIONS;
const selectableExecutorNodeTypes = ['evaluation', 'result_communication', 'reviewer_360_confirm'];
const evaluationTypeOptions = [{ value: 'SINGLE', label: '单人评估' }, { value: 'MULTI', label: '多人评估' }];
const inviteScopeOptions = [{ value: 'ALL', label: '全部执行人' }, { value: 'PARTIAL', label: '部分执行人' }];
const inviteInfoLines = [
    '此设置默认关闭，以避免同一评估人重复收到多个环节内容相同的评估任务。建议仅在本环节和其他评估环节的评估内容不相同时再开启此项。此设置在项目启动后仍允许修改。',
    '开启后，可邀请其他环节的执行人角色作为 360° 评估人。',
    '不属于“其他评估环节执行人”的人员，可正常邀请，不受此设置影响。',
];
const previousNodeCompletionInfo = '上一环节的执行人完成环节任务后，当前环节的执行人才可以完成此任务';
const standardAddableOptions = [{ type: 'evaluation', label: '评估型环节' }, { type: 'work_summary', label: '工作总结环节' }, { type: 'reviewer_360_invite', label: '360°邀请环节' }, { type: 'reviewer_360_confirm', label: '360°确认环节' }, { type: 'calibration', label: '校准环节' }, { type: 'result_communication', label: '结果沟通环节' }];
const resultReconsiderationOption = { type: 'result_reconsideration', label: '结果复议处理' };
const addableOptions = [...standardAddableOptions, resultReconsiderationOption];
const standardNodeLabels = {
    evaluation: '评估型环节',
    result_view: '绩效结果查看环节',
    result_reconsideration: '结果复议处理',
    work_summary: '工作总结环节',
    reviewer_360_invite: '360°邀请环节',
    reviewer_360_confirm: '360°确认环节',
    calibration: '校准环节',
    result_communication: '结果沟通环节',
};
const selectedExecutorModeOptions = computed(() => ['result_communication', 'reviewer_360_confirm'].includes(selectedNode.value?.node_type || '') ? resultCommunicationExecutorModeOptions : executorModeOptions);
const selectedManagerLevelOptions = computed(() => selectedNode.value?.node_type === 'reviewer_360_confirm' ? reviewer360ConfirmExecutorOptions : executorOptions);
const selectedExecutorMode = computed({
    get: () => selectedNode.value && selectableExecutorNodeTypes.includes(selectedNode.value.node_type) ? (selectedNode.value.executor_label || '实线上级') : '',
    set: (value) => {
        if (!selectedNode.value || !selectableExecutorNodeTypes.includes(selectedNode.value.node_type))
            return;
        selectedNode.value.executor_label = value;
        if (['result_communication', 'reviewer_360_confirm'].includes(selectedNode.value.node_type)) {
            if (value === '实线上级' && selectedNode.value.executor_types.length === 0)
                selectedNode.value.executor_types = ['DIRECT_MANAGER'];
            return;
        }
        applyExecutorSelectionDefaults(selectedNode.value);
    },
});
const fixedEvaluationType = computed(() => selectedExecutorMode.value === '360°评估人' ? 'MULTI' : ['被评估人', '实线上级'].includes(selectedExecutorMode.value) ? 'SINGLE' : null);
const isEvaluationTypeFixed = computed(() => selectedNode.value?.node_type === 'evaluation' && fixedEvaluationType.value !== null);
const isFinalResultRestricted = computed(() => selectedNode.value?.node_type === 'evaluation' && ['被评估人', '360°评估人', '虚线上级'].includes(selectedExecutorMode.value));
const evaluationTypeDisabled = computed(() => locked('evaluation_type') || isEvaluationTypeFixed.value);
const finalResultDisabled = computed(() => locked('include_final_result') || isFinalResultRestricted.value);
const finalResultRestrictionMessage = computed(() => `执行人为${selectedExecutorMode.value}时无法开启此功能。`);
const inviteExecutorOptions = computed(() => {
    const currentId = selectedNode.value?.node_id;
    return [...new Set(businessNodes.value
            .filter((node) => node.node_type === 'evaluation' && node.node_id !== currentId && node.executor_label)
            .map((node) => node.executor_label))];
});
function ensureInviteDefaults(node) {
    node.allow_invite_other_executors ??= false;
    node.invite_executor_scope ??= 'ALL';
    node.invite_executor_types ??= [];
    node.require_previous_node_completion ??= false;
}
function candidateRolesFor(node) {
    return new Set(businessNodes.value
        .filter((other) => other.node_type === 'evaluation' && other.node_id !== node.node_id && other.executor_label)
        .map((other) => other.executor_label));
}
function pruneInviteSelections() {
    for (const node of businessNodes.value) {
        ensureInviteDefaults(node);
        const allowed = candidateRolesFor(node);
        const filtered = [...new Set(node.invite_executor_types.filter((role) => allowed.has(role)))];
        if (filtered.length !== node.invite_executor_types.length || filtered.some((role, index) => role !== node.invite_executor_types[index]))
            node.invite_executor_types = filtered;
    }
}
function invalidInviteNodeId() {
    const reviewers = businessNodes.value.filter((node) => node.node_type === 'evaluation' && node.executor_label === '360°评估人');
    const invalid = reviewers.filter((node) => node.allow_invite_other_executors && node.invite_executor_scope === 'PARTIAL' && node.invite_executor_types.length === 0);
    return reviewers.length > 0 && invalid.length === reviewers.length ? invalid[0].node_id : null;
}
function normalizeRestrictedExecutor(node) {
    if (node.node_type !== 'evaluation')
        return;
    if (node.executor_label === '被评估人')
        node.evaluation_type = 'SINGLE';
    else if (node.executor_label === '360°评估人')
        node.evaluation_type = 'MULTI';
    else if (node.executor_label === '实线上级') {
        node.evaluation_type = 'SINGLE';
        return;
    }
    else if (node.executor_label === '虚线上级') {
        node.include_final_result = false;
        return;
    }
    else
        return;
    node.include_final_result = false;
}
function normalizeSharedManagerExecutor(node) {
    if (!['result_communication', 'reviewer_360_confirm'].includes(node.node_type))
        return;
    if (!resultCommunicationExecutorModeOptions.some((option) => option.label === node.executor_label))
        node.executor_label = '实线上级';
    if (node.node_type === 'reviewer_360_confirm') {
        const allowed = new Set(reviewer360ConfirmExecutorOptions.map((option) => option.type));
        node.executor_types = [...new Set(node.executor_types.filter((type) => allowed.has(type)))];
    }
    if (node.executor_label === '实线上级' && node.executor_types.length === 0)
        node.executor_types = ['DIRECT_MANAGER'];
}
function normalizeFixedSubjectExecutor(node) {
    if (!['work_summary', 'reviewer_360_invite', 'result_view'].includes(node.node_type))
        return;
    node.executor_label = SUBJECT_EXECUTOR_OPTION.label;
    node.executor_types = [SUBJECT_EXECUTOR_OPTION.type];
}
function normalizeSubjectConfirmation(node) {
    node.subject_confirm_required = node.node_type === 'result_view' ? Boolean(node.subject_confirm_required) : false;
}
function normalizeCalibrationExecutor(node) {
    if (node.node_type !== 'calibration')
        return;
    node.executor_label = calibrationExecutorOption.label;
    node.executor_types = [calibrationExecutorOption.type];
}
function normalizeCalibrationReason(node) {
    if (node.node_type !== 'calibration') {
        node.calibration_reason_enabled = false;
        node.calibration_reason_required = false;
        return;
    }
    node.calibration_reason_enabled ??= true;
    node.calibration_reason_required = Boolean(node.calibration_reason_enabled && node.calibration_reason_required);
}
function normalizePreviousNodeRequirement(node, index) {
    node.require_previous_node_completion = node.node_type === 'reviewer_360_invite' && index > 0
        ? Boolean(node.require_previous_node_completion)
        : false;
}
function normalizeNode(node, index) {
    ensureInviteDefaults(node);
    normalizeRestrictedExecutor(node);
    normalizeSharedManagerExecutor(node);
    normalizeFixedSubjectExecutor(node);
    normalizeSubjectConfirmation(node);
    normalizeCalibrationExecutor(node);
    normalizeCalibrationReason(node);
    normalizePreviousNodeRequirement(node, index);
    if (node.node_type === 'result_reconsideration')
        node.appeal_prompt_content ||= DEFAULT_APPEAL_PROMPT;
    if (node.node_type === 'result_reconsideration')
        node.appeal_reason_instruction ||= DEFAULT_APPEAL_REASON_INSTRUCTION;
}
function updateCalibrationReasonEnabled(enabled) {
    if (!selectedNode.value || selectedNode.value.node_type !== 'calibration')
        return;
    selectedNode.value.calibration_reason_enabled = enabled;
    if (!enabled)
        selectedNode.value.calibration_reason_required = false;
}
function updateSubjectConfirmation(enabled) {
    if (!selectedNode.value || selectedNode.value.node_type !== 'result_view')
        return;
    selectedNode.value.subject_confirm_required = enabled;
}
function applyExecutorSelectionDefaults(node) {
    if (node.node_type !== 'evaluation')
        return;
    normalizeRestrictedExecutor(node);
    if (node.executor_label !== '被评估人' && node.executor_label !== '360°评估人') {
        node.evaluation_type = 'SINGLE';
        node.include_final_result = false;
    }
}
function updateFinalResultTooltipPosition() {
    if (!finalResultTooltipVisible.value || !finalResultSwitchAnchor.value)
        return;
    const anchorRect = finalResultSwitchAnchor.value.getBoundingClientRect();
    finalResultTooltipStyle.value = {
        left: `${anchorRect.left + anchorRect.width / 2 - 209.167}px`,
        top: `${anchorRect.top - 57.333}px`,
    };
}
function scheduleFinalResultTooltip() {
    if (!isFinalResultRestricted.value)
        return;
    if (finalResultTooltipTimer !== null)
        clearTimeout(finalResultTooltipTimer);
    finalResultTooltipTimer = setTimeout(() => {
        finalResultTooltipVisible.value = true;
        finalResultTooltipTimer = null;
        void nextTick(updateFinalResultTooltipPosition);
    }, 138);
}
function hideFinalResultTooltip() {
    if (finalResultTooltipTimer !== null)
        clearTimeout(finalResultTooltipTimer);
    finalResultTooltipTimer = null;
    finalResultTooltipVisible.value = false;
}
function nodeBeforeConnector(index) { return index > 0 ? businessNodes.value[index - 1] : undefined; }
function standardNodeLabel(type) { return standardNodeLabels[type] ?? '流程环节'; }
function hasNodeType(type) { return businessNodes.value.some((node) => node.node_type === type); }
function canAddAtConnector(index) { const previousType = nodeBeforeConnector(index)?.node_type; if (previousType === 'result_view')
    return !hasNodeType('result_reconsideration'); if (previousType === 'result_reconsideration')
    return false; return true; }
const availableAddableOptions = computed(() => { const index = popoverIndex.value; if (index === null)
    return []; const previousType = nodeBeforeConnector(index)?.node_type; if (previousType === 'result_view')
    return hasNodeType('result_reconsideration') ? [] : [resultReconsiderationOption]; if (previousType === 'result_reconsideration')
    return []; return standardAddableOptions.filter((option) => option.type === 'evaluation' || !hasNodeType(option.type)); });
function cancelPopoverClose() { if (popoverCloseTimer !== null) {
    clearTimeout(popoverCloseTimer);
    popoverCloseTimer = null;
} }
function updatePopoverPosition() {
    updateFinalResultTooltipPosition();
    const canvas = workflowCanvas.value;
    const popover = stagePopover.value;
    const addCircle = activeConnector?.querySelector('.add-circle');
    if (!canvas || !popover || !addCircle || !activeConnector)
        return;
    const addRect = addCircle.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const popoverContent = popover.querySelector('.stage-popover-content');
    const viewportTop = Math.max(0, canvasRect.top);
    const viewportBottom = Math.min(window.innerHeight, canvasRect.bottom);
    const availableHeight = Math.max(0, viewportBottom - viewportTop);
    const naturalPopoverHeight = Math.min(popoverContent?.scrollHeight || popoverRect.height, availableHeight);
    const addCenterY = addRect.top + addRect.height / 2;
    const topArrowAvailableHeight = Math.max(32, viewportBottom - (addCenterY - 16));
    const bottomArrowAvailableHeight = Math.max(32, addCenterY + 16 - viewportTop);
    const useTopArrow = naturalPopoverHeight <= topArrowAvailableHeight || topArrowAvailableHeight >= bottomArrowAvailableHeight;
    const placementAvailableHeight = Math.min(availableHeight, useTopArrow ? topArrowAvailableHeight : bottomArrowAvailableHeight);
    const popoverHeight = Math.min(naturalPopoverHeight, placementAvailableHeight);
    popoverArrowCenter.value = useTopArrow ? 16 : Math.max(16, popoverHeight - 16);
    const top = addCenterY - popoverArrowCenter.value;
    popoverPositionStyle.value = {
        transform: `translate3d(${addRect.right + 10 + window.scrollX}px, ${top + window.scrollY}px, 0)`,
        transformOrigin: `0 ${popoverArrowCenter.value}px`,
        maxHeight: `${placementAvailableHeight}px`,
        visibility: 'visible',
    };
}
function observePopoverSize() {
    popoverResizeObserver?.disconnect();
    if (typeof ResizeObserver === 'undefined' || !stagePopover.value)
        return;
    popoverResizeObserver = new ResizeObserver(updatePopoverPosition);
    popoverResizeObserver.observe(stagePopover.value);
}
function showPopover(index, event) {
    if (!canAddAtConnector(index))
        return;
    const connector = event?.currentTarget;
    if (connector instanceof HTMLElement)
        activeConnector = connector;
    cancelPopoverClose();
    popoverPositionStyle.value = { transform: 'translate3d(0, 0, 0)', visibility: 'hidden' };
    popoverIndex.value = index;
    void nextTick(() => { updatePopoverPosition(); observePopoverSize(); });
}
function closePopover() { popoverIndex.value = null; activeConnector = null; popoverResizeObserver?.disconnect(); }
function schedulePopoverClose() { cancelPopoverClose(); popoverCloseTimer = setTimeout(() => { closePopover(); popoverCloseTimer = null; }, 120); }
function selectNode(id) { if (!id)
    return; selectedId.value = id; closePopover(); }
function addNode(type) { const insertionIndex = popoverIndex.value; const option = addableOptions.find((item) => item.type === type); if (insertionIndex === null || !option)
    return; const previousType = nodeBeforeConnector(insertionIndex)?.node_type; if (type === 'result_reconsideration') {
    if (previousType !== 'result_view' || hasNodeType(type))
        return;
}
else if (previousType === 'result_view' || previousType === 'result_reconsideration' || (type !== 'evaluation' && hasNodeType(type)))
    return; const id = `${type}-${Date.now()}`; const fixedSubject = ['work_summary', 'reviewer_360_invite'].includes(type); const fixedCalibration = type === 'calibration'; const sharedManagerExecutor = ['evaluation', 'result_communication', 'reviewer_360_confirm'].includes(type); businessNodes.value.splice(insertionIndex, 0, { node_id: id, node_type: type, name: option.label, description: '', order: 0, executor_types: type === 'result_reconsideration' ? ['HRBP'] : fixedSubject ? [SUBJECT_EXECUTOR_OPTION.type] : fixedCalibration ? [CALIBRATION_EXECUTOR_OPTION.type] : ['DIRECT_MANAGER'], executor_label: type === 'result_reconsideration' ? 'HRBP' : fixedSubject ? SUBJECT_EXECUTOR_OPTION.label : fixedCalibration ? CALIBRATION_EXECUTOR_OPTION.label : sharedManagerExecutor ? '实线上级' : '直属上级', executor_config: type === 'result_reconsideration' ? { mode: 'MULTI_ROLE', roles: [{ type: 'HRBP' }] } : undefined, appeal_prompt_content: type === 'result_reconsideration' ? DEFAULT_APPEAL_PROMPT : undefined, appeal_reason_instruction: type === 'result_reconsideration' ? DEFAULT_APPEAL_REASON_INSTRUCTION : undefined, evaluation_type: type === 'evaluation' ? 'SINGLE' : null, include_final_result: false, system: false, allow_invite_other_executors: false, invite_executor_scope: 'ALL', invite_executor_types: [], require_previous_node_completion: false, calibration_reason_enabled: fixedCalibration, calibration_reason_required: false }); selectedId.value = id; closePopover(); renumber(); }
function canDeleteNode(node) { return !node.system && (node.node_type !== 'evaluation' || evaluationNodeCount.value > 1); }
function removeNode(id) { if (!id)
    return; const node = businessNodes.value.find((item) => item.node_id === id); if (!node || !canDeleteNode(node))
    return; businessNodes.value = businessNodes.value.filter((item) => item.node_id !== id); selectedId.value = null; renumber(); }
function renumber() { businessNodes.value.forEach((node, index) => { node.order = index + 1; }); }
function locked(field) { return usageSummary.value.cycle_count > 0 && !['description', 'appeal_prompt_content'].includes(field); }
watch(businessNodes, () => {
    pruneInviteSelections();
    if (inviteValidationNodeId.value && invalidInviteNodeId() !== inviteValidationNodeId.value)
        inviteValidationNodeId.value = null;
}, { deep: true });
onMounted(async () => { window.addEventListener('resize', updatePopoverPosition); window.addEventListener('scroll', updatePopoverPosition, true); window.addEventListener('resize', updateAppealPreviewPosition); window.addEventListener('scroll', updateAppealPreviewPosition, true); if (!props.templateId)
    return; try {
    const data = await performanceTemplateApi.getWorkflow(props.templateId);
    usageSummary.value = data.usage_summary;
    if (data.nodes?.length) {
        data.nodes.forEach(normalizeNode);
        businessNodes.value = data.nodes;
        pruneInviteSelections();
    }
}
catch { /* API error is surfaced by the shared client interceptor. */ } });
onBeforeUnmount(() => { cancelPopoverClose(); hideFinalResultTooltip(); hideAppealPreview(); popoverResizeObserver?.disconnect(); window.removeEventListener('resize', updatePopoverPosition); window.removeEventListener('scroll', updatePopoverPosition, true); window.removeEventListener('resize', updateAppealPreviewPosition); window.removeEventListener('scroll', updateAppealPreviewPosition, true); });
async function save() {
    businessNodes.value.forEach(normalizeNode);
    pruneInviteSelections();
    inviteValidationNodeId.value = invalidInviteNodeId();
    if (inviteValidationNodeId.value) {
        selectedId.value = inviteValidationNodeId.value;
        await nextTick();
        document.querySelector('.invite-role-error')?.scrollIntoView({ block: 'nearest' });
        return;
    }
    if (!props.templateId) {
        emit('next');
        return;
    }
    saving.value = true;
    try {
        renumber();
        const data = await performanceTemplateApi.updateWorkflow(props.templateId, { nodes: businessNodes.value });
        data.nodes.forEach(normalizeNode);
        businessNodes.value = data.nodes;
        emit('next');
    }
    finally {
        saving.value = false;
    }
}
const __VLS_exposed = { save };
defineExpose(__VLS_exposed);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['banner-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['workflow-body']} */ ;
/** @type {__VLS_StyleScopedClasses['stage-node']} */ ;
/** @type {__VLS_StyleScopedClasses['stage-node']} */ ;
/** @type {__VLS_StyleScopedClasses['selected']} */ ;
/** @type {__VLS_StyleScopedClasses['stage-node']} */ ;
/** @type {__VLS_StyleScopedClasses['selected']} */ ;
/** @type {__VLS_StyleScopedClasses['node-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['node-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['node-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['node-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['node-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-connector--passive']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-line']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-connector']} */ ;
/** @type {__VLS_StyleScopedClasses['add-circle']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['popover-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['popover-stage']} */ ;
/** @type {__VLS_StyleScopedClasses['popover-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['stage-node']} */ ;
/** @type {__VLS_StyleScopedClasses['stage-node']} */ ;
/** @type {__VLS_StyleScopedClasses['selected']} */ ;
/** @type {__VLS_StyleScopedClasses['node-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['stage-node']} */ ;
/** @type {__VLS_StyleScopedClasses['selected']} */ ;
/** @type {__VLS_StyleScopedClasses['node-title']} */ ;
/** @type {__VLS_StyleScopedClasses['config-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['stage-node']} */ ;
/** @type {__VLS_StyleScopedClasses['stage-node']} */ ;
/** @type {__VLS_StyleScopedClasses['stage-node']} */ ;
/** @type {__VLS_StyleScopedClasses['node-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['stage-node']} */ ;
/** @type {__VLS_StyleScopedClasses['node-title']} */ ;
/** @type {__VLS_StyleScopedClasses['stage-node']} */ ;
/** @type {__VLS_StyleScopedClasses['node-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['stage-node']} */ ;
/** @type {__VLS_StyleScopedClasses['node-title']} */ ;
/** @type {__VLS_StyleScopedClasses['delete-node']} */ ;
/** @type {__VLS_StyleScopedClasses['delete-node']} */ ;
/** @type {__VLS_StyleScopedClasses['stage-node']} */ ;
/** @type {__VLS_StyleScopedClasses['delete-node']} */ ;
/** @type {__VLS_StyleScopedClasses['delete-node']} */ ;
/** @type {__VLS_StyleScopedClasses['delete-node']} */ ;
/** @type {__VLS_StyleScopedClasses['delete-node']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-form']} */ ;
/** @type {__VLS_StyleScopedClasses['form-row']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-form']} */ ;
/** @type {__VLS_StyleScopedClasses['evaluation-type-row']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__radio__wallpaper']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__radio__wrapper--checked']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__radio__checked-ink']} */ ;
/** @type {__VLS_StyleScopedClasses['radio-info-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__radio__wrapper--disable']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__radio__input']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__radio__wrapper--disable']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__radio__wallpaper']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__radio__wrapper--checked']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__radio__wrapper--disable']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__radio__wallpaper']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__radio__wrapper--disable']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__radio__checked-ink']} */ ;
/** @type {__VLS_StyleScopedClasses['final-result-switch-anchor']} */ ;
/** @type {__VLS_StyleScopedClasses['final-result-tooltip-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['final-result-tooltip-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['final-result-setting']} */ ;
/** @type {__VLS_StyleScopedClasses['final-result-row']} */ ;
/** @type {__VLS_StyleScopedClasses['invite-scope-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['invite-role-control']} */ ;
/** @type {__VLS_StyleScopedClasses['invite-scope-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__radio__wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['invite-role-control']} */ ;
/** @type {__VLS_StyleScopedClasses['invite-scope-panel--error']} */ ;
/** @type {__VLS_StyleScopedClasses['invite-role-control']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-prompt-label']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-prompt-edit']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-form-label']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-modal-mask']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-modal']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-modal-body']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-button']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-button--primary']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-prompt-setting']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-preview-button']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-preview-button']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-prompt-edit']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-prompt-edit']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-preview-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-preview-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-preview-relative']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-preview-modal']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-preview-relative']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-preview-modal']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-preview-header']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-preview-title']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-preview-header']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-preview-description']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-preview-notice']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-preview-notice-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-preview-textarea']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-preview-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-preview-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-preview-actions']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workflow-page" },
});
if (__VLS_ctx.usageSummary.cycle_count > 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "usage-banner" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "banner-icon" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "banner-copy" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.a, __VLS_intrinsicElements.a)({});
    (__VLS_ctx.usageSummary.cycle_count);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.usageSummary.cycle_count > 0))
                    return;
                __VLS_ctx.bannerVisible = false;
            } },
        ...{ class: "banner-close" },
        type: "button",
        'aria-label': "关闭提示",
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workflow-body" },
    ...{ class: ({ 'with-banner': __VLS_ctx.bannerVisible && __VLS_ctx.usageSummary.cycle_count > 0 }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ onScroll: (__VLS_ctx.updatePopoverPosition) },
    ref: "workflowCanvas",
    ...{ class: "workflow-canvas" },
    'aria-label': "评估流程模板",
});
/** @type {typeof __VLS_ctx.workflowCanvas} */ ;
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ class: "template-entry" },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flow-stack" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "system-node" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onMouseenter: (...[$event]) => {
            __VLS_ctx.showPopover(0, $event);
        } },
    ...{ onMouseleave: (__VLS_ctx.schedulePopoverClose) },
    ...{ onFocus: (...[$event]) => {
            __VLS_ctx.showPopover(0, $event);
        } },
    ...{ onBlur: (__VLS_ctx.schedulePopoverClose) },
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.showPopover(0, $event);
        } },
    ...{ class: "flow-connector" },
    ...{ class: ({ open: __VLS_ctx.popoverIndex === 0 }) },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "flow-line" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "add-circle" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "flow-line" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "triangle" },
});
for (const [node, index] of __VLS_getVForSourceType((__VLS_ctx.businessNodes))) {
    (node.node_id);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.selectNode(node.node_id);
            } },
        ...{ onKeydown: (...[$event]) => {
                __VLS_ctx.selectNode(node.node_id);
            } },
        ...{ onKeydown: (...[$event]) => {
                __VLS_ctx.selectNode(node.node_id);
            } },
        ...{ class: "stage-node" },
        ...{ class: ({ selected: __VLS_ctx.selectedId === node.node_id }) },
        role: "button",
        tabindex: "0",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "node-title-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "node-icon" },
        'aria-hidden': "true",
    });
    /** @type {[typeof PerformanceWorkflowStageIcon, ]} */ ;
    // @ts-ignore
    const __VLS_0 = __VLS_asFunctionalComponent(PerformanceWorkflowStageIcon, new PerformanceWorkflowStageIcon({
        type: (node.node_type),
    }));
    const __VLS_1 = __VLS_0({
        type: (node.node_type),
    }, ...__VLS_functionalComponentArgsRest(__VLS_0));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "node-title" },
    });
    (node.name);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "node-executor" },
    });
    (node.executor_label);
    if (__VLS_ctx.canDeleteNode(node)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.canDeleteNode(node)))
                        return;
                    __VLS_ctx.removeNode(node.node_id);
                } },
            ...{ class: "delete-node" },
            type: "button",
            'aria-label': (`删除${node.name}`),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            width: "16",
            height: "16",
            viewBox: "0 0 24 24",
            fill: "none",
            xmlns: "http://www.w3.org/2000/svg",
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M8 4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2h5a1 1 0 1 1 0 2h-1v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6H3a1 1 0 0 1 0-2h5ZM6 6v14h12V6H6Zm4 3a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0v-6a1 1 0 0 1 1-1Zm4 0a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0v-6a1 1 0 0 1 1-1Z",
            fill: "currentColor",
        });
    }
    if (__VLS_ctx.canAddAtConnector(index + 1)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onMouseenter: (...[$event]) => {
                    if (!(__VLS_ctx.canAddAtConnector(index + 1)))
                        return;
                    __VLS_ctx.showPopover(index + 1, $event);
                } },
            ...{ onMouseleave: (__VLS_ctx.schedulePopoverClose) },
            ...{ onFocus: (...[$event]) => {
                    if (!(__VLS_ctx.canAddAtConnector(index + 1)))
                        return;
                    __VLS_ctx.showPopover(index + 1, $event);
                } },
            ...{ onBlur: (__VLS_ctx.schedulePopoverClose) },
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.canAddAtConnector(index + 1)))
                        return;
                    __VLS_ctx.showPopover(index + 1, $event);
                } },
            ...{ class: "flow-connector" },
            ...{ class: ({ open: __VLS_ctx.popoverIndex === index + 1 }) },
            type: "button",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "flow-line" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "add-circle" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "flow-line" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "triangle" },
        });
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "flow-connector flow-connector--passive" },
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "flow-line" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "triangle" },
        });
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "system-node" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
    ...{ class: "config-panel" },
});
if (__VLS_ctx.selectedNode) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "panel-title" },
    });
    (__VLS_ctx.standardNodeLabel(__VLS_ctx.selectedNode.node_type));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "panel-scroll" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "panel-form" },
    });
    /** @type {[typeof WorkflowNodeBasicFields, ]} */ ;
    // @ts-ignore
    const __VLS_3 = __VLS_asFunctionalComponent(WorkflowNodeBasicFields, new WorkflowNodeBasicFields({
        node: (__VLS_ctx.selectedNode),
        locked: (__VLS_ctx.locked),
    }));
    const __VLS_4 = __VLS_3({
        node: (__VLS_ctx.selectedNode),
        locked: (__VLS_ctx.locked),
    }, ...__VLS_functionalComponentArgsRest(__VLS_3));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "form-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "form-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "required-mark" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        ...{ class: "form-control" },
        disabled: (__VLS_ctx.locked('name')),
    });
    (__VLS_ctx.selectedNode.name);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "form-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "form-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.textarea)({
        value: (__VLS_ctx.selectedNode.description),
        ...{ class: "form-control form-textarea" },
        disabled: (__VLS_ctx.locked('description')),
    });
    if (__VLS_ctx.selectedNode.node_type === 'result_reconsideration') {
        /** @type {[typeof PerformanceMultiExecutorField, ]} */ ;
        // @ts-ignore
        const __VLS_6 = __VLS_asFunctionalComponent(PerformanceMultiExecutorField, new PerformanceMultiExecutorField({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (__VLS_ctx.resultReconsiderationExecutorConfig),
            disabled: (__VLS_ctx.locked('executor_config')),
            peopleOptions: (__VLS_ctx.specifiedPeopleOptions),
            error: (__VLS_ctx.resultExecutorError),
        }));
        const __VLS_7 = __VLS_6({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (__VLS_ctx.resultReconsiderationExecutorConfig),
            disabled: (__VLS_ctx.locked('executor_config')),
            peopleOptions: (__VLS_ctx.specifiedPeopleOptions),
            error: (__VLS_ctx.resultExecutorError),
        }, ...__VLS_functionalComponentArgsRest(__VLS_6));
        let __VLS_9;
        let __VLS_10;
        let __VLS_11;
        const __VLS_12 = {
            'onUpdate:modelValue': (__VLS_ctx.updateResultExecutorConfig)
        };
        var __VLS_8;
    }
    if (__VLS_ctx.selectedNode.node_type === 'result_reconsideration') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "appeal-prompt-setting" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "appeal-prompt-header" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "appeal-prompt-label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onMouseenter: (__VLS_ctx.scheduleAppealPreview) },
            ...{ onMouseleave: (__VLS_ctx.hideAppealPreview) },
            ...{ onFocus: (__VLS_ctx.showAppealPreview) },
            ...{ onBlur: (__VLS_ctx.hideAppealPreview) },
            ref: "appealPreviewButton",
            ...{ class: "appeal-preview-button" },
            type: "button",
        });
        /** @type {typeof __VLS_ctx.appealPreviewButton} */ ;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "appeal-prompt-control" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "appeal-prompt-help" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.openAppealPromptEditor) },
            ...{ class: "appeal-prompt-edit" },
            type: "button",
            disabled: (__VLS_ctx.locked('appeal_prompt_content')),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "appeal-edit-icon" },
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            width: "14",
            height: "14",
            viewBox: "0 0 24 24",
            fill: "none",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "m17.57 7.244-.006-.006.37-.37a1 1 0 0 0 .001-1.412l-3.434-3.453-.002-.002a1 1 0 0 0-1.414 0l-.705.706.01.01L2 13.186V17a1 1 0 0 0 1 1h3.814L17.57 7.244Zm-3.273.389-2.015-2.015 1.487-1.515 2.023 2.034-1.495 1.496Zm-3.415-.587 2.002 2.002-6.913 6.92h-.004l-1.934-1.935v-.003l6.849-6.984ZM3 20a1 1 0 1 0 0 2h18a1 1 0 0 0 0-2H3Z",
            fill: "currentColor",
        });
    }
    if (__VLS_ctx.fixedExecutorOptionByNodeType[__VLS_ctx.selectedNode.node_type]) {
        /** @type {[typeof WorkflowFixedExecutorField, ]} */ ;
        // @ts-ignore
        const __VLS_13 = __VLS_asFunctionalComponent(WorkflowFixedExecutorField, new WorkflowFixedExecutorField({
            executor: (__VLS_ctx.fixedExecutorOptionByNodeType[__VLS_ctx.selectedNode.node_type]),
        }));
        const __VLS_14 = __VLS_13({
            executor: (__VLS_ctx.fixedExecutorOptionByNodeType[__VLS_ctx.selectedNode.node_type]),
        }, ...__VLS_functionalComponentArgsRest(__VLS_13));
    }
    if (__VLS_ctx.selectedNode.node_type === 'result_view') {
        /** @type {[typeof PerformanceSwitchSettingRow, ]} */ ;
        // @ts-ignore
        const __VLS_16 = __VLS_asFunctionalComponent(PerformanceSwitchSettingRow, new PerformanceSwitchSettingRow({
            ...{ 'onUpdate:modelValue': {} },
            ...{ class: "subject-confirm-setting" },
            modelValue: (Boolean(__VLS_ctx.selectedNode.subject_confirm_required)),
            label: "需要被评估人确认绩效结果",
            disabled: (__VLS_ctx.locked('subject_confirm_required')),
        }));
        const __VLS_17 = __VLS_16({
            ...{ 'onUpdate:modelValue': {} },
            ...{ class: "subject-confirm-setting" },
            modelValue: (Boolean(__VLS_ctx.selectedNode.subject_confirm_required)),
            label: "需要被评估人确认绩效结果",
            disabled: (__VLS_ctx.locked('subject_confirm_required')),
        }, ...__VLS_functionalComponentArgsRest(__VLS_16));
        let __VLS_19;
        let __VLS_20;
        let __VLS_21;
        const __VLS_22 = {
            'onUpdate:modelValue': (__VLS_ctx.updateSubjectConfirmation)
        };
        var __VLS_18;
    }
    if (__VLS_ctx.selectedNode.node_type === 'calibration') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "calibration-reason-setting" },
        });
        /** @type {[typeof PerformanceSwitchSettingRow, ]} */ ;
        // @ts-ignore
        const __VLS_23 = __VLS_asFunctionalComponent(PerformanceSwitchSettingRow, new PerformanceSwitchSettingRow({
            ...{ 'onUpdate:modelValue': {} },
            ...{ class: "calibration-reason-setting__title" },
            modelValue: (Boolean(__VLS_ctx.selectedNode.calibration_reason_enabled)),
            label: "填写调整原因",
            disabled: (__VLS_ctx.locked('calibration_reason_enabled')),
        }));
        const __VLS_24 = __VLS_23({
            ...{ 'onUpdate:modelValue': {} },
            ...{ class: "calibration-reason-setting__title" },
            modelValue: (Boolean(__VLS_ctx.selectedNode.calibration_reason_enabled)),
            label: "填写调整原因",
            disabled: (__VLS_ctx.locked('calibration_reason_enabled')),
        }, ...__VLS_functionalComponentArgsRest(__VLS_23));
        let __VLS_26;
        let __VLS_27;
        let __VLS_28;
        const __VLS_29 = {
            'onUpdate:modelValue': (__VLS_ctx.updateCalibrationReasonEnabled)
        };
        var __VLS_25;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "calibration-reason-setting__help" },
        });
        if (__VLS_ctx.selectedNode.calibration_reason_enabled) {
            /** @type {[typeof PerformanceCheckbox, ]} */ ;
            // @ts-ignore
            const __VLS_30 = __VLS_asFunctionalComponent(PerformanceCheckbox, new PerformanceCheckbox({
                ...{ 'onUpdate:modelValue': {} },
                ...{ class: "calibration-reason-setting__required" },
                modelValue: (Boolean(__VLS_ctx.selectedNode.calibration_reason_required)),
                label: "必填",
                disabled: (__VLS_ctx.locked('calibration_reason_required')),
            }));
            const __VLS_31 = __VLS_30({
                ...{ 'onUpdate:modelValue': {} },
                ...{ class: "calibration-reason-setting__required" },
                modelValue: (Boolean(__VLS_ctx.selectedNode.calibration_reason_required)),
                label: "必填",
                disabled: (__VLS_ctx.locked('calibration_reason_required')),
            }, ...__VLS_functionalComponentArgsRest(__VLS_30));
            let __VLS_33;
            let __VLS_34;
            let __VLS_35;
            const __VLS_36 = {
                'onUpdate:modelValue': (...[$event]) => {
                    if (!(__VLS_ctx.selectedNode))
                        return;
                    if (!(__VLS_ctx.selectedNode.node_type === 'calibration'))
                        return;
                    if (!(__VLS_ctx.selectedNode.calibration_reason_enabled))
                        return;
                    __VLS_ctx.selectedNode.calibration_reason_required = $event;
                }
            };
            var __VLS_32;
        }
    }
    if (__VLS_ctx.selectedNode.node_type === 'reviewer_360_invite' && __VLS_ctx.selectedNodeHasPrevious) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "previous-node-setting" },
        });
        /** @type {[typeof PerformanceSwitchSettingRow, ]} */ ;
        // @ts-ignore
        const __VLS_37 = __VLS_asFunctionalComponent(PerformanceSwitchSettingRow, new PerformanceSwitchSettingRow({
            modelValue: (__VLS_ctx.selectedNode.require_previous_node_completion),
            label: "设置执行人需完成上一环节任务",
            info: (__VLS_ctx.previousNodeCompletionInfo),
            infoColor: "#3370ff",
            disabled: (__VLS_ctx.locked('require_previous_node_completion')),
        }));
        const __VLS_38 = __VLS_37({
            modelValue: (__VLS_ctx.selectedNode.require_previous_node_completion),
            label: "设置执行人需完成上一环节任务",
            info: (__VLS_ctx.previousNodeCompletionInfo),
            infoColor: "#3370ff",
            disabled: (__VLS_ctx.locked('require_previous_node_completion')),
        }, ...__VLS_functionalComponentArgsRest(__VLS_37));
    }
    if (__VLS_ctx.selectableExecutorNodeTypes.includes(__VLS_ctx.selectedNode.node_type)) {
        /** @type {[typeof WorkflowExecutorField, ]} */ ;
        // @ts-ignore
        const __VLS_40 = __VLS_asFunctionalComponent(WorkflowExecutorField, new WorkflowExecutorField({
            modelValue: (__VLS_ctx.selectedExecutorMode),
            executorTypes: (__VLS_ctx.selectedNode.executor_types),
            options: (__VLS_ctx.selectedExecutorModeOptions),
            managerLevelOptions: (__VLS_ctx.selectedManagerLevelOptions),
            modeDisabled: (__VLS_ctx.locked('executor_label')),
            typesDisabled: (__VLS_ctx.locked('executor_types')),
        }));
        const __VLS_41 = __VLS_40({
            modelValue: (__VLS_ctx.selectedExecutorMode),
            executorTypes: (__VLS_ctx.selectedNode.executor_types),
            options: (__VLS_ctx.selectedExecutorModeOptions),
            managerLevelOptions: (__VLS_ctx.selectedManagerLevelOptions),
            modeDisabled: (__VLS_ctx.locked('executor_label')),
            typesDisabled: (__VLS_ctx.locked('executor_types')),
        }, ...__VLS_functionalComponentArgsRest(__VLS_40));
    }
    if (__VLS_ctx.selectedNode.node_type === 'evaluation') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "form-row evaluation-type-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({
            ...{ class: "font-medium" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "ud__radio-group" },
        });
        for (const [option] of __VLS_getVForSourceType((__VLS_ctx.evaluationTypeOptions))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                key: (option.value),
                ...{ class: "ud__radio__wrapper" },
                ...{ class: ({ 'ud__radio__wrapper--checked': __VLS_ctx.selectedNode.evaluation_type === option.value, 'ud__radio__wrapper--disable': __VLS_ctx.evaluationTypeDisabled }) },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "ud__radio" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
                ...{ class: "ud__radio__input" },
                type: "radio",
                value: (option.value),
                disabled: (__VLS_ctx.evaluationTypeDisabled),
            });
            (__VLS_ctx.selectedNode.evaluation_type);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
                ...{ class: "ud__radio__wallpaper" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
                ...{ class: "ud__radio__checked-ink" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "ud__radio__label-content" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "radio-label-inner" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (option.label);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "radio-info-icon" },
                'aria-hidden': "true",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                width: "1em",
                height: "1em",
                viewBox: "0 0 24 24",
                fill: "none",
                xmlns: "http://www.w3.org/2000/svg",
                'data-icon': "InfoOutlined",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
                d: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 2C5.925 23 1 18.075 1 12S5.925 1 12 1s11 4.925 11 11-4.925 11-11 11Zm-1-7.5v-4a1 1 0 1 1 0-2h1.004c.55 0 .998.445.998.996.003 1.668-.002 3.336-.002 5.004h.5a1 1 0 1 1 0 2h-3a1 1 0 1 1 0-2h.5Zm1-7a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z",
                fill: "currentColor",
            });
        }
        if (__VLS_ctx.selectedExecutorMode === '360°评估人') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "invite-executor-setting" },
            });
            /** @type {[typeof PerformanceSwitchSettingRow, ]} */ ;
            // @ts-ignore
            const __VLS_43 = __VLS_asFunctionalComponent(PerformanceSwitchSettingRow, new PerformanceSwitchSettingRow({
                ...{ class: "invite-executor-title-row" },
                modelValue: (__VLS_ctx.selectedNode.allow_invite_other_executors),
                label: "允许邀请其他评估环节执行人",
                info: (__VLS_ctx.inviteInfoLines),
                infoDelay: (138),
                disabled: (__VLS_ctx.locked('allow_invite_other_executors')),
            }));
            const __VLS_44 = __VLS_43({
                ...{ class: "invite-executor-title-row" },
                modelValue: (__VLS_ctx.selectedNode.allow_invite_other_executors),
                label: "允许邀请其他评估环节执行人",
                info: (__VLS_ctx.inviteInfoLines),
                infoDelay: (138),
                disabled: (__VLS_ctx.locked('allow_invite_other_executors')),
            }, ...__VLS_functionalComponentArgsRest(__VLS_43));
            if (__VLS_ctx.selectedNode.allow_invite_other_executors) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "invite-scope-panel" },
                    ...{ class: ({ 'invite-scope-panel--error': __VLS_ctx.inviteValidationNodeId === __VLS_ctx.selectedNode.node_id }) },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "invite-scope-heading" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "invite-scope-radio-group" },
                });
                for (const [option] of __VLS_getVForSourceType((__VLS_ctx.inviteScopeOptions))) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                        key: (option.value),
                        ...{ class: "ud__radio__wrapper" },
                        ...{ class: ({ 'ud__radio__wrapper--checked': __VLS_ctx.selectedNode.invite_executor_scope === option.value }) },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "ud__radio" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
                        ...{ class: "ud__radio__input" },
                        type: "radio",
                        value: (option.value),
                        disabled: (__VLS_ctx.locked('invite_executor_scope')),
                    });
                    (__VLS_ctx.selectedNode.invite_executor_scope);
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
                        ...{ class: "ud__radio__wallpaper" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
                        ...{ class: "ud__radio__checked-ink" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "ud__radio__label-content" },
                    });
                    (option.label);
                }
                if (__VLS_ctx.selectedNode.invite_executor_scope === 'PARTIAL') {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "invite-role-control" },
                    });
                    /** @type {[typeof PerformanceRoleMultiSelect, ]} */ ;
                    // @ts-ignore
                    const __VLS_46 = __VLS_asFunctionalComponent(PerformanceRoleMultiSelect, new PerformanceRoleMultiSelect({
                        modelValue: (__VLS_ctx.selectedNode.invite_executor_types),
                        options: (__VLS_ctx.inviteExecutorOptions),
                        disabled: (__VLS_ctx.locked('invite_executor_types')),
                        'aria-invalid': (__VLS_ctx.inviteValidationNodeId === __VLS_ctx.selectedNode.node_id),
                    }));
                    const __VLS_47 = __VLS_46({
                        modelValue: (__VLS_ctx.selectedNode.invite_executor_types),
                        options: (__VLS_ctx.inviteExecutorOptions),
                        disabled: (__VLS_ctx.locked('invite_executor_types')),
                        'aria-invalid': (__VLS_ctx.inviteValidationNodeId === __VLS_ctx.selectedNode.node_id),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_46));
                    if (__VLS_ctx.inviteValidationNodeId === __VLS_ctx.selectedNode.node_id) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                            ...{ class: "invite-role-error" },
                        });
                    }
                }
            }
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "final-result-setting" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "final-result-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "final-result-label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ onMouseenter: (__VLS_ctx.scheduleFinalResultTooltip) },
            ...{ onMouseleave: (__VLS_ctx.hideFinalResultTooltip) },
            ...{ onFocusin: (__VLS_ctx.scheduleFinalResultTooltip) },
            ...{ onFocusout: (__VLS_ctx.hideFinalResultTooltip) },
            ref: "finalResultSwitchAnchor",
            ...{ class: "final-result-switch-anchor" },
            tabindex: (__VLS_ctx.isFinalResultRestricted ? 0 : -1),
        });
        /** @type {typeof __VLS_ctx.finalResultSwitchAnchor} */ ;
        /** @type {[typeof PerformanceSwitch, ]} */ ;
        // @ts-ignore
        const __VLS_49 = __VLS_asFunctionalComponent(PerformanceSwitch, new PerformanceSwitch({
            modelValue: (__VLS_ctx.selectedNode.include_final_result),
            disabled: (__VLS_ctx.finalResultDisabled),
            'aria-label': "设置此环节绩效结果为最终结果",
            'aria-describedby': (__VLS_ctx.isFinalResultRestricted ? 'restricted-final-result-tooltip' : undefined),
        }));
        const __VLS_50 = __VLS_49({
            modelValue: (__VLS_ctx.selectedNode.include_final_result),
            disabled: (__VLS_ctx.finalResultDisabled),
            'aria-label': "设置此环节绩效结果为最终结果",
            'aria-describedby': (__VLS_ctx.isFinalResultRestricted ? 'restricted-final-result-tooltip' : undefined),
        }, ...__VLS_functionalComponentArgsRest(__VLS_49));
        if (__VLS_ctx.selectedNode.include_final_result) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "final-result-help" },
            });
        }
        const __VLS_52 = {}.Teleport;
        /** @type {[typeof __VLS_components.Teleport, typeof __VLS_components.Teleport, ]} */ ;
        // @ts-ignore
        const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
            to: "body",
        }));
        const __VLS_54 = __VLS_53({
            to: "body",
        }, ...__VLS_functionalComponentArgsRest(__VLS_53));
        __VLS_55.slots.default;
        if (__VLS_ctx.isFinalResultRestricted && __VLS_ctx.finalResultTooltipVisible) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                id: "restricted-final-result-tooltip",
                ...{ class: "final-result-tooltip-popover" },
                role: "tooltip",
                ...{ style: (__VLS_ctx.finalResultTooltipStyle) },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "final-result-tooltip-content" },
            });
            (__VLS_ctx.finalResultRestrictionMessage);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "final-result-tooltip-arrow" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                width: "16",
                height: "8",
                viewBox: "0 0 16 8",
                fill: "none",
                xmlns: "http://www.w3.org/2000/svg",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
                d: "M8-.5H0v1c1.553 0 3.033.664 4.065 1.825l2.814 3.166a1.5 1.5 0 002.242 0l2.814-3.166A5.438 5.438 0 0116 .5v-1H8z",
            });
        }
        var __VLS_55;
    }
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "empty-panel" },
    });
}
const __VLS_56 = {}.Teleport;
/** @type {[typeof __VLS_components.Teleport, typeof __VLS_components.Teleport, ]} */ ;
// @ts-ignore
const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
    to: "body",
}));
const __VLS_58 = __VLS_57({
    to: "body",
}, ...__VLS_functionalComponentArgsRest(__VLS_57));
__VLS_59.slots.default;
if (__VLS_ctx.appealPreviewVisible) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onMouseenter: (__VLS_ctx.cancelAppealPreviewHide) },
        ...{ onMouseleave: (__VLS_ctx.hideAppealPreview) },
        ...{ class: "appeal-preview-popover" },
        role: "dialog",
        'aria-label': "发起复议预览",
        ...{ style: (__VLS_ctx.appealPreviewStyle) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "appeal-preview-relative" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "appeal-preview-overlay" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "appeal-preview-modal" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "appeal-preview-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "appeal-preview-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "appeal-preview-description" },
    });
    (__VLS_ctx.appealExecutorDescription);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "appeal-preview-body" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "appeal-preview-notice" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "appeal-preview-notice-icon" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        width: "16",
        height: "16",
        viewBox: "0 0 24 24",
        fill: "none",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M13 7.5a1 1 0 1 0-2 0 1 1 0 0 0 2 0Zm-2 4v4h-.5a1 1 0 1 0 0 2h3a1 1 0 1 0 0-2H13c0-.667 0-1.333.002-2 0-1.001.002-2.002 0-3.004a.998.998 0 0 0-.998-.996H11a1 1 0 1 0 0 2Z",
        fill: "#fff",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "appeal-preview-notice-main" },
    });
    (__VLS_ctx.selectedNode?.appeal_prompt_content || __VLS_ctx.DEFAULT_APPEAL_PROMPT);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "appeal-preview-textarea" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.textarea)({
        placeholder: "请输入复议理由",
        readonly: true,
        'aria-label': "复议理由",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "appeal-preview-textarea-suffix" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "appeal-preview-footer" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "appeal-preview-actions" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        type: "button",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        type: "button",
    });
}
var __VLS_59;
const __VLS_60 = {}.Teleport;
/** @type {[typeof __VLS_components.Teleport, typeof __VLS_components.Teleport, ]} */ ;
// @ts-ignore
const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
    to: "body",
}));
const __VLS_62 = __VLS_61({
    to: "body",
}, ...__VLS_functionalComponentArgsRest(__VLS_61));
__VLS_63.slots.default;
if (__VLS_ctx.appealPromptEditorOpen) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (__VLS_ctx.closeAppealPromptEditor) },
        ...{ class: "appeal-modal-mask" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "appeal-modal" },
        role: "dialog",
        'aria-modal': "true",
        'aria-labelledby': "appeal-modal-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
        ...{ class: "appeal-modal-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        id: "appeal-modal-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.closeAppealPromptEditor) },
        ...{ class: "appeal-modal-close" },
        type: "button",
        'aria-label': "关闭",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "appeal-modal-body" },
    });
    /** @type {[typeof PerformanceCountedTextarea, ]} */ ;
    // @ts-ignore
    const __VLS_64 = __VLS_asFunctionalComponent(PerformanceCountedTextarea, new PerformanceCountedTextarea({
        modelValue: (__VLS_ctx.appealPromptDraft),
        label: "提示文案",
        inputId: "appeal-prompt-input",
        maxLength: (1500),
        required: true,
    }));
    const __VLS_65 = __VLS_64({
        modelValue: (__VLS_ctx.appealPromptDraft),
        label: "提示文案",
        inputId: "appeal-prompt-input",
        maxLength: (1500),
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_64));
    /** @type {[typeof PerformanceCountedTextarea, ]} */ ;
    // @ts-ignore
    const __VLS_67 = __VLS_asFunctionalComponent(PerformanceCountedTextarea, new PerformanceCountedTextarea({
        modelValue: (__VLS_ctx.appealReasonInstructionDraft),
        label: "填写说明",
        inputId: "appeal-reason-instruction-input",
        maxLength: (1000),
        required: true,
    }));
    const __VLS_68 = __VLS_67({
        modelValue: (__VLS_ctx.appealReasonInstructionDraft),
        label: "填写说明",
        inputId: "appeal-reason-instruction-input",
        maxLength: (1000),
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_67));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.footer, __VLS_intrinsicElements.footer)({
        ...{ class: "appeal-modal-footer" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.saveAppealPrompt) },
        ...{ class: "appeal-button appeal-button--primary" },
        type: "button",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.closeAppealPromptEditor) },
        ...{ class: "appeal-button" },
        type: "button",
    });
}
var __VLS_63;
const __VLS_70 = {}.Teleport;
/** @type {[typeof __VLS_components.Teleport, typeof __VLS_components.Teleport, ]} */ ;
// @ts-ignore
const __VLS_71 = __VLS_asFunctionalComponent(__VLS_70, new __VLS_70({
    to: "body",
}));
const __VLS_72 = __VLS_71({
    to: "body",
}, ...__VLS_functionalComponentArgsRest(__VLS_71));
__VLS_73.slots.default;
if (__VLS_ctx.popoverIndex !== null) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onMouseenter: (__VLS_ctx.cancelPopoverClose) },
        ...{ onMouseleave: (__VLS_ctx.schedulePopoverClose) },
        ref: "stagePopover",
        ...{ class: "stage-popover" },
        ...{ style: (__VLS_ctx.popoverPositionStyle) },
    });
    /** @type {typeof __VLS_ctx.stagePopover} */ ;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        ...{ class: "popover-arrow" },
        ...{ style: ({ top: `${__VLS_ctx.popoverArrowCenter}px` }) },
        width: "8",
        height: "16",
        viewBox: "0 0 8 16",
        fill: "none",
        xmlns: "http://www.w3.org/2000/svg",
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M-.5 8v8h1c0-1.553.664-3.033 1.825-4.065l3.166-2.814a1.5 1.5 0 000-2.242L2.325 4.065A5.438 5.438 0 01.5 0h-1v8z",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "stage-popover-content" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "popover-title" },
    });
    for (const [option] of __VLS_getVForSourceType((__VLS_ctx.availableAddableOptions))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.popoverIndex !== null))
                        return;
                    __VLS_ctx.addNode(option.type);
                } },
            key: (option.type),
            ...{ class: "popover-stage" },
            type: "button",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "popover-icon" },
            'aria-hidden': "true",
        });
        /** @type {[typeof PerformanceWorkflowStageIcon, ]} */ ;
        // @ts-ignore
        const __VLS_74 = __VLS_asFunctionalComponent(PerformanceWorkflowStageIcon, new PerformanceWorkflowStageIcon({
            type: (option.type),
        }));
        const __VLS_75 = __VLS_74({
            type: (option.type),
        }, ...__VLS_functionalComponentArgsRest(__VLS_74));
        (option.label);
    }
}
var __VLS_73;
if (__VLS_ctx.saving) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "save-state" },
    });
}
/** @type {__VLS_StyleScopedClasses['workflow-page']} */ ;
/** @type {__VLS_StyleScopedClasses['usage-banner']} */ ;
/** @type {__VLS_StyleScopedClasses['banner-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['banner-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['banner-close']} */ ;
/** @type {__VLS_StyleScopedClasses['workflow-body']} */ ;
/** @type {__VLS_StyleScopedClasses['workflow-canvas']} */ ;
/** @type {__VLS_StyleScopedClasses['template-entry']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['system-node']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-connector']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-line']} */ ;
/** @type {__VLS_StyleScopedClasses['add-circle']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-line']} */ ;
/** @type {__VLS_StyleScopedClasses['triangle']} */ ;
/** @type {__VLS_StyleScopedClasses['stage-node']} */ ;
/** @type {__VLS_StyleScopedClasses['node-title-row']} */ ;
/** @type {__VLS_StyleScopedClasses['node-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['node-title']} */ ;
/** @type {__VLS_StyleScopedClasses['node-executor']} */ ;
/** @type {__VLS_StyleScopedClasses['delete-node']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-connector']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-line']} */ ;
/** @type {__VLS_StyleScopedClasses['add-circle']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-line']} */ ;
/** @type {__VLS_StyleScopedClasses['triangle']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-connector']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-connector--passive']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-line']} */ ;
/** @type {__VLS_StyleScopedClasses['triangle']} */ ;
/** @type {__VLS_StyleScopedClasses['system-node']} */ ;
/** @type {__VLS_StyleScopedClasses['config-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-title']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-form']} */ ;
/** @type {__VLS_StyleScopedClasses['form-row']} */ ;
/** @type {__VLS_StyleScopedClasses['form-label']} */ ;
/** @type {__VLS_StyleScopedClasses['required-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['form-control']} */ ;
/** @type {__VLS_StyleScopedClasses['form-row']} */ ;
/** @type {__VLS_StyleScopedClasses['form-label']} */ ;
/** @type {__VLS_StyleScopedClasses['form-control']} */ ;
/** @type {__VLS_StyleScopedClasses['form-textarea']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-prompt-setting']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-prompt-header']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-prompt-label']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-preview-button']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-prompt-control']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-prompt-help']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-prompt-edit']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-edit-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['subject-confirm-setting']} */ ;
/** @type {__VLS_StyleScopedClasses['calibration-reason-setting']} */ ;
/** @type {__VLS_StyleScopedClasses['calibration-reason-setting__title']} */ ;
/** @type {__VLS_StyleScopedClasses['calibration-reason-setting__help']} */ ;
/** @type {__VLS_StyleScopedClasses['calibration-reason-setting__required']} */ ;
/** @type {__VLS_StyleScopedClasses['previous-node-setting']} */ ;
/** @type {__VLS_StyleScopedClasses['form-row']} */ ;
/** @type {__VLS_StyleScopedClasses['evaluation-type-row']} */ ;
/** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__radio-group']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__radio__wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__radio']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__radio__input']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__radio__wallpaper']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__radio__checked-ink']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__radio__label-content']} */ ;
/** @type {__VLS_StyleScopedClasses['radio-label-inner']} */ ;
/** @type {__VLS_StyleScopedClasses['radio-info-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['invite-executor-setting']} */ ;
/** @type {__VLS_StyleScopedClasses['invite-executor-title-row']} */ ;
/** @type {__VLS_StyleScopedClasses['invite-scope-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['invite-scope-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['invite-scope-radio-group']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__radio__wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__radio']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__radio__input']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__radio__wallpaper']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__radio__checked-ink']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__radio__label-content']} */ ;
/** @type {__VLS_StyleScopedClasses['invite-role-control']} */ ;
/** @type {__VLS_StyleScopedClasses['invite-role-error']} */ ;
/** @type {__VLS_StyleScopedClasses['final-result-setting']} */ ;
/** @type {__VLS_StyleScopedClasses['final-result-row']} */ ;
/** @type {__VLS_StyleScopedClasses['final-result-label']} */ ;
/** @type {__VLS_StyleScopedClasses['final-result-switch-anchor']} */ ;
/** @type {__VLS_StyleScopedClasses['final-result-help']} */ ;
/** @type {__VLS_StyleScopedClasses['final-result-tooltip-popover']} */ ;
/** @type {__VLS_StyleScopedClasses['final-result-tooltip-content']} */ ;
/** @type {__VLS_StyleScopedClasses['final-result-tooltip-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-preview-popover']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-preview-relative']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-preview-overlay']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-preview-modal']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-preview-header']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-preview-title']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-preview-description']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-preview-body']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-preview-notice']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-preview-notice-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-preview-notice-main']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-preview-textarea']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-preview-textarea-suffix']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-preview-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-preview-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-modal-mask']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-modal']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-modal-header']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-modal-close']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-modal-body']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-modal-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-button']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-button--primary']} */ ;
/** @type {__VLS_StyleScopedClasses['appeal-button']} */ ;
/** @type {__VLS_StyleScopedClasses['stage-popover']} */ ;
/** @type {__VLS_StyleScopedClasses['popover-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['stage-popover-content']} */ ;
/** @type {__VLS_StyleScopedClasses['popover-title']} */ ;
/** @type {__VLS_StyleScopedClasses['popover-stage']} */ ;
/** @type {__VLS_StyleScopedClasses['popover-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['save-state']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformanceCheckbox: PerformanceCheckbox,
            PerformanceCountedTextarea: PerformanceCountedTextarea,
            PerformanceSwitch: PerformanceSwitch,
            PerformanceSwitchSettingRow: PerformanceSwitchSettingRow,
            WorkflowFixedExecutorField: WorkflowFixedExecutorField,
            WorkflowExecutorField: WorkflowExecutorField,
            PerformanceMultiExecutorField: PerformanceMultiExecutorField,
            WorkflowNodeBasicFields: WorkflowNodeBasicFields,
            PerformanceRoleMultiSelect: PerformanceRoleMultiSelect,
            PerformanceWorkflowStageIcon: PerformanceWorkflowStageIcon,
            saving: saving,
            bannerVisible: bannerVisible,
            popoverIndex: popoverIndex,
            workflowCanvas: workflowCanvas,
            stagePopover: stagePopover,
            popoverArrowCenter: popoverArrowCenter,
            popoverPositionStyle: popoverPositionStyle,
            selectedId: selectedId,
            usageSummary: usageSummary,
            finalResultSwitchAnchor: finalResultSwitchAnchor,
            finalResultTooltipVisible: finalResultTooltipVisible,
            finalResultTooltipStyle: finalResultTooltipStyle,
            inviteValidationNodeId: inviteValidationNodeId,
            appealPromptEditorOpen: appealPromptEditorOpen,
            appealPromptDraft: appealPromptDraft,
            appealReasonInstructionDraft: appealReasonInstructionDraft,
            appealPreviewButton: appealPreviewButton,
            appealPreviewVisible: appealPreviewVisible,
            appealPreviewStyle: appealPreviewStyle,
            DEFAULT_APPEAL_PROMPT: DEFAULT_APPEAL_PROMPT,
            appealExecutorDescription: appealExecutorDescription,
            businessNodes: businessNodes,
            selectedNode: selectedNode,
            specifiedPeopleOptions: specifiedPeopleOptions,
            resultExecutorError: resultExecutorError,
            resultReconsiderationExecutorConfig: resultReconsiderationExecutorConfig,
            updateResultExecutorConfig: updateResultExecutorConfig,
            openAppealPromptEditor: openAppealPromptEditor,
            closeAppealPromptEditor: closeAppealPromptEditor,
            saveAppealPrompt: saveAppealPrompt,
            showAppealPreview: showAppealPreview,
            scheduleAppealPreview: scheduleAppealPreview,
            cancelAppealPreviewHide: cancelAppealPreviewHide,
            hideAppealPreview: hideAppealPreview,
            selectedNodeHasPrevious: selectedNodeHasPrevious,
            fixedExecutorOptionByNodeType: fixedExecutorOptionByNodeType,
            selectableExecutorNodeTypes: selectableExecutorNodeTypes,
            evaluationTypeOptions: evaluationTypeOptions,
            inviteScopeOptions: inviteScopeOptions,
            inviteInfoLines: inviteInfoLines,
            previousNodeCompletionInfo: previousNodeCompletionInfo,
            selectedExecutorModeOptions: selectedExecutorModeOptions,
            selectedManagerLevelOptions: selectedManagerLevelOptions,
            selectedExecutorMode: selectedExecutorMode,
            isFinalResultRestricted: isFinalResultRestricted,
            evaluationTypeDisabled: evaluationTypeDisabled,
            finalResultDisabled: finalResultDisabled,
            finalResultRestrictionMessage: finalResultRestrictionMessage,
            inviteExecutorOptions: inviteExecutorOptions,
            updateCalibrationReasonEnabled: updateCalibrationReasonEnabled,
            updateSubjectConfirmation: updateSubjectConfirmation,
            scheduleFinalResultTooltip: scheduleFinalResultTooltip,
            hideFinalResultTooltip: hideFinalResultTooltip,
            standardNodeLabel: standardNodeLabel,
            canAddAtConnector: canAddAtConnector,
            availableAddableOptions: availableAddableOptions,
            cancelPopoverClose: cancelPopoverClose,
            updatePopoverPosition: updatePopoverPosition,
            showPopover: showPopover,
            schedulePopoverClose: schedulePopoverClose,
            selectNode: selectNode,
            addNode: addNode,
            canDeleteNode: canDeleteNode,
            removeNode: removeNode,
            locked: locked,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {
            ...__VLS_exposed,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
