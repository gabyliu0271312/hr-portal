/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { toRefs } from 'vue';
import PerformanceRichTextBox from './PerformanceRichTextBox.vue';
import PerformanceAssessmentRichTextField from './PerformanceAssessmentRichTextField.vue';
import PerformanceContentSelectionFrame from './PerformanceContentSelectionFrame.vue';
import PerformanceVisibleLockIcon from './PerformanceVisibleLockIcon.vue';
const props = withDefaults(defineProps(), { variant: 'configured-card', emptyText: '请输入内容', interactive: false, selectedItemId: null, selectionPrefix: '', itemSettings: () => ({}) });
const { content, variant, emptyText, interactive, selectedItemId } = toRefs(props);
const __VLS_emit = defineEmits();
const selectionKey = (itemId) => props.selectionPrefix ? `${props.selectionPrefix}:${itemId}` : itemId;
const hasItemSettings = (itemId) => Object.prototype.hasOwnProperty.call(props.itemSettings, itemId);
const itemState = (itemId) => props.itemSettings[itemId] || { mode: 'fill', required: false };
const ratingLevels = ['1星', '2星', '3星', '4星', '5星'];
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({ variant: 'configured-card', emptyText: '请输入内容', interactive: false, selectedItemId: null, selectionPrefix: '', itemSettings: () => ({}) });
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['content-renderer-rating']} */ ;
/** @type {__VLS_StyleScopedClasses['content-renderer-rating']} */ ;
/** @type {__VLS_StyleScopedClasses['content-renderer-rating__levels']} */ ;
/** @type {__VLS_StyleScopedClasses['content-renderer-item']} */ ;
/** @type {__VLS_StyleScopedClasses['content-renderer-item--configured']} */ ;
/** @type {__VLS_StyleScopedClasses['content-renderer-item--configured']} */ ;
/** @type {__VLS_StyleScopedClasses['content-renderer-hidden-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-assessment-rich-text-field__label']} */ ;
/** @type {__VLS_StyleScopedClasses['content-renderer-item--hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['content-renderer-item--hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['content-renderer-item--hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-rich-text-box']} */ ;
/** @type {__VLS_StyleScopedClasses['content-renderer-item--hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['content-renderer-editor__body']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "performance-content-renderer" },
    ...{ class: (`performance-content-renderer--${__VLS_ctx.variant}`) },
});
if (__VLS_ctx.content.type === 'rating') {
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.content.items))) {
        /** @type {[typeof PerformanceContentSelectionFrame, typeof PerformanceContentSelectionFrame, ]} */ ;
        // @ts-ignore
        const __VLS_0 = __VLS_asFunctionalComponent(PerformanceContentSelectionFrame, new PerformanceContentSelectionFrame({
            ...{ 'onClick': {} },
            key: (item.id),
            variant: "item",
            ...{ class: "content-renderer-rating content-renderer-item--interactive" },
            ...{ class: ({ 'content-renderer-item--selected': __VLS_ctx.selectionKey(item.id) === __VLS_ctx.selectedItemId, 'content-renderer-item--configured': __VLS_ctx.hasItemSettings(item.id), 'content-renderer-item--hidden': __VLS_ctx.hasItemSettings(item.id) && __VLS_ctx.itemState(item.id).mode === 'hidden' }) },
            selected: (__VLS_ctx.selectionKey(item.id) === __VLS_ctx.selectedItemId),
            dataContentItemId: (item.id),
            'aria-disabled': (__VLS_ctx.hasItemSettings(item.id) && __VLS_ctx.itemState(item.id).mode === 'hidden'),
        }));
        const __VLS_1 = __VLS_0({
            ...{ 'onClick': {} },
            key: (item.id),
            variant: "item",
            ...{ class: "content-renderer-rating content-renderer-item--interactive" },
            ...{ class: ({ 'content-renderer-item--selected': __VLS_ctx.selectionKey(item.id) === __VLS_ctx.selectedItemId, 'content-renderer-item--configured': __VLS_ctx.hasItemSettings(item.id), 'content-renderer-item--hidden': __VLS_ctx.hasItemSettings(item.id) && __VLS_ctx.itemState(item.id).mode === 'hidden' }) },
            selected: (__VLS_ctx.selectionKey(item.id) === __VLS_ctx.selectedItemId),
            dataContentItemId: (item.id),
            'aria-disabled': (__VLS_ctx.hasItemSettings(item.id) && __VLS_ctx.itemState(item.id).mode === 'hidden'),
        }, ...__VLS_functionalComponentArgsRest(__VLS_0));
        let __VLS_3;
        let __VLS_4;
        let __VLS_5;
        const __VLS_6 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.content.type === 'rating'))
                    return;
                __VLS_ctx.interactive && __VLS_ctx.$emit('select-item', item.id);
            }
        };
        __VLS_2.slots.default;
        if (__VLS_ctx.hasItemSettings(item.id) && __VLS_ctx.itemState(item.id).mode === 'hidden') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ class: "content-renderer-hidden-icon" },
                type: "button",
                'aria-label': "在此环节隐藏",
                tabindex: "-1",
            });
            /** @type {[typeof PerformanceVisibleLockIcon, ]} */ ;
            // @ts-ignore
            const __VLS_7 = __VLS_asFunctionalComponent(PerformanceVisibleLockIcon, new PerformanceVisibleLockIcon({}));
            const __VLS_8 = __VLS_7({}, ...__VLS_functionalComponentArgsRest(__VLS_7));
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (item.label);
        if (!__VLS_ctx.hasItemSettings(item.id) || __VLS_ctx.itemState(item.id).required) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({});
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "content-renderer-rating__levels" },
        });
        for (const [level] of __VLS_getVForSourceType((__VLS_ctx.ratingLevels))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                key: (level),
            });
            (level);
        }
        var __VLS_2;
    }
}
else {
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.content.items))) {
        /** @type {[typeof PerformanceContentSelectionFrame, typeof PerformanceContentSelectionFrame, ]} */ ;
        // @ts-ignore
        const __VLS_10 = __VLS_asFunctionalComponent(PerformanceContentSelectionFrame, new PerformanceContentSelectionFrame({
            ...{ 'onClick': {} },
            key: (item.id),
            variant: "item",
            ...{ class: "content-renderer-item content-renderer-item--interactive" },
            ...{ class: ({ 'content-renderer-item--selected': __VLS_ctx.selectionKey(item.id) === __VLS_ctx.selectedItemId, 'content-renderer-item--configured': __VLS_ctx.hasItemSettings(item.id), 'content-renderer-item--hidden': __VLS_ctx.itemState(item.id).mode === 'hidden' }) },
            selected: (__VLS_ctx.selectionKey(item.id) === __VLS_ctx.selectedItemId),
            dataContentItemId: (item.id),
            'aria-disabled': (__VLS_ctx.itemState(item.id).mode === 'hidden'),
        }));
        const __VLS_11 = __VLS_10({
            ...{ 'onClick': {} },
            key: (item.id),
            variant: "item",
            ...{ class: "content-renderer-item content-renderer-item--interactive" },
            ...{ class: ({ 'content-renderer-item--selected': __VLS_ctx.selectionKey(item.id) === __VLS_ctx.selectedItemId, 'content-renderer-item--configured': __VLS_ctx.hasItemSettings(item.id), 'content-renderer-item--hidden': __VLS_ctx.itemState(item.id).mode === 'hidden' }) },
            selected: (__VLS_ctx.selectionKey(item.id) === __VLS_ctx.selectedItemId),
            dataContentItemId: (item.id),
            'aria-disabled': (__VLS_ctx.itemState(item.id).mode === 'hidden'),
        }, ...__VLS_functionalComponentArgsRest(__VLS_10));
        let __VLS_13;
        let __VLS_14;
        let __VLS_15;
        const __VLS_16 = {
            onClick: (...[$event]) => {
                if (!!(__VLS_ctx.content.type === 'rating'))
                    return;
                __VLS_ctx.interactive && __VLS_ctx.$emit('select-item', item.id);
            }
        };
        __VLS_12.slots.default;
        if (__VLS_ctx.itemState(item.id).mode === 'hidden') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ class: "content-renderer-hidden-icon" },
                type: "button",
                'aria-label': "在此环节隐藏",
                tabindex: "-1",
            });
            /** @type {[typeof PerformanceVisibleLockIcon, ]} */ ;
            // @ts-ignore
            const __VLS_17 = __VLS_asFunctionalComponent(PerformanceVisibleLockIcon, new PerformanceVisibleLockIcon({}));
            const __VLS_18 = __VLS_17({}, ...__VLS_functionalComponentArgsRest(__VLS_17));
        }
        /** @type {[typeof PerformanceAssessmentRichTextField, typeof PerformanceAssessmentRichTextField, ]} */ ;
        // @ts-ignore
        const __VLS_20 = __VLS_asFunctionalComponent(PerformanceAssessmentRichTextField, new PerformanceAssessmentRichTextField({
            label: (item.label),
            required: (__VLS_ctx.itemState(item.id).required && __VLS_ctx.itemState(item.id).mode === 'fill'),
        }));
        const __VLS_21 = __VLS_20({
            label: (item.label),
            required: (__VLS_ctx.itemState(item.id).required && __VLS_ctx.itemState(item.id).mode === 'fill'),
        }, ...__VLS_functionalComponentArgsRest(__VLS_20));
        __VLS_22.slots.default;
        /** @type {[typeof PerformanceRichTextBox, typeof PerformanceRichTextBox, ]} */ ;
        // @ts-ignore
        const __VLS_23 = __VLS_asFunctionalComponent(PerformanceRichTextBox, new PerformanceRichTextBox({
            readonly: true,
        }));
        const __VLS_24 = __VLS_23({
            readonly: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_23));
        __VLS_25.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
            ...{ class: "content-renderer-editor__body" },
        });
        __VLS_asFunctionalDirective(__VLS_directives.vHtml)(null, { ...__VLS_directiveBindingRestFields, value: (item.richText || __VLS_ctx.emptyText) }, null, null);
        var __VLS_25;
        var __VLS_22;
        var __VLS_12;
    }
}
/** @type {__VLS_StyleScopedClasses['performance-content-renderer']} */ ;
/** @type {__VLS_StyleScopedClasses['content-renderer-rating']} */ ;
/** @type {__VLS_StyleScopedClasses['content-renderer-item--interactive']} */ ;
/** @type {__VLS_StyleScopedClasses['content-renderer-hidden-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['content-renderer-rating__levels']} */ ;
/** @type {__VLS_StyleScopedClasses['content-renderer-item']} */ ;
/** @type {__VLS_StyleScopedClasses['content-renderer-item--interactive']} */ ;
/** @type {__VLS_StyleScopedClasses['content-renderer-hidden-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['content-renderer-editor__body']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformanceRichTextBox: PerformanceRichTextBox,
            PerformanceAssessmentRichTextField: PerformanceAssessmentRichTextField,
            PerformanceContentSelectionFrame: PerformanceContentSelectionFrame,
            PerformanceVisibleLockIcon: PerformanceVisibleLockIcon,
            content: content,
            variant: variant,
            emptyText: emptyText,
            interactive: interactive,
            selectedItemId: selectedItemId,
            selectionKey: selectionKey,
            hasItemSettings: hasItemSettings,
            itemState: itemState,
            ratingLevels: ratingLevels,
        };
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
; /* PartiallyEnd: #4569/main.vue */
