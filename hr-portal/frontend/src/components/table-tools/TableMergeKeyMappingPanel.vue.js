/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, ref, watch } from 'vue';
import { Delete, Edit, Plus, Refresh } from '@element-plus/icons-vue';
import PermissionButton from '@/components/PermissionButton.vue';
const PAGE_SIZE = 20;
const props = withDefaults(defineProps(), {
    loading: false,
    error: '',
    saveError: '',
    saving: false,
    togglingIds: () => [],
    canUpdate: true,
});
const emit = defineEmits();
const keyword = ref('');
const status = ref('all');
const currentPage = ref(1);
const validationVisible = ref(false);
const filteredMappings = computed(() => {
    const normalizedKeyword = keyword.value.trim().toLocaleLowerCase();
    return props.mappings.filter((item) => {
        const matchesStatus = status.value === 'all'
            || (status.value === 'enabled' ? item.enabled : !item.enabled);
        if (!matchesStatus)
            return false;
        if (!normalizedKeyword)
            return true;
        return props.mergeKeys.some((field) => String(item.source_key[field] ?? '').toLocaleLowerCase().includes(normalizedKeyword)
            || String(item.canonical_merge_key[field] ?? '').toLocaleLowerCase().includes(normalizedKeyword));
    });
});
const pagedMappings = computed(() => {
    const start = (currentPage.value - 1) * PAGE_SIZE;
    return filteredMappings.value.slice(start, start + PAGE_SIZE);
});
const draftMissingFields = computed(() => {
    if (!props.draft)
        return [];
    return props.mergeKeys.filter((field) => !String(props.draft?.source_key[field] ?? '').trim()
        || !String(props.draft?.canonical_merge_key[field] ?? '').trim());
});
watch([keyword, status], () => { currentPage.value = 1; });
watch(() => props.mappings.length, () => {
    const lastPage = Math.max(1, Math.ceil(filteredMappings.value.length / PAGE_SIZE));
    if (currentPage.value > lastPage)
        currentPage.value = lastPage;
});
watch(() => props.draft, () => { validationVisible.value = false; });
function updateDraftSide(side, field, value) {
    if (!props.draft)
        return;
    emit('update:draft', {
        ...props.draft,
        [side]: { ...props.draft[side], [field]: value },
    });
}
function updateDraftEnabled(enabled) {
    if (!props.draft)
        return;
    emit('update:draft', { ...props.draft, enabled });
}
function submitDraft() {
    validationVisible.value = true;
    if (draftMissingFields.value.length)
        return;
    emit('save');
}
function displayValue(item, side, field) {
    return `${field}：${String(item[side][field] ?? '')}`;
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    loading: false,
    error: '',
    saveError: '',
    saving: false,
    togglingIds: () => [],
    canUpdate: true,
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['editor-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['field-row']} */ ;
/** @type {__VLS_StyleScopedClasses['field-row']} */ ;
/** @type {__VLS_StyleScopedClasses['field-row']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['list-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['filters']} */ ;
/** @type {__VLS_StyleScopedClasses['error-state']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-table']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-table']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-table']} */ ;
/** @type {__VLS_StyleScopedClasses['status-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['operation-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['list-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['filters']} */ ;
/** @type {__VLS_StyleScopedClasses['list-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['keyword-input']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-table']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "key-mapping-panel" },
    'aria-label': "主键映射配置",
});
if (__VLS_ctx.draft) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "mapping-editor" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "editor-heading" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.draft.id ? '编辑映射' : '新增映射');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    const __VLS_0 = {}.ElSwitch;
    /** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.draft.enabled),
        width: (52),
        inlinePrompt: true,
        activeText: "启用",
        inactiveText: "停用",
    }));
    const __VLS_2 = __VLS_1({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.draft.enabled),
        width: (52),
        inlinePrompt: true,
        activeText: "启用",
        inactiveText: "停用",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    let __VLS_4;
    let __VLS_5;
    let __VLS_6;
    const __VLS_7 = {
        'onUpdate:modelValue': (__VLS_ctx.updateDraftEnabled)
    };
    var __VLS_3;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "editor-grid" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "editor-column" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({});
    for (const [field] of __VLS_getVForSourceType((__VLS_ctx.mergeKeys))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            key: (`source-${field}`),
            ...{ class: "field-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (field);
        const __VLS_8 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (String(__VLS_ctx.draft.source_key[field] ?? '')),
            placeholder: "请输入原始值",
        }));
        const __VLS_10 = __VLS_9({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (String(__VLS_ctx.draft.source_key[field] ?? '')),
            placeholder: "请输入原始值",
        }, ...__VLS_functionalComponentArgsRest(__VLS_9));
        let __VLS_12;
        let __VLS_13;
        let __VLS_14;
        const __VLS_15 = {
            'onUpdate:modelValue': (...[$event]) => {
                if (!(__VLS_ctx.draft))
                    return;
                __VLS_ctx.updateDraftSide('source_key', field, $event);
            }
        };
        var __VLS_11;
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "editor-column" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({});
    for (const [field] of __VLS_getVForSourceType((__VLS_ctx.mergeKeys))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            key: (`canonical-${field}`),
            ...{ class: "field-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (field);
        const __VLS_16 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (String(__VLS_ctx.draft.canonical_merge_key[field] ?? '')),
            placeholder: "请输入归集值",
        }));
        const __VLS_18 = __VLS_17({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (String(__VLS_ctx.draft.canonical_merge_key[field] ?? '')),
            placeholder: "请输入归集值",
        }, ...__VLS_functionalComponentArgsRest(__VLS_17));
        let __VLS_20;
        let __VLS_21;
        let __VLS_22;
        const __VLS_23 = {
            'onUpdate:modelValue': (...[$event]) => {
                if (!(__VLS_ctx.draft))
                    return;
                __VLS_ctx.updateDraftSide('canonical_merge_key', field, $event);
            }
        };
        var __VLS_19;
    }
    if (__VLS_ctx.validationVisible && __VLS_ctx.draftMissingFields.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "inline-error" },
            role: "alert",
        });
        (__VLS_ctx.draftMissingFields.join('、'));
    }
    else if (__VLS_ctx.saveError) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "inline-error" },
            role: "alert",
        });
        (__VLS_ctx.saveError);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "editor-actions" },
    });
    const __VLS_24 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
        ...{ 'onClick': {} },
        size: "small",
    }));
    const __VLS_26 = __VLS_25({
        ...{ 'onClick': {} },
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
    let __VLS_28;
    let __VLS_29;
    let __VLS_30;
    const __VLS_31 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.draft))
                return;
            __VLS_ctx.emit('cancel');
        }
    };
    __VLS_27.slots.default;
    var __VLS_27;
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_32 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: "table_tools",
        op: "U",
        type: "primary",
        size: "small",
        loading: (__VLS_ctx.saving),
    }));
    const __VLS_33 = __VLS_32({
        ...{ 'onClick': {} },
        menu: "table_tools",
        op: "U",
        type: "primary",
        size: "small",
        loading: (__VLS_ctx.saving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_32));
    let __VLS_35;
    let __VLS_36;
    let __VLS_37;
    const __VLS_38 = {
        onClick: (__VLS_ctx.submitDraft)
    };
    __VLS_34.slots.default;
    var __VLS_34;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "list-toolbar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "filters" },
});
const __VLS_39 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_40 = __VLS_asFunctionalComponent(__VLS_39, new __VLS_39({
    modelValue: (__VLS_ctx.keyword),
    clearable: true,
    placeholder: "搜索主键值",
    ...{ class: "keyword-input" },
}));
const __VLS_41 = __VLS_40({
    modelValue: (__VLS_ctx.keyword),
    clearable: true,
    placeholder: "搜索主键值",
    ...{ class: "keyword-input" },
}, ...__VLS_functionalComponentArgsRest(__VLS_40));
const __VLS_43 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_44 = __VLS_asFunctionalComponent(__VLS_43, new __VLS_43({
    modelValue: (__VLS_ctx.status),
    'aria-label': "状态筛选",
    ...{ class: "status-select" },
}));
const __VLS_45 = __VLS_44({
    modelValue: (__VLS_ctx.status),
    'aria-label': "状态筛选",
    ...{ class: "status-select" },
}, ...__VLS_functionalComponentArgsRest(__VLS_44));
__VLS_46.slots.default;
const __VLS_47 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_48 = __VLS_asFunctionalComponent(__VLS_47, new __VLS_47({
    label: "全部状态",
    value: "all",
}));
const __VLS_49 = __VLS_48({
    label: "全部状态",
    value: "all",
}, ...__VLS_functionalComponentArgsRest(__VLS_48));
const __VLS_51 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_52 = __VLS_asFunctionalComponent(__VLS_51, new __VLS_51({
    label: "已启用",
    value: "enabled",
}));
const __VLS_53 = __VLS_52({
    label: "已启用",
    value: "enabled",
}, ...__VLS_functionalComponentArgsRest(__VLS_52));
const __VLS_55 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_56 = __VLS_asFunctionalComponent(__VLS_55, new __VLS_55({
    label: "已停用",
    value: "disabled",
}));
const __VLS_57 = __VLS_56({
    label: "已停用",
    value: "disabled",
}, ...__VLS_functionalComponentArgsRest(__VLS_56));
var __VLS_46;
/** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
// @ts-ignore
const __VLS_59 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
    ...{ 'onClick': {} },
    menu: "table_tools",
    op: "U",
    type: "primary",
}));
const __VLS_60 = __VLS_59({
    ...{ 'onClick': {} },
    menu: "table_tools",
    op: "U",
    type: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_59));
let __VLS_62;
let __VLS_63;
let __VLS_64;
const __VLS_65 = {
    onClick: (...[$event]) => {
        __VLS_ctx.emit('create');
    }
};
__VLS_61.slots.default;
const __VLS_66 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_67 = __VLS_asFunctionalComponent(__VLS_66, new __VLS_66({}));
const __VLS_68 = __VLS_67({}, ...__VLS_functionalComponentArgsRest(__VLS_67));
__VLS_69.slots.default;
const __VLS_70 = {}.Plus;
/** @type {[typeof __VLS_components.Plus, ]} */ ;
// @ts-ignore
const __VLS_71 = __VLS_asFunctionalComponent(__VLS_70, new __VLS_70({}));
const __VLS_72 = __VLS_71({}, ...__VLS_functionalComponentArgsRest(__VLS_71));
var __VLS_69;
var __VLS_61;
if (__VLS_ctx.loading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "panel-state" },
        'aria-live': "polite",
    });
    const __VLS_74 = {}.ElSkeleton;
    /** @type {[typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, ]} */ ;
    // @ts-ignore
    const __VLS_75 = __VLS_asFunctionalComponent(__VLS_74, new __VLS_74({
        rows: (4),
        animated: true,
    }));
    const __VLS_76 = __VLS_75({
        rows: (4),
        animated: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_75));
}
else if (__VLS_ctx.error) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "panel-state error-state" },
        role: "alert",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    (__VLS_ctx.error);
    const __VLS_78 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_79 = __VLS_asFunctionalComponent(__VLS_78, new __VLS_78({
        ...{ 'onClick': {} },
        size: "small",
        icon: (__VLS_ctx.Refresh),
    }));
    const __VLS_80 = __VLS_79({
        ...{ 'onClick': {} },
        size: "small",
        icon: (__VLS_ctx.Refresh),
    }, ...__VLS_functionalComponentArgsRest(__VLS_79));
    let __VLS_82;
    let __VLS_83;
    let __VLS_84;
    const __VLS_85 = {
        onClick: (...[$event]) => {
            if (!!(__VLS_ctx.loading))
                return;
            if (!(__VLS_ctx.error))
                return;
            __VLS_ctx.emit('retry');
        }
    };
    __VLS_81.slots.default;
    var __VLS_81;
}
else if (!__VLS_ctx.mappings.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "panel-state empty-state" },
    });
    const __VLS_86 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_87 = __VLS_asFunctionalComponent(__VLS_86, new __VLS_86({
        description: "暂无主键值映射，未配置时将沿用原始主键归集",
    }));
    const __VLS_88 = __VLS_87({
        description: "暂无主键值映射，未配置时将沿用原始主键归集",
    }, ...__VLS_functionalComponentArgsRest(__VLS_87));
}
else if (!__VLS_ctx.filteredMappings.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "panel-state empty-state" },
    });
    const __VLS_90 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_91 = __VLS_asFunctionalComponent(__VLS_90, new __VLS_90({
        description: "没有符合当前筛选条件的主键值映射",
    }));
    const __VLS_92 = __VLS_91({
        description: "没有符合当前筛选条件的主键值映射",
    }, ...__VLS_functionalComponentArgsRest(__VLS_91));
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "mapping-table-wrap" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.table, __VLS_intrinsicElements.table)({
        ...{ class: "mapping-table" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.thead, __VLS_intrinsicElements.thead)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
        ...{ class: "status-column" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
        ...{ class: "operation-column" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tbody, __VLS_intrinsicElements.tbody)({});
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.pagedMappings))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({
            key: (item.id),
            ...{ class: ({ disabled: !item.enabled }) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "key-values" },
        });
        for (const [field] of __VLS_getVForSourceType((__VLS_ctx.mergeKeys))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                key: (field),
                ...{ class: "key-value" },
            });
            (__VLS_ctx.displayValue(item, 'source_key', field));
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "key-values" },
        });
        for (const [field] of __VLS_getVForSourceType((__VLS_ctx.mergeKeys))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                key: (field),
                ...{ class: "key-value" },
            });
            (__VLS_ctx.displayValue(item, 'canonical_merge_key', field));
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
            ...{ class: "status-column" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "status-cell" },
        });
        const __VLS_94 = {}.ElSwitch;
        /** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
        // @ts-ignore
        const __VLS_95 = __VLS_asFunctionalComponent(__VLS_94, new __VLS_94({
            ...{ 'onUpdate:modelValue': {} },
            ...{ class: "status-switch" },
            modelValue: (item.enabled),
            width: (52),
            disabled: (!__VLS_ctx.canUpdate || __VLS_ctx.togglingIds.includes(item.id)),
            loading: (__VLS_ctx.togglingIds.includes(item.id)),
            inlinePrompt: true,
            activeText: "启用",
            inactiveText: "停用",
            title: (__VLS_ctx.canUpdate ? undefined : '无权限'),
        }));
        const __VLS_96 = __VLS_95({
            ...{ 'onUpdate:modelValue': {} },
            ...{ class: "status-switch" },
            modelValue: (item.enabled),
            width: (52),
            disabled: (!__VLS_ctx.canUpdate || __VLS_ctx.togglingIds.includes(item.id)),
            loading: (__VLS_ctx.togglingIds.includes(item.id)),
            inlinePrompt: true,
            activeText: "启用",
            inactiveText: "停用",
            title: (__VLS_ctx.canUpdate ? undefined : '无权限'),
        }, ...__VLS_functionalComponentArgsRest(__VLS_95));
        let __VLS_98;
        let __VLS_99;
        let __VLS_100;
        const __VLS_101 = {
            'onUpdate:modelValue': (...[$event]) => {
                if (!!(__VLS_ctx.loading))
                    return;
                if (!!(__VLS_ctx.error))
                    return;
                if (!!(!__VLS_ctx.mappings.length))
                    return;
                if (!!(!__VLS_ctx.filteredMappings.length))
                    return;
                __VLS_ctx.emit('toggle', item, $event);
            }
        };
        var __VLS_97;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
            ...{ class: "operation-column" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "operation-cell" },
        });
        const __VLS_102 = {}.ElTooltip;
        /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
        // @ts-ignore
        const __VLS_103 = __VLS_asFunctionalComponent(__VLS_102, new __VLS_102({
            content: "编辑",
            placement: "top",
        }));
        const __VLS_104 = __VLS_103({
            content: "编辑",
            placement: "top",
        }, ...__VLS_functionalComponentArgsRest(__VLS_103));
        __VLS_105.slots.default;
        /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
        // @ts-ignore
        const __VLS_106 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
            ...{ 'onClick': {} },
            menu: "table_tools",
            op: "U",
            link: true,
            size: "small",
        }));
        const __VLS_107 = __VLS_106({
            ...{ 'onClick': {} },
            menu: "table_tools",
            op: "U",
            link: true,
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_106));
        let __VLS_109;
        let __VLS_110;
        let __VLS_111;
        const __VLS_112 = {
            onClick: (...[$event]) => {
                if (!!(__VLS_ctx.loading))
                    return;
                if (!!(__VLS_ctx.error))
                    return;
                if (!!(!__VLS_ctx.mappings.length))
                    return;
                if (!!(!__VLS_ctx.filteredMappings.length))
                    return;
                __VLS_ctx.emit('edit', item);
            }
        };
        __VLS_108.slots.default;
        const __VLS_113 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_114 = __VLS_asFunctionalComponent(__VLS_113, new __VLS_113({}));
        const __VLS_115 = __VLS_114({}, ...__VLS_functionalComponentArgsRest(__VLS_114));
        __VLS_116.slots.default;
        const __VLS_117 = {}.Edit;
        /** @type {[typeof __VLS_components.Edit, ]} */ ;
        // @ts-ignore
        const __VLS_118 = __VLS_asFunctionalComponent(__VLS_117, new __VLS_117({}));
        const __VLS_119 = __VLS_118({}, ...__VLS_functionalComponentArgsRest(__VLS_118));
        var __VLS_116;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "sr-only" },
        });
        var __VLS_108;
        var __VLS_105;
        const __VLS_121 = {}.ElTooltip;
        /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
        // @ts-ignore
        const __VLS_122 = __VLS_asFunctionalComponent(__VLS_121, new __VLS_121({
            content: "删除",
            placement: "top",
        }));
        const __VLS_123 = __VLS_122({
            content: "删除",
            placement: "top",
        }, ...__VLS_functionalComponentArgsRest(__VLS_122));
        __VLS_124.slots.default;
        /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
        // @ts-ignore
        const __VLS_125 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
            ...{ 'onClick': {} },
            menu: "table_tools",
            op: "D",
            link: true,
            type: "danger",
            size: "small",
        }));
        const __VLS_126 = __VLS_125({
            ...{ 'onClick': {} },
            menu: "table_tools",
            op: "D",
            link: true,
            type: "danger",
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_125));
        let __VLS_128;
        let __VLS_129;
        let __VLS_130;
        const __VLS_131 = {
            onClick: (...[$event]) => {
                if (!!(__VLS_ctx.loading))
                    return;
                if (!!(__VLS_ctx.error))
                    return;
                if (!!(!__VLS_ctx.mappings.length))
                    return;
                if (!!(!__VLS_ctx.filteredMappings.length))
                    return;
                __VLS_ctx.emit('delete', item);
            }
        };
        __VLS_127.slots.default;
        const __VLS_132 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({}));
        const __VLS_134 = __VLS_133({}, ...__VLS_functionalComponentArgsRest(__VLS_133));
        __VLS_135.slots.default;
        const __VLS_136 = {}.Delete;
        /** @type {[typeof __VLS_components.Delete, ]} */ ;
        // @ts-ignore
        const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({}));
        const __VLS_138 = __VLS_137({}, ...__VLS_functionalComponentArgsRest(__VLS_137));
        var __VLS_135;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "sr-only" },
        });
        var __VLS_127;
        var __VLS_124;
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "pagination-row" },
    });
    const __VLS_140 = {}.ElPagination;
    /** @type {[typeof __VLS_components.ElPagination, typeof __VLS_components.elPagination, ]} */ ;
    // @ts-ignore
    const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
        currentPage: (__VLS_ctx.currentPage),
        background: true,
        layout: "total, prev, pager, next",
        pageSize: (__VLS_ctx.PAGE_SIZE),
        total: (__VLS_ctx.filteredMappings.length),
    }));
    const __VLS_142 = __VLS_141({
        currentPage: (__VLS_ctx.currentPage),
        background: true,
        layout: "total, prev, pager, next",
        pageSize: (__VLS_ctx.PAGE_SIZE),
        total: (__VLS_ctx.filteredMappings.length),
    }, ...__VLS_functionalComponentArgsRest(__VLS_141));
}
/** @type {__VLS_StyleScopedClasses['key-mapping-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-column']} */ ;
/** @type {__VLS_StyleScopedClasses['field-row']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-column']} */ ;
/** @type {__VLS_StyleScopedClasses['field-row']} */ ;
/** @type {__VLS_StyleScopedClasses['inline-error']} */ ;
/** @type {__VLS_StyleScopedClasses['inline-error']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['list-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['filters']} */ ;
/** @type {__VLS_StyleScopedClasses['keyword-input']} */ ;
/** @type {__VLS_StyleScopedClasses['status-select']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-state']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-state']} */ ;
/** @type {__VLS_StyleScopedClasses['error-state']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-state']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-state']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-table-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-table']} */ ;
/** @type {__VLS_StyleScopedClasses['status-column']} */ ;
/** @type {__VLS_StyleScopedClasses['operation-column']} */ ;
/** @type {__VLS_StyleScopedClasses['key-values']} */ ;
/** @type {__VLS_StyleScopedClasses['key-value']} */ ;
/** @type {__VLS_StyleScopedClasses['key-values']} */ ;
/** @type {__VLS_StyleScopedClasses['key-value']} */ ;
/** @type {__VLS_StyleScopedClasses['status-column']} */ ;
/** @type {__VLS_StyleScopedClasses['status-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['status-switch']} */ ;
/** @type {__VLS_StyleScopedClasses['operation-column']} */ ;
/** @type {__VLS_StyleScopedClasses['operation-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['sr-only']} */ ;
/** @type {__VLS_StyleScopedClasses['sr-only']} */ ;
/** @type {__VLS_StyleScopedClasses['pagination-row']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Delete: Delete,
            Edit: Edit,
            Plus: Plus,
            Refresh: Refresh,
            PermissionButton: PermissionButton,
            PAGE_SIZE: PAGE_SIZE,
            emit: emit,
            keyword: keyword,
            status: status,
            currentPage: currentPage,
            validationVisible: validationVisible,
            filteredMappings: filteredMappings,
            pagedMappings: pagedMappings,
            draftMissingFields: draftMissingFields,
            updateDraftSide: updateDraftSide,
            updateDraftEnabled: updateDraftEnabled,
            submitDraft: submitDraft,
            displayValue: displayValue,
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
