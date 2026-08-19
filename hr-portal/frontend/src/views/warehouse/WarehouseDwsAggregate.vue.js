/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, ref, watch } from 'vue';
import { useUserStore } from '@/stores/user';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Edit, Delete, Finished, FolderDelete, DataAnalysis, View } from '@element-plus/icons-vue';
import SmartCodeInput from '@/components/common/SmartCodeInput.vue';
import { listDwsAggregates, createDwsAggregate, updateDwsAggregate, deleteDwsAggregate, publishDwsAggregate, archiveDwsAggregate, generateDwsView, getDwsViewImpact, computeDwsAggregate, validateDwsAggregate, listModels, listDimensions, listMetrics, diagnoseMetric, getOutputFields, } from '@/api/warehouse';
const userStore = useUserStore();
const aggregates = ref([]);
const loading = ref(false);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
// 表单状态必须先于依赖它的 computed/watch 初始化，避免生产压缩后触发 TDZ
const form = ref({
    label: '', name: '', metric_ids: [], source_dataset_id: undefined,
    group_by: [], filter: null,
    time_grain: undefined,
    time_field: undefined,
    measure_semantics: undefined,
    business_definition: '',
});
async function load() {
    loading.value = true;
    try {
        const res = await listDwsAggregates({ page: page.value, page_size: pageSize.value });
        aggregates.value = res.items;
        total.value = res.total;
    }
    catch {
        ElMessage.error('加载聚合定义列表失败');
    }
    finally {
        loading.value = false;
    }
}
// 维度列表（R0312: group_by 从维度目录加载）
const dimensions = ref([]);
async function loadDimensions() {
    try {
        dimensions.value = await listDimensions();
    }
    catch {
        dimensions.value = [];
    }
}
// 严格同源过滤：只显示绑定同数据集的维度
const filteredDimensions = computed(() => form.value.source_dataset_id
    ? dimensions.value.filter(d => d.source_dataset_id === form.value.source_dataset_id)
    : []);
// 数据集下拉（仅 DWD 层）
const datasets = ref([]);
async function loadDatasets() {
    try {
        const res = await listModels({ page_size: 200, warehouse_layer: 'DWD' });
        datasets.value = res.items.map((m) => ({ id: m.id, name: m.label || m.name }));
    }
    catch {
        datasets.value = [];
    }
}
// 数据集输出字段（time_field 下拉来源：仅显示日期/时间类型字段）
const outputFields = ref([]);
const dateFields = computed(() => outputFields.value.filter(f => /date|timestamp|time/i.test(f.data_type) && f.agg_role !== 'measure'));
async function loadOutputFields(datasetId) {
    if (!datasetId) {
        outputFields.value = [];
        return;
    }
    try {
        outputFields.value = await getOutputFields(datasetId);
    }
    catch {
        outputFields.value = [];
    }
}
// 数据集变化时重新加载输出字段
watch(() => form.value.source_dataset_id, (newId) => {
    loadOutputFields(newId);
});
function dimLabel(d) {
    const sid = d.source_dataset_id;
    if (sid && d.bound_field)
        return `${d.dimension_code}（#${sid}.${d.bound_field}）`;
    return `${d.dimension_code}（未绑定）`;
}
// 指标下拉
const metrics = ref([]);
const metricsLoading = ref(false);
const autoDeriving = ref(false);
const filteredMetrics = computed(() => form.value.source_dataset_id
    ? metrics.value.filter(m => m.related_dataset_id === form.value.source_dataset_id)
    : []);
async function loadMetrics() {
    if (metrics.value.length > 0)
        return;
    metricsLoading.value = true;
    try {
        const res = await listMetrics({ page_size: 200 });
        metrics.value = (res.items || []).map((m) => ({
            id: m.id, metric_code: m.metric_code, metric_name: m.metric_name, related_dataset_id: m.related_dataset_id,
        }));
    }
    catch {
        metrics.value = [];
    }
    finally {
        metricsLoading.value = false;
    }
}
// 选指标 → 自动推导 time_grain / group_by / source_dataset_id（基于第一个指标）
async function onMetricChange(metricIds) {
    form.value.metric_ids = metricIds;
    if (!metricIds || metricIds.length === 0)
        return;
    // 仅在从单选过渡到多选且尚未设置源数据集/时间粒度时自动推导
    const firstId = metricIds[0];
    autoDeriving.value = true;
    try {
        const diag = await diagnoseMetric(firstId);
        if (!diag.automatable) {
            ElMessage.warning('该指标暂不支持自动推导: ' + (diag.errors?.[0] || ''));
            return;
        }
        if (diag.time_grain && !form.value.time_grain) {
            form.value.time_grain = diag.time_grain;
        }
        if (diag.dimension_fields?.length) {
            const existing = new Set(form.value.group_by);
            for (const d of diag.dimension_fields) {
                if (d !== 'year' && d !== 'quarter' && d !== 'month')
                    existing.add(d);
            }
            form.value.group_by = [...existing];
        }
        if (!form.value.source_dataset_id && diag.source_dataset_id) {
            form.value.source_dataset_id = diag.source_dataset_id;
            await loadOutputFields(diag.source_dataset_id);
        }
        if (metricIds.length === 1) {
            ElMessage.success('已根据指标自动推导分组参数');
        }
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '指标诊断失败');
    }
    finally {
        autoDeriving.value = false;
    }
}
// 表单弹窗
const dialogVisible = ref(false);
const dialogMode = ref('create');
const editId = ref(null);
const saving = ref(false);
function openCreate() {
    dialogMode.value = 'create';
    editId.value = null;
    form.value = { label: '', name: '', metric_ids: [], source_dataset_id: undefined, group_by: [], filter: null, time_grain: undefined, time_field: undefined, measure_semantics: undefined, business_definition: '' };
    outputFields.value = [];
    loadDatasets();
    loadDimensions();
    loadMetrics();
    dialogVisible.value = true;
}
async function openEdit(id) {
    const a = aggregates.value.find(x => x.id === id);
    if (!a)
        return;
    dialogMode.value = 'edit';
    editId.value = id;
    // 从 measures 或 metric_id 构建 metric_ids 数组
    const metricIds = a.measures && a.measures.length > 0
        ? a.measures.map((m) => m.metric_id)
        : a.metric_id ? [a.metric_id] : [];
    form.value = {
        label: a.label || '', name: a.name, metric_ids: metricIds,
        source_dataset_id: a.source_dataset_id ?? undefined,
        group_by: a.group_by?.slice() || [], filter: a.filter,
        time_grain: a.time_grain ?? undefined,
        time_field: a.time_field ?? undefined,
        measure_semantics: a.measure_semantics ?? undefined,
        business_definition: a.business_definition ?? '',
    };
    await loadDimensions();
    await loadDatasets();
    await loadOutputFields(a.source_dataset_id ?? undefined);
    dialogVisible.value = true;
}
async function save() {
    saving.value = true;
    try {
        // 保存前校验
        const validation = await validateDwsAggregate(form.value);
        if (!validation.valid) {
            ElMessage.warning(validation.errors?.map((e) => e.message).join('；'));
            saving.value = false;
            return;
        }
        if (dialogMode.value === 'create') {
            await createDwsAggregate(form.value);
            ElMessage.success('聚合定义已创建');
        }
        else {
            await updateDwsAggregate(editId.value, form.value);
            ElMessage.success('聚合定义已更新');
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
        await ElMessageBox.confirm('确定删除该聚合定义？', '确认删除', { type: 'warning' });
        await deleteDwsAggregate(id);
        ElMessage.success('已删除');
        load();
    }
    catch { /* 取消 */ }
}
async function doPublish(id) {
    try {
        await publishDwsAggregate(id);
        ElMessage.success('已发布');
        load();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '发布失败');
    }
}
async function doArchive(id) {
    try {
        await archiveDwsAggregate(id);
        ElMessage.success('已归档');
        load();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '归档失败');
    }
}
// R0311: 视图生成
const viewDialogVisible = ref(false);
const viewAggId = ref(null);
const viewLoading = ref(false);
const impact = ref(null);
const viewResult = ref(null);
async function openViewGenerate(id) {
    viewAggId.value = id;
    viewResult.value = null;
    viewLoading.value = true;
    try {
        impact.value = await getDwsViewImpact(id);
    }
    catch {
        impact.value = null;
    }
    finally {
        viewLoading.value = false;
    }
    viewDialogVisible.value = true;
}
async function doGenerateView() {
    if (!viewAggId.value)
        return;
    viewLoading.value = true;
    try {
        viewResult.value = await generateDwsView(viewAggId.value);
        ElMessage.success('DWS 视图已生成');
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '视图生成失败');
    }
    finally {
        viewLoading.value = false;
    }
}
// 多度量计算
const computeDialogVisible = ref(false);
const computeAggId = ref(null);
const computePeriod = ref('');
const computeLoading = ref(false);
const computeResult = ref(null);
function openCompute(id) {
    computeAggId.value = id;
    computePeriod.value = '';
    computeResult.value = null;
    computeDialogVisible.value = true;
}
async function doCompute() {
    if (!computeAggId.value || !computePeriod.value)
        return;
    computeLoading.value = true;
    try {
        computeResult.value = await computeDwsAggregate(computeAggId.value, computePeriod.value);
        ElMessage.success('多度量宽表计算完成');
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '计算失败');
    }
    finally {
        computeLoading.value = false;
    }
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
if (__VLS_ctx.userStore.hasOp('warehouse.modeling', 'C')) {
    const __VLS_0 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        ...{ 'onClick': {} },
        type: "primary",
        icon: (__VLS_ctx.Plus),
    }));
    const __VLS_2 = __VLS_1({
        ...{ 'onClick': {} },
        type: "primary",
        icon: (__VLS_ctx.Plus),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    let __VLS_4;
    let __VLS_5;
    let __VLS_6;
    const __VLS_7 = {
        onClick: (__VLS_ctx.openCreate)
    };
    __VLS_3.slots.default;
    var __VLS_3;
}
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
const __VLS_12 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    data: (__VLS_ctx.aggregates),
    border: true,
    stripe: true,
    size: "small",
    emptyText: "暂无聚合定义",
}));
const __VLS_14 = __VLS_13({
    data: (__VLS_ctx.aggregates),
    border: true,
    stripe: true,
    size: "small",
    emptyText: "暂无聚合定义",
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_15.slots.default;
const __VLS_16 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    label: "名称",
    minWidth: "160",
}));
const __VLS_18 = __VLS_17({
    label: "名称",
    minWidth: "160",
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
__VLS_19.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_19.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (row.label || row.name);
    if (row.measures && row.measures.length >= 2) {
        const __VLS_20 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
            size: "small",
            type: "info",
            ...{ style: {} },
        }));
        const __VLS_22 = __VLS_21({
            size: "small",
            type: "info",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_21));
        __VLS_23.slots.default;
        (row.measures.length);
        var __VLS_23;
    }
}
var __VLS_19;
const __VLS_24 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    prop: "name",
    label: "编码",
    minWidth: "100",
}));
const __VLS_26 = __VLS_25({
    prop: "name",
    label: "编码",
    minWidth: "100",
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
const __VLS_28 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    label: "分组维度",
    minWidth: "160",
}));
const __VLS_30 = __VLS_29({
    label: "分组维度",
    minWidth: "160",
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
__VLS_31.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_31.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    for (const [g] of __VLS_getVForSourceType((row.group_by))) {
        const __VLS_32 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
            key: (g),
            size: "small",
            ...{ style: {} },
        }));
        const __VLS_34 = __VLS_33({
            key: (g),
            size: "small",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_33));
        __VLS_35.slots.default;
        (g);
        var __VLS_35;
    }
}
var __VLS_31;
const __VLS_36 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
    prop: "time_grain",
    label: "时间粒度",
    width: "80",
}));
const __VLS_38 = __VLS_37({
    prop: "time_grain",
    label: "时间粒度",
    width: "80",
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
const __VLS_40 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
    prop: "time_field",
    label: "时间字段",
    width: "100",
}));
const __VLS_42 = __VLS_41({
    prop: "time_field",
    label: "时间字段",
    width: "100",
}, ...__VLS_functionalComponentArgsRest(__VLS_41));
const __VLS_44 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
    label: "度量语义",
    width: "80",
}));
const __VLS_46 = __VLS_45({
    label: "度量语义",
    width: "80",
}, ...__VLS_functionalComponentArgsRest(__VLS_45));
__VLS_47.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_47.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (row.measure_semantics === 'stock' ? '存量' : row.measure_semantics === 'flow' ? '增量' : '');
}
var __VLS_47;
const __VLS_48 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
    prop: "business_definition",
    label: "口径说明",
    minWidth: "120",
    showOverflowTooltip: true,
}));
const __VLS_50 = __VLS_49({
    prop: "business_definition",
    label: "口径说明",
    minWidth: "120",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_49));
const __VLS_52 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
    prop: "status",
    label: "状态",
    width: "80",
}));
const __VLS_54 = __VLS_53({
    prop: "status",
    label: "状态",
    width: "80",
}, ...__VLS_functionalComponentArgsRest(__VLS_53));
__VLS_55.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_55.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_56 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
        size: "small",
        type: (row.status === 'published' ? 'success' : row.status === 'archived' ? 'info' : ''),
    }));
    const __VLS_58 = __VLS_57({
        size: "small",
        type: (row.status === 'published' ? 'success' : row.status === 'archived' ? 'info' : ''),
    }, ...__VLS_functionalComponentArgsRest(__VLS_57));
    __VLS_59.slots.default;
    (row.status === 'draft' ? '草稿' : row.status === 'published' ? '已发布' : '已归档');
    var __VLS_59;
}
var __VLS_55;
const __VLS_60 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
    label: "操作",
    width: "360",
    fixed: "right",
}));
const __VLS_62 = __VLS_61({
    label: "操作",
    width: "360",
    fixed: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_61));
__VLS_63.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_63.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    if (__VLS_ctx.userStore.hasOp('warehouse.modeling', 'C')) {
        const __VLS_64 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            icon: (__VLS_ctx.View),
            type: "primary",
        }));
        const __VLS_66 = __VLS_65({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            icon: (__VLS_ctx.View),
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_65));
        let __VLS_68;
        let __VLS_69;
        let __VLS_70;
        const __VLS_71 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.userStore.hasOp('warehouse.modeling', 'C')))
                    return;
                __VLS_ctx.openViewGenerate(row.id);
            }
        };
        __VLS_67.slots.default;
        var __VLS_67;
    }
    if (row.measures && row.measures.length >= 2 && __VLS_ctx.userStore.hasOp('warehouse.modeling', 'C')) {
        const __VLS_72 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            icon: (__VLS_ctx.DataAnalysis),
            type: "warning",
        }));
        const __VLS_74 = __VLS_73({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            icon: (__VLS_ctx.DataAnalysis),
            type: "warning",
        }, ...__VLS_functionalComponentArgsRest(__VLS_73));
        let __VLS_76;
        let __VLS_77;
        let __VLS_78;
        const __VLS_79 = {
            onClick: (...[$event]) => {
                if (!(row.measures && row.measures.length >= 2 && __VLS_ctx.userStore.hasOp('warehouse.modeling', 'C')))
                    return;
                __VLS_ctx.openCompute(row.id);
            }
        };
        __VLS_75.slots.default;
        var __VLS_75;
    }
    if (__VLS_ctx.userStore.hasOp('warehouse.modeling', 'U')) {
        const __VLS_80 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            icon: (__VLS_ctx.Edit),
        }));
        const __VLS_82 = __VLS_81({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            icon: (__VLS_ctx.Edit),
        }, ...__VLS_functionalComponentArgsRest(__VLS_81));
        let __VLS_84;
        let __VLS_85;
        let __VLS_86;
        const __VLS_87 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.userStore.hasOp('warehouse.modeling', 'U')))
                    return;
                __VLS_ctx.openEdit(row.id);
            }
        };
        __VLS_83.slots.default;
        var __VLS_83;
    }
    if (row.status === 'draft' && __VLS_ctx.userStore.hasOp('warehouse.modeling', 'U')) {
        const __VLS_88 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            type: "success",
            icon: (__VLS_ctx.Finished),
        }));
        const __VLS_90 = __VLS_89({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            type: "success",
            icon: (__VLS_ctx.Finished),
        }, ...__VLS_functionalComponentArgsRest(__VLS_89));
        let __VLS_92;
        let __VLS_93;
        let __VLS_94;
        const __VLS_95 = {
            onClick: (...[$event]) => {
                if (!(row.status === 'draft' && __VLS_ctx.userStore.hasOp('warehouse.modeling', 'U')))
                    return;
                __VLS_ctx.doPublish(row.id);
            }
        };
        __VLS_91.slots.default;
        var __VLS_91;
    }
    if (row.status === 'published' && __VLS_ctx.userStore.hasOp('warehouse.modeling', 'U')) {
        const __VLS_96 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            type: "warning",
            icon: (__VLS_ctx.FolderDelete),
        }));
        const __VLS_98 = __VLS_97({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            type: "warning",
            icon: (__VLS_ctx.FolderDelete),
        }, ...__VLS_functionalComponentArgsRest(__VLS_97));
        let __VLS_100;
        let __VLS_101;
        let __VLS_102;
        const __VLS_103 = {
            onClick: (...[$event]) => {
                if (!(row.status === 'published' && __VLS_ctx.userStore.hasOp('warehouse.modeling', 'U')))
                    return;
                __VLS_ctx.doArchive(row.id);
            }
        };
        __VLS_99.slots.default;
        var __VLS_99;
    }
    if (__VLS_ctx.userStore.hasOp('warehouse.modeling', 'D')) {
        const __VLS_104 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            type: "danger",
            icon: (__VLS_ctx.Delete),
        }));
        const __VLS_106 = __VLS_105({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            type: "danger",
            icon: (__VLS_ctx.Delete),
        }, ...__VLS_functionalComponentArgsRest(__VLS_105));
        let __VLS_108;
        let __VLS_109;
        let __VLS_110;
        const __VLS_111 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.userStore.hasOp('warehouse.modeling', 'D')))
                    return;
                __VLS_ctx.doDelete(row.id);
            }
        };
        __VLS_107.slots.default;
        var __VLS_107;
    }
}
var __VLS_63;
var __VLS_15;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
const __VLS_112 = {}.ElPagination;
/** @type {[typeof __VLS_components.ElPagination, typeof __VLS_components.elPagination, ]} */ ;
// @ts-ignore
const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
    currentPage: (__VLS_ctx.page),
    pageSize: (__VLS_ctx.pageSize),
    total: (__VLS_ctx.total),
    pageSizes: ([20, 50, 100]),
    layout: "total,sizes,prev,pager,next",
}));
const __VLS_114 = __VLS_113({
    currentPage: (__VLS_ctx.page),
    pageSize: (__VLS_ctx.pageSize),
    total: (__VLS_ctx.total),
    pageSizes: ([20, 50, 100]),
    layout: "total,sizes,prev,pager,next",
}, ...__VLS_functionalComponentArgsRest(__VLS_113));
var __VLS_11;
const __VLS_116 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
    ...{ 'onClose': {} },
    modelValue: (__VLS_ctx.dialogVisible),
    title: (__VLS_ctx.dialogMode === 'create' ? '新建聚合定义' : '编辑聚合定义'),
    width: "600px",
}));
const __VLS_118 = __VLS_117({
    ...{ 'onClose': {} },
    modelValue: (__VLS_ctx.dialogVisible),
    title: (__VLS_ctx.dialogMode === 'create' ? '新建聚合定义' : '编辑聚合定义'),
    width: "600px",
}, ...__VLS_functionalComponentArgsRest(__VLS_117));
let __VLS_120;
let __VLS_121;
let __VLS_122;
const __VLS_123 = {
    onClose: (...[$event]) => {
        __VLS_ctx.editId = null;
    }
};
__VLS_119.slots.default;
if (__VLS_ctx.dialogVisible) {
    const __VLS_124 = {}.ElForm;
    /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
    // @ts-ignore
    const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
        labelWidth: "100px",
        size: "small",
    }));
    const __VLS_126 = __VLS_125({
        labelWidth: "100px",
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_125));
    __VLS_127.slots.default;
    const __VLS_128 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
        label: "名称",
        required: true,
    }));
    const __VLS_130 = __VLS_129({
        label: "名称",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_129));
    __VLS_131.slots.default;
    const __VLS_132 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
        modelValue: (__VLS_ctx.form.label),
        placeholder: "聚合展示名称",
    }));
    const __VLS_134 = __VLS_133({
        modelValue: (__VLS_ctx.form.label),
        placeholder: "聚合展示名称",
    }, ...__VLS_functionalComponentArgsRest(__VLS_133));
    var __VLS_131;
    const __VLS_136 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
        label: "编码",
        required: true,
    }));
    const __VLS_138 = __VLS_137({
        label: "编码",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_137));
    __VLS_139.slots.default;
    /** @type {[typeof SmartCodeInput, ]} */ ;
    // @ts-ignore
    const __VLS_140 = __VLS_asFunctionalComponent(SmartCodeInput, new SmartCodeInput({
        modelValue: (__VLS_ctx.form.name),
        label: (__VLS_ctx.form.label),
        scope: "table",
        prefix: "dws_",
    }));
    const __VLS_141 = __VLS_140({
        modelValue: (__VLS_ctx.form.name),
        label: (__VLS_ctx.form.label),
        scope: "table",
        prefix: "dws_",
    }, ...__VLS_functionalComponentArgsRest(__VLS_140));
    var __VLS_139;
    const __VLS_143 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_144 = __VLS_asFunctionalComponent(__VLS_143, new __VLS_143({
        label: "关联指标",
        required: true,
    }));
    const __VLS_145 = __VLS_144({
        label: "关联指标",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_144));
    __VLS_146.slots.default;
    const __VLS_147 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_148 = __VLS_asFunctionalComponent(__VLS_147, new __VLS_147({
        ...{ 'onFocus': {} },
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.form.metric_ids),
        multiple: true,
        filterable: true,
        placeholder: "请选择指标（选1个=单指标，选N个=多度量宽表）",
        ...{ style: {} },
        loading: (__VLS_ctx.metricsLoading),
    }));
    const __VLS_149 = __VLS_148({
        ...{ 'onFocus': {} },
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.form.metric_ids),
        multiple: true,
        filterable: true,
        placeholder: "请选择指标（选1个=单指标，选N个=多度量宽表）",
        ...{ style: {} },
        loading: (__VLS_ctx.metricsLoading),
    }, ...__VLS_functionalComponentArgsRest(__VLS_148));
    let __VLS_151;
    let __VLS_152;
    let __VLS_153;
    const __VLS_154 = {
        onFocus: (__VLS_ctx.loadMetrics)
    };
    const __VLS_155 = {
        onChange: (__VLS_ctx.onMetricChange)
    };
    __VLS_150.slots.default;
    for (const [m] of __VLS_getVForSourceType((__VLS_ctx.filteredMetrics))) {
        const __VLS_156 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_157 = __VLS_asFunctionalComponent(__VLS_156, new __VLS_156({
            key: (m.id),
            label: (`${m.metric_name} (${m.metric_code})`),
            value: (m.id),
        }));
        const __VLS_158 = __VLS_157({
            key: (m.id),
            label: (`${m.metric_name} (${m.metric_code})`),
            value: (m.id),
        }, ...__VLS_functionalComponentArgsRest(__VLS_157));
    }
    var __VLS_150;
    if (__VLS_ctx.autoDeriving) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
    }
    var __VLS_146;
    const __VLS_160 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
        label: "来源数据集",
    }));
    const __VLS_162 = __VLS_161({
        label: "来源数据集",
    }, ...__VLS_functionalComponentArgsRest(__VLS_161));
    __VLS_163.slots.default;
    const __VLS_164 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({
        modelValue: (__VLS_ctx.form.source_dataset_id),
        clearable: true,
        filterable: true,
        placeholder: "由指标自动推导",
        ...{ style: {} },
    }));
    const __VLS_166 = __VLS_165({
        modelValue: (__VLS_ctx.form.source_dataset_id),
        clearable: true,
        filterable: true,
        placeholder: "由指标自动推导",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_165));
    __VLS_167.slots.default;
    for (const [ds] of __VLS_getVForSourceType((__VLS_ctx.datasets))) {
        const __VLS_168 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({
            key: (ds.id),
            label: (`${ds.name} (#${ds.id})`),
            value: (ds.id),
        }));
        const __VLS_170 = __VLS_169({
            key: (ds.id),
            label: (`${ds.name} (#${ds.id})`),
            value: (ds.id),
        }, ...__VLS_functionalComponentArgsRest(__VLS_169));
    }
    var __VLS_167;
    var __VLS_163;
    const __VLS_172 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_173 = __VLS_asFunctionalComponent(__VLS_172, new __VLS_172({
        label: "分组维度",
    }));
    const __VLS_174 = __VLS_173({
        label: "分组维度",
    }, ...__VLS_functionalComponentArgsRest(__VLS_173));
    __VLS_175.slots.default;
    const __VLS_176 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({
        modelValue: (__VLS_ctx.form.group_by),
        multiple: true,
        filterable: true,
        placeholder: "由指标自动推导 + 从维度目录选择",
        ...{ style: {} },
    }));
    const __VLS_178 = __VLS_177({
        modelValue: (__VLS_ctx.form.group_by),
        multiple: true,
        filterable: true,
        placeholder: "由指标自动推导 + 从维度目录选择",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_177));
    __VLS_179.slots.default;
    for (const [d] of __VLS_getVForSourceType((__VLS_ctx.filteredDimensions))) {
        const __VLS_180 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_181 = __VLS_asFunctionalComponent(__VLS_180, new __VLS_180({
            key: (d.dimension_code),
            label: (__VLS_ctx.dimLabel(d)),
            value: (d.dimension_code),
        }));
        const __VLS_182 = __VLS_181({
            key: (d.dimension_code),
            label: (__VLS_ctx.dimLabel(d)),
            value: (d.dimension_code),
        }, ...__VLS_functionalComponentArgsRest(__VLS_181));
        __VLS_183.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (d.dimension_code);
        if (d.bound_table && d.bound_field) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
            (d.bound_table);
            (d.bound_field);
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
        }
        var __VLS_183;
    }
    var __VLS_179;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: {} },
    });
    var __VLS_175;
    const __VLS_184 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_185 = __VLS_asFunctionalComponent(__VLS_184, new __VLS_184({
        label: "时间字段",
    }));
    const __VLS_186 = __VLS_185({
        label: "时间字段",
    }, ...__VLS_functionalComponentArgsRest(__VLS_185));
    __VLS_187.slots.default;
    const __VLS_188 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_189 = __VLS_asFunctionalComponent(__VLS_188, new __VLS_188({
        modelValue: (__VLS_ctx.form.time_field),
        clearable: true,
        filterable: true,
        placeholder: "选择日期类型字段用于时间下钻",
        ...{ style: {} },
    }));
    const __VLS_190 = __VLS_189({
        modelValue: (__VLS_ctx.form.time_field),
        clearable: true,
        filterable: true,
        placeholder: "选择日期类型字段用于时间下钻",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_189));
    __VLS_191.slots.default;
    for (const [f] of __VLS_getVForSourceType((__VLS_ctx.dateFields))) {
        const __VLS_192 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_193 = __VLS_asFunctionalComponent(__VLS_192, new __VLS_192({
            key: (f.output_code),
            label: (`${f.output_label || f.output_code}（${f.data_type}）`),
            value: (f.output_code),
        }));
        const __VLS_194 = __VLS_193({
            key: (f.output_code),
            label: (`${f.output_label || f.output_code}（${f.data_type}）`),
            value: (f.output_code),
        }, ...__VLS_functionalComponentArgsRest(__VLS_193));
    }
    var __VLS_191;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: {} },
    });
    var __VLS_187;
    const __VLS_196 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_197 = __VLS_asFunctionalComponent(__VLS_196, new __VLS_196({
        label: "度量语义",
    }));
    const __VLS_198 = __VLS_197({
        label: "度量语义",
    }, ...__VLS_functionalComponentArgsRest(__VLS_197));
    __VLS_199.slots.default;
    const __VLS_200 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_201 = __VLS_asFunctionalComponent(__VLS_200, new __VLS_200({
        modelValue: (__VLS_ctx.form.measure_semantics),
        clearable: true,
        placeholder: "存量指标选 stock，增量选 flow",
        ...{ style: {} },
    }));
    const __VLS_202 = __VLS_201({
        modelValue: (__VLS_ctx.form.measure_semantics),
        clearable: true,
        placeholder: "存量指标选 stock，增量选 flow",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_201));
    __VLS_203.slots.default;
    const __VLS_204 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_205 = __VLS_asFunctionalComponent(__VLS_204, new __VLS_204({
        label: "存量（期末值）",
        value: "stock",
    }));
    const __VLS_206 = __VLS_205({
        label: "存量（期末值）",
        value: "stock",
    }, ...__VLS_functionalComponentArgsRest(__VLS_205));
    const __VLS_208 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_209 = __VLS_asFunctionalComponent(__VLS_208, new __VLS_208({
        label: "增量（累计值）",
        value: "flow",
    }));
    const __VLS_210 = __VLS_209({
        label: "增量（累计值）",
        value: "flow",
    }, ...__VLS_functionalComponentArgsRest(__VLS_209));
    var __VLS_203;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: {} },
    });
    var __VLS_199;
    const __VLS_212 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_213 = __VLS_asFunctionalComponent(__VLS_212, new __VLS_212({
        label: "口径说明",
    }));
    const __VLS_214 = __VLS_213({
        label: "口径说明",
    }, ...__VLS_functionalComponentArgsRest(__VLS_213));
    __VLS_215.slots.default;
    const __VLS_216 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_217 = __VLS_asFunctionalComponent(__VLS_216, new __VLS_216({
        modelValue: (__VLS_ctx.form.business_definition),
        type: "textarea",
        rows: (2),
        placeholder: "说明该聚合的业务口径",
    }));
    const __VLS_218 = __VLS_217({
        modelValue: (__VLS_ctx.form.business_definition),
        type: "textarea",
        rows: (2),
        placeholder: "说明该聚合的业务口径",
    }, ...__VLS_functionalComponentArgsRest(__VLS_217));
    var __VLS_215;
    var __VLS_127;
}
{
    const { footer: __VLS_thisSlot } = __VLS_119.slots;
    const __VLS_220 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_221 = __VLS_asFunctionalComponent(__VLS_220, new __VLS_220({
        ...{ 'onClick': {} },
    }));
    const __VLS_222 = __VLS_221({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_221));
    let __VLS_224;
    let __VLS_225;
    let __VLS_226;
    const __VLS_227 = {
        onClick: (...[$event]) => {
            __VLS_ctx.dialogVisible = false;
        }
    };
    __VLS_223.slots.default;
    var __VLS_223;
    const __VLS_228 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_229 = __VLS_asFunctionalComponent(__VLS_228, new __VLS_228({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
    }));
    const __VLS_230 = __VLS_229({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_229));
    let __VLS_232;
    let __VLS_233;
    let __VLS_234;
    const __VLS_235 = {
        onClick: (__VLS_ctx.save)
    };
    __VLS_231.slots.default;
    var __VLS_231;
}
var __VLS_119;
const __VLS_236 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_237 = __VLS_asFunctionalComponent(__VLS_236, new __VLS_236({
    modelValue: (__VLS_ctx.viewDialogVisible),
    title: "生成 DWS 逻辑视图",
    width: "650px",
}));
const __VLS_238 = __VLS_237({
    modelValue: (__VLS_ctx.viewDialogVisible),
    title: "生成 DWS 逻辑视图",
    width: "650px",
}, ...__VLS_functionalComponentArgsRest(__VLS_237));
__VLS_239.slots.default;
if (__VLS_ctx.impact) {
    const __VLS_240 = {}.ElDescriptions;
    /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
    // @ts-ignore
    const __VLS_241 = __VLS_asFunctionalComponent(__VLS_240, new __VLS_240({
        column: (2),
        size: "small",
        border: true,
        ...{ style: {} },
    }));
    const __VLS_242 = __VLS_241({
        column: (2),
        size: "small",
        border: true,
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_241));
    __VLS_243.slots.default;
    const __VLS_244 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_245 = __VLS_asFunctionalComponent(__VLS_244, new __VLS_244({
        label: "聚合名称",
    }));
    const __VLS_246 = __VLS_245({
        label: "聚合名称",
    }, ...__VLS_functionalComponentArgsRest(__VLS_245));
    __VLS_247.slots.default;
    (__VLS_ctx.impact.aggregate_name);
    var __VLS_247;
    const __VLS_248 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_249 = __VLS_asFunctionalComponent(__VLS_248, new __VLS_248({
        label: "预计输出字段",
    }));
    const __VLS_250 = __VLS_249({
        label: "预计输出字段",
    }, ...__VLS_functionalComponentArgsRest(__VLS_249));
    __VLS_251.slots.default;
    (__VLS_ctx.impact.estimated_output_fields);
    var __VLS_251;
    var __VLS_243;
    if (__VLS_ctx.impact.warnings?.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        for (const [w] of __VLS_getVForSourceType((__VLS_ctx.impact.warnings))) {
            const __VLS_252 = {}.ElAlert;
            /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
            // @ts-ignore
            const __VLS_253 = __VLS_asFunctionalComponent(__VLS_252, new __VLS_252({
                key: (w),
                title: (w),
                type: "warning",
                showIcon: true,
                closable: (false),
                ...{ style: {} },
            }));
            const __VLS_254 = __VLS_253({
                key: (w),
                title: (w),
                type: "warning",
                showIcon: true,
                closable: (false),
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_253));
        }
    }
    if (__VLS_ctx.impact.dependencies?.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        const __VLS_256 = {}.ElTable;
        /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
        // @ts-ignore
        const __VLS_257 = __VLS_asFunctionalComponent(__VLS_256, new __VLS_256({
            data: (__VLS_ctx.impact.dependencies),
            size: "small",
            border: true,
        }));
        const __VLS_258 = __VLS_257({
            data: (__VLS_ctx.impact.dependencies),
            size: "small",
            border: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_257));
        __VLS_259.slots.default;
        const __VLS_260 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_261 = __VLS_asFunctionalComponent(__VLS_260, new __VLS_260({
            prop: "type",
            label: "类型",
            width: "70",
        }));
        const __VLS_262 = __VLS_261({
            prop: "type",
            label: "类型",
            width: "70",
        }, ...__VLS_functionalComponentArgsRest(__VLS_261));
        const __VLS_264 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_265 = __VLS_asFunctionalComponent(__VLS_264, new __VLS_264({
            prop: "name",
            label: "名称",
            minWidth: "120",
        }));
        const __VLS_266 = __VLS_265({
            prop: "name",
            label: "名称",
            minWidth: "120",
        }, ...__VLS_functionalComponentArgsRest(__VLS_265));
        const __VLS_268 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_269 = __VLS_asFunctionalComponent(__VLS_268, new __VLS_268({
            prop: "status",
            label: "状态",
            width: "80",
        }));
        const __VLS_270 = __VLS_269({
            prop: "status",
            label: "状态",
            width: "80",
        }, ...__VLS_functionalComponentArgsRest(__VLS_269));
        var __VLS_259;
    }
}
if (__VLS_ctx.viewResult) {
    const __VLS_272 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_273 = __VLS_asFunctionalComponent(__VLS_272, new __VLS_272({
        title: "视图生成成功",
        type: "success",
        closable: (false),
        ...{ style: {} },
    }));
    const __VLS_274 = __VLS_273({
        title: "视图生成成功",
        type: "success",
        closable: (false),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_273));
    const __VLS_276 = {}.ElDescriptions;
    /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
    // @ts-ignore
    const __VLS_277 = __VLS_asFunctionalComponent(__VLS_276, new __VLS_276({
        column: (1),
        size: "small",
        border: true,
    }));
    const __VLS_278 = __VLS_277({
        column: (1),
        size: "small",
        border: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_277));
    __VLS_279.slots.default;
    const __VLS_280 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_281 = __VLS_asFunctionalComponent(__VLS_280, new __VLS_280({
        label: "视图名称",
    }));
    const __VLS_282 = __VLS_281({
        label: "视图名称",
    }, ...__VLS_functionalComponentArgsRest(__VLS_281));
    __VLS_283.slots.default;
    (__VLS_ctx.viewResult.view_name);
    var __VLS_283;
    const __VLS_284 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_285 = __VLS_asFunctionalComponent(__VLS_284, new __VLS_284({
        label: "版本",
    }));
    const __VLS_286 = __VLS_285({
        label: "版本",
    }, ...__VLS_functionalComponentArgsRest(__VLS_285));
    __VLS_287.slots.default;
    (__VLS_ctx.viewResult.version);
    var __VLS_287;
    const __VLS_288 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_289 = __VLS_asFunctionalComponent(__VLS_288, new __VLS_288({
        label: "输出字段",
    }));
    const __VLS_290 = __VLS_289({
        label: "输出字段",
    }, ...__VLS_functionalComponentArgsRest(__VLS_289));
    __VLS_291.slots.default;
    (__VLS_ctx.viewResult.output_fields?.join(', '));
    var __VLS_291;
    var __VLS_279;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.pre, __VLS_intrinsicElements.pre)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({});
    (__VLS_ctx.viewResult.sql_summary);
}
{
    const { footer: __VLS_thisSlot } = __VLS_239.slots;
    const __VLS_292 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_293 = __VLS_asFunctionalComponent(__VLS_292, new __VLS_292({
        ...{ 'onClick': {} },
    }));
    const __VLS_294 = __VLS_293({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_293));
    let __VLS_296;
    let __VLS_297;
    let __VLS_298;
    const __VLS_299 = {
        onClick: (...[$event]) => {
            __VLS_ctx.viewDialogVisible = false;
        }
    };
    __VLS_295.slots.default;
    var __VLS_295;
    if (!__VLS_ctx.viewResult) {
        const __VLS_300 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_301 = __VLS_asFunctionalComponent(__VLS_300, new __VLS_300({
            ...{ 'onClick': {} },
            type: "primary",
            icon: (__VLS_ctx.DataAnalysis),
            loading: (__VLS_ctx.viewLoading),
        }));
        const __VLS_302 = __VLS_301({
            ...{ 'onClick': {} },
            type: "primary",
            icon: (__VLS_ctx.DataAnalysis),
            loading: (__VLS_ctx.viewLoading),
        }, ...__VLS_functionalComponentArgsRest(__VLS_301));
        let __VLS_304;
        let __VLS_305;
        let __VLS_306;
        const __VLS_307 = {
            onClick: (__VLS_ctx.doGenerateView)
        };
        __VLS_303.slots.default;
        var __VLS_303;
    }
}
var __VLS_239;
const __VLS_308 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_309 = __VLS_asFunctionalComponent(__VLS_308, new __VLS_308({
    modelValue: (__VLS_ctx.computeDialogVisible),
    title: "多度量宽表计算",
    width: "500px",
}));
const __VLS_310 = __VLS_309({
    modelValue: (__VLS_ctx.computeDialogVisible),
    title: "多度量宽表计算",
    width: "500px",
}, ...__VLS_functionalComponentArgsRest(__VLS_309));
__VLS_311.slots.default;
const __VLS_312 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_313 = __VLS_asFunctionalComponent(__VLS_312, new __VLS_312({
    labelWidth: "80px",
    size: "small",
}));
const __VLS_314 = __VLS_313({
    labelWidth: "80px",
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_313));
__VLS_315.slots.default;
const __VLS_316 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_317 = __VLS_asFunctionalComponent(__VLS_316, new __VLS_316({
    label: "计算周期",
    required: true,
}));
const __VLS_318 = __VLS_317({
    label: "计算周期",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_317));
__VLS_319.slots.default;
const __VLS_320 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_321 = __VLS_asFunctionalComponent(__VLS_320, new __VLS_320({
    modelValue: (__VLS_ctx.computePeriod),
    placeholder: "如 2026-07 / 2026Q3 / 2026H1",
}));
const __VLS_322 = __VLS_321({
    modelValue: (__VLS_ctx.computePeriod),
    placeholder: "如 2026-07 / 2026Q3 / 2026H1",
}, ...__VLS_functionalComponentArgsRest(__VLS_321));
var __VLS_319;
var __VLS_315;
if (__VLS_ctx.computeResult) {
    const __VLS_324 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_325 = __VLS_asFunctionalComponent(__VLS_324, new __VLS_324({
        title: "计算完成",
        type: "success",
        closable: (false),
        ...{ style: {} },
    }));
    const __VLS_326 = __VLS_325({
        title: "计算完成",
        type: "success",
        closable: (false),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_325));
    const __VLS_328 = {}.ElDescriptions;
    /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
    // @ts-ignore
    const __VLS_329 = __VLS_asFunctionalComponent(__VLS_328, new __VLS_328({
        column: (2),
        size: "small",
        border: true,
    }));
    const __VLS_330 = __VLS_329({
        column: (2),
        size: "small",
        border: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_329));
    __VLS_331.slots.default;
    const __VLS_332 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_333 = __VLS_asFunctionalComponent(__VLS_332, new __VLS_332({
        label: "Run ID",
    }));
    const __VLS_334 = __VLS_333({
        label: "Run ID",
    }, ...__VLS_functionalComponentArgsRest(__VLS_333));
    __VLS_335.slots.default;
    (__VLS_ctx.computeResult.run_id);
    var __VLS_335;
    const __VLS_336 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_337 = __VLS_asFunctionalComponent(__VLS_336, new __VLS_336({
        label: "Result ID",
    }));
    const __VLS_338 = __VLS_337({
        label: "Result ID",
    }, ...__VLS_functionalComponentArgsRest(__VLS_337));
    __VLS_339.slots.default;
    (__VLS_ctx.computeResult.result_id);
    var __VLS_339;
    const __VLS_340 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_341 = __VLS_asFunctionalComponent(__VLS_340, new __VLS_340({
        label: "状态",
    }));
    const __VLS_342 = __VLS_341({
        label: "状态",
    }, ...__VLS_functionalComponentArgsRest(__VLS_341));
    __VLS_343.slots.default;
    (__VLS_ctx.computeResult.status);
    var __VLS_343;
    const __VLS_344 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_345 = __VLS_asFunctionalComponent(__VLS_344, new __VLS_344({
        label: "周期",
    }));
    const __VLS_346 = __VLS_345({
        label: "周期",
    }, ...__VLS_functionalComponentArgsRest(__VLS_345));
    __VLS_347.slots.default;
    (__VLS_ctx.computeResult.period);
    var __VLS_347;
    var __VLS_331;
}
{
    const { footer: __VLS_thisSlot } = __VLS_311.slots;
    const __VLS_348 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_349 = __VLS_asFunctionalComponent(__VLS_348, new __VLS_348({
        ...{ 'onClick': {} },
    }));
    const __VLS_350 = __VLS_349({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_349));
    let __VLS_352;
    let __VLS_353;
    let __VLS_354;
    const __VLS_355 = {
        onClick: (...[$event]) => {
            __VLS_ctx.computeDialogVisible = false;
        }
    };
    __VLS_351.slots.default;
    var __VLS_351;
    if (!__VLS_ctx.computeResult) {
        const __VLS_356 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_357 = __VLS_asFunctionalComponent(__VLS_356, new __VLS_356({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.computeLoading),
        }));
        const __VLS_358 = __VLS_357({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.computeLoading),
        }, ...__VLS_functionalComponentArgsRest(__VLS_357));
        let __VLS_360;
        let __VLS_361;
        let __VLS_362;
        const __VLS_363 = {
            onClick: (__VLS_ctx.doCompute)
        };
        __VLS_359.slots.default;
        var __VLS_359;
    }
}
var __VLS_311;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Plus: Plus,
            Edit: Edit,
            Delete: Delete,
            Finished: Finished,
            FolderDelete: FolderDelete,
            DataAnalysis: DataAnalysis,
            View: View,
            SmartCodeInput: SmartCodeInput,
            userStore: userStore,
            aggregates: aggregates,
            loading: loading,
            total: total,
            page: page,
            pageSize: pageSize,
            form: form,
            filteredDimensions: filteredDimensions,
            datasets: datasets,
            dateFields: dateFields,
            dimLabel: dimLabel,
            metricsLoading: metricsLoading,
            autoDeriving: autoDeriving,
            filteredMetrics: filteredMetrics,
            loadMetrics: loadMetrics,
            onMetricChange: onMetricChange,
            dialogVisible: dialogVisible,
            dialogMode: dialogMode,
            editId: editId,
            saving: saving,
            openCreate: openCreate,
            openEdit: openEdit,
            save: save,
            doDelete: doDelete,
            doPublish: doPublish,
            doArchive: doArchive,
            viewDialogVisible: viewDialogVisible,
            viewLoading: viewLoading,
            impact: impact,
            viewResult: viewResult,
            openViewGenerate: openViewGenerate,
            doGenerateView: doGenerateView,
            computeDialogVisible: computeDialogVisible,
            computePeriod: computePeriod,
            computeLoading: computeLoading,
            computeResult: computeResult,
            openCompute: openCompute,
            doCompute: doCompute,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
