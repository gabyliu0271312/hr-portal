import FullscreenWorkspaceShell from '@/components/layout/FullscreenWorkspaceShell.vue';
const __VLS_props = withDefaults(defineProps(), {
    steps: () => [],
    activeStep: '',
    busy: false,
});
const emit = defineEmits();
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    steps: () => [],
    activeStep: '',
    busy: false,
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {[typeof FullscreenWorkspaceShell, typeof FullscreenWorkspaceShell, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(FullscreenWorkspaceShell, new FullscreenWorkspaceShell({
    ...{ 'onBack': {} },
    ...{ 'onStepChange': {} },
    title: (__VLS_ctx.title),
    description: (__VLS_ctx.description),
    steps: (__VLS_ctx.steps),
    activeStep: (__VLS_ctx.activeStep),
    busy: (__VLS_ctx.busy),
}));
const __VLS_1 = __VLS_0({
    ...{ 'onBack': {} },
    ...{ 'onStepChange': {} },
    title: (__VLS_ctx.title),
    description: (__VLS_ctx.description),
    steps: (__VLS_ctx.steps),
    activeStep: (__VLS_ctx.activeStep),
    busy: (__VLS_ctx.busy),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
let __VLS_3;
let __VLS_4;
let __VLS_5;
const __VLS_6 = {
    onBack: (...[$event]) => {
        __VLS_ctx.emit('back');
    }
};
const __VLS_7 = {
    onStepChange: (...[$event]) => {
        __VLS_ctx.emit('stepChange', $event);
    }
};
var __VLS_8 = {};
__VLS_2.slots.default;
{
    const { actions: __VLS_thisSlot } = __VLS_2.slots;
    var __VLS_9 = {};
}
var __VLS_11 = {};
var __VLS_2;
// @ts-ignore
var __VLS_10 = __VLS_9, __VLS_12 = __VLS_11;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            FullscreenWorkspaceShell: FullscreenWorkspaceShell,
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
