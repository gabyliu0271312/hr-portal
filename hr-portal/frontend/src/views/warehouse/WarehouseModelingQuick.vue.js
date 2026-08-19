/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ArrowLeft, ArrowRight, Check } from '@element-plus/icons-vue';
import { listModels, createModel, updateModel, publishModel, saveOutputFields, previewModel } from '@/api/warehouse';
import { useUserStore } from '@/stores/user';
const router = useRouter();
const userStore = useUserStore();
const step = ref(1);
const modelId = ref(null);
const hasModel = computed(() => modelId.value !== null);
// Step 1 — 基础信息
const form1 = ref({ name: '', main_table: '', main_alias: '', join_table: '', join_alias: '', warehouse_layer: 'DWD', subject_area: '' });
const datasetOptions = ref([]);
const datasetTableMap = ref({}); // dataset name → table name
const tablesLoading = ref(false);
async function loadTables() {
    tablesLoading.value = true;
    try {
        const res = await listModels({ page_size: 200, warehouse_layer: 'DWD' });
        datasetOptions.value = res.items || [];
        // 数据集名→表名映射：ds_dwd_xxx → dwd_xxx
        for (const ds of datasetOptions.value) {
            const tableName = (ds.name || '').replace(/^ds_/, '');
            if (tableName)
                datasetTableMap.value[ds.name] = tableName;
        }
    }
    catch { /* */ }
    finally {
        tablesLoading.value = false;
    }
}
loadTables();
function canNext1() { return form1.value.name && form1.value.main_table && form1.value.join_table; }
// 可用别名列表
const aliases = computed(() => [
    form1.value.main_alias || form1.value.main_table,
    form1.value.join_alias || form1.value.join_table,
].filter(Boolean));
// Step 2 — 关联条件
const form2 = ref({ join_type: 'left', left_key: '', right_key: '', cardinality: '1:N' });
const keyPairs = ref([]);
function addKeyPair() { if (!form2.value.left_key || !form2.value.right_key)
    return; keyPairs.value.push({ left: form2.value.left_key, right: form2.value.right_key }); form2.value.left_key = ''; form2.value.right_key = ''; }
function removeKey(i) { keyPairs.value.splice(i, 1); }
function canNext2() { return keyPairs.value.length > 0; }
// Step 3 — 输出字段 + 预览
const outputFields = ref([]);
const previewData = ref(null);
const previewLoading = ref(false);
const saving = ref(false);
function addOutputField() {
    outputFields.value.push({
        source_alias: aliases.value[0] || '',
        source_column: '', output_code: '', output_label: '',
        data_type: 'string', agg_role: 'dimension',
        is_sensitive: false, is_visible: true,
        display_order: outputFields.value.length,
    });
}
function removeOutputField(i) { outputFields.value.splice(i, 1); }
function buildPayload() {
    const mainAlias = form1.value.main_alias || form1.value.main_table;
    const joinAlias = form1.value.join_alias || form1.value.join_table;
    return {
        name: form1.value.name, warehouse_layer: form1.value.warehouse_layer, subject_area: form1.value.subject_area || undefined,
        tables: [
            { table_name: form1.value.main_table, alias: mainAlias },
            { table_name: form1.value.join_table, alias: joinAlias },
        ],
        relations: [{ left_alias: mainAlias, right_alias: joinAlias, join_type: form2.value.join_type, left_keys: keyPairs.value.map(k => k.left), right_keys: keyPairs.value.map(k => k.right), cardinality: form2.value.cardinality }],
    };
}
async function doPreview() {
    if (!modelId.value && !userStore.hasOp('warehouse.assets', 'C')) {
        ElMessage.warning('无权限创建模型');
        return;
    }
    // 确保模型已保存
    if (!modelId.value) {
        saving.value = true;
        try {
            const res = await createModel(buildPayload());
            modelId.value = res.id;
        }
        catch (e) {
            ElMessage.error(e?.response?.data?.detail || '创建模型失败');
            saving.value = false;
            return;
        }
        saving.value = false;
    }
    else {
        try {
            await updateModel(modelId.value, { name: form1.value.name, warehouse_layer: form1.value.warehouse_layer, subject_area: form1.value.subject_area || undefined });
        }
        catch { /* 预览优先 */ }
    }
    previewLoading.value = true;
    try {
        previewData.value = await previewModel(modelId.value);
        // 用预览结果填充默认输出字段
        if (previewData.value && !outputFields.value.length) {
            outputFields.value = previewData.value.columns.map((c, i) => ({
                source_alias: aliases.value[0] || '',
                source_column: c, output_code: c, output_label: c,
                data_type: 'string', agg_role: 'dimension',
                is_sensitive: false, is_visible: true, display_order: i,
            }));
        }
    }
    catch {
        ElMessage.error('预览失败');
    }
    finally {
        previewLoading.value = false;
    }
}
function validOutputFields() {
    const fields = outputFields.value.filter(f => f.source_alias && f.source_column && f.output_code && f.output_label);
    if (!fields.length)
        return false;
    // source_alias 必须属于模型的别名列表
    for (const f of fields) {
        if (!aliases.value.includes(f.source_alias)) {
            ElMessage.error(`source_alias "${f.source_alias}" 不属于该模型的表别名`);
            return false;
        }
    }
    return true;
}
async function saveDraft() {
    saving.value = true;
    try {
        if (modelId.value) {
            await updateModel(modelId.value, { name: form1.value.name, warehouse_layer: form1.value.warehouse_layer, subject_area: form1.value.subject_area || undefined });
            if (outputFields.value.length) {
                const valid = outputFields.value.filter(f => f.source_alias && f.source_column && f.output_code && f.output_label);
                if (valid.length)
                    await saveOutputFields(modelId.value, valid);
            }
            ElMessage.success('草稿已更新');
        }
        else {
            const res = await createModel(buildPayload());
            modelId.value = res.id;
            if (outputFields.value.length) {
                const valid = outputFields.value.filter(f => f.source_alias && f.source_column && f.output_code && f.output_label);
                if (valid.length)
                    await saveOutputFields(modelId.value, valid);
            }
            ElMessage.success(`模型已创建 (ID: ${res.id})`);
        }
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '保存失败');
    }
    finally {
        saving.value = false;
    }
}
async function doPublish() {
    if (!modelId.value) {
        await saveDraft();
        if (!modelId.value)
            return;
    }
    try {
        if (outputFields.value.length) {
            const valid = outputFields.value.filter(f => f.source_alias && f.source_column && f.output_code && f.output_label);
            if (valid.length)
                await saveOutputFields(modelId.value, valid);
        }
        await publishModel(modelId.value);
        ElMessage.success('模型已发布');
        router.push('/warehouse/modeling');
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '发布失败');
    }
}
function goModelList() { router.push('/warehouse/modeling'); }
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
const __VLS_0 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onClick': {} },
    text: true,
    icon: (__VLS_ctx.ArrowLeft),
}));
const __VLS_2 = __VLS_1({
    ...{ 'onClick': {} },
    text: true,
    icon: (__VLS_ctx.ArrowLeft),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onClick: (__VLS_ctx.goModelList)
};
__VLS_3.slots.default;
var __VLS_3;
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
    ...{ style: {} },
});
if (__VLS_ctx.hasModel) {
    const __VLS_8 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        size: "small",
        type: "info",
    }));
    const __VLS_10 = __VLS_9({
        size: "small",
        type: "info",
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    __VLS_11.slots.default;
    (__VLS_ctx.modelId);
    var __VLS_11;
}
const __VLS_12 = {}.ElSteps;
/** @type {[typeof __VLS_components.ElSteps, typeof __VLS_components.elSteps, typeof __VLS_components.ElSteps, typeof __VLS_components.elSteps, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    active: (__VLS_ctx.step),
    finishStatus: "success",
    alignCenter: true,
    ...{ style: {} },
}));
const __VLS_14 = __VLS_13({
    active: (__VLS_ctx.step),
    finishStatus: "success",
    alignCenter: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
__VLS_15.slots.default;
const __VLS_16 = {}.ElStep;
/** @type {[typeof __VLS_components.ElStep, typeof __VLS_components.elStep, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    title: "基础信息",
}));
const __VLS_18 = __VLS_17({
    title: "基础信息",
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
const __VLS_20 = {}.ElStep;
/** @type {[typeof __VLS_components.ElStep, typeof __VLS_components.elStep, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    title: "关联配置",
}));
const __VLS_22 = __VLS_21({
    title: "关联配置",
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
const __VLS_24 = {}.ElStep;
/** @type {[typeof __VLS_components.ElStep, typeof __VLS_components.elStep, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    title: "输出字段 & 预览",
}));
const __VLS_26 = __VLS_25({
    title: "输出字段 & 预览",
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
var __VLS_15;
const __VLS_28 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({}));
const __VLS_30 = __VLS_29({}, ...__VLS_functionalComponentArgsRest(__VLS_29));
__VLS_asFunctionalDirective(__VLS_directives.vShow)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.step === 1) }, null, null);
__VLS_31.slots.default;
if (__VLS_ctx.hasModel) {
    const __VLS_32 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
        type: "info",
        title: "V1: 模型已创建，表/关系不可修改。如需调整请新建模型",
        showIcon: true,
        closable: (false),
        ...{ style: {} },
    }));
    const __VLS_34 = __VLS_33({
        type: "info",
        title: "V1: 模型已创建，表/关系不可修改。如需调整请新建模型",
        showIcon: true,
        closable: (false),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_33));
}
const __VLS_36 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
    labelWidth: "100px",
    size: "small",
}));
const __VLS_38 = __VLS_37({
    labelWidth: "100px",
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
__VLS_39.slots.default;
const __VLS_40 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
    label: "模型名称",
    required: true,
}));
const __VLS_42 = __VLS_41({
    label: "模型名称",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_41));
__VLS_43.slots.default;
const __VLS_44 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
    modelValue: (__VLS_ctx.form1.name),
    placeholder: "如：员工薪资汇总",
    maxlength: "64",
    disabled: (__VLS_ctx.hasModel),
}));
const __VLS_46 = __VLS_45({
    modelValue: (__VLS_ctx.form1.name),
    placeholder: "如：员工薪资汇总",
    maxlength: "64",
    disabled: (__VLS_ctx.hasModel),
}, ...__VLS_functionalComponentArgsRest(__VLS_45));
var __VLS_43;
const __VLS_48 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
    label: "主表",
    required: true,
}));
const __VLS_50 = __VLS_49({
    label: "主表",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_49));
__VLS_51.slots.default;
const __VLS_52 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
    modelValue: (__VLS_ctx.form1.main_table),
    filterable: true,
    placeholder: "选择 DWD 数据集",
    ...{ style: {} },
    loading: (__VLS_ctx.tablesLoading),
    disabled: (__VLS_ctx.hasModel),
}));
const __VLS_54 = __VLS_53({
    modelValue: (__VLS_ctx.form1.main_table),
    filterable: true,
    placeholder: "选择 DWD 数据集",
    ...{ style: {} },
    loading: (__VLS_ctx.tablesLoading),
    disabled: (__VLS_ctx.hasModel),
}, ...__VLS_functionalComponentArgsRest(__VLS_53));
__VLS_55.slots.default;
for (const [ds] of __VLS_getVForSourceType((__VLS_ctx.datasetOptions))) {
    const __VLS_56 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
        key: (ds.name),
        label: (`${ds.label || ds.name} (${ds.name})`),
        value: (__VLS_ctx.datasetTableMap[ds.name] || ds.name),
    }));
    const __VLS_58 = __VLS_57({
        key: (ds.name),
        label: (`${ds.label || ds.name} (${ds.name})`),
        value: (__VLS_ctx.datasetTableMap[ds.name] || ds.name),
    }, ...__VLS_functionalComponentArgsRest(__VLS_57));
}
var __VLS_55;
var __VLS_51;
const __VLS_60 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
    label: "主表别名",
}));
const __VLS_62 = __VLS_61({
    label: "主表别名",
}, ...__VLS_functionalComponentArgsRest(__VLS_61));
__VLS_63.slots.default;
const __VLS_64 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
    modelValue: (__VLS_ctx.form1.main_alias),
    placeholder: "默认同表名",
    disabled: (__VLS_ctx.hasModel),
}));
const __VLS_66 = __VLS_65({
    modelValue: (__VLS_ctx.form1.main_alias),
    placeholder: "默认同表名",
    disabled: (__VLS_ctx.hasModel),
}, ...__VLS_functionalComponentArgsRest(__VLS_65));
var __VLS_63;
const __VLS_68 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
    label: "关联表",
    required: true,
}));
const __VLS_70 = __VLS_69({
    label: "关联表",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_69));
__VLS_71.slots.default;
const __VLS_72 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
    modelValue: (__VLS_ctx.form1.join_table),
    filterable: true,
    placeholder: "选择 DWD 数据集",
    ...{ style: {} },
    loading: (__VLS_ctx.tablesLoading),
    disabled: (__VLS_ctx.hasModel),
}));
const __VLS_74 = __VLS_73({
    modelValue: (__VLS_ctx.form1.join_table),
    filterable: true,
    placeholder: "选择 DWD 数据集",
    ...{ style: {} },
    loading: (__VLS_ctx.tablesLoading),
    disabled: (__VLS_ctx.hasModel),
}, ...__VLS_functionalComponentArgsRest(__VLS_73));
__VLS_75.slots.default;
for (const [ds] of __VLS_getVForSourceType((__VLS_ctx.datasetOptions))) {
    const __VLS_76 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
        key: (ds.name),
        label: (`${ds.label || ds.name} (${ds.name})`),
        value: (__VLS_ctx.datasetTableMap[ds.name] || ds.name),
    }));
    const __VLS_78 = __VLS_77({
        key: (ds.name),
        label: (`${ds.label || ds.name} (${ds.name})`),
        value: (__VLS_ctx.datasetTableMap[ds.name] || ds.name),
    }, ...__VLS_functionalComponentArgsRest(__VLS_77));
}
var __VLS_75;
var __VLS_71;
const __VLS_80 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
    label: "关联表别名",
}));
const __VLS_82 = __VLS_81({
    label: "关联表别名",
}, ...__VLS_functionalComponentArgsRest(__VLS_81));
__VLS_83.slots.default;
const __VLS_84 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
    modelValue: (__VLS_ctx.form1.join_alias),
    placeholder: "默认同表名",
    disabled: (__VLS_ctx.hasModel),
}));
const __VLS_86 = __VLS_85({
    modelValue: (__VLS_ctx.form1.join_alias),
    placeholder: "默认同表名",
    disabled: (__VLS_ctx.hasModel),
}, ...__VLS_functionalComponentArgsRest(__VLS_85));
var __VLS_83;
const __VLS_88 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
    label: "分层",
}));
const __VLS_90 = __VLS_89({
    label: "分层",
}, ...__VLS_functionalComponentArgsRest(__VLS_89));
__VLS_91.slots.default;
const __VLS_92 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
    modelValue: (__VLS_ctx.form1.warehouse_layer),
    ...{ style: {} },
}));
const __VLS_94 = __VLS_93({
    modelValue: (__VLS_ctx.form1.warehouse_layer),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_93));
__VLS_95.slots.default;
const __VLS_96 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
    label: "ODS 原始数据",
    value: "ODS",
}));
const __VLS_98 = __VLS_97({
    label: "ODS 原始数据",
    value: "ODS",
}, ...__VLS_functionalComponentArgsRest(__VLS_97));
const __VLS_100 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
    label: "DWD 明细数据",
    value: "DWD",
}));
const __VLS_102 = __VLS_101({
    label: "DWD 明细数据",
    value: "DWD",
}, ...__VLS_functionalComponentArgsRest(__VLS_101));
const __VLS_104 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
    label: "DWS 汇总数据",
    value: "DWS",
}));
const __VLS_106 = __VLS_105({
    label: "DWS 汇总数据",
    value: "DWS",
}, ...__VLS_functionalComponentArgsRest(__VLS_105));
const __VLS_108 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
    label: "ADS 应用数据",
    value: "ADS",
}));
const __VLS_110 = __VLS_109({
    label: "ADS 应用数据",
    value: "ADS",
}, ...__VLS_functionalComponentArgsRest(__VLS_109));
var __VLS_95;
var __VLS_91;
const __VLS_112 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
    label: "主题域",
}));
const __VLS_114 = __VLS_113({
    label: "主题域",
}, ...__VLS_functionalComponentArgsRest(__VLS_113));
__VLS_115.slots.default;
const __VLS_116 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
    modelValue: (__VLS_ctx.form1.subject_area),
    placeholder: "如：薪酬",
}));
const __VLS_118 = __VLS_117({
    modelValue: (__VLS_ctx.form1.subject_area),
    placeholder: "如：薪酬",
}, ...__VLS_functionalComponentArgsRest(__VLS_117));
var __VLS_115;
var __VLS_39;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
const __VLS_120 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
    ...{ 'onClick': {} },
    type: "primary",
    icon: (__VLS_ctx.ArrowRight),
    disabled: (!__VLS_ctx.canNext1()),
}));
const __VLS_122 = __VLS_121({
    ...{ 'onClick': {} },
    type: "primary",
    icon: (__VLS_ctx.ArrowRight),
    disabled: (!__VLS_ctx.canNext1()),
}, ...__VLS_functionalComponentArgsRest(__VLS_121));
let __VLS_124;
let __VLS_125;
let __VLS_126;
const __VLS_127 = {
    onClick: (...[$event]) => {
        __VLS_ctx.step = 2;
    }
};
__VLS_123.slots.default;
var __VLS_123;
var __VLS_31;
const __VLS_128 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({}));
const __VLS_130 = __VLS_129({}, ...__VLS_functionalComponentArgsRest(__VLS_129));
__VLS_asFunctionalDirective(__VLS_directives.vShow)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.step === 2) }, null, null);
__VLS_131.slots.default;
if (__VLS_ctx.hasModel) {
    const __VLS_132 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
        type: "info",
        title: "V1: 模型已创建，关联关系不可修改",
        showIcon: true,
        closable: (false),
        ...{ style: {} },
    }));
    const __VLS_134 = __VLS_133({
        type: "info",
        title: "V1: 模型已创建，关联关系不可修改",
        showIcon: true,
        closable: (false),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_133));
}
const __VLS_136 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
    labelWidth: "100px",
    size: "small",
}));
const __VLS_138 = __VLS_137({
    labelWidth: "100px",
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_137));
__VLS_139.slots.default;
const __VLS_140 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
    label: "关联类型",
}));
const __VLS_142 = __VLS_141({
    label: "关联类型",
}, ...__VLS_functionalComponentArgsRest(__VLS_141));
__VLS_143.slots.default;
const __VLS_144 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
    modelValue: (__VLS_ctx.form2.join_type),
    ...{ style: {} },
    disabled: (__VLS_ctx.hasModel),
}));
const __VLS_146 = __VLS_145({
    modelValue: (__VLS_ctx.form2.join_type),
    ...{ style: {} },
    disabled: (__VLS_ctx.hasModel),
}, ...__VLS_functionalComponentArgsRest(__VLS_145));
__VLS_147.slots.default;
const __VLS_148 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
    label: "LEFT JOIN",
    value: "left",
}));
const __VLS_150 = __VLS_149({
    label: "LEFT JOIN",
    value: "left",
}, ...__VLS_functionalComponentArgsRest(__VLS_149));
const __VLS_152 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
    label: "INNER JOIN",
    value: "inner",
}));
const __VLS_154 = __VLS_153({
    label: "INNER JOIN",
    value: "inner",
}, ...__VLS_functionalComponentArgsRest(__VLS_153));
const __VLS_156 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_157 = __VLS_asFunctionalComponent(__VLS_156, new __VLS_156({
    label: "RIGHT JOIN",
    value: "right",
}));
const __VLS_158 = __VLS_157({
    label: "RIGHT JOIN",
    value: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_157));
var __VLS_147;
var __VLS_143;
const __VLS_160 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
    label: "基数",
}));
const __VLS_162 = __VLS_161({
    label: "基数",
}, ...__VLS_functionalComponentArgsRest(__VLS_161));
__VLS_163.slots.default;
const __VLS_164 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({
    modelValue: (__VLS_ctx.form2.cardinality),
    ...{ style: {} },
    disabled: (__VLS_ctx.hasModel),
}));
const __VLS_166 = __VLS_165({
    modelValue: (__VLS_ctx.form2.cardinality),
    ...{ style: {} },
    disabled: (__VLS_ctx.hasModel),
}, ...__VLS_functionalComponentArgsRest(__VLS_165));
__VLS_167.slots.default;
const __VLS_168 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({
    label: "1:1",
    value: "1:1",
}));
const __VLS_170 = __VLS_169({
    label: "1:1",
    value: "1:1",
}, ...__VLS_functionalComponentArgsRest(__VLS_169));
const __VLS_172 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_173 = __VLS_asFunctionalComponent(__VLS_172, new __VLS_172({
    label: "1:N",
    value: "1:N",
}));
const __VLS_174 = __VLS_173({
    label: "1:N",
    value: "1:N",
}, ...__VLS_functionalComponentArgsRest(__VLS_173));
const __VLS_176 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({
    label: "N:1",
    value: "N:1",
}));
const __VLS_178 = __VLS_177({
    label: "N:1",
    value: "N:1",
}, ...__VLS_functionalComponentArgsRest(__VLS_177));
const __VLS_180 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_181 = __VLS_asFunctionalComponent(__VLS_180, new __VLS_180({
    label: "N:M",
    value: "N:M",
}));
const __VLS_182 = __VLS_181({
    label: "N:M",
    value: "N:M",
}, ...__VLS_functionalComponentArgsRest(__VLS_181));
var __VLS_167;
var __VLS_163;
const __VLS_184 = {}.ElDivider;
/** @type {[typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, ]} */ ;
// @ts-ignore
const __VLS_185 = __VLS_asFunctionalComponent(__VLS_184, new __VLS_184({}));
const __VLS_186 = __VLS_185({}, ...__VLS_functionalComponentArgsRest(__VLS_185));
__VLS_187.slots.default;
var __VLS_187;
const __VLS_188 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_189 = __VLS_asFunctionalComponent(__VLS_188, new __VLS_188({
    label: "左表字段",
}));
const __VLS_190 = __VLS_189({
    label: "左表字段",
}, ...__VLS_functionalComponentArgsRest(__VLS_189));
__VLS_191.slots.default;
const __VLS_192 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_193 = __VLS_asFunctionalComponent(__VLS_192, new __VLS_192({
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.form2.left_key),
    placeholder: "主表字段编码",
    disabled: (__VLS_ctx.hasModel),
}));
const __VLS_194 = __VLS_193({
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.form2.left_key),
    placeholder: "主表字段编码",
    disabled: (__VLS_ctx.hasModel),
}, ...__VLS_functionalComponentArgsRest(__VLS_193));
let __VLS_196;
let __VLS_197;
let __VLS_198;
const __VLS_199 = {
    onKeyup: (__VLS_ctx.addKeyPair)
};
var __VLS_195;
var __VLS_191;
const __VLS_200 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_201 = __VLS_asFunctionalComponent(__VLS_200, new __VLS_200({
    label: "右表字段",
}));
const __VLS_202 = __VLS_201({
    label: "右表字段",
}, ...__VLS_functionalComponentArgsRest(__VLS_201));
__VLS_203.slots.default;
const __VLS_204 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_205 = __VLS_asFunctionalComponent(__VLS_204, new __VLS_204({
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.form2.right_key),
    placeholder: "关联表字段编码",
    disabled: (__VLS_ctx.hasModel),
}));
const __VLS_206 = __VLS_205({
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.form2.right_key),
    placeholder: "关联表字段编码",
    disabled: (__VLS_ctx.hasModel),
}, ...__VLS_functionalComponentArgsRest(__VLS_205));
let __VLS_208;
let __VLS_209;
let __VLS_210;
const __VLS_211 = {
    onKeyup: (__VLS_ctx.addKeyPair)
};
var __VLS_207;
var __VLS_203;
const __VLS_212 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_213 = __VLS_asFunctionalComponent(__VLS_212, new __VLS_212({}));
const __VLS_214 = __VLS_213({}, ...__VLS_functionalComponentArgsRest(__VLS_213));
__VLS_215.slots.default;
const __VLS_216 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_217 = __VLS_asFunctionalComponent(__VLS_216, new __VLS_216({
    ...{ 'onClick': {} },
    size: "small",
    disabled: (__VLS_ctx.hasModel),
}));
const __VLS_218 = __VLS_217({
    ...{ 'onClick': {} },
    size: "small",
    disabled: (__VLS_ctx.hasModel),
}, ...__VLS_functionalComponentArgsRest(__VLS_217));
let __VLS_220;
let __VLS_221;
let __VLS_222;
const __VLS_223 = {
    onClick: (__VLS_ctx.addKeyPair)
};
__VLS_219.slots.default;
var __VLS_219;
var __VLS_215;
var __VLS_139;
if (__VLS_ctx.keyPairs.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    for (const [p, i] of __VLS_getVForSourceType((__VLS_ctx.keyPairs))) {
        const __VLS_224 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_225 = __VLS_asFunctionalComponent(__VLS_224, new __VLS_224({
            ...{ 'onClose': {} },
            key: (i),
            closable: (!__VLS_ctx.hasModel),
            size: "small",
            ...{ style: {} },
        }));
        const __VLS_226 = __VLS_225({
            ...{ 'onClose': {} },
            key: (i),
            closable: (!__VLS_ctx.hasModel),
            size: "small",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_225));
        let __VLS_228;
        let __VLS_229;
        let __VLS_230;
        const __VLS_231 = {
            onClose: (...[$event]) => {
                if (!(__VLS_ctx.keyPairs.length))
                    return;
                !__VLS_ctx.hasModel && __VLS_ctx.removeKey(i);
            }
        };
        __VLS_227.slots.default;
        (p.left);
        (p.right);
        var __VLS_227;
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
const __VLS_232 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_233 = __VLS_asFunctionalComponent(__VLS_232, new __VLS_232({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.ArrowLeft),
}));
const __VLS_234 = __VLS_233({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.ArrowLeft),
}, ...__VLS_functionalComponentArgsRest(__VLS_233));
let __VLS_236;
let __VLS_237;
let __VLS_238;
const __VLS_239 = {
    onClick: (...[$event]) => {
        __VLS_ctx.step = 1;
    }
};
__VLS_235.slots.default;
var __VLS_235;
const __VLS_240 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_241 = __VLS_asFunctionalComponent(__VLS_240, new __VLS_240({
    ...{ 'onClick': {} },
    type: "primary",
    icon: (__VLS_ctx.ArrowRight),
    disabled: (!__VLS_ctx.canNext2()),
}));
const __VLS_242 = __VLS_241({
    ...{ 'onClick': {} },
    type: "primary",
    icon: (__VLS_ctx.ArrowRight),
    disabled: (!__VLS_ctx.canNext2()),
}, ...__VLS_functionalComponentArgsRest(__VLS_241));
let __VLS_244;
let __VLS_245;
let __VLS_246;
const __VLS_247 = {
    onClick: (...[$event]) => {
        __VLS_ctx.step = 3;
    }
};
__VLS_243.slots.default;
var __VLS_243;
var __VLS_131;
const __VLS_248 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_249 = __VLS_asFunctionalComponent(__VLS_248, new __VLS_248({}));
const __VLS_250 = __VLS_249({}, ...__VLS_functionalComponentArgsRest(__VLS_249));
__VLS_asFunctionalDirective(__VLS_directives.vShow)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.step === 3) }, null, null);
__VLS_251.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
if (!__VLS_ctx.hasModel ? __VLS_ctx.userStore.hasOp('warehouse.assets', 'C') : __VLS_ctx.userStore.menus.some(m => m.code === 'warehouse.assets')) {
    const __VLS_252 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_253 = __VLS_asFunctionalComponent(__VLS_252, new __VLS_252({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.previewLoading),
    }));
    const __VLS_254 = __VLS_253({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.previewLoading),
    }, ...__VLS_functionalComponentArgsRest(__VLS_253));
    let __VLS_256;
    let __VLS_257;
    let __VLS_258;
    const __VLS_259 = {
        onClick: (__VLS_ctx.doPreview)
    };
    __VLS_255.slots.default;
    var __VLS_255;
}
if (!__VLS_ctx.hasModel ? __VLS_ctx.userStore.hasOp('warehouse.assets', 'C') : __VLS_ctx.userStore.hasOp('warehouse.assets', 'U')) {
    const __VLS_260 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_261 = __VLS_asFunctionalComponent(__VLS_260, new __VLS_260({
        ...{ 'onClick': {} },
        loading: (__VLS_ctx.saving),
    }));
    const __VLS_262 = __VLS_261({
        ...{ 'onClick': {} },
        loading: (__VLS_ctx.saving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_261));
    let __VLS_264;
    let __VLS_265;
    let __VLS_266;
    const __VLS_267 = {
        onClick: (__VLS_ctx.saveDraft)
    };
    __VLS_263.slots.default;
    var __VLS_263;
}
if (__VLS_ctx.userStore.hasOp('warehouse.assets', 'U')) {
    const __VLS_268 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_269 = __VLS_asFunctionalComponent(__VLS_268, new __VLS_268({
        ...{ 'onClick': {} },
        type: "success",
        icon: (__VLS_ctx.Check),
    }));
    const __VLS_270 = __VLS_269({
        ...{ 'onClick': {} },
        type: "success",
        icon: (__VLS_ctx.Check),
    }, ...__VLS_functionalComponentArgsRest(__VLS_269));
    let __VLS_272;
    let __VLS_273;
    let __VLS_274;
    const __VLS_275 = {
        onClick: (__VLS_ctx.doPublish)
    };
    __VLS_271.slots.default;
    var __VLS_271;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ style: {} },
});
if ((!__VLS_ctx.hasModel ? __VLS_ctx.userStore.hasOp('warehouse.assets', 'C') : __VLS_ctx.userStore.hasOp('warehouse.assets', 'U'))) {
    const __VLS_276 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_277 = __VLS_asFunctionalComponent(__VLS_276, new __VLS_276({
        ...{ 'onClick': {} },
        size: "small",
        icon: (__VLS_ctx.ArrowRight),
    }));
    const __VLS_278 = __VLS_277({
        ...{ 'onClick': {} },
        size: "small",
        icon: (__VLS_ctx.ArrowRight),
    }, ...__VLS_functionalComponentArgsRest(__VLS_277));
    let __VLS_280;
    let __VLS_281;
    let __VLS_282;
    const __VLS_283 = {
        onClick: (__VLS_ctx.addOutputField)
    };
    __VLS_279.slots.default;
    var __VLS_279;
}
if (__VLS_ctx.outputFields.length) {
    const __VLS_284 = {}.ElTable;
    /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
    // @ts-ignore
    const __VLS_285 = __VLS_asFunctionalComponent(__VLS_284, new __VLS_284({
        data: (__VLS_ctx.outputFields),
        border: true,
        size: "small",
        maxHeight: "240",
    }));
    const __VLS_286 = __VLS_285({
        data: (__VLS_ctx.outputFields),
        border: true,
        size: "small",
        maxHeight: "240",
    }, ...__VLS_functionalComponentArgsRest(__VLS_285));
    __VLS_287.slots.default;
    const __VLS_288 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_289 = __VLS_asFunctionalComponent(__VLS_288, new __VLS_288({
        label: "来源表别名",
        width: "110",
    }));
    const __VLS_290 = __VLS_289({
        label: "来源表别名",
        width: "110",
    }, ...__VLS_functionalComponentArgsRest(__VLS_289));
    __VLS_291.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_291.slots;
        const [{ row, $index }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_292 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_293 = __VLS_asFunctionalComponent(__VLS_292, new __VLS_292({
            modelValue: (__VLS_ctx.outputFields[$index].source_alias),
            size: "small",
            ...{ style: {} },
        }));
        const __VLS_294 = __VLS_293({
            modelValue: (__VLS_ctx.outputFields[$index].source_alias),
            size: "small",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_293));
        __VLS_295.slots.default;
        for (const [a] of __VLS_getVForSourceType((__VLS_ctx.aliases))) {
            const __VLS_296 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_297 = __VLS_asFunctionalComponent(__VLS_296, new __VLS_296({
                key: (a),
                label: (a),
                value: (a),
            }));
            const __VLS_298 = __VLS_297({
                key: (a),
                label: (a),
                value: (a),
            }, ...__VLS_functionalComponentArgsRest(__VLS_297));
        }
        var __VLS_295;
    }
    var __VLS_291;
    const __VLS_300 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_301 = __VLS_asFunctionalComponent(__VLS_300, new __VLS_300({
        label: "来源字段",
        minWidth: "110",
    }));
    const __VLS_302 = __VLS_301({
        label: "来源字段",
        minWidth: "110",
    }, ...__VLS_functionalComponentArgsRest(__VLS_301));
    __VLS_303.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_303.slots;
        const [{ row, $index }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_304 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_305 = __VLS_asFunctionalComponent(__VLS_304, new __VLS_304({
            modelValue: (__VLS_ctx.outputFields[$index].source_column),
            size: "small",
        }));
        const __VLS_306 = __VLS_305({
            modelValue: (__VLS_ctx.outputFields[$index].source_column),
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_305));
    }
    var __VLS_303;
    const __VLS_308 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_309 = __VLS_asFunctionalComponent(__VLS_308, new __VLS_308({
        label: "输出编码",
        minWidth: "100",
    }));
    const __VLS_310 = __VLS_309({
        label: "输出编码",
        minWidth: "100",
    }, ...__VLS_functionalComponentArgsRest(__VLS_309));
    __VLS_311.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_311.slots;
        const [{ row, $index }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_312 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_313 = __VLS_asFunctionalComponent(__VLS_312, new __VLS_312({
            modelValue: (__VLS_ctx.outputFields[$index].output_code),
            size: "small",
        }));
        const __VLS_314 = __VLS_313({
            modelValue: (__VLS_ctx.outputFields[$index].output_code),
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_313));
    }
    var __VLS_311;
    const __VLS_316 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_317 = __VLS_asFunctionalComponent(__VLS_316, new __VLS_316({
        label: "输出名称",
        minWidth: "100",
    }));
    const __VLS_318 = __VLS_317({
        label: "输出名称",
        minWidth: "100",
    }, ...__VLS_functionalComponentArgsRest(__VLS_317));
    __VLS_319.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_319.slots;
        const [{ row, $index }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_320 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_321 = __VLS_asFunctionalComponent(__VLS_320, new __VLS_320({
            modelValue: (__VLS_ctx.outputFields[$index].output_label),
            size: "small",
        }));
        const __VLS_322 = __VLS_321({
            modelValue: (__VLS_ctx.outputFields[$index].output_label),
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_321));
    }
    var __VLS_319;
    const __VLS_324 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_325 = __VLS_asFunctionalComponent(__VLS_324, new __VLS_324({
        label: "描述",
        minWidth: "80",
    }));
    const __VLS_326 = __VLS_325({
        label: "描述",
        minWidth: "80",
    }, ...__VLS_functionalComponentArgsRest(__VLS_325));
    __VLS_327.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_327.slots;
        const [{ row, $index }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_328 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_329 = __VLS_asFunctionalComponent(__VLS_328, new __VLS_328({
            modelValue: (__VLS_ctx.outputFields[$index].description),
            size: "small",
            placeholder: "可选",
        }));
        const __VLS_330 = __VLS_329({
            modelValue: (__VLS_ctx.outputFields[$index].description),
            size: "small",
            placeholder: "可选",
        }, ...__VLS_functionalComponentArgsRest(__VLS_329));
    }
    var __VLS_327;
    const __VLS_332 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_333 = __VLS_asFunctionalComponent(__VLS_332, new __VLS_332({
        label: "操作",
        width: "50",
    }));
    const __VLS_334 = __VLS_333({
        label: "操作",
        width: "50",
    }, ...__VLS_functionalComponentArgsRest(__VLS_333));
    __VLS_335.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_335.slots;
        const [{ row, $index }] = __VLS_getSlotParams(__VLS_thisSlot);
        if ((!__VLS_ctx.hasModel ? __VLS_ctx.userStore.hasOp('warehouse.assets', 'C') : __VLS_ctx.userStore.hasOp('warehouse.assets', 'U'))) {
            const __VLS_336 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_337 = __VLS_asFunctionalComponent(__VLS_336, new __VLS_336({
                ...{ 'onClick': {} },
                text: true,
                size: "small",
                type: "danger",
            }));
            const __VLS_338 = __VLS_337({
                ...{ 'onClick': {} },
                text: true,
                size: "small",
                type: "danger",
            }, ...__VLS_functionalComponentArgsRest(__VLS_337));
            let __VLS_340;
            let __VLS_341;
            let __VLS_342;
            const __VLS_343 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.outputFields.length))
                        return;
                    if (!((!__VLS_ctx.hasModel ? __VLS_ctx.userStore.hasOp('warehouse.assets', 'C') : __VLS_ctx.userStore.hasOp('warehouse.assets', 'U'))))
                        return;
                    __VLS_ctx.removeOutputField($index);
                }
            };
            __VLS_339.slots.default;
            var __VLS_339;
        }
    }
    var __VLS_335;
    var __VLS_287;
}
else {
    const __VLS_344 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_345 = __VLS_asFunctionalComponent(__VLS_344, new __VLS_344({
        description: "点击「预览数据」自动填充，或手动添加字段",
        imageSize: (60),
    }));
    const __VLS_346 = __VLS_345({
        description: "点击「预览数据」自动填充，或手动添加字段",
        imageSize: (60),
    }, ...__VLS_functionalComponentArgsRest(__VLS_345));
}
if (__VLS_ctx.previewData) {
    const __VLS_348 = {}.ElTable;
    /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
    // @ts-ignore
    const __VLS_349 = __VLS_asFunctionalComponent(__VLS_348, new __VLS_348({
        data: (__VLS_ctx.previewData.items),
        border: true,
        size: "small",
        maxHeight: "240",
        ...{ style: {} },
    }));
    const __VLS_350 = __VLS_349({
        data: (__VLS_ctx.previewData.items),
        border: true,
        size: "small",
        maxHeight: "240",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_349));
    __VLS_351.slots.default;
    for (const [c] of __VLS_getVForSourceType((__VLS_ctx.previewData.columns))) {
        const __VLS_352 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_353 = __VLS_asFunctionalComponent(__VLS_352, new __VLS_352({
            key: (c),
            prop: (c),
            label: (c),
            minWidth: "100",
            showOverflowTooltip: true,
        }));
        const __VLS_354 = __VLS_353({
            key: (c),
            prop: (c),
            label: (c),
            minWidth: "100",
            showOverflowTooltip: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_353));
    }
    var __VLS_351;
}
if (__VLS_ctx.previewData?.summary) {
    const __VLS_356 = {}.ElDescriptions;
    /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
    // @ts-ignore
    const __VLS_357 = __VLS_asFunctionalComponent(__VLS_356, new __VLS_356({
        column: (3),
        size: "small",
        border: true,
        ...{ style: {} },
    }));
    const __VLS_358 = __VLS_357({
        column: (3),
        size: "small",
        border: true,
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_357));
    __VLS_359.slots.default;
    const __VLS_360 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_361 = __VLS_asFunctionalComponent(__VLS_360, new __VLS_360({
        label: "总数",
    }));
    const __VLS_362 = __VLS_361({
        label: "总数",
    }, ...__VLS_functionalComponentArgsRest(__VLS_361));
    __VLS_363.slots.default;
    (__VLS_ctx.previewData.summary.main_count ?? '—');
    var __VLS_363;
    const __VLS_364 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_365 = __VLS_asFunctionalComponent(__VLS_364, new __VLS_364({
        label: "返回行数",
    }));
    const __VLS_366 = __VLS_365({
        label: "返回行数",
    }, ...__VLS_functionalComponentArgsRest(__VLS_365));
    __VLS_367.slots.default;
    (__VLS_ctx.previewData.summary.result_count ?? '—');
    var __VLS_367;
    const __VLS_368 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_369 = __VLS_asFunctionalComponent(__VLS_368, new __VLS_368({
        label: "未匹配",
    }));
    const __VLS_370 = __VLS_369({
        label: "未匹配",
    }, ...__VLS_functionalComponentArgsRest(__VLS_369));
    __VLS_371.slots.default;
    (__VLS_ctx.previewData.summary.unmatched_count ?? '—');
    var __VLS_371;
    var __VLS_359;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
const __VLS_372 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_373 = __VLS_asFunctionalComponent(__VLS_372, new __VLS_372({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.ArrowLeft),
}));
const __VLS_374 = __VLS_373({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.ArrowLeft),
}, ...__VLS_functionalComponentArgsRest(__VLS_373));
let __VLS_376;
let __VLS_377;
let __VLS_378;
const __VLS_379 = {
    onClick: (...[$event]) => {
        __VLS_ctx.step = 2;
    }
};
__VLS_375.slots.default;
var __VLS_375;
var __VLS_251;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ArrowLeft: ArrowLeft,
            ArrowRight: ArrowRight,
            Check: Check,
            userStore: userStore,
            step: step,
            modelId: modelId,
            hasModel: hasModel,
            form1: form1,
            datasetOptions: datasetOptions,
            datasetTableMap: datasetTableMap,
            tablesLoading: tablesLoading,
            canNext1: canNext1,
            aliases: aliases,
            form2: form2,
            keyPairs: keyPairs,
            addKeyPair: addKeyPair,
            removeKey: removeKey,
            canNext2: canNext2,
            outputFields: outputFields,
            previewData: previewData,
            previewLoading: previewLoading,
            saving: saving,
            addOutputField: addOutputField,
            removeOutputField: removeOutputField,
            doPreview: doPreview,
            saveDraft: saveDraft,
            doPublish: doPublish,
            goModelList: goModelList,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
