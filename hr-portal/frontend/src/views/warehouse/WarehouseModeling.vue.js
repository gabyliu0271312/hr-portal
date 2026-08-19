/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Search, Refresh, View, VideoPlay, Finished, Lock, Clock } from '@element-plus/icons-vue';
import { listModels, publishModel, archiveModel, buildDataset } from '@/api/warehouse';
import { api } from '@/api/client';
import { datasetsApi } from '@/api/datasets';
import AclEditor from '@/components/AclEditor.vue';
import ScheduleConfigDialog from '@/components/common/ScheduleConfigDialog.vue';
import { useUserStore } from '@/stores/user';
import WarehouseDimension from './WarehouseDimension.vue';
import WarehouseDwsAggregate from './WarehouseDwsAggregate.vue';
const router = useRouter();
const route = useRoute();
const userStore = useUserStore();
/** tabs: activeTab 支持从 query 参数恢复 */
const tabs = [
    { name: 'modeling', label: '模型设计' },
    { name: 'dimensions', label: '维度管理' },
    { name: 'dws', label: '汇总视图' },
    { name: 'snapshots', label: '快照管理' },
    { name: 'scd', label: '拉链管理' },
];
const activeTab = ref('modeling');
// 从 URL query 恢复 tab 状态
const routeTab = computed(() => route.query.tab || 'modeling');
watch(routeTab, (v) => { if (tabs.some(t => t.name === v))
    activeTab.value = v; }, { immediate: true });
function onTabChange(name) {
    if (name === 'snapshots') {
        router.push('/warehouse/snapshots');
        return;
    }
    if (name === 'scd') {
        router.push('/warehouse/scd');
        return;
    }
    activeTab.value = name;
    router.replace({ query: { tab: name === 'modeling' ? undefined : name } });
}
// ---- 数据建模 tab（原有逻辑） ----
const models = ref([]);
const loading = ref(false);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const keyword = ref('');
const statusFilter = ref('');
const aclVisible = ref(false);
const aclModel = ref(null);
const aclRows = ref([]);
const aclSaving = ref(false);
const STATUS_LABELS = { draft: '草稿', published: '已发布', archived: '已归档' };
const STATUS_TAG = { draft: 'info', published: 'success', archived: 'info' };
const LAYER_LABELS = { ODS: 'ODS', DWD: 'DWD', DWS: 'DWS', ADS: 'ADS' };
const REFRESH_LABELS = { manual: '手动', full: '全量', incremental: '增量' };
const REFRESH_HINTS = {
    manual: '手动触发构建，每次全量重建',
    full: '定时或手动触发，每次全量重建（DROP → CREATE）',
    incremental: '基于表中时间字段，仅追加新数据。无时间字段时自动降级为全量',
};
const refreshStrategies = ref({});
const strategyLoading = ref(new Set());
const buildingIds = ref(new Set());
const buildStatuses = ref({});
// 定时配置
const scheduleVisible = ref(false);
const scheduleKind = ref('dataset_build');
const scheduleBizId = ref(0);
const scheduleBizName = ref('');
const schedulePayload = ref({});
function openSchedule(model) {
    scheduleKind.value = 'dataset_build';
    scheduleBizId.value = model.id;
    scheduleBizName.value = model.label || model.name;
    schedulePayload.value = { dataset_id: model.id };
    scheduleVisible.value = true;
}
async function loadStrategy(datasetId) {
    try {
        const res = await api.get(`/warehouse/datasets/${datasetId}/refresh-strategy`);
        refreshStrategies.value[datasetId] = res.data.refresh_strategy;
    }
    catch { /* ignore */ }
}
async function changeStrategy(datasetId, strategy) {
    if (strategyLoading.value.has(datasetId))
        return;
    strategyLoading.value.add(datasetId);
    try {
        await api.patch(`/warehouse/datasets/${datasetId}/refresh-strategy`, { refresh_strategy: strategy });
        refreshStrategies.value[datasetId] = strategy;
        ElMessage.success('刷新策略已更新');
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '更新失败');
    }
    finally {
        strategyLoading.value.delete(datasetId);
    }
}
async function loadWithStrategies() {
    await load();
    for (const m of models.value)
        loadStrategy(m.id);
}
async function doBuild(model) {
    const id = model.id;
    buildingIds.value.add(id);
    buildStatuses.value[id] = { status: 'running' };
    try {
        const result = await buildDataset(id);
        buildStatuses.value[id] = {
            status: result.status,
            msg: result.status === 'success' ? `输出 ${result.row_count ?? '?'} 行` : (result.error_message || '构建失败'),
        };
        if (result.status === 'success')
            ElMessage.success(`模型「${model.label || model.name}」构建完成`);
        else
            ElMessage.error(buildStatuses.value[id].msg || '构建失败');
    }
    catch (e) {
        buildStatuses.value[id] = { status: 'failed', msg: e?.response?.data?.detail || '构建请求失败' };
        ElMessage.error(buildStatuses.value[id].msg || '构建失败');
    }
    finally {
        buildingIds.value.delete(id);
    }
}
async function load() {
    loading.value = true;
    try {
        const params = { page: page.value, page_size: pageSize.value };
        if (keyword.value)
            params.keyword = keyword.value;
        if (statusFilter.value)
            params.status = statusFilter.value;
        const res = await listModels(params);
        models.value = res.items;
        total.value = res.total;
    }
    catch {
        ElMessage.error('加载模型列表失败');
    }
    finally {
        loading.value = false;
    }
}
function goCreate() { router.push('/warehouse/modeling/visual'); }
function goEdit(id) { router.push(`/warehouse/modeling/visual/${id}`); }
async function openAcl(model) {
    aclModel.value = model;
    aclRows.value = [];
    try {
        const detail = await datasetsApi.get(model.id);
        aclRows.value = detail.acl?.map((a) => ({ id: a.id, role_id: a.role_id, user_id: a.user_id })) || [];
    }
    catch {
        aclRows.value = [];
    }
    aclVisible.value = true;
}
async function saveAcl() {
    if (aclSaving.value)
        return;
    if (!aclModel.value)
        return;
    aclSaving.value = true;
    try {
        await datasetsApi.updateAcl(aclModel.value.id, aclRows.value);
        ElMessage.success('授权已保存');
        aclVisible.value = false;
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '保存失败');
    }
    finally {
        aclSaving.value = false;
    }
}
async function doPublish(model) {
    try {
        await ElMessageBox.confirm(`确定发布模型「${model.label || model.name}」？`, '确认发布', { type: 'info' });
        await publishModel(model.id);
        ElMessage.success('发布成功');
        load();
    }
    catch { /* 取消 */ }
}
async function doArchive(model) {
    try {
        await ElMessageBox.confirm(`归档后该模型将不可用，确定？`, '确认归档', { type: 'warning' });
        await archiveModel(model.id);
        ElMessage.success('已归档');
        load();
    }
    catch { /* 取消 */ }
}
watch([page, pageSize], () => loadWithStrategies());
onMounted(loadWithStrategies);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['tab-item']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-item']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "tab-bar" },
});
for (const [tab] of __VLS_getVForSourceType((__VLS_ctx.tabs))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.onTabChange(tab.name);
            } },
        key: (tab.name),
        ...{ class: "tab-item" },
        ...{ class: ({ active: __VLS_ctx.activeTab === tab.name }) },
    });
    (tab.label);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalDirective(__VLS_directives.vShow)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.activeTab === 'modeling') }, null, null);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
if (__VLS_ctx.userStore.hasOp('warehouse.assets', 'C')) {
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
        onClick: (__VLS_ctx.goCreate)
    };
    __VLS_3.slots.default;
    var __VLS_3;
}
const __VLS_8 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    shadow: "never",
    ...{ style: {} },
}));
const __VLS_10 = __VLS_9({
    shadow: "never",
    ...{ style: {} },
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
    label: "搜索",
}));
const __VLS_18 = __VLS_17({
    label: "搜索",
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
__VLS_19.slots.default;
const __VLS_20 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.keyword),
    placeholder: "模型名称",
    clearable: true,
    ...{ style: {} },
}));
const __VLS_22 = __VLS_21({
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.keyword),
    placeholder: "模型名称",
    clearable: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
let __VLS_24;
let __VLS_25;
let __VLS_26;
const __VLS_27 = {
    onKeyup: (...[$event]) => {
        (__VLS_ctx.page = 1, __VLS_ctx.load());
    }
};
var __VLS_23;
var __VLS_19;
const __VLS_28 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    label: "状态",
}));
const __VLS_30 = __VLS_29({
    label: "状态",
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
__VLS_31.slots.default;
const __VLS_32 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.statusFilter),
    clearable: true,
    placeholder: "全部",
    ...{ style: {} },
}));
const __VLS_34 = __VLS_33({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.statusFilter),
    clearable: true,
    placeholder: "全部",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
let __VLS_36;
let __VLS_37;
let __VLS_38;
const __VLS_39 = {
    onChange: (...[$event]) => {
        (__VLS_ctx.page = 1, __VLS_ctx.load());
    }
};
__VLS_35.slots.default;
const __VLS_40 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
    label: "草稿",
    value: "draft",
}));
const __VLS_42 = __VLS_41({
    label: "草稿",
    value: "draft",
}, ...__VLS_functionalComponentArgsRest(__VLS_41));
const __VLS_44 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
    label: "已发布",
    value: "published",
}));
const __VLS_46 = __VLS_45({
    label: "已发布",
    value: "published",
}, ...__VLS_functionalComponentArgsRest(__VLS_45));
const __VLS_48 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
    label: "已归档",
    value: "archived",
}));
const __VLS_50 = __VLS_49({
    label: "已归档",
    value: "archived",
}, ...__VLS_functionalComponentArgsRest(__VLS_49));
var __VLS_35;
var __VLS_31;
const __VLS_52 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({}));
const __VLS_54 = __VLS_53({}, ...__VLS_functionalComponentArgsRest(__VLS_53));
__VLS_55.slots.default;
const __VLS_56 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
    ...{ 'onClick': {} },
    type: "primary",
    icon: (__VLS_ctx.Search),
    size: "small",
}));
const __VLS_58 = __VLS_57({
    ...{ 'onClick': {} },
    type: "primary",
    icon: (__VLS_ctx.Search),
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_57));
let __VLS_60;
let __VLS_61;
let __VLS_62;
const __VLS_63 = {
    onClick: (...[$event]) => {
        (__VLS_ctx.page = 1, __VLS_ctx.load());
    }
};
__VLS_59.slots.default;
var __VLS_59;
const __VLS_64 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Refresh),
    size: "small",
}));
const __VLS_66 = __VLS_65({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Refresh),
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_65));
let __VLS_68;
let __VLS_69;
let __VLS_70;
const __VLS_71 = {
    onClick: (...[$event]) => {
        (__VLS_ctx.page = 1, __VLS_ctx.keyword = '', __VLS_ctx.statusFilter = '', __VLS_ctx.load());
    }
};
__VLS_67.slots.default;
var __VLS_67;
var __VLS_55;
var __VLS_15;
var __VLS_11;
const __VLS_72 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
    shadow: "never",
}));
const __VLS_74 = __VLS_73({
    shadow: "never",
}, ...__VLS_functionalComponentArgsRest(__VLS_73));
__VLS_75.slots.default;
const __VLS_76 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
    data: (__VLS_ctx.models),
    border: true,
    stripe: true,
    size: "small",
    emptyText: "暂无数据模型",
}));
const __VLS_78 = __VLS_77({
    data: (__VLS_ctx.models),
    border: true,
    stripe: true,
    size: "small",
    emptyText: "暂无数据模型",
}, ...__VLS_functionalComponentArgsRest(__VLS_77));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_79.slots.default;
const __VLS_80 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
    label: "模型名称",
    minWidth: "160",
}));
const __VLS_82 = __VLS_81({
    label: "模型名称",
    minWidth: "160",
}, ...__VLS_functionalComponentArgsRest(__VLS_81));
__VLS_83.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_83.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (row.label || row.name);
}
var __VLS_83;
const __VLS_84 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
    label: "分层",
    width: "100",
}));
const __VLS_86 = __VLS_85({
    label: "分层",
    width: "100",
}, ...__VLS_functionalComponentArgsRest(__VLS_85));
__VLS_87.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_87.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (__VLS_ctx.LAYER_LABELS[row.warehouse_layer] || row.warehouse_layer);
}
var __VLS_87;
const __VLS_88 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
    prop: "subject_area",
    label: "主题域",
    width: "90",
}));
const __VLS_90 = __VLS_89({
    prop: "subject_area",
    label: "主题域",
    width: "90",
}, ...__VLS_functionalComponentArgsRest(__VLS_89));
const __VLS_92 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
    prop: "owner_name",
    label: "负责人",
    width: "90",
}));
const __VLS_94 = __VLS_93({
    prop: "owner_name",
    label: "负责人",
    width: "90",
}, ...__VLS_functionalComponentArgsRest(__VLS_93));
const __VLS_96 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
    prop: "table_count",
    label: "关联表数",
    width: "80",
    align: "center",
}));
const __VLS_98 = __VLS_97({
    prop: "table_count",
    label: "关联表数",
    width: "80",
    align: "center",
}, ...__VLS_functionalComponentArgsRest(__VLS_97));
const __VLS_100 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
    label: "状态",
    width: "80",
    align: "center",
}));
const __VLS_102 = __VLS_101({
    label: "状态",
    width: "80",
    align: "center",
}, ...__VLS_functionalComponentArgsRest(__VLS_101));
__VLS_103.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_103.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_104 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
        size: "small",
        type: (__VLS_ctx.STATUS_TAG[row.status] || 'info'),
    }));
    const __VLS_106 = __VLS_105({
        size: "small",
        type: (__VLS_ctx.STATUS_TAG[row.status] || 'info'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_105));
    __VLS_107.slots.default;
    (__VLS_ctx.STATUS_LABELS[row.status] || row.status);
    var __VLS_107;
}
var __VLS_103;
const __VLS_108 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
    label: "刷新策略",
    width: "120",
    align: "center",
}));
const __VLS_110 = __VLS_109({
    label: "刷新策略",
    width: "120",
    align: "center",
}, ...__VLS_functionalComponentArgsRest(__VLS_109));
__VLS_111.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_111.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_112 = {}.ElTooltip;
    /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
    // @ts-ignore
    const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
        content: (__VLS_ctx.REFRESH_HINTS[__VLS_ctx.refreshStrategies[row.id] || 'manual']),
        placement: "top",
    }));
    const __VLS_114 = __VLS_113({
        content: (__VLS_ctx.REFRESH_HINTS[__VLS_ctx.refreshStrategies[row.id] || 'manual']),
        placement: "top",
    }, ...__VLS_functionalComponentArgsRest(__VLS_113));
    __VLS_115.slots.default;
    if (row.status === 'published') {
        const __VLS_116 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
            ...{ 'onChange': {} },
            modelValue: (__VLS_ctx.refreshStrategies[row.id]),
            size: "small",
            loading: (__VLS_ctx.strategyLoading.has(row.id)),
        }));
        const __VLS_118 = __VLS_117({
            ...{ 'onChange': {} },
            modelValue: (__VLS_ctx.refreshStrategies[row.id]),
            size: "small",
            loading: (__VLS_ctx.strategyLoading.has(row.id)),
        }, ...__VLS_functionalComponentArgsRest(__VLS_117));
        let __VLS_120;
        let __VLS_121;
        let __VLS_122;
        const __VLS_123 = {
            onChange: ((v) => __VLS_ctx.changeStrategy(row.id, v))
        };
        __VLS_119.slots.default;
        const __VLS_124 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
            label: "手动",
            value: "manual",
        }));
        const __VLS_126 = __VLS_125({
            label: "手动",
            value: "manual",
        }, ...__VLS_functionalComponentArgsRest(__VLS_125));
        const __VLS_128 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
            label: "全量",
            value: "full",
        }));
        const __VLS_130 = __VLS_129({
            label: "全量",
            value: "full",
        }, ...__VLS_functionalComponentArgsRest(__VLS_129));
        const __VLS_132 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
            label: "增量",
            value: "incremental",
        }));
        const __VLS_134 = __VLS_133({
            label: "增量",
            value: "incremental",
        }, ...__VLS_functionalComponentArgsRest(__VLS_133));
        var __VLS_119;
    }
    else {
        const __VLS_136 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
            size: "small",
            type: "info",
        }));
        const __VLS_138 = __VLS_137({
            size: "small",
            type: "info",
        }, ...__VLS_functionalComponentArgsRest(__VLS_137));
        __VLS_139.slots.default;
        (__VLS_ctx.REFRESH_LABELS[__VLS_ctx.refreshStrategies[row.id]] || '手动');
        var __VLS_139;
    }
    var __VLS_115;
}
var __VLS_111;
const __VLS_140 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
    label: "版本",
    width: "60",
    align: "center",
}));
const __VLS_142 = __VLS_141({
    label: "版本",
    width: "60",
    align: "center",
}, ...__VLS_functionalComponentArgsRest(__VLS_141));
__VLS_143.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_143.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (row.version || 1);
}
var __VLS_143;
const __VLS_144 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
    label: "操作",
    width: "340",
    fixed: "right",
}));
const __VLS_146 = __VLS_145({
    label: "操作",
    width: "340",
    fixed: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_145));
__VLS_147.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_147.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_148 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
        icon: (__VLS_ctx.View),
    }));
    const __VLS_150 = __VLS_149({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
        icon: (__VLS_ctx.View),
    }, ...__VLS_functionalComponentArgsRest(__VLS_149));
    let __VLS_152;
    let __VLS_153;
    let __VLS_154;
    const __VLS_155 = {
        onClick: (...[$event]) => {
            __VLS_ctx.goEdit(row.id);
        }
    };
    __VLS_151.slots.default;
    var __VLS_151;
    if (__VLS_ctx.userStore.hasOp('warehouse.assets', 'U')) {
        const __VLS_156 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_157 = __VLS_asFunctionalComponent(__VLS_156, new __VLS_156({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            icon: (__VLS_ctx.Lock),
        }));
        const __VLS_158 = __VLS_157({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            icon: (__VLS_ctx.Lock),
        }, ...__VLS_functionalComponentArgsRest(__VLS_157));
        let __VLS_160;
        let __VLS_161;
        let __VLS_162;
        const __VLS_163 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.userStore.hasOp('warehouse.assets', 'U')))
                    return;
                __VLS_ctx.openAcl(row);
            }
        };
        __VLS_159.slots.default;
        var __VLS_159;
    }
    const __VLS_164 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
        icon: (__VLS_ctx.Clock),
    }));
    const __VLS_166 = __VLS_165({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
        icon: (__VLS_ctx.Clock),
    }, ...__VLS_functionalComponentArgsRest(__VLS_165));
    let __VLS_168;
    let __VLS_169;
    let __VLS_170;
    const __VLS_171 = {
        onClick: (...[$event]) => {
            __VLS_ctx.openSchedule(row);
        }
    };
    __VLS_167.slots.default;
    var __VLS_167;
    if (row.status === 'published') {
        const __VLS_172 = {}.ElTooltip;
        /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
        // @ts-ignore
        const __VLS_173 = __VLS_asFunctionalComponent(__VLS_172, new __VLS_172({
            content: (__VLS_ctx.buildStatuses[row.id]?.status === 'failed' ? __VLS_ctx.buildStatuses[row.id]?.msg : __VLS_ctx.buildStatuses[row.id]?.status === 'success' ? __VLS_ctx.buildStatuses[row.id]?.msg : ''),
            disabled: (!__VLS_ctx.buildStatuses[row.id] || __VLS_ctx.buildStatuses[row.id]?.status === 'running'),
            placement: "top",
        }));
        const __VLS_174 = __VLS_173({
            content: (__VLS_ctx.buildStatuses[row.id]?.status === 'failed' ? __VLS_ctx.buildStatuses[row.id]?.msg : __VLS_ctx.buildStatuses[row.id]?.status === 'success' ? __VLS_ctx.buildStatuses[row.id]?.msg : ''),
            disabled: (!__VLS_ctx.buildStatuses[row.id] || __VLS_ctx.buildStatuses[row.id]?.status === 'running'),
            placement: "top",
        }, ...__VLS_functionalComponentArgsRest(__VLS_173));
        __VLS_175.slots.default;
        const __VLS_176 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            icon: (__VLS_ctx.VideoPlay),
            type: (__VLS_ctx.buildStatuses[row.id]?.status === 'success' ? 'success' : __VLS_ctx.buildStatuses[row.id]?.status === 'failed' ? 'danger' : 'primary'),
            loading: (__VLS_ctx.buildingIds.has(row.id)),
        }));
        const __VLS_178 = __VLS_177({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            icon: (__VLS_ctx.VideoPlay),
            type: (__VLS_ctx.buildStatuses[row.id]?.status === 'success' ? 'success' : __VLS_ctx.buildStatuses[row.id]?.status === 'failed' ? 'danger' : 'primary'),
            loading: (__VLS_ctx.buildingIds.has(row.id)),
        }, ...__VLS_functionalComponentArgsRest(__VLS_177));
        let __VLS_180;
        let __VLS_181;
        let __VLS_182;
        const __VLS_183 = {
            onClick: (...[$event]) => {
                if (!(row.status === 'published'))
                    return;
                __VLS_ctx.doBuild(row);
            }
        };
        __VLS_179.slots.default;
        var __VLS_179;
        var __VLS_175;
    }
    else if (row.status === 'draft' && __VLS_ctx.userStore.hasOp('warehouse.assets', 'U')) {
        const __VLS_184 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_185 = __VLS_asFunctionalComponent(__VLS_184, new __VLS_184({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            icon: (__VLS_ctx.Finished),
            type: "success",
        }));
        const __VLS_186 = __VLS_185({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            icon: (__VLS_ctx.Finished),
            type: "success",
        }, ...__VLS_functionalComponentArgsRest(__VLS_185));
        let __VLS_188;
        let __VLS_189;
        let __VLS_190;
        const __VLS_191 = {
            onClick: (...[$event]) => {
                if (!!(row.status === 'published'))
                    return;
                if (!(row.status === 'draft' && __VLS_ctx.userStore.hasOp('warehouse.assets', 'U')))
                    return;
                __VLS_ctx.doPublish(row);
            }
        };
        __VLS_187.slots.default;
        var __VLS_187;
    }
    if (row.status !== 'archived' && __VLS_ctx.userStore.hasOp('warehouse.assets', 'U')) {
        const __VLS_192 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_193 = __VLS_asFunctionalComponent(__VLS_192, new __VLS_192({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            type: "warning",
        }));
        const __VLS_194 = __VLS_193({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            type: "warning",
        }, ...__VLS_functionalComponentArgsRest(__VLS_193));
        let __VLS_196;
        let __VLS_197;
        let __VLS_198;
        const __VLS_199 = {
            onClick: (...[$event]) => {
                if (!(row.status !== 'archived' && __VLS_ctx.userStore.hasOp('warehouse.assets', 'U')))
                    return;
                __VLS_ctx.doArchive(row);
            }
        };
        __VLS_195.slots.default;
        var __VLS_195;
    }
}
var __VLS_147;
var __VLS_79;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
const __VLS_200 = {}.ElPagination;
/** @type {[typeof __VLS_components.ElPagination, typeof __VLS_components.elPagination, ]} */ ;
// @ts-ignore
const __VLS_201 = __VLS_asFunctionalComponent(__VLS_200, new __VLS_200({
    currentPage: (__VLS_ctx.page),
    pageSize: (__VLS_ctx.pageSize),
    total: (__VLS_ctx.total),
    pageSizes: ([20, 50, 100]),
    layout: "total,sizes,prev,pager,next",
}));
const __VLS_202 = __VLS_201({
    currentPage: (__VLS_ctx.page),
    pageSize: (__VLS_ctx.pageSize),
    total: (__VLS_ctx.total),
    pageSizes: ([20, 50, 100]),
    layout: "total,sizes,prev,pager,next",
}, ...__VLS_functionalComponentArgsRest(__VLS_201));
var __VLS_75;
const __VLS_204 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_205 = __VLS_asFunctionalComponent(__VLS_204, new __VLS_204({
    ...{ 'onClose': {} },
    modelValue: (__VLS_ctx.aclVisible),
    title: "访问授权",
    width: "480px",
}));
const __VLS_206 = __VLS_205({
    ...{ 'onClose': {} },
    modelValue: (__VLS_ctx.aclVisible),
    title: "访问授权",
    width: "480px",
}, ...__VLS_functionalComponentArgsRest(__VLS_205));
let __VLS_208;
let __VLS_209;
let __VLS_210;
const __VLS_211 = {
    onClose: (...[$event]) => {
        __VLS_ctx.aclModel = null;
    }
};
__VLS_207.slots.default;
if (__VLS_ctx.aclModel) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ style: {} },
    });
    (__VLS_ctx.aclModel.name);
    /** @type {[typeof AclEditor, ]} */ ;
    // @ts-ignore
    const __VLS_212 = __VLS_asFunctionalComponent(AclEditor, new AclEditor({
        modelValue: (__VLS_ctx.aclRows),
    }));
    const __VLS_213 = __VLS_212({
        modelValue: (__VLS_ctx.aclRows),
    }, ...__VLS_functionalComponentArgsRest(__VLS_212));
}
{
    const { footer: __VLS_thisSlot } = __VLS_207.slots;
    const __VLS_215 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_216 = __VLS_asFunctionalComponent(__VLS_215, new __VLS_215({
        ...{ 'onClick': {} },
    }));
    const __VLS_217 = __VLS_216({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_216));
    let __VLS_219;
    let __VLS_220;
    let __VLS_221;
    const __VLS_222 = {
        onClick: (...[$event]) => {
            __VLS_ctx.aclVisible = false;
        }
    };
    __VLS_218.slots.default;
    var __VLS_218;
    const __VLS_223 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_224 = __VLS_asFunctionalComponent(__VLS_223, new __VLS_223({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.aclSaving),
    }));
    const __VLS_225 = __VLS_224({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.aclSaving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_224));
    let __VLS_227;
    let __VLS_228;
    let __VLS_229;
    const __VLS_230 = {
        onClick: (__VLS_ctx.saveAcl)
    };
    __VLS_226.slots.default;
    var __VLS_226;
}
var __VLS_207;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "tab-content" },
});
__VLS_asFunctionalDirective(__VLS_directives.vShow)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.activeTab === 'dimensions') }, null, null);
/** @type {[typeof WarehouseDimension, ]} */ ;
// @ts-ignore
const __VLS_231 = __VLS_asFunctionalComponent(WarehouseDimension, new WarehouseDimension({}));
const __VLS_232 = __VLS_231({}, ...__VLS_functionalComponentArgsRest(__VLS_231));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "tab-content" },
});
__VLS_asFunctionalDirective(__VLS_directives.vShow)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.activeTab === 'dws') }, null, null);
/** @type {[typeof WarehouseDwsAggregate, ]} */ ;
// @ts-ignore
const __VLS_234 = __VLS_asFunctionalComponent(WarehouseDwsAggregate, new WarehouseDwsAggregate({}));
const __VLS_235 = __VLS_234({}, ...__VLS_functionalComponentArgsRest(__VLS_234));
/** @type {[typeof ScheduleConfigDialog, ]} */ ;
// @ts-ignore
const __VLS_237 = __VLS_asFunctionalComponent(ScheduleConfigDialog, new ScheduleConfigDialog({
    visible: (__VLS_ctx.scheduleVisible),
    kind: (__VLS_ctx.scheduleKind),
    businessId: (__VLS_ctx.scheduleBizId),
    businessName: (__VLS_ctx.scheduleBizName),
    payload: (__VLS_ctx.schedulePayload),
}));
const __VLS_238 = __VLS_237({
    visible: (__VLS_ctx.scheduleVisible),
    kind: (__VLS_ctx.scheduleKind),
    businessId: (__VLS_ctx.scheduleBizId),
    businessName: (__VLS_ctx.scheduleBizName),
    payload: (__VLS_ctx.schedulePayload),
}, ...__VLS_functionalComponentArgsRest(__VLS_237));
/** @type {__VLS_StyleScopedClasses['tab-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-item']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-content']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-content']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Plus: Plus,
            Search: Search,
            Refresh: Refresh,
            View: View,
            VideoPlay: VideoPlay,
            Finished: Finished,
            Lock: Lock,
            Clock: Clock,
            AclEditor: AclEditor,
            ScheduleConfigDialog: ScheduleConfigDialog,
            WarehouseDimension: WarehouseDimension,
            WarehouseDwsAggregate: WarehouseDwsAggregate,
            userStore: userStore,
            tabs: tabs,
            activeTab: activeTab,
            onTabChange: onTabChange,
            models: models,
            loading: loading,
            total: total,
            page: page,
            pageSize: pageSize,
            keyword: keyword,
            statusFilter: statusFilter,
            aclVisible: aclVisible,
            aclModel: aclModel,
            aclRows: aclRows,
            aclSaving: aclSaving,
            STATUS_LABELS: STATUS_LABELS,
            STATUS_TAG: STATUS_TAG,
            LAYER_LABELS: LAYER_LABELS,
            REFRESH_LABELS: REFRESH_LABELS,
            REFRESH_HINTS: REFRESH_HINTS,
            refreshStrategies: refreshStrategies,
            strategyLoading: strategyLoading,
            buildingIds: buildingIds,
            buildStatuses: buildStatuses,
            scheduleVisible: scheduleVisible,
            scheduleKind: scheduleKind,
            scheduleBizId: scheduleBizId,
            scheduleBizName: scheduleBizName,
            schedulePayload: schedulePayload,
            openSchedule: openSchedule,
            changeStrategy: changeStrategy,
            doBuild: doBuild,
            load: load,
            goCreate: goCreate,
            goEdit: goEdit,
            openAcl: openAcl,
            saveAcl: saveAcl,
            doPublish: doPublish,
            doArchive: doArchive,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
