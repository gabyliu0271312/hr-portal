/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { employeeProfileFieldsApi } from '@/api/employee_profile_fields';
const fields = ref([]);
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const governance = ref(null);
const governanceError = ref('');
const defaultCardCount = computed(() => fields.value.filter((field) => field.is_default_card).length);
const defaultCardSummary = computed(() => `默认项 ${defaultCardCount.value}/5`);
function fieldGovernanceMessages(columnName) {
    return governance.value?.issues.filter((issue) => issue.column_name === columnName).map((issue) => issue.message) || [];
}
async function load() {
    loading.value = true;
    error.value = '';
    governance.value = null;
    governanceError.value = '';
    try {
        fields.value = await employeeProfileFieldsApi.list();
        try {
            governance.value = await employeeProfileFieldsApi.governanceCheck();
        }
        catch (cause) {
            governanceError.value = cause?.response?.data?.detail || '治理检查暂不可用';
        }
    }
    catch (cause) {
        error.value = cause?.response?.data?.detail || '员工档案展示配置加载失败';
    }
    finally {
        loading.value = false;
    }
}
async function save() {
    if (defaultCardCount.value !== 5) {
        ElMessage.warning('默认卡片必须恰好选择五项');
        return;
    }
    saving.value = true;
    try {
        fields.value = await employeeProfileFieldsApi.update(fields.value);
        ElMessage.success('员工档案展示配置已保存');
    }
    catch (cause) {
        if (cause?.response?.status === 409) {
            ElMessage.warning('配置已被其他管理员更新，请刷新后重试');
        }
        else {
            ElMessage.error(cause?.response?.data?.detail || '保存失败');
        }
    }
    finally {
        saving.value = false;
    }
}
onMounted(load);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
const __VLS_0 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ style: {} },
}));
const __VLS_2 = __VLS_1({
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
var __VLS_4 = {};
__VLS_3.slots.default;
{
    const { header: __VLS_thisSlot } = __VLS_3.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.b, __VLS_intrinsicElements.b)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_5 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_6 = __VLS_asFunctionalComponent(__VLS_5, new __VLS_5({
        ...{ 'onClick': {} },
        loading: (__VLS_ctx.saving),
        type: "primary",
    }));
    const __VLS_7 = __VLS_6({
        ...{ 'onClick': {} },
        loading: (__VLS_ctx.saving),
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_6));
    let __VLS_9;
    let __VLS_10;
    let __VLS_11;
    const __VLS_12 = {
        onClick: (__VLS_ctx.save)
    };
    __VLS_8.slots.default;
    var __VLS_8;
}
if (!__VLS_ctx.loading && !__VLS_ctx.error && __VLS_ctx.fields.length) {
    const __VLS_13 = {}.ElText;
    /** @type {[typeof __VLS_components.ElText, typeof __VLS_components.elText, typeof __VLS_components.ElText, typeof __VLS_components.elText, ]} */ ;
    // @ts-ignore
    const __VLS_14 = __VLS_asFunctionalComponent(__VLS_13, new __VLS_13({
        type: "info",
        size: "small",
    }));
    const __VLS_15 = __VLS_14({
        type: "info",
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_14));
    __VLS_16.slots.default;
    (__VLS_ctx.defaultCardSummary);
    var __VLS_16;
}
if (__VLS_ctx.loading) {
    const __VLS_17 = {}.ElSkeleton;
    /** @type {[typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, ]} */ ;
    // @ts-ignore
    const __VLS_18 = __VLS_asFunctionalComponent(__VLS_17, new __VLS_17({
        rows: (4),
        animated: true,
    }));
    const __VLS_19 = __VLS_18({
        rows: (4),
        animated: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_18));
}
else if (__VLS_ctx.error) {
    const __VLS_21 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_22 = __VLS_asFunctionalComponent(__VLS_21, new __VLS_21({
        type: "error",
        title: (__VLS_ctx.error),
        showIcon: true,
        closable: (false),
    }));
    const __VLS_23 = __VLS_22({
        type: "error",
        title: (__VLS_ctx.error),
        showIcon: true,
        closable: (false),
    }, ...__VLS_functionalComponentArgsRest(__VLS_22));
    __VLS_24.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_24.slots;
        const __VLS_25 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_26 = __VLS_asFunctionalComponent(__VLS_25, new __VLS_25({
            ...{ 'onClick': {} },
            size: "small",
        }));
        const __VLS_27 = __VLS_26({
            ...{ 'onClick': {} },
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_26));
        let __VLS_29;
        let __VLS_30;
        let __VLS_31;
        const __VLS_32 = {
            onClick: (__VLS_ctx.load)
        };
        __VLS_28.slots.default;
        var __VLS_28;
    }
    var __VLS_24;
}
else if (!__VLS_ctx.fields.length) {
    const __VLS_33 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_34 = __VLS_asFunctionalComponent(__VLS_33, new __VLS_33({
        description: "当前没有可配置的员工档案字段",
    }));
    const __VLS_35 = __VLS_34({
        description: "当前没有可配置的员工档案字段",
    }, ...__VLS_functionalComponentArgsRest(__VLS_34));
}
else {
    if (__VLS_ctx.governanceError) {
        const __VLS_37 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_38 = __VLS_asFunctionalComponent(__VLS_37, new __VLS_37({
            type: "warning",
            title: (__VLS_ctx.governanceError),
            closable: (false),
            showIcon: true,
            ...{ style: {} },
        }));
        const __VLS_39 = __VLS_38({
            type: "warning",
            title: (__VLS_ctx.governanceError),
            closable: (false),
            showIcon: true,
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_38));
    }
    else if (__VLS_ctx.governance?.warning_count) {
        const __VLS_41 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_42 = __VLS_asFunctionalComponent(__VLS_41, new __VLS_41({
            type: "warning",
            title: (`治理检查发现 ${__VLS_ctx.governance.warning_count} 项待处理告警`),
            closable: (false),
            showIcon: true,
            ...{ style: {} },
        }));
        const __VLS_43 = __VLS_42({
            type: "warning",
            title: (`治理检查发现 ${__VLS_ctx.governance.warning_count} 项待处理告警`),
            closable: (false),
            showIcon: true,
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_42));
    }
    else if (__VLS_ctx.governance) {
        const __VLS_45 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_46 = __VLS_asFunctionalComponent(__VLS_45, new __VLS_45({
            type: "success",
            title: "治理检查正常",
            closable: (false),
            showIcon: true,
            ...{ style: {} },
        }));
        const __VLS_47 = __VLS_46({
            type: "success",
            title: "治理检查正常",
            closable: (false),
            showIcon: true,
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_46));
    }
    const __VLS_49 = {}.ElTable;
    /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
    // @ts-ignore
    const __VLS_50 = __VLS_asFunctionalComponent(__VLS_49, new __VLS_49({
        data: (__VLS_ctx.fields),
        size: "small",
        border: true,
    }));
    const __VLS_51 = __VLS_50({
        data: (__VLS_ctx.fields),
        size: "small",
        border: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_50));
    __VLS_52.slots.default;
    const __VLS_53 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_54 = __VLS_asFunctionalComponent(__VLS_53, new __VLS_53({
        label: "字段",
        minWidth: "150",
    }));
    const __VLS_55 = __VLS_54({
        label: "字段",
        minWidth: "150",
    }, ...__VLS_functionalComponentArgsRest(__VLS_54));
    __VLS_56.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_56.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        (row.column_name);
        const __VLS_57 = {}.ElText;
        /** @type {[typeof __VLS_components.ElText, typeof __VLS_components.elText, typeof __VLS_components.ElText, typeof __VLS_components.elText, ]} */ ;
        // @ts-ignore
        const __VLS_58 = __VLS_asFunctionalComponent(__VLS_57, new __VLS_57({
            type: "info",
            size: "small",
        }));
        const __VLS_59 = __VLS_58({
            type: "info",
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_58));
        __VLS_60.slots.default;
        (row.field_code);
        var __VLS_60;
    }
    var __VLS_56;
    const __VLS_61 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_62 = __VLS_asFunctionalComponent(__VLS_61, new __VLS_61({
        label: "展示名称",
        minWidth: "180",
    }));
    const __VLS_63 = __VLS_62({
        label: "展示名称",
        minWidth: "180",
    }, ...__VLS_functionalComponentArgsRest(__VLS_62));
    __VLS_64.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_64.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_65 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_66 = __VLS_asFunctionalComponent(__VLS_65, new __VLS_65({
            modelValue: (row.display_name),
            maxlength: "64",
            showWordLimit: true,
        }));
        const __VLS_67 = __VLS_66({
            modelValue: (row.display_name),
            maxlength: "64",
            showWordLimit: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_66));
    }
    var __VLS_64;
    const __VLS_69 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_70 = __VLS_asFunctionalComponent(__VLS_69, new __VLS_69({
        label: "业务定义（供 AI 消歧）",
        minWidth: "300",
    }));
    const __VLS_71 = __VLS_70({
        label: "业务定义（供 AI 消歧）",
        minWidth: "300",
    }, ...__VLS_functionalComponentArgsRest(__VLS_70));
    __VLS_72.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_72.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_73 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_74 = __VLS_asFunctionalComponent(__VLS_73, new __VLS_73({
            modelValue: (row.semantic_description),
            type: "textarea",
            autosize: ({ minRows: 1, maxRows: 3 }),
            maxlength: "500",
            showWordLimit: true,
            placeholder: "说明该字段的业务含义及与易混字段的区别",
        }));
        const __VLS_75 = __VLS_74({
            modelValue: (row.semantic_description),
            type: "textarea",
            autosize: ({ minRows: 1, maxRows: 3 }),
            maxlength: "500",
            showWordLimit: true,
            placeholder: "说明该字段的业务含义及与易混字段的区别",
        }, ...__VLS_functionalComponentArgsRest(__VLS_74));
    }
    var __VLS_72;
    const __VLS_77 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_78 = __VLS_asFunctionalComponent(__VLS_77, new __VLS_77({
        label: "敏感分类（只读）",
        minWidth: "160",
    }));
    const __VLS_79 = __VLS_78({
        label: "敏感分类（只读）",
        minWidth: "160",
    }, ...__VLS_functionalComponentArgsRest(__VLS_78));
    __VLS_80.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_80.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        for (const [categoryName] of __VLS_getVForSourceType((row.sensitive_category_names))) {
            const __VLS_81 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_82 = __VLS_asFunctionalComponent(__VLS_81, new __VLS_81({
                key: (categoryName),
                size: "small",
                type: "warning",
                ...{ style: {} },
            }));
            const __VLS_83 = __VLS_82({
                key: (categoryName),
                size: "small",
                type: "warning",
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_82));
            __VLS_84.slots.default;
            (categoryName);
            var __VLS_84;
        }
        if (!row.sensitive_category_names.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        }
    }
    var __VLS_80;
    const __VLS_85 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_86 = __VLS_asFunctionalComponent(__VLS_85, new __VLS_85({
        label: "治理状态",
        minWidth: "200",
    }));
    const __VLS_87 = __VLS_86({
        label: "治理状态",
        minWidth: "200",
    }, ...__VLS_functionalComponentArgsRest(__VLS_86));
    __VLS_88.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_88.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        for (const [message] of __VLS_getVForSourceType((__VLS_ctx.fieldGovernanceMessages(row.column_name)))) {
            const __VLS_89 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_90 = __VLS_asFunctionalComponent(__VLS_89, new __VLS_89({
                key: (message),
                size: "small",
                type: "warning",
                ...{ style: {} },
            }));
            const __VLS_91 = __VLS_90({
                key: (message),
                size: "small",
                type: "warning",
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_90));
            __VLS_92.slots.default;
            (message);
            var __VLS_92;
        }
        if (!__VLS_ctx.fieldGovernanceMessages(row.column_name).length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        }
    }
    var __VLS_88;
    const __VLS_93 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_94 = __VLS_asFunctionalComponent(__VLS_93, new __VLS_93({
        label: "员工档案可查询",
        width: "140",
    }));
    const __VLS_95 = __VLS_94({
        label: "员工档案可查询",
        width: "140",
    }, ...__VLS_functionalComponentArgsRest(__VLS_94));
    __VLS_96.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_96.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_97 = {}.ElSwitch;
        /** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
        // @ts-ignore
        const __VLS_98 = __VLS_asFunctionalComponent(__VLS_97, new __VLS_97({
            modelValue: (row.is_queryable),
            inlinePrompt: true,
            activeText: "开",
            inactiveText: "关",
        }));
        const __VLS_99 = __VLS_98({
            modelValue: (row.is_queryable),
            inlinePrompt: true,
            activeText: "开",
            inactiveText: "关",
        }, ...__VLS_functionalComponentArgsRest(__VLS_98));
    }
    var __VLS_96;
    var __VLS_52;
}
var __VLS_3;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            fields: fields,
            loading: loading,
            saving: saving,
            error: error,
            governance: governance,
            governanceError: governanceError,
            defaultCardSummary: defaultCardSummary,
            fieldGovernanceMessages: fieldGovernanceMessages,
            load: load,
            save: save,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
