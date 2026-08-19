/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, ref, watch } from 'vue';
import { reportsApi } from '@/api/reports';
import AclEditor from '@/components/AclEditor.vue';
import { SCOPE_STRATEGY_OPTIONS } from '@/constants/scopeStrategy';
const props = defineProps();
const emit = defineEmits();
const nameModel = computed({
    get: () => props.name,
    set: (v) => emit('update:name', v),
});
const descModel = computed({
    get: () => props.description,
    set: (v) => emit('update:description', v),
});
const datasetIdModel = computed({
    get: () => props.datasetId,
    set: (v) => emit('update:datasetId', v),
});
const visibilityModel = computed({
    get: () => props.visibility,
    set: (v) => emit('update:visibility', v),
});
const scopeStrategyModel = computed({
    get: () => props.scopeStrategy,
    set: (v) => emit('update:scopeStrategy', v),
});
const aclModel = computed({
    get: () => props.acl,
    set: (v) => emit('update:acl', v),
});
const VISIBILITY_OPTIONS = [
    { value: 'private', label: '私密', desc: '仅创建者与超级管理员可见' },
    { value: 'scoped', label: '指定', desc: '在拥有该数据集权限的角色/用户中,指定可见者' },
    { value: 'public', label: '公开', desc: '所有拥有该数据集权限的角色/用户均可见' },
];
const showDescription = ref(!!props.description);
watch(() => props.description, (value) => {
    if (value)
        showDescription.value = true;
});
function datasetTableName(table) {
    return table.table_label || table.table_name;
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['report-basic-info']} */ ;
/** @type {__VLS_StyleScopedClasses['report-basic-info']} */ ;
/** @type {__VLS_StyleScopedClasses['basic-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['basic-grid']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "report-basic-info" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "basic-grid" },
});
const __VLS_0 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ class: "name-field" },
    label: "报表名",
    required: true,
}));
const __VLS_2 = __VLS_1({
    ...{ class: "name-field" },
    label: "报表名",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
const __VLS_4 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
    modelValue: (__VLS_ctx.nameModel),
    size: "small",
    placeholder: "例如：研发部花名册导出",
    maxlength: "128",
}));
const __VLS_6 = __VLS_5({
    modelValue: (__VLS_ctx.nameModel),
    size: "small",
    placeholder: "例如：研发部花名册导出",
    maxlength: "128",
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
var __VLS_3;
const __VLS_8 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    ...{ class: "source-field" },
    label: "数据集",
    required: true,
}));
const __VLS_10 = __VLS_9({
    ...{ class: "source-field" },
    label: "数据集",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
__VLS_11.slots.default;
const __VLS_12 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.datasetIdModel),
    size: "small",
    ...{ style: {} },
    placeholder: "选择数据集",
    filterable: true,
}));
const __VLS_14 = __VLS_13({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.datasetIdModel),
    size: "small",
    ...{ style: {} },
    placeholder: "选择数据集",
    filterable: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
let __VLS_16;
let __VLS_17;
let __VLS_18;
const __VLS_19 = {
    onChange: (...[$event]) => {
        __VLS_ctx.emit('dataset-change');
    }
};
__VLS_15.slots.default;
for (const [d] of __VLS_getVForSourceType((__VLS_ctx.datasets))) {
    const __VLS_20 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
        key: (d.id),
        label: (d.label || d.name),
        value: (d.id),
        disabled: (!d.is_active),
    }));
    const __VLS_22 = __VLS_21({
        key: (d.id),
        label: (d.label || d.name),
        value: (d.id),
        disabled: (!d.is_active),
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
}
var __VLS_15;
if (__VLS_ctx.datasetId && __VLS_ctx.currentDataset) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "dataset-meta" },
    });
    (__VLS_ctx.currentDataset.tables.map(__VLS_ctx.datasetTableName).join(', '));
    (__VLS_ctx.currentDataset.relations.length);
}
var __VLS_11;
const __VLS_24 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    ...{ class: "status-field" },
    label: "可见性",
}));
const __VLS_26 = __VLS_25({
    ...{ class: "status-field" },
    label: "可见性",
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
__VLS_27.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "status-row" },
});
const __VLS_28 = {}.ElRadioGroup;
/** @type {[typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    modelValue: (__VLS_ctx.visibilityModel),
    size: "small",
}));
const __VLS_30 = __VLS_29({
    modelValue: (__VLS_ctx.visibilityModel),
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
__VLS_31.slots.default;
for (const [opt] of __VLS_getVForSourceType((__VLS_ctx.VISIBILITY_OPTIONS))) {
    const __VLS_32 = {}.ElRadioButton;
    /** @type {[typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, ]} */ ;
    // @ts-ignore
    const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
        key: (opt.value),
        value: (opt.value),
    }));
    const __VLS_34 = __VLS_33({
        key: (opt.value),
        value: (opt.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_33));
    __VLS_35.slots.default;
    (opt.label);
    var __VLS_35;
}
var __VLS_31;
const __VLS_36 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
    ...{ 'onClick': {} },
    size: "small",
    link: true,
}));
const __VLS_38 = __VLS_37({
    ...{ 'onClick': {} },
    size: "small",
    link: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
let __VLS_40;
let __VLS_41;
let __VLS_42;
const __VLS_43 = {
    onClick: (...[$event]) => {
        __VLS_ctx.showDescription = !__VLS_ctx.showDescription;
    }
};
__VLS_39.slots.default;
(__VLS_ctx.showDescription ? '收起描述' : __VLS_ctx.descModel ? '查看描述' : '添加描述');
var __VLS_39;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "visibility-hint" },
});
(__VLS_ctx.VISIBILITY_OPTIONS.find((o) => o.value === __VLS_ctx.visibilityModel)?.desc);
var __VLS_27;
const __VLS_44 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
    ...{ class: "strategy-field" },
    label: "数据范围策略",
}));
const __VLS_46 = __VLS_45({
    ...{ class: "strategy-field" },
    label: "数据范围策略",
}, ...__VLS_functionalComponentArgsRest(__VLS_45));
__VLS_47.slots.default;
const __VLS_48 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
    modelValue: (__VLS_ctx.scopeStrategyModel),
    size: "small",
    clearable: true,
    placeholder: "继承默认",
    ...{ style: {} },
}));
const __VLS_50 = __VLS_49({
    modelValue: (__VLS_ctx.scopeStrategyModel),
    size: "small",
    clearable: true,
    placeholder: "继承默认",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_49));
__VLS_51.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.SCOPE_STRATEGY_OPTIONS))) {
    const __VLS_52 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
        key: (item.value),
        label: (item.label),
        value: (item.value),
    }));
    const __VLS_54 = __VLS_53({
        key: (item.value),
        label: (item.label),
        value: (item.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_53));
}
var __VLS_51;
var __VLS_47;
if (__VLS_ctx.showDescription) {
    const __VLS_56 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
        ...{ class: "description-field" },
        label: "描述",
    }));
    const __VLS_58 = __VLS_57({
        ...{ class: "description-field" },
        label: "描述",
    }, ...__VLS_functionalComponentArgsRest(__VLS_57));
    __VLS_59.slots.default;
    const __VLS_60 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
        modelValue: (__VLS_ctx.descModel),
        type: "textarea",
        rows: (2),
        maxlength: "500",
        placeholder: "可选",
    }));
    const __VLS_62 = __VLS_61({
        modelValue: (__VLS_ctx.descModel),
        type: "textarea",
        rows: (2),
        maxlength: "500",
        placeholder: "可选",
    }, ...__VLS_functionalComponentArgsRest(__VLS_61));
    var __VLS_59;
}
if (__VLS_ctx.visibilityModel === 'scoped') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "acl-inline" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "acl-inline-title" },
    });
    if (!__VLS_ctx.datasetId) {
        const __VLS_64 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
            type: "warning",
            closable: (false),
            showIcon: true,
            title: "请先选择数据集,再添加授权对象",
            ...{ style: {} },
        }));
        const __VLS_66 = __VLS_65({
            type: "warning",
            closable: (false),
            showIcon: true,
            title: "请先选择数据集,再添加授权对象",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_65));
    }
    else {
        /** @type {[typeof AclEditor, ]} */ ;
        // @ts-ignore
        const __VLS_68 = __VLS_asFunctionalComponent(AclEditor, new AclEditor({
            modelValue: (__VLS_ctx.aclModel),
            datasetId: (__VLS_ctx.datasetId),
            loadOptions: (__VLS_ctx.reportsApi.aclOptions),
        }));
        const __VLS_69 = __VLS_68({
            modelValue: (__VLS_ctx.aclModel),
            datasetId: (__VLS_ctx.datasetId),
            loadOptions: (__VLS_ctx.reportsApi.aclOptions),
        }, ...__VLS_functionalComponentArgsRest(__VLS_68));
    }
}
/** @type {__VLS_StyleScopedClasses['report-basic-info']} */ ;
/** @type {__VLS_StyleScopedClasses['basic-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['name-field']} */ ;
/** @type {__VLS_StyleScopedClasses['source-field']} */ ;
/** @type {__VLS_StyleScopedClasses['dataset-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['status-field']} */ ;
/** @type {__VLS_StyleScopedClasses['status-row']} */ ;
/** @type {__VLS_StyleScopedClasses['visibility-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['strategy-field']} */ ;
/** @type {__VLS_StyleScopedClasses['description-field']} */ ;
/** @type {__VLS_StyleScopedClasses['acl-inline']} */ ;
/** @type {__VLS_StyleScopedClasses['acl-inline-title']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            reportsApi: reportsApi,
            AclEditor: AclEditor,
            SCOPE_STRATEGY_OPTIONS: SCOPE_STRATEGY_OPTIONS,
            emit: emit,
            nameModel: nameModel,
            descModel: descModel,
            datasetIdModel: datasetIdModel,
            visibilityModel: visibilityModel,
            scopeStrategyModel: scopeStrategyModel,
            aclModel: aclModel,
            VISIBILITY_OPTIONS: VISIBILITY_OPTIONS,
            showDescription: showDescription,
            datasetTableName: datasetTableName,
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
