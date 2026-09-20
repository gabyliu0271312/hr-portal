/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, ref, watch } from 'vue';
import PerformanceAssessmentConfiguredPreview from './PerformanceAssessmentConfiguredPreview.vue';
import PerformanceAssessmentPreviewHeader from './PerformanceAssessmentPreviewHeader.vue';
import PerformanceConfiguredCardActionToolbar from './PerformanceConfiguredCardActionToolbar.vue';
import PerformanceContentSelectionFrame from './PerformanceContentSelectionFrame.vue';
import PerformanceDragHandle from './PerformanceDragHandle.vue';
import PerformanceExpandButton from './PerformanceExpandButton.vue';
import PerformanceWorkSummaryItemSettings from './PerformanceWorkSummaryItemSettings.vue';
import PerformanceWorkSummaryRootSettings from './PerformanceWorkSummaryRootSettings.vue';
const props = defineProps();
const emit = defineEmits();
const owner = ref('root');
const selectedItemId = ref(null);
const rulesEnabled = computed(() => props.rootSettingsVariant === 'work-summary-root' && props.itemSettingsVariant === 'work-summary-item');
const selectedItemKey = computed(() => props.active && owner.value === 'item' && selectedItemId.value ? `${props.content.id}:${selectedItemId.value}` : null);
const selectedItemSettings = computed(() => selectedItemId.value ? props.itemSettings[selectedItemId.value] || { mode: 'fill', required: true } : { mode: 'fill', required: true });
const rendererItemSettings = computed(() => rulesEnabled.value ? Object.fromEntries(props.content.items.map((item) => [item.id, props.itemSettings[item.id] || { mode: 'fill', required: true }])) : {});
watch(() => props.active, (active) => {
    if (!active)
        selectedItemId.value = null;
});
function selectRoot() {
    owner.value = 'root';
    selectedItemId.value = null;
    emit('activate', props.content.id);
}
function selectItem(itemId) {
    owner.value = 'item';
    selectedItemId.value = itemId;
    emit('activate', props.content.id);
}
function updateItemSettings(settings) {
    if (!selectedItemId.value)
        return;
    emit('update:item-settings', { ...props.itemSettings, [selectedItemId.value]: settings });
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['configured-content-card']} */ ;
/** @type {__VLS_StyleScopedClasses['configured-content-card']} */ ;
/** @type {__VLS_StyleScopedClasses['configured-content-card']} */ ;
/** @type {__VLS_StyleScopedClasses['configured-content-card']} */ ;
/** @type {__VLS_StyleScopedClasses['configured-content-card']} */ ;
/** @type {__VLS_StyleScopedClasses['configured-content-card__row']} */ ;
/** @type {__VLS_StyleScopedClasses['configured-content-card__row']} */ ;
/** @type {__VLS_StyleScopedClasses['configured-content-card__row']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-assessment-preview-header']} */ ;
/** @type {__VLS_StyleScopedClasses['configured-content-card__row']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-assessment-preview-header']} */ ;
/** @type {__VLS_StyleScopedClasses['configured-content-card__row']} */ ;
/** @type {__VLS_StyleScopedClasses['configured-content-card']} */ ;
/** @type {__VLS_StyleScopedClasses['configured-content-card__details']} */ ;
/** @type {__VLS_StyleScopedClasses['configured-content-card__add-item']} */ ;
// CSS variable injection 
// CSS variable injection end 
/** @type {[typeof PerformanceContentSelectionFrame, typeof PerformanceContentSelectionFrame, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(PerformanceContentSelectionFrame, new PerformanceContentSelectionFrame({
    ...{ 'onMouseenter': {} },
    ...{ 'onMouseleave': {} },
    tag: "article",
    variant: "root",
    selected: (__VLS_ctx.active && __VLS_ctx.owner === 'root'),
    ...{ class: "configured-content-card" },
    ...{ class: ({ 'is-dragging': __VLS_ctx.dragging, 'hides-description': __VLS_ctx.rulesEnabled && __VLS_ctx.rootSettings.hideDescription, 'allows-multiple': __VLS_ctx.rulesEnabled && __VLS_ctx.rootSettings.allowMultiple }) },
    dataSortableIndex: (__VLS_ctx.index),
    ...{ style: (__VLS_ctx.itemStyle) },
}));
const __VLS_1 = __VLS_0({
    ...{ 'onMouseenter': {} },
    ...{ 'onMouseleave': {} },
    tag: "article",
    variant: "root",
    selected: (__VLS_ctx.active && __VLS_ctx.owner === 'root'),
    ...{ class: "configured-content-card" },
    ...{ class: ({ 'is-dragging': __VLS_ctx.dragging, 'hides-description': __VLS_ctx.rulesEnabled && __VLS_ctx.rootSettings.hideDescription, 'allows-multiple': __VLS_ctx.rulesEnabled && __VLS_ctx.rootSettings.allowMultiple }) },
    dataSortableIndex: (__VLS_ctx.index),
    ...{ style: (__VLS_ctx.itemStyle) },
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
let __VLS_3;
let __VLS_4;
let __VLS_5;
const __VLS_6 = {
    onMouseenter: (...[$event]) => {
        __VLS_ctx.emit('hover-change', true);
    }
};
const __VLS_7 = {
    onMouseleave: (...[$event]) => {
        __VLS_ctx.emit('hover-change', false);
    }
};
__VLS_2.slots.default;
/** @type {[typeof PerformanceDragHandle, ]} */ ;
// @ts-ignore
const __VLS_8 = __VLS_asFunctionalComponent(PerformanceDragHandle, new PerformanceDragHandle({
    variant: "strip",
    label: (`Drag ${__VLS_ctx.content.name}`),
    dragging: (__VLS_ctx.dragging),
}));
const __VLS_9 = __VLS_8({
    variant: "strip",
    label: (`Drag ${__VLS_ctx.content.name}`),
    dragging: (__VLS_ctx.dragging),
}, ...__VLS_functionalComponentArgsRest(__VLS_8));
/** @type {[typeof PerformanceConfiguredCardActionToolbar, ]} */ ;
// @ts-ignore
const __VLS_11 = __VLS_asFunctionalComponent(PerformanceConfiguredCardActionToolbar, new PerformanceConfiguredCardActionToolbar({
    ...{ 'onMoveUp': {} },
    ...{ 'onMoveDown': {} },
    ...{ 'onEdit': {} },
    ...{ 'onDelete': {} },
    visible: (__VLS_ctx.toolbarVisible || __VLS_ctx.dragging),
    index: (__VLS_ctx.index),
    count: (__VLS_ctx.count),
}));
const __VLS_12 = __VLS_11({
    ...{ 'onMoveUp': {} },
    ...{ 'onMoveDown': {} },
    ...{ 'onEdit': {} },
    ...{ 'onDelete': {} },
    visible: (__VLS_ctx.toolbarVisible || __VLS_ctx.dragging),
    index: (__VLS_ctx.index),
    count: (__VLS_ctx.count),
}, ...__VLS_functionalComponentArgsRest(__VLS_11));
let __VLS_14;
let __VLS_15;
let __VLS_16;
const __VLS_17 = {
    onMoveUp: (...[$event]) => {
        __VLS_ctx.emit('move-up');
    }
};
const __VLS_18 = {
    onMoveDown: (...[$event]) => {
        __VLS_ctx.emit('move-down');
    }
};
const __VLS_19 = {
    onEdit: (...[$event]) => {
        __VLS_ctx.emit('edit');
    }
};
const __VLS_20 = {
    onDelete: (...[$event]) => {
        __VLS_ctx.emit('delete');
    }
};
var __VLS_13;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ onClick: (__VLS_ctx.selectRoot) },
    ...{ class: "configured-content-card__row" },
    role: "button",
    tabindex: (__VLS_ctx.toolbarVisible ? 0 : -1),
    'aria-label': (`Select ${__VLS_ctx.content.name}`),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "configured-content-card__header" },
});
/** @type {[typeof PerformanceAssessmentPreviewHeader, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(PerformanceAssessmentPreviewHeader, new PerformanceAssessmentPreviewHeader({
    name: (__VLS_ctx.content.name),
}));
const __VLS_22 = __VLS_21({
    name: (__VLS_ctx.content.name),
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
if (__VLS_ctx.content.description && (!__VLS_ctx.rulesEnabled || !__VLS_ctx.rootSettings.hideDescription)) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "configured-content-card__description" },
    });
    (__VLS_ctx.content.description);
}
/** @type {[typeof PerformanceExpandButton, ]} */ ;
// @ts-ignore
const __VLS_24 = __VLS_asFunctionalComponent(PerformanceExpandButton, new PerformanceExpandButton({
    ...{ 'onToggle': {} },
    ...{ 'onClick': {} },
    expanded: (__VLS_ctx.expanded),
    iconVariant: "regular",
    label: "Toggle content",
}));
const __VLS_25 = __VLS_24({
    ...{ 'onToggle': {} },
    ...{ 'onClick': {} },
    expanded: (__VLS_ctx.expanded),
    iconVariant: "regular",
    label: "Toggle content",
}, ...__VLS_functionalComponentArgsRest(__VLS_24));
let __VLS_27;
let __VLS_28;
let __VLS_29;
const __VLS_30 = {
    onToggle: (...[$event]) => {
        __VLS_ctx.emit('update:expanded', !__VLS_ctx.expanded);
    }
};
const __VLS_31 = {
    onClick: () => { }
};
var __VLS_26;
if (__VLS_ctx.expanded) {
    /** @type {[typeof PerformanceAssessmentConfiguredPreview, ]} */ ;
    // @ts-ignore
    const __VLS_32 = __VLS_asFunctionalComponent(PerformanceAssessmentConfiguredPreview, new PerformanceAssessmentConfiguredPreview({
        ...{ 'onSelectItem': {} },
        content: (__VLS_ctx.content),
        interactive: (true),
        selectedItemId: (__VLS_ctx.selectedItemKey),
        itemSettings: (__VLS_ctx.rendererItemSettings),
        ...{ class: "configured-content-card__details" },
    }));
    const __VLS_33 = __VLS_32({
        ...{ 'onSelectItem': {} },
        content: (__VLS_ctx.content),
        interactive: (true),
        selectedItemId: (__VLS_ctx.selectedItemKey),
        itemSettings: (__VLS_ctx.rendererItemSettings),
        ...{ class: "configured-content-card__details" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_32));
    let __VLS_35;
    let __VLS_36;
    let __VLS_37;
    const __VLS_38 = {
        onSelectItem: (__VLS_ctx.selectItem)
    };
    var __VLS_34;
}
if (__VLS_ctx.rulesEnabled && __VLS_ctx.rootSettings.allowMultiple) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ class: "configured-content-card__add-item" },
        type: "button",
        'aria-label': "添加",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        width: "14",
        height: "14",
        viewBox: "0 0 24 24",
        fill: "none",
        'data-icon': "AddOutlined",
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M12 2a1 1 0 0 0-1 1v8H3a1 1 0 1 0 0 2h8v8a1 1 0 1 0 2 0v-8h8a1 1 0 1 0 0-2h-8V3a1 1 0 0 0-1-1Z",
        fill: "currentColor",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
}
var __VLS_2;
if (__VLS_ctx.active && __VLS_ctx.rulesEnabled) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "configured-content-settings" },
    });
    if (__VLS_ctx.owner === 'root') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "content-settings-detail content-settings-detail--root" },
            'aria-label': "Selected content settings",
        });
        /** @type {[typeof PerformanceWorkSummaryRootSettings, ]} */ ;
        // @ts-ignore
        const __VLS_39 = __VLS_asFunctionalComponent(PerformanceWorkSummaryRootSettings, new PerformanceWorkSummaryRootSettings({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (__VLS_ctx.rootSettings),
        }));
        const __VLS_40 = __VLS_39({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (__VLS_ctx.rootSettings),
        }, ...__VLS_functionalComponentArgsRest(__VLS_39));
        let __VLS_42;
        let __VLS_43;
        let __VLS_44;
        const __VLS_45 = {
            'onUpdate:modelValue': (...[$event]) => {
                if (!(__VLS_ctx.active && __VLS_ctx.rulesEnabled))
                    return;
                if (!(__VLS_ctx.owner === 'root'))
                    return;
                __VLS_ctx.emit('update:root-settings', $event);
            }
        };
        var __VLS_41;
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "content-settings-detail content-settings-detail--item" },
            'aria-label': "Selected content item settings",
        });
        /** @type {[typeof PerformanceWorkSummaryItemSettings, ]} */ ;
        // @ts-ignore
        const __VLS_46 = __VLS_asFunctionalComponent(PerformanceWorkSummaryItemSettings, new PerformanceWorkSummaryItemSettings({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (__VLS_ctx.selectedItemSettings),
        }));
        const __VLS_47 = __VLS_46({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (__VLS_ctx.selectedItemSettings),
        }, ...__VLS_functionalComponentArgsRest(__VLS_46));
        let __VLS_49;
        let __VLS_50;
        let __VLS_51;
        const __VLS_52 = {
            'onUpdate:modelValue': (__VLS_ctx.updateItemSettings)
        };
        var __VLS_48;
    }
}
/** @type {__VLS_StyleScopedClasses['configured-content-card']} */ ;
/** @type {__VLS_StyleScopedClasses['configured-content-card__row']} */ ;
/** @type {__VLS_StyleScopedClasses['configured-content-card__header']} */ ;
/** @type {__VLS_StyleScopedClasses['configured-content-card__description']} */ ;
/** @type {__VLS_StyleScopedClasses['configured-content-card__details']} */ ;
/** @type {__VLS_StyleScopedClasses['configured-content-card__add-item']} */ ;
/** @type {__VLS_StyleScopedClasses['configured-content-settings']} */ ;
/** @type {__VLS_StyleScopedClasses['content-settings-detail']} */ ;
/** @type {__VLS_StyleScopedClasses['content-settings-detail--root']} */ ;
/** @type {__VLS_StyleScopedClasses['content-settings-detail']} */ ;
/** @type {__VLS_StyleScopedClasses['content-settings-detail--item']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformanceAssessmentConfiguredPreview: PerformanceAssessmentConfiguredPreview,
            PerformanceAssessmentPreviewHeader: PerformanceAssessmentPreviewHeader,
            PerformanceConfiguredCardActionToolbar: PerformanceConfiguredCardActionToolbar,
            PerformanceContentSelectionFrame: PerformanceContentSelectionFrame,
            PerformanceDragHandle: PerformanceDragHandle,
            PerformanceExpandButton: PerformanceExpandButton,
            PerformanceWorkSummaryItemSettings: PerformanceWorkSummaryItemSettings,
            PerformanceWorkSummaryRootSettings: PerformanceWorkSummaryRootSettings,
            emit: emit,
            owner: owner,
            rulesEnabled: rulesEnabled,
            selectedItemKey: selectedItemKey,
            selectedItemSettings: selectedItemSettings,
            rendererItemSettings: rendererItemSettings,
            selectRoot: selectRoot,
            selectItem: selectItem,
            updateItemSettings: updateItemSettings,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
