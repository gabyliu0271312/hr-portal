/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { formatDateTime } from '@/utils/datetime';
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowLeft } from '@element-plus/icons-vue';
import { ucpApi } from '@/api/ucp';
const route = useRoute();
const router = useRouter();
const event = ref(null);
const loading = ref(false);
const deliveries = ref([]);
const rawVisible = ref(false);
const rawLoading = ref(false);
const rawPayload = ref({});
async function loadDetail() {
    const id = String(route.params.eventId || '');
    if (!id)
        return;
    loading.value = true;
    try {
        event.value = await ucpApi.getEvent(id);
        // 加载派发尝试历史
        try {
            const dr = await ucpApi.listEventDeliveries(event.value.event_id, 50);
            deliveries.value = dr.items || [];
        }
        catch {
            deliveries.value = [];
        }
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '事件加载失败');
    }
    finally {
        loading.value = false;
    }
}
function goBack() {
    router.push({ name: 'UcpEventList' });
}
async function openRawPayload() {
    if (!event.value)
        return;
    try {
        const { value } = await ElMessageBox.prompt('Provide a reason for viewing the original payload. This access is audited.', 'View original payload', { inputPattern: /\S{3,}/, inputErrorMessage: 'Please provide at least 3 characters.' });
        rawLoading.value = true;
        const result = await ucpApi.getRawEventPayload(event.value.event_id, value);
        rawPayload.value = result.payload || {};
        rawVisible.value = true;
    }
    catch (error) {
        if (error !== 'cancel')
            ElMessage.error(error?.response?.data?.detail || 'Original payload is unavailable');
    }
    finally {
        rawLoading.value = false;
    }
}
async function manualDispatch() {
    if (!event.value)
        return;
    await ElMessageBox.confirm(`确认对事件 ${event.value.event_id} 重新匹配并派发？`, '手动派发', { type: 'warning' });
    try {
        const res = await ucpApi.manualDispatchEvent(String(event.value.id));
        ElMessage.success(`已派发：${res.status} / ${res.matched_trigger_code || '无匹配'}`);
        loadDetail();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '派发失败');
    }
}
const timeline = computed(() => {
    if (!event.value)
        return [];
    const e = event.value;
    const nodes = [];
    if (e.event_timestamp)
        nodes.push({ label: '事件产生', time: formatTime(e.event_timestamp), color: '#909399' });
    if (e.received_at)
        nodes.push({ label: '事件接收', time: formatTime(e.received_at), color: '#67c23a' });
    if (e.matched_trigger_code)
        nodes.push({ label: `匹配触发器 ${e.matched_trigger_code}`, time: '-', color: '#409eff' });
    if (e.dispatched_at)
        nodes.push({ label: `派发到 Pipeline (${e.pipeline_run_id || '-'})`, time: formatTime(e.dispatched_at), color: '#409eff' });
    if (e.completed_at)
        nodes.push({ label: 'Pipeline 完成', time: formatTime(e.completed_at), color: '#67c23a' });
    if (e.error_message)
        nodes.push({ label: `失败: [${e.error_code}] ${e.error_message}`, time: '-', color: '#f56c6c' });
    return nodes;
});
function prettyJson(obj) {
    try {
        return JSON.stringify(obj, null, 2);
    }
    catch {
        return String(obj);
    }
}
function copyJson(obj) {
    const text = prettyJson(obj);
    navigator.clipboard.writeText(text).then(() => ElMessage.success('已复制'), () => ElMessage.error('复制失败'));
}
function statusTagType(s) {
    switch (s) {
        case 'COMPLETED':
        case 'DISPATCHED': return 'success';
        case 'MATCHED':
        case 'RECEIVED': return 'info';
        case 'FAILED':
        case 'DEAD_LETTER': return 'danger';
        case 'NO_MATCH': return 'warning';
        default: return '';
    }
}
function statusLabel(s) {
    const map = {
        RECEIVED: '已接收', MATCHED: '已匹配', DISPATCHED: '已派发',
        COMPLETED: '已完成', FAILED: '失败', DEAD_LETTER: '死信', NO_MATCH: '未匹配',
    };
    return map[s] || s;
}
function sourceTagType(s) {
    if (s === 'FEISHU')
        return 'success';
    if (s === 'BEISEN')
        return 'warning';
    if (s === 'INTERNAL')
        return 'info';
    return '';
}
function formatTime(t) {
    if (!t)
        return '-';
    return formatDateTime(t);
}
function calcDurationMs(start, end) {
    return new Date(end).getTime() - new Date(start).getTime();
}
function deliveryColor(status) {
    if (status === 'SUCCESS')
        return '#67c23a';
    if (status === 'FAILED')
        return '#e6a23c';
    if (status === 'DEAD_LETTER')
        return '#f56c6c';
    if (status === 'PENDING')
        return '#409eff';
    return '#909399';
}
function deliveryTagType(status) {
    if (status === 'SUCCESS')
        return 'success';
    if (status === 'FAILED')
        return 'warning';
    if (status === 'DEAD_LETTER')
        return 'danger';
    if (status === 'PENDING')
        return 'info';
    return '';
}
onMounted(loadDetail);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "event-detail" },
});
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
const __VLS_0 = {}.ElPageHeader;
/** @type {[typeof __VLS_components.ElPageHeader, typeof __VLS_components.elPageHeader, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onBack': {} },
    icon: (__VLS_ctx.ArrowLeft),
    content: "返回事件列表",
    ...{ class: "back-header" },
}));
const __VLS_2 = __VLS_1({
    ...{ 'onBack': {} },
    icon: (__VLS_ctx.ArrowLeft),
    content: "返回事件列表",
    ...{ class: "back-header" },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onBack: (__VLS_ctx.goBack)
};
var __VLS_3;
if (__VLS_ctx.event) {
    const __VLS_8 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        ...{ class: "overview" },
        shadow: "hover",
    }));
    const __VLS_10 = __VLS_9({
        ...{ class: "overview" },
        shadow: "hover",
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    __VLS_11.slots.default;
    {
        const { header: __VLS_thisSlot } = __VLS_11.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "card-header" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "title" },
        });
        (__VLS_ctx.event.id);
        (__VLS_ctx.event.event_id);
        const __VLS_12 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
            type: (__VLS_ctx.statusTagType(__VLS_ctx.event.status)),
            size: "large",
        }));
        const __VLS_14 = __VLS_13({
            type: (__VLS_ctx.statusTagType(__VLS_ctx.event.status)),
            size: "large",
        }, ...__VLS_functionalComponentArgsRest(__VLS_13));
        __VLS_15.slots.default;
        (__VLS_ctx.statusLabel(__VLS_ctx.event.status));
        var __VLS_15;
    }
    const __VLS_16 = {}.ElDescriptions;
    /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
        column: (3),
        border: true,
    }));
    const __VLS_18 = __VLS_17({
        column: (3),
        border: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_17));
    __VLS_19.slots.default;
    const __VLS_20 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
        label: "事件类型",
    }));
    const __VLS_22 = __VLS_21({
        label: "事件类型",
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
    __VLS_23.slots.default;
    const __VLS_24 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
        size: "small",
        effect: "plain",
    }));
    const __VLS_26 = __VLS_25({
        size: "small",
        effect: "plain",
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
    __VLS_27.slots.default;
    (__VLS_ctx.event.event_type);
    var __VLS_27;
    var __VLS_23;
    const __VLS_28 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
        label: "来源",
    }));
    const __VLS_30 = __VLS_29({
        label: "来源",
    }, ...__VLS_functionalComponentArgsRest(__VLS_29));
    __VLS_31.slots.default;
    const __VLS_32 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
        type: (__VLS_ctx.sourceTagType(__VLS_ctx.event.source)),
        size: "small",
    }));
    const __VLS_34 = __VLS_33({
        type: (__VLS_ctx.sourceTagType(__VLS_ctx.event.source)),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_33));
    __VLS_35.slots.default;
    (__VLS_ctx.event.source);
    var __VLS_35;
    var __VLS_31;
    const __VLS_36 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
        label: "触发模式",
    }));
    const __VLS_38 = __VLS_37({
        label: "触发模式",
    }, ...__VLS_functionalComponentArgsRest(__VLS_37));
    __VLS_39.slots.default;
    (__VLS_ctx.event.trigger);
    var __VLS_39;
    const __VLS_40 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
        label: "Resource",
    }));
    const __VLS_42 = __VLS_41({
        label: "Resource",
    }, ...__VLS_functionalComponentArgsRest(__VLS_41));
    __VLS_43.slots.default;
    (__VLS_ctx.event.resource_id || '-');
    var __VLS_43;
    const __VLS_44 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
        label: "Event Object",
    }));
    const __VLS_46 = __VLS_45({
        label: "Event Object",
    }, ...__VLS_functionalComponentArgsRest(__VLS_45));
    __VLS_47.slots.default;
    (__VLS_ctx.event.resource_object_id || '-');
    var __VLS_47;
    const __VLS_48 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
        label: "Definition",
    }));
    const __VLS_50 = __VLS_49({
        label: "Definition",
    }, ...__VLS_functionalComponentArgsRest(__VLS_49));
    __VLS_51.slots.default;
    (__VLS_ctx.event.event_definition_id || '-');
    var __VLS_51;
    const __VLS_52 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
        label: "Trace ID",
    }));
    const __VLS_54 = __VLS_53({
        label: "Trace ID",
    }, ...__VLS_functionalComponentArgsRest(__VLS_53));
    __VLS_55.slots.default;
    if (__VLS_ctx.event.trace_id) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({});
        (__VLS_ctx.event.trace_id);
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "empty" },
        });
    }
    var __VLS_55;
    const __VLS_56 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
        label: "命中触发器",
    }));
    const __VLS_58 = __VLS_57({
        label: "命中触发器",
    }, ...__VLS_functionalComponentArgsRest(__VLS_57));
    __VLS_59.slots.default;
    if (__VLS_ctx.event.matched_trigger_code) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({});
        (__VLS_ctx.event.matched_trigger_code);
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "empty" },
        });
    }
    var __VLS_59;
    const __VLS_60 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
        label: "Pipeline Run ID",
    }));
    const __VLS_62 = __VLS_61({
        label: "Pipeline Run ID",
    }, ...__VLS_functionalComponentArgsRest(__VLS_61));
    __VLS_63.slots.default;
    if (__VLS_ctx.event.pipeline_run_id) {
        const __VLS_64 = {}.ElLink;
        /** @type {[typeof __VLS_components.ElLink, typeof __VLS_components.elLink, typeof __VLS_components.ElLink, typeof __VLS_components.elLink, ]} */ ;
        // @ts-ignore
        const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
            ...{ 'onClick': {} },
            type: "primary",
        }));
        const __VLS_66 = __VLS_65({
            ...{ 'onClick': {} },
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_65));
        let __VLS_68;
        let __VLS_69;
        let __VLS_70;
        const __VLS_71 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.event))
                    return;
                if (!(__VLS_ctx.event.pipeline_run_id))
                    return;
                __VLS_ctx.router.push(`/ucp/executions/${__VLS_ctx.event.pipeline_run_id}`);
            }
        };
        __VLS_67.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({});
        (__VLS_ctx.event.pipeline_run_id);
        var __VLS_67;
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "empty" },
        });
    }
    var __VLS_63;
    const __VLS_72 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
        label: "重试次数",
        span: (1),
    }));
    const __VLS_74 = __VLS_73({
        label: "重试次数",
        span: (1),
    }, ...__VLS_functionalComponentArgsRest(__VLS_73));
    __VLS_75.slots.default;
    (__VLS_ctx.event.retry_count);
    var __VLS_75;
    const __VLS_76 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
        label: "事件时间",
    }));
    const __VLS_78 = __VLS_77({
        label: "事件时间",
    }, ...__VLS_functionalComponentArgsRest(__VLS_77));
    __VLS_79.slots.default;
    (__VLS_ctx.formatTime(__VLS_ctx.event.event_timestamp));
    var __VLS_79;
    const __VLS_80 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
        label: "接收时间",
    }));
    const __VLS_82 = __VLS_81({
        label: "接收时间",
    }, ...__VLS_functionalComponentArgsRest(__VLS_81));
    __VLS_83.slots.default;
    (__VLS_ctx.formatTime(__VLS_ctx.event.received_at));
    var __VLS_83;
    const __VLS_84 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
        label: "派发时间",
    }));
    const __VLS_86 = __VLS_85({
        label: "派发时间",
    }, ...__VLS_functionalComponentArgsRest(__VLS_85));
    __VLS_87.slots.default;
    (__VLS_ctx.formatTime(__VLS_ctx.event.dispatched_at));
    var __VLS_87;
    const __VLS_88 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
        label: "完成时间",
    }));
    const __VLS_90 = __VLS_89({
        label: "完成时间",
    }, ...__VLS_functionalComponentArgsRest(__VLS_89));
    __VLS_91.slots.default;
    (__VLS_ctx.formatTime(__VLS_ctx.event.completed_at));
    var __VLS_91;
    const __VLS_92 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
        label: "耗时（ms）",
    }));
    const __VLS_94 = __VLS_93({
        label: "耗时（ms）",
    }, ...__VLS_functionalComponentArgsRest(__VLS_93));
    __VLS_95.slots.default;
    if (__VLS_ctx.event.received_at && __VLS_ctx.event.completed_at) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.calcDurationMs(__VLS_ctx.event.received_at, __VLS_ctx.event.completed_at));
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "empty" },
        });
    }
    var __VLS_95;
    var __VLS_19;
    const __VLS_96 = {}.ElDivider;
    /** @type {[typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, ]} */ ;
    // @ts-ignore
    const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({}));
    const __VLS_98 = __VLS_97({}, ...__VLS_functionalComponentArgsRest(__VLS_97));
    __VLS_99.slots.default;
    var __VLS_99;
    const __VLS_100 = {}.ElDescriptions;
    /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
    // @ts-ignore
    const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
        column: (2),
        border: true,
        ...{ class: "source-chain" },
    }));
    const __VLS_102 = __VLS_101({
        column: (2),
        border: true,
        ...{ class: "source-chain" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_101));
    __VLS_103.slots.default;
    const __VLS_104 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
        label: "Resource",
    }));
    const __VLS_106 = __VLS_105({
        label: "Resource",
    }, ...__VLS_functionalComponentArgsRest(__VLS_105));
    __VLS_107.slots.default;
    if (__VLS_ctx.event.source_chain?.resource) {
        const __VLS_108 = {}.ElLink;
        /** @type {[typeof __VLS_components.ElLink, typeof __VLS_components.elLink, typeof __VLS_components.ElLink, typeof __VLS_components.elLink, ]} */ ;
        // @ts-ignore
        const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
            ...{ 'onClick': {} },
            type: "primary",
        }));
        const __VLS_110 = __VLS_109({
            ...{ 'onClick': {} },
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_109));
        let __VLS_112;
        let __VLS_113;
        let __VLS_114;
        const __VLS_115 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.event))
                    return;
                if (!(__VLS_ctx.event.source_chain?.resource))
                    return;
                __VLS_ctx.router.push(__VLS_ctx.event.source_chain.resource.href);
            }
        };
        __VLS_111.slots.default;
        (__VLS_ctx.event.source_chain.resource.name);
        (__VLS_ctx.event.source_chain.resource.code);
        var __VLS_111;
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
    var __VLS_107;
    const __VLS_116 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
        label: "Event object",
    }));
    const __VLS_118 = __VLS_117({
        label: "Event object",
    }, ...__VLS_functionalComponentArgsRest(__VLS_117));
    __VLS_119.slots.default;
    if (__VLS_ctx.event.source_chain?.resource_object) {
        const __VLS_120 = {}.ElLink;
        /** @type {[typeof __VLS_components.ElLink, typeof __VLS_components.elLink, typeof __VLS_components.ElLink, typeof __VLS_components.elLink, ]} */ ;
        // @ts-ignore
        const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
            ...{ 'onClick': {} },
            type: "primary",
        }));
        const __VLS_122 = __VLS_121({
            ...{ 'onClick': {} },
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_121));
        let __VLS_124;
        let __VLS_125;
        let __VLS_126;
        const __VLS_127 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.event))
                    return;
                if (!(__VLS_ctx.event.source_chain?.resource_object))
                    return;
                __VLS_ctx.router.push(__VLS_ctx.event.source_chain.resource_object.href);
            }
        };
        __VLS_123.slots.default;
        (__VLS_ctx.event.source_chain.resource_object.name);
        (__VLS_ctx.event.source_chain.resource_object.code);
        var __VLS_123;
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
    var __VLS_119;
    const __VLS_128 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
        label: "Event definition",
    }));
    const __VLS_130 = __VLS_129({
        label: "Event definition",
    }, ...__VLS_functionalComponentArgsRest(__VLS_129));
    __VLS_131.slots.default;
    if (__VLS_ctx.event.source_chain?.event_definition) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.event.source_chain.event_definition.name);
        (__VLS_ctx.event.source_chain.event_definition.version);
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
    var __VLS_131;
    const __VLS_132 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
        label: "Trigger",
    }));
    const __VLS_134 = __VLS_133({
        label: "Trigger",
    }, ...__VLS_functionalComponentArgsRest(__VLS_133));
    __VLS_135.slots.default;
    if (__VLS_ctx.event.source_chain?.trigger) {
        const __VLS_136 = {}.ElLink;
        /** @type {[typeof __VLS_components.ElLink, typeof __VLS_components.elLink, typeof __VLS_components.ElLink, typeof __VLS_components.elLink, ]} */ ;
        // @ts-ignore
        const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
            ...{ 'onClick': {} },
            type: "primary",
        }));
        const __VLS_138 = __VLS_137({
            ...{ 'onClick': {} },
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_137));
        let __VLS_140;
        let __VLS_141;
        let __VLS_142;
        const __VLS_143 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.event))
                    return;
                if (!(__VLS_ctx.event.source_chain?.trigger))
                    return;
                __VLS_ctx.router.push(__VLS_ctx.event.source_chain.trigger.href);
            }
        };
        __VLS_139.slots.default;
        (__VLS_ctx.event.source_chain.trigger.name);
        (__VLS_ctx.event.source_chain.trigger.code);
        var __VLS_139;
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
    var __VLS_135;
    const __VLS_144 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
        label: "Template",
    }));
    const __VLS_146 = __VLS_145({
        label: "Template",
    }, ...__VLS_functionalComponentArgsRest(__VLS_145));
    __VLS_147.slots.default;
    if (__VLS_ctx.event.source_chain?.template) {
        const __VLS_148 = {}.ElLink;
        /** @type {[typeof __VLS_components.ElLink, typeof __VLS_components.elLink, typeof __VLS_components.ElLink, typeof __VLS_components.elLink, ]} */ ;
        // @ts-ignore
        const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
            ...{ 'onClick': {} },
            type: "primary",
        }));
        const __VLS_150 = __VLS_149({
            ...{ 'onClick': {} },
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_149));
        let __VLS_152;
        let __VLS_153;
        let __VLS_154;
        const __VLS_155 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.event))
                    return;
                if (!(__VLS_ctx.event.source_chain?.template))
                    return;
                __VLS_ctx.router.push(__VLS_ctx.event.source_chain.template.href);
            }
        };
        __VLS_151.slots.default;
        (__VLS_ctx.event.source_chain.template.name);
        (__VLS_ctx.event.source_chain.template.version);
        var __VLS_151;
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
    var __VLS_147;
    const __VLS_156 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_157 = __VLS_asFunctionalComponent(__VLS_156, new __VLS_156({
        label: "Execution",
    }));
    const __VLS_158 = __VLS_157({
        label: "Execution",
    }, ...__VLS_functionalComponentArgsRest(__VLS_157));
    __VLS_159.slots.default;
    if (__VLS_ctx.event.source_chain?.execution) {
        const __VLS_160 = {}.ElLink;
        /** @type {[typeof __VLS_components.ElLink, typeof __VLS_components.elLink, typeof __VLS_components.ElLink, typeof __VLS_components.elLink, ]} */ ;
        // @ts-ignore
        const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
            ...{ 'onClick': {} },
            type: "primary",
        }));
        const __VLS_162 = __VLS_161({
            ...{ 'onClick': {} },
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_161));
        let __VLS_164;
        let __VLS_165;
        let __VLS_166;
        const __VLS_167 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.event))
                    return;
                if (!(__VLS_ctx.event.source_chain?.execution))
                    return;
                __VLS_ctx.router.push(__VLS_ctx.event.source_chain.execution.href);
            }
        };
        __VLS_163.slots.default;
        (__VLS_ctx.event.source_chain.execution.pipeline_run_id);
        var __VLS_163;
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
    var __VLS_159;
    var __VLS_103;
    if (__VLS_ctx.event.error_message) {
        const __VLS_168 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({
            title: (`[${__VLS_ctx.event.error_code || 'ERROR'}] ${__VLS_ctx.event.error_message}`),
            type: "error",
            closable: (false),
            ...{ class: "error-alert" },
        }));
        const __VLS_170 = __VLS_169({
            title: (`[${__VLS_ctx.event.error_code || 'ERROR'}] ${__VLS_ctx.event.error_message}`),
            type: "error",
            closable: (false),
            ...{ class: "error-alert" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_169));
    }
    var __VLS_11;
    const __VLS_172 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_173 = __VLS_asFunctionalComponent(__VLS_172, new __VLS_172({
        ...{ class: "payload" },
        shadow: "hover",
    }));
    const __VLS_174 = __VLS_173({
        ...{ class: "payload" },
        shadow: "hover",
    }, ...__VLS_functionalComponentArgsRest(__VLS_173));
    __VLS_175.slots.default;
    {
        const { header: __VLS_thisSlot } = __VLS_175.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "card-header" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "title" },
        });
        const __VLS_176 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({
            ...{ 'onClick': {} },
            size: "small",
        }));
        const __VLS_178 = __VLS_177({
            ...{ 'onClick': {} },
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_177));
        let __VLS_180;
        let __VLS_181;
        let __VLS_182;
        const __VLS_183 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.event))
                    return;
                __VLS_ctx.copyJson(__VLS_ctx.event.payload);
            }
        };
        __VLS_179.slots.default;
        var __VLS_179;
        const __VLS_184 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_185 = __VLS_asFunctionalComponent(__VLS_184, new __VLS_184({
            ...{ 'onClick': {} },
            size: "small",
            type: "warning",
            loading: (__VLS_ctx.rawLoading),
        }));
        const __VLS_186 = __VLS_185({
            ...{ 'onClick': {} },
            size: "small",
            type: "warning",
            loading: (__VLS_ctx.rawLoading),
        }, ...__VLS_functionalComponentArgsRest(__VLS_185));
        let __VLS_188;
        let __VLS_189;
        let __VLS_190;
        const __VLS_191 = {
            onClick: (__VLS_ctx.openRawPayload)
        };
        __VLS_187.slots.default;
        var __VLS_187;
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.pre, __VLS_intrinsicElements.pre)({
        ...{ class: "json-block" },
    });
    (__VLS_ctx.prettyJson(__VLS_ctx.event.payload));
    var __VLS_175;
    const __VLS_192 = {}.ElDialog;
    /** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
    // @ts-ignore
    const __VLS_193 = __VLS_asFunctionalComponent(__VLS_192, new __VLS_192({
        modelValue: (__VLS_ctx.rawVisible),
        title: "Original payload (audited access)",
        width: "720px",
    }));
    const __VLS_194 = __VLS_193({
        modelValue: (__VLS_ctx.rawVisible),
        title: "Original payload (audited access)",
        width: "720px",
    }, ...__VLS_functionalComponentArgsRest(__VLS_193));
    __VLS_195.slots.default;
    const __VLS_196 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_197 = __VLS_asFunctionalComponent(__VLS_196, new __VLS_196({
        type: "warning",
        closable: (false),
        title: "This access is recorded and requires event export permission.",
    }));
    const __VLS_198 = __VLS_197({
        type: "warning",
        closable: (false),
        title: "This access is recorded and requires event export permission.",
    }, ...__VLS_functionalComponentArgsRest(__VLS_197));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.pre, __VLS_intrinsicElements.pre)({
        ...{ class: "json-block raw-payload" },
    });
    (__VLS_ctx.prettyJson(__VLS_ctx.rawPayload));
    var __VLS_195;
    if (__VLS_ctx.event.metadata) {
        const __VLS_200 = {}.ElCard;
        /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
        // @ts-ignore
        const __VLS_201 = __VLS_asFunctionalComponent(__VLS_200, new __VLS_200({
            ...{ class: "metadata" },
            shadow: "hover",
        }));
        const __VLS_202 = __VLS_201({
            ...{ class: "metadata" },
            shadow: "hover",
        }, ...__VLS_functionalComponentArgsRest(__VLS_201));
        __VLS_203.slots.default;
        {
            const { header: __VLS_thisSlot } = __VLS_203.slots;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "title" },
            });
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.pre, __VLS_intrinsicElements.pre)({
            ...{ class: "json-block" },
        });
        (__VLS_ctx.prettyJson(__VLS_ctx.event.metadata));
        var __VLS_203;
    }
    const __VLS_204 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_205 = __VLS_asFunctionalComponent(__VLS_204, new __VLS_204({
        ...{ class: "timeline-card" },
        shadow: "hover",
    }));
    const __VLS_206 = __VLS_205({
        ...{ class: "timeline-card" },
        shadow: "hover",
    }, ...__VLS_functionalComponentArgsRest(__VLS_205));
    __VLS_207.slots.default;
    {
        const { header: __VLS_thisSlot } = __VLS_207.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "title" },
        });
    }
    const __VLS_208 = {}.ElTimeline;
    /** @type {[typeof __VLS_components.ElTimeline, typeof __VLS_components.elTimeline, typeof __VLS_components.ElTimeline, typeof __VLS_components.elTimeline, ]} */ ;
    // @ts-ignore
    const __VLS_209 = __VLS_asFunctionalComponent(__VLS_208, new __VLS_208({}));
    const __VLS_210 = __VLS_209({}, ...__VLS_functionalComponentArgsRest(__VLS_209));
    __VLS_211.slots.default;
    for (const [node] of __VLS_getVForSourceType((__VLS_ctx.timeline))) {
        const __VLS_212 = {}.ElTimelineItem;
        /** @type {[typeof __VLS_components.ElTimelineItem, typeof __VLS_components.elTimelineItem, typeof __VLS_components.ElTimelineItem, typeof __VLS_components.elTimelineItem, ]} */ ;
        // @ts-ignore
        const __VLS_213 = __VLS_asFunctionalComponent(__VLS_212, new __VLS_212({
            key: (node.label),
            timestamp: (node.time),
            color: (node.color),
            hollow: (!node.color),
            placement: "top",
        }));
        const __VLS_214 = __VLS_213({
            key: (node.label),
            timestamp: (node.time),
            color: (node.color),
            hollow: (!node.color),
            placement: "top",
        }, ...__VLS_functionalComponentArgsRest(__VLS_213));
        __VLS_215.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "timeline-label" },
        });
        (node.label);
        if (node.detail) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "timeline-detail" },
            });
            (node.detail);
        }
        var __VLS_215;
    }
    var __VLS_211;
    var __VLS_207;
    if (__VLS_ctx.deliveries.length > 0) {
        const __VLS_216 = {}.ElCard;
        /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
        // @ts-ignore
        const __VLS_217 = __VLS_asFunctionalComponent(__VLS_216, new __VLS_216({
            ...{ class: "deliveries-card" },
            shadow: "hover",
        }));
        const __VLS_218 = __VLS_217({
            ...{ class: "deliveries-card" },
            shadow: "hover",
        }, ...__VLS_functionalComponentArgsRest(__VLS_217));
        __VLS_219.slots.default;
        {
            const { header: __VLS_thisSlot } = __VLS_219.slots;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "title" },
            });
            (__VLS_ctx.deliveries.length);
        }
        const __VLS_220 = {}.ElTimeline;
        /** @type {[typeof __VLS_components.ElTimeline, typeof __VLS_components.elTimeline, typeof __VLS_components.ElTimeline, typeof __VLS_components.elTimeline, ]} */ ;
        // @ts-ignore
        const __VLS_221 = __VLS_asFunctionalComponent(__VLS_220, new __VLS_220({}));
        const __VLS_222 = __VLS_221({}, ...__VLS_functionalComponentArgsRest(__VLS_221));
        __VLS_223.slots.default;
        for (const [d] of __VLS_getVForSourceType((__VLS_ctx.deliveries))) {
            const __VLS_224 = {}.ElTimelineItem;
            /** @type {[typeof __VLS_components.ElTimelineItem, typeof __VLS_components.elTimelineItem, typeof __VLS_components.ElTimelineItem, typeof __VLS_components.elTimelineItem, ]} */ ;
            // @ts-ignore
            const __VLS_225 = __VLS_asFunctionalComponent(__VLS_224, new __VLS_224({
                key: (d.id),
                timestamp: (__VLS_ctx.formatTime(d.created_at)),
                color: (__VLS_ctx.deliveryColor(d.status)),
                placement: "top",
            }));
            const __VLS_226 = __VLS_225({
                key: (d.id),
                timestamp: (__VLS_ctx.formatTime(d.created_at)),
                color: (__VLS_ctx.deliveryColor(d.status)),
                placement: "top",
            }, ...__VLS_functionalComponentArgsRest(__VLS_225));
            __VLS_227.slots.default;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "delivery-line" },
            });
            const __VLS_228 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_229 = __VLS_asFunctionalComponent(__VLS_228, new __VLS_228({
                size: "small",
                type: (__VLS_ctx.deliveryTagType(d.status)),
            }));
            const __VLS_230 = __VLS_229({
                size: "small",
                type: (__VLS_ctx.deliveryTagType(d.status)),
            }, ...__VLS_functionalComponentArgsRest(__VLS_229));
            __VLS_231.slots.default;
            (d.status);
            var __VLS_231;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "delivery-info" },
            });
            (d.attempt);
            (d.trigger_code || '-');
            if (d.pipeline_run_id) {
                const __VLS_232 = {}.ElLink;
                /** @type {[typeof __VLS_components.ElLink, typeof __VLS_components.elLink, typeof __VLS_components.ElLink, typeof __VLS_components.elLink, ]} */ ;
                // @ts-ignore
                const __VLS_233 = __VLS_asFunctionalComponent(__VLS_232, new __VLS_232({
                    ...{ 'onClick': {} },
                    type: "primary",
                    ...{ class: "run-id" },
                }));
                const __VLS_234 = __VLS_233({
                    ...{ 'onClick': {} },
                    type: "primary",
                    ...{ class: "run-id" },
                }, ...__VLS_functionalComponentArgsRest(__VLS_233));
                let __VLS_236;
                let __VLS_237;
                let __VLS_238;
                const __VLS_239 = {
                    onClick: (...[$event]) => {
                        if (!(__VLS_ctx.event))
                            return;
                        if (!(__VLS_ctx.deliveries.length > 0))
                            return;
                        if (!(d.pipeline_run_id))
                            return;
                        __VLS_ctx.router.push(`/ucp/executions/${d.pipeline_run_id}`);
                    }
                };
                __VLS_235.slots.default;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({});
                (d.pipeline_run_id);
                var __VLS_235;
            }
            if (d.error_message) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "timeline-detail" },
                });
                (d.error_code);
                (d.error_message);
            }
            if (d.next_retry_at) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "timeline-detail" },
                });
                (__VLS_ctx.formatTime(d.next_retry_at));
            }
            if (d.trigger_source) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "timeline-detail" },
                });
                (d.trigger_source);
                (d.triggered_by ? ` (${d.triggered_by})` : '');
            }
            var __VLS_227;
        }
        var __VLS_223;
        var __VLS_219;
    }
    const __VLS_240 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_241 = __VLS_asFunctionalComponent(__VLS_240, new __VLS_240({
        ...{ class: "actions" },
        shadow: "hover",
    }));
    const __VLS_242 = __VLS_241({
        ...{ class: "actions" },
        shadow: "hover",
    }, ...__VLS_functionalComponentArgsRest(__VLS_241));
    __VLS_243.slots.default;
    if (['RECEIVED', 'NO_MATCH', 'FAILED'].includes(__VLS_ctx.event.status)) {
        const __VLS_244 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_245 = __VLS_asFunctionalComponent(__VLS_244, new __VLS_244({
            ...{ 'onClick': {} },
            type: "warning",
        }));
        const __VLS_246 = __VLS_245({
            ...{ 'onClick': {} },
            type: "warning",
        }, ...__VLS_functionalComponentArgsRest(__VLS_245));
        let __VLS_248;
        let __VLS_249;
        let __VLS_250;
        const __VLS_251 = {
            onClick: (__VLS_ctx.manualDispatch)
        };
        __VLS_247.slots.default;
        var __VLS_247;
    }
    const __VLS_252 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_253 = __VLS_asFunctionalComponent(__VLS_252, new __VLS_252({
        ...{ 'onClick': {} },
    }));
    const __VLS_254 = __VLS_253({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_253));
    let __VLS_256;
    let __VLS_257;
    let __VLS_258;
    const __VLS_259 = {
        onClick: (__VLS_ctx.loadDetail)
    };
    __VLS_255.slots.default;
    var __VLS_255;
    var __VLS_243;
}
else if (!__VLS_ctx.loading) {
    const __VLS_260 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_261 = __VLS_asFunctionalComponent(__VLS_260, new __VLS_260({
        description: "事件不存在",
    }));
    const __VLS_262 = __VLS_261({
        description: "事件不存在",
    }, ...__VLS_functionalComponentArgsRest(__VLS_261));
}
/** @type {__VLS_StyleScopedClasses['event-detail']} */ ;
/** @type {__VLS_StyleScopedClasses['back-header']} */ ;
/** @type {__VLS_StyleScopedClasses['overview']} */ ;
/** @type {__VLS_StyleScopedClasses['card-header']} */ ;
/** @type {__VLS_StyleScopedClasses['title']} */ ;
/** @type {__VLS_StyleScopedClasses['empty']} */ ;
/** @type {__VLS_StyleScopedClasses['empty']} */ ;
/** @type {__VLS_StyleScopedClasses['empty']} */ ;
/** @type {__VLS_StyleScopedClasses['empty']} */ ;
/** @type {__VLS_StyleScopedClasses['source-chain']} */ ;
/** @type {__VLS_StyleScopedClasses['error-alert']} */ ;
/** @type {__VLS_StyleScopedClasses['payload']} */ ;
/** @type {__VLS_StyleScopedClasses['card-header']} */ ;
/** @type {__VLS_StyleScopedClasses['title']} */ ;
/** @type {__VLS_StyleScopedClasses['json-block']} */ ;
/** @type {__VLS_StyleScopedClasses['json-block']} */ ;
/** @type {__VLS_StyleScopedClasses['raw-payload']} */ ;
/** @type {__VLS_StyleScopedClasses['metadata']} */ ;
/** @type {__VLS_StyleScopedClasses['title']} */ ;
/** @type {__VLS_StyleScopedClasses['json-block']} */ ;
/** @type {__VLS_StyleScopedClasses['timeline-card']} */ ;
/** @type {__VLS_StyleScopedClasses['title']} */ ;
/** @type {__VLS_StyleScopedClasses['timeline-label']} */ ;
/** @type {__VLS_StyleScopedClasses['timeline-detail']} */ ;
/** @type {__VLS_StyleScopedClasses['deliveries-card']} */ ;
/** @type {__VLS_StyleScopedClasses['title']} */ ;
/** @type {__VLS_StyleScopedClasses['delivery-line']} */ ;
/** @type {__VLS_StyleScopedClasses['delivery-info']} */ ;
/** @type {__VLS_StyleScopedClasses['run-id']} */ ;
/** @type {__VLS_StyleScopedClasses['timeline-detail']} */ ;
/** @type {__VLS_StyleScopedClasses['timeline-detail']} */ ;
/** @type {__VLS_StyleScopedClasses['timeline-detail']} */ ;
/** @type {__VLS_StyleScopedClasses['actions']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ArrowLeft: ArrowLeft,
            router: router,
            event: event,
            loading: loading,
            deliveries: deliveries,
            rawVisible: rawVisible,
            rawLoading: rawLoading,
            rawPayload: rawPayload,
            loadDetail: loadDetail,
            goBack: goBack,
            openRawPayload: openRawPayload,
            manualDispatch: manualDispatch,
            timeline: timeline,
            prettyJson: prettyJson,
            copyJson: copyJson,
            statusTagType: statusTagType,
            statusLabel: statusLabel,
            sourceTagType: sourceTagType,
            formatTime: formatTime,
            calcDurationMs: calcDurationMs,
            deliveryColor: deliveryColor,
            deliveryTagType: deliveryTagType,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
