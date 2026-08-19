/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, nextTick, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowLeft, Delete, Finished, Search, Clock, Plus, Loading, MagicStick } from '@element-plus/icons-vue';
import { useUserStore } from '@/stores/user';
import dagre from 'dagre';
import { getModel, updateModel, createModel, previewModel, saveOutputFields, publishModelV2, listModelVersions, previewModelV2, } from '@/api/warehouse';
import CalculatedFieldBridge from '@/components/formula/CalculatedFieldBridge.vue';
import { datasetsApi } from '@/api/datasets';
const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const modelId = route.params.id ? Number(route.params.id) : null;
// 计算字段弹窗
const cfDialogVisible = ref(false);
const cfLoading = ref(false);
function onCalculatedFieldSaved(_field) {
    cfDialogVisible.value = false;
    ElMessage.success('计算字段已保存，请刷新输出字段列表');
}
const isNew = !modelId;
const canEdit = computed(() => isNew ? userStore.hasOp('warehouse.assets', 'C') : userStore.hasOp('warehouse.assets', 'U'));
const form = ref({ label: '', warehouse_layer: 'DWD', subject_area: '', business_definition: '', owner_name: '' });
const loading = ref(false);
const saving = ref(false);
const error = ref(null);
const LAYER_LABELS = { ODS: 'ODS', DWD: 'DWD', DWS: 'DWS', ADS: 'ADS' };
const LAYER_COLORS = { ODS: '#8b9dc3', DWD: '#5a9e6f', DWS: '#d4a24e', ADS: '#c4685c' };
const JOIN_COLORS = { left: '#5a9e6f', inner: '#3b6ff5', right: '#d4a24e' };
const NODE_W = 200;
const NODE_H = 52;
const tables = ref([]);
const relations = ref([]);
const availableTables = ref([]);
const tableSearch = ref('');
const filteredTables = computed(() => {
    const m = new Set(tables.value.map(t => t.table_name));
    return availableTables.value.filter(t => !m.has(t.table_name) && (tableSearch.value ? t.table_label.includes(tableSearch.value) || t.table_name.includes(tableSearch.value) || t.dataset_code.includes(tableSearch.value.toUpperCase()) : true));
});
const selectedNode = ref(null);
const selectedEdge = ref(null);
const currentEdge = computed(() => selectedEdge.value !== null ? relations.value[selectedEdge.value] : null);
const drawerVisible = ref(false);
const outputFields = ref([]);
const previewData = ref(null);
const previewLoading = ref(false);
const previewV2 = ref(null);
const versions = ref([]);
const versionVisible = ref(false);
const activeNames = ref([]);
const rightTab = ref('fields');
function isSingleTableDataset(ds) {
    const isNormalizedSingleTable = ds.name.startsWith('ds_');
    const isLegacySingleTable = ds.name.startsWith('\u5355\u8868\u6570\u636e\u96c6');
    return (ds.is_active !== false &&
        (isNormalizedSingleTable || isLegacySingleTable) &&
        ds.tables?.length === 1 &&
        ds.tables[0]?.alias === 'current' &&
        (!ds.relations || ds.relations.length === 0));
}
function formatDatasetCode(ds) {
    return ds.name.startsWith('ds_') ? ds.name.toUpperCase() : `DS${String(ds.id).padStart(4, '0')}`;
}
function formatTableDatasetCode(tableName) {
    return `DS_${tableName}`.toUpperCase();
}
function isCodeLikeLabel(label, tableName) {
    const v = (label || '').trim();
    return !v || v === tableName || v.toLowerCase() === tableName.toLowerCase() || v.toLowerCase().startsWith('ds_');
}
function readableTableLabel(tableName) {
    return tableName
        .replace(/^dwd_/i, '')
        .replace(/^ods_/i, '')
        .replace(/^dim_/i, '')
        .split('_')
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ') || tableName;
}
function resolveNodeLabel(asset, tableName, preferredLabel) {
    if (!isCodeLikeLabel(preferredLabel, tableName))
        return preferredLabel.trim();
    if (!isCodeLikeLabel(asset?.table_label, tableName))
        return asset.table_label;
    return readableTableLabel(tableName);
}
function resolveNodeDatasetCode(asset, tableName, preferredCode) {
    return preferredCode || asset?.dataset_code || formatTableDatasetCode(tableName);
}
function resolveNodeLayer(asset, tableName, preferredLayer) {
    if (preferredLayer)
        return preferredLayer;
    if (asset?.warehouse_layer)
        return asset.warehouse_layer;
    const lower = tableName.toLowerCase();
    if (lower.startsWith('dwd_'))
        return 'DWD';
    if (lower.startsWith('dws_'))
        return 'DWS';
    if (lower.startsWith('ads_'))
        return 'ADS';
    if (lower.startsWith('ods_'))
        return 'ODS';
    return 'DWD';
}
function makeModelCode(label) {
    const suffix = Date.now().toString(36);
    const ascii = (label || 'model').trim().toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return `model_${ascii || suffix}_${suffix}`.slice(0, 64);
}
// ==================== 画布缩放 ====================
const zoom = ref(0.95);
const panX = ref(0);
const panY = ref(0);
const isPanning = ref(false);
const panStart = ref({ x: 0, y: 0, px: 0, py: 0 });
function onWheel(e) {
    e.preventDefault();
    const d = e.deltaY > 0 ? 0.9 : 1.1;
    zoom.value = Math.min(3, Math.max(0.15, zoom.value * d));
}
function onPanStart(e) {
    if (e.target.closest('.vm-nd'))
        return;
    isPanning.value = true;
    panStart.value = { x: e.clientX, y: e.clientY, px: panX.value, py: panY.value };
    window.addEventListener('mousemove', onPanMoveGlobal);
    window.addEventListener('mouseup', onPanEndGlobal);
}
function onPanMoveGlobal(e) {
    if (!isPanning.value)
        return;
    panX.value = panStart.value.px + (e.clientX - panStart.value.x);
    panY.value = panStart.value.py + (e.clientY - panStart.value.y);
}
function onPanEndGlobal() { isPanning.value = false; window.removeEventListener('mousemove', onPanMoveGlobal); window.removeEventListener('mouseup', onPanEndGlobal); }
function resetView() { zoom.value = 0.95; panX.value = 0; panY.value = 0; }
// ==================== 连线 ====================
const connecting = ref(null);
const hoverTarget = ref(null);
const fadingLine = ref(false);
const dragNode = ref(null);
const dragStart = ref({ x: 0, y: 0, nx: 0, ny: 0 });
function connectedAliases(alias) {
    const set = new Set();
    for (const r of relations.value) {
        if (r.from === alias)
            set.add(r.to);
        if (r.to === alias)
            set.add(r.from);
    }
    return set;
}
function startConnect(e, alias) {
    e.stopPropagation();
    e.preventDefault();
    const n = tables.value.find(t => t.alias === alias);
    if (!n)
        return;
    connecting.value = { from: alias, mx: e.clientX, my: e.clientY };
}
function onMove(e) {
    if (dragNode.value) {
        const n = tables.value.find(t => t.alias === dragNode.value);
        if (!n)
            return;
        n.x = Math.round(dragStart.value.nx + (e.clientX - dragStart.value.x) / zoom.value);
        n.y = Math.round(dragStart.value.ny + (e.clientY - dragStart.value.y) / zoom.value);
    }
    if (connecting.value) {
        const cvEl = document.querySelector('.vm-cv-inner');
        if (!cvEl)
            return;
        const r = cvEl.getBoundingClientRect();
        const mx = (e.clientX - r.left) / zoom.value;
        const my = (e.clientY - r.top) / zoom.value;
        connecting.value.mx = mx;
        connecting.value.my = my;
        let snapped = false;
        for (const t of tables.value) {
            if (t.alias === connecting.value.from)
                continue;
            const lx = t.x;
            const ly = t.y + NODE_H / 2;
            if (Math.hypot(mx - lx, my - ly) < 60) {
                connecting.value.mx = lx;
                connecting.value.my = ly;
                hoverTarget.value = t.alias;
                snapped = true;
                break;
            }
        }
        if (!snapped)
            hoverTarget.value = null;
    }
}
function onUp() {
    if (connecting.value && hoverTarget.value) {
        const from = connecting.value.from;
        const to = hoverTarget.value;
        if (!relations.value.some(r => (r.from === from && r.to === to) || (r.from === to && r.to === from))) {
            relations.value.push({ from, to, join_type: 'left', cardinality: '1:N', keys: [{ left: '', right: '' }] });
            autoLayout();
        }
        finishConnect();
    }
    else if (connecting.value) {
        fadingLine.value = true;
        setTimeout(() => { connecting.value = null; fadingLine.value = false; }, 200);
    }
    else {
        dragNode.value = null;
        hoverTarget.value = null;
    }
}
function finishConnect() { dragNode.value = null; connecting.value = null; hoverTarget.value = null; }
function onDragStart(e, alias) { if (e.button !== 0)
    return; e.preventDefault(); const n = tables.value.find(t => t.alias === alias); if (!n)
    return; dragNode.value = alias; dragStart.value = { x: e.clientX, y: e.clientY, nx: n.x, ny: n.y }; }
// ==================== 边路由 ====================
function edgeEndpoints(rel) {
    const a = tables.value.find(t => t.alias === rel.from), b = tables.value.find(t => t.alias === rel.to);
    if (!a || !b)
        return null;
    const stub = 28;
    const sy = a.y + NODE_H / 2;
    const ty = b.y + NODE_H / 2;
    const vx = a.x + NODE_W + stub; // 垂直主干 X
    return { sx: a.x + NODE_W, sy, tx: b.x, ty, vx };
}
function edgePath(ep) {
    return `M ${ep.sx} ${ep.sy} L ${ep.vx} ${ep.sy} L ${ep.vx} ${ep.ty} L ${ep.tx} ${ep.ty}`;
}
// ==================== 布局 ====================
function autoLayout() {
    if (!tables.value.length)
        return;
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 180, marginx: 50, marginy: 50 });
    for (const t of tables.value)
        g.setNode(t.alias, { width: NODE_W, height: NODE_H });
    for (const r of relations.value) {
        if (r.from && r.to)
            g.setEdge(r.from, r.to);
    }
    dagre.layout(g);
    for (const t of tables.value) {
        const pos = g.node(t.alias);
        if (pos) {
            t.x = pos.x - NODE_W / 2;
            t.y = pos.y - NODE_H / 2;
        }
    }
}
// ==================== 表操作 ====================
async function addTable(tn) {
    const a = availableTables.value.find(t => t.table_name === tn);
    if (!a)
        return;
    let cols = [];
    try {
        const { listAssetColumns } = await import('@/api/warehouse');
        const r = await listAssetColumns(tn);
        cols = (r.columns || []).map((c) => ({ code: c.column_code, label: c.column_label || c.column_code }));
    }
    catch { }
    tables.value.push({ table_name: tn, alias: tn, label: a.table_label, dataset_code: a.dataset_code, layer: a.warehouse_layer, x: 0, y: 0, columns: cols });
    await nextTick();
    autoLayout();
}
function removeTable(alias) {
    tables.value = tables.value.filter(t => t.alias !== alias);
    relations.value = relations.value.filter(r => r.from !== alias && r.to !== alias);
    if (selectedNode.value === alias) {
        selectedNode.value = null;
        drawerVisible.value = false;
    }
    autoLayout();
}
function selectNodeFn(alias) { selectedNode.value = alias; selectedEdge.value = null; drawerVisible.value = true; }
function selectEdgeFn(i) { selectedEdge.value = i; selectedNode.value = null; drawerVisible.value = true; }
function removeRelation(i) { relations.value.splice(i, 1); selectedEdge.value = null; drawerVisible.value = false; autoLayout(); }
function addKey(ri) { relations.value[ri].keys.push({ left: '', right: '' }); }
function removeKey(ri, ki) { relations.value[ri].keys.splice(ki, 1); }
function addOF() { outputFields.value.push({ source_alias: tables.value[0]?.alias || '', source_column: '', output_code: '', output_label: '', data_type: 'string', agg_role: 'dimension', is_sensitive: false, is_visible: true, display_order: outputFields.value.length }); }
function removeOF(i) { outputFields.value.splice(i, 1); }
// ==================== 保存/发布/预览 ====================
async function saveDraft() {
    saving.value = true;
    try {
        const tablePayload = tables.value.map(t => ({ table_name: t.table_name, alias: t.alias }));
        const relationPayload = relations.value.filter(r => r.from && r.to).map(r => ({ left_alias: r.from, right_alias: r.to, join_type: r.join_type, cardinality: r.cardinality, left_keys: r.keys.filter(k => k.left).map(k => k.left), right_keys: r.keys.filter(k => k.right).map(k => k.right) }));
        if (modelId) {
            await updateModel(modelId, { label: form.value.label, warehouse_layer: form.value.warehouse_layer, subject_area: form.value.subject_area || undefined, business_definition: form.value.business_definition || undefined, owner_name: form.value.owner_name || undefined, tables: tablePayload, relations: relationPayload });
            const v = outputFields.value.filter(f => f.output_code && f.output_label);
            if (v.length)
                await saveOutputFields(modelId, v);
            await load();
            ElMessage.success('已更新');
        }
        else {
            const res = await createModel({ name: makeModelCode(form.value.label), label: form.value.label, warehouse_layer: form.value.warehouse_layer, subject_area: form.value.subject_area || undefined, business_definition: form.value.business_definition || undefined, owner_name: form.value.owner_name || undefined, tables: tablePayload, relations: relationPayload });
            ElMessage.success(`已创建 ID:${res.id}`);
            router.replace(`/warehouse/modeling/visual/${res.id}`);
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
    if (!modelId) {
        ElMessage.warning('请先保存');
        return;
    }
    try {
        await ElMessageBox.confirm('确定发布？', '确认', { type: 'info' });
        const v = outputFields.value.filter(f => f.output_code && f.output_label);
        if (v.length)
            await saveOutputFields(modelId, v);
        const res = await publishModelV2(modelId);
        ElMessage.success(`已发布 v${res.version}`);
        router.push('/warehouse/modeling');
    }
    catch { }
}
async function doPreview() { if (!modelId)
    return; previewLoading.value = true; try {
    previewData.value = await previewModel(modelId);
    previewV2.value = await previewModelV2(modelId);
    rightTab.value = 'preview';
}
catch {
    ElMessage.error('预览失败');
}
finally {
    previewLoading.value = false;
} }
async function showVersions() { if (!modelId)
    return; try {
    versions.value = await listModelVersions(modelId);
    versionVisible.value = true;
}
catch {
    ElMessage.error('加载版本历史失败');
} }
function goBack() { router.back(); }
// ==================== 加载 ====================
async function load() {
    loading.value = true;
    error.value = null;
    tables.value = [];
    relations.value = [];
    outputFields.value = [];
    try {
        const datasets = await datasetsApi.list();
        availableTables.value = (datasets || []).filter(isSingleTableDataset).map(ds => ({ table_name: ds.tables[0].table_name, table_label: ds.label || ds.tables[0].table_label || ds.tables[0].table_name, dataset_code: formatDatasetCode(ds), warehouse_layer: ds.warehouse_layer || 'DWD' }));
        if (modelId) {
            const d = await getModel(modelId);
            form.value = { label: d.label || d.name, warehouse_layer: d.warehouse_layer, subject_area: d.subject_area || '', business_definition: d.business_definition || '', owner_name: d.owner_name || '' };
            for (const t of d.tables) {
                const asset = availableTables.value.find(a => a.table_name === t.table_name);
                let cols = [];
                try {
                    const { listAssetColumns } = await import('@/api/warehouse');
                    const r = await listAssetColumns(t.table_name);
                    cols = (r.columns || []).map((c) => ({ code: c.column_code, label: c.column_label || c.column_code }));
                }
                catch { }
                const preferredLabel = t.dataset_label || t.table_label;
                tables.value.push({ id: t.id, table_name: t.table_name, alias: t.alias, label: resolveNodeLabel(asset, t.table_name, preferredLabel), dataset_code: resolveNodeDatasetCode(asset, t.table_name, t.dataset_code), layer: resolveNodeLayer(asset, t.table_name, t.warehouse_layer), x: 0, y: 0, columns: cols });
            }
            relations.value = d.relations.map((r) => ({ id: r.id, from: r.left_alias, to: r.right_alias, join_type: r.join_type, cardinality: r.cardinality, keys: r.keys || [] }));
            outputFields.value = d.output_fields.map((f) => ({ source_alias: f.source_alias, source_column: f.source_column, output_code: f.output_code, output_label: f.output_label, data_type: f.data_type, description: f.description, agg_role: f.agg_role, is_sensitive: f.is_sensitive, is_visible: f.is_visible, display_order: f.display_order }));
            await nextTick();
            autoLayout();
        }
    }
    catch (e) {
        error.value = e?.response?.data?.detail || '加载失败';
    }
    finally {
        loading.value = false;
    }
}
onMounted(load);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['vm-to']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-svg']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-svg']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-svg']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-nd']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-nd']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-nd']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-nd']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-nd']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-ndel']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-port']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-port']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-port']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-nd']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-port']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-nd']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-port']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-port']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-port']} */ ;
/** @type {__VLS_StyleScopedClasses['linked']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-nd']} */ ;
/** @type {__VLS_StyleScopedClasses['connecting']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-port']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-nd']} */ ;
/** @type {__VLS_StyleScopedClasses['h']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-port']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-fg']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ onMousemove: (__VLS_ctx.onMove) },
    ...{ onMouseup: (__VLS_ctx.onUp) },
    ...{ onMouseleave: (__VLS_ctx.onUp) },
    ...{ class: "vm-root" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "vm-bar" },
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
    onClick: (__VLS_ctx.goBack)
};
__VLS_3.slots.default;
var __VLS_3;
const __VLS_8 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    modelValue: (__VLS_ctx.form.label),
    placeholder: "模型名称",
    size: "small",
    ...{ style: {} },
}));
const __VLS_10 = __VLS_9({
    modelValue: (__VLS_ctx.form.label),
    placeholder: "模型名称",
    size: "small",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
const __VLS_12 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    modelValue: (__VLS_ctx.form.warehouse_layer),
    size: "small",
    ...{ style: {} },
}));
const __VLS_14 = __VLS_13({
    modelValue: (__VLS_ctx.form.warehouse_layer),
    size: "small",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
__VLS_15.slots.default;
for (const [v, k] of __VLS_getVForSourceType((__VLS_ctx.LAYER_LABELS))) {
    const __VLS_16 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
        key: (k),
        label: (v),
        value: (k),
    }));
    const __VLS_18 = __VLS_17({
        key: (k),
        label: (v),
        value: (k),
    }, ...__VLS_functionalComponentArgsRest(__VLS_17));
}
var __VLS_15;
const __VLS_20 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    modelValue: (__VLS_ctx.form.subject_area),
    placeholder: "主题域",
    size: "small",
    ...{ style: {} },
}));
const __VLS_22 = __VLS_21({
    modelValue: (__VLS_ctx.form.subject_area),
    placeholder: "主题域",
    size: "small",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
const __VLS_24 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    modelValue: (__VLS_ctx.form.owner_name),
    placeholder: "负责人",
    size: "small",
    ...{ style: {} },
}));
const __VLS_26 = __VLS_25({
    modelValue: (__VLS_ctx.form.owner_name),
    placeholder: "负责人",
    size: "small",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
__VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
    ...{ style: {} },
});
const __VLS_28 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    ...{ 'onClick': {} },
    size: "small",
}));
const __VLS_30 = __VLS_29({
    ...{ 'onClick': {} },
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
let __VLS_32;
let __VLS_33;
let __VLS_34;
const __VLS_35 = {
    onClick: (...[$event]) => {
        __VLS_ctx.autoLayout();
    }
};
__VLS_31.slots.default;
var __VLS_31;
const __VLS_36 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
    ...{ 'onClick': {} },
    size: "small",
}));
const __VLS_38 = __VLS_37({
    ...{ 'onClick': {} },
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
let __VLS_40;
let __VLS_41;
let __VLS_42;
const __VLS_43 = {
    onClick: (...[$event]) => {
        __VLS_ctx.resetView();
    }
};
__VLS_39.slots.default;
var __VLS_39;
if (__VLS_ctx.canEdit) {
    const __VLS_44 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
        ...{ 'onClick': {} },
        size: "small",
        loading: (__VLS_ctx.saving),
    }));
    const __VLS_46 = __VLS_45({
        ...{ 'onClick': {} },
        size: "small",
        loading: (__VLS_ctx.saving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_45));
    let __VLS_48;
    let __VLS_49;
    let __VLS_50;
    const __VLS_51 = {
        onClick: (__VLS_ctx.saveDraft)
    };
    __VLS_47.slots.default;
    var __VLS_47;
}
if (__VLS_ctx.modelId && __VLS_ctx.userStore.hasOp('warehouse.assets', 'U')) {
    const __VLS_52 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
        ...{ 'onClick': {} },
        size: "small",
        type: "success",
        icon: (__VLS_ctx.Finished),
    }));
    const __VLS_54 = __VLS_53({
        ...{ 'onClick': {} },
        size: "small",
        type: "success",
        icon: (__VLS_ctx.Finished),
    }, ...__VLS_functionalComponentArgsRest(__VLS_53));
    let __VLS_56;
    let __VLS_57;
    let __VLS_58;
    const __VLS_59 = {
        onClick: (__VLS_ctx.doPublish)
    };
    __VLS_55.slots.default;
    var __VLS_55;
}
if (__VLS_ctx.modelId) {
    const __VLS_60 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
        ...{ 'onClick': {} },
        size: "small",
        icon: (__VLS_ctx.Clock),
    }));
    const __VLS_62 = __VLS_61({
        ...{ 'onClick': {} },
        size: "small",
        icon: (__VLS_ctx.Clock),
    }, ...__VLS_functionalComponentArgsRest(__VLS_61));
    let __VLS_64;
    let __VLS_65;
    let __VLS_66;
    const __VLS_67 = {
        onClick: (__VLS_ctx.showVersions)
    };
    __VLS_63.slots.default;
    var __VLS_63;
}
const __VLS_68 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
    ...{ 'onClick': {} },
    size: "small",
    loading: (__VLS_ctx.previewLoading),
}));
const __VLS_70 = __VLS_69({
    ...{ 'onClick': {} },
    size: "small",
    loading: (__VLS_ctx.previewLoading),
}, ...__VLS_functionalComponentArgsRest(__VLS_69));
let __VLS_72;
let __VLS_73;
let __VLS_74;
const __VLS_75 = {
    onClick: (__VLS_ctx.doPreview)
};
__VLS_71.slots.default;
var __VLS_71;
if (__VLS_ctx.error) {
    const __VLS_76 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
        type: "error",
        title: (__VLS_ctx.error),
        showIcon: true,
        closable: (false),
        ...{ style: {} },
    }));
    const __VLS_78 = __VLS_77({
        type: "error",
        title: (__VLS_ctx.error),
        showIcon: true,
        closable: (false),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_77));
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "vm-body" },
});
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "vm-left" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "vm-lt" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "vm-ls" },
});
const __VLS_80 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
    modelValue: (__VLS_ctx.tableSearch),
    placeholder: "搜索...",
    size: "small",
    prefixIcon: (__VLS_ctx.Search),
    clearable: true,
}));
const __VLS_82 = __VLS_81({
    modelValue: (__VLS_ctx.tableSearch),
    placeholder: "搜索...",
    size: "small",
    prefixIcon: (__VLS_ctx.Search),
    clearable: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_81));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "vm-ll" },
});
for (const [t] of __VLS_getVForSourceType((__VLS_ctx.filteredTables))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.addTable(t.table_name);
            } },
        key: (t.table_name),
        ...{ class: "vm-to" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
        ...{ class: "vm-dot" },
        ...{ style: ({ background: __VLS_ctx.LAYER_COLORS[t.warehouse_layer] || '#909399' }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "vm-oi" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "vm-on" },
    });
    (t.table_label);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "vm-op" },
    });
    (t.dataset_code);
}
if (!__VLS_ctx.filteredTables.length) {
    const __VLS_84 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
        description: "无表可添加",
        imageSize: (48),
    }));
    const __VLS_86 = __VLS_85({
        description: "无表可添加",
        imageSize: (48),
    }, ...__VLS_functionalComponentArgsRest(__VLS_85));
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ onWheel: (__VLS_ctx.onWheel) },
    ...{ onMousedown: (__VLS_ctx.onPanStart) },
    ...{ class: "vm-cv" },
    ...{ style: ({ cursor: __VLS_ctx.isPanning ? 'grabbing' : 'grab' }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "vm-cv-inner" },
    ...{ style: ({ transform: `translate(${__VLS_ctx.panX}px,${__VLS_ctx.panY}px) scale(${__VLS_ctx.zoom})`, transformOrigin: '0 0', width: Math.max(...__VLS_ctx.tables.map(t => t.x + __VLS_ctx.NODE_W), 800) + 200 + 'px', height: Math.max(...__VLS_ctx.tables.map(t => t.y + __VLS_ctx.NODE_H), 500) + 200 + 'px' }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    ...{ class: "vm-svg" },
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.defs, __VLS_intrinsicElements.defs)({});
for (const [r, i] of __VLS_getVForSourceType((__VLS_ctx.relations))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.marker, __VLS_intrinsicElements.marker)({
        key: ('m' + i),
        id: ('m' + i),
        viewBox: "0 0 10 7",
        refX: "9",
        refY: "3.5",
        markerWidth: "7",
        markerHeight: "5",
        orient: "auto",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.polygon)({
        points: "0 0, 10 3.5, 0 7",
        fill: (__VLS_ctx.JOIN_COLORS[r.join_type] || '#909399'),
    });
}
for (const [r, i] of __VLS_getVForSourceType((__VLS_ctx.relations))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.g, __VLS_intrinsicElements.g)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.selectEdgeFn(i);
                __VLS_ctx.selectedNode = null;
            } },
        key: ('e' + i),
        ...{ style: {} },
    });
    if (__VLS_ctx.edgeEndpoints(r)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: (__VLS_ctx.edgePath(__VLS_ctx.edgeEndpoints(r))),
            fill: "none",
            stroke: "transparent",
            'stroke-width': "20",
            'stroke-linejoin': "round",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: (__VLS_ctx.edgePath(__VLS_ctx.edgeEndpoints(r))),
            fill: "none",
            stroke: (__VLS_ctx.selectedEdge === i ? '#3b6ff5' : (__VLS_ctx.JOIN_COLORS[r.join_type] || '#909399')),
            'stroke-width': (__VLS_ctx.selectedEdge === i ? 2.5 : 2),
            'stroke-linejoin': "round",
            'stroke-linecap': "round",
            'marker-end': (`url(#m${i})`),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.rect)({
            x: ((__VLS_ctx.edgeEndpoints(r).vx + __VLS_ctx.edgeEndpoints(r).tx) / 2 - 40),
            y: (__VLS_ctx.edgeEndpoints(r).ty - 12),
            width: "80",
            height: "24",
            rx: "4",
            fill: "white",
            stroke: (__VLS_ctx.selectedEdge === i ? '#3b6ff5' : (__VLS_ctx.JOIN_COLORS[r.join_type] || '#909399')),
            'stroke-width': (1),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.text, __VLS_intrinsicElements.text)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.edgeEndpoints(r)))
                        return;
                    __VLS_ctx.selectEdgeFn(i);
                    __VLS_ctx.selectedNode = null;
                } },
            x: ((__VLS_ctx.edgeEndpoints(r).vx + __VLS_ctx.edgeEndpoints(r).tx) / 2),
            y: (__VLS_ctx.edgeEndpoints(r).ty + 4),
            'text-anchor': "middle",
            'font-size': "9",
            'font-weight': "700",
            fill: (__VLS_ctx.JOIN_COLORS[r.join_type] || '#606266'),
            ...{ style: {} },
        });
        (r.join_type.toUpperCase());
    }
}
if (__VLS_ctx.connecting) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.line)({
        x1: ((__VLS_ctx.tables.find(t => t.alias === __VLS_ctx.connecting.from)?.x || 0) + __VLS_ctx.NODE_W),
        y1: ((__VLS_ctx.tables.find(t => t.alias === __VLS_ctx.connecting.from)?.y || 0) + __VLS_ctx.NODE_H / 2),
        x2: (__VLS_ctx.connecting.mx),
        y2: (__VLS_ctx.connecting.my),
        stroke: (__VLS_ctx.hoverTarget ? '#30a46c' : '#3b6ff5'),
        'stroke-width': (2),
        'stroke-dasharray': (__VLS_ctx.hoverTarget ? 'none' : '6,4'),
        ...{ style: {} },
    });
}
if (__VLS_ctx.connecting && __VLS_ctx.hoverTarget) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.circle, __VLS_intrinsicElements.circle)({
        cx: (__VLS_ctx.connecting.mx),
        cy: (__VLS_ctx.connecting.my),
        r: "5",
        fill: "#30a46c",
        opacity: "0.8",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.animate)({
        attributeName: "r",
        values: "5;7;5",
        dur: "0.8s",
        repeatCount: "indefinite",
    });
}
for (const [t] of __VLS_getVForSourceType((__VLS_ctx.tables))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onMousedown: (...[$event]) => {
                __VLS_ctx.onDragStart($event, t.alias);
            } },
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.selectNodeFn(t.alias);
                __VLS_ctx.selectedEdge = null;
            } },
        key: (t.alias),
        ...{ class: "vm-nd" },
        'data-alias': (t.alias),
        ...{ class: ({ s: __VLS_ctx.selectedNode === t.alias, h: __VLS_ctx.hoverTarget === t.alias, connecting: __VLS_ctx.connecting?.from === t.alias }) },
        ...{ style: ({ left: t.x + 'px', top: t.y + 'px', width: __VLS_ctx.NODE_W + 'px', background: (__VLS_ctx.LAYER_COLORS[t.layer || 'ODS'] || '#909399') + '20', borderColor: __VLS_ctx.hoverTarget === t.alias ? '#30a46c' : __VLS_ctx.selectedNode === t.alias ? '#3b6ff5' : (__VLS_ctx.LAYER_COLORS[t.layer || 'ODS'] || '#909399') + '55' }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
        ...{ onMousedown: (...[$event]) => {
                __VLS_ctx.startConnect($event, t.alias);
            } },
        ...{ class: "vm-port vm-port-left" },
        ...{ class: ({ linked: __VLS_ctx.connectedAliases(t.alias).size > 0 }) },
        title: "拖线连接",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "vm-nb" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "vm-nn" },
        title: (t.label || t.table_name),
    });
    (t.label || t.table_name);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "vm-nc" },
        title: (t.dataset_code || t.table_name),
    });
    (t.dataset_code || t.table_name);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
        ...{ onMousedown: (...[$event]) => {
                __VLS_ctx.startConnect($event, t.alias);
            } },
        ...{ class: "vm-port vm-port-right" },
        ...{ class: ({ linked: __VLS_ctx.connectedAliases(t.alias).size > 0 }) },
        title: "拖线连接",
    });
    const __VLS_88 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
        ...{ 'onMousedown': {} },
        ...{ 'onClick': {} },
        ...{ class: "vm-ndel" },
        text: true,
        size: "small",
        type: "danger",
    }));
    const __VLS_90 = __VLS_89({
        ...{ 'onMousedown': {} },
        ...{ 'onClick': {} },
        ...{ class: "vm-ndel" },
        text: true,
        size: "small",
        type: "danger",
    }, ...__VLS_functionalComponentArgsRest(__VLS_89));
    let __VLS_92;
    let __VLS_93;
    let __VLS_94;
    const __VLS_95 = {
        onMousedown: () => { }
    };
    const __VLS_96 = {
        onClick: (...[$event]) => {
            __VLS_ctx.removeTable(t.alias);
        }
    };
    __VLS_91.slots.default;
    const __VLS_97 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_98 = __VLS_asFunctionalComponent(__VLS_97, new __VLS_97({}));
    const __VLS_99 = __VLS_98({}, ...__VLS_functionalComponentArgsRest(__VLS_98));
    __VLS_100.slots.default;
    const __VLS_101 = {}.Delete;
    /** @type {[typeof __VLS_components.Delete, ]} */ ;
    // @ts-ignore
    const __VLS_102 = __VLS_asFunctionalComponent(__VLS_101, new __VLS_101({}));
    const __VLS_103 = __VLS_102({}, ...__VLS_functionalComponentArgsRest(__VLS_102));
    var __VLS_100;
    var __VLS_91;
}
if (!__VLS_ctx.tables.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "vm-empty-hint" },
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "vm-right-panel" },
});
const __VLS_105 = {}.ElTabs;
/** @type {[typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, ]} */ ;
// @ts-ignore
const __VLS_106 = __VLS_asFunctionalComponent(__VLS_105, new __VLS_105({
    modelValue: (__VLS_ctx.rightTab),
    ...{ class: "vm-tabs" },
    stretch: true,
}));
const __VLS_107 = __VLS_106({
    modelValue: (__VLS_ctx.rightTab),
    ...{ class: "vm-tabs" },
    stretch: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_106));
__VLS_108.slots.default;
const __VLS_109 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_110 = __VLS_asFunctionalComponent(__VLS_109, new __VLS_109({
    label: "输出字段",
    name: "fields",
}));
const __VLS_111 = __VLS_110({
    label: "输出字段",
    name: "fields",
}, ...__VLS_functionalComponentArgsRest(__VLS_110));
__VLS_112.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "vm-rp-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ style: {} },
});
(__VLS_ctx.outputFields.length);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
if (__VLS_ctx.modelId) {
    const __VLS_113 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_114 = __VLS_asFunctionalComponent(__VLS_113, new __VLS_113({
        ...{ 'onClick': {} },
        size: "small",
        icon: (__VLS_ctx.MagicStick),
    }));
    const __VLS_115 = __VLS_114({
        ...{ 'onClick': {} },
        size: "small",
        icon: (__VLS_ctx.MagicStick),
    }, ...__VLS_functionalComponentArgsRest(__VLS_114));
    let __VLS_117;
    let __VLS_118;
    let __VLS_119;
    const __VLS_120 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.modelId))
                return;
            __VLS_ctx.cfDialogVisible = true;
        }
    };
    __VLS_116.slots.default;
    var __VLS_116;
}
const __VLS_121 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_122 = __VLS_asFunctionalComponent(__VLS_121, new __VLS_121({
    ...{ 'onClick': {} },
    size: "small",
    icon: (__VLS_ctx.Plus),
}));
const __VLS_123 = __VLS_122({
    ...{ 'onClick': {} },
    size: "small",
    icon: (__VLS_ctx.Plus),
}, ...__VLS_functionalComponentArgsRest(__VLS_122));
let __VLS_125;
let __VLS_126;
let __VLS_127;
const __VLS_128 = {
    onClick: (__VLS_ctx.addOF)
};
__VLS_124.slots.default;
var __VLS_124;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "vm-of-list" },
});
for (const [f, i] of __VLS_getVForSourceType((__VLS_ctx.outputFields))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (i),
        ...{ class: "vm-of-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "vm-of-row" },
    });
    const __VLS_129 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_130 = __VLS_asFunctionalComponent(__VLS_129, new __VLS_129({
        modelValue: (__VLS_ctx.outputFields[i].source_alias),
        size: "small",
        placeholder: "来源表",
        ...{ style: {} },
    }));
    const __VLS_131 = __VLS_130({
        modelValue: (__VLS_ctx.outputFields[i].source_alias),
        size: "small",
        placeholder: "来源表",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_130));
    const __VLS_133 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_134 = __VLS_asFunctionalComponent(__VLS_133, new __VLS_133({
        modelValue: (__VLS_ctx.outputFields[i].source_column),
        size: "small",
        placeholder: "字段",
        ...{ style: {} },
    }));
    const __VLS_135 = __VLS_134({
        modelValue: (__VLS_ctx.outputFields[i].source_column),
        size: "small",
        placeholder: "字段",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_134));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: {} },
    });
    const __VLS_137 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_138 = __VLS_asFunctionalComponent(__VLS_137, new __VLS_137({
        modelValue: (__VLS_ctx.outputFields[i].output_code),
        size: "small",
        placeholder: "编码",
        ...{ style: {} },
    }));
    const __VLS_139 = __VLS_138({
        modelValue: (__VLS_ctx.outputFields[i].output_code),
        size: "small",
        placeholder: "编码",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_138));
    const __VLS_141 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_142 = __VLS_asFunctionalComponent(__VLS_141, new __VLS_141({
        modelValue: (__VLS_ctx.outputFields[i].output_label),
        size: "small",
        placeholder: "名称",
        ...{ style: {} },
    }));
    const __VLS_143 = __VLS_142({
        modelValue: (__VLS_ctx.outputFields[i].output_label),
        size: "small",
        placeholder: "名称",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_142));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "vm-of-row2" },
    });
    const __VLS_145 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_146 = __VLS_asFunctionalComponent(__VLS_145, new __VLS_145({
        modelValue: (__VLS_ctx.outputFields[i].data_type),
        size: "small",
        ...{ style: {} },
    }));
    const __VLS_147 = __VLS_146({
        modelValue: (__VLS_ctx.outputFields[i].data_type),
        size: "small",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_146));
    __VLS_148.slots.default;
    const __VLS_149 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_150 = __VLS_asFunctionalComponent(__VLS_149, new __VLS_149({
        label: "string",
        value: "string",
    }));
    const __VLS_151 = __VLS_150({
        label: "string",
        value: "string",
    }, ...__VLS_functionalComponentArgsRest(__VLS_150));
    const __VLS_153 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_154 = __VLS_asFunctionalComponent(__VLS_153, new __VLS_153({
        label: "number",
        value: "number",
    }));
    const __VLS_155 = __VLS_154({
        label: "number",
        value: "number",
    }, ...__VLS_functionalComponentArgsRest(__VLS_154));
    const __VLS_157 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_158 = __VLS_asFunctionalComponent(__VLS_157, new __VLS_157({
        label: "date",
        value: "date",
    }));
    const __VLS_159 = __VLS_158({
        label: "date",
        value: "date",
    }, ...__VLS_functionalComponentArgsRest(__VLS_158));
    var __VLS_148;
    const __VLS_161 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_162 = __VLS_asFunctionalComponent(__VLS_161, new __VLS_161({
        modelValue: (__VLS_ctx.outputFields[i].agg_role),
        size: "small",
        ...{ style: {} },
    }));
    const __VLS_163 = __VLS_162({
        modelValue: (__VLS_ctx.outputFields[i].agg_role),
        size: "small",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_162));
    __VLS_164.slots.default;
    const __VLS_165 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_166 = __VLS_asFunctionalComponent(__VLS_165, new __VLS_165({
        label: "维度",
        value: "dimension",
    }));
    const __VLS_167 = __VLS_166({
        label: "维度",
        value: "dimension",
    }, ...__VLS_functionalComponentArgsRest(__VLS_166));
    const __VLS_169 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_170 = __VLS_asFunctionalComponent(__VLS_169, new __VLS_169({
        label: "度量",
        value: "measure",
    }));
    const __VLS_171 = __VLS_170({
        label: "度量",
        value: "measure",
    }, ...__VLS_functionalComponentArgsRest(__VLS_170));
    var __VLS_164;
    const __VLS_173 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_174 = __VLS_asFunctionalComponent(__VLS_173, new __VLS_173({
        modelValue: (__VLS_ctx.outputFields[i].description),
        size: "small",
        placeholder: "描述",
        ...{ style: {} },
    }));
    const __VLS_175 = __VLS_174({
        modelValue: (__VLS_ctx.outputFields[i].description),
        size: "small",
        placeholder: "描述",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_174));
    const __VLS_177 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_178 = __VLS_asFunctionalComponent(__VLS_177, new __VLS_177({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
        type: "danger",
    }));
    const __VLS_179 = __VLS_178({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
        type: "danger",
    }, ...__VLS_functionalComponentArgsRest(__VLS_178));
    let __VLS_181;
    let __VLS_182;
    let __VLS_183;
    const __VLS_184 = {
        onClick: (...[$event]) => {
            __VLS_ctx.removeOF(i);
        }
    };
    __VLS_180.slots.default;
    var __VLS_180;
}
if (!__VLS_ctx.outputFields.length) {
    const __VLS_185 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_186 = __VLS_asFunctionalComponent(__VLS_185, new __VLS_185({
        description: "暂无输出字段",
        imageSize: (48),
    }));
    const __VLS_187 = __VLS_186({
        description: "暂无输出字段",
        imageSize: (48),
    }, ...__VLS_functionalComponentArgsRest(__VLS_186));
}
var __VLS_112;
const __VLS_189 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_190 = __VLS_asFunctionalComponent(__VLS_189, new __VLS_189({
    label: "预览",
    name: "preview",
}));
const __VLS_191 = __VLS_190({
    label: "预览",
    name: "preview",
}, ...__VLS_functionalComponentArgsRest(__VLS_190));
__VLS_192.slots.default;
if (__VLS_ctx.previewLoading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_193 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_194 = __VLS_asFunctionalComponent(__VLS_193, new __VLS_193({
        ...{ class: "is-loading" },
        size: (24),
    }));
    const __VLS_195 = __VLS_194({
        ...{ class: "is-loading" },
        size: (24),
    }, ...__VLS_functionalComponentArgsRest(__VLS_194));
    __VLS_196.slots.default;
    const __VLS_197 = {}.Loading;
    /** @type {[typeof __VLS_components.Loading, ]} */ ;
    // @ts-ignore
    const __VLS_198 = __VLS_asFunctionalComponent(__VLS_197, new __VLS_197({}));
    const __VLS_199 = __VLS_198({}, ...__VLS_functionalComponentArgsRest(__VLS_198));
    var __VLS_196;
}
else if (__VLS_ctx.previewData) {
    for (const [e] of __VLS_getVForSourceType(((__VLS_ctx.previewV2?.errors || [])))) {
        const __VLS_201 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_202 = __VLS_asFunctionalComponent(__VLS_201, new __VLS_201({
            key: (e.node_id),
            title: (`${e.node_id}: ${e.message}`),
            type: "error",
            showIcon: true,
            closable: (false),
            size: "small",
            ...{ style: {} },
        }));
        const __VLS_203 = __VLS_202({
            key: (e.node_id),
            title: (`${e.node_id}: ${e.message}`),
            type: "error",
            showIcon: true,
            closable: (false),
            size: "small",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_202));
    }
    if (__VLS_ctx.previewV2?.sql) {
        const __VLS_205 = {}.ElCollapse;
        /** @type {[typeof __VLS_components.ElCollapse, typeof __VLS_components.elCollapse, typeof __VLS_components.ElCollapse, typeof __VLS_components.elCollapse, ]} */ ;
        // @ts-ignore
        const __VLS_206 = __VLS_asFunctionalComponent(__VLS_205, new __VLS_205({
            modelValue: (__VLS_ctx.activeNames),
            ...{ style: {} },
        }));
        const __VLS_207 = __VLS_206({
            modelValue: (__VLS_ctx.activeNames),
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_206));
        __VLS_208.slots.default;
        const __VLS_209 = {}.ElCollapseItem;
        /** @type {[typeof __VLS_components.ElCollapseItem, typeof __VLS_components.elCollapseItem, typeof __VLS_components.ElCollapseItem, typeof __VLS_components.elCollapseItem, ]} */ ;
        // @ts-ignore
        const __VLS_210 = __VLS_asFunctionalComponent(__VLS_209, new __VLS_209({
            title: "SQL",
            name: "sql",
        }));
        const __VLS_211 = __VLS_210({
            title: "SQL",
            name: "sql",
        }, ...__VLS_functionalComponentArgsRest(__VLS_210));
        __VLS_212.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.pre, __VLS_intrinsicElements.pre)({
            ...{ class: "vm-sql" },
        });
        (__VLS_ctx.previewV2.sql);
        var __VLS_212;
        const __VLS_213 = {}.ElCollapseItem;
        /** @type {[typeof __VLS_components.ElCollapseItem, typeof __VLS_components.elCollapseItem, typeof __VLS_components.ElCollapseItem, typeof __VLS_components.elCollapseItem, ]} */ ;
        // @ts-ignore
        const __VLS_214 = __VLS_asFunctionalComponent(__VLS_213, new __VLS_213({
            title: "关系",
            name: "explain",
        }));
        const __VLS_215 = __VLS_214({
            title: "关系",
            name: "explain",
        }, ...__VLS_functionalComponentArgsRest(__VLS_214));
        __VLS_216.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.pre, __VLS_intrinsicElements.pre)({
            ...{ class: "vm-explain" },
        });
        (__VLS_ctx.previewV2.sql_explanation);
        var __VLS_216;
        var __VLS_208;
    }
    const __VLS_217 = {}.ElTable;
    /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
    // @ts-ignore
    const __VLS_218 = __VLS_asFunctionalComponent(__VLS_217, new __VLS_217({
        data: (__VLS_ctx.previewData.items),
        border: true,
        size: "small",
        maxHeight: "240",
    }));
    const __VLS_219 = __VLS_218({
        data: (__VLS_ctx.previewData.items),
        border: true,
        size: "small",
        maxHeight: "240",
    }, ...__VLS_functionalComponentArgsRest(__VLS_218));
    __VLS_220.slots.default;
    for (const [c] of __VLS_getVForSourceType((__VLS_ctx.previewData.columns))) {
        const __VLS_221 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_222 = __VLS_asFunctionalComponent(__VLS_221, new __VLS_221({
            key: (c),
            prop: (c),
            label: (c),
            minWidth: "70",
            showOverflowTooltip: true,
        }));
        const __VLS_223 = __VLS_222({
            key: (c),
            prop: (c),
            label: (c),
            minWidth: "70",
            showOverflowTooltip: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_222));
    }
    var __VLS_220;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    (__VLS_ctx.previewData.summary.main_count ?? '—');
    (__VLS_ctx.previewData.summary.result_count ?? '—');
    (__VLS_ctx.previewData.summary.unmatched_count ?? '—');
}
else {
    const __VLS_225 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_226 = __VLS_asFunctionalComponent(__VLS_225, new __VLS_225({
        description: "点击「预览」生成数据",
        imageSize: (48),
    }));
    const __VLS_227 = __VLS_226({
        description: "点击「预览」生成数据",
        imageSize: (48),
    }, ...__VLS_functionalComponentArgsRest(__VLS_226));
}
var __VLS_192;
var __VLS_108;
const __VLS_229 = {}.ElDrawer;
/** @type {[typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, ]} */ ;
// @ts-ignore
const __VLS_230 = __VLS_asFunctionalComponent(__VLS_229, new __VLS_229({
    ...{ 'onClose': {} },
    modelValue: (__VLS_ctx.drawerVisible),
    title: (__VLS_ctx.selectedNode ? '节点属性' : '关联属性'),
    size: "360px",
    direction: "rtl",
}));
const __VLS_231 = __VLS_230({
    ...{ 'onClose': {} },
    modelValue: (__VLS_ctx.drawerVisible),
    title: (__VLS_ctx.selectedNode ? '节点属性' : '关联属性'),
    size: "360px",
    direction: "rtl",
}, ...__VLS_functionalComponentArgsRest(__VLS_230));
let __VLS_233;
let __VLS_234;
let __VLS_235;
const __VLS_236 = {
    onClose: (...[$event]) => {
        __VLS_ctx.selectedNode = null;
        __VLS_ctx.selectedEdge = null;
    }
};
__VLS_232.slots.default;
if (__VLS_ctx.selectedNode) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "vm-fg" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    const __VLS_237 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_238 = __VLS_asFunctionalComponent(__VLS_237, new __VLS_237({
        modelValue: (__VLS_ctx.tables.find(t => t.alias === __VLS_ctx.selectedNode)?.label || __VLS_ctx.tables.find(t => t.alias === __VLS_ctx.selectedNode)?.table_name),
        size: "small",
        disabled: true,
    }));
    const __VLS_239 = __VLS_238({
        modelValue: (__VLS_ctx.tables.find(t => t.alias === __VLS_ctx.selectedNode)?.label || __VLS_ctx.tables.find(t => t.alias === __VLS_ctx.selectedNode)?.table_name),
        size: "small",
        disabled: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_238));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "vm-fg" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    const __VLS_241 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_242 = __VLS_asFunctionalComponent(__VLS_241, new __VLS_241({
        modelValue: (__VLS_ctx.tables.find(t => t.alias === __VLS_ctx.selectedNode)?.dataset_code || __VLS_ctx.tables.find(t => t.alias === __VLS_ctx.selectedNode)?.table_name),
        size: "small",
        disabled: true,
    }));
    const __VLS_243 = __VLS_242({
        modelValue: (__VLS_ctx.tables.find(t => t.alias === __VLS_ctx.selectedNode)?.dataset_code || __VLS_ctx.tables.find(t => t.alias === __VLS_ctx.selectedNode)?.table_name),
        size: "small",
        disabled: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_242));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "vm-fg" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    const __VLS_245 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_246 = __VLS_asFunctionalComponent(__VLS_245, new __VLS_245({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.tables.find(t => t.alias === __VLS_ctx.selectedNode)?.alias),
        size: "small",
    }));
    const __VLS_247 = __VLS_246({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.tables.find(t => t.alias === __VLS_ctx.selectedNode)?.alias),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_246));
    let __VLS_249;
    let __VLS_250;
    let __VLS_251;
    const __VLS_252 = {
        onChange: ((v) => { const n = __VLS_ctx.tables.find(t => t.alias === __VLS_ctx.selectedNode); if (n)
            n.alias = v; })
    };
    var __VLS_248;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "vm-fg" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    const __VLS_253 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_254 = __VLS_asFunctionalComponent(__VLS_253, new __VLS_253({
        modelValue: (__VLS_ctx.tables.find(t => t.alias === __VLS_ctx.selectedNode)?.table_name),
        size: "small",
        disabled: true,
    }));
    const __VLS_255 = __VLS_254({
        modelValue: (__VLS_ctx.tables.find(t => t.alias === __VLS_ctx.selectedNode)?.table_name),
        size: "small",
        disabled: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_254));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "vm-fg" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    const __VLS_257 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_258 = __VLS_asFunctionalComponent(__VLS_257, new __VLS_257({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.tables.find(t => t.alias === __VLS_ctx.selectedNode)?.layer),
        size: "small",
        ...{ style: {} },
    }));
    const __VLS_259 = __VLS_258({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.tables.find(t => t.alias === __VLS_ctx.selectedNode)?.layer),
        size: "small",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_258));
    let __VLS_261;
    let __VLS_262;
    let __VLS_263;
    const __VLS_264 = {
        onChange: ((v) => { const n = __VLS_ctx.tables.find(t => t.alias === __VLS_ctx.selectedNode); if (n)
            n.layer = v; })
    };
    __VLS_260.slots.default;
    for (const [v, k] of __VLS_getVForSourceType((__VLS_ctx.LAYER_LABELS))) {
        const __VLS_265 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_266 = __VLS_asFunctionalComponent(__VLS_265, new __VLS_265({
            key: (k),
            label: (v),
            value: (k),
        }));
        const __VLS_267 = __VLS_266({
            key: (k),
            label: (v),
            value: (k),
        }, ...__VLS_functionalComponentArgsRest(__VLS_266));
    }
    var __VLS_260;
}
else if (__VLS_ctx.selectedEdge !== null && __VLS_ctx.currentEdge) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "vm-fg" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    const __VLS_269 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_270 = __VLS_asFunctionalComponent(__VLS_269, new __VLS_269({
        modelValue: (__VLS_ctx.currentEdge.from),
        size: "small",
        disabled: true,
    }));
    const __VLS_271 = __VLS_270({
        modelValue: (__VLS_ctx.currentEdge.from),
        size: "small",
        disabled: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_270));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "vm-fg" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    const __VLS_273 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_274 = __VLS_asFunctionalComponent(__VLS_273, new __VLS_273({
        modelValue: (__VLS_ctx.currentEdge.to),
        size: "small",
        disabled: true,
    }));
    const __VLS_275 = __VLS_274({
        modelValue: (__VLS_ctx.currentEdge.to),
        size: "small",
        disabled: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_274));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "vm-fg" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    const __VLS_277 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_278 = __VLS_asFunctionalComponent(__VLS_277, new __VLS_277({
        modelValue: (__VLS_ctx.currentEdge.join_type),
        size: "small",
        ...{ style: {} },
    }));
    const __VLS_279 = __VLS_278({
        modelValue: (__VLS_ctx.currentEdge.join_type),
        size: "small",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_278));
    __VLS_280.slots.default;
    const __VLS_281 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_282 = __VLS_asFunctionalComponent(__VLS_281, new __VLS_281({
        label: "LEFT JOIN",
        value: "left",
    }));
    const __VLS_283 = __VLS_282({
        label: "LEFT JOIN",
        value: "left",
    }, ...__VLS_functionalComponentArgsRest(__VLS_282));
    const __VLS_285 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_286 = __VLS_asFunctionalComponent(__VLS_285, new __VLS_285({
        label: "INNER JOIN",
        value: "inner",
    }));
    const __VLS_287 = __VLS_286({
        label: "INNER JOIN",
        value: "inner",
    }, ...__VLS_functionalComponentArgsRest(__VLS_286));
    const __VLS_289 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_290 = __VLS_asFunctionalComponent(__VLS_289, new __VLS_289({
        label: "RIGHT JOIN",
        value: "right",
    }));
    const __VLS_291 = __VLS_290({
        label: "RIGHT JOIN",
        value: "right",
    }, ...__VLS_functionalComponentArgsRest(__VLS_290));
    var __VLS_280;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "vm-fg" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    const __VLS_293 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_294 = __VLS_asFunctionalComponent(__VLS_293, new __VLS_293({
        modelValue: (__VLS_ctx.currentEdge.cardinality),
        size: "small",
        ...{ style: {} },
    }));
    const __VLS_295 = __VLS_294({
        modelValue: (__VLS_ctx.currentEdge.cardinality),
        size: "small",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_294));
    __VLS_296.slots.default;
    const __VLS_297 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_298 = __VLS_asFunctionalComponent(__VLS_297, new __VLS_297({
        label: "1:1",
        value: "1:1",
    }));
    const __VLS_299 = __VLS_298({
        label: "1:1",
        value: "1:1",
    }, ...__VLS_functionalComponentArgsRest(__VLS_298));
    const __VLS_301 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_302 = __VLS_asFunctionalComponent(__VLS_301, new __VLS_301({
        label: "1:N",
        value: "1:N",
    }));
    const __VLS_303 = __VLS_302({
        label: "1:N",
        value: "1:N",
    }, ...__VLS_functionalComponentArgsRest(__VLS_302));
    const __VLS_305 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_306 = __VLS_asFunctionalComponent(__VLS_305, new __VLS_305({
        label: "N:1",
        value: "N:1",
    }));
    const __VLS_307 = __VLS_306({
        label: "N:1",
        value: "N:1",
    }, ...__VLS_functionalComponentArgsRest(__VLS_306));
    const __VLS_309 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_310 = __VLS_asFunctionalComponent(__VLS_309, new __VLS_309({
        label: "N:M",
        value: "N:M",
    }));
    const __VLS_311 = __VLS_310({
        label: "N:M",
        value: "N:M",
    }, ...__VLS_functionalComponentArgsRest(__VLS_310));
    var __VLS_296;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "vm-fg" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    for (const [k, ki] of __VLS_getVForSourceType((__VLS_ctx.currentEdge.keys))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (ki),
            ...{ class: "vm-kp" },
        });
        const __VLS_313 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_314 = __VLS_asFunctionalComponent(__VLS_313, new __VLS_313({
            modelValue: (__VLS_ctx.currentEdge.keys[ki].left),
            size: "small",
            ...{ style: {} },
            filterable: true,
            placeholder: "左字段",
        }));
        const __VLS_315 = __VLS_314({
            modelValue: (__VLS_ctx.currentEdge.keys[ki].left),
            size: "small",
            ...{ style: {} },
            filterable: true,
            placeholder: "左字段",
        }, ...__VLS_functionalComponentArgsRest(__VLS_314));
        __VLS_316.slots.default;
        for (const [c] of __VLS_getVForSourceType(((__VLS_ctx.tables.find(t => t.alias === __VLS_ctx.currentEdge.from)?.columns || [])))) {
            const __VLS_317 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_318 = __VLS_asFunctionalComponent(__VLS_317, new __VLS_317({
                key: (c.code),
                label: (c.label),
                value: (c.code),
            }));
            const __VLS_319 = __VLS_318({
                key: (c.code),
                label: (c.label),
                value: (c.code),
            }, ...__VLS_functionalComponentArgsRest(__VLS_318));
        }
        var __VLS_316;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
        const __VLS_321 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_322 = __VLS_asFunctionalComponent(__VLS_321, new __VLS_321({
            modelValue: (__VLS_ctx.currentEdge.keys[ki].right),
            size: "small",
            ...{ style: {} },
            filterable: true,
            placeholder: "右字段",
        }));
        const __VLS_323 = __VLS_322({
            modelValue: (__VLS_ctx.currentEdge.keys[ki].right),
            size: "small",
            ...{ style: {} },
            filterable: true,
            placeholder: "右字段",
        }, ...__VLS_functionalComponentArgsRest(__VLS_322));
        __VLS_324.slots.default;
        for (const [c] of __VLS_getVForSourceType(((__VLS_ctx.tables.find(t => t.alias === __VLS_ctx.currentEdge.to)?.columns || [])))) {
            const __VLS_325 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_326 = __VLS_asFunctionalComponent(__VLS_325, new __VLS_325({
                key: (c.code),
                label: (c.label),
                value: (c.code),
            }));
            const __VLS_327 = __VLS_326({
                key: (c.code),
                label: (c.label),
                value: (c.code),
            }, ...__VLS_functionalComponentArgsRest(__VLS_326));
        }
        var __VLS_324;
        const __VLS_329 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_330 = __VLS_asFunctionalComponent(__VLS_329, new __VLS_329({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
        }));
        const __VLS_331 = __VLS_330({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_330));
        let __VLS_333;
        let __VLS_334;
        let __VLS_335;
        const __VLS_336 = {
            onClick: (...[$event]) => {
                if (!!(__VLS_ctx.selectedNode))
                    return;
                if (!(__VLS_ctx.selectedEdge !== null && __VLS_ctx.currentEdge))
                    return;
                __VLS_ctx.removeKey(__VLS_ctx.selectedEdge, ki);
            }
        };
        __VLS_332.slots.default;
        var __VLS_332;
    }
    const __VLS_337 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_338 = __VLS_asFunctionalComponent(__VLS_337, new __VLS_337({
        ...{ 'onClick': {} },
        size: "small",
        ...{ style: {} },
    }));
    const __VLS_339 = __VLS_338({
        ...{ 'onClick': {} },
        size: "small",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_338));
    let __VLS_341;
    let __VLS_342;
    let __VLS_343;
    const __VLS_344 = {
        onClick: (...[$event]) => {
            if (!!(__VLS_ctx.selectedNode))
                return;
            if (!(__VLS_ctx.selectedEdge !== null && __VLS_ctx.currentEdge))
                return;
            __VLS_ctx.addKey(__VLS_ctx.selectedEdge);
        }
    };
    __VLS_340.slots.default;
    var __VLS_340;
    const __VLS_345 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_346 = __VLS_asFunctionalComponent(__VLS_345, new __VLS_345({
        ...{ 'onClick': {} },
        size: "small",
        type: "danger",
        ...{ style: {} },
    }));
    const __VLS_347 = __VLS_346({
        ...{ 'onClick': {} },
        size: "small",
        type: "danger",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_346));
    let __VLS_349;
    let __VLS_350;
    let __VLS_351;
    const __VLS_352 = {
        onClick: (...[$event]) => {
            if (!!(__VLS_ctx.selectedNode))
                return;
            if (!(__VLS_ctx.selectedEdge !== null && __VLS_ctx.currentEdge))
                return;
            __VLS_ctx.removeRelation(__VLS_ctx.selectedEdge);
        }
    };
    __VLS_348.slots.default;
    var __VLS_348;
}
else {
    const __VLS_353 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_354 = __VLS_asFunctionalComponent(__VLS_353, new __VLS_353({
        description: "点击画布上的节点或关联线",
        imageSize: (48),
    }));
    const __VLS_355 = __VLS_354({
        description: "点击画布上的节点或关联线",
        imageSize: (48),
    }, ...__VLS_functionalComponentArgsRest(__VLS_354));
}
var __VLS_232;
const __VLS_357 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_358 = __VLS_asFunctionalComponent(__VLS_357, new __VLS_357({
    modelValue: (__VLS_ctx.versionVisible),
    title: "版本历史",
    width: "500px",
}));
const __VLS_359 = __VLS_358({
    modelValue: (__VLS_ctx.versionVisible),
    title: "版本历史",
    width: "500px",
}, ...__VLS_functionalComponentArgsRest(__VLS_358));
__VLS_360.slots.default;
const __VLS_361 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_362 = __VLS_asFunctionalComponent(__VLS_361, new __VLS_361({
    data: (__VLS_ctx.versions),
    size: "small",
    stripe: true,
}));
const __VLS_363 = __VLS_362({
    data: (__VLS_ctx.versions),
    size: "small",
    stripe: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_362));
__VLS_364.slots.default;
const __VLS_365 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_366 = __VLS_asFunctionalComponent(__VLS_365, new __VLS_365({
    prop: "version",
    label: "版本",
    width: "80",
}));
const __VLS_367 = __VLS_366({
    prop: "version",
    label: "版本",
    width: "80",
}, ...__VLS_functionalComponentArgsRest(__VLS_366));
const __VLS_369 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_370 = __VLS_asFunctionalComponent(__VLS_369, new __VLS_369({
    prop: "status",
    label: "状态",
    width: "80",
}));
const __VLS_371 = __VLS_370({
    prop: "status",
    label: "状态",
    width: "80",
}, ...__VLS_functionalComponentArgsRest(__VLS_370));
__VLS_372.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_372.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_373 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_374 = __VLS_asFunctionalComponent(__VLS_373, new __VLS_373({
        size: "small",
    }));
    const __VLS_375 = __VLS_374({
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_374));
    __VLS_376.slots.default;
    (row.status);
    var __VLS_376;
}
var __VLS_372;
const __VLS_377 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_378 = __VLS_asFunctionalComponent(__VLS_377, new __VLS_377({
    label: "发布时间",
    width: "160",
}));
const __VLS_379 = __VLS_378({
    label: "发布时间",
    width: "160",
}, ...__VLS_functionalComponentArgsRest(__VLS_378));
__VLS_380.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_380.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (row.published_at || '-');
}
var __VLS_380;
var __VLS_364;
if (!__VLS_ctx.versions.length) {
    const __VLS_381 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_382 = __VLS_asFunctionalComponent(__VLS_381, new __VLS_381({
        description: "暂无版本历史",
        imageSize: (60),
    }));
    const __VLS_383 = __VLS_382({
        description: "暂无版本历史",
        imageSize: (60),
    }, ...__VLS_functionalComponentArgsRest(__VLS_382));
}
var __VLS_360;
if (__VLS_ctx.modelId) {
    const __VLS_385 = {}.ElDialog;
    /** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
    // @ts-ignore
    const __VLS_386 = __VLS_asFunctionalComponent(__VLS_385, new __VLS_385({
        modelValue: (__VLS_ctx.cfDialogVisible),
        title: "管理计算字段",
        width: "800px",
    }));
    const __VLS_387 = __VLS_386({
        modelValue: (__VLS_ctx.cfDialogVisible),
        title: "管理计算字段",
        width: "800px",
    }, ...__VLS_functionalComponentArgsRest(__VLS_386));
    __VLS_388.slots.default;
    /** @type {[typeof CalculatedFieldBridge, ]} */ ;
    // @ts-ignore
    const __VLS_389 = __VLS_asFunctionalComponent(CalculatedFieldBridge, new CalculatedFieldBridge({
        ...{ 'onSaved': {} },
        datasetId: (__VLS_ctx.modelId),
        datasets: ([]),
        tables: ([]),
    }));
    const __VLS_390 = __VLS_389({
        ...{ 'onSaved': {} },
        datasetId: (__VLS_ctx.modelId),
        datasets: ([]),
        tables: ([]),
    }, ...__VLS_functionalComponentArgsRest(__VLS_389));
    let __VLS_392;
    let __VLS_393;
    let __VLS_394;
    const __VLS_395 = {
        onSaved: (__VLS_ctx.onCalculatedFieldSaved)
    };
    var __VLS_391;
    var __VLS_388;
}
/** @type {__VLS_StyleScopedClasses['vm-root']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-body']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-left']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-lt']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-ls']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-ll']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-to']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-oi']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-on']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-op']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-cv']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-cv-inner']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-svg']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-nd']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-port']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-port-left']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-nb']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-nn']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-nc']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-port']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-port-right']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-ndel']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-empty-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-right-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-rp-header']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-of-list']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-of-card']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-of-row']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-of-row2']} */ ;
/** @type {__VLS_StyleScopedClasses['is-loading']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-sql']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-explain']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-fg']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-fg']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-fg']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-fg']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-fg']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-fg']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-fg']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-fg']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-fg']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-fg']} */ ;
/** @type {__VLS_StyleScopedClasses['vm-kp']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ArrowLeft: ArrowLeft,
            Delete: Delete,
            Finished: Finished,
            Search: Search,
            Clock: Clock,
            Plus: Plus,
            Loading: Loading,
            MagicStick: MagicStick,
            CalculatedFieldBridge: CalculatedFieldBridge,
            userStore: userStore,
            modelId: modelId,
            cfDialogVisible: cfDialogVisible,
            onCalculatedFieldSaved: onCalculatedFieldSaved,
            canEdit: canEdit,
            form: form,
            loading: loading,
            saving: saving,
            error: error,
            LAYER_LABELS: LAYER_LABELS,
            LAYER_COLORS: LAYER_COLORS,
            JOIN_COLORS: JOIN_COLORS,
            NODE_W: NODE_W,
            NODE_H: NODE_H,
            tables: tables,
            relations: relations,
            tableSearch: tableSearch,
            filteredTables: filteredTables,
            selectedNode: selectedNode,
            selectedEdge: selectedEdge,
            currentEdge: currentEdge,
            drawerVisible: drawerVisible,
            outputFields: outputFields,
            previewData: previewData,
            previewLoading: previewLoading,
            previewV2: previewV2,
            versions: versions,
            versionVisible: versionVisible,
            activeNames: activeNames,
            rightTab: rightTab,
            zoom: zoom,
            panX: panX,
            panY: panY,
            isPanning: isPanning,
            onWheel: onWheel,
            onPanStart: onPanStart,
            resetView: resetView,
            connecting: connecting,
            hoverTarget: hoverTarget,
            connectedAliases: connectedAliases,
            startConnect: startConnect,
            onMove: onMove,
            onUp: onUp,
            onDragStart: onDragStart,
            edgeEndpoints: edgeEndpoints,
            edgePath: edgePath,
            autoLayout: autoLayout,
            addTable: addTable,
            removeTable: removeTable,
            selectNodeFn: selectNodeFn,
            selectEdgeFn: selectEdgeFn,
            removeRelation: removeRelation,
            addKey: addKey,
            removeKey: removeKey,
            addOF: addOF,
            removeOF: removeOF,
            saveDraft: saveDraft,
            doPublish: doPublish,
            doPreview: doPreview,
            showVersions: showVersions,
            goBack: goBack,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
