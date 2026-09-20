/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
const __VLS_props = withDefaults(defineProps(), { submitting: false });
const emit = defineEmits();
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({ submitting: false });
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['el-button']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.footer, __VLS_intrinsicElements.footer)({
    ...{ class: "full-screen-modal-footer" },
});
var __VLS_0 = {};
const __VLS_2 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_3 = __VLS_asFunctionalComponent(__VLS_2, new __VLS_2({
    ...{ 'onClick': {} },
    type: "primary",
    ...{ class: "full-screen-modal-footer-button" },
    loading: (__VLS_ctx.submitting),
}));
const __VLS_4 = __VLS_3({
    ...{ 'onClick': {} },
    type: "primary",
    ...{ class: "full-screen-modal-footer-button" },
    loading: (__VLS_ctx.submitting),
}, ...__VLS_functionalComponentArgsRest(__VLS_3));
let __VLS_6;
let __VLS_7;
let __VLS_8;
const __VLS_9 = {
    onClick: (...[$event]) => {
        __VLS_ctx.emit('submit');
    }
};
__VLS_5.slots.default;
var __VLS_5;
const __VLS_10 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_11 = __VLS_asFunctionalComponent(__VLS_10, new __VLS_10({
    ...{ 'onClick': {} },
    ...{ class: "full-screen-modal-footer-button preview-button" },
}));
const __VLS_12 = __VLS_11({
    ...{ 'onClick': {} },
    ...{ class: "full-screen-modal-footer-button preview-button" },
}, ...__VLS_functionalComponentArgsRest(__VLS_11));
let __VLS_14;
let __VLS_15;
let __VLS_16;
const __VLS_17 = {
    onClick: (...[$event]) => {
        __VLS_ctx.emit('preview');
    }
};
__VLS_13.slots.default;
var __VLS_13;
const __VLS_18 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_19 = __VLS_asFunctionalComponent(__VLS_18, new __VLS_18({
    ...{ 'onClick': {} },
    ...{ class: "full-screen-modal-footer-button cancel-button" },
}));
const __VLS_20 = __VLS_19({
    ...{ 'onClick': {} },
    ...{ class: "full-screen-modal-footer-button cancel-button" },
}, ...__VLS_functionalComponentArgsRest(__VLS_19));
let __VLS_22;
let __VLS_23;
let __VLS_24;
const __VLS_25 = {
    onClick: (...[$event]) => {
        __VLS_ctx.emit('cancel');
    }
};
__VLS_21.slots.default;
var __VLS_21;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-footer-button']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-footer-button']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-button']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-footer-button']} */ ;
/** @type {__VLS_StyleScopedClasses['cancel-button']} */ ;
// @ts-ignore
var __VLS_1 = __VLS_0;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            emit: emit,
        };
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
const __VLS_component = (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
export default {};
; /* PartiallyEnd: #4569/main.vue */
