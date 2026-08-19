/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { pushTargetsApi } from '@/api/push_targets';
import { formatDateTime } from '@/utils/datetime';
const props = defineProps();
const runs = ref([]);
const loading = ref(false);
async function load() {
    loading.value = true;
    try {
        runs.value = await pushTargetsApi.runs(props.pushTargetId);
    }
    catch {
        ElMessage.error('加载推送历史失败');
    }
    finally {
        loading.value = false;
    }
}
onMounted(load);
const __VLS_exposed = { reload: load };
defineExpose(__VLS_exposed);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
if (!__VLS_ctx.runs.length) {
    const __VLS_0 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        description: "暂无推送记录",
    }));
    const __VLS_2 = __VLS_1({
        description: "暂无推送记录",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_4 = {}.ElTable;
    /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        data: (__VLS_ctx.runs),
        stripe: true,
        ...{ style: {} },
        maxHeight: "300",
    }));
    const __VLS_6 = __VLS_5({
        data: (__VLS_ctx.runs),
        stripe: true,
        ...{ style: {} },
        maxHeight: "300",
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    __VLS_7.slots.default;
    const __VLS_8 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        label: "状态",
        width: "80",
    }));
    const __VLS_10 = __VLS_9({
        label: "状态",
        width: "80",
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    __VLS_11.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_11.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_12 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
            size: "small",
            type: (row.status === 'success' ? 'success' : row.status === 'failed' ? 'danger' : 'info'),
            effect: "plain",
        }));
        const __VLS_14 = __VLS_13({
            size: "small",
            type: (row.status === 'success' ? 'success' : row.status === 'failed' ? 'danger' : 'info'),
            effect: "plain",
        }, ...__VLS_functionalComponentArgsRest(__VLS_13));
        __VLS_15.slots.default;
        (row.status);
        var __VLS_15;
    }
    var __VLS_11;
    const __VLS_16 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
        label: "推送行数",
        width: "90",
        prop: "rows",
    }));
    const __VLS_18 = __VLS_17({
        label: "推送行数",
        width: "90",
        prop: "rows",
    }, ...__VLS_functionalComponentArgsRest(__VLS_17));
    const __VLS_20 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
        label: "消息",
        minWidth: "200",
        prop: "message",
    }));
    const __VLS_22 = __VLS_21({
        label: "消息",
        minWidth: "200",
        prop: "message",
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
    const __VLS_24 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
        label: "触发方式",
        width: "90",
        prop: "triggered_by",
    }));
    const __VLS_26 = __VLS_25({
        label: "触发方式",
        width: "90",
        prop: "triggered_by",
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
    const __VLS_28 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
        label: "开始时间",
        minWidth: "160",
    }));
    const __VLS_30 = __VLS_29({
        label: "开始时间",
        minWidth: "160",
    }, ...__VLS_functionalComponentArgsRest(__VLS_29));
    __VLS_31.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_31.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        (__VLS_ctx.formatDateTime(row.started_at));
    }
    var __VLS_31;
    var __VLS_7;
}
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            formatDateTime: formatDateTime,
            runs: runs,
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
