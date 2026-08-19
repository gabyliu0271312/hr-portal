/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { Plus } from '@element-plus/icons-vue';
const props = defineProps();
const emit = defineEmits();
function addRule() {
    emit('update:roundingCorrections', [...props.roundingCorrections, { group_by: '', target_cols: [] }]);
}
function removeRule(i) {
    const next = [...props.roundingCorrections];
    next.splice(i, 1);
    emit('update:roundingCorrections', next);
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
if (__VLS_ctx.aggregate) {
    for (const [rc, i] of __VLS_getVForSourceType((__VLS_ctx.roundingCorrections))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (i),
            ...{ class: "agg-box" },
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "agg-line" },
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "agg-label" },
        });
        const __VLS_0 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
            modelValue: (rc.group_by),
            filterable: true,
            clearable: true,
            ...{ style: {} },
            placeholder: "选择收口维度",
        }));
        const __VLS_2 = __VLS_1({
            modelValue: (rc.group_by),
            filterable: true,
            clearable: true,
            ...{ style: {} },
            placeholder: "选择收口维度",
        }, ...__VLS_functionalComponentArgsRest(__VLS_1));
        __VLS_3.slots.default;
        for (const [c] of __VLS_getVForSourceType((__VLS_ctx.selectedDimensions))) {
            const __VLS_4 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
                key: (c.code),
                label: (c.label),
                value: (c.code),
            }));
            const __VLS_6 = __VLS_5({
                key: (c.code),
                label: (c.label),
                value: (c.code),
            }, ...__VLS_functionalComponentArgsRest(__VLS_5));
        }
        var __VLS_3;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "agg-label" },
            ...{ style: {} },
        });
        const __VLS_8 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
            modelValue: (rc.target_cols),
            multiple: true,
            filterable: true,
            clearable: true,
            ...{ style: {} },
            placeholder: "选择金额字段",
        }));
        const __VLS_10 = __VLS_9({
            modelValue: (rc.target_cols),
            multiple: true,
            filterable: true,
            clearable: true,
            ...{ style: {} },
            placeholder: "选择金额字段",
        }, ...__VLS_functionalComponentArgsRest(__VLS_9));
        __VLS_11.slots.default;
        for (const [c] of __VLS_getVForSourceType((__VLS_ctx.selectedMeasures))) {
            const __VLS_12 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
                key: (c.code),
                label: (c.label),
                value: (c.code),
            }));
            const __VLS_14 = __VLS_13({
                key: (c.code),
                label: (c.label),
                value: (c.code),
            }, ...__VLS_functionalComponentArgsRest(__VLS_13));
        }
        var __VLS_11;
        const __VLS_16 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
            ...{ 'onClick': {} },
            link: true,
            type: "danger",
        }));
        const __VLS_18 = __VLS_17({
            ...{ 'onClick': {} },
            link: true,
            type: "danger",
        }, ...__VLS_functionalComponentArgsRest(__VLS_17));
        let __VLS_20;
        let __VLS_21;
        let __VLS_22;
        const __VLS_23 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.aggregate))
                    return;
                __VLS_ctx.removeRule(i);
            }
        };
        __VLS_19.slots.default;
        var __VLS_19;
    }
    const __VLS_24 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
        ...{ 'onClick': {} },
        link: true,
        type: "primary",
    }));
    const __VLS_26 = __VLS_25({
        ...{ 'onClick': {} },
        link: true,
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
    let __VLS_28;
    let __VLS_29;
    let __VLS_30;
    const __VLS_31 = {
        onClick: (__VLS_ctx.addRule)
    };
    __VLS_27.slots.default;
    const __VLS_32 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
        ...{ style: {} },
    }));
    const __VLS_34 = __VLS_33({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_33));
    __VLS_35.slots.default;
    const __VLS_36 = {}.Plus;
    /** @type {[typeof __VLS_components.Plus, ]} */ ;
    // @ts-ignore
    const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({}));
    const __VLS_38 = __VLS_37({}, ...__VLS_functionalComponentArgsRest(__VLS_37));
    var __VLS_35;
    var __VLS_27;
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
}
/** @type {__VLS_StyleScopedClasses['agg-box']} */ ;
/** @type {__VLS_StyleScopedClasses['agg-line']} */ ;
/** @type {__VLS_StyleScopedClasses['agg-label']} */ ;
/** @type {__VLS_StyleScopedClasses['agg-label']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Plus: Plus,
            addRule: addRule,
            removeRule: removeRule,
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
