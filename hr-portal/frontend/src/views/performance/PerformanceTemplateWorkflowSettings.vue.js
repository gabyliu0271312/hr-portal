/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { performanceTemplateApi } from '@/api/performance';
import PerformanceSwitch from '@/components/performance/PerformanceSwitch.vue';
import PerformanceExecutorSelect from '@/components/performance/PerformanceExecutorSelect.vue';
import WorkflowNodeBasicFields from '@/components/performance/WorkflowNodeBasicFields.vue';
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
const businessNodes = ref([
    { node_id: 'evaluation-1', node_type: 'evaluation', name: '评估型环节', description: '', order: 1, executor_types: ['DIRECT_MANAGER'], executor_label: '实线上级', evaluation_type: 'SINGLE', include_final_result: false, system: false },
    { node_id: 'result-view-1', node_type: 'result_view', name: '绩效结果查看环节', description: '', order: 2, executor_types: ['SUBJECT'], executor_label: '被评估人', evaluation_type: null, include_final_result: false, system: true },
]);
const selectedNode = computed(() => businessNodes.value.find((node) => node.node_id === selectedId.value));
const evaluationNodeCount = computed(() => businessNodes.value.filter((node) => node.node_type === 'evaluation').length);
const executorModeOptions = [{ type: 'SUBJECT', label: '被评估人' }, { type: 'REVIEWER_360', label: '360°评估人' }, { type: 'REAL_LINE_MANAGER', label: '实线上级' }, { type: 'VIRTUAL_LINE_MANAGER', label: '虚线上级' }, { type: 'INDICATOR_EVALUATOR', label: '指标评价人' }];
const executorOptions = [{ type: 'DIRECT_MANAGER', label: '直属上级' }, { type: 'LEVEL_1_MANAGER', label: '隔 1 级上级' }, { type: 'LEVEL_2_MANAGER', label: '隔 2 级上级' }, { type: 'LEVEL_3_MANAGER_PLUS', label: '隔 3 级上级及以上' }];
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
const selectedExecutorMode = computed({
    get: () => selectedNode.value?.node_type === 'evaluation' ? (selectedNode.value.executor_label || '实线上级') : '',
    set: (value) => {
        if (selectedNode.value?.node_type === 'evaluation')
            selectedNode.value.executor_label = value;
    },
});
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
    return; const id = `${type}-${Date.now()}`; businessNodes.value.splice(insertionIndex, 0, { node_id: id, node_type: type, name: option.label, description: '', order: 0, executor_types: ['DIRECT_MANAGER'], executor_label: type === 'evaluation' ? '实线上级' : '直属上级', evaluation_type: type === 'evaluation' ? 'SINGLE' : null, include_final_result: false, system: false }); selectedId.value = id; closePopover(); renumber(); }
function canDeleteNode(node) { return !node.system && (node.node_type !== 'evaluation' || evaluationNodeCount.value > 1); }
function removeNode(id) { if (!id)
    return; const node = businessNodes.value.find((item) => item.node_id === id); if (!node || !canDeleteNode(node))
    return; businessNodes.value = businessNodes.value.filter((item) => item.node_id !== id); selectedId.value = null; renumber(); }
function renumber() { businessNodes.value.forEach((node, index) => { node.order = index + 1; }); }
function locked(field) { return usageSummary.value.cycle_count > 0 && field !== 'description'; }
onMounted(async () => { window.addEventListener('resize', updatePopoverPosition); window.addEventListener('scroll', updatePopoverPosition, true); if (!props.templateId)
    return; try {
    const data = await performanceTemplateApi.getWorkflow(props.templateId);
    usageSummary.value = data.usage_summary;
    if (data.nodes?.length)
        businessNodes.value = data.nodes;
}
catch { /* API error is surfaced by the shared client interceptor. */ } });
onBeforeUnmount(() => { cancelPopoverClose(); popoverResizeObserver?.disconnect(); window.removeEventListener('resize', updatePopoverPosition); window.removeEventListener('scroll', updatePopoverPosition, true); });
async function save() { if (!props.templateId) {
    emit('next');
    return;
} ; saving.value = true; try {
    renumber();
    await performanceTemplateApi.updateWorkflow(props.templateId, { nodes: businessNodes.value });
    emit('next');
}
finally {
    saving.value = false;
} }
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
/** @type {__VLS_StyleScopedClasses['select-wrap']} */ ;
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
    if (__VLS_ctx.selectedNode.node_type === 'evaluation') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "form-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "form-label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "required-mark" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "select-wrap" },
        });
        /** @type {[typeof PerformanceExecutorSelect, ]} */ ;
        // @ts-ignore
        const __VLS_6 = __VLS_asFunctionalComponent(PerformanceExecutorSelect, new PerformanceExecutorSelect({
            modelValue: (__VLS_ctx.selectedExecutorMode),
            options: (__VLS_ctx.executorModeOptions),
            disabled: (__VLS_ctx.locked('executor_label')),
        }));
        const __VLS_7 = __VLS_6({
            modelValue: (__VLS_ctx.selectedExecutorMode),
            options: (__VLS_ctx.executorModeOptions),
            disabled: (__VLS_ctx.locked('executor_label')),
        }, ...__VLS_functionalComponentArgsRest(__VLS_6));
        if (false) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
                value: (__VLS_ctx.selectedExecutorMode),
                ...{ class: "form-control form-select" },
                disabled: (__VLS_ctx.locked('executor_label')),
            });
            for (const [option] of __VLS_getVForSourceType((__VLS_ctx.executorModeOptions))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
                    key: (option.type),
                    value: (option.label),
                });
                (option.label);
            }
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "select-arrow" },
            'aria-hidden': "true",
        });
        if (__VLS_ctx.selectedExecutorMode === '实线上级') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "sub-options" },
            });
            for (const [option] of __VLS_getVForSourceType((__VLS_ctx.executorOptions))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                    key: (option.type),
                    ...{ class: "check-row" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
                    type: "checkbox",
                    value: (option.type),
                    disabled: (__VLS_ctx.locked('executor_types')),
                });
                (__VLS_ctx.selectedNode.executor_types);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (option.label);
            }
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "form-row evaluation-type-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "form-label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "radio-group" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            ...{ class: "radio-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            type: "radio",
            value: "SINGLE",
            disabled: (__VLS_ctx.locked('evaluation_type')),
        });
        (__VLS_ctx.selectedNode.evaluation_type);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            ...{ class: "radio-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            type: "radio",
            value: "MULTI",
            disabled: (__VLS_ctx.locked('evaluation_type')),
        });
        (__VLS_ctx.selectedNode.evaluation_type);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "final-result-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "final-result-label" },
        });
        /** @type {[typeof PerformanceSwitch, ]} */ ;
        // @ts-ignore
        const __VLS_9 = __VLS_asFunctionalComponent(PerformanceSwitch, new PerformanceSwitch({
            modelValue: (__VLS_ctx.selectedNode.include_final_result),
            disabled: (__VLS_ctx.locked('include_final_result')),
            'aria-label': "设置此环节绩效结果为最终结果",
        }));
        const __VLS_10 = __VLS_9({
            modelValue: (__VLS_ctx.selectedNode.include_final_result),
            disabled: (__VLS_ctx.locked('include_final_result')),
            'aria-label': "设置此环节绩效结果为最终结果",
        }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    }
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "empty-panel" },
    });
}
const __VLS_12 = {}.Teleport;
/** @type {[typeof __VLS_components.Teleport, typeof __VLS_components.Teleport, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    to: "body",
}));
const __VLS_14 = __VLS_13({
    to: "body",
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
__VLS_15.slots.default;
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
        const __VLS_16 = __VLS_asFunctionalComponent(PerformanceWorkflowStageIcon, new PerformanceWorkflowStageIcon({
            type: (option.type),
        }));
        const __VLS_17 = __VLS_16({
            type: (option.type),
        }, ...__VLS_functionalComponentArgsRest(__VLS_16));
        (option.label);
    }
}
var __VLS_15;
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
/** @type {__VLS_StyleScopedClasses['form-row']} */ ;
/** @type {__VLS_StyleScopedClasses['form-label']} */ ;
/** @type {__VLS_StyleScopedClasses['required-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['select-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['form-control']} */ ;
/** @type {__VLS_StyleScopedClasses['form-select']} */ ;
/** @type {__VLS_StyleScopedClasses['select-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-options']} */ ;
/** @type {__VLS_StyleScopedClasses['check-row']} */ ;
/** @type {__VLS_StyleScopedClasses['form-row']} */ ;
/** @type {__VLS_StyleScopedClasses['evaluation-type-row']} */ ;
/** @type {__VLS_StyleScopedClasses['form-label']} */ ;
/** @type {__VLS_StyleScopedClasses['radio-group']} */ ;
/** @type {__VLS_StyleScopedClasses['radio-row']} */ ;
/** @type {__VLS_StyleScopedClasses['radio-row']} */ ;
/** @type {__VLS_StyleScopedClasses['final-result-row']} */ ;
/** @type {__VLS_StyleScopedClasses['final-result-label']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-panel']} */ ;
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
            PerformanceSwitch: PerformanceSwitch,
            PerformanceExecutorSelect: PerformanceExecutorSelect,
            WorkflowNodeBasicFields: WorkflowNodeBasicFields,
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
            businessNodes: businessNodes,
            selectedNode: selectedNode,
            executorModeOptions: executorModeOptions,
            executorOptions: executorOptions,
            selectedExecutorMode: selectedExecutorMode,
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
