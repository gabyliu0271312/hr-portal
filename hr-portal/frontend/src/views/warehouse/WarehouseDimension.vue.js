/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { onMounted, ref } from 'vue';
import { useUserStore } from '@/stores/user';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Edit, Delete, Refresh } from '@element-plus/icons-vue';
import SmartCodeInput from '@/components/common/SmartCodeInput.vue';
import { listDimensions, getDimensionTree, createDimension, updateDimension, deleteDimension, getDimensionImpact, listModels, getModel, getOutputFields, listAssetColumns, } from '@/api/warehouse';
const userStore = useUserStore();
const dims = ref([]);
const treeData = ref([]);
const loading = ref(false);
async function load() {
    loading.value = true;
    try {
        dims.value = await listDimensions();
        treeData.value = await getDimensionTree();
    }
    catch {
        ElMessage.error('加载维度列表失败');
    }
    finally {
        loading.value = false;
    }
}
// 弹窗
const dialogVisible = ref(false);
const dialogMode = ref('create');
const editId = ref(null);
const form = ref({ dimension_code: '', dimension_name: '', parent_id: undefined, source_dataset_id: undefined, bound_field: '', description: '', display_order: 0 });
const saving = ref(false);
// 数据集下拉（DWD层）
const datasets = ref([]);
const columns = ref([]);
const columnsLoading = ref(false);
function datasetLabel(item) {
    return item.label || item.name || `数据集 #${item.id}`;
}
function fieldLabel(item) {
    const label = item.column_label || item.column_code;
    const code = item.column_code && item.column_code !== label ? ` · ${item.column_code}` : '';
    const type = item.data_type ? ` (${item.data_type})` : '';
    return `${label}${code}${type}`;
}
async function loadDatasets() {
    try {
        const res = await listModels({ page_size: 200, warehouse_layer: 'DWD' });
        datasets.value = res.items;
    }
    catch {
        datasets.value = [];
    }
}
async function loadDatasetFields(datasetId) {
    columns.value = [];
    if (!datasetId)
        return;
    columnsLoading.value = true;
    try {
        const fields = await getOutputFields(datasetId);
        columns.value = (fields || [])
            .filter((f) => f.is_visible !== false)
            .map((f) => ({
            column_code: f.output_code || f.source_column,
            column_label: f.output_label || f.output_code || f.source_column,
            data_type: f.data_type || '',
        }));
        if (!columns.value.length) {
            const model = await getModel(datasetId);
            const tableFields = await Promise.all((model.tables || []).map(async (t) => {
                const res = await listAssetColumns(t.table_name);
                return (res.columns || [])
                    .filter((c) => c.is_visible !== false)
                    .map((c) => ({
                    column_code: c.column_code,
                    column_label: c.column_label || c.column_code,
                    data_type: c.data_type || '',
                }));
            }));
            const seen = new Set();
            columns.value = tableFields.flat().filter((c) => {
                if (!c.column_code || seen.has(c.column_code))
                    return false;
                seen.add(c.column_code);
                return true;
            });
        }
    }
    catch {
        columns.value = [];
    }
    finally {
        columnsLoading.value = false;
    }
}
async function onDatasetChange(datasetId) {
    form.value.source_dataset_id = datasetId;
    form.value.bound_field = '';
    await loadDatasetFields(datasetId);
}
function openCreate(parentId) {
    dialogMode.value = 'create';
    editId.value = null;
    form.value = { dimension_code: '', dimension_name: '', parent_id: parentId, source_dataset_id: undefined, bound_field: '', description: '', display_order: 0 };
    columns.value = [];
    loadDatasets();
    dialogVisible.value = true;
}
async function openEdit(id) {
    const d = dims.value.find(x => x.id === id);
    if (!d)
        return;
    dialogMode.value = 'edit';
    editId.value = id;
    form.value = { dimension_code: d.dimension_code, dimension_name: d.dimension_name, parent_id: d.parent_id ?? undefined, source_dataset_id: d.source_dataset_id ?? undefined, bound_field: d.bound_field ?? '', description: d.description ?? '', display_order: d.display_order ?? 0 };
    await loadDatasets();
    if (d.source_dataset_id)
        await loadDatasetFields(d.source_dataset_id);
    dialogVisible.value = true;
}
async function save() {
    saving.value = true;
    try {
        if (dialogMode.value === 'create') {
            await createDimension(form.value);
            ElMessage.success('维度已创建');
        }
        else {
            const { dimension_code, ...payload } = form.value;
            await updateDimension(editId.value, payload);
            ElMessage.success('维度已更新');
        }
        dialogVisible.value = false;
        load();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '保存失败');
    }
    finally {
        saving.value = false;
    }
}
async function doDelete(id) {
    try {
        const impact = await getDimensionImpact(id);
        if (!impact.can_delete) {
            const refs = impact.referenced_by_aggregates.map((a) => a.name).join(', ');
            ElMessage.warning(`该维度被聚合定义引用（${refs}），无法删除`);
            return;
        }
        if (impact.referenced_by_children.length > 0) {
            await ElMessageBox.confirm(`该维度下有 ${impact.referenced_by_children.length} 个子维度，删除后子维度将成为根节点。确定删除？`, '确认删除', { type: 'warning' });
        }
        else {
            await ElMessageBox.confirm('确定删除该维度？', '确认删除', { type: 'warning' });
        }
        await deleteDimension(id);
        ElMessage.success('已删除');
        load();
    }
    catch { /* 取消 */ }
}
onMounted(load);
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
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
const __VLS_0 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Refresh),
}));
const __VLS_2 = __VLS_1({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Refresh),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onClick: (__VLS_ctx.load)
};
__VLS_3.slots.default;
var __VLS_3;
if (__VLS_ctx.userStore.hasOp('warehouse.modeling', 'C')) {
    const __VLS_8 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        ...{ 'onClick': {} },
        type: "primary",
        icon: (__VLS_ctx.Plus),
    }));
    const __VLS_10 = __VLS_9({
        ...{ 'onClick': {} },
        type: "primary",
        icon: (__VLS_ctx.Plus),
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    let __VLS_12;
    let __VLS_13;
    let __VLS_14;
    const __VLS_15 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.userStore.hasOp('warehouse.modeling', 'C')))
                return;
            __VLS_ctx.openCreate();
        }
    };
    __VLS_11.slots.default;
    var __VLS_11;
}
const __VLS_16 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    shadow: "never",
}));
const __VLS_18 = __VLS_17({
    shadow: "never",
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
__VLS_19.slots.default;
const __VLS_20 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    data: (__VLS_ctx.treeData),
    border: true,
    stripe: true,
    size: "small",
    emptyText: "暂无维度",
    rowKey: "id",
    treeProps: ({ children: 'children' }),
    defaultExpandAll: true,
}));
const __VLS_22 = __VLS_21({
    data: (__VLS_ctx.treeData),
    border: true,
    stripe: true,
    size: "small",
    emptyText: "暂无维度",
    rowKey: "id",
    treeProps: ({ children: 'children' }),
    defaultExpandAll: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_23.slots.default;
const __VLS_24 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    label: "维度名称",
    minWidth: "200",
}));
const __VLS_26 = __VLS_25({
    label: "维度名称",
    minWidth: "200",
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
__VLS_27.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_27.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: ({ paddingLeft: '4px' }) },
    });
    (row.dimension_name);
}
var __VLS_27;
const __VLS_28 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    prop: "dimension_code",
    label: "编码",
    width: "140",
}));
const __VLS_30 = __VLS_29({
    prop: "dimension_code",
    label: "编码",
    width: "140",
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
const __VLS_32 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    label: "绑定字段",
    width: "200",
}));
const __VLS_34 = __VLS_33({
    label: "绑定字段",
    width: "200",
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
__VLS_35.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_35.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    if (row.source_dataset_id && row.bound_field) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (row.source_dataset_id);
        (row.bound_field);
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
    }
}
var __VLS_35;
const __VLS_36 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
    prop: "description",
    label: "说明",
    minWidth: "120",
    showOverflowTooltip: true,
}));
const __VLS_38 = __VLS_37({
    prop: "description",
    label: "说明",
    minWidth: "120",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
const __VLS_40 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
    prop: "display_order",
    label: "排序",
    width: "60",
    align: "center",
}));
const __VLS_42 = __VLS_41({
    prop: "display_order",
    label: "排序",
    width: "60",
    align: "center",
}, ...__VLS_functionalComponentArgsRest(__VLS_41));
const __VLS_44 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
    label: "操作",
    width: "200",
    fixed: "right",
}));
const __VLS_46 = __VLS_45({
    label: "操作",
    width: "200",
    fixed: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_45));
__VLS_47.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_47.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    if (__VLS_ctx.userStore.hasOp('warehouse.modeling', 'C')) {
        const __VLS_48 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            icon: (__VLS_ctx.Plus),
        }));
        const __VLS_50 = __VLS_49({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            icon: (__VLS_ctx.Plus),
        }, ...__VLS_functionalComponentArgsRest(__VLS_49));
        let __VLS_52;
        let __VLS_53;
        let __VLS_54;
        const __VLS_55 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.userStore.hasOp('warehouse.modeling', 'C')))
                    return;
                __VLS_ctx.openCreate(row.id);
            }
        };
        __VLS_51.slots.default;
        var __VLS_51;
    }
    if (__VLS_ctx.userStore.hasOp('warehouse.modeling', 'U')) {
        const __VLS_56 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            icon: (__VLS_ctx.Edit),
        }));
        const __VLS_58 = __VLS_57({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            icon: (__VLS_ctx.Edit),
        }, ...__VLS_functionalComponentArgsRest(__VLS_57));
        let __VLS_60;
        let __VLS_61;
        let __VLS_62;
        const __VLS_63 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.userStore.hasOp('warehouse.modeling', 'U')))
                    return;
                __VLS_ctx.openEdit(row.id);
            }
        };
        __VLS_59.slots.default;
        var __VLS_59;
    }
    if (__VLS_ctx.userStore.hasOp('warehouse.modeling', 'D')) {
        const __VLS_64 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            type: "danger",
            icon: (__VLS_ctx.Delete),
        }));
        const __VLS_66 = __VLS_65({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            type: "danger",
            icon: (__VLS_ctx.Delete),
        }, ...__VLS_functionalComponentArgsRest(__VLS_65));
        let __VLS_68;
        let __VLS_69;
        let __VLS_70;
        const __VLS_71 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.userStore.hasOp('warehouse.modeling', 'D')))
                    return;
                __VLS_ctx.doDelete(row.id);
            }
        };
        __VLS_67.slots.default;
        var __VLS_67;
    }
}
var __VLS_47;
var __VLS_23;
var __VLS_19;
const __VLS_72 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
    ...{ 'onClose': {} },
    modelValue: (__VLS_ctx.dialogVisible),
    title: (__VLS_ctx.dialogMode === 'create' ? '新建维度' : '编辑维度'),
    width: "500px",
}));
const __VLS_74 = __VLS_73({
    ...{ 'onClose': {} },
    modelValue: (__VLS_ctx.dialogVisible),
    title: (__VLS_ctx.dialogMode === 'create' ? '新建维度' : '编辑维度'),
    width: "500px",
}, ...__VLS_functionalComponentArgsRest(__VLS_73));
let __VLS_76;
let __VLS_77;
let __VLS_78;
const __VLS_79 = {
    onClose: (...[$event]) => {
        __VLS_ctx.editId = null;
    }
};
__VLS_75.slots.default;
if (__VLS_ctx.dialogVisible) {
    const __VLS_80 = {}.ElForm;
    /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
    // @ts-ignore
    const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
        labelWidth: "100px",
        size: "small",
    }));
    const __VLS_82 = __VLS_81({
        labelWidth: "100px",
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_81));
    __VLS_83.slots.default;
    const __VLS_84 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
        label: "维度名称",
        required: true,
    }));
    const __VLS_86 = __VLS_85({
        label: "维度名称",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_85));
    __VLS_87.slots.default;
    const __VLS_88 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
        modelValue: (__VLS_ctx.form.dimension_name),
        maxlength: "128",
    }));
    const __VLS_90 = __VLS_89({
        modelValue: (__VLS_ctx.form.dimension_name),
        maxlength: "128",
    }, ...__VLS_functionalComponentArgsRest(__VLS_89));
    var __VLS_87;
    const __VLS_92 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
        label: "维度编码",
        required: true,
    }));
    const __VLS_94 = __VLS_93({
        label: "维度编码",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_93));
    __VLS_95.slots.default;
    /** @type {[typeof SmartCodeInput, ]} */ ;
    // @ts-ignore
    const __VLS_96 = __VLS_asFunctionalComponent(SmartCodeInput, new SmartCodeInput({
        modelValue: (__VLS_ctx.form.dimension_code),
        label: (__VLS_ctx.form.dimension_name),
        scope: "table",
        editable: (__VLS_ctx.dialogMode !== 'edit'),
    }));
    const __VLS_97 = __VLS_96({
        modelValue: (__VLS_ctx.form.dimension_code),
        label: (__VLS_ctx.form.dimension_name),
        scope: "table",
        editable: (__VLS_ctx.dialogMode !== 'edit'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_96));
    var __VLS_95;
    const __VLS_99 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_100 = __VLS_asFunctionalComponent(__VLS_99, new __VLS_99({
        label: "父维度",
    }));
    const __VLS_101 = __VLS_100({
        label: "父维度",
    }, ...__VLS_functionalComponentArgsRest(__VLS_100));
    __VLS_102.slots.default;
    const __VLS_103 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_104 = __VLS_asFunctionalComponent(__VLS_103, new __VLS_103({
        modelValue: (__VLS_ctx.form.parent_id),
        clearable: true,
        placeholder: "无（根节点）",
        ...{ style: {} },
    }));
    const __VLS_105 = __VLS_104({
        modelValue: (__VLS_ctx.form.parent_id),
        clearable: true,
        placeholder: "无（根节点）",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_104));
    __VLS_106.slots.default;
    for (const [d] of __VLS_getVForSourceType((__VLS_ctx.dims.filter(x => x.id !== __VLS_ctx.editId)))) {
        const __VLS_107 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_108 = __VLS_asFunctionalComponent(__VLS_107, new __VLS_107({
            key: (d.id),
            label: (d.dimension_code + ' - ' + d.dimension_name),
            value: (d.id),
        }));
        const __VLS_109 = __VLS_108({
            key: (d.id),
            label: (d.dimension_code + ' - ' + d.dimension_name),
            value: (d.id),
        }, ...__VLS_functionalComponentArgsRest(__VLS_108));
    }
    var __VLS_106;
    var __VLS_102;
    const __VLS_111 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_112 = __VLS_asFunctionalComponent(__VLS_111, new __VLS_111({
        label: "数据集(DWD)",
    }));
    const __VLS_113 = __VLS_112({
        label: "数据集(DWD)",
    }, ...__VLS_functionalComponentArgsRest(__VLS_112));
    __VLS_114.slots.default;
    const __VLS_115 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_116 = __VLS_asFunctionalComponent(__VLS_115, new __VLS_115({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.form.source_dataset_id),
        clearable: true,
        filterable: true,
        placeholder: "选择DWD数据集",
        ...{ style: {} },
    }));
    const __VLS_117 = __VLS_116({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.form.source_dataset_id),
        clearable: true,
        filterable: true,
        placeholder: "选择DWD数据集",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_116));
    let __VLS_119;
    let __VLS_120;
    let __VLS_121;
    const __VLS_122 = {
        onChange: (__VLS_ctx.onDatasetChange)
    };
    __VLS_118.slots.default;
    for (const [t] of __VLS_getVForSourceType((__VLS_ctx.datasets))) {
        const __VLS_123 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_124 = __VLS_asFunctionalComponent(__VLS_123, new __VLS_123({
            key: (t.id),
            label: (__VLS_ctx.datasetLabel(t)),
            value: (t.id),
        }));
        const __VLS_125 = __VLS_124({
            key: (t.id),
            label: (__VLS_ctx.datasetLabel(t)),
            value: (t.id),
        }, ...__VLS_functionalComponentArgsRest(__VLS_124));
        __VLS_126.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.datasetLabel(t));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
        (t.name);
        var __VLS_126;
    }
    var __VLS_118;
    var __VLS_114;
    const __VLS_127 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_128 = __VLS_asFunctionalComponent(__VLS_127, new __VLS_127({
        label: "绑定字段",
    }));
    const __VLS_129 = __VLS_128({
        label: "绑定字段",
    }, ...__VLS_functionalComponentArgsRest(__VLS_128));
    __VLS_130.slots.default;
    const __VLS_131 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_132 = __VLS_asFunctionalComponent(__VLS_131, new __VLS_131({
        modelValue: (__VLS_ctx.form.bound_field),
        clearable: true,
        filterable: true,
        placeholder: "先选数据集",
        ...{ style: {} },
        loading: (__VLS_ctx.columnsLoading),
        disabled: (!__VLS_ctx.form.source_dataset_id),
    }));
    const __VLS_133 = __VLS_132({
        modelValue: (__VLS_ctx.form.bound_field),
        clearable: true,
        filterable: true,
        placeholder: "先选数据集",
        ...{ style: {} },
        loading: (__VLS_ctx.columnsLoading),
        disabled: (!__VLS_ctx.form.source_dataset_id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_132));
    __VLS_134.slots.default;
    for (const [c] of __VLS_getVForSourceType((__VLS_ctx.columns))) {
        const __VLS_135 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_136 = __VLS_asFunctionalComponent(__VLS_135, new __VLS_135({
            key: (c.column_code),
            label: (__VLS_ctx.fieldLabel(c)),
            value: (c.column_code),
        }));
        const __VLS_137 = __VLS_136({
            key: (c.column_code),
            label: (__VLS_ctx.fieldLabel(c)),
            value: (c.column_code),
        }, ...__VLS_functionalComponentArgsRest(__VLS_136));
    }
    var __VLS_134;
    var __VLS_130;
    const __VLS_139 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_140 = __VLS_asFunctionalComponent(__VLS_139, new __VLS_139({
        label: "说明",
    }));
    const __VLS_141 = __VLS_140({
        label: "说明",
    }, ...__VLS_functionalComponentArgsRest(__VLS_140));
    __VLS_142.slots.default;
    const __VLS_143 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_144 = __VLS_asFunctionalComponent(__VLS_143, new __VLS_143({
        modelValue: (__VLS_ctx.form.description),
        type: "textarea",
        rows: (2),
    }));
    const __VLS_145 = __VLS_144({
        modelValue: (__VLS_ctx.form.description),
        type: "textarea",
        rows: (2),
    }, ...__VLS_functionalComponentArgsRest(__VLS_144));
    var __VLS_142;
    const __VLS_147 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_148 = __VLS_asFunctionalComponent(__VLS_147, new __VLS_147({
        label: "排序",
    }));
    const __VLS_149 = __VLS_148({
        label: "排序",
    }, ...__VLS_functionalComponentArgsRest(__VLS_148));
    __VLS_150.slots.default;
    const __VLS_151 = {}.ElInputNumber;
    /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
    // @ts-ignore
    const __VLS_152 = __VLS_asFunctionalComponent(__VLS_151, new __VLS_151({
        modelValue: (__VLS_ctx.form.display_order),
        min: (0),
        ...{ style: {} },
    }));
    const __VLS_153 = __VLS_152({
        modelValue: (__VLS_ctx.form.display_order),
        min: (0),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_152));
    var __VLS_150;
    var __VLS_83;
}
{
    const { footer: __VLS_thisSlot } = __VLS_75.slots;
    const __VLS_155 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_156 = __VLS_asFunctionalComponent(__VLS_155, new __VLS_155({
        ...{ 'onClick': {} },
    }));
    const __VLS_157 = __VLS_156({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_156));
    let __VLS_159;
    let __VLS_160;
    let __VLS_161;
    const __VLS_162 = {
        onClick: (...[$event]) => {
            __VLS_ctx.dialogVisible = false;
        }
    };
    __VLS_158.slots.default;
    var __VLS_158;
    const __VLS_163 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_164 = __VLS_asFunctionalComponent(__VLS_163, new __VLS_163({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
    }));
    const __VLS_165 = __VLS_164({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_164));
    let __VLS_167;
    let __VLS_168;
    let __VLS_169;
    const __VLS_170 = {
        onClick: (__VLS_ctx.save)
    };
    __VLS_166.slots.default;
    var __VLS_166;
}
var __VLS_75;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Plus: Plus,
            Edit: Edit,
            Delete: Delete,
            Refresh: Refresh,
            SmartCodeInput: SmartCodeInput,
            userStore: userStore,
            dims: dims,
            treeData: treeData,
            loading: loading,
            load: load,
            dialogVisible: dialogVisible,
            dialogMode: dialogMode,
            editId: editId,
            form: form,
            saving: saving,
            datasets: datasets,
            columns: columns,
            columnsLoading: columnsLoading,
            datasetLabel: datasetLabel,
            fieldLabel: fieldLabel,
            onDatasetChange: onDatasetChange,
            openCreate: openCreate,
            openEdit: openEdit,
            save: save,
            doDelete: doDelete,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
