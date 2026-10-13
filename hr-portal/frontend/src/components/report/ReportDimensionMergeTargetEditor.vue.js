/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, watch } from 'vue';
const props = defineProps();
const emit = defineEmits();
function idOf(column) {
    return column._instance_id || column.code;
}
function valueKey(value) {
    return `${value === null ? 'null' : typeof value}:${String(value)}`;
}
function valueLabel(value) {
    if (value === null)
        return '（NULL）';
    if (value === '')
        return '（空字符串）';
    if (typeof value === 'string' && value.trim() === '')
        return '（空白文本）';
    if (typeof value === 'string' && value === '0')
        return '"0"';
    return String(value);
}
function sourceValues(field) {
    const values = props.sources.map((item) => item.values[field] ?? null);
    return values.filter((value, index) => values.findIndex((item) => valueKey(item) === valueKey(value)) === index);
}
function patch(field, changes) {
    const next = {
        values: { ...props.modelValue.values },
        modes: { ...props.modelValue.modes },
    };
    if (changes.mode)
        next.modes[field] = changes.mode;
    if ('value' in changes)
        next.values[field] = changes.value ?? null;
    emit('update:modelValue', next);
}
function changeMode(field, mode) {
    if (props.expandBy?.includes(field)) {
        patch(field, { mode: 'preserve' });
        return;
    }
    const values = sourceValues(field);
    if (mode === 'auto' && values.length === 1)
        patch(field, { mode, value: values[0] });
    else if (mode === 'source')
        patch(field, { mode, value: values[0] ?? null });
    else
        patch(field, { mode, value: props.modelValue.values[field] ?? '' });
}
const invalidFields = computed(() => props.dimensions
    .map(idOf)
    .filter((field) => {
    const mode = props.modelValue.modes[field];
    const value = props.modelValue.values[field];
    if (mode === 'auto')
        return sourceValues(field).length !== 1;
    if (mode === 'source')
        return !sourceValues(field).some((item) => valueKey(item) === valueKey(value));
    if (mode === 'preserve')
        return false;
    return value === null || (typeof value === 'string' && !value.trim());
}));
watch(() => props.sources, () => {
    const next = {
        values: { ...props.modelValue.values },
        modes: { ...props.modelValue.modes },
    };
    let changed = false;
    for (const column of props.dimensions) {
        const field = idOf(column);
        const values = sourceValues(field);
        const currentValue = next.values[field];
        if (props.expandBy?.includes(field)) {
            if (next.modes[field] !== 'preserve') {
                next.modes[field] = 'preserve';
                delete next.values[field];
                changed = true;
            }
            continue;
        }
        const emptyCustom = next.modes[field] === 'custom'
            && (currentValue === null || (typeof currentValue === 'string' && !currentValue.trim()));
        if ((!next.modes[field] || emptyCustom) && values.length === 1) {
            next.modes[field] = 'auto';
            next.values[field] = values[0];
            changed = true;
        }
    }
    if (changed)
        emit('update:modelValue', next);
}, { deep: true, immediate: true });
const __VLS_exposed = { invalidFields };
defineExpose(__VLS_exposed);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['target-head']} */ ;
/** @type {__VLS_StyleScopedClasses['dimension-label']} */ ;
/** @type {__VLS_StyleScopedClasses['target-editor']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "target-editor" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "target-head" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
for (const [column] of __VLS_getVForSourceType((__VLS_ctx.dimensions))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (__VLS_ctx.idOf(column)),
        ...{ class: "target-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "dimension-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (column.label || column.code);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
    (column.data_type);
    const __VLS_0 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.modelValue.modes[__VLS_ctx.idOf(column)]),
        ...{ style: {} },
    }));
    const __VLS_2 = __VLS_1({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.modelValue.modes[__VLS_ctx.idOf(column)]),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    let __VLS_4;
    let __VLS_5;
    let __VLS_6;
    const __VLS_7 = {
        'onUpdate:modelValue': (...[$event]) => {
            __VLS_ctx.changeMode(__VLS_ctx.idOf(column), $event);
        }
    };
    __VLS_3.slots.default;
    if (__VLS_ctx.expandBy?.includes(__VLS_ctx.idOf(column))) {
        const __VLS_8 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
            label: "保留每月值",
            value: "preserve",
        }));
        const __VLS_10 = __VLS_9({
            label: "保留每月值",
            value: "preserve",
        }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    }
    else {
        const __VLS_12 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
            label: "自动带出",
            value: "auto",
            disabled: (__VLS_ctx.sourceValues(__VLS_ctx.idOf(column)).length !== 1),
        }));
        const __VLS_14 = __VLS_13({
            label: "自动带出",
            value: "auto",
            disabled: (__VLS_ctx.sourceValues(__VLS_ctx.idOf(column)).length !== 1),
        }, ...__VLS_functionalComponentArgsRest(__VLS_13));
        const __VLS_16 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
            label: "选择来源值",
            value: "source",
        }));
        const __VLS_18 = __VLS_17({
            label: "选择来源值",
            value: "source",
        }, ...__VLS_functionalComponentArgsRest(__VLS_17));
        const __VLS_20 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
            label: "自定义值",
            value: "custom",
        }));
        const __VLS_22 = __VLS_21({
            label: "自定义值",
            value: "custom",
        }, ...__VLS_functionalComponentArgsRest(__VLS_21));
    }
    var __VLS_3;
    if (__VLS_ctx.modelValue.modes[__VLS_ctx.idOf(column)] === 'preserve') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "preserve-value" },
        });
    }
    else if (__VLS_ctx.modelValue.modes[__VLS_ctx.idOf(column)] !== 'custom') {
        const __VLS_24 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (__VLS_ctx.valueKey(__VLS_ctx.modelValue.values[__VLS_ctx.idOf(column)] ?? null)),
            disabled: (__VLS_ctx.modelValue.modes[__VLS_ctx.idOf(column)] === 'auto'),
            ...{ style: {} },
        }));
        const __VLS_26 = __VLS_25({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (__VLS_ctx.valueKey(__VLS_ctx.modelValue.values[__VLS_ctx.idOf(column)] ?? null)),
            disabled: (__VLS_ctx.modelValue.modes[__VLS_ctx.idOf(column)] === 'auto'),
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_25));
        let __VLS_28;
        let __VLS_29;
        let __VLS_30;
        const __VLS_31 = {
            'onUpdate:modelValue': (...[$event]) => {
                if (!!(__VLS_ctx.modelValue.modes[__VLS_ctx.idOf(column)] === 'preserve'))
                    return;
                if (!(__VLS_ctx.modelValue.modes[__VLS_ctx.idOf(column)] !== 'custom'))
                    return;
                __VLS_ctx.patch(__VLS_ctx.idOf(column), { value: __VLS_ctx.sourceValues(__VLS_ctx.idOf(column)).find((item) => __VLS_ctx.valueKey(item) === $event) ?? null });
            }
        };
        __VLS_27.slots.default;
        for (const [value] of __VLS_getVForSourceType((__VLS_ctx.sourceValues(__VLS_ctx.idOf(column))))) {
            const __VLS_32 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
                key: (__VLS_ctx.valueKey(value)),
                label: (__VLS_ctx.valueLabel(value)),
                value: (__VLS_ctx.valueKey(value)),
            }));
            const __VLS_34 = __VLS_33({
                key: (__VLS_ctx.valueKey(value)),
                label: (__VLS_ctx.valueLabel(value)),
                value: (__VLS_ctx.valueKey(value)),
            }, ...__VLS_functionalComponentArgsRest(__VLS_33));
        }
        var __VLS_27;
    }
    else if (['number', 'integer', 'decimal', 'float', 'double', 'numeric'].includes(column.data_type)) {
        const __VLS_36 = {}.ElInputNumber;
        /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
        // @ts-ignore
        const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: __VLS_ctx.modelValue.values[__VLS_ctx.idOf(column)],
            ...{ style: {} },
        }));
        const __VLS_38 = __VLS_37({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: __VLS_ctx.modelValue.values[__VLS_ctx.idOf(column)],
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_37));
        let __VLS_40;
        let __VLS_41;
        let __VLS_42;
        const __VLS_43 = {
            'onUpdate:modelValue': (...[$event]) => {
                if (!!(__VLS_ctx.modelValue.modes[__VLS_ctx.idOf(column)] === 'preserve'))
                    return;
                if (!!(__VLS_ctx.modelValue.modes[__VLS_ctx.idOf(column)] !== 'custom'))
                    return;
                if (!(['number', 'integer', 'decimal', 'float', 'double', 'numeric'].includes(column.data_type)))
                    return;
                __VLS_ctx.patch(__VLS_ctx.idOf(column), { value: $event });
            }
        };
        var __VLS_39;
    }
    else if (['date', 'datetime', 'timestamp', 'timestamptz'].includes(column.data_type)) {
        const __VLS_44 = {}.ElDatePicker;
        /** @type {[typeof __VLS_components.ElDatePicker, typeof __VLS_components.elDatePicker, ]} */ ;
        // @ts-ignore
        const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: __VLS_ctx.modelValue.values[__VLS_ctx.idOf(column)],
            type: (column.data_type === 'date' ? 'date' : 'datetime'),
            valueFormat: (column.data_type === 'date' ? 'YYYY-MM-DD' : 'YYYY-MM-DDTHH:mm:ssZ'),
            ...{ style: {} },
        }));
        const __VLS_46 = __VLS_45({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: __VLS_ctx.modelValue.values[__VLS_ctx.idOf(column)],
            type: (column.data_type === 'date' ? 'date' : 'datetime'),
            valueFormat: (column.data_type === 'date' ? 'YYYY-MM-DD' : 'YYYY-MM-DDTHH:mm:ssZ'),
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_45));
        let __VLS_48;
        let __VLS_49;
        let __VLS_50;
        const __VLS_51 = {
            'onUpdate:modelValue': (...[$event]) => {
                if (!!(__VLS_ctx.modelValue.modes[__VLS_ctx.idOf(column)] === 'preserve'))
                    return;
                if (!!(__VLS_ctx.modelValue.modes[__VLS_ctx.idOf(column)] !== 'custom'))
                    return;
                if (!!(['number', 'integer', 'decimal', 'float', 'double', 'numeric'].includes(column.data_type)))
                    return;
                if (!(['date', 'datetime', 'timestamp', 'timestamptz'].includes(column.data_type)))
                    return;
                __VLS_ctx.patch(__VLS_ctx.idOf(column), { value: $event });
            }
        };
        var __VLS_47;
    }
    else if (['boolean', 'bool'].includes(column.data_type)) {
        const __VLS_52 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (__VLS_ctx.modelValue.values[__VLS_ctx.idOf(column)]),
            ...{ style: {} },
        }));
        const __VLS_54 = __VLS_53({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (__VLS_ctx.modelValue.values[__VLS_ctx.idOf(column)]),
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_53));
        let __VLS_56;
        let __VLS_57;
        let __VLS_58;
        const __VLS_59 = {
            'onUpdate:modelValue': (...[$event]) => {
                if (!!(__VLS_ctx.modelValue.modes[__VLS_ctx.idOf(column)] === 'preserve'))
                    return;
                if (!!(__VLS_ctx.modelValue.modes[__VLS_ctx.idOf(column)] !== 'custom'))
                    return;
                if (!!(['number', 'integer', 'decimal', 'float', 'double', 'numeric'].includes(column.data_type)))
                    return;
                if (!!(['date', 'datetime', 'timestamp', 'timestamptz'].includes(column.data_type)))
                    return;
                if (!(['boolean', 'bool'].includes(column.data_type)))
                    return;
                __VLS_ctx.patch(__VLS_ctx.idOf(column), { value: $event });
            }
        };
        __VLS_55.slots.default;
        const __VLS_60 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
            label: "是",
            value: (true),
        }));
        const __VLS_62 = __VLS_61({
            label: "是",
            value: (true),
        }, ...__VLS_functionalComponentArgsRest(__VLS_61));
        const __VLS_64 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
            label: "否",
            value: (false),
        }));
        const __VLS_66 = __VLS_65({
            label: "否",
            value: (false),
        }, ...__VLS_functionalComponentArgsRest(__VLS_65));
        var __VLS_55;
    }
    else {
        const __VLS_68 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: __VLS_ctx.modelValue.values[__VLS_ctx.idOf(column)],
            placeholder: "输入同类型的新值",
            ...{ style: {} },
        }));
        const __VLS_70 = __VLS_69({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: __VLS_ctx.modelValue.values[__VLS_ctx.idOf(column)],
            placeholder: "输入同类型的新值",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_69));
        let __VLS_72;
        let __VLS_73;
        let __VLS_74;
        const __VLS_75 = {
            'onUpdate:modelValue': (...[$event]) => {
                if (!!(__VLS_ctx.modelValue.modes[__VLS_ctx.idOf(column)] === 'preserve'))
                    return;
                if (!!(__VLS_ctx.modelValue.modes[__VLS_ctx.idOf(column)] !== 'custom'))
                    return;
                if (!!(['number', 'integer', 'decimal', 'float', 'double', 'numeric'].includes(column.data_type)))
                    return;
                if (!!(['date', 'datetime', 'timestamp', 'timestamptz'].includes(column.data_type)))
                    return;
                if (!!(['boolean', 'bool'].includes(column.data_type)))
                    return;
                __VLS_ctx.patch(__VLS_ctx.idOf(column), { value: $event });
            }
        };
        var __VLS_71;
    }
    if (__VLS_ctx.invalidFields.includes(__VLS_ctx.idOf(column))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "field-error" },
            role: "alert",
        });
    }
}
/** @type {__VLS_StyleScopedClasses['target-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['target-head']} */ ;
/** @type {__VLS_StyleScopedClasses['target-row']} */ ;
/** @type {__VLS_StyleScopedClasses['dimension-label']} */ ;
/** @type {__VLS_StyleScopedClasses['preserve-value']} */ ;
/** @type {__VLS_StyleScopedClasses['field-error']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            idOf: idOf,
            valueKey: valueKey,
            valueLabel: valueLabel,
            sourceValues: sourceValues,
            patch: patch,
            changeMode: changeMode,
            invalidFields: invalidFields,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {
            ...__VLS_exposed,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
