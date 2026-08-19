/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref, onMounted, watch } from 'vue';
import { api } from '@/api/client';
import { formatDateTime } from '@/utils/datetime';
import ServiceStatusBadge from './ServiceStatusBadge.vue';
const props = defineProps();
const logs = ref([]);
const loading = ref(false);
async function load() {
    loading.value = true;
    try {
        const params = { page_size: props.compact ? 10 : 50 };
        if (props.serviceType)
            params.service_type = props.serviceType;
        const { data } = await api.get('/service-monitor/runs', { params });
        logs.value = data.items || [];
    }
    catch {
        logs.value = [];
    }
    finally {
        loading.value = false;
    }
}
watch(() => [props.serviceType, props.serviceId], () => load());
onMounted(() => load());
const __VLS_exposed = { reload: load };
defineExpose(__VLS_exposed);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "run-log-panel" },
});
const __VLS_0 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    data: (__VLS_ctx.logs),
    size: "small",
    maxHeight: (__VLS_ctx.compact ? 280 : 500),
    stripe: true,
}));
const __VLS_2 = __VLS_1({
    data: (__VLS_ctx.logs),
    size: "small",
    maxHeight: (__VLS_ctx.compact ? 280 : 500),
    stripe: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_3.slots.default;
const __VLS_4 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
    prop: "created_at",
    label: "时间",
    width: "170",
}));
const __VLS_6 = __VLS_5({
    prop: "created_at",
    label: "时间",
    width: "170",
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
__VLS_7.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_7.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (__VLS_ctx.formatDateTime(row.created_at));
}
var __VLS_7;
const __VLS_8 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    prop: "service_type",
    label: "类型",
    width: "90",
}));
const __VLS_10 = __VLS_9({
    prop: "service_type",
    label: "类型",
    width: "90",
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
const __VLS_12 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    prop: "service_name",
    label: "服务",
    minWidth: "140",
    showOverflowTooltip: true,
}));
const __VLS_14 = __VLS_13({
    prop: "service_name",
    label: "服务",
    minWidth: "140",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
const __VLS_16 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    prop: "status",
    label: "状态",
    width: "90",
}));
const __VLS_18 = __VLS_17({
    prop: "status",
    label: "状态",
    width: "90",
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
__VLS_19.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_19.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    /** @type {[typeof ServiceStatusBadge, ]} */ ;
    // @ts-ignore
    const __VLS_20 = __VLS_asFunctionalComponent(ServiceStatusBadge, new ServiceStatusBadge({
        status: (row.status),
    }));
    const __VLS_21 = __VLS_20({
        status: (row.status),
    }, ...__VLS_functionalComponentArgsRest(__VLS_20));
}
var __VLS_19;
const __VLS_23 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_24 = __VLS_asFunctionalComponent(__VLS_23, new __VLS_23({
    prop: "rows",
    label: "行数",
    width: "70",
}));
const __VLS_25 = __VLS_24({
    prop: "rows",
    label: "行数",
    width: "70",
}, ...__VLS_functionalComponentArgsRest(__VLS_24));
const __VLS_27 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_28 = __VLS_asFunctionalComponent(__VLS_27, new __VLS_27({
    prop: "duration_ms",
    label: "耗时",
    width: "80",
}));
const __VLS_29 = __VLS_28({
    prop: "duration_ms",
    label: "耗时",
    width: "80",
}, ...__VLS_functionalComponentArgsRest(__VLS_28));
__VLS_30.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_30.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (row.duration_ms ? `${row.duration_ms}ms` : '-');
}
var __VLS_30;
const __VLS_31 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_32 = __VLS_asFunctionalComponent(__VLS_31, new __VLS_31({
    prop: "message",
    label: "备注",
    minWidth: "120",
    showOverflowTooltip: true,
}));
const __VLS_33 = __VLS_32({
    prop: "message",
    label: "备注",
    minWidth: "120",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_32));
__VLS_34.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_34.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    if (row.upstream_failure) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (row.message || '-');
    }
}
var __VLS_34;
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['run-log-panel']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            formatDateTime: formatDateTime,
            ServiceStatusBadge: ServiceStatusBadge,
            logs: logs,
            loading: loading,
        };
    },
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {
            ...__VLS_exposed,
        };
    },
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
