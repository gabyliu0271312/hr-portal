/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import AddOutlinedIcon from './AddOutlinedIcon.vue';
const __VLS_props = withDefaults(defineProps(), {
    variant: 'text',
    label: '新建',
    disabled: false,
});
const __VLS_emit = defineEmits();
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    variant: 'text',
    label: '新建',
    disabled: false,
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['performance-create-button']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-create-button']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-create-button']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-create-button']} */ ;
/** @type {__VLS_StyleScopedClasses['is-icon']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.$emit('click');
        } },
    ...{ class: "performance-create-button" },
    ...{ class: (`is-${__VLS_ctx.variant}`) },
    type: "button",
    'aria-label': (__VLS_ctx.variant === 'icon' ? `新建${__VLS_ctx.label}` : undefined),
    disabled: (__VLS_ctx.disabled),
});
/** @type {[typeof AddOutlinedIcon, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(AddOutlinedIcon, new AddOutlinedIcon({
    ...{ class: "create-icon" },
}));
const __VLS_1 = __VLS_0({
    ...{ class: "create-icon" },
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
if (__VLS_ctx.variant === 'text') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.label);
}
/** @type {__VLS_StyleScopedClasses['performance-create-button']} */ ;
/** @type {__VLS_StyleScopedClasses['create-icon']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            AddOutlinedIcon: AddOutlinedIcon,
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
