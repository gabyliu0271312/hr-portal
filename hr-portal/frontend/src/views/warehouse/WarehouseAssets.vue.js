/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Search, Refresh, View, Edit, DataAnalysis, Connection, Link, List, ArrowDown, Grid, Menu, Plus } from '@element-plus/icons-vue';
import { listAssets, updateAsset, batchUpdateAssetLayer } from '@/api/warehouse';
import { useUserStore } from '@/stores/user';
import CreateTableDialog from '@/components/data/CreateTableDialog.vue';
import LayerTag from '@/components/warehouse/LayerTag.vue';
import { WAREHOUSE_LAYER_OPTIONS } from '@/constants/warehouseLayers';
const router = useRouter();
const route = useRoute();
const userStore = useUserStore();
const canEditAsset = () => userStore.hasOp('warehouse.assets', 'U');
const viewMode = ref('card');
// 列表
const assets = ref([]);
const loading = ref(false);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
// 筛选
const filters = ref({
    keyword: '',
    warehouse_layer: '',
    subject_area: '',
    source_system: '',
    asset_status: '',
});
// 编辑弹窗
const editVisible = ref(false);
const editAsset = ref(null);
const editForm = ref({ warehouse_layer: '', subject_area: '', owner_name: '', asset_status: '' });
const editSaving = ref(false);
const createDialogRef = ref(null);
const assetTypeFilter = ref('');
const typeOptions = ['', 'table', 'view', 'model', 'metric', 'api'];
const TYPE_LABELS = { table: '数据表', view: '数据视图', model: '数据模型', metric: '指标', api: '数据API' };
const qualityFilter = ref('');
const statusOptions = ['', 'draft', 'published', 'disabled', 'archived'];
const STATUS_LABELS = { draft: '草稿', published: '已发布', disabled: '已禁用', archived: '已归档' };
const QUALITY_LABELS = { unknown: '未知', pass: '通过', warn: '告警', fail: '失败' };
const STATUS_TAG = { draft: 'info', published: 'success', disabled: 'warning', archived: 'info' };
const QUALITY_TAG = { unknown: 'info', pass: 'success', warn: 'warning', fail: 'danger' };
// 批量分层 (Q0105)
const tableSelection = ref([]);
const batchLayerTarget = ref('');
const batchLayerVisible = ref(false);
const batchLayerSaving = ref(false);
const hasSelection = computed(() => tableSelection.value.length > 0);
function openBatchLayer() {
    if (!hasSelection.value) {
        ElMessage.warning('请先选中资产');
        return;
    }
    batchLayerTarget.value = '';
    batchLayerVisible.value = true;
}
async function confirmBatchLayer() {
    if (!batchLayerTarget.value) {
        ElMessage.warning('请选择目标分层');
        return;
    }
    batchLayerSaving.value = true;
    try {
        const names = tableSelection.value.map(a => a.table_name);
        const res = await batchUpdateAssetLayer({ table_names: names, warehouse_layer: batchLayerTarget.value });
        const msg = `成功 ${res.success_count} 项`;
        if (res.fail_count > 0) {
            const fails = res.items.filter(i => !i.success).map(i => `${i.table_name}: ${i.message}`).join('; ');
            ElMessage.warning(`${msg}，失败 ${res.fail_count} 项: ${fails}`);
        }
        else {
            ElMessage.success(msg);
        }
        batchLayerVisible.value = false;
        tableSelection.value = [];
        load();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '批量操作失败');
    }
    finally {
        batchLayerSaving.value = false;
    }
}
function handleTableSelection(val) { tableSelection.value = val; }
async function load() {
    loading.value = true;
    try {
        const params = {
            page: qualityFilter.value ? 1 : page.value,
            page_size: qualityFilter.value ? 200 : pageSize.value,
        };
        if (filters.value.keyword)
            params.keyword = filters.value.keyword;
        if (filters.value.warehouse_layer)
            params.warehouse_layer = filters.value.warehouse_layer;
        if (filters.value.subject_area)
            params.subject_area = filters.value.subject_area;
        if (filters.value.source_system)
            params.source_system = filters.value.source_system;
        if (filters.value.asset_status)
            params.asset_status = filters.value.asset_status;
        const res = await listAssets(params);
        if (qualityFilter.value) {
            const filtered = res.items.filter((a) => a.last_quality_status === qualityFilter.value);
            total.value = filtered.length;
            const start = (page.value - 1) * pageSize.value;
            assets.value = filtered.slice(start, start + pageSize.value);
        }
        else {
            assets.value = res.items;
            total.value = res.total;
        }
    }
    catch {
        ElMessage.error('加载资产列表失败');
    }
    finally {
        loading.value = false;
    }
}
function handleSearch() { page.value = 1; load(); }
function handleReset() {
    filters.value = { keyword: '', warehouse_layer: '', subject_area: '', source_system: '', asset_status: '' };
    qualityFilter.value = '';
    page.value = 1;
    load();
}
function goDetail(tableName) { router.push(`/warehouse/assets/${encodeURIComponent(tableName)}`); }
function goFields(tableName) { router.push(`/warehouse/assets/${encodeURIComponent(tableName)}/columns`); }
function goPreview(tableName) { router.push(`/warehouse/assets/${encodeURIComponent(tableName)}?tab=preview`); }
function goImpact(tableName) { router.push(`/warehouse/impact?table=${encodeURIComponent(tableName)}`); }
function goSource(asset) {
    if (asset.source_system && asset.source_system !== 'internal') {
        router.push('/datasource/endpoints');
    }
    else {
        ElMessage.info('当前资产为内部表 / 手工维护，无需配置外部来源');
    }
}
function openEdit(asset) {
    editAsset.value = asset;
    editForm.value = {
        warehouse_layer: asset.warehouse_layer,
        subject_area: asset.subject_area || '',
        owner_name: asset.owner_name || '',
        asset_status: asset.asset_status,
    };
    editVisible.value = true;
}
async function saveEdit() {
    if (!editAsset.value)
        return;
    editSaving.value = true;
    try {
        await updateAsset(editAsset.value.table_name, {
            warehouse_layer: editForm.value.warehouse_layer,
            subject_area: editForm.value.subject_area || null,
            owner_name: editForm.value.owner_name || null,
            asset_status: editForm.value.asset_status,
        });
        ElMessage.success('保存成功');
        editVisible.value = false;
        load();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '保存失败');
    }
    finally {
        editSaving.value = false;
    }
}
// 卡片：格式化最近同步时间
function formatSyncTime(asset) {
    if (!asset.last_synced_at)
        return '—';
    const d = new Date(asset.last_synced_at);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 3600000)
        return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000)
        return `${Math.floor(diff / 3600000)} 小时前`;
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}
function onCreated() { load(); }
// 从分层概览跳转时自动设置筛选
if (route.query.warehouse_layer) {
    filters.value.warehouse_layer = route.query.warehouse_layer;
}
watch([page, pageSize], () => load());
onMounted(load);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['asset-card']} */ ;
/** @type {__VLS_StyleScopedClasses['card-name']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "warehouse-assets" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "page-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "page-header-right" },
});
if (__VLS_ctx.userStore.hasOp('warehouse.assets', 'C')) {
    const __VLS_0 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        ...{ 'onClick': {} },
        type: "primary",
        size: "small",
        icon: (__VLS_ctx.Plus),
    }));
    const __VLS_2 = __VLS_1({
        ...{ 'onClick': {} },
        type: "primary",
        size: "small",
        icon: (__VLS_ctx.Plus),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    let __VLS_4;
    let __VLS_5;
    let __VLS_6;
    const __VLS_7 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.userStore.hasOp('warehouse.assets', 'C')))
                return;
            __VLS_ctx.createDialogRef?.open();
        }
    };
    __VLS_3.slots.default;
    var __VLS_3;
}
const __VLS_8 = {}.ElRadioGroup;
/** @type {[typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    modelValue: (__VLS_ctx.viewMode),
    size: "small",
}));
const __VLS_10 = __VLS_9({
    modelValue: (__VLS_ctx.viewMode),
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
__VLS_11.slots.default;
const __VLS_12 = {}.ElRadioButton;
/** @type {[typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    value: "card",
}));
const __VLS_14 = __VLS_13({
    value: "card",
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
__VLS_15.slots.default;
const __VLS_16 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({}));
const __VLS_18 = __VLS_17({}, ...__VLS_functionalComponentArgsRest(__VLS_17));
__VLS_19.slots.default;
const __VLS_20 = {}.Grid;
/** @type {[typeof __VLS_components.Grid, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({}));
const __VLS_22 = __VLS_21({}, ...__VLS_functionalComponentArgsRest(__VLS_21));
var __VLS_19;
var __VLS_15;
const __VLS_24 = {}.ElRadioButton;
/** @type {[typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    value: "table",
}));
const __VLS_26 = __VLS_25({
    value: "table",
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
__VLS_27.slots.default;
const __VLS_28 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({}));
const __VLS_30 = __VLS_29({}, ...__VLS_functionalComponentArgsRest(__VLS_29));
__VLS_31.slots.default;
const __VLS_32 = {}.Menu;
/** @type {[typeof __VLS_components.Menu, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({}));
const __VLS_34 = __VLS_33({}, ...__VLS_functionalComponentArgsRest(__VLS_33));
var __VLS_31;
var __VLS_27;
var __VLS_11;
const __VLS_36 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
    ...{ style: {} },
    shadow: "never",
}));
const __VLS_38 = __VLS_37({
    ...{ style: {} },
    shadow: "never",
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
__VLS_39.slots.default;
const __VLS_40 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
    ...{ 'onSubmit': {} },
    inline: (true),
    size: "small",
}));
const __VLS_42 = __VLS_41({
    ...{ 'onSubmit': {} },
    inline: (true),
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_41));
let __VLS_44;
let __VLS_45;
let __VLS_46;
const __VLS_47 = {
    onSubmit: (__VLS_ctx.handleSearch)
};
__VLS_43.slots.default;
const __VLS_48 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
    label: "搜索",
}));
const __VLS_50 = __VLS_49({
    label: "搜索",
}, ...__VLS_functionalComponentArgsRest(__VLS_49));
__VLS_51.slots.default;
const __VLS_52 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.filters.keyword),
    placeholder: "表名 / 显示名 / 描述",
    clearable: true,
    ...{ style: {} },
}));
const __VLS_54 = __VLS_53({
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.filters.keyword),
    placeholder: "表名 / 显示名 / 描述",
    clearable: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_53));
let __VLS_56;
let __VLS_57;
let __VLS_58;
const __VLS_59 = {
    onKeyup: (__VLS_ctx.handleSearch)
};
var __VLS_55;
var __VLS_51;
const __VLS_60 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
    label: "分层",
}));
const __VLS_62 = __VLS_61({
    label: "分层",
}, ...__VLS_functionalComponentArgsRest(__VLS_61));
__VLS_63.slots.default;
const __VLS_64 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.filters.warehouse_layer),
    clearable: true,
    placeholder: "全部",
    ...{ style: {} },
}));
const __VLS_66 = __VLS_65({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.filters.warehouse_layer),
    clearable: true,
    placeholder: "全部",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_65));
let __VLS_68;
let __VLS_69;
let __VLS_70;
const __VLS_71 = {
    onChange: (__VLS_ctx.handleSearch)
};
__VLS_67.slots.default;
for (const [o] of __VLS_getVForSourceType((__VLS_ctx.WAREHOUSE_LAYER_OPTIONS))) {
    const __VLS_72 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
        key: (o.value),
        label: (o.label),
        value: (o.value),
    }));
    const __VLS_74 = __VLS_73({
        key: (o.value),
        label: (o.label),
        value: (o.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_73));
}
var __VLS_67;
var __VLS_63;
const __VLS_76 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
    label: "状态",
}));
const __VLS_78 = __VLS_77({
    label: "状态",
}, ...__VLS_functionalComponentArgsRest(__VLS_77));
__VLS_79.slots.default;
const __VLS_80 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.filters.asset_status),
    clearable: true,
    placeholder: "全部",
    ...{ style: {} },
}));
const __VLS_82 = __VLS_81({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.filters.asset_status),
    clearable: true,
    placeholder: "全部",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_81));
let __VLS_84;
let __VLS_85;
let __VLS_86;
const __VLS_87 = {
    onChange: (__VLS_ctx.handleSearch)
};
__VLS_83.slots.default;
for (const [s] of __VLS_getVForSourceType((__VLS_ctx.statusOptions))) {
    const __VLS_88 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
        key: (s),
        label: (s ? __VLS_ctx.STATUS_LABELS[s] : '全部'),
        value: (s),
    }));
    const __VLS_90 = __VLS_89({
        key: (s),
        label: (s ? __VLS_ctx.STATUS_LABELS[s] : '全部'),
        value: (s),
    }, ...__VLS_functionalComponentArgsRest(__VLS_89));
}
var __VLS_83;
var __VLS_79;
const __VLS_92 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
    label: "类型",
}));
const __VLS_94 = __VLS_93({
    label: "类型",
}, ...__VLS_functionalComponentArgsRest(__VLS_93));
__VLS_95.slots.default;
const __VLS_96 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.assetTypeFilter),
    clearable: true,
    placeholder: "全部",
    ...{ style: {} },
}));
const __VLS_98 = __VLS_97({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.assetTypeFilter),
    clearable: true,
    placeholder: "全部",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_97));
let __VLS_100;
let __VLS_101;
let __VLS_102;
const __VLS_103 = {
    onChange: (__VLS_ctx.handleSearch)
};
__VLS_99.slots.default;
for (const [t] of __VLS_getVForSourceType((__VLS_ctx.typeOptions.slice(1)))) {
    const __VLS_104 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
        key: (t),
        label: (__VLS_ctx.TYPE_LABELS[t]),
        value: (t),
    }));
    const __VLS_106 = __VLS_105({
        key: (t),
        label: (__VLS_ctx.TYPE_LABELS[t]),
        value: (t),
    }, ...__VLS_functionalComponentArgsRest(__VLS_105));
}
var __VLS_99;
var __VLS_95;
const __VLS_108 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
    label: "质量",
}));
const __VLS_110 = __VLS_109({
    label: "质量",
}, ...__VLS_functionalComponentArgsRest(__VLS_109));
__VLS_111.slots.default;
const __VLS_112 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.qualityFilter),
    clearable: true,
    placeholder: "全部",
    ...{ style: {} },
}));
const __VLS_114 = __VLS_113({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.qualityFilter),
    clearable: true,
    placeholder: "全部",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_113));
let __VLS_116;
let __VLS_117;
let __VLS_118;
const __VLS_119 = {
    onChange: (__VLS_ctx.load)
};
__VLS_115.slots.default;
const __VLS_120 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
    label: "通过",
    value: "pass",
}));
const __VLS_122 = __VLS_121({
    label: "通过",
    value: "pass",
}, ...__VLS_functionalComponentArgsRest(__VLS_121));
const __VLS_124 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
    label: "告警",
    value: "warn",
}));
const __VLS_126 = __VLS_125({
    label: "告警",
    value: "warn",
}, ...__VLS_functionalComponentArgsRest(__VLS_125));
const __VLS_128 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
    label: "失败",
    value: "fail",
}));
const __VLS_130 = __VLS_129({
    label: "失败",
    value: "fail",
}, ...__VLS_functionalComponentArgsRest(__VLS_129));
var __VLS_115;
var __VLS_111;
const __VLS_132 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({}));
const __VLS_134 = __VLS_133({}, ...__VLS_functionalComponentArgsRest(__VLS_133));
__VLS_135.slots.default;
const __VLS_136 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
    ...{ 'onClick': {} },
    type: "primary",
    icon: (__VLS_ctx.Search),
}));
const __VLS_138 = __VLS_137({
    ...{ 'onClick': {} },
    type: "primary",
    icon: (__VLS_ctx.Search),
}, ...__VLS_functionalComponentArgsRest(__VLS_137));
let __VLS_140;
let __VLS_141;
let __VLS_142;
const __VLS_143 = {
    onClick: (__VLS_ctx.handleSearch)
};
__VLS_139.slots.default;
var __VLS_139;
const __VLS_144 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Refresh),
}));
const __VLS_146 = __VLS_145({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Refresh),
}, ...__VLS_functionalComponentArgsRest(__VLS_145));
let __VLS_148;
let __VLS_149;
let __VLS_150;
const __VLS_151 = {
    onClick: (__VLS_ctx.handleReset)
};
__VLS_147.slots.default;
var __VLS_147;
var __VLS_135;
var __VLS_43;
var __VLS_39;
if (__VLS_ctx.viewMode === 'card') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "asset-card-grid" },
    });
    __VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
    if (!__VLS_ctx.loading && __VLS_ctx.assets.length === 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "card-empty" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
    for (const [a] of __VLS_getVForSourceType((__VLS_ctx.assets))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (a.table_name),
            ...{ class: "asset-card" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "card-header" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.viewMode === 'card'))
                        return;
                    __VLS_ctx.goDetail(a.table_name);
                } },
            ...{ class: "card-name" },
        });
        (a.table_label);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "card-badges" },
        });
        const __VLS_152 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
            type: "info",
            size: "small",
            effect: "plain",
        }));
        const __VLS_154 = __VLS_153({
            type: "info",
            size: "small",
            effect: "plain",
        }, ...__VLS_functionalComponentArgsRest(__VLS_153));
        __VLS_155.slots.default;
        (__VLS_ctx.TYPE_LABELS['table'] || '数据表');
        var __VLS_155;
        /** @type {[typeof LayerTag, ]} */ ;
        // @ts-ignore
        const __VLS_156 = __VLS_asFunctionalComponent(LayerTag, new LayerTag({
            layer: (a.warehouse_layer),
        }));
        const __VLS_157 = __VLS_156({
            layer: (a.warehouse_layer),
        }, ...__VLS_functionalComponentArgsRest(__VLS_156));
        const __VLS_159 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_160 = __VLS_asFunctionalComponent(__VLS_159, new __VLS_159({
            type: (__VLS_ctx.QUALITY_TAG[a.last_quality_status] || 'info'),
            size: "small",
        }));
        const __VLS_161 = __VLS_160({
            type: (__VLS_ctx.QUALITY_TAG[a.last_quality_status] || 'info'),
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_160));
        __VLS_162.slots.default;
        (__VLS_ctx.QUALITY_LABELS[a.last_quality_status] || a.last_quality_status);
        var __VLS_162;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "card-body" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "card-meta" },
        });
        if (a.subject_area) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "meta-item" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "meta-label" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (a.subject_area);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "meta-item" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "meta-label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (a.source_system || '—');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "meta-item" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "meta-label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (a.owner_name || '—');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "card-stats" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "stat-item" },
        });
        (a.columns_count ?? '—');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "stat-item" },
        });
        (__VLS_ctx.formatSyncTime(a));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "stat-item" },
            ...{ class: ({ 'text-warning': a.last_quality_status === 'fail' || a.last_quality_status === 'warn' }) },
        });
        (__VLS_ctx.QUALITY_LABELS[a.last_quality_status] || a.last_quality_status);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "card-actions" },
        });
        const __VLS_163 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_164 = __VLS_asFunctionalComponent(__VLS_163, new __VLS_163({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            icon: (__VLS_ctx.View),
        }));
        const __VLS_165 = __VLS_164({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            icon: (__VLS_ctx.View),
        }, ...__VLS_functionalComponentArgsRest(__VLS_164));
        let __VLS_167;
        let __VLS_168;
        let __VLS_169;
        const __VLS_170 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.viewMode === 'card'))
                    return;
                __VLS_ctx.goDetail(a.table_name);
            }
        };
        __VLS_166.slots.default;
        var __VLS_166;
        const __VLS_171 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_172 = __VLS_asFunctionalComponent(__VLS_171, new __VLS_171({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            icon: (__VLS_ctx.List),
        }));
        const __VLS_173 = __VLS_172({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            icon: (__VLS_ctx.List),
        }, ...__VLS_functionalComponentArgsRest(__VLS_172));
        let __VLS_175;
        let __VLS_176;
        let __VLS_177;
        const __VLS_178 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.viewMode === 'card'))
                    return;
                __VLS_ctx.goFields(a.table_name);
            }
        };
        __VLS_174.slots.default;
        var __VLS_174;
        const __VLS_179 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_180 = __VLS_asFunctionalComponent(__VLS_179, new __VLS_179({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            icon: (__VLS_ctx.DataAnalysis),
        }));
        const __VLS_181 = __VLS_180({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            icon: (__VLS_ctx.DataAnalysis),
        }, ...__VLS_functionalComponentArgsRest(__VLS_180));
        let __VLS_183;
        let __VLS_184;
        let __VLS_185;
        const __VLS_186 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.viewMode === 'card'))
                    return;
                __VLS_ctx.goPreview(a.table_name);
            }
        };
        __VLS_182.slots.default;
        var __VLS_182;
        const __VLS_187 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_188 = __VLS_asFunctionalComponent(__VLS_187, new __VLS_187({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            icon: (__VLS_ctx.Connection),
        }));
        const __VLS_189 = __VLS_188({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            icon: (__VLS_ctx.Connection),
        }, ...__VLS_functionalComponentArgsRest(__VLS_188));
        let __VLS_191;
        let __VLS_192;
        let __VLS_193;
        const __VLS_194 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.viewMode === 'card'))
                    return;
                __VLS_ctx.goImpact(a.table_name);
            }
        };
        __VLS_190.slots.default;
        var __VLS_190;
        if (__VLS_ctx.canEditAsset()) {
            const __VLS_195 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_196 = __VLS_asFunctionalComponent(__VLS_195, new __VLS_195({
                ...{ 'onClick': {} },
                text: true,
                size: "small",
                icon: (__VLS_ctx.Edit),
            }));
            const __VLS_197 = __VLS_196({
                ...{ 'onClick': {} },
                text: true,
                size: "small",
                icon: (__VLS_ctx.Edit),
            }, ...__VLS_functionalComponentArgsRest(__VLS_196));
            let __VLS_199;
            let __VLS_200;
            let __VLS_201;
            const __VLS_202 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.viewMode === 'card'))
                        return;
                    if (!(__VLS_ctx.canEditAsset()))
                        return;
                    __VLS_ctx.openEdit(a);
                }
            };
            __VLS_198.slots.default;
            var __VLS_198;
        }
    }
}
else {
    const __VLS_203 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_204 = __VLS_asFunctionalComponent(__VLS_203, new __VLS_203({
        shadow: "never",
    }));
    const __VLS_205 = __VLS_204({
        shadow: "never",
    }, ...__VLS_functionalComponentArgsRest(__VLS_204));
    __VLS_206.slots.default;
    if (__VLS_ctx.canEditAsset()) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        const __VLS_207 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_208 = __VLS_asFunctionalComponent(__VLS_207, new __VLS_207({
            ...{ 'onClick': {} },
            size: "small",
            disabled: (!__VLS_ctx.hasSelection),
        }));
        const __VLS_209 = __VLS_208({
            ...{ 'onClick': {} },
            size: "small",
            disabled: (!__VLS_ctx.hasSelection),
        }, ...__VLS_functionalComponentArgsRest(__VLS_208));
        let __VLS_211;
        let __VLS_212;
        let __VLS_213;
        const __VLS_214 = {
            onClick: (__VLS_ctx.openBatchLayer)
        };
        __VLS_210.slots.default;
        if (__VLS_ctx.hasSelection) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (__VLS_ctx.tableSelection.length);
        }
        var __VLS_210;
    }
    const __VLS_215 = {}.ElTable;
    /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
    // @ts-ignore
    const __VLS_216 = __VLS_asFunctionalComponent(__VLS_215, new __VLS_215({
        ...{ 'onSelectionChange': {} },
        data: (__VLS_ctx.assets),
        border: true,
        stripe: true,
        size: "small",
        emptyText: "暂无数据资产",
    }));
    const __VLS_217 = __VLS_216({
        ...{ 'onSelectionChange': {} },
        data: (__VLS_ctx.assets),
        border: true,
        stripe: true,
        size: "small",
        emptyText: "暂无数据资产",
    }, ...__VLS_functionalComponentArgsRest(__VLS_216));
    let __VLS_219;
    let __VLS_220;
    let __VLS_221;
    const __VLS_222 = {
        onSelectionChange: (__VLS_ctx.handleTableSelection)
    };
    __VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
    __VLS_218.slots.default;
    if (__VLS_ctx.canEditAsset()) {
        const __VLS_223 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_224 = __VLS_asFunctionalComponent(__VLS_223, new __VLS_223({
            type: "selection",
            width: "40",
        }));
        const __VLS_225 = __VLS_224({
            type: "selection",
            width: "40",
        }, ...__VLS_functionalComponentArgsRest(__VLS_224));
    }
    const __VLS_227 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_228 = __VLS_asFunctionalComponent(__VLS_227, new __VLS_227({
        prop: "table_name",
        label: "表名",
        minWidth: "160",
        showOverflowTooltip: true,
    }));
    const __VLS_229 = __VLS_228({
        prop: "table_name",
        label: "表名",
        minWidth: "160",
        showOverflowTooltip: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_228));
    const __VLS_231 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_232 = __VLS_asFunctionalComponent(__VLS_231, new __VLS_231({
        prop: "table_label",
        label: "显示名",
        minWidth: "130",
        showOverflowTooltip: true,
    }));
    const __VLS_233 = __VLS_232({
        prop: "table_label",
        label: "显示名",
        minWidth: "130",
        showOverflowTooltip: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_232));
    const __VLS_235 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_236 = __VLS_asFunctionalComponent(__VLS_235, new __VLS_235({
        prop: "warehouse_layer",
        label: "分层",
        width: "140",
    }));
    const __VLS_237 = __VLS_236({
        prop: "warehouse_layer",
        label: "分层",
        width: "140",
    }, ...__VLS_functionalComponentArgsRest(__VLS_236));
    __VLS_238.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_238.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        /** @type {[typeof LayerTag, ]} */ ;
        // @ts-ignore
        const __VLS_239 = __VLS_asFunctionalComponent(LayerTag, new LayerTag({
            layer: (row.warehouse_layer),
        }));
        const __VLS_240 = __VLS_239({
            layer: (row.warehouse_layer),
        }, ...__VLS_functionalComponentArgsRest(__VLS_239));
    }
    var __VLS_238;
    const __VLS_242 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_243 = __VLS_asFunctionalComponent(__VLS_242, new __VLS_242({
        prop: "subject_area",
        label: "主题域",
        width: "90",
        showOverflowTooltip: true,
    }));
    const __VLS_244 = __VLS_243({
        prop: "subject_area",
        label: "主题域",
        width: "90",
        showOverflowTooltip: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_243));
    const __VLS_246 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_247 = __VLS_asFunctionalComponent(__VLS_246, new __VLS_246({
        prop: "source_system",
        label: "来源",
        width: "80",
        showOverflowTooltip: true,
    }));
    const __VLS_248 = __VLS_247({
        prop: "source_system",
        label: "来源",
        width: "80",
        showOverflowTooltip: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_247));
    const __VLS_250 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_251 = __VLS_asFunctionalComponent(__VLS_250, new __VLS_250({
        prop: "owner_name",
        label: "负责人",
        width: "90",
    }));
    const __VLS_252 = __VLS_251({
        prop: "owner_name",
        label: "负责人",
        width: "90",
    }, ...__VLS_functionalComponentArgsRest(__VLS_251));
    const __VLS_254 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_255 = __VLS_asFunctionalComponent(__VLS_254, new __VLS_254({
        prop: "columns_count",
        label: "字段数",
        width: "70",
        align: "center",
    }));
    const __VLS_256 = __VLS_255({
        prop: "columns_count",
        label: "字段数",
        width: "70",
        align: "center",
    }, ...__VLS_functionalComponentArgsRest(__VLS_255));
    const __VLS_258 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_259 = __VLS_asFunctionalComponent(__VLS_258, new __VLS_258({
        prop: "last_quality_status",
        label: "质量",
        width: "80",
        align: "center",
    }));
    const __VLS_260 = __VLS_259({
        prop: "last_quality_status",
        label: "质量",
        width: "80",
        align: "center",
    }, ...__VLS_functionalComponentArgsRest(__VLS_259));
    __VLS_261.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_261.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_262 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_263 = __VLS_asFunctionalComponent(__VLS_262, new __VLS_262({
            size: "small",
            type: (__VLS_ctx.QUALITY_TAG[row.last_quality_status] || 'info'),
        }));
        const __VLS_264 = __VLS_263({
            size: "small",
            type: (__VLS_ctx.QUALITY_TAG[row.last_quality_status] || 'info'),
        }, ...__VLS_functionalComponentArgsRest(__VLS_263));
        __VLS_265.slots.default;
        (__VLS_ctx.QUALITY_LABELS[row.last_quality_status] || row.last_quality_status);
        var __VLS_265;
    }
    var __VLS_261;
    const __VLS_266 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_267 = __VLS_asFunctionalComponent(__VLS_266, new __VLS_266({
        prop: "asset_status",
        label: "状态",
        width: "80",
        align: "center",
    }));
    const __VLS_268 = __VLS_267({
        prop: "asset_status",
        label: "状态",
        width: "80",
        align: "center",
    }, ...__VLS_functionalComponentArgsRest(__VLS_267));
    __VLS_269.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_269.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_270 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_271 = __VLS_asFunctionalComponent(__VLS_270, new __VLS_270({
            size: "small",
            type: (__VLS_ctx.STATUS_TAG[row.asset_status] || 'info'),
        }));
        const __VLS_272 = __VLS_271({
            size: "small",
            type: (__VLS_ctx.STATUS_TAG[row.asset_status] || 'info'),
        }, ...__VLS_functionalComponentArgsRest(__VLS_271));
        __VLS_273.slots.default;
        (__VLS_ctx.STATUS_LABELS[row.asset_status] || row.asset_status);
        var __VLS_273;
    }
    var __VLS_269;
    const __VLS_274 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_275 = __VLS_asFunctionalComponent(__VLS_274, new __VLS_274({
        label: "操作",
        width: "200",
        fixed: "right",
    }));
    const __VLS_276 = __VLS_275({
        label: "操作",
        width: "200",
        fixed: "right",
    }, ...__VLS_functionalComponentArgsRest(__VLS_275));
    __VLS_277.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_277.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_278 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_279 = __VLS_asFunctionalComponent(__VLS_278, new __VLS_278({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            icon: (__VLS_ctx.View),
        }));
        const __VLS_280 = __VLS_279({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            icon: (__VLS_ctx.View),
        }, ...__VLS_functionalComponentArgsRest(__VLS_279));
        let __VLS_282;
        let __VLS_283;
        let __VLS_284;
        const __VLS_285 = {
            onClick: (...[$event]) => {
                if (!!(__VLS_ctx.viewMode === 'card'))
                    return;
                __VLS_ctx.goDetail(row.table_name);
            }
        };
        __VLS_281.slots.default;
        var __VLS_281;
        const __VLS_286 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_287 = __VLS_asFunctionalComponent(__VLS_286, new __VLS_286({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            icon: (__VLS_ctx.List),
        }));
        const __VLS_288 = __VLS_287({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            icon: (__VLS_ctx.List),
        }, ...__VLS_functionalComponentArgsRest(__VLS_287));
        let __VLS_290;
        let __VLS_291;
        let __VLS_292;
        const __VLS_293 = {
            onClick: (...[$event]) => {
                if (!!(__VLS_ctx.viewMode === 'card'))
                    return;
                __VLS_ctx.goFields(row.table_name);
            }
        };
        __VLS_289.slots.default;
        var __VLS_289;
        if (__VLS_ctx.canEditAsset()) {
            const __VLS_294 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_295 = __VLS_asFunctionalComponent(__VLS_294, new __VLS_294({
                ...{ 'onClick': {} },
                text: true,
                size: "small",
                icon: (__VLS_ctx.Edit),
            }));
            const __VLS_296 = __VLS_295({
                ...{ 'onClick': {} },
                text: true,
                size: "small",
                icon: (__VLS_ctx.Edit),
            }, ...__VLS_functionalComponentArgsRest(__VLS_295));
            let __VLS_298;
            let __VLS_299;
            let __VLS_300;
            const __VLS_301 = {
                onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.viewMode === 'card'))
                        return;
                    if (!(__VLS_ctx.canEditAsset()))
                        return;
                    __VLS_ctx.openEdit(row);
                }
            };
            __VLS_297.slots.default;
            var __VLS_297;
        }
        const __VLS_302 = {}.ElDropdown;
        /** @type {[typeof __VLS_components.ElDropdown, typeof __VLS_components.elDropdown, typeof __VLS_components.ElDropdown, typeof __VLS_components.elDropdown, ]} */ ;
        // @ts-ignore
        const __VLS_303 = __VLS_asFunctionalComponent(__VLS_302, new __VLS_302({
            trigger: "click",
            ...{ style: {} },
        }));
        const __VLS_304 = __VLS_303({
            trigger: "click",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_303));
        __VLS_305.slots.default;
        const __VLS_306 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_307 = __VLS_asFunctionalComponent(__VLS_306, new __VLS_306({
            text: true,
            size: "small",
        }));
        const __VLS_308 = __VLS_307({
            text: true,
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_307));
        __VLS_309.slots.default;
        const __VLS_310 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_311 = __VLS_asFunctionalComponent(__VLS_310, new __VLS_310({
            ...{ style: {} },
        }));
        const __VLS_312 = __VLS_311({
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_311));
        __VLS_313.slots.default;
        const __VLS_314 = {}.ArrowDown;
        /** @type {[typeof __VLS_components.ArrowDown, ]} */ ;
        // @ts-ignore
        const __VLS_315 = __VLS_asFunctionalComponent(__VLS_314, new __VLS_314({}));
        const __VLS_316 = __VLS_315({}, ...__VLS_functionalComponentArgsRest(__VLS_315));
        var __VLS_313;
        var __VLS_309;
        {
            const { dropdown: __VLS_thisSlot } = __VLS_305.slots;
            const __VLS_318 = {}.ElDropdownMenu;
            /** @type {[typeof __VLS_components.ElDropdownMenu, typeof __VLS_components.elDropdownMenu, typeof __VLS_components.ElDropdownMenu, typeof __VLS_components.elDropdownMenu, ]} */ ;
            // @ts-ignore
            const __VLS_319 = __VLS_asFunctionalComponent(__VLS_318, new __VLS_318({}));
            const __VLS_320 = __VLS_319({}, ...__VLS_functionalComponentArgsRest(__VLS_319));
            __VLS_321.slots.default;
            const __VLS_322 = {}.ElDropdownItem;
            /** @type {[typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, ]} */ ;
            // @ts-ignore
            const __VLS_323 = __VLS_asFunctionalComponent(__VLS_322, new __VLS_322({
                ...{ 'onClick': {} },
                icon: (__VLS_ctx.DataAnalysis),
            }));
            const __VLS_324 = __VLS_323({
                ...{ 'onClick': {} },
                icon: (__VLS_ctx.DataAnalysis),
            }, ...__VLS_functionalComponentArgsRest(__VLS_323));
            let __VLS_326;
            let __VLS_327;
            let __VLS_328;
            const __VLS_329 = {
                onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.viewMode === 'card'))
                        return;
                    __VLS_ctx.goPreview(row.table_name);
                }
            };
            __VLS_325.slots.default;
            var __VLS_325;
            const __VLS_330 = {}.ElDropdownItem;
            /** @type {[typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, ]} */ ;
            // @ts-ignore
            const __VLS_331 = __VLS_asFunctionalComponent(__VLS_330, new __VLS_330({
                ...{ 'onClick': {} },
                icon: (__VLS_ctx.Connection),
            }));
            const __VLS_332 = __VLS_331({
                ...{ 'onClick': {} },
                icon: (__VLS_ctx.Connection),
            }, ...__VLS_functionalComponentArgsRest(__VLS_331));
            let __VLS_334;
            let __VLS_335;
            let __VLS_336;
            const __VLS_337 = {
                onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.viewMode === 'card'))
                        return;
                    __VLS_ctx.goImpact(row.table_name);
                }
            };
            __VLS_333.slots.default;
            var __VLS_333;
            const __VLS_338 = {}.ElDropdownItem;
            /** @type {[typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, ]} */ ;
            // @ts-ignore
            const __VLS_339 = __VLS_asFunctionalComponent(__VLS_338, new __VLS_338({
                ...{ 'onClick': {} },
                icon: (__VLS_ctx.Link),
            }));
            const __VLS_340 = __VLS_339({
                ...{ 'onClick': {} },
                icon: (__VLS_ctx.Link),
            }, ...__VLS_functionalComponentArgsRest(__VLS_339));
            let __VLS_342;
            let __VLS_343;
            let __VLS_344;
            const __VLS_345 = {
                onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.viewMode === 'card'))
                        return;
                    __VLS_ctx.goSource(row);
                }
            };
            __VLS_341.slots.default;
            var __VLS_341;
            var __VLS_321;
        }
        var __VLS_305;
    }
    var __VLS_277;
    var __VLS_218;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_346 = {}.ElPagination;
    /** @type {[typeof __VLS_components.ElPagination, typeof __VLS_components.elPagination, ]} */ ;
    // @ts-ignore
    const __VLS_347 = __VLS_asFunctionalComponent(__VLS_346, new __VLS_346({
        currentPage: (__VLS_ctx.page),
        pageSize: (__VLS_ctx.pageSize),
        total: (__VLS_ctx.total),
        pageSizes: ([20, 50, 100]),
        layout: "total, sizes, prev, pager, next",
    }));
    const __VLS_348 = __VLS_347({
        currentPage: (__VLS_ctx.page),
        pageSize: (__VLS_ctx.pageSize),
        total: (__VLS_ctx.total),
        pageSizes: ([20, 50, 100]),
        layout: "total, sizes, prev, pager, next",
    }, ...__VLS_functionalComponentArgsRest(__VLS_347));
    var __VLS_206;
}
/** @type {[typeof CreateTableDialog, ]} */ ;
// @ts-ignore
const __VLS_350 = __VLS_asFunctionalComponent(CreateTableDialog, new CreateTableDialog({
    ...{ 'onDone': {} },
    ref: "createDialogRef",
    existingTableNames: (__VLS_ctx.assets.map((a) => a.table_name)),
}));
const __VLS_351 = __VLS_350({
    ...{ 'onDone': {} },
    ref: "createDialogRef",
    existingTableNames: (__VLS_ctx.assets.map((a) => a.table_name)),
}, ...__VLS_functionalComponentArgsRest(__VLS_350));
let __VLS_353;
let __VLS_354;
let __VLS_355;
const __VLS_356 = {
    onDone: (__VLS_ctx.onCreated)
};
/** @type {typeof __VLS_ctx.createDialogRef} */ ;
var __VLS_357 = {};
var __VLS_352;
const __VLS_359 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_360 = __VLS_asFunctionalComponent(__VLS_359, new __VLS_359({
    ...{ 'onClose': {} },
    modelValue: (__VLS_ctx.editVisible),
    title: "编辑资产",
    width: "480px",
}));
const __VLS_361 = __VLS_360({
    ...{ 'onClose': {} },
    modelValue: (__VLS_ctx.editVisible),
    title: "编辑资产",
    width: "480px",
}, ...__VLS_functionalComponentArgsRest(__VLS_360));
let __VLS_363;
let __VLS_364;
let __VLS_365;
const __VLS_366 = {
    onClose: (...[$event]) => {
        __VLS_ctx.editAsset = null;
    }
};
__VLS_362.slots.default;
if (__VLS_ctx.editAsset) {
    const __VLS_367 = {}.ElForm;
    /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
    // @ts-ignore
    const __VLS_368 = __VLS_asFunctionalComponent(__VLS_367, new __VLS_367({
        ...{ 'onSubmit': {} },
        labelWidth: "80px",
        size: "small",
    }));
    const __VLS_369 = __VLS_368({
        ...{ 'onSubmit': {} },
        labelWidth: "80px",
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_368));
    let __VLS_371;
    let __VLS_372;
    let __VLS_373;
    const __VLS_374 = {
        onSubmit: (__VLS_ctx.saveEdit)
    };
    __VLS_370.slots.default;
    const __VLS_375 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_376 = __VLS_asFunctionalComponent(__VLS_375, new __VLS_375({
        label: "表名",
    }));
    const __VLS_377 = __VLS_376({
        label: "表名",
    }, ...__VLS_functionalComponentArgsRest(__VLS_376));
    __VLS_378.slots.default;
    const __VLS_379 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_380 = __VLS_asFunctionalComponent(__VLS_379, new __VLS_379({
        modelValue: (__VLS_ctx.editAsset.table_name),
        disabled: true,
    }));
    const __VLS_381 = __VLS_380({
        modelValue: (__VLS_ctx.editAsset.table_name),
        disabled: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_380));
    var __VLS_378;
    const __VLS_383 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_384 = __VLS_asFunctionalComponent(__VLS_383, new __VLS_383({
        label: "显示名",
    }));
    const __VLS_385 = __VLS_384({
        label: "显示名",
    }, ...__VLS_functionalComponentArgsRest(__VLS_384));
    __VLS_386.slots.default;
    const __VLS_387 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_388 = __VLS_asFunctionalComponent(__VLS_387, new __VLS_387({
        modelValue: (__VLS_ctx.editAsset.table_label),
        disabled: true,
    }));
    const __VLS_389 = __VLS_388({
        modelValue: (__VLS_ctx.editAsset.table_label),
        disabled: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_388));
    var __VLS_386;
    const __VLS_391 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_392 = __VLS_asFunctionalComponent(__VLS_391, new __VLS_391({
        label: "分层",
    }));
    const __VLS_393 = __VLS_392({
        label: "分层",
    }, ...__VLS_functionalComponentArgsRest(__VLS_392));
    __VLS_394.slots.default;
    const __VLS_395 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_396 = __VLS_asFunctionalComponent(__VLS_395, new __VLS_395({
        modelValue: (__VLS_ctx.editForm.warehouse_layer),
        ...{ style: {} },
    }));
    const __VLS_397 = __VLS_396({
        modelValue: (__VLS_ctx.editForm.warehouse_layer),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_396));
    __VLS_398.slots.default;
    for (const [o] of __VLS_getVForSourceType((__VLS_ctx.WAREHOUSE_LAYER_OPTIONS.slice(1)))) {
        const __VLS_399 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_400 = __VLS_asFunctionalComponent(__VLS_399, new __VLS_399({
            key: (o.value),
            label: (o.label),
            value: (o.value),
        }));
        const __VLS_401 = __VLS_400({
            key: (o.value),
            label: (o.label),
            value: (o.value),
        }, ...__VLS_functionalComponentArgsRest(__VLS_400));
    }
    var __VLS_398;
    var __VLS_394;
    const __VLS_403 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_404 = __VLS_asFunctionalComponent(__VLS_403, new __VLS_403({
        label: "主题域",
    }));
    const __VLS_405 = __VLS_404({
        label: "主题域",
    }, ...__VLS_functionalComponentArgsRest(__VLS_404));
    __VLS_406.slots.default;
    const __VLS_407 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_408 = __VLS_asFunctionalComponent(__VLS_407, new __VLS_407({
        modelValue: (__VLS_ctx.editForm.subject_area),
        placeholder: "如：员工、薪酬",
    }));
    const __VLS_409 = __VLS_408({
        modelValue: (__VLS_ctx.editForm.subject_area),
        placeholder: "如：员工、薪酬",
    }, ...__VLS_functionalComponentArgsRest(__VLS_408));
    var __VLS_406;
    const __VLS_411 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_412 = __VLS_asFunctionalComponent(__VLS_411, new __VLS_411({
        label: "负责人",
    }));
    const __VLS_413 = __VLS_412({
        label: "负责人",
    }, ...__VLS_functionalComponentArgsRest(__VLS_412));
    __VLS_414.slots.default;
    const __VLS_415 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_416 = __VLS_asFunctionalComponent(__VLS_415, new __VLS_415({
        modelValue: (__VLS_ctx.editForm.owner_name),
        placeholder: "负责人姓名",
    }));
    const __VLS_417 = __VLS_416({
        modelValue: (__VLS_ctx.editForm.owner_name),
        placeholder: "负责人姓名",
    }, ...__VLS_functionalComponentArgsRest(__VLS_416));
    var __VLS_414;
    const __VLS_419 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_420 = __VLS_asFunctionalComponent(__VLS_419, new __VLS_419({
        label: "状态",
    }));
    const __VLS_421 = __VLS_420({
        label: "状态",
    }, ...__VLS_functionalComponentArgsRest(__VLS_420));
    __VLS_422.slots.default;
    const __VLS_423 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_424 = __VLS_asFunctionalComponent(__VLS_423, new __VLS_423({
        modelValue: (__VLS_ctx.editForm.asset_status),
        ...{ style: {} },
    }));
    const __VLS_425 = __VLS_424({
        modelValue: (__VLS_ctx.editForm.asset_status),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_424));
    __VLS_426.slots.default;
    for (const [s] of __VLS_getVForSourceType((__VLS_ctx.statusOptions.slice(1)))) {
        const __VLS_427 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_428 = __VLS_asFunctionalComponent(__VLS_427, new __VLS_427({
            key: (s),
            label: (__VLS_ctx.STATUS_LABELS[s]),
            value: (s),
        }));
        const __VLS_429 = __VLS_428({
            key: (s),
            label: (__VLS_ctx.STATUS_LABELS[s]),
            value: (s),
        }, ...__VLS_functionalComponentArgsRest(__VLS_428));
    }
    var __VLS_426;
    var __VLS_422;
    var __VLS_370;
}
{
    const { footer: __VLS_thisSlot } = __VLS_362.slots;
    const __VLS_431 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_432 = __VLS_asFunctionalComponent(__VLS_431, new __VLS_431({
        ...{ 'onClick': {} },
    }));
    const __VLS_433 = __VLS_432({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_432));
    let __VLS_435;
    let __VLS_436;
    let __VLS_437;
    const __VLS_438 = {
        onClick: (...[$event]) => {
            __VLS_ctx.editVisible = false;
        }
    };
    __VLS_434.slots.default;
    var __VLS_434;
    const __VLS_439 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_440 = __VLS_asFunctionalComponent(__VLS_439, new __VLS_439({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.editSaving),
    }));
    const __VLS_441 = __VLS_440({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.editSaving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_440));
    let __VLS_443;
    let __VLS_444;
    let __VLS_445;
    const __VLS_446 = {
        onClick: (__VLS_ctx.saveEdit)
    };
    __VLS_442.slots.default;
    var __VLS_442;
}
var __VLS_362;
const __VLS_447 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_448 = __VLS_asFunctionalComponent(__VLS_447, new __VLS_447({
    modelValue: (__VLS_ctx.batchLayerVisible),
    title: "批量修改分层",
    width: "420px",
}));
const __VLS_449 = __VLS_448({
    modelValue: (__VLS_ctx.batchLayerVisible),
    title: "批量修改分层",
    width: "420px",
}, ...__VLS_functionalComponentArgsRest(__VLS_448));
__VLS_450.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
(__VLS_ctx.tableSelection.length);
const __VLS_451 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_452 = __VLS_asFunctionalComponent(__VLS_451, new __VLS_451({
    modelValue: (__VLS_ctx.batchLayerTarget),
    placeholder: "选择目标分层",
    ...{ style: {} },
}));
const __VLS_453 = __VLS_452({
    modelValue: (__VLS_ctx.batchLayerTarget),
    placeholder: "选择目标分层",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_452));
__VLS_454.slots.default;
for (const [o] of __VLS_getVForSourceType((__VLS_ctx.WAREHOUSE_LAYER_OPTIONS.slice(1)))) {
    const __VLS_455 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_456 = __VLS_asFunctionalComponent(__VLS_455, new __VLS_455({
        key: (o.value),
        label: (o.label),
        value: (o.value),
    }));
    const __VLS_457 = __VLS_456({
        key: (o.value),
        label: (o.label),
        value: (o.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_456));
}
var __VLS_454;
{
    const { footer: __VLS_thisSlot } = __VLS_450.slots;
    const __VLS_459 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_460 = __VLS_asFunctionalComponent(__VLS_459, new __VLS_459({
        ...{ 'onClick': {} },
    }));
    const __VLS_461 = __VLS_460({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_460));
    let __VLS_463;
    let __VLS_464;
    let __VLS_465;
    const __VLS_466 = {
        onClick: (...[$event]) => {
            __VLS_ctx.batchLayerVisible = false;
        }
    };
    __VLS_462.slots.default;
    var __VLS_462;
    const __VLS_467 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_468 = __VLS_asFunctionalComponent(__VLS_467, new __VLS_467({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.batchLayerSaving),
    }));
    const __VLS_469 = __VLS_468({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.batchLayerSaving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_468));
    let __VLS_471;
    let __VLS_472;
    let __VLS_473;
    const __VLS_474 = {
        onClick: (__VLS_ctx.confirmBatchLayer)
    };
    __VLS_470.slots.default;
    var __VLS_470;
}
var __VLS_450;
/** @type {__VLS_StyleScopedClasses['warehouse-assets']} */ ;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['page-header-right']} */ ;
/** @type {__VLS_StyleScopedClasses['asset-card-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['card-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['asset-card']} */ ;
/** @type {__VLS_StyleScopedClasses['card-header']} */ ;
/** @type {__VLS_StyleScopedClasses['card-name']} */ ;
/** @type {__VLS_StyleScopedClasses['card-badges']} */ ;
/** @type {__VLS_StyleScopedClasses['card-body']} */ ;
/** @type {__VLS_StyleScopedClasses['card-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['meta-item']} */ ;
/** @type {__VLS_StyleScopedClasses['meta-label']} */ ;
/** @type {__VLS_StyleScopedClasses['meta-item']} */ ;
/** @type {__VLS_StyleScopedClasses['meta-label']} */ ;
/** @type {__VLS_StyleScopedClasses['meta-item']} */ ;
/** @type {__VLS_StyleScopedClasses['meta-label']} */ ;
/** @type {__VLS_StyleScopedClasses['card-stats']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-item']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-item']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-item']} */ ;
/** @type {__VLS_StyleScopedClasses['card-actions']} */ ;
// @ts-ignore
var __VLS_358 = __VLS_357;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Search: Search,
            Refresh: Refresh,
            View: View,
            Edit: Edit,
            DataAnalysis: DataAnalysis,
            Connection: Connection,
            Link: Link,
            List: List,
            ArrowDown: ArrowDown,
            Grid: Grid,
            Menu: Menu,
            Plus: Plus,
            CreateTableDialog: CreateTableDialog,
            LayerTag: LayerTag,
            WAREHOUSE_LAYER_OPTIONS: WAREHOUSE_LAYER_OPTIONS,
            userStore: userStore,
            canEditAsset: canEditAsset,
            viewMode: viewMode,
            assets: assets,
            loading: loading,
            total: total,
            page: page,
            pageSize: pageSize,
            filters: filters,
            editVisible: editVisible,
            editAsset: editAsset,
            editForm: editForm,
            editSaving: editSaving,
            createDialogRef: createDialogRef,
            assetTypeFilter: assetTypeFilter,
            typeOptions: typeOptions,
            TYPE_LABELS: TYPE_LABELS,
            qualityFilter: qualityFilter,
            statusOptions: statusOptions,
            STATUS_LABELS: STATUS_LABELS,
            QUALITY_LABELS: QUALITY_LABELS,
            STATUS_TAG: STATUS_TAG,
            QUALITY_TAG: QUALITY_TAG,
            tableSelection: tableSelection,
            batchLayerTarget: batchLayerTarget,
            batchLayerVisible: batchLayerVisible,
            batchLayerSaving: batchLayerSaving,
            hasSelection: hasSelection,
            openBatchLayer: openBatchLayer,
            confirmBatchLayer: confirmBatchLayer,
            handleTableSelection: handleTableSelection,
            load: load,
            handleSearch: handleSearch,
            handleReset: handleReset,
            goDetail: goDetail,
            goFields: goFields,
            goPreview: goPreview,
            goImpact: goImpact,
            goSource: goSource,
            openEdit: openEdit,
            saveEdit: saveEdit,
            formatSyncTime: formatSyncTime,
            onCreated: onCreated,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
