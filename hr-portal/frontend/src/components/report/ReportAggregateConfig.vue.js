/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
const props = defineProps();
const emit = defineEmits();
const AGG_FUNCS = [
    { value: 'sum', label: '求和' },
    { value: 'avg', label: '平均' },
    { value: 'min', label: '最小' },
    { value: 'max', label: '最大' },
    { value: 'count', label: '计数' },
];
function setAggFunc(code, v) {
    emit('update:aggregations', { ...props.aggregations, [code]: v });
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['agg-line']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.br)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
const __VLS_0 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({}));
const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
const __VLS_4 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.aggregate),
    activeText: "开启聚合",
    inactiveText: "明细（不聚合）",
}));
const __VLS_6 = __VLS_5({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.aggregate),
    activeText: "开启聚合",
    inactiveText: "明细（不聚合）",
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
let __VLS_8;
let __VLS_9;
let __VLS_10;
const __VLS_11 = {
    'onUpdate:modelValue': ((v) => __VLS_ctx.emit('update:aggregate', v))
};
var __VLS_7;
var __VLS_3;
if (__VLS_ctx.aggregate) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "agg-box" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "agg-line" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "agg-label" },
    });
    if (__VLS_ctx.selectedDimensions.length) {
        for (const [c] of __VLS_getVForSourceType((__VLS_ctx.selectedDimensions))) {
            const __VLS_12 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
                key: (c.code),
                size: "small",
                effect: "plain",
                ...{ style: {} },
            }));
            const __VLS_14 = __VLS_13({
                key: (c.code),
                size: "small",
                effect: "plain",
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_13));
            __VLS_15.slots.default;
            (c.label);
            var __VLS_15;
        }
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "agg-line" },
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "agg-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    for (const [c] of __VLS_getVForSourceType((__VLS_ctx.selectedMeasures))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (c.code),
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
        (c.label);
        const __VLS_16 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (__VLS_ctx.aggregations[c.code] || 'sum'),
            ...{ style: {} },
            size: "small",
        }));
        const __VLS_18 = __VLS_17({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (__VLS_ctx.aggregations[c.code] || 'sum'),
            ...{ style: {} },
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_17));
        let __VLS_20;
        let __VLS_21;
        let __VLS_22;
        const __VLS_23 = {
            'onUpdate:modelValue': ((v) => __VLS_ctx.setAggFunc(c.code, v))
        };
        __VLS_19.slots.default;
        for (const [a] of __VLS_getVForSourceType((__VLS_ctx.AGG_FUNCS))) {
            const __VLS_24 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
                key: (a.value),
                label: (a.label),
                value: (a.value),
            }));
            const __VLS_26 = __VLS_25({
                key: (a.value),
                label: (a.label),
                value: (a.value),
            }, ...__VLS_functionalComponentArgsRest(__VLS_25));
        }
        var __VLS_19;
    }
    if (!__VLS_ctx.selectedMeasures.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
    }
}
/** @type {__VLS_StyleScopedClasses['agg-box']} */ ;
/** @type {__VLS_StyleScopedClasses['agg-line']} */ ;
/** @type {__VLS_StyleScopedClasses['agg-label']} */ ;
/** @type {__VLS_StyleScopedClasses['agg-line']} */ ;
/** @type {__VLS_StyleScopedClasses['agg-label']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            emit: emit,
            AGG_FUNCS: AGG_FUNCS,
            setAggFunc: setAggFunc,
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
