import { ref, watch } from 'vue';
import PerformancePromptColorPicker from './PerformancePromptColorPicker.vue';
const props = defineProps();
const emit = defineEmits();
const draftTitle = ref('');
const draftContent = ref('');
const draftColor = ref('#3B82F6');
const draftScope = ref('all');
watch(() => props.open, v => { if (v) {
    draftTitle.value = '';
    draftContent.value = '';
    draftColor.value = '#3B82F6';
    draftScope.value = 'all';
} });
function close() { emit('update:open', false); }
function confirm() { if (!draftContent.value.trim())
    return; emit('save', { title: draftTitle.value, content: draftContent.value, color: draftColor.value, scope: draftScope.value }); close(); }
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['prompt-input']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-textarea']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-radio']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-radio']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-radio__dot']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-confirm']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-cancel']} */ ;
// CSS variable injection 
// CSS variable injection end 
const __VLS_0 = {}.Teleport;
/** @type {[typeof __VLS_components.Teleport, typeof __VLS_components.Teleport, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    to: "body",
}));
const __VLS_2 = __VLS_1({
    to: "body",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
if (__VLS_ctx.open) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (__VLS_ctx.close) },
        ...{ class: "prompt-modal__mask" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "prompt-modal" },
        role: "dialog",
        'aria-modal': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
        ...{ class: "prompt-modal__header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "prompt-modal__title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.close) },
        ...{ class: "prompt-modal__close" },
        type: "button",
        'aria-label': "关闭",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "prompt-modal__body" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "prompt-field" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "prompt-field__label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        value: (__VLS_ctx.draftTitle),
        ...{ class: "prompt-input" },
        type: "text",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "prompt-field" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "prompt-field__label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "prompt-required" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "prompt-textarea-wrap" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.textarea)({
        value: (__VLS_ctx.draftContent),
        ...{ class: "prompt-textarea" },
        maxlength: "2000",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "prompt-count" },
    });
    (__VLS_ctx.draftContent.length);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "prompt-field" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "prompt-field__label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "prompt-required" },
    });
    /** @type {[typeof PerformancePromptColorPicker, ]} */ ;
    // @ts-ignore
    const __VLS_4 = __VLS_asFunctionalComponent(PerformancePromptColorPicker, new PerformancePromptColorPicker({
        modelValue: (__VLS_ctx.draftColor),
    }));
    const __VLS_5 = __VLS_4({
        modelValue: (__VLS_ctx.draftColor),
    }, ...__VLS_functionalComponentArgsRest(__VLS_4));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "prompt-field" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "prompt-field__label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "prompt-required" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "prompt-radio-group" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "prompt-radio" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        type: "radio",
        value: "all",
    });
    (__VLS_ctx.draftScope);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "prompt-radio__dot" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "prompt-radio" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        type: "radio",
        value: "cycle",
    });
    (__VLS_ctx.draftScope);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "prompt-radio__dot" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.footer, __VLS_intrinsicElements.footer)({
        ...{ class: "prompt-modal__footer" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.confirm) },
        ...{ class: "prompt-confirm" },
        type: "button",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.close) },
        ...{ class: "prompt-cancel" },
        type: "button",
    });
}
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['prompt-modal__mask']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-modal']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-modal__header']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-modal__title']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-modal__close']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-modal__body']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-field']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-field__label']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-input']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-field']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-field__label']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-required']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-textarea-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-textarea']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-count']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-field']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-field__label']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-required']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-field']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-field__label']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-required']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-radio-group']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-radio']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-radio__dot']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-radio']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-radio__dot']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-modal__footer']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-confirm']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-cancel']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformancePromptColorPicker: PerformancePromptColorPicker,
            draftTitle: draftTitle,
            draftContent: draftContent,
            draftColor: draftColor,
            draftScope: draftScope,
            close: close,
            confirm: confirm,
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
