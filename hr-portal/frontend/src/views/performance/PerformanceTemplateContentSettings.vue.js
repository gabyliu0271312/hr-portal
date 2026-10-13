/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { performanceReviewQuestionApi, performanceTemplateApi } from '@/api/performance';
import PerformanceWorkflowStageIcon from './PerformanceWorkflowStageIcon.vue';
import PerformanceTemplateSectionCard from '@/components/performance/PerformanceTemplateSectionCard.vue';
import PerformancePromptModal from '@/components/performance/PerformancePromptModal.vue';
import PerformanceAssessmentContentLayers from '@/components/performance/PerformanceAssessmentContentLayers.vue';
import PerformanceSortableList from '@/components/performance/PerformanceSortableList.vue';
import PerformanceTemplateOperateBar from '@/components/performance/PerformanceTemplateOperateBar.vue';
import PerformanceConfiguredContentBlock from '@/components/performance/PerformanceConfiguredContentBlock.vue';
import ContentSettingsStageRenderer from '@/components/performance/ContentSettingsStageRenderer.vue';
import { getStageContentRule, getStageContentTabs } from '@/components/performance/performanceContentSettingsRules';
const props = defineProps();
const selectedStage = ref(null);
const activeTab = ref('fill');
const loading = ref(false);
const stages = ref([]);
const workflowNodes = ref([]);
const contentLibrary = ref([]);
const ratingOptions = ref([]);
const iconByType = { reviewer_360_invite: '▤', reviewer_360_confirm: '▥', evaluation: '360', calibration: '⌁', result_communication: '▣', result_view: '⌑', result_reconsideration: '↻' };
function ratingLevels(config) {
    const levels = config.levels;
    if (!Array.isArray(levels))
        return [];
    return levels.map((level) => {
        if (typeof level === 'string')
            return level;
        if (!level || typeof level !== 'object')
            return '';
        const record = level;
        return String(record.name || record.label || record.code || '');
    }).filter(Boolean);
}
function toRatingOption(question) {
    const displayMode = question.display_mode ?? question.rule.config.displayMode ?? question.rule.config.display_mode;
    return {
        id: String(question.id),
        label: question.name,
        description: question.rule.name,
        levels: ratingLevels(question.rule.config),
        displayMode: displayMode === '下拉样式' ? '下拉样式' : '标签样式',
    };
}
async function loadRatingOptions() {
    try {
        const questions = await performanceReviewQuestionApi.list('评级');
        ratingOptions.value = questions
            .filter((question) => question.rule.status === 'active' && question.rule.review_type === '评级')
            .map(toRatingOption);
    }
    catch {
        ratingOptions.value = [];
    }
}
const selectedStageData = computed(() => stages.value.find((stage) => stage.id === selectedStage.value) || null);
const selectedStageTitle = computed(() => selectedStageData.value?.title || '');
const summaryActions = computed(() => {
    const type = selectedStageData.value?.nodeType;
    if (type === 'result_view') {
        return [
            { key: 'add-final-content', label: '添加终评内容' },
            { key: 'add-prompt', label: '添加提示' },
        ];
    }
    return [
        { key: 'add-content', label: '添加内容' },
        { key: 'add-prompt', label: '添加提示' },
    ];
});
const promptModalOpen = ref(false);
const contentDrawerOpen = ref(false);
const configuredContents = ref([]);
const configuredExpandedIds = ref(new Set());
const selectedConfiguredId = ref(null);
const configuredHoverKey = ref(null);
const rootSettings = ref({});
const itemSettings = ref({});
const contentIdentity = (content) => content.content_id || content.id || `${content.type}-${content.name}`;
const configuredCardKey = (content) => `${selectedStage.value || 'stage'}:${activeTab.value}:${contentIdentity(content)}`;
const contentLayerRef = ref(null);
const availableTabs = computed(() => getStageContentTabs(selectedStageData.value?.nodeType));
const activeTabLabel = computed(() => availableTabs.value.find((tab) => tab.key === activeTab.value)?.label || availableTabs.value[0].label);
const activeStageContentRule = computed(() => getStageContentRule(selectedStageData.value?.nodeType));
const configuredContentRulesEnabled = computed(() => activeStageContentRule.value.rootSettingsVariant === 'work-summary-root' && activeStageContentRule.value.itemSettingsVariant === 'work-summary-item');
const hasActiveConfiguredSettings = computed(() => Boolean(selectedConfiguredId.value) && configuredContentRulesEnabled.value);
const allowedContentTypes = computed(() => activeStageContentRule.value.allowedContentTypes);
const allowedContentTypeList = computed(() => [...allowedContentTypes.value]);
const availableContentCandidates = computed(() => contentLibrary.value.filter((content) => allowedContentTypes.value.includes(content.type)).map((content) => ({ ...content, id: content.content_id || content.id || `${content.type}-${content.name}` })));
const defaultRootSettings = () => ({ hideDescription: false, allowMultiple: false });
const defaultItemSettings = () => ({ mode: 'fill', required: true });
function normalizeRootSettings(value) {
    const settings = value && typeof value === 'object' ? value : {};
    return { hideDescription: settings.hideDescription === true, allowMultiple: settings.allowMultiple === true };
}
function normalizeItemSettings(value) {
    const settings = value && typeof value === 'object' ? value : {};
    return { mode: settings.mode === 'hidden' ? 'hidden' : 'fill', required: settings.required !== false };
}
function rootSettingFor(contentId) {
    return rootSettings.value[contentId] || defaultRootSettings();
}
function itemSettingsForContent(contentId) {
    const content = configuredContents.value.find((item) => item.id === contentId);
    return Object.fromEntries((content?.items || []).map((item) => [item.id, itemSettings.value[`${contentId}:${item.id}`] || defaultItemSettings()]));
}
function setItemSettingsForContent(contentId, settings) {
    Object.entries(settings).forEach(([itemId, value]) => { itemSettings.value[`${contentId}:${itemId}`] = value; });
}
function updateConfiguredContent(index, content) {
    configuredContents.value = configuredContents.value.map((item, itemIndex) => itemIndex === index ? content : item);
}
function setConfiguredExpanded(contentId, expanded) {
    const next = new Set(configuredExpandedIds.value);
    expanded ? next.add(contentId) : next.delete(contentId);
    configuredExpandedIds.value = next;
}
watch(selectedStageData, () => { activeTab.value = availableTabs.value[0].key; });
function handleContentAction(key) {
    if (key === 'add-prompt')
        promptModalOpen.value = true;
    const contentSlot = key === 'add-final-content' ? 'view' : key === 'add-reference' ? 'reference' : key === 'add-content' ? activeTab.value : null;
    if (contentSlot && availableTabs.value.some((tab) => tab.key === contentSlot)) {
        activeTab.value = contentSlot;
        contentDrawerOpen.value = true;
    }
}
function handleTabChange(tab) {
    syncSelectedStageContents();
    activeTab.value = tab;
    const node = workflowNodes.value.find((item) => item.node_id === selectedStage.value);
    setConfiguredContents(node?.content?.filter((content) => (content.content_slot || 'fill') === tab) || []);
}
function handlePromptSave() {
    promptModalOpen.value = false;
}
function setConfiguredContents(contents) {
    const unique = new Map();
    contents.forEach((content, index) => {
        const baseId = content.content_id || content.id || `${content.type}-${content.name}`;
        let id = baseId;
        let suffix = index + 1;
        while (unique.has(id))
            id = `${baseId}-${suffix++}`;
        unique.set(id, {
            ...content,
            id,
            content_id: id,
            items: (content.items || []).map((item) => ({ ...item })),
        });
    });
    configuredContents.value = [...unique.values()];
    configuredExpandedIds.value = new Set(configuredContents.value.map((item) => item.id));
    rootSettings.value = Object.fromEntries(configuredContents.value.map((content) => [content.id, normalizeRootSettings(content.settings)]));
    itemSettings.value = Object.fromEntries(configuredContents.value.flatMap((content) => content.items.map((item) => [`${content.id}:${item.id}`, normalizeItemSettings(item.settings)])));
}
function mergeContentLibrary(contents) {
    const next = new Map(contentLibrary.value.map((content) => [content.content_id || content.id || `${content.type}-${content.name}`, content]));
    contents.forEach((content) => {
        const contentId = content.content_id || content.id || `${content.type}-${content.name}`;
        const { content_slot: _slot, ...libraryContent } = content;
        next.set(contentId, { ...libraryContent, content_id: contentId });
    });
    contentLibrary.value = [...next.values()];
}
function serializeConfiguredContents(slot = activeTab.value) {
    return configuredContents.value.map(({ id, ...content }) => ({
        ...content,
        id,
        content_id: content.content_id || id,
        content_slot: slot,
        settings: configuredContentRulesEnabled.value ? rootSettingFor(id) : content.settings,
        items: content.items.map(({ settings, ...item }) => ({
            ...item,
            settings: configuredContentRulesEnabled.value
                ? (itemSettings.value[`${id}:${item.id}`] || normalizeItemSettings(settings))
                : settings,
        })),
    }));
}
function replaceNodeContentSlot(node, slot, contents) {
    const retained = (node.content || []).filter((content) => (content.content_slot || 'fill') !== slot);
    node.content = [...retained, ...contents];
    node.content_bindings = { ...(node.content_bindings || {}), [slot]: contents.map((content) => content.content_id || content.id || `${content.type}-${content.name}`) };
}
function syncSelectedStageContents() {
    if (!selectedStage.value)
        return;
    const node = workflowNodes.value.find((item) => item.node_id === selectedStage.value);
    if (node)
        replaceNodeContentSlot(node, activeTab.value, serializeConfiguredContents());
}
function selectStage(id) {
    syncSelectedStageContents();
    selectedStage.value = id;
    const node = workflowNodes.value.find((item) => item.node_id === id);
    activeTab.value = getStageContentTabs(node?.node_type)[0]?.key || 'fill';
    setConfiguredContents(node?.content?.filter((content) => (content.content_slot || 'fill') === activeTab.value) || []);
    selectedConfiguredId.value = null;
    configuredHoverKey.value = null;
}
function handleContentConfirm(contents) {
    setConfiguredContents(contents);
    mergeContentLibrary(configuredContents.value);
    const node = workflowNodes.value.find((item) => item.node_id === selectedStage.value);
    if (node)
        replaceNodeContentSlot(node, activeTab.value, serializeConfiguredContents());
    selectedConfiguredId.value = null;
    configuredHoverKey.value = null;
    if (!selectedStage.value)
        selectedStage.value = stages.value.find((stage) => stage.nodeType === 'evaluation')?.id || null;
    contentDrawerOpen.value = false;
}
function reorderConfigured(from, to) {
    if (from === to)
        return;
    const next = configuredContents.value.slice();
    const [moved] = next.splice(from, 1);
    if (!moved)
        return;
    next.splice(to, 0, moved);
    configuredContents.value = next;
}
function moveConfigured(index, delta) {
    reorderConfigured(index, index + delta);
}
function removeConfigured(index) {
    const removed = configuredContents.value[index];
    if (!removed)
        return;
    configuredContents.value = configuredContents.value.filter((_, itemIndex) => itemIndex !== index);
    const next = new Set(configuredExpandedIds.value);
    next.delete(removed.id);
    configuredExpandedIds.value = next;
    delete rootSettings.value[removed.id];
    Object.keys(itemSettings.value).forEach((key) => { if (key.startsWith(`${removed.id}:`))
        delete itemSettings.value[key]; });
    if (selectedConfiguredId.value === removed.id)
        selectedConfiguredId.value = null;
    configuredHoverKey.value = null;
}
function editConfigured(content) {
    contentDrawerOpen.value = true;
    void nextTick(() => contentLayerRef.value?.openEditor(content));
}
function applyWorkflowNodes(nodes, library = []) {
    workflowNodes.value = nodes.map((node) => ({ ...node, content: node.content?.map((content) => ({ ...content, items: content.items || [] })) }));
    const merged = new Map();
    library.forEach((content) => merged.set(content.content_id || content.id || `${content.type}-${content.name}`, content));
    nodes.flatMap((node) => node.content || []).forEach((content) => {
        const contentId = content.content_id || content.id || `${content.type}-${content.name}`;
        if (!merged.has(contentId))
            merged.set(contentId, { ...content, content_id: contentId });
    });
    contentLibrary.value = [...merged.values()];
    stages.value = nodes.map((node, index) => ({ id: node.node_id || `${node.node_type}-${index}`, nodeType: node.node_type, icon: iconByType[node.node_type] || '▧', title: node.name, executor: node.executor_label }));
}
async function save() {
    if (!props.templateId)
        return;
    syncSelectedStageContents();
    workflowNodes.value.flatMap((node) => node.content || []).forEach((content) => mergeContentLibrary([content]));
    const nodes = workflowNodes.value.map((node) => ({ ...node, content: node.content ? node.content.map((content) => ({ ...content, items: content.items || [] })) : [] }));
    const response = await performanceTemplateApi.updateWorkflow(props.templateId, { nodes, content_library: contentLibrary.value });
    applyWorkflowNodes(response.nodes || [], response.content_library || []);
}
const __VLS_exposed = { save };
defineExpose(__VLS_exposed);
onMounted(async () => {
    if (!props.templateId)
        return;
    void loadRatingOptions();
    loading.value = true;
    try {
        const data = await performanceTemplateApi.getWorkflow(props.templateId);
        applyWorkflowNodes(data.nodes || [], data.content_library || []);
    }
    finally {
        loading.value = false;
    }
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['stage-panel__header']} */ ;
/** @type {__VLS_StyleScopedClasses['all-content-button']} */ ;
/** @type {__VLS_StyleScopedClasses['stage-card']} */ ;
/** @type {__VLS_StyleScopedClasses['stage-card']} */ ;
/** @type {__VLS_StyleScopedClasses['stage-card__icon']} */ ;
/** @type {__VLS_StyleScopedClasses['stage-card']} */ ;
/** @type {__VLS_StyleScopedClasses['stage-card__executor']} */ ;
/** @type {__VLS_StyleScopedClasses['stage-card']} */ ;
/** @type {__VLS_StyleScopedClasses['selected']} */ ;
/** @type {__VLS_StyleScopedClasses['stage-card__executor']} */ ;
/** @type {__VLS_StyleScopedClasses['content-tab']} */ ;
/** @type {__VLS_StyleScopedClasses['content-tab--active']} */ ;
/** @type {__VLS_StyleScopedClasses['content-card__head']} */ ;
/** @type {__VLS_StyleScopedClasses['content-card__actions']} */ ;
/** @type {__VLS_StyleScopedClasses['content-card__actions']} */ ;
/** @type {__VLS_StyleScopedClasses['content-card--reference']} */ ;
/** @type {__VLS_StyleScopedClasses['configured-content-sortable-list']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "content-settings-page" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
    ...{ class: "stage-panel" },
    'aria-label': "按评估流程配置",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stage-panel__header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ class: "all-content-button" },
    type: "button",
    'aria-label': "全部内容",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stage-list" },
    'aria-live': "polite",
});
if (__VLS_ctx.loading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "stage-loading" },
    });
}
for (const [stage] of __VLS_getVForSourceType((__VLS_ctx.stages))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.selectStage(stage.id);
            } },
        key: (stage.id),
        type: "button",
        ...{ class: "stage-card" },
        ...{ class: ({ selected: __VLS_ctx.selectedStage === stage.id }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "stage-card__icon" },
        'aria-hidden': "true",
    });
    /** @type {[typeof PerformanceWorkflowStageIcon, ]} */ ;
    // @ts-ignore
    const __VLS_0 = __VLS_asFunctionalComponent(PerformanceWorkflowStageIcon, new PerformanceWorkflowStageIcon({
        type: (stage.nodeType),
    }));
    const __VLS_1 = __VLS_0({
        type: (stage.nodeType),
    }, ...__VLS_functionalComponentArgsRest(__VLS_0));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "stage-card__copy" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "stage-card__title" },
    });
    (stage.title);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "stage-card__executor" },
    });
    (stage.executor);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
    ...{ class: "text-normal" },
    'aria-label': "内容设置",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "text-normal__title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "text-normal__divider" },
    'aria-hidden': "true",
});
if (!__VLS_ctx.hasActiveConfiguredSettings) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "text-normal__body" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
}
/** @type {[typeof ContentSettingsStageRenderer, typeof ContentSettingsStageRenderer, ]} */ ;
// @ts-ignore
const __VLS_3 = __VLS_asFunctionalComponent(ContentSettingsStageRenderer, new ContentSettingsStageRenderer({
    ...{ 'onUpdate:activeTab': {} },
    ...{ class: "content-stage-renderer" },
    tabs: (__VLS_ctx.availableTabs),
    activeTab: (__VLS_ctx.activeTab),
    'aria-label': (__VLS_ctx.activeTabLabel),
}));
const __VLS_4 = __VLS_3({
    ...{ 'onUpdate:activeTab': {} },
    ...{ class: "content-stage-renderer" },
    tabs: (__VLS_ctx.availableTabs),
    activeTab: (__VLS_ctx.activeTab),
    'aria-label': (__VLS_ctx.activeTabLabel),
}, ...__VLS_functionalComponentArgsRest(__VLS_3));
let __VLS_6;
let __VLS_7;
let __VLS_8;
const __VLS_9 = {
    'onUpdate:activeTab': (__VLS_ctx.handleTabChange)
};
__VLS_5.slots.default;
if (__VLS_ctx.selectedStageData) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "content-pane" },
    });
    /** @type {[typeof PerformanceTemplateSectionCard, ]} */ ;
    // @ts-ignore
    const __VLS_10 = __VLS_asFunctionalComponent(PerformanceTemplateSectionCard, new PerformanceTemplateSectionCard({
        ...{ 'onAction': {} },
        title: (__VLS_ctx.selectedStageTitle),
        actions: (__VLS_ctx.configuredContents.length ? [] : __VLS_ctx.summaryActions),
    }));
    const __VLS_11 = __VLS_10({
        ...{ 'onAction': {} },
        title: (__VLS_ctx.selectedStageTitle),
        actions: (__VLS_ctx.configuredContents.length ? [] : __VLS_ctx.summaryActions),
    }, ...__VLS_functionalComponentArgsRest(__VLS_10));
    let __VLS_13;
    let __VLS_14;
    let __VLS_15;
    const __VLS_16 = {
        onAction: (__VLS_ctx.handleContentAction)
    };
    var __VLS_12;
    if (__VLS_ctx.configuredContents.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "configured-content-section configured-content-panel" },
            'aria-label': "配置填写内容",
        });
        /** @type {[typeof PerformanceSortableList, typeof PerformanceSortableList, ]} */ ;
        // @ts-ignore
        const __VLS_17 = __VLS_asFunctionalComponent(PerformanceSortableList, new PerformanceSortableList({
            ...{ 'onReorder': {} },
            items: (__VLS_ctx.configuredContents),
            itemKey: "id",
            gap: (0),
            ...{ class: "configured-content-sortable-list" },
        }));
        const __VLS_18 = __VLS_17({
            ...{ 'onReorder': {} },
            items: (__VLS_ctx.configuredContents),
            itemKey: "id",
            gap: (0),
            ...{ class: "configured-content-sortable-list" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_17));
        let __VLS_20;
        let __VLS_21;
        let __VLS_22;
        const __VLS_23 = {
            onReorder: (__VLS_ctx.reorderConfigured)
        };
        __VLS_19.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_19.slots;
            const { item: content, index, dragging, itemStyle } = __VLS_getSlotParam(__VLS_thisSlot);
            /** @type {[typeof PerformanceConfiguredContentBlock, ]} */ ;
            // @ts-ignore
            const __VLS_24 = __VLS_asFunctionalComponent(PerformanceConfiguredContentBlock, new PerformanceConfiguredContentBlock({
                ...{ 'onActivate': {} },
                ...{ 'onUpdate:expanded': {} },
                ...{ 'onUpdate:rootSettings': {} },
                ...{ 'onUpdate:itemSettings': {} },
                ...{ 'onHoverChange': {} },
                ...{ 'onMoveUp': {} },
                ...{ 'onMoveDown': {} },
                ...{ 'onEdit': {} },
                ...{ 'onDelete': {} },
                content: (content),
                active: (__VLS_ctx.selectedConfiguredId === content.id),
                expanded: (__VLS_ctx.configuredExpandedIds.has(content.id)),
                dragging: (dragging),
                itemStyle: (itemStyle),
                index: (index),
                count: (__VLS_ctx.configuredContents.length),
                toolbarVisible: (__VLS_ctx.configuredHoverKey === __VLS_ctx.configuredCardKey(content)),
                rootSettings: (__VLS_ctx.rootSettingFor(content.id)),
                itemSettings: (__VLS_ctx.itemSettingsForContent(content.id)),
                rootSettingsVariant: (__VLS_ctx.activeStageContentRule.rootSettingsVariant),
                itemSettingsVariant: (__VLS_ctx.activeStageContentRule.itemSettingsVariant),
            }));
            const __VLS_25 = __VLS_24({
                ...{ 'onActivate': {} },
                ...{ 'onUpdate:expanded': {} },
                ...{ 'onUpdate:rootSettings': {} },
                ...{ 'onUpdate:itemSettings': {} },
                ...{ 'onHoverChange': {} },
                ...{ 'onMoveUp': {} },
                ...{ 'onMoveDown': {} },
                ...{ 'onEdit': {} },
                ...{ 'onDelete': {} },
                content: (content),
                active: (__VLS_ctx.selectedConfiguredId === content.id),
                expanded: (__VLS_ctx.configuredExpandedIds.has(content.id)),
                dragging: (dragging),
                itemStyle: (itemStyle),
                index: (index),
                count: (__VLS_ctx.configuredContents.length),
                toolbarVisible: (__VLS_ctx.configuredHoverKey === __VLS_ctx.configuredCardKey(content)),
                rootSettings: (__VLS_ctx.rootSettingFor(content.id)),
                itemSettings: (__VLS_ctx.itemSettingsForContent(content.id)),
                rootSettingsVariant: (__VLS_ctx.activeStageContentRule.rootSettingsVariant),
                itemSettingsVariant: (__VLS_ctx.activeStageContentRule.itemSettingsVariant),
            }, ...__VLS_functionalComponentArgsRest(__VLS_24));
            let __VLS_27;
            let __VLS_28;
            let __VLS_29;
            const __VLS_30 = {
                onActivate: (...[$event]) => {
                    if (!(__VLS_ctx.selectedStageData))
                        return;
                    if (!(__VLS_ctx.configuredContents.length))
                        return;
                    __VLS_ctx.selectedConfiguredId = $event;
                }
            };
            const __VLS_31 = {
                'onUpdate:expanded': (...[$event]) => {
                    if (!(__VLS_ctx.selectedStageData))
                        return;
                    if (!(__VLS_ctx.configuredContents.length))
                        return;
                    __VLS_ctx.setConfiguredExpanded(content.id, $event);
                }
            };
            const __VLS_32 = {
                'onUpdate:rootSettings': (...[$event]) => {
                    if (!(__VLS_ctx.selectedStageData))
                        return;
                    if (!(__VLS_ctx.configuredContents.length))
                        return;
                    __VLS_ctx.rootSettings[content.id] = $event;
                }
            };
            const __VLS_33 = {
                'onUpdate:itemSettings': (...[$event]) => {
                    if (!(__VLS_ctx.selectedStageData))
                        return;
                    if (!(__VLS_ctx.configuredContents.length))
                        return;
                    __VLS_ctx.setItemSettingsForContent(content.id, $event);
                }
            };
            const __VLS_34 = {
                onHoverChange: (...[$event]) => {
                    if (!(__VLS_ctx.selectedStageData))
                        return;
                    if (!(__VLS_ctx.configuredContents.length))
                        return;
                    __VLS_ctx.configuredHoverKey = $event ? __VLS_ctx.configuredCardKey(content) : null;
                }
            };
            const __VLS_35 = {
                onMoveUp: (...[$event]) => {
                    if (!(__VLS_ctx.selectedStageData))
                        return;
                    if (!(__VLS_ctx.configuredContents.length))
                        return;
                    __VLS_ctx.moveConfigured(index, -1);
                }
            };
            const __VLS_36 = {
                onMoveDown: (...[$event]) => {
                    if (!(__VLS_ctx.selectedStageData))
                        return;
                    if (!(__VLS_ctx.configuredContents.length))
                        return;
                    __VLS_ctx.moveConfigured(index, 1);
                }
            };
            const __VLS_37 = {
                onEdit: (...[$event]) => {
                    if (!(__VLS_ctx.selectedStageData))
                        return;
                    if (!(__VLS_ctx.configuredContents.length))
                        return;
                    __VLS_ctx.editConfigured(content);
                }
            };
            const __VLS_38 = {
                onDelete: (...[$event]) => {
                    if (!(__VLS_ctx.selectedStageData))
                        return;
                    if (!(__VLS_ctx.configuredContents.length))
                        return;
                    __VLS_ctx.removeConfigured(index);
                }
            };
            var __VLS_26;
        }
        var __VLS_19;
        /** @type {[typeof PerformanceTemplateOperateBar, ]} */ ;
        // @ts-ignore
        const __VLS_39 = __VLS_asFunctionalComponent(PerformanceTemplateOperateBar, new PerformanceTemplateOperateBar({
            ...{ 'onAction': {} },
            ...{ class: "configured-content-footer" },
            actions: (__VLS_ctx.summaryActions),
        }));
        const __VLS_40 = __VLS_39({
            ...{ 'onAction': {} },
            ...{ class: "configured-content-footer" },
            actions: (__VLS_ctx.summaryActions),
        }, ...__VLS_functionalComponentArgsRest(__VLS_39));
        let __VLS_42;
        let __VLS_43;
        let __VLS_44;
        const __VLS_45 = {
            onAction: (__VLS_ctx.handleContentAction)
        };
        var __VLS_41;
    }
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "content-card content-card--result" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "content-card__head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "drag-dots" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "content-card__body" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "content-card__actions" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        type: "button",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        type: "button",
    });
}
if (!__VLS_ctx.configuredContents.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "content-card content-card--reference" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        type: "button",
    });
}
var __VLS_5;
if (false) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
        ...{ class: "configured-content-panel" },
        'aria-label': "閰嶇疆濉啓鍐呭唴",
    });
    for (const [content] of __VLS_getVForSourceType((__VLS_ctx.configuredContents))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
            key: (content.id),
            ...{ class: "configured-content-card" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (content.name);
        if (content.description) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            (content.description);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({});
        for (const [item] of __VLS_getVForSourceType((content.items))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({
                key: (item.id),
            });
            (item.label);
        }
    }
}
/** @type {[typeof PerformancePromptModal, ]} */ ;
// @ts-ignore
const __VLS_46 = __VLS_asFunctionalComponent(PerformancePromptModal, new PerformancePromptModal({
    ...{ 'onSave': {} },
    open: (__VLS_ctx.promptModalOpen),
}));
const __VLS_47 = __VLS_46({
    ...{ 'onSave': {} },
    open: (__VLS_ctx.promptModalOpen),
}, ...__VLS_functionalComponentArgsRest(__VLS_46));
let __VLS_49;
let __VLS_50;
let __VLS_51;
const __VLS_52 = {
    onSave: (__VLS_ctx.handlePromptSave)
};
var __VLS_48;
/** @type {[typeof PerformanceAssessmentContentLayers, ]} */ ;
// @ts-ignore
const __VLS_53 = __VLS_asFunctionalComponent(PerformanceAssessmentContentLayers, new PerformanceAssessmentContentLayers({
    ...{ 'onConfirm': {} },
    ref: "contentLayerRef",
    open: (__VLS_ctx.contentDrawerOpen),
    initialContents: (__VLS_ctx.configuredContents),
    availableContents: (__VLS_ctx.availableContentCandidates),
    ratingOptions: (__VLS_ctx.ratingOptions),
    allowedTypes: (__VLS_ctx.allowedContentTypeList),
}));
const __VLS_54 = __VLS_53({
    ...{ 'onConfirm': {} },
    ref: "contentLayerRef",
    open: (__VLS_ctx.contentDrawerOpen),
    initialContents: (__VLS_ctx.configuredContents),
    availableContents: (__VLS_ctx.availableContentCandidates),
    ratingOptions: (__VLS_ctx.ratingOptions),
    allowedTypes: (__VLS_ctx.allowedContentTypeList),
}, ...__VLS_functionalComponentArgsRest(__VLS_53));
let __VLS_56;
let __VLS_57;
let __VLS_58;
const __VLS_59 = {
    onConfirm: (__VLS_ctx.handleContentConfirm)
};
/** @type {typeof __VLS_ctx.contentLayerRef} */ ;
var __VLS_60 = {};
var __VLS_55;
/** @type {__VLS_StyleScopedClasses['content-settings-page']} */ ;
/** @type {__VLS_StyleScopedClasses['stage-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['stage-panel__header']} */ ;
/** @type {__VLS_StyleScopedClasses['all-content-button']} */ ;
/** @type {__VLS_StyleScopedClasses['stage-list']} */ ;
/** @type {__VLS_StyleScopedClasses['stage-loading']} */ ;
/** @type {__VLS_StyleScopedClasses['stage-card']} */ ;
/** @type {__VLS_StyleScopedClasses['stage-card__icon']} */ ;
/** @type {__VLS_StyleScopedClasses['stage-card__copy']} */ ;
/** @type {__VLS_StyleScopedClasses['stage-card__title']} */ ;
/** @type {__VLS_StyleScopedClasses['stage-card__executor']} */ ;
/** @type {__VLS_StyleScopedClasses['text-normal']} */ ;
/** @type {__VLS_StyleScopedClasses['text-normal__title']} */ ;
/** @type {__VLS_StyleScopedClasses['text-normal__divider']} */ ;
/** @type {__VLS_StyleScopedClasses['text-normal__body']} */ ;
/** @type {__VLS_StyleScopedClasses['content-stage-renderer']} */ ;
/** @type {__VLS_StyleScopedClasses['content-pane']} */ ;
/** @type {__VLS_StyleScopedClasses['configured-content-section']} */ ;
/** @type {__VLS_StyleScopedClasses['configured-content-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['configured-content-sortable-list']} */ ;
/** @type {__VLS_StyleScopedClasses['configured-content-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['content-card']} */ ;
/** @type {__VLS_StyleScopedClasses['content-card--result']} */ ;
/** @type {__VLS_StyleScopedClasses['content-card__head']} */ ;
/** @type {__VLS_StyleScopedClasses['drag-dots']} */ ;
/** @type {__VLS_StyleScopedClasses['content-card__body']} */ ;
/** @type {__VLS_StyleScopedClasses['content-card__actions']} */ ;
/** @type {__VLS_StyleScopedClasses['content-card']} */ ;
/** @type {__VLS_StyleScopedClasses['content-card--reference']} */ ;
/** @type {__VLS_StyleScopedClasses['configured-content-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['configured-content-card']} */ ;
// @ts-ignore
var __VLS_61 = __VLS_60;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformanceWorkflowStageIcon: PerformanceWorkflowStageIcon,
            PerformanceTemplateSectionCard: PerformanceTemplateSectionCard,
            PerformancePromptModal: PerformancePromptModal,
            PerformanceAssessmentContentLayers: PerformanceAssessmentContentLayers,
            PerformanceSortableList: PerformanceSortableList,
            PerformanceTemplateOperateBar: PerformanceTemplateOperateBar,
            PerformanceConfiguredContentBlock: PerformanceConfiguredContentBlock,
            ContentSettingsStageRenderer: ContentSettingsStageRenderer,
            selectedStage: selectedStage,
            activeTab: activeTab,
            loading: loading,
            stages: stages,
            ratingOptions: ratingOptions,
            selectedStageData: selectedStageData,
            selectedStageTitle: selectedStageTitle,
            summaryActions: summaryActions,
            promptModalOpen: promptModalOpen,
            contentDrawerOpen: contentDrawerOpen,
            configuredContents: configuredContents,
            configuredExpandedIds: configuredExpandedIds,
            selectedConfiguredId: selectedConfiguredId,
            configuredHoverKey: configuredHoverKey,
            rootSettings: rootSettings,
            configuredCardKey: configuredCardKey,
            contentLayerRef: contentLayerRef,
            availableTabs: availableTabs,
            activeTabLabel: activeTabLabel,
            activeStageContentRule: activeStageContentRule,
            hasActiveConfiguredSettings: hasActiveConfiguredSettings,
            allowedContentTypeList: allowedContentTypeList,
            availableContentCandidates: availableContentCandidates,
            rootSettingFor: rootSettingFor,
            itemSettingsForContent: itemSettingsForContent,
            setItemSettingsForContent: setItemSettingsForContent,
            setConfiguredExpanded: setConfiguredExpanded,
            handleContentAction: handleContentAction,
            handleTabChange: handleTabChange,
            handlePromptSave: handlePromptSave,
            selectStage: selectStage,
            handleContentConfirm: handleContentConfirm,
            reorderConfigured: reorderConfigured,
            moveConfigured: moveConfigured,
            removeConfigured: removeConfigured,
            editConfigured: editConfigured,
        };
    },
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {
            ...__VLS_exposed,
        };
    },
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
