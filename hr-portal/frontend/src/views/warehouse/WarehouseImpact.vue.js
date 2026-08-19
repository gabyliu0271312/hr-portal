/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Search } from '@element-plus/icons-vue';
import { listAssets, listModels, impactTable, impactField, impactModel } from '@/api/warehouse';
const route = useRoute();
// 三个分析 tab
const activeTab = ref('table');
// 表分析
const tableOptions = ref([]);
const tableName = ref(route.query.table || '');
const tableLoading = ref(false);
const tableResult = ref(null);
// 字段分析
const fieldTableName = ref('');
const fieldColumnCode = ref('');
const fieldLoading = ref(false);
const fieldResult = ref(null);
// 模型分析
const modelOptions = ref([]);
const modelId = ref(null);
const modelLoading = ref(false);
const modelResult = ref(null);
async function loadTableOptions() {
    try {
        tableOptions.value = (await listAssets({ page_size: 200 })).items;
    }
    catch {
        ElMessage.error('加载表列表失败');
    }
}
async function loadModelOptions() {
    try {
        modelOptions.value = (await listModels({ page_size: 200 })).items;
    }
    catch {
        ElMessage.error('加载模型列表失败');
    }
}
loadTableOptions();
loadModelOptions();
async function doTableImpact() {
    if (!tableName.value)
        return;
    tableLoading.value = true;
    try {
        tableResult.value = await impactTable(tableName.value);
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '分析失败');
    }
    finally {
        tableLoading.value = false;
    }
}
async function doFieldImpact() {
    if (!fieldTableName.value || !fieldColumnCode.value)
        return;
    fieldLoading.value = true;
    try {
        fieldResult.value = await impactField(fieldTableName.value, fieldColumnCode.value);
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '分析失败');
    }
    finally {
        fieldLoading.value = false;
    }
}
async function doModelImpact() {
    if (!modelId.value)
        return;
    modelLoading.value = true;
    try {
        modelResult.value = await impactModel(modelId.value);
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '分析失败');
    }
    finally {
        modelLoading.value = false;
    }
}
function refsForTab() {
    if (activeTab.value === 'table')
        return tableResult.value?.references || [];
    if (activeTab.value === 'field')
        return fieldResult.value?.references || [];
    return modelResult.value?.references || [];
}
function blockingForTab() {
    if (activeTab.value === 'table')
        return tableResult.value?.blocking || false;
    if (activeTab.value === 'field')
        return fieldResult.value?.blocking || false;
    return modelResult.value?.blocking || false;
}
const riskTag = { low: 'success', medium: 'warning', high: 'danger' };
const refTypeLabel = { dataset: '数据集', report: '报表', metric: '指标', notification: '通知' };
// 页加载时如果有 query 参数，直接查
if (tableName.value)
    doTableImpact();
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
    ...{ style: {} },
});
const __VLS_0 = {}.ElTabs;
/** @type {[typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    modelValue: (__VLS_ctx.activeTab),
}));
const __VLS_2 = __VLS_1({
    modelValue: (__VLS_ctx.activeTab),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
const __VLS_4 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
    label: "表影响分析",
    name: "table",
}));
const __VLS_6 = __VLS_5({
    label: "表影响分析",
    name: "table",
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
__VLS_7.slots.default;
const __VLS_8 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    shadow: "never",
}));
const __VLS_10 = __VLS_9({
    shadow: "never",
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
__VLS_11.slots.default;
const __VLS_12 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    inline: (true),
    size: "small",
}));
const __VLS_14 = __VLS_13({
    inline: (true),
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
__VLS_15.slots.default;
const __VLS_16 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    label: "选择表",
}));
const __VLS_18 = __VLS_17({
    label: "选择表",
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
__VLS_19.slots.default;
const __VLS_20 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    modelValue: (__VLS_ctx.tableName),
    filterable: true,
    placeholder: "搜索资产表",
    ...{ style: {} },
}));
const __VLS_22 = __VLS_21({
    modelValue: (__VLS_ctx.tableName),
    filterable: true,
    placeholder: "搜索资产表",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
__VLS_23.slots.default;
for (const [a] of __VLS_getVForSourceType((__VLS_ctx.tableOptions))) {
    const __VLS_24 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
        key: (a.table_name),
        label: (`${a.table_label} (${a.table_name})`),
        value: (a.table_name),
    }));
    const __VLS_26 = __VLS_25({
        key: (a.table_name),
        label: (`${a.table_label} (${a.table_name})`),
        value: (a.table_name),
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
}
var __VLS_23;
var __VLS_19;
const __VLS_28 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({}));
const __VLS_30 = __VLS_29({}, ...__VLS_functionalComponentArgsRest(__VLS_29));
__VLS_31.slots.default;
const __VLS_32 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    ...{ 'onClick': {} },
    type: "primary",
    icon: (__VLS_ctx.Search),
    loading: (__VLS_ctx.tableLoading),
}));
const __VLS_34 = __VLS_33({
    ...{ 'onClick': {} },
    type: "primary",
    icon: (__VLS_ctx.Search),
    loading: (__VLS_ctx.tableLoading),
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
let __VLS_36;
let __VLS_37;
let __VLS_38;
const __VLS_39 = {
    onClick: (__VLS_ctx.doTableImpact)
};
__VLS_35.slots.default;
var __VLS_35;
var __VLS_31;
var __VLS_15;
var __VLS_11;
var __VLS_7;
const __VLS_40 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
    label: "字段影响分析",
    name: "field",
}));
const __VLS_42 = __VLS_41({
    label: "字段影响分析",
    name: "field",
}, ...__VLS_functionalComponentArgsRest(__VLS_41));
__VLS_43.slots.default;
const __VLS_44 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
    shadow: "never",
}));
const __VLS_46 = __VLS_45({
    shadow: "never",
}, ...__VLS_functionalComponentArgsRest(__VLS_45));
__VLS_47.slots.default;
const __VLS_48 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
    inline: (true),
    size: "small",
}));
const __VLS_50 = __VLS_49({
    inline: (true),
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_49));
__VLS_51.slots.default;
const __VLS_52 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
    label: "表",
}));
const __VLS_54 = __VLS_53({
    label: "表",
}, ...__VLS_functionalComponentArgsRest(__VLS_53));
__VLS_55.slots.default;
const __VLS_56 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
    modelValue: (__VLS_ctx.fieldTableName),
    filterable: true,
    placeholder: "选择表",
    ...{ style: {} },
}));
const __VLS_58 = __VLS_57({
    modelValue: (__VLS_ctx.fieldTableName),
    filterable: true,
    placeholder: "选择表",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_57));
__VLS_59.slots.default;
for (const [a] of __VLS_getVForSourceType((__VLS_ctx.tableOptions))) {
    const __VLS_60 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
        key: (a.table_name),
        label: (a.table_label),
        value: (a.table_name),
    }));
    const __VLS_62 = __VLS_61({
        key: (a.table_name),
        label: (a.table_label),
        value: (a.table_name),
    }, ...__VLS_functionalComponentArgsRest(__VLS_61));
}
var __VLS_59;
var __VLS_55;
const __VLS_64 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
    label: "字段",
}));
const __VLS_66 = __VLS_65({
    label: "字段",
}, ...__VLS_functionalComponentArgsRest(__VLS_65));
__VLS_67.slots.default;
const __VLS_68 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
    modelValue: (__VLS_ctx.fieldColumnCode),
    placeholder: "字段编码",
    ...{ style: {} },
}));
const __VLS_70 = __VLS_69({
    modelValue: (__VLS_ctx.fieldColumnCode),
    placeholder: "字段编码",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_69));
var __VLS_67;
const __VLS_72 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({}));
const __VLS_74 = __VLS_73({}, ...__VLS_functionalComponentArgsRest(__VLS_73));
__VLS_75.slots.default;
const __VLS_76 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
    ...{ 'onClick': {} },
    type: "primary",
    icon: (__VLS_ctx.Search),
    loading: (__VLS_ctx.fieldLoading),
}));
const __VLS_78 = __VLS_77({
    ...{ 'onClick': {} },
    type: "primary",
    icon: (__VLS_ctx.Search),
    loading: (__VLS_ctx.fieldLoading),
}, ...__VLS_functionalComponentArgsRest(__VLS_77));
let __VLS_80;
let __VLS_81;
let __VLS_82;
const __VLS_83 = {
    onClick: (__VLS_ctx.doFieldImpact)
};
__VLS_79.slots.default;
var __VLS_79;
var __VLS_75;
var __VLS_51;
var __VLS_47;
var __VLS_43;
const __VLS_84 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
    label: "模型影响分析",
    name: "model",
}));
const __VLS_86 = __VLS_85({
    label: "模型影响分析",
    name: "model",
}, ...__VLS_functionalComponentArgsRest(__VLS_85));
__VLS_87.slots.default;
const __VLS_88 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
    shadow: "never",
}));
const __VLS_90 = __VLS_89({
    shadow: "never",
}, ...__VLS_functionalComponentArgsRest(__VLS_89));
__VLS_91.slots.default;
const __VLS_92 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
    inline: (true),
    size: "small",
}));
const __VLS_94 = __VLS_93({
    inline: (true),
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_93));
__VLS_95.slots.default;
const __VLS_96 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
    label: "选择模型",
}));
const __VLS_98 = __VLS_97({
    label: "选择模型",
}, ...__VLS_functionalComponentArgsRest(__VLS_97));
__VLS_99.slots.default;
const __VLS_100 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
    modelValue: (__VLS_ctx.modelId),
    filterable: true,
    placeholder: "搜索数据模型",
    ...{ style: {} },
}));
const __VLS_102 = __VLS_101({
    modelValue: (__VLS_ctx.modelId),
    filterable: true,
    placeholder: "搜索数据模型",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_101));
__VLS_103.slots.default;
for (const [m] of __VLS_getVForSourceType((__VLS_ctx.modelOptions))) {
    const __VLS_104 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
        key: (m.id),
        label: (`${m.name} (ID:${m.id})`),
        value: (m.id),
    }));
    const __VLS_106 = __VLS_105({
        key: (m.id),
        label: (`${m.name} (ID:${m.id})`),
        value: (m.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_105));
}
var __VLS_103;
var __VLS_99;
const __VLS_108 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({}));
const __VLS_110 = __VLS_109({}, ...__VLS_functionalComponentArgsRest(__VLS_109));
__VLS_111.slots.default;
const __VLS_112 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
    ...{ 'onClick': {} },
    type: "primary",
    icon: (__VLS_ctx.Search),
    loading: (__VLS_ctx.modelLoading),
}));
const __VLS_114 = __VLS_113({
    ...{ 'onClick': {} },
    type: "primary",
    icon: (__VLS_ctx.Search),
    loading: (__VLS_ctx.modelLoading),
}, ...__VLS_functionalComponentArgsRest(__VLS_113));
let __VLS_116;
let __VLS_117;
let __VLS_118;
const __VLS_119 = {
    onClick: (__VLS_ctx.doModelImpact)
};
__VLS_115.slots.default;
var __VLS_115;
var __VLS_111;
var __VLS_95;
var __VLS_91;
var __VLS_87;
var __VLS_3;
if (__VLS_ctx.refsForTab().length || __VLS_ctx.blockingForTab()) {
    const __VLS_120 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
        shadow: "never",
        ...{ style: {} },
    }));
    const __VLS_122 = __VLS_121({
        shadow: "never",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_121));
    __VLS_123.slots.default;
    {
        const { header: __VLS_thisSlot } = __VLS_123.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
    }
    if (__VLS_ctx.blockingForTab()) {
        const __VLS_124 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
            type: "danger",
            title: "存在阻塞性引用",
            description: "以下引用可能阻止该对象的修改或删除操作",
            showIcon: true,
            ...{ style: {} },
        }));
        const __VLS_126 = __VLS_125({
            type: "danger",
            title: "存在阻塞性引用",
            description: "以下引用可能阻止该对象的修改或删除操作",
            showIcon: true,
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_125));
    }
    else {
        const __VLS_128 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
            type: "success",
            title: "无阻塞风险",
            showIcon: true,
            ...{ style: {} },
        }));
        const __VLS_130 = __VLS_129({
            type: "success",
            title: "无阻塞风险",
            showIcon: true,
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_129));
    }
    const __VLS_132 = {}.ElTable;
    /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
    // @ts-ignore
    const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
        data: (__VLS_ctx.refsForTab()),
        border: true,
        size: "small",
        emptyText: "无引用记录",
    }));
    const __VLS_134 = __VLS_133({
        data: (__VLS_ctx.refsForTab()),
        border: true,
        size: "small",
        emptyText: "无引用记录",
    }, ...__VLS_functionalComponentArgsRest(__VLS_133));
    __VLS_135.slots.default;
    const __VLS_136 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
        prop: "type",
        label: "类型",
        width: "80",
    }));
    const __VLS_138 = __VLS_137({
        prop: "type",
        label: "类型",
        width: "80",
    }, ...__VLS_functionalComponentArgsRest(__VLS_137));
    __VLS_139.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_139.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        (__VLS_ctx.refTypeLabel[row.type] || row.type);
    }
    var __VLS_139;
    const __VLS_140 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
        prop: "name",
        label: "名称",
        minWidth: "140",
        showOverflowTooltip: true,
    }));
    const __VLS_142 = __VLS_141({
        prop: "name",
        label: "名称",
        minWidth: "140",
        showOverflowTooltip: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_141));
    const __VLS_144 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
        prop: "usage",
        label: "用途",
        minWidth: "120",
        showOverflowTooltip: true,
    }));
    const __VLS_146 = __VLS_145({
        prop: "usage",
        label: "用途",
        minWidth: "120",
        showOverflowTooltip: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_145));
    const __VLS_148 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
        prop: "risk_level",
        label: "风险等级",
        width: "90",
    }));
    const __VLS_150 = __VLS_149({
        prop: "risk_level",
        label: "风险等级",
        width: "90",
    }, ...__VLS_functionalComponentArgsRest(__VLS_149));
    __VLS_151.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_151.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_152 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
            size: "small",
            type: (__VLS_ctx.riskTag[row.risk_level] || 'info'),
        }));
        const __VLS_154 = __VLS_153({
            size: "small",
            type: (__VLS_ctx.riskTag[row.risk_level] || 'info'),
        }, ...__VLS_functionalComponentArgsRest(__VLS_153));
        __VLS_155.slots.default;
        (row.risk_level);
        var __VLS_155;
    }
    var __VLS_151;
    const __VLS_156 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_157 = __VLS_asFunctionalComponent(__VLS_156, new __VLS_156({
        prop: "blocking",
        label: "阻塞",
        width: "70",
        align: "center",
    }));
    const __VLS_158 = __VLS_157({
        prop: "blocking",
        label: "阻塞",
        width: "70",
        align: "center",
    }, ...__VLS_functionalComponentArgsRest(__VLS_157));
    __VLS_159.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_159.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_160 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
            size: "small",
            type: (row.blocking ? 'danger' : 'success'),
        }));
        const __VLS_162 = __VLS_161({
            size: "small",
            type: (row.blocking ? 'danger' : 'success'),
        }, ...__VLS_functionalComponentArgsRest(__VLS_161));
        __VLS_163.slots.default;
        (row.blocking ? '是' : '否');
        var __VLS_163;
    }
    var __VLS_159;
    var __VLS_135;
    var __VLS_123;
}
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Search: Search,
            activeTab: activeTab,
            tableOptions: tableOptions,
            tableName: tableName,
            tableLoading: tableLoading,
            fieldTableName: fieldTableName,
            fieldColumnCode: fieldColumnCode,
            fieldLoading: fieldLoading,
            modelOptions: modelOptions,
            modelId: modelId,
            modelLoading: modelLoading,
            doTableImpact: doTableImpact,
            doFieldImpact: doFieldImpact,
            doModelImpact: doModelImpact,
            refsForTab: refsForTab,
            blockingForTab: blockingForTab,
            riskTag: riskTag,
            refTypeLabel: refTypeLabel,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
