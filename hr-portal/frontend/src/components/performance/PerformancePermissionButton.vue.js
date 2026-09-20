/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import PermissionButton from '@/components/PermissionButton.vue';
const __VLS_props = withDefaults(defineProps(), {
    op: 'U',
    disabled: false,
    danger: false,
    ariaLabel: undefined,
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    op: 'U',
    disabled: false,
    danger: false,
    ariaLabel: undefined,
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
if (__VLS_ctx.allowed) {
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_0 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        menu: "performance.admin",
        op: "V",
        mode: "disable",
        type: "text",
        disabled: (__VLS_ctx.disabled),
        'aria-label': (__VLS_ctx.ariaLabel),
        ...{ class: ({ 'is-danger': __VLS_ctx.danger }) },
    }));
    const __VLS_1 = __VLS_0({
        menu: "performance.admin",
        op: "V",
        mode: "disable",
        type: "text",
        disabled: (__VLS_ctx.disabled),
        'aria-label': (__VLS_ctx.ariaLabel),
        ...{ class: ({ 'is-danger': __VLS_ctx.danger }) },
    }, ...__VLS_functionalComponentArgsRest(__VLS_0));
    var __VLS_3 = {};
    __VLS_2.slots.default;
    var __VLS_4 = {};
    var __VLS_2;
}
// @ts-ignore
var __VLS_5 = __VLS_4;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PermissionButton: PermissionButton,
        };
    },
    __typeProps: {},
    props: {},
});
const __VLS_component = (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeProps: {},
    props: {},
});
export default {};
; /* PartiallyEnd: #4569/main.vue */
