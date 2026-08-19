/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, h, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Search, Refresh, Right, Connection } from '@element-plus/icons-vue';
import { VueFlow } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import dagre from 'dagre';
import { getTableLineage, getFieldLineage, LINEAGE_NODE_COLORS, LINEAGE_NODE_LABELS, LINEAGE_EDGE_LABELS, } from '@/api/warehouse';
import { MarkerType } from '@vue-flow/core';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import '@vue-flow/controls/dist/style.css';
const route = useRoute();
const router = useRouter();
// ==================== 状态 ====================
const loading = ref(false);
const errorMsg = ref('');
const graphError = ref(false);
const viewMode = ref('list');
const queryType = ref('table');
const tableName = ref('');
const columnCode = ref('');
const direction = ref('all');
const depth = ref(3);
const data = ref(null);
const selectedNode = ref(null);
const detailVisible = ref(false);
const flowNodes = ref([]);
const flowEdges = ref([]);
// ==================== 自定义血缘节点 ====================
const LineageNodeComponent = {
    name: 'LineageNode',
    props: ['data'],
    setup(props) {
        return () => {
            const n = props.data.lineage;
            const color = LINEAGE_NODE_COLORS[n.type] || '#909399';
            const typeLabel = LINEAGE_NODE_LABELS[n.type] || n.type;
            const displayLabel = n.label.length > 16 ? n.label.slice(0, 16) + '…' : n.label;
            return h('div', {
                class: 'custom-lineage-node',
                style: { background: color },
            }, [
                h('div', { class: 'node-type-tag' }, typeLabel),
                h('div', { class: 'node-label-text', title: n.label }, displayLabel),
            ]);
        };
    },
};
const nodeTypes = { 'lineage-node': LineageNodeComponent };
// ==================== 过滤 ====================
const filteredNodes = computed(() => {
    if (!data.value)
        return [];
    if (direction.value === 'all')
        return data.value.nodes;
    return data.value.nodes.filter(n => {
        const edges = data.value.edges;
        if (direction.value === 'upstream') {
            return edges.some(e => e.target_id === n.id && e.direction === 'upstream')
                || n.type === 'table' || n.type === 'field';
        }
        return edges.some(e => e.source_id === n.id && e.direction === 'downstream')
            || n.type === 'table' || n.type === 'field';
    });
});
const filteredEdges = computed(() => {
    if (!data.value)
        return [];
    return data.value.edges.filter(e => {
        if (direction.value === 'all')
            return true;
        return e.direction === direction.value;
    });
});
const centerNode = computed(() => {
    if (!data.value || !tableName.value)
        return null;
    const tid = queryType.value === 'table'
        ? `table:${tableName.value}`
        : `field:${tableName.value}.${columnCode.value}`;
    return data.value.nodes.find(n => n.id === tid) || null;
});
// ==================== Dagre 布局 ====================
const NODE_WIDTH = 180;
const NODE_HEIGHT = 48;
function buildDagreGraph(lnodes, ledges) {
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 180, marginx: 40, marginy: 40 });
    for (const n of lnodes) {
        g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    }
    for (const e of ledges) {
        g.setEdge(e.source_id, e.target_id);
    }
    dagre.layout(g);
    const vfNodes = lnodes.map(n => {
        const pos = g.node(n.id);
        return {
            id: n.id,
            type: 'lineage-node',
            position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
            data: { lineage: n },
        };
    });
    const vfEdges = ledges.map((e, i) => {
        const label = e.label || LINEAGE_EDGE_LABELS[e.relation_type] || e.relation_type;
        return {
            id: `${e.source_id}→${e.target_id}:${e.relation_type}:${i}`,
            source: e.source_id,
            target: e.target_id,
            type: 'smoothstep',
            animated: false,
            label,
            style: {
                stroke: e.direction === 'upstream' ? '#909399' : '#67C23A',
                strokeWidth: 1.5,
            },
            labelStyle: { fill: '#606266', fontSize: 11 },
            labelBgStyle: { fill: '#fff', fillOpacity: 0.9 },
            labelBgPadding: [4, 2],
            labelBgBorderRadius: 3,
            markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: e.direction === 'upstream' ? '#909399' : '#67C23A' },
        };
    });
    return { nodes: vfNodes, edges: vfEdges };
}
function rebuildFlow() {
    const lnodes = filteredNodes.value;
    const ledges = filteredEdges.value;
    if (!lnodes.length) {
        flowNodes.value = [];
        flowEdges.value = [];
        return;
    }
    const { nodes, edges } = buildDagreGraph(lnodes, ledges);
    flowNodes.value = nodes;
    flowEdges.value = edges;
}
// ==================== 方法 ====================
async function query() {
    if (!tableName.value.trim()) {
        ElMessage.warning('请输入表名');
        return;
    }
    loading.value = true;
    errorMsg.value = '';
    graphError.value = false;
    selectedNode.value = null;
    detailVisible.value = false;
    try {
        if (queryType.value === 'table') {
            data.value = await getTableLineage(tableName.value.trim(), depth.value);
        }
        else {
            if (!columnCode.value.trim()) {
                ElMessage.warning('请输入字段编码');
                loading.value = false;
                return;
            }
            data.value = await getFieldLineage(tableName.value.trim(), columnCode.value.trim(), depth.value);
        }
        // 成功获取数据后构建图谱布局
        if (data.value && data.value.nodes.length > 0) {
            rebuildFlow();
        }
    }
    catch (e) {
        const msg = e?.response?.data?.detail || e?.message || '查询血缘失败';
        errorMsg.value = msg;
        data.value = null;
        flowNodes.value = [];
        flowEdges.value = [];
    }
    finally {
        loading.value = false;
    }
}
function handleSearch() {
    const q = {
        type: queryType.value,
        table: tableName.value.trim(),
        depth: String(depth.value),
    };
    if (queryType.value === 'field' && columnCode.value.trim()) {
        q.column = columnCode.value.trim();
    }
    router.replace({ query: q });
    query();
}
function nodeLabel(n) {
    return LINEAGE_NODE_LABELS[n.type] || n.type;
}
function nodeColor(n) {
    return LINEAGE_NODE_COLORS[n.type] || '#909399';
}
function openDetail(n) {
    selectedNode.value = n;
    detailVisible.value = true;
}
function navigateTo(route) {
    if (!route)
        return;
    if (route.startsWith('/')) {
        router.push(route);
    }
    else {
        router.push({ name: route });
    }
}
function switchToGraph() {
    try {
        rebuildFlow();
        viewMode.value = 'graph';
        graphError.value = false;
    }
    catch {
        graphError.value = true;
        viewMode.value = 'list';
        ElMessage.warning('图谱加载失败，已切换到列表视图');
    }
}
// vue-flow 节点点击事件
function onNodeClick({ node }) {
    const lineage = node.data?.lineage;
    if (lineage) {
        openDetail(lineage);
    }
}
// ==================== 生命周期 ====================
onMounted(() => {
    const q = route.query;
    if (q.type === 'field')
        queryType.value = 'field';
    if (q.table)
        tableName.value = String(q.table);
    if (q.column)
        columnCode.value = String(q.column);
    if (q.depth)
        depth.value = Number(q.depth);
    if (tableName.value)
        query();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['custom-lineage-node']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "lineage-page" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "page-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
const __VLS_0 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    shadow: "never",
    ...{ class: "query-card" },
}));
const __VLS_2 = __VLS_1({
    shadow: "never",
    ...{ class: "query-card" },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
const __VLS_4 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
    inline: (true),
    model: ({ queryType: __VLS_ctx.queryType, tableName: __VLS_ctx.tableName, columnCode: __VLS_ctx.columnCode, direction: __VLS_ctx.direction, depth: __VLS_ctx.depth }),
    size: "default",
}));
const __VLS_6 = __VLS_5({
    inline: (true),
    model: ({ queryType: __VLS_ctx.queryType, tableName: __VLS_ctx.tableName, columnCode: __VLS_ctx.columnCode, direction: __VLS_ctx.direction, depth: __VLS_ctx.depth }),
    size: "default",
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
__VLS_7.slots.default;
const __VLS_8 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    label: "对象类型",
}));
const __VLS_10 = __VLS_9({
    label: "对象类型",
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
__VLS_11.slots.default;
const __VLS_12 = {}.ElRadioGroup;
/** @type {[typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    modelValue: (__VLS_ctx.queryType),
}));
const __VLS_14 = __VLS_13({
    modelValue: (__VLS_ctx.queryType),
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
__VLS_15.slots.default;
const __VLS_16 = {}.ElRadio;
/** @type {[typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    value: "table",
}));
const __VLS_18 = __VLS_17({
    value: "table",
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
__VLS_19.slots.default;
var __VLS_19;
const __VLS_20 = {}.ElRadio;
/** @type {[typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    value: "field",
}));
const __VLS_22 = __VLS_21({
    value: "field",
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
__VLS_23.slots.default;
var __VLS_23;
var __VLS_15;
var __VLS_11;
const __VLS_24 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    label: "表名",
    required: true,
}));
const __VLS_26 = __VLS_25({
    label: "表名",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
__VLS_27.slots.default;
const __VLS_28 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.tableName),
    placeholder: "如: employee_info",
    ...{ style: {} },
    clearable: true,
}));
const __VLS_30 = __VLS_29({
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.tableName),
    placeholder: "如: employee_info",
    ...{ style: {} },
    clearable: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
let __VLS_32;
let __VLS_33;
let __VLS_34;
const __VLS_35 = {
    onKeyup: (__VLS_ctx.handleSearch)
};
var __VLS_31;
var __VLS_27;
if (__VLS_ctx.queryType === 'field') {
    const __VLS_36 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
        label: "字段编码",
        required: true,
    }));
    const __VLS_38 = __VLS_37({
        label: "字段编码",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_37));
    __VLS_39.slots.default;
    const __VLS_40 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
        ...{ 'onKeyup': {} },
        modelValue: (__VLS_ctx.columnCode),
        placeholder: "如: employee_id",
        ...{ style: {} },
        clearable: true,
    }));
    const __VLS_42 = __VLS_41({
        ...{ 'onKeyup': {} },
        modelValue: (__VLS_ctx.columnCode),
        placeholder: "如: employee_id",
        ...{ style: {} },
        clearable: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_41));
    let __VLS_44;
    let __VLS_45;
    let __VLS_46;
    const __VLS_47 = {
        onKeyup: (__VLS_ctx.handleSearch)
    };
    var __VLS_43;
    var __VLS_39;
}
const __VLS_48 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
    label: "方向",
}));
const __VLS_50 = __VLS_49({
    label: "方向",
}, ...__VLS_functionalComponentArgsRest(__VLS_49));
__VLS_51.slots.default;
const __VLS_52 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
    modelValue: (__VLS_ctx.direction),
    ...{ style: {} },
}));
const __VLS_54 = __VLS_53({
    modelValue: (__VLS_ctx.direction),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_53));
__VLS_55.slots.default;
const __VLS_56 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
    label: "全部",
    value: "all",
}));
const __VLS_58 = __VLS_57({
    label: "全部",
    value: "all",
}, ...__VLS_functionalComponentArgsRest(__VLS_57));
const __VLS_60 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
    label: "上游",
    value: "upstream",
}));
const __VLS_62 = __VLS_61({
    label: "上游",
    value: "upstream",
}, ...__VLS_functionalComponentArgsRest(__VLS_61));
const __VLS_64 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
    label: "下游",
    value: "downstream",
}));
const __VLS_66 = __VLS_65({
    label: "下游",
    value: "downstream",
}, ...__VLS_functionalComponentArgsRest(__VLS_65));
var __VLS_55;
var __VLS_51;
const __VLS_68 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
    label: "深度",
}));
const __VLS_70 = __VLS_69({
    label: "深度",
}, ...__VLS_functionalComponentArgsRest(__VLS_69));
__VLS_71.slots.default;
const __VLS_72 = {}.ElInputNumber;
/** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
// @ts-ignore
const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
    modelValue: (__VLS_ctx.depth),
    min: (1),
    max: (5),
    ...{ style: {} },
}));
const __VLS_74 = __VLS_73({
    modelValue: (__VLS_ctx.depth),
    min: (1),
    max: (5),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_73));
var __VLS_71;
const __VLS_76 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({}));
const __VLS_78 = __VLS_77({}, ...__VLS_functionalComponentArgsRest(__VLS_77));
__VLS_79.slots.default;
const __VLS_80 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
    ...{ 'onClick': {} },
    type: "primary",
    icon: (__VLS_ctx.Search),
    loading: (__VLS_ctx.loading),
}));
const __VLS_82 = __VLS_81({
    ...{ 'onClick': {} },
    type: "primary",
    icon: (__VLS_ctx.Search),
    loading: (__VLS_ctx.loading),
}, ...__VLS_functionalComponentArgsRest(__VLS_81));
let __VLS_84;
let __VLS_85;
let __VLS_86;
const __VLS_87 = {
    onClick: (__VLS_ctx.handleSearch)
};
__VLS_83.slots.default;
var __VLS_83;
var __VLS_79;
var __VLS_7;
var __VLS_3;
if (__VLS_ctx.errorMsg) {
    const __VLS_88 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
        ...{ 'onClose': {} },
        title: (__VLS_ctx.errorMsg),
        type: "error",
        showIcon: true,
        closable: true,
        ...{ style: {} },
    }));
    const __VLS_90 = __VLS_89({
        ...{ 'onClose': {} },
        title: (__VLS_ctx.errorMsg),
        type: "error",
        showIcon: true,
        closable: true,
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_89));
    let __VLS_92;
    let __VLS_93;
    let __VLS_94;
    const __VLS_95 = {
        onClose: (...[$event]) => {
            if (!(__VLS_ctx.errorMsg))
                return;
            __VLS_ctx.errorMsg = '';
        }
    };
    var __VLS_91;
}
if (__VLS_ctx.loading) {
    const __VLS_96 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
        shadow: "never",
        ...{ class: "state-card" },
        elementLoadingText: "查询血缘中…",
    }));
    const __VLS_98 = __VLS_97({
        shadow: "never",
        ...{ class: "state-card" },
        elementLoadingText: "查询血缘中…",
    }, ...__VLS_functionalComponentArgsRest(__VLS_97));
    __VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
}
else if (!__VLS_ctx.data && !__VLS_ctx.errorMsg) {
    const __VLS_100 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
        shadow: "never",
        ...{ class: "state-card" },
    }));
    const __VLS_102 = __VLS_101({
        shadow: "never",
        ...{ class: "state-card" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_101));
    __VLS_103.slots.default;
    const __VLS_104 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
        description: "请选择数据表查询血缘关系",
    }));
    const __VLS_106 = __VLS_105({
        description: "请选择数据表查询血缘关系",
    }, ...__VLS_functionalComponentArgsRest(__VLS_105));
    var __VLS_103;
}
else if (__VLS_ctx.data && __VLS_ctx.data.nodes.length === 0) {
    const __VLS_108 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
        shadow: "never",
        ...{ class: "state-card" },
    }));
    const __VLS_110 = __VLS_109({
        shadow: "never",
        ...{ class: "state-card" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_109));
    __VLS_111.slots.default;
    const __VLS_112 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
        description: "未找到血缘关系",
    }));
    const __VLS_114 = __VLS_113({
        description: "未找到血缘关系",
    }, ...__VLS_functionalComponentArgsRest(__VLS_113));
    var __VLS_111;
}
if (__VLS_ctx.data && __VLS_ctx.data.nodes.length > 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "toolbar-v" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "toolbar-v-left" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "node-count" },
    });
    (__VLS_ctx.data.nodes.length);
    (__VLS_ctx.data.edges.length);
    if (__VLS_ctx.centerNode) {
        const __VLS_116 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
            type: "info",
            size: "small",
            ...{ style: {} },
        }));
        const __VLS_118 = __VLS_117({
            type: "info",
            size: "small",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_117));
        __VLS_119.slots.default;
        (__VLS_ctx.centerNode.label);
        var __VLS_119;
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "toolbar-v-right" },
    });
    const __VLS_120 = {}.ElButtonGroup;
    /** @type {[typeof __VLS_components.ElButtonGroup, typeof __VLS_components.elButtonGroup, typeof __VLS_components.ElButtonGroup, typeof __VLS_components.elButtonGroup, ]} */ ;
    // @ts-ignore
    const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({}));
    const __VLS_122 = __VLS_121({}, ...__VLS_functionalComponentArgsRest(__VLS_121));
    __VLS_123.slots.default;
    const __VLS_124 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
        ...{ 'onClick': {} },
        type: (__VLS_ctx.viewMode === 'list' ? 'primary' : ''),
        size: "small",
    }));
    const __VLS_126 = __VLS_125({
        ...{ 'onClick': {} },
        type: (__VLS_ctx.viewMode === 'list' ? 'primary' : ''),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_125));
    let __VLS_128;
    let __VLS_129;
    let __VLS_130;
    const __VLS_131 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.data && __VLS_ctx.data.nodes.length > 0))
                return;
            __VLS_ctx.viewMode = 'list';
        }
    };
    __VLS_127.slots.default;
    var __VLS_127;
    const __VLS_132 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
        ...{ 'onClick': {} },
        type: (__VLS_ctx.viewMode === 'graph' ? 'primary' : ''),
        size: "small",
    }));
    const __VLS_134 = __VLS_133({
        ...{ 'onClick': {} },
        type: (__VLS_ctx.viewMode === 'graph' ? 'primary' : ''),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_133));
    let __VLS_136;
    let __VLS_137;
    let __VLS_138;
    const __VLS_139 = {
        onClick: (__VLS_ctx.switchToGraph)
    };
    __VLS_135.slots.default;
    var __VLS_135;
    var __VLS_123;
    const __VLS_140 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
        ...{ 'onClick': {} },
        icon: (__VLS_ctx.Refresh),
        size: "small",
        ...{ style: {} },
    }));
    const __VLS_142 = __VLS_141({
        ...{ 'onClick': {} },
        icon: (__VLS_ctx.Refresh),
        size: "small",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_141));
    let __VLS_144;
    let __VLS_145;
    let __VLS_146;
    const __VLS_147 = {
        onClick: (__VLS_ctx.query)
    };
    __VLS_143.slots.default;
    var __VLS_143;
    if (__VLS_ctx.data.truncated) {
        const __VLS_148 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
            title: (__VLS_ctx.data.truncation_message || '结果过多，请缩小查询范围'),
            type: "warning",
            showIcon: true,
            closable: (false),
            ...{ style: {} },
        }));
        const __VLS_150 = __VLS_149({
            title: (__VLS_ctx.data.truncation_message || '结果过多，请缩小查询范围'),
            type: "warning",
            showIcon: true,
            closable: (false),
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_149));
    }
    if (__VLS_ctx.viewMode === 'list') {
        const __VLS_152 = {}.ElCard;
        /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
        // @ts-ignore
        const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
            shadow: "never",
        }));
        const __VLS_154 = __VLS_153({
            shadow: "never",
        }, ...__VLS_functionalComponentArgsRest(__VLS_153));
        __VLS_155.slots.default;
        const __VLS_156 = {}.ElTable;
        /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
        // @ts-ignore
        const __VLS_157 = __VLS_asFunctionalComponent(__VLS_156, new __VLS_156({
            data: (__VLS_ctx.filteredNodes),
            size: "small",
            stripe: true,
            rowKey: "id",
            maxHeight: "500",
        }));
        const __VLS_158 = __VLS_157({
            data: (__VLS_ctx.filteredNodes),
            size: "small",
            stripe: true,
            rowKey: "id",
            maxHeight: "500",
        }, ...__VLS_functionalComponentArgsRest(__VLS_157));
        __VLS_159.slots.default;
        const __VLS_160 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
            label: "类型",
            width: "90",
        }));
        const __VLS_162 = __VLS_161({
            label: "类型",
            width: "90",
        }, ...__VLS_functionalComponentArgsRest(__VLS_161));
        __VLS_163.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_163.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            const __VLS_164 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({
                color: (__VLS_ctx.nodeColor(row)),
                size: "small",
                effect: "dark",
                disableTransitions: true,
            }));
            const __VLS_166 = __VLS_165({
                color: (__VLS_ctx.nodeColor(row)),
                size: "small",
                effect: "dark",
                disableTransitions: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_165));
            __VLS_167.slots.default;
            (__VLS_ctx.nodeLabel(row));
            var __VLS_167;
        }
        var __VLS_163;
        const __VLS_168 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({
            prop: "label",
            label: "名称",
            minWidth: "160",
        }));
        const __VLS_170 = __VLS_169({
            prop: "label",
            label: "名称",
            minWidth: "160",
        }, ...__VLS_functionalComponentArgsRest(__VLS_169));
        const __VLS_172 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_173 = __VLS_asFunctionalComponent(__VLS_172, new __VLS_172({
            label: "状态",
            width: "80",
        }));
        const __VLS_174 = __VLS_173({
            label: "状态",
            width: "80",
        }, ...__VLS_functionalComponentArgsRest(__VLS_173));
        __VLS_175.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_175.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: ({ color: row.status === 'published' || row.status === 'active' ? '#67C23A' : '#909399' }) },
            });
            (row.status);
        }
        var __VLS_175;
        const __VLS_176 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({
            label: "关系",
            minWidth: "200",
        }));
        const __VLS_178 = __VLS_177({
            label: "关系",
            minWidth: "200",
        }, ...__VLS_functionalComponentArgsRest(__VLS_177));
        __VLS_179.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_179.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            for (const [e] of __VLS_getVForSourceType((__VLS_ctx.filteredEdges.filter(ed => ed.source_id === row.id || ed.target_id === row.id)))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ style: {} },
                });
                if (e.source_id === row.id) {
                    (e.label || __VLS_ctx.LINEAGE_EDGE_LABELS[e.relation_type] || e.relation_type);
                }
                else {
                    (e.label || __VLS_ctx.LINEAGE_EDGE_LABELS[e.relation_type] || e.relation_type);
                }
            }
            if (!__VLS_ctx.filteredEdges.some(ed => ed.source_id === row.id || ed.target_id === row.id)) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ style: {} },
                });
            }
        }
        var __VLS_179;
        const __VLS_180 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_181 = __VLS_asFunctionalComponent(__VLS_180, new __VLS_180({
            label: "操作",
            width: "120",
            fixed: "right",
        }));
        const __VLS_182 = __VLS_181({
            label: "操作",
            width: "120",
            fixed: "right",
        }, ...__VLS_functionalComponentArgsRest(__VLS_181));
        __VLS_183.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_183.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            const __VLS_184 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_185 = __VLS_asFunctionalComponent(__VLS_184, new __VLS_184({
                ...{ 'onClick': {} },
                link: true,
                size: "small",
                type: "primary",
            }));
            const __VLS_186 = __VLS_185({
                ...{ 'onClick': {} },
                link: true,
                size: "small",
                type: "primary",
            }, ...__VLS_functionalComponentArgsRest(__VLS_185));
            let __VLS_188;
            let __VLS_189;
            let __VLS_190;
            const __VLS_191 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.data && __VLS_ctx.data.nodes.length > 0))
                        return;
                    if (!(__VLS_ctx.viewMode === 'list'))
                        return;
                    __VLS_ctx.openDetail(row);
                }
            };
            __VLS_187.slots.default;
            var __VLS_187;
            if (row.detail_route) {
                const __VLS_192 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_193 = __VLS_asFunctionalComponent(__VLS_192, new __VLS_192({
                    ...{ 'onClick': {} },
                    link: true,
                    size: "small",
                }));
                const __VLS_194 = __VLS_193({
                    ...{ 'onClick': {} },
                    link: true,
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_193));
                let __VLS_196;
                let __VLS_197;
                let __VLS_198;
                const __VLS_199 = {
                    onClick: (...[$event]) => {
                        if (!(__VLS_ctx.data && __VLS_ctx.data.nodes.length > 0))
                            return;
                        if (!(__VLS_ctx.viewMode === 'list'))
                            return;
                        if (!(row.detail_route))
                            return;
                        __VLS_ctx.navigateTo(row.detail_route);
                    }
                };
                __VLS_195.slots.default;
                const __VLS_200 = {}.ElIcon;
                /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
                // @ts-ignore
                const __VLS_201 = __VLS_asFunctionalComponent(__VLS_200, new __VLS_200({}));
                const __VLS_202 = __VLS_201({}, ...__VLS_functionalComponentArgsRest(__VLS_201));
                __VLS_203.slots.default;
                const __VLS_204 = {}.Right;
                /** @type {[typeof __VLS_components.Right, ]} */ ;
                // @ts-ignore
                const __VLS_205 = __VLS_asFunctionalComponent(__VLS_204, new __VLS_204({}));
                const __VLS_206 = __VLS_205({}, ...__VLS_functionalComponentArgsRest(__VLS_205));
                var __VLS_203;
                var __VLS_195;
            }
        }
        var __VLS_183;
        var __VLS_159;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        const __VLS_208 = {}.ElDivider;
        /** @type {[typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, ]} */ ;
        // @ts-ignore
        const __VLS_209 = __VLS_asFunctionalComponent(__VLS_208, new __VLS_208({
            contentPosition: "left",
        }));
        const __VLS_210 = __VLS_209({
            contentPosition: "left",
        }, ...__VLS_functionalComponentArgsRest(__VLS_209));
        __VLS_211.slots.default;
        var __VLS_211;
        const __VLS_212 = {}.ElTable;
        /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
        // @ts-ignore
        const __VLS_213 = __VLS_asFunctionalComponent(__VLS_212, new __VLS_212({
            data: (__VLS_ctx.filteredEdges),
            size: "small",
            maxHeight: "300",
        }));
        const __VLS_214 = __VLS_213({
            data: (__VLS_ctx.filteredEdges),
            size: "small",
            maxHeight: "300",
        }, ...__VLS_functionalComponentArgsRest(__VLS_213));
        __VLS_215.slots.default;
        const __VLS_216 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_217 = __VLS_asFunctionalComponent(__VLS_216, new __VLS_216({
            label: "方向",
            width: "80",
        }));
        const __VLS_218 = __VLS_217({
            label: "方向",
            width: "80",
        }, ...__VLS_functionalComponentArgsRest(__VLS_217));
        __VLS_219.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_219.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            const __VLS_220 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_221 = __VLS_asFunctionalComponent(__VLS_220, new __VLS_220({
                type: (row.direction === 'upstream' ? '' : 'success'),
                size: "small",
                effect: "plain",
            }));
            const __VLS_222 = __VLS_221({
                type: (row.direction === 'upstream' ? '' : 'success'),
                size: "small",
                effect: "plain",
            }, ...__VLS_functionalComponentArgsRest(__VLS_221));
            __VLS_223.slots.default;
            (row.direction === 'upstream' ? '上游' : '下游');
            var __VLS_223;
        }
        var __VLS_219;
        const __VLS_224 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_225 = __VLS_asFunctionalComponent(__VLS_224, new __VLS_224({
            label: "来源节点",
            width: "180",
        }));
        const __VLS_226 = __VLS_225({
            label: "来源节点",
            width: "180",
        }, ...__VLS_functionalComponentArgsRest(__VLS_225));
        __VLS_227.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_227.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (__VLS_ctx.filteredNodes.find(n => n.id === row.source_id)?.label || row.source_id);
        }
        var __VLS_227;
        const __VLS_228 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_229 = __VLS_asFunctionalComponent(__VLS_228, new __VLS_228({
            label: "关系",
            width: "120",
        }));
        const __VLS_230 = __VLS_229({
            label: "关系",
            width: "120",
        }, ...__VLS_functionalComponentArgsRest(__VLS_229));
        __VLS_231.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_231.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (row.label || __VLS_ctx.LINEAGE_EDGE_LABELS[row.relation_type] || row.relation_type);
            const __VLS_232 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_233 = __VLS_asFunctionalComponent(__VLS_232, new __VLS_232({}));
            const __VLS_234 = __VLS_233({}, ...__VLS_functionalComponentArgsRest(__VLS_233));
            __VLS_235.slots.default;
            const __VLS_236 = {}.Right;
            /** @type {[typeof __VLS_components.Right, ]} */ ;
            // @ts-ignore
            const __VLS_237 = __VLS_asFunctionalComponent(__VLS_236, new __VLS_236({}));
            const __VLS_238 = __VLS_237({}, ...__VLS_functionalComponentArgsRest(__VLS_237));
            var __VLS_235;
        }
        var __VLS_231;
        const __VLS_240 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_241 = __VLS_asFunctionalComponent(__VLS_240, new __VLS_240({
            label: "目标节点",
        }));
        const __VLS_242 = __VLS_241({
            label: "目标节点",
        }, ...__VLS_functionalComponentArgsRest(__VLS_241));
        __VLS_243.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_243.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (__VLS_ctx.filteredNodes.find(n => n.id === row.target_id)?.label || row.target_id);
        }
        var __VLS_243;
        var __VLS_215;
        var __VLS_155;
    }
    else if (__VLS_ctx.viewMode === 'graph' && !__VLS_ctx.graphError) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "graph-wrapper" },
        });
        const __VLS_244 = {}.VueFlow;
        /** @type {[typeof __VLS_components.VueFlow, typeof __VLS_components.VueFlow, ]} */ ;
        // @ts-ignore
        const __VLS_245 = __VLS_asFunctionalComponent(__VLS_244, new __VLS_244({
            ...{ 'onNodeClick': {} },
            nodes: (__VLS_ctx.flowNodes),
            edges: (__VLS_ctx.flowEdges),
            nodeTypes: (__VLS_ctx.nodeTypes),
            defaultViewport: ({ x: 0, y: 0, zoom: 0.9 }),
            minZoom: (0.15),
            maxZoom: (3),
            fitViewOnInit: (true),
            nodesDraggable: (true),
            snapToGrid: (true),
            snapGrid: ([15, 15]),
            ...{ class: "lineage-flow" },
        }));
        const __VLS_246 = __VLS_245({
            ...{ 'onNodeClick': {} },
            nodes: (__VLS_ctx.flowNodes),
            edges: (__VLS_ctx.flowEdges),
            nodeTypes: (__VLS_ctx.nodeTypes),
            defaultViewport: ({ x: 0, y: 0, zoom: 0.9 }),
            minZoom: (0.15),
            maxZoom: (3),
            fitViewOnInit: (true),
            nodesDraggable: (true),
            snapToGrid: (true),
            snapGrid: ([15, 15]),
            ...{ class: "lineage-flow" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_245));
        let __VLS_248;
        let __VLS_249;
        let __VLS_250;
        const __VLS_251 = {
            onNodeClick: (__VLS_ctx.onNodeClick)
        };
        __VLS_247.slots.default;
        const __VLS_252 = {}.Background;
        /** @type {[typeof __VLS_components.Background, ]} */ ;
        // @ts-ignore
        const __VLS_253 = __VLS_asFunctionalComponent(__VLS_252, new __VLS_252({
            gap: (20),
            size: (1),
            patternColor: "#e8e8e8",
        }));
        const __VLS_254 = __VLS_253({
            gap: (20),
            size: (1),
            patternColor: "#e8e8e8",
        }, ...__VLS_functionalComponentArgsRest(__VLS_253));
        const __VLS_256 = {}.Controls;
        /** @type {[typeof __VLS_components.Controls, ]} */ ;
        // @ts-ignore
        const __VLS_257 = __VLS_asFunctionalComponent(__VLS_256, new __VLS_256({
            position: "top-right",
        }));
        const __VLS_258 = __VLS_257({
            position: "top-right",
        }, ...__VLS_functionalComponentArgsRest(__VLS_257));
        var __VLS_247;
    }
    else if (__VLS_ctx.viewMode === 'graph' && __VLS_ctx.graphError) {
        const __VLS_260 = {}.ElCard;
        /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
        // @ts-ignore
        const __VLS_261 = __VLS_asFunctionalComponent(__VLS_260, new __VLS_260({
            shadow: "never",
            ...{ class: "state-card" },
        }));
        const __VLS_262 = __VLS_261({
            shadow: "never",
            ...{ class: "state-card" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_261));
        __VLS_263.slots.default;
        const __VLS_264 = {}.ElResult;
        /** @type {[typeof __VLS_components.ElResult, typeof __VLS_components.elResult, typeof __VLS_components.ElResult, typeof __VLS_components.elResult, ]} */ ;
        // @ts-ignore
        const __VLS_265 = __VLS_asFunctionalComponent(__VLS_264, new __VLS_264({
            icon: "warning",
            title: "图谱加载失败",
            subTitle: "已自动切换到列表视图",
        }));
        const __VLS_266 = __VLS_265({
            icon: "warning",
            title: "图谱加载失败",
            subTitle: "已自动切换到列表视图",
        }, ...__VLS_functionalComponentArgsRest(__VLS_265));
        __VLS_267.slots.default;
        {
            const { extra: __VLS_thisSlot } = __VLS_267.slots;
            const __VLS_268 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_269 = __VLS_asFunctionalComponent(__VLS_268, new __VLS_268({
                ...{ 'onClick': {} },
                type: "primary",
            }));
            const __VLS_270 = __VLS_269({
                ...{ 'onClick': {} },
                type: "primary",
            }, ...__VLS_functionalComponentArgsRest(__VLS_269));
            let __VLS_272;
            let __VLS_273;
            let __VLS_274;
            const __VLS_275 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.data && __VLS_ctx.data.nodes.length > 0))
                        return;
                    if (!!(__VLS_ctx.viewMode === 'list'))
                        return;
                    if (!!(__VLS_ctx.viewMode === 'graph' && !__VLS_ctx.graphError))
                        return;
                    if (!(__VLS_ctx.viewMode === 'graph' && __VLS_ctx.graphError))
                        return;
                    __VLS_ctx.viewMode = 'list';
                }
            };
            __VLS_271.slots.default;
            var __VLS_271;
        }
        var __VLS_267;
        var __VLS_263;
    }
}
const __VLS_276 = {}.ElDrawer;
/** @type {[typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, ]} */ ;
// @ts-ignore
const __VLS_277 = __VLS_asFunctionalComponent(__VLS_276, new __VLS_276({
    modelValue: (__VLS_ctx.detailVisible),
    title: "节点详情",
    size: "400px",
    direction: "rtl",
}));
const __VLS_278 = __VLS_277({
    modelValue: (__VLS_ctx.detailVisible),
    title: "节点详情",
    size: "400px",
    direction: "rtl",
}, ...__VLS_functionalComponentArgsRest(__VLS_277));
__VLS_279.slots.default;
if (__VLS_ctx.selectedNode) {
    const __VLS_280 = {}.ElDescriptions;
    /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
    // @ts-ignore
    const __VLS_281 = __VLS_asFunctionalComponent(__VLS_280, new __VLS_280({
        column: (1),
        border: true,
        size: "small",
    }));
    const __VLS_282 = __VLS_281({
        column: (1),
        border: true,
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_281));
    __VLS_283.slots.default;
    const __VLS_284 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_285 = __VLS_asFunctionalComponent(__VLS_284, new __VLS_284({
        label: "类型",
    }));
    const __VLS_286 = __VLS_285({
        label: "类型",
    }, ...__VLS_functionalComponentArgsRest(__VLS_285));
    __VLS_287.slots.default;
    const __VLS_288 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_289 = __VLS_asFunctionalComponent(__VLS_288, new __VLS_288({
        color: (__VLS_ctx.nodeColor(__VLS_ctx.selectedNode)),
        size: "small",
        effect: "dark",
        disableTransitions: true,
    }));
    const __VLS_290 = __VLS_289({
        color: (__VLS_ctx.nodeColor(__VLS_ctx.selectedNode)),
        size: "small",
        effect: "dark",
        disableTransitions: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_289));
    __VLS_291.slots.default;
    (__VLS_ctx.nodeLabel(__VLS_ctx.selectedNode));
    var __VLS_291;
    var __VLS_287;
    const __VLS_292 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_293 = __VLS_asFunctionalComponent(__VLS_292, new __VLS_292({
        label: "名称",
    }));
    const __VLS_294 = __VLS_293({
        label: "名称",
    }, ...__VLS_functionalComponentArgsRest(__VLS_293));
    __VLS_295.slots.default;
    (__VLS_ctx.selectedNode.label);
    var __VLS_295;
    const __VLS_296 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_297 = __VLS_asFunctionalComponent(__VLS_296, new __VLS_296({
        label: "状态",
    }));
    const __VLS_298 = __VLS_297({
        label: "状态",
    }, ...__VLS_functionalComponentArgsRest(__VLS_297));
    __VLS_299.slots.default;
    (__VLS_ctx.selectedNode.status);
    var __VLS_299;
    const __VLS_300 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_301 = __VLS_asFunctionalComponent(__VLS_300, new __VLS_300({
        label: "风险等级",
    }));
    const __VLS_302 = __VLS_301({
        label: "风险等级",
    }, ...__VLS_functionalComponentArgsRest(__VLS_301));
    __VLS_303.slots.default;
    const __VLS_304 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_305 = __VLS_asFunctionalComponent(__VLS_304, new __VLS_304({
        type: (__VLS_ctx.selectedNode.risk_level === 'high' ? 'danger' : __VLS_ctx.selectedNode.risk_level === 'medium' ? 'warning' : ''),
        size: "small",
    }));
    const __VLS_306 = __VLS_305({
        type: (__VLS_ctx.selectedNode.risk_level === 'high' ? 'danger' : __VLS_ctx.selectedNode.risk_level === 'medium' ? 'warning' : ''),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_305));
    __VLS_307.slots.default;
    (__VLS_ctx.selectedNode.risk_level === 'high' ? '高' : __VLS_ctx.selectedNode.risk_level === 'medium' ? '中' : '低');
    var __VLS_307;
    var __VLS_303;
    const __VLS_308 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_309 = __VLS_asFunctionalComponent(__VLS_308, new __VLS_308({
        label: "节点 ID",
    }));
    const __VLS_310 = __VLS_309({
        label: "节点 ID",
    }, ...__VLS_functionalComponentArgsRest(__VLS_309));
    __VLS_311.slots.default;
    (__VLS_ctx.selectedNode.id);
    var __VLS_311;
    var __VLS_283;
    if (__VLS_ctx.selectedNode.ucp_summary) {
        const __VLS_312 = {}.ElDivider;
        /** @type {[typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, ]} */ ;
        // @ts-ignore
        const __VLS_313 = __VLS_asFunctionalComponent(__VLS_312, new __VLS_312({
            contentPosition: "left",
        }));
        const __VLS_314 = __VLS_313({
            contentPosition: "left",
        }, ...__VLS_functionalComponentArgsRest(__VLS_313));
        __VLS_315.slots.default;
        var __VLS_315;
        const __VLS_316 = {}.ElDescriptions;
        /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
        // @ts-ignore
        const __VLS_317 = __VLS_asFunctionalComponent(__VLS_316, new __VLS_316({
            column: (1),
            border: true,
            size: "small",
        }));
        const __VLS_318 = __VLS_317({
            column: (1),
            border: true,
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_317));
        __VLS_319.slots.default;
        const __VLS_320 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_321 = __VLS_asFunctionalComponent(__VLS_320, new __VLS_320({
            label: "系统 ID",
        }));
        const __VLS_322 = __VLS_321({
            label: "系统 ID",
        }, ...__VLS_functionalComponentArgsRest(__VLS_321));
        __VLS_323.slots.default;
        (__VLS_ctx.selectedNode.ucp_summary.system_id);
        var __VLS_323;
        const __VLS_324 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_325 = __VLS_asFunctionalComponent(__VLS_324, new __VLS_324({
            label: "资源 ID",
        }));
        const __VLS_326 = __VLS_325({
            label: "资源 ID",
        }, ...__VLS_functionalComponentArgsRest(__VLS_325));
        __VLS_327.slots.default;
        (__VLS_ctx.selectedNode.ucp_summary.resource_id);
        var __VLS_327;
        var __VLS_319;
    }
    const __VLS_328 = {}.ElDivider;
    /** @type {[typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, ]} */ ;
    // @ts-ignore
    const __VLS_329 = __VLS_asFunctionalComponent(__VLS_328, new __VLS_328({
        contentPosition: "left",
    }));
    const __VLS_330 = __VLS_329({
        contentPosition: "left",
    }, ...__VLS_functionalComponentArgsRest(__VLS_329));
    __VLS_331.slots.default;
    var __VLS_331;
    if (__VLS_ctx.filteredEdges.filter(e => e.source_id === __VLS_ctx.selectedNode.id || e.target_id === __VLS_ctx.selectedNode.id).length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        for (const [e] of __VLS_getVForSourceType((__VLS_ctx.filteredEdges.filter(ed => ed.source_id === __VLS_ctx.selectedNode.id || ed.target_id === __VLS_ctx.selectedNode.id)))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (e.source_id + e.target_id + e.relation_type),
                ...{ style: {} },
            });
            if (e.source_id === __VLS_ctx.selectedNode.id) {
                (e.label || __VLS_ctx.LINEAGE_EDGE_LABELS[e.relation_type] || e.relation_type);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ style: {} },
                });
                (__VLS_ctx.filteredNodes.find(n => n.id === e.target_id)?.label || e.target_id);
            }
            else {
                (e.label || __VLS_ctx.LINEAGE_EDGE_LABELS[e.relation_type] || e.relation_type);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ style: {} },
                });
                (__VLS_ctx.filteredNodes.find(n => n.id === e.source_id)?.label || e.source_id);
            }
        }
    }
    else {
        const __VLS_332 = {}.ElEmpty;
        /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
        // @ts-ignore
        const __VLS_333 = __VLS_asFunctionalComponent(__VLS_332, new __VLS_332({
            description: "无关联关系",
            imageSize: (60),
        }));
        const __VLS_334 = __VLS_333({
            description: "无关联关系",
            imageSize: (60),
        }, ...__VLS_functionalComponentArgsRest(__VLS_333));
    }
    if (__VLS_ctx.selectedNode.detail_route) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        const __VLS_336 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_337 = __VLS_asFunctionalComponent(__VLS_336, new __VLS_336({
            ...{ 'onClick': {} },
            type: "primary",
            icon: (__VLS_ctx.Connection),
        }));
        const __VLS_338 = __VLS_337({
            ...{ 'onClick': {} },
            type: "primary",
            icon: (__VLS_ctx.Connection),
        }, ...__VLS_functionalComponentArgsRest(__VLS_337));
        let __VLS_340;
        let __VLS_341;
        let __VLS_342;
        const __VLS_343 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.selectedNode))
                    return;
                if (!(__VLS_ctx.selectedNode.detail_route))
                    return;
                __VLS_ctx.navigateTo(__VLS_ctx.selectedNode.detail_route);
            }
        };
        __VLS_339.slots.default;
        var __VLS_339;
    }
}
var __VLS_279;
/** @type {__VLS_StyleScopedClasses['lineage-page']} */ ;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['query-card']} */ ;
/** @type {__VLS_StyleScopedClasses['state-card']} */ ;
/** @type {__VLS_StyleScopedClasses['state-card']} */ ;
/** @type {__VLS_StyleScopedClasses['state-card']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-v']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-v-left']} */ ;
/** @type {__VLS_StyleScopedClasses['node-count']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-v-right']} */ ;
/** @type {__VLS_StyleScopedClasses['graph-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['lineage-flow']} */ ;
/** @type {__VLS_StyleScopedClasses['state-card']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Search: Search,
            Refresh: Refresh,
            Right: Right,
            Connection: Connection,
            VueFlow: VueFlow,
            Background: Background,
            Controls: Controls,
            LINEAGE_EDGE_LABELS: LINEAGE_EDGE_LABELS,
            loading: loading,
            errorMsg: errorMsg,
            graphError: graphError,
            viewMode: viewMode,
            queryType: queryType,
            tableName: tableName,
            columnCode: columnCode,
            direction: direction,
            depth: depth,
            data: data,
            selectedNode: selectedNode,
            detailVisible: detailVisible,
            flowNodes: flowNodes,
            flowEdges: flowEdges,
            nodeTypes: nodeTypes,
            filteredNodes: filteredNodes,
            filteredEdges: filteredEdges,
            centerNode: centerNode,
            query: query,
            handleSearch: handleSearch,
            nodeLabel: nodeLabel,
            nodeColor: nodeColor,
            openDetail: openDetail,
            navigateTo: navigateTo,
            switchToGraph: switchToGraph,
            onNodeClick: onNodeClick,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
