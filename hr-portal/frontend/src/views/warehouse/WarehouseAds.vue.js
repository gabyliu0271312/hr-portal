/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Edit, Delete, Upload, Warning } from '@element-plus/icons-vue';
import { api } from '@/api/client';
import { useUserStore } from '@/stores/user';
const userStore = useUserStore();
// ════════════════════ 列表视图 ════════════════════
const definitions = ref([]);
const loading = ref(false);
async function load() {
    loading.value = true;
    try {
        const res = await api.get('/warehouse/ads-definitions');
        definitions.value = res.data.items;
    }
    catch {
        definitions.value = [];
    }
    finally {
        loading.value = false;
    }
}
async function doDelete(id) {
    try {
        await ElMessageBox.confirm('确定删除此 ADS 定义？', '确认', { type: 'warning' });
        await api.delete(`/warehouse/ads-definitions/${id}`);
        ElMessage.success('已删除');
        load();
    }
    catch { }
}
// ════════════════════ 向导视图 ════════════════════
const wizardVisible = ref(false);
const editId = ref(null);
const currentStep = ref(1);
const totalSteps = 5;
const saving = ref(false);
// Step 1: 基本信息
const form = ref({
    name: '', description: '', source_type: '', source_id: null,
    subject_area: '', consume_domain: '', owner_name: '',
});
// Step 2: 维度
const dimensionRefs = ref([]);
const availDims = ref([]);
// Step 3: 输出字段
const outputFields = ref([]);
// Step 4: 预设过滤
const presetFilters = ref([]);
// Step 5: 预览
const previewResult = ref(null);
const publishing = ref(false);
const publishTargets = ref(['asset']);
const publishErrors = ref([]);
// 数据源
const sources = ref([]);
async function loadSources() {
    try {
        const res = await api.get('/warehouse/ads-sources');
        sources.value = res.data.sources || [];
    }
    catch {
        sources.value = [];
    }
}
async function loadDimensions() {
    try {
        const res = await api.get('/warehouse/ads-available-dimensions');
        availDims.value = res.data || [];
    }
    catch {
        availDims.value = [];
    }
}
function openWizard(def) {
    loadSources();
    loadDimensions();
    if (def) {
        editId.value = def.id;
        form.value = { name: def.name, description: def.description || '', source_type: def.source_type, source_id: def.source_id, subject_area: def.subject_area || '', consume_domain: def.consume_domain || '', owner_name: def.owner_name || '' };
        dimensionRefs.value = [...(def.dimension_refs || [])];
        outputFields.value = [...(def.output_fields || [])];
        presetFilters.value = [...(def.preset_filters || [])];
        previewResult.value = null;
    }
    else {
        editId.value = null;
        form.value = { name: '', description: '', source_type: 'dws_aggregate', source_id: null, subject_area: '', consume_domain: '', owner_name: '' };
        dimensionRefs.value = [];
        outputFields.value = [];
        presetFilters.value = [];
        previewResult.value = null;
    }
    currentStep.value = 1;
    wizardVisible.value = true;
}
// ── Step 操作 ─────────────────────────────────
function nextStep() {
    if (currentStep.value === 1 && (!form.value.name || !form.value.source_id)) {
        ElMessage.warning('请填写名称和选择来源');
        return;
    }
    if (currentStep.value < totalSteps)
        currentStep.value++;
    if (currentStep.value === 5)
        doPreview();
}
function prevStep() { if (currentStep.value > 1)
    currentStep.value--; }
async function doPreview() {
    // 临时保存获取预览
    if (!editId.value) {
        try {
            const res = await api.post('/warehouse/ads-definitions', {
                ...form.value,
                dimension_refs: dimensionRefs.value,
                output_fields: outputFields.value,
                preset_filters: presetFilters.value.length ? presetFilters.value : null,
            });
            editId.value = res.data.id;
        }
        catch (e) {
            ElMessage.error(e?.response?.data?.detail?.validation_errors?.join('; ') || '保存失败');
            currentStep.value = 4;
            return;
        }
    }
    else {
        try {
            await api.patch(`/warehouse/ads-definitions/${editId.value}`, {
                ...form.value,
                dimension_refs: dimensionRefs.value,
                output_fields: outputFields.value,
                preset_filters: presetFilters.value.length ? presetFilters.value : null,
            });
        }
        catch (e) {
            ElMessage.error(e?.response?.data?.detail || '保存失败');
            currentStep.value = 4;
            return;
        }
    }
    try {
        previewResult.value = (await api.get(`/warehouse/ads-definitions/${editId.value}/preview`)).data;
    }
    catch {
        previewResult.value = { error: true };
    }
}
async function doPublish() {
    if (!editId.value)
        return;
    if (!publishTargets.value.length) {
        ElMessage.warning('请至少选择一个发布目标');
        return;
    }
    publishing.value = true;
    publishErrors.value = [];
    try {
        const res = await api.post(`/warehouse/ads-definitions/${editId.value}/publish`, null, { params: { targets: publishTargets.value } });
        ElMessage.success('发布成功');
        wizardVisible.value = false;
        load();
    }
    catch (e) {
        const detail = e?.response?.data?.detail;
        if (typeof detail === 'string')
            publishErrors.value = [detail];
        else
            publishErrors.value = [JSON.stringify(detail)];
    }
    finally {
        publishing.value = false;
    }
}
async function doUnpublish(def) {
    try {
        await ElMessageBox.confirm('确定撤回发布？', '确认', { type: 'warning' });
        await api.post(`/warehouse/ads-definitions/${def.id}/unpublish`);
        ElMessage.success('已撤回');
        load();
    }
    catch { }
}
// ── 维度管理 ─────────────────────────────────
function addDimRef(dim) {
    if (dimensionRefs.value.some(d => d.code === dim.code))
        return;
    dimensionRefs.value.push({ code: dim.code, name: dim.name, field: dim.bound_field || '', ref_table: dim.bound_table || '' });
}
function removeDimRef(code) {
    dimensionRefs.value = dimensionRefs.value.filter(d => d.code !== code);
}
// ── 输出字段 ─────────────────────────────────
function addField() {
    outputFields.value.push({ source_field: '', output_name: '', output_label: '', data_type: 'string', agg_role: 'dimension', is_sensitive: false });
}
function removeField(idx) { outputFields.value.splice(idx, 1); }
// ── 过滤条件 ─────────────────────────────────
function addFilter() {
    presetFilters.value.push({ field: '', operator: 'eq', value: '' });
}
function removeFilter(idx) { presetFilters.value.splice(idx, 1); }
const filterOperators = [
    { value: 'eq', label: '=' },
    { value: 'ne', label: '!=' },
    { value: 'gt', label: '>' },
    { value: 'lt', label: '<' },
    { value: 'in', label: 'IN' },
    { value: 'like', label: 'LIKE' },
];
// ── 发布目标选项 ─────────────────────────────
const targetOptions = [
    { value: 'asset', label: '数据资产', desc: '进入数据资产目录，可被搜索、查看和权限控制' },
    { value: 'view', label: '数据视图', desc: '生成逻辑视图，供 SQL 查询和 BI 直连' },
    { value: 'api', label: 'API 候选', desc: '注册为 API 暴露候选，供接口管理模块发布' },
    { value: 'push', label: '推送候选', desc: '注册为推送目标候选，供定时推送任务使用' },
];
const consumeDomains = ['BI', 'API', 'push', 'report'];
const subjectAreas = ['组织', '人员', '薪酬', '招聘', '培训', '绩效', '通用'];
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
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.userStore.hasOp('warehouse.modeling', 'C')))
                return;
            __VLS_ctx.openWizard();
        }
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
    data: (__VLS_ctx.definitions),
    border: true,
    stripe: true,
    size: "small",
    emptyText: "暂无 ADS 定义",
}));
const __VLS_14 = __VLS_13({
    data: (__VLS_ctx.definitions),
    border: true,
    stripe: true,
    size: "small",
    emptyText: "暂无 ADS 定义",
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_15.slots.default;
const __VLS_16 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    prop: "name",
    label: "名称",
    minWidth: "160",
}));
const __VLS_18 = __VLS_17({
    prop: "name",
    label: "名称",
    minWidth: "160",
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
const __VLS_20 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    label: "来源",
    width: "160",
}));
const __VLS_22 = __VLS_21({
    label: "来源",
    width: "160",
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
__VLS_23.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_23.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_24 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
        size: "small",
        type: "info",
    }));
    const __VLS_26 = __VLS_25({
        size: "small",
        type: "info",
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
    __VLS_27.slots.default;
    (row.source_type);
    var __VLS_27;
    (row.source_label || row.source_id);
}
var __VLS_23;
const __VLS_28 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    label: "输出字段",
    width: "80",
    align: "center",
}));
const __VLS_30 = __VLS_29({
    label: "输出字段",
    width: "80",
    align: "center",
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
__VLS_31.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_31.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    ((row.output_fields || []).length);
}
var __VLS_31;
const __VLS_32 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    label: "维度",
    width: "60",
    align: "center",
}));
const __VLS_34 = __VLS_33({
    label: "维度",
    width: "60",
    align: "center",
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
__VLS_35.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_35.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    ((row.dimension_refs || []).length);
}
var __VLS_35;
const __VLS_36 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
    prop: "subject_area",
    label: "主题域",
    width: "80",
}));
const __VLS_38 = __VLS_37({
    prop: "subject_area",
    label: "主题域",
    width: "80",
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
const __VLS_40 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
    prop: "consume_domain",
    label: "消费域",
    width: "80",
}));
const __VLS_42 = __VLS_41({
    prop: "consume_domain",
    label: "消费域",
    width: "80",
}, ...__VLS_functionalComponentArgsRest(__VLS_41));
const __VLS_44 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
    label: "状态",
    width: "90",
    align: "center",
}));
const __VLS_46 = __VLS_45({
    label: "状态",
    width: "90",
    align: "center",
}, ...__VLS_functionalComponentArgsRest(__VLS_45));
__VLS_47.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_47.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_48 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
        size: "small",
        type: (row.publish_status === 'published' ? 'success' : 'info'),
    }));
    const __VLS_50 = __VLS_49({
        size: "small",
        type: (row.publish_status === 'published' ? 'success' : 'info'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_49));
    __VLS_51.slots.default;
    (row.publish_status === 'published' ? '已发布' : row.publish_status === 'archived' ? '已归档' : '草稿');
    var __VLS_51;
}
var __VLS_47;
const __VLS_52 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
    label: "发布目标",
    width: "120",
}));
const __VLS_54 = __VLS_53({
    label: "发布目标",
    width: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_53));
__VLS_55.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_55.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    for (const [t] of __VLS_getVForSourceType(((row.publish_targets || [])))) {
        const __VLS_56 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
            key: (t),
            size: "small",
            ...{ style: {} },
        }));
        const __VLS_58 = __VLS_57({
            key: (t),
            size: "small",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_57));
        __VLS_59.slots.default;
        (t);
        var __VLS_59;
    }
    if (!(row.publish_targets || []).length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
    }
}
var __VLS_55;
const __VLS_60 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
    label: "操作",
    width: "200",
    fixed: "right",
}));
const __VLS_62 = __VLS_61({
    label: "操作",
    width: "200",
    fixed: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_61));
__VLS_63.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_63.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_64 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
        icon: (__VLS_ctx.Edit),
    }));
    const __VLS_66 = __VLS_65({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
        icon: (__VLS_ctx.Edit),
    }, ...__VLS_functionalComponentArgsRest(__VLS_65));
    let __VLS_68;
    let __VLS_69;
    let __VLS_70;
    const __VLS_71 = {
        onClick: (...[$event]) => {
            __VLS_ctx.openWizard(row);
        }
    };
    __VLS_67.slots.default;
    var __VLS_67;
    if (row.publish_status === 'published') {
        const __VLS_72 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            type: "warning",
        }));
        const __VLS_74 = __VLS_73({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            type: "warning",
        }, ...__VLS_functionalComponentArgsRest(__VLS_73));
        let __VLS_76;
        let __VLS_77;
        let __VLS_78;
        const __VLS_79 = {
            onClick: (...[$event]) => {
                if (!(row.publish_status === 'published'))
                    return;
                __VLS_ctx.doUnpublish(row);
            }
        };
        __VLS_75.slots.default;
        var __VLS_75;
    }
    const __VLS_80 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
        type: "danger",
        icon: (__VLS_ctx.Delete),
    }));
    const __VLS_82 = __VLS_81({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
        type: "danger",
        icon: (__VLS_ctx.Delete),
    }, ...__VLS_functionalComponentArgsRest(__VLS_81));
    let __VLS_84;
    let __VLS_85;
    let __VLS_86;
    const __VLS_87 = {
        onClick: (...[$event]) => {
            __VLS_ctx.doDelete(row.id);
        }
    };
    __VLS_83.slots.default;
    var __VLS_83;
}
var __VLS_63;
var __VLS_15;
var __VLS_11;
const __VLS_88 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
    ...{ 'onClose': {} },
    modelValue: (__VLS_ctx.wizardVisible),
    title: (__VLS_ctx.editId ? '编辑 ADS' : '新建 ADS 消费资产'),
    width: "780px",
    top: "40px",
}));
const __VLS_90 = __VLS_89({
    ...{ 'onClose': {} },
    modelValue: (__VLS_ctx.wizardVisible),
    title: (__VLS_ctx.editId ? '编辑 ADS' : '新建 ADS 消费资产'),
    width: "780px",
    top: "40px",
}, ...__VLS_functionalComponentArgsRest(__VLS_89));
let __VLS_92;
let __VLS_93;
let __VLS_94;
const __VLS_95 = {
    onClose: (...[$event]) => {
        __VLS_ctx.editId = null;
        __VLS_ctx.previewResult = null;
    }
};
__VLS_91.slots.default;
const __VLS_96 = {}.ElSteps;
/** @type {[typeof __VLS_components.ElSteps, typeof __VLS_components.elSteps, typeof __VLS_components.ElSteps, typeof __VLS_components.elSteps, ]} */ ;
// @ts-ignore
const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
    active: (__VLS_ctx.currentStep - 1),
    finishStatus: "success",
    alignCenter: true,
    ...{ style: {} },
}));
const __VLS_98 = __VLS_97({
    active: (__VLS_ctx.currentStep - 1),
    finishStatus: "success",
    alignCenter: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_97));
__VLS_99.slots.default;
const __VLS_100 = {}.ElStep;
/** @type {[typeof __VLS_components.ElStep, typeof __VLS_components.elStep, ]} */ ;
// @ts-ignore
const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
    title: "基本信息",
}));
const __VLS_102 = __VLS_101({
    title: "基本信息",
}, ...__VLS_functionalComponentArgsRest(__VLS_101));
const __VLS_104 = {}.ElStep;
/** @type {[typeof __VLS_components.ElStep, typeof __VLS_components.elStep, ]} */ ;
// @ts-ignore
const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
    title: "关联维度",
}));
const __VLS_106 = __VLS_105({
    title: "关联维度",
}, ...__VLS_functionalComponentArgsRest(__VLS_105));
const __VLS_108 = {}.ElStep;
/** @type {[typeof __VLS_components.ElStep, typeof __VLS_components.elStep, ]} */ ;
// @ts-ignore
const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
    title: "输出字段",
}));
const __VLS_110 = __VLS_109({
    title: "输出字段",
}, ...__VLS_functionalComponentArgsRest(__VLS_109));
const __VLS_112 = {}.ElStep;
/** @type {[typeof __VLS_components.ElStep, typeof __VLS_components.elStep, ]} */ ;
// @ts-ignore
const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
    title: "预设过滤",
}));
const __VLS_114 = __VLS_113({
    title: "预设过滤",
}, ...__VLS_functionalComponentArgsRest(__VLS_113));
const __VLS_116 = {}.ElStep;
/** @type {[typeof __VLS_components.ElStep, typeof __VLS_components.elStep, ]} */ ;
// @ts-ignore
const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
    title: "预览与发布",
}));
const __VLS_118 = __VLS_117({
    title: "预览与发布",
}, ...__VLS_functionalComponentArgsRest(__VLS_117));
var __VLS_99;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalDirective(__VLS_directives.vShow)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.currentStep === 1) }, null, null);
const __VLS_120 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
    labelWidth: "90px",
    size: "small",
}));
const __VLS_122 = __VLS_121({
    labelWidth: "90px",
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_121));
__VLS_123.slots.default;
const __VLS_124 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
    label: "名称",
    required: true,
}));
const __VLS_126 = __VLS_125({
    label: "名称",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_125));
__VLS_127.slots.default;
const __VLS_128 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
    modelValue: (__VLS_ctx.form.name),
    maxlength: "256",
    placeholder: "如：员工月度薪酬汇总",
}));
const __VLS_130 = __VLS_129({
    modelValue: (__VLS_ctx.form.name),
    maxlength: "256",
    placeholder: "如：员工月度薪酬汇总",
}, ...__VLS_functionalComponentArgsRest(__VLS_129));
var __VLS_127;
const __VLS_132 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
    label: "描述",
}));
const __VLS_134 = __VLS_133({
    label: "描述",
}, ...__VLS_functionalComponentArgsRest(__VLS_133));
__VLS_135.slots.default;
const __VLS_136 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    rows: (2),
}));
const __VLS_138 = __VLS_137({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    rows: (2),
}, ...__VLS_functionalComponentArgsRest(__VLS_137));
var __VLS_135;
const __VLS_140 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
    label: "来源类型",
    required: true,
}));
const __VLS_142 = __VLS_141({
    label: "来源类型",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_141));
__VLS_143.slots.default;
const __VLS_144 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
    modelValue: (__VLS_ctx.form.source_type),
    ...{ style: {} },
}));
const __VLS_146 = __VLS_145({
    modelValue: (__VLS_ctx.form.source_type),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_145));
__VLS_147.slots.default;
const __VLS_148 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
    label: "DWS 聚合",
    value: "dws_aggregate",
}));
const __VLS_150 = __VLS_149({
    label: "DWS 聚合",
    value: "dws_aggregate",
}, ...__VLS_functionalComponentArgsRest(__VLS_149));
const __VLS_152 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
    label: "数据集",
    value: "dataset",
}));
const __VLS_154 = __VLS_153({
    label: "数据集",
    value: "dataset",
}, ...__VLS_functionalComponentArgsRest(__VLS_153));
const __VLS_156 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_157 = __VLS_asFunctionalComponent(__VLS_156, new __VLS_156({
    label: "模型",
    value: "model",
}));
const __VLS_158 = __VLS_157({
    label: "模型",
    value: "model",
}, ...__VLS_functionalComponentArgsRest(__VLS_157));
var __VLS_147;
var __VLS_143;
const __VLS_160 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
    label: "来源",
    required: true,
}));
const __VLS_162 = __VLS_161({
    label: "来源",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_161));
__VLS_163.slots.default;
const __VLS_164 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({
    modelValue: (__VLS_ctx.form.source_id),
    filterable: true,
    placeholder: "选择 DWS 来源",
    ...{ style: {} },
}));
const __VLS_166 = __VLS_165({
    modelValue: (__VLS_ctx.form.source_id),
    filterable: true,
    placeholder: "选择 DWS 来源",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_165));
__VLS_167.slots.default;
for (const [s] of __VLS_getVForSourceType((__VLS_ctx.sources))) {
    const __VLS_168 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({
        key: (s.type + '-' + s.id),
        label: (s.label),
        value: (s.id),
    }));
    const __VLS_170 = __VLS_169({
        key: (s.type + '-' + s.id),
        label: (s.label),
        value: (s.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_169));
}
var __VLS_167;
var __VLS_163;
const __VLS_172 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_173 = __VLS_asFunctionalComponent(__VLS_172, new __VLS_172({
    label: "主题域",
}));
const __VLS_174 = __VLS_173({
    label: "主题域",
}, ...__VLS_functionalComponentArgsRest(__VLS_173));
__VLS_175.slots.default;
const __VLS_176 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({
    modelValue: (__VLS_ctx.form.subject_area),
    clearable: true,
    ...{ style: {} },
}));
const __VLS_178 = __VLS_177({
    modelValue: (__VLS_ctx.form.subject_area),
    clearable: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_177));
__VLS_179.slots.default;
for (const [a] of __VLS_getVForSourceType((__VLS_ctx.subjectAreas))) {
    const __VLS_180 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_181 = __VLS_asFunctionalComponent(__VLS_180, new __VLS_180({
        key: (a),
        label: (a),
        value: (a),
    }));
    const __VLS_182 = __VLS_181({
        key: (a),
        label: (a),
        value: (a),
    }, ...__VLS_functionalComponentArgsRest(__VLS_181));
}
var __VLS_179;
var __VLS_175;
const __VLS_184 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_185 = __VLS_asFunctionalComponent(__VLS_184, new __VLS_184({
    label: "消费域",
}));
const __VLS_186 = __VLS_185({
    label: "消费域",
}, ...__VLS_functionalComponentArgsRest(__VLS_185));
__VLS_187.slots.default;
const __VLS_188 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_189 = __VLS_asFunctionalComponent(__VLS_188, new __VLS_188({
    modelValue: (__VLS_ctx.form.consume_domain),
    clearable: true,
    ...{ style: {} },
}));
const __VLS_190 = __VLS_189({
    modelValue: (__VLS_ctx.form.consume_domain),
    clearable: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_189));
__VLS_191.slots.default;
for (const [d] of __VLS_getVForSourceType((__VLS_ctx.consumeDomains))) {
    const __VLS_192 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_193 = __VLS_asFunctionalComponent(__VLS_192, new __VLS_192({
        key: (d),
        label: (d),
        value: (d),
    }));
    const __VLS_194 = __VLS_193({
        key: (d),
        label: (d),
        value: (d),
    }, ...__VLS_functionalComponentArgsRest(__VLS_193));
}
var __VLS_191;
var __VLS_187;
const __VLS_196 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_197 = __VLS_asFunctionalComponent(__VLS_196, new __VLS_196({
    label: "负责人",
}));
const __VLS_198 = __VLS_197({
    label: "负责人",
}, ...__VLS_functionalComponentArgsRest(__VLS_197));
__VLS_199.slots.default;
const __VLS_200 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_201 = __VLS_asFunctionalComponent(__VLS_200, new __VLS_200({
    modelValue: (__VLS_ctx.form.owner_name),
    ...{ style: {} },
}));
const __VLS_202 = __VLS_201({
    modelValue: (__VLS_ctx.form.owner_name),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_201));
var __VLS_199;
var __VLS_123;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalDirective(__VLS_directives.vShow)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.currentStep === 2) }, null, null);
const __VLS_204 = {}.ElAlert;
/** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
// @ts-ignore
const __VLS_205 = __VLS_asFunctionalComponent(__VLS_204, new __VLS_204({
    type: "info",
    closable: (false),
    showIcon: true,
    ...{ style: {} },
}));
const __VLS_206 = __VLS_205({
    type: "info",
    closable: (false),
    showIcon: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_205));
__VLS_207.slots.default;
var __VLS_207;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
for (const [dim] of __VLS_getVForSourceType((__VLS_ctx.availDims))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.addDimRef(dim);
            } },
        key: (dim.code),
        ...{ style: {} },
        ...{ style: ({ background: __VLS_ctx.dimensionRefs.some(d => d.code === dim.code) ? '#ecf5ff' : 'transparent' }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (dim.code);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: {} },
    });
    (dim.name);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: {} },
    });
    (dim.bound_table);
    (dim.bound_field);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
(__VLS_ctx.dimensionRefs.length);
if (!__VLS_ctx.dimensionRefs.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
}
for (const [d, i] of __VLS_getVForSourceType((__VLS_ctx.dimensionRefs))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (d.code),
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    const __VLS_208 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_209 = __VLS_asFunctionalComponent(__VLS_208, new __VLS_208({
        size: "small",
    }));
    const __VLS_210 = __VLS_209({
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_209));
    __VLS_211.slots.default;
    (d.code);
    var __VLS_211;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: {} },
    });
    (d.name);
    const __VLS_212 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_213 = __VLS_asFunctionalComponent(__VLS_212, new __VLS_212({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
        type: "danger",
    }));
    const __VLS_214 = __VLS_213({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
        type: "danger",
    }, ...__VLS_functionalComponentArgsRest(__VLS_213));
    let __VLS_216;
    let __VLS_217;
    let __VLS_218;
    const __VLS_219 = {
        onClick: (...[$event]) => {
            __VLS_ctx.removeDimRef(d.code);
        }
    };
    __VLS_215.slots.default;
    var __VLS_215;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalDirective(__VLS_directives.vShow)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.currentStep === 3) }, null, null);
const __VLS_220 = {}.ElAlert;
/** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
// @ts-ignore
const __VLS_221 = __VLS_asFunctionalComponent(__VLS_220, new __VLS_220({
    type: "info",
    closable: (false),
    showIcon: true,
    ...{ style: {} },
}));
const __VLS_222 = __VLS_221({
    type: "info",
    closable: (false),
    showIcon: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_221));
__VLS_223.slots.default;
var __VLS_223;
for (const [f, i] of __VLS_getVForSourceType((__VLS_ctx.outputFields))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (i),
        ...{ style: {} },
    });
    const __VLS_224 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_225 = __VLS_asFunctionalComponent(__VLS_224, new __VLS_224({
        modelValue: (f.source_field),
        placeholder: "源字段",
        size: "small",
        ...{ style: {} },
    }));
    const __VLS_226 = __VLS_225({
        modelValue: (f.source_field),
        placeholder: "源字段",
        size: "small",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_225));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: {} },
    });
    const __VLS_228 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_229 = __VLS_asFunctionalComponent(__VLS_228, new __VLS_228({
        modelValue: (f.output_name),
        placeholder: "输出字段名",
        size: "small",
        ...{ style: {} },
    }));
    const __VLS_230 = __VLS_229({
        modelValue: (f.output_name),
        placeholder: "输出字段名",
        size: "small",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_229));
    const __VLS_232 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_233 = __VLS_asFunctionalComponent(__VLS_232, new __VLS_232({
        modelValue: (f.output_label),
        placeholder: "显示名",
        size: "small",
        ...{ style: {} },
    }));
    const __VLS_234 = __VLS_233({
        modelValue: (f.output_label),
        placeholder: "显示名",
        size: "small",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_233));
    const __VLS_236 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_237 = __VLS_asFunctionalComponent(__VLS_236, new __VLS_236({
        modelValue: (f.agg_role),
        size: "small",
        ...{ style: {} },
    }));
    const __VLS_238 = __VLS_237({
        modelValue: (f.agg_role),
        size: "small",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_237));
    __VLS_239.slots.default;
    const __VLS_240 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_241 = __VLS_asFunctionalComponent(__VLS_240, new __VLS_240({
        label: "维度",
        value: "dimension",
    }));
    const __VLS_242 = __VLS_241({
        label: "维度",
        value: "dimension",
    }, ...__VLS_functionalComponentArgsRest(__VLS_241));
    const __VLS_244 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_245 = __VLS_asFunctionalComponent(__VLS_244, new __VLS_244({
        label: "度量",
        value: "measure",
    }));
    const __VLS_246 = __VLS_245({
        label: "度量",
        value: "measure",
    }, ...__VLS_functionalComponentArgsRest(__VLS_245));
    const __VLS_248 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_249 = __VLS_asFunctionalComponent(__VLS_248, new __VLS_248({
        label: "属性",
        value: "attribute",
    }));
    const __VLS_250 = __VLS_249({
        label: "属性",
        value: "attribute",
    }, ...__VLS_functionalComponentArgsRest(__VLS_249));
    var __VLS_239;
    const __VLS_252 = {}.ElCheckbox;
    /** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
    // @ts-ignore
    const __VLS_253 = __VLS_asFunctionalComponent(__VLS_252, new __VLS_252({
        modelValue: (f.is_sensitive),
        size: "small",
        title: "敏感字段",
    }));
    const __VLS_254 = __VLS_253({
        modelValue: (f.is_sensitive),
        size: "small",
        title: "敏感字段",
    }, ...__VLS_functionalComponentArgsRest(__VLS_253));
    __VLS_255.slots.default;
    var __VLS_255;
    const __VLS_256 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_257 = __VLS_asFunctionalComponent(__VLS_256, new __VLS_256({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
        type: "danger",
    }));
    const __VLS_258 = __VLS_257({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
        type: "danger",
    }, ...__VLS_functionalComponentArgsRest(__VLS_257));
    let __VLS_260;
    let __VLS_261;
    let __VLS_262;
    const __VLS_263 = {
        onClick: (...[$event]) => {
            __VLS_ctx.removeField(i);
        }
    };
    __VLS_259.slots.default;
    var __VLS_259;
}
const __VLS_264 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_265 = __VLS_asFunctionalComponent(__VLS_264, new __VLS_264({
    ...{ 'onClick': {} },
    size: "small",
    icon: (__VLS_ctx.Plus),
}));
const __VLS_266 = __VLS_265({
    ...{ 'onClick': {} },
    size: "small",
    icon: (__VLS_ctx.Plus),
}, ...__VLS_functionalComponentArgsRest(__VLS_265));
let __VLS_268;
let __VLS_269;
let __VLS_270;
const __VLS_271 = {
    onClick: (__VLS_ctx.addField)
};
__VLS_267.slots.default;
var __VLS_267;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalDirective(__VLS_directives.vShow)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.currentStep === 4) }, null, null);
const __VLS_272 = {}.ElAlert;
/** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
// @ts-ignore
const __VLS_273 = __VLS_asFunctionalComponent(__VLS_272, new __VLS_272({
    type: "info",
    closable: (false),
    showIcon: true,
    ...{ style: {} },
}));
const __VLS_274 = __VLS_273({
    type: "info",
    closable: (false),
    showIcon: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_273));
__VLS_275.slots.default;
var __VLS_275;
for (const [f, i] of __VLS_getVForSourceType((__VLS_ctx.presetFilters))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (i),
        ...{ style: {} },
    });
    const __VLS_276 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_277 = __VLS_asFunctionalComponent(__VLS_276, new __VLS_276({
        modelValue: (f.field),
        placeholder: "字段名",
        size: "small",
        ...{ style: {} },
    }));
    const __VLS_278 = __VLS_277({
        modelValue: (f.field),
        placeholder: "字段名",
        size: "small",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_277));
    const __VLS_280 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_281 = __VLS_asFunctionalComponent(__VLS_280, new __VLS_280({
        modelValue: (f.operator),
        size: "small",
        ...{ style: {} },
    }));
    const __VLS_282 = __VLS_281({
        modelValue: (f.operator),
        size: "small",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_281));
    __VLS_283.slots.default;
    for (const [op] of __VLS_getVForSourceType((__VLS_ctx.filterOperators))) {
        const __VLS_284 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_285 = __VLS_asFunctionalComponent(__VLS_284, new __VLS_284({
            key: (op.value),
            label: (op.label),
            value: (op.value),
        }));
        const __VLS_286 = __VLS_285({
            key: (op.value),
            label: (op.label),
            value: (op.value),
        }, ...__VLS_functionalComponentArgsRest(__VLS_285));
    }
    var __VLS_283;
    const __VLS_288 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_289 = __VLS_asFunctionalComponent(__VLS_288, new __VLS_288({
        modelValue: (f.value),
        placeholder: "值",
        size: "small",
        ...{ style: {} },
    }));
    const __VLS_290 = __VLS_289({
        modelValue: (f.value),
        placeholder: "值",
        size: "small",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_289));
    const __VLS_292 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_293 = __VLS_asFunctionalComponent(__VLS_292, new __VLS_292({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
        type: "danger",
    }));
    const __VLS_294 = __VLS_293({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
        type: "danger",
    }, ...__VLS_functionalComponentArgsRest(__VLS_293));
    let __VLS_296;
    let __VLS_297;
    let __VLS_298;
    const __VLS_299 = {
        onClick: (...[$event]) => {
            __VLS_ctx.removeFilter(i);
        }
    };
    __VLS_295.slots.default;
    var __VLS_295;
}
const __VLS_300 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_301 = __VLS_asFunctionalComponent(__VLS_300, new __VLS_300({
    ...{ 'onClick': {} },
    size: "small",
    icon: (__VLS_ctx.Plus),
    disabled: (__VLS_ctx.presetFilters.length >= 10),
}));
const __VLS_302 = __VLS_301({
    ...{ 'onClick': {} },
    size: "small",
    icon: (__VLS_ctx.Plus),
    disabled: (__VLS_ctx.presetFilters.length >= 10),
}, ...__VLS_functionalComponentArgsRest(__VLS_301));
let __VLS_304;
let __VLS_305;
let __VLS_306;
const __VLS_307 = {
    onClick: (__VLS_ctx.addFilter)
};
__VLS_303.slots.default;
var __VLS_303;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalDirective(__VLS_directives.vShow)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.currentStep === 5) }, null, null);
if (__VLS_ctx.previewResult?.error) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_308 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_309 = __VLS_asFunctionalComponent(__VLS_308, new __VLS_308({
        size: (32),
    }));
    const __VLS_310 = __VLS_309({
        size: (32),
    }, ...__VLS_functionalComponentArgsRest(__VLS_309));
    __VLS_311.slots.default;
    const __VLS_312 = {}.Warning;
    /** @type {[typeof __VLS_components.Warning, ]} */ ;
    // @ts-ignore
    const __VLS_313 = __VLS_asFunctionalComponent(__VLS_312, new __VLS_312({}));
    const __VLS_314 = __VLS_313({}, ...__VLS_functionalComponentArgsRest(__VLS_313));
    var __VLS_311;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
}
else if (__VLS_ctx.previewResult) {
    const __VLS_316 = {}.ElDescriptions;
    /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
    // @ts-ignore
    const __VLS_317 = __VLS_asFunctionalComponent(__VLS_316, new __VLS_316({
        column: (2),
        border: true,
        size: "small",
        ...{ style: {} },
    }));
    const __VLS_318 = __VLS_317({
        column: (2),
        border: true,
        size: "small",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_317));
    __VLS_319.slots.default;
    const __VLS_320 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_321 = __VLS_asFunctionalComponent(__VLS_320, new __VLS_320({
        label: "ADS 名称",
    }));
    const __VLS_322 = __VLS_321({
        label: "ADS 名称",
    }, ...__VLS_functionalComponentArgsRest(__VLS_321));
    __VLS_323.slots.default;
    (__VLS_ctx.previewResult.name);
    var __VLS_323;
    const __VLS_324 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_325 = __VLS_asFunctionalComponent(__VLS_324, new __VLS_324({
        label: "来源",
    }));
    const __VLS_326 = __VLS_325({
        label: "来源",
    }, ...__VLS_functionalComponentArgsRest(__VLS_325));
    __VLS_327.slots.default;
    (__VLS_ctx.previewResult.source?.label);
    var __VLS_327;
    const __VLS_328 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_329 = __VLS_asFunctionalComponent(__VLS_328, new __VLS_328({
        label: "输出字段",
    }));
    const __VLS_330 = __VLS_329({
        label: "输出字段",
    }, ...__VLS_functionalComponentArgsRest(__VLS_329));
    __VLS_331.slots.default;
    (__VLS_ctx.previewResult.field_count);
    var __VLS_331;
    const __VLS_332 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_333 = __VLS_asFunctionalComponent(__VLS_332, new __VLS_332({
        label: "关联维度",
    }));
    const __VLS_334 = __VLS_333({
        label: "关联维度",
    }, ...__VLS_functionalComponentArgsRest(__VLS_333));
    __VLS_335.slots.default;
    (__VLS_ctx.previewResult.dimension_count);
    var __VLS_335;
    var __VLS_319;
    if (__VLS_ctx.previewResult.sensitive_fields?.length) {
        const __VLS_336 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_337 = __VLS_asFunctionalComponent(__VLS_336, new __VLS_336({
            type: "warning",
            closable: (false),
            showIcon: true,
            ...{ style: {} },
        }));
        const __VLS_338 = __VLS_337({
            type: "warning",
            closable: (false),
            showIcon: true,
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_337));
        __VLS_339.slots.default;
        {
            const { title: __VLS_thisSlot } = __VLS_339.slots;
        }
        (__VLS_ctx.previewResult.sensitive_fields.join(', '));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.br)({});
        var __VLS_339;
    }
    if (__VLS_ctx.previewResult.warnings?.length) {
        const __VLS_340 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_341 = __VLS_asFunctionalComponent(__VLS_340, new __VLS_340({
            type: "warning",
            closable: (false),
            showIcon: true,
            ...{ style: {} },
        }));
        const __VLS_342 = __VLS_341({
            type: "warning",
            closable: (false),
            showIcon: true,
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_341));
        __VLS_343.slots.default;
        {
            const { title: __VLS_thisSlot } = __VLS_343.slots;
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({
            ...{ style: {} },
        });
        for (const [w] of __VLS_getVForSourceType((__VLS_ctx.previewResult.warnings))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({
                key: (w),
            });
            (w);
        }
        var __VLS_343;
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_344 = {}.ElTable;
    /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
    // @ts-ignore
    const __VLS_345 = __VLS_asFunctionalComponent(__VLS_344, new __VLS_344({
        data: (__VLS_ctx.previewResult.output_fields),
        size: "small",
        border: true,
        maxHeight: "200",
    }));
    const __VLS_346 = __VLS_345({
        data: (__VLS_ctx.previewResult.output_fields),
        size: "small",
        border: true,
        maxHeight: "200",
    }, ...__VLS_functionalComponentArgsRest(__VLS_345));
    __VLS_347.slots.default;
    const __VLS_348 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_349 = __VLS_asFunctionalComponent(__VLS_348, new __VLS_348({
        prop: "source_field",
        label: "源字段",
        width: "140",
    }));
    const __VLS_350 = __VLS_349({
        prop: "source_field",
        label: "源字段",
        width: "140",
    }, ...__VLS_functionalComponentArgsRest(__VLS_349));
    const __VLS_352 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_353 = __VLS_asFunctionalComponent(__VLS_352, new __VLS_352({
        prop: "output_name",
        label: "输出名",
        width: "140",
    }));
    const __VLS_354 = __VLS_353({
        prop: "output_name",
        label: "输出名",
        width: "140",
    }, ...__VLS_functionalComponentArgsRest(__VLS_353));
    const __VLS_356 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_357 = __VLS_asFunctionalComponent(__VLS_356, new __VLS_356({
        prop: "output_label",
        label: "显示名",
        width: "120",
    }));
    const __VLS_358 = __VLS_357({
        prop: "output_label",
        label: "显示名",
        width: "120",
    }, ...__VLS_functionalComponentArgsRest(__VLS_357));
    const __VLS_360 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_361 = __VLS_asFunctionalComponent(__VLS_360, new __VLS_360({
        prop: "agg_role",
        label: "角色",
        width: "80",
    }));
    const __VLS_362 = __VLS_361({
        prop: "agg_role",
        label: "角色",
        width: "80",
    }, ...__VLS_functionalComponentArgsRest(__VLS_361));
    const __VLS_364 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_365 = __VLS_asFunctionalComponent(__VLS_364, new __VLS_364({
        label: "敏感",
        width: "60",
        align: "center",
    }));
    const __VLS_366 = __VLS_365({
        label: "敏感",
        width: "60",
        align: "center",
    }, ...__VLS_functionalComponentArgsRest(__VLS_365));
    __VLS_367.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_367.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        if (row.is_sensitive) {
            const __VLS_368 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_369 = __VLS_asFunctionalComponent(__VLS_368, new __VLS_368({
                size: "small",
                type: "danger",
            }));
            const __VLS_370 = __VLS_369({
                size: "small",
                type: "danger",
            }, ...__VLS_functionalComponentArgsRest(__VLS_369));
            __VLS_371.slots.default;
            var __VLS_371;
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
        }
    }
    var __VLS_367;
    var __VLS_347;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    if (__VLS_ctx.publishErrors.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        for (const [err, i] of __VLS_getVForSourceType((__VLS_ctx.publishErrors))) {
            const __VLS_372 = {}.ElAlert;
            /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
            // @ts-ignore
            const __VLS_373 = __VLS_asFunctionalComponent(__VLS_372, new __VLS_372({
                key: (i),
                type: "error",
                closable: (false),
                title: (err),
                ...{ style: {} },
            }));
            const __VLS_374 = __VLS_373({
                key: (i),
                type: "error",
                closable: (false),
                title: (err),
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_373));
        }
    }
    const __VLS_376 = {}.ElCheckboxGroup;
    /** @type {[typeof __VLS_components.ElCheckboxGroup, typeof __VLS_components.elCheckboxGroup, typeof __VLS_components.ElCheckboxGroup, typeof __VLS_components.elCheckboxGroup, ]} */ ;
    // @ts-ignore
    const __VLS_377 = __VLS_asFunctionalComponent(__VLS_376, new __VLS_376({
        modelValue: (__VLS_ctx.publishTargets),
    }));
    const __VLS_378 = __VLS_377({
        modelValue: (__VLS_ctx.publishTargets),
    }, ...__VLS_functionalComponentArgsRest(__VLS_377));
    __VLS_379.slots.default;
    for (const [t] of __VLS_getVForSourceType((__VLS_ctx.targetOptions))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (t.value),
            ...{ style: {} },
        });
        const __VLS_380 = {}.ElCheckbox;
        /** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
        // @ts-ignore
        const __VLS_381 = __VLS_asFunctionalComponent(__VLS_380, new __VLS_380({
            value: (t.value),
            ...{ style: {} },
        }));
        const __VLS_382 = __VLS_381({
            value: (t.value),
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_381));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        (t.label);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        (t.desc);
    }
    var __VLS_379;
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
}
{
    const { footer: __VLS_thisSlot } = __VLS_91.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    if (__VLS_ctx.currentStep === 5 && __VLS_ctx.editId) {
        const __VLS_384 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_385 = __VLS_asFunctionalComponent(__VLS_384, new __VLS_384({
            ...{ 'onClick': {} },
            type: "primary",
            icon: (__VLS_ctx.Upload),
            loading: (__VLS_ctx.publishing),
        }));
        const __VLS_386 = __VLS_385({
            ...{ 'onClick': {} },
            type: "primary",
            icon: (__VLS_ctx.Upload),
            loading: (__VLS_ctx.publishing),
        }, ...__VLS_functionalComponentArgsRest(__VLS_385));
        let __VLS_388;
        let __VLS_389;
        let __VLS_390;
        const __VLS_391 = {
            onClick: (__VLS_ctx.doPublish)
        };
        __VLS_387.slots.default;
        var __VLS_387;
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    const __VLS_392 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_393 = __VLS_asFunctionalComponent(__VLS_392, new __VLS_392({
        ...{ 'onClick': {} },
        disabled: (__VLS_ctx.currentStep === 1),
    }));
    const __VLS_394 = __VLS_393({
        ...{ 'onClick': {} },
        disabled: (__VLS_ctx.currentStep === 1),
    }, ...__VLS_functionalComponentArgsRest(__VLS_393));
    let __VLS_396;
    let __VLS_397;
    let __VLS_398;
    const __VLS_399 = {
        onClick: (__VLS_ctx.prevStep)
    };
    __VLS_395.slots.default;
    var __VLS_395;
    if (__VLS_ctx.currentStep < __VLS_ctx.totalSteps) {
        const __VLS_400 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_401 = __VLS_asFunctionalComponent(__VLS_400, new __VLS_400({
            ...{ 'onClick': {} },
            type: "primary",
        }));
        const __VLS_402 = __VLS_401({
            ...{ 'onClick': {} },
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_401));
        let __VLS_404;
        let __VLS_405;
        let __VLS_406;
        const __VLS_407 = {
            onClick: (__VLS_ctx.nextStep)
        };
        __VLS_403.slots.default;
        var __VLS_403;
    }
    else {
        const __VLS_408 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_409 = __VLS_asFunctionalComponent(__VLS_408, new __VLS_408({
            ...{ 'onClick': {} },
        }));
        const __VLS_410 = __VLS_409({
            ...{ 'onClick': {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_409));
        let __VLS_412;
        let __VLS_413;
        let __VLS_414;
        const __VLS_415 = {
            onClick: (...[$event]) => {
                if (!!(__VLS_ctx.currentStep < __VLS_ctx.totalSteps))
                    return;
                __VLS_ctx.wizardVisible = false;
            }
        };
        __VLS_411.slots.default;
        var __VLS_411;
    }
}
var __VLS_91;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Plus: Plus,
            Edit: Edit,
            Delete: Delete,
            Upload: Upload,
            Warning: Warning,
            userStore: userStore,
            definitions: definitions,
            loading: loading,
            doDelete: doDelete,
            wizardVisible: wizardVisible,
            editId: editId,
            currentStep: currentStep,
            totalSteps: totalSteps,
            form: form,
            dimensionRefs: dimensionRefs,
            availDims: availDims,
            outputFields: outputFields,
            presetFilters: presetFilters,
            previewResult: previewResult,
            publishing: publishing,
            publishTargets: publishTargets,
            publishErrors: publishErrors,
            sources: sources,
            openWizard: openWizard,
            nextStep: nextStep,
            prevStep: prevStep,
            doPublish: doPublish,
            doUnpublish: doUnpublish,
            addDimRef: addDimRef,
            removeDimRef: removeDimRef,
            addField: addField,
            removeField: removeField,
            addFilter: addFilter,
            removeFilter: removeFilter,
            filterOperators: filterOperators,
            targetOptions: targetOptions,
            consumeDomains: consumeDomains,
            subjectAreas: subjectAreas,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
