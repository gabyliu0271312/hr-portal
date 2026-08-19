/// <reference types="../../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
/**
 * SchemaFormField — 通用 schema 驱动的字段渲染器
 *
 * 用法:
 *   <SchemaFormField
 *     :schema="schema"
 *     v-model="formValues"
 *     title="配置"
 *     :show-category-label="true"
 *     :empty-text="'未注册 schema, 无扩展字段'"
 *   />
 *
 * v-model 协议:
 *   formValues: { [categoryKey]: { [fieldName]: any } }
 *
 * 渲染规则:
 *   - f.type === 'string' | 'text'         → el-input
 *   - f.type === 'integer' | 'number'      → el-input-number
 *   - f.type === 'boolean'                  → el-switch
 *   - f.enum                                → el-select
 *   - 其他 (含 object / array / 未指定)     → JSON textarea
 */
import { Document } from '@element-plus/icons-vue';
const props = withDefaults(defineProps(), {
    title: '',
    showCategoryLabel: true,
    emptyText: '当前 adapter 未注册 schema, 无扩展字段。',
});
const emit = defineEmits();
function controlTypeOf(f) {
    if (f.enum && f.enum.length > 0)
        return 'select';
    const t = (f.type || '').toLowerCase();
    if (t === 'integer' || t === 'number')
        return 'number';
    if (t === 'boolean')
        return 'boolean';
    if (t === 'string' || t === 'text')
        return 'text';
    return 'json';
}
function defaultPlaceholder(f) {
    if (f.default !== undefined)
        return `默认: ${JSON.stringify(f.default)}`;
    if (f.enum && f.enum.length > 0)
        return `选择 ${f.name}`;
    if (f.help)
        return f.help;
    return `输入 ${f.name}`;
}
function getValue(catKey, fieldName) {
    return props.modelValue?.[catKey]?.[fieldName];
}
function setValue(catKey, fieldName, val) {
    const next = { ...(props.modelValue || {}) };
    if (!next[catKey])
        next[catKey] = {};
    next[catKey] = { ...next[catKey], [fieldName]: val };
    emit('update:modelValue', next);
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    title: '',
    showCategoryLabel: true,
    emptyText: '当前 adapter 未注册 schema, 无扩展字段。',
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "schema-section" },
});
if (__VLS_ctx.title) {
    const __VLS_0 = {}.ElDivider;
    /** @type {[typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        contentPosition: "left",
    }));
    const __VLS_2 = __VLS_1({
        contentPosition: "left",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_3.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: {} },
    });
    (__VLS_ctx.title);
    var __VLS_3;
}
if (!__VLS_ctx.schema || __VLS_ctx.schema.categories.length === 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "schema-empty" },
    });
    const __VLS_4 = {}.ElText;
    /** @type {[typeof __VLS_components.ElText, typeof __VLS_components.elText, typeof __VLS_components.ElText, typeof __VLS_components.elText, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        type: "info",
        size: "small",
    }));
    const __VLS_6 = __VLS_5({
        type: "info",
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    __VLS_7.slots.default;
    (__VLS_ctx.emptyText);
    var __VLS_7;
}
for (const [cat] of __VLS_getVForSourceType((__VLS_ctx.schema?.categories || []))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (cat.key),
        ...{ class: "schema-category" },
    });
    if (__VLS_ctx.showCategoryLabel) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "schema-category-title" },
        });
        const __VLS_8 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({}));
        const __VLS_10 = __VLS_9({}, ...__VLS_functionalComponentArgsRest(__VLS_9));
        __VLS_11.slots.default;
        const __VLS_12 = {}.Document;
        /** @type {[typeof __VLS_components.Document, ]} */ ;
        // @ts-ignore
        const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({}));
        const __VLS_14 = __VLS_13({}, ...__VLS_functionalComponentArgsRest(__VLS_13));
        var __VLS_11;
        (cat.label);
    }
    for (const [f] of __VLS_getVForSourceType((cat.fields))) {
        const __VLS_16 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
            key: (f.name),
            label: (f.name),
            required: (!!f.required),
        }));
        const __VLS_18 = __VLS_17({
            key: (f.name),
            label: (f.name),
            required: (!!f.required),
        }, ...__VLS_functionalComponentArgsRest(__VLS_17));
        __VLS_19.slots.default;
        if (__VLS_ctx.controlTypeOf(f) === 'text') {
            const __VLS_20 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (__VLS_ctx.getValue(cat.key, f.name)),
                placeholder: (__VLS_ctx.defaultPlaceholder(f)),
            }));
            const __VLS_22 = __VLS_21({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (__VLS_ctx.getValue(cat.key, f.name)),
                placeholder: (__VLS_ctx.defaultPlaceholder(f)),
            }, ...__VLS_functionalComponentArgsRest(__VLS_21));
            let __VLS_24;
            let __VLS_25;
            let __VLS_26;
            const __VLS_27 = {
                'onUpdate:modelValue': ((v) => __VLS_ctx.setValue(cat.key, f.name, v))
            };
            var __VLS_23;
        }
        else if (__VLS_ctx.controlTypeOf(f) === 'number') {
            const __VLS_28 = {}.ElInputNumber;
            /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
            // @ts-ignore
            const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (__VLS_ctx.getValue(cat.key, f.name)),
                placeholder: (__VLS_ctx.defaultPlaceholder(f)),
                ...{ style: {} },
            }));
            const __VLS_30 = __VLS_29({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (__VLS_ctx.getValue(cat.key, f.name)),
                placeholder: (__VLS_ctx.defaultPlaceholder(f)),
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_29));
            let __VLS_32;
            let __VLS_33;
            let __VLS_34;
            const __VLS_35 = {
                'onUpdate:modelValue': ((v) => __VLS_ctx.setValue(cat.key, f.name, v))
            };
            var __VLS_31;
        }
        else if (__VLS_ctx.controlTypeOf(f) === 'boolean') {
            const __VLS_36 = {}.ElSwitch;
            /** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
            // @ts-ignore
            const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (__VLS_ctx.getValue(cat.key, f.name)),
            }));
            const __VLS_38 = __VLS_37({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (__VLS_ctx.getValue(cat.key, f.name)),
            }, ...__VLS_functionalComponentArgsRest(__VLS_37));
            let __VLS_40;
            let __VLS_41;
            let __VLS_42;
            const __VLS_43 = {
                'onUpdate:modelValue': ((v) => __VLS_ctx.setValue(cat.key, f.name, v))
            };
            var __VLS_39;
        }
        else if (__VLS_ctx.controlTypeOf(f) === 'select') {
            const __VLS_44 = {}.ElSelect;
            /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
            // @ts-ignore
            const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (__VLS_ctx.getValue(cat.key, f.name)),
                placeholder: (__VLS_ctx.defaultPlaceholder(f)),
                clearable: true,
                ...{ style: {} },
            }));
            const __VLS_46 = __VLS_45({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (__VLS_ctx.getValue(cat.key, f.name)),
                placeholder: (__VLS_ctx.defaultPlaceholder(f)),
                clearable: true,
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_45));
            let __VLS_48;
            let __VLS_49;
            let __VLS_50;
            const __VLS_51 = {
                'onUpdate:modelValue': ((v) => __VLS_ctx.setValue(cat.key, f.name, v))
            };
            __VLS_47.slots.default;
            for (const [opt] of __VLS_getVForSourceType(((f.enum || [])))) {
                const __VLS_52 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
                    key: (String(opt)),
                    label: (String(opt)),
                    value: (opt),
                }));
                const __VLS_54 = __VLS_53({
                    key: (String(opt)),
                    label: (String(opt)),
                    value: (opt),
                }, ...__VLS_functionalComponentArgsRest(__VLS_53));
            }
            var __VLS_47;
        }
        else {
            const __VLS_56 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (__VLS_ctx.getValue(cat.key, f.name)),
                type: "textarea",
                rows: (3),
                placeholder: (__VLS_ctx.defaultPlaceholder(f) + ' (JSON)'),
            }));
            const __VLS_58 = __VLS_57({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (__VLS_ctx.getValue(cat.key, f.name)),
                type: "textarea",
                rows: (3),
                placeholder: (__VLS_ctx.defaultPlaceholder(f) + ' (JSON)'),
            }, ...__VLS_functionalComponentArgsRest(__VLS_57));
            let __VLS_60;
            let __VLS_61;
            let __VLS_62;
            const __VLS_63 = {
                'onUpdate:modelValue': ((v) => __VLS_ctx.setValue(cat.key, f.name, v))
            };
            var __VLS_59;
        }
        if (f.help) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "schema-field-help" },
            });
            (f.help);
        }
        var __VLS_19;
    }
}
/** @type {__VLS_StyleScopedClasses['schema-section']} */ ;
/** @type {__VLS_StyleScopedClasses['schema-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['schema-category']} */ ;
/** @type {__VLS_StyleScopedClasses['schema-category-title']} */ ;
/** @type {__VLS_StyleScopedClasses['schema-field-help']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Document: Document,
            controlTypeOf: controlTypeOf,
            defaultPlaceholder: defaultPlaceholder,
            getValue: getValue,
            setValue: setValue,
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
