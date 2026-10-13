import { ArrowLeft, InfoFilled } from '@element-plus/icons-vue';
const __VLS_props = withDefaults(defineProps(), {
    subtitle: '',
    description: '',
    steps: () => [],
    activeStep: '',
    busy: false,
});
const emit = defineEmits();
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    subtitle: '',
    description: '',
    steps: () => [],
    activeStep: '',
    busy: false,
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['workspace-back']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-back']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-info']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-info']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-step']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-step']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-step']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-step-label']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-step']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-header']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-steps']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-header']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-header-left']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-steps']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-content']} */ ;
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
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "fullscreen-workspace" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "workspace-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workspace-header-left" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.emit('back');
        } },
    ...{ class: "workspace-back" },
    type: "button",
    disabled: (__VLS_ctx.busy),
});
const __VLS_4 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({}));
const __VLS_6 = __VLS_5({}, ...__VLS_functionalComponentArgsRest(__VLS_5));
__VLS_7.slots.default;
const __VLS_8 = {}.ArrowLeft;
/** @type {[typeof __VLS_components.ArrowLeft, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({}));
const __VLS_10 = __VLS_9({}, ...__VLS_functionalComponentArgsRest(__VLS_9));
var __VLS_7;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workspace-title-area" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workspace-title-row" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
    ...{ class: "workspace-title" },
});
(__VLS_ctx.title);
if (__VLS_ctx.description) {
    const __VLS_12 = {}.ElTooltip;
    /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
        content: (__VLS_ctx.description),
        placement: "bottom",
        showAfter: (200),
    }));
    const __VLS_14 = __VLS_13({
        content: (__VLS_ctx.description),
        placement: "bottom",
        showAfter: (200),
    }, ...__VLS_functionalComponentArgsRest(__VLS_13));
    __VLS_15.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ class: "workspace-info" },
        type: "button",
        'aria-label': (`查看${__VLS_ctx.title}说明`),
    });
    const __VLS_16 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({}));
    const __VLS_18 = __VLS_17({}, ...__VLS_functionalComponentArgsRest(__VLS_17));
    __VLS_19.slots.default;
    const __VLS_20 = {}.InfoFilled;
    /** @type {[typeof __VLS_components.InfoFilled, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({}));
    const __VLS_22 = __VLS_21({}, ...__VLS_functionalComponentArgsRest(__VLS_21));
    var __VLS_19;
    var __VLS_15;
}
var __VLS_24 = {};
if (__VLS_ctx.subtitle) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "workspace-subtitle" },
    });
    (__VLS_ctx.subtitle);
}
if (__VLS_ctx.steps.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.nav, __VLS_intrinsicElements.nav)({
        ...{ class: "workspace-steps" },
        'aria-label': "流程步骤",
    });
    for (const [step, index] of __VLS_getVForSourceType((__VLS_ctx.steps))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.steps.length))
                        return;
                    __VLS_ctx.emit('stepChange', step.key);
                } },
            key: (step.key),
            type: "button",
            ...{ class: "workspace-step" },
            ...{ class: ({ active: __VLS_ctx.activeStep === step.key }) },
            disabled: (__VLS_ctx.busy || step.disabled),
            'aria-current': (__VLS_ctx.activeStep === step.key ? 'step' : undefined),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "workspace-step-label" },
        });
        (step.label);
        if (index < __VLS_ctx.steps.length - 1) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "workspace-step-arrow" },
                'aria-hidden': "true",
            });
        }
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workspace-actions" },
});
var __VLS_26 = {};
__VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
    ...{ class: "workspace-content" },
});
var __VLS_28 = {};
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['fullscreen-workspace']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-header']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-header-left']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-back']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-title-area']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-title-row']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-title']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-info']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-steps']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-step']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-step-label']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-step-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-content']} */ ;
// @ts-ignore
var __VLS_25 = __VLS_24, __VLS_27 = __VLS_26, __VLS_29 = __VLS_28;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ArrowLeft: ArrowLeft,
            InfoFilled: InfoFilled,
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
