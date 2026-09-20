import SpaceLeftOutlinedIcon from './SpaceLeftOutlinedIcon.vue';
const __VLS_props = defineProps();
const emit = defineEmits();
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-header-back']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-header-back']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-header-subtitle']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "full-screen-modal-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "full-screen-modal-header-left" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.emit('back');
        } },
    ...{ class: "full-screen-modal-header-back" },
    type: "button",
});
/** @type {[typeof SpaceLeftOutlinedIcon, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(SpaceLeftOutlinedIcon, new SpaceLeftOutlinedIcon({
    ...{ class: "full-screen-modal-header-back-icon" },
}));
const __VLS_1 = __VLS_0({
    ...{ class: "full-screen-modal-header-back-icon" },
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "full-screen-modal-header-back-text" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "full-screen-modal-header-gap" },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "full-screen-modal-header-title" },
});
(__VLS_ctx.title);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "full-screen-modal-header-subtitle" },
});
var __VLS_3 = {};
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "full-screen-modal-header-right" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "full-screen-modal-header-actions" },
});
var __VLS_5 = {};
/** @type {__VLS_StyleScopedClasses['full-screen-modal-header']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-header-left']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-header-back']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-header-back-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-header-back-text']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-header-gap']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-header-title']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-header-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-header-right']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-header-actions']} */ ;
// @ts-ignore
var __VLS_4 = __VLS_3, __VLS_6 = __VLS_5;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            SpaceLeftOutlinedIcon: SpaceLeftOutlinedIcon,
            emit: emit,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
const __VLS_component = (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
});
export default {};
; /* PartiallyEnd: #4569/main.vue */
