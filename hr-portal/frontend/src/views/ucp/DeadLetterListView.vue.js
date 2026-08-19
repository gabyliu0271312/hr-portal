/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { formatDateTime } from '@/utils/datetime';
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Refresh, VideoPlay } from '@element-plus/icons-vue';
import { ucpApi } from '@/api/ucp';
import PermissionButton from '@/components/PermissionButton.vue';
const router = useRouter();
const items = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const loading = ref(false);
async function loadList() {
    loading.value = true;
    try {
        const res = await ucpApi.listDeadLetters({
            limit: pageSize.value,
            offset: (page.value - 1) * pageSize.value,
        });
        items.value = res.items || [];
        total.value = res.total || 0;
    }
    finally {
        loading.value = false;
    }
}
async function onReplay(row) {
    await ElMessageBox.confirm(`确认重放死信 #${row.id}（事件 ${row.event_uuid}）？\n重置 attempt 并重新派发到 pipeline。`, '重放死信', { type: 'warning' });
    try {
        const res = await ucpApi.replayDeadLetter(row.id);
        ElMessage.success(`已重放：${res.status}（attempt=${res.attempt}）`);
        loadList();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail?.message || '重放失败');
    }
}
async function onDiscard(row) {
    await ElMessageBox.confirm(`确认丢弃死信 #${row.id}？\n此操作不可恢复。`, '丢弃死信', { type: 'error' });
    try {
        await ucpApi.discardDeadLetter(row.id);
        ElMessage.success('已丢弃');
        loadList();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail?.message || '丢弃失败');
    }
}
async function onScanRetries() {
    try {
        const res = await ucpApi.scanDueRetries();
        if (res.scanned === 0) {
            ElMessage.info('没有到期的重试');
        }
        else {
            ElMessage.success(`扫描完成，触发 ${res.scanned} 条重派发`);
        }
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '扫描失败');
    }
}
function goEvent(row) {
    router.push({ name: 'UcpEventDetail', params: { eventId: String(row.event_id) } });
}
function formatTime(t) {
    if (!t)
        return '-';
    return formatDateTime(t);
}
onMounted(loadList);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "dead-letter-list" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "page-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "desc" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "toolbar" },
});
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
    onClick: (__VLS_ctx.loadList)
};
__VLS_3.slots.default;
var __VLS_3;
/** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
// @ts-ignore
const __VLS_8 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
    ...{ 'onClick': {} },
    menu: "ucp.events",
    op: "U",
    type: "warning",
    icon: (__VLS_ctx.VideoPlay),
}));
const __VLS_9 = __VLS_8({
    ...{ 'onClick': {} },
    menu: "ucp.events",
    op: "U",
    type: "warning",
    icon: (__VLS_ctx.VideoPlay),
}, ...__VLS_functionalComponentArgsRest(__VLS_8));
let __VLS_11;
let __VLS_12;
let __VLS_13;
const __VLS_14 = {
    onClick: (__VLS_ctx.onScanRetries)
};
__VLS_10.slots.default;
var __VLS_10;
const __VLS_15 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_16 = __VLS_asFunctionalComponent(__VLS_15, new __VLS_15({
    data: (__VLS_ctx.items),
    stripe: true,
    border: true,
}));
const __VLS_17 = __VLS_16({
    data: (__VLS_ctx.items),
    stripe: true,
    border: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_16));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_18.slots.default;
const __VLS_19 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_20 = __VLS_asFunctionalComponent(__VLS_19, new __VLS_19({
    prop: "id",
    label: "ID",
    width: "70",
}));
const __VLS_21 = __VLS_20({
    prop: "id",
    label: "ID",
    width: "70",
}, ...__VLS_functionalComponentArgsRest(__VLS_20));
const __VLS_23 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_24 = __VLS_asFunctionalComponent(__VLS_23, new __VLS_23({
    prop: "event_uuid",
    label: "Event UUID",
    minWidth: "220",
    showOverflowTooltip: true,
}));
const __VLS_25 = __VLS_24({
    prop: "event_uuid",
    label: "Event UUID",
    minWidth: "220",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_24));
__VLS_26.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_26.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_27 = {}.ElLink;
    /** @type {[typeof __VLS_components.ElLink, typeof __VLS_components.elLink, typeof __VLS_components.ElLink, typeof __VLS_components.elLink, ]} */ ;
    // @ts-ignore
    const __VLS_28 = __VLS_asFunctionalComponent(__VLS_27, new __VLS_27({
        ...{ 'onClick': {} },
        type: "primary",
    }));
    const __VLS_29 = __VLS_28({
        ...{ 'onClick': {} },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_28));
    let __VLS_31;
    let __VLS_32;
    let __VLS_33;
    const __VLS_34 = {
        onClick: (...[$event]) => {
            __VLS_ctx.goEvent(row);
        }
    };
    __VLS_30.slots.default;
    (row.event_uuid);
    var __VLS_30;
}
var __VLS_26;
const __VLS_35 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_36 = __VLS_asFunctionalComponent(__VLS_35, new __VLS_35({
    prop: "trigger_code",
    label: "触发器",
    minWidth: "160",
}));
const __VLS_37 = __VLS_36({
    prop: "trigger_code",
    label: "触发器",
    minWidth: "160",
}, ...__VLS_functionalComponentArgsRest(__VLS_36));
__VLS_38.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_38.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    if (row.trigger_code) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({});
        (row.trigger_code);
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "empty" },
        });
    }
}
var __VLS_38;
const __VLS_39 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_40 = __VLS_asFunctionalComponent(__VLS_39, new __VLS_39({
    prop: "attempt",
    label: "已重试",
    width: "80",
    align: "center",
}));
const __VLS_41 = __VLS_40({
    prop: "attempt",
    label: "已重试",
    width: "80",
    align: "center",
}, ...__VLS_functionalComponentArgsRest(__VLS_40));
__VLS_42.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_42.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_43 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_44 = __VLS_asFunctionalComponent(__VLS_43, new __VLS_43({
        size: "small",
        type: "danger",
    }));
    const __VLS_45 = __VLS_44({
        size: "small",
        type: "danger",
    }, ...__VLS_functionalComponentArgsRest(__VLS_44));
    __VLS_46.slots.default;
    (row.attempt);
    var __VLS_46;
}
var __VLS_42;
const __VLS_47 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_48 = __VLS_asFunctionalComponent(__VLS_47, new __VLS_47({
    prop: "error_code",
    label: "错误码",
    width: "140",
}));
const __VLS_49 = __VLS_48({
    prop: "error_code",
    label: "错误码",
    width: "140",
}, ...__VLS_functionalComponentArgsRest(__VLS_48));
__VLS_50.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_50.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    if (row.error_code) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({});
        (row.error_code);
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "empty" },
        });
    }
}
var __VLS_50;
const __VLS_51 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_52 = __VLS_asFunctionalComponent(__VLS_51, new __VLS_51({
    prop: "error_message",
    label: "错误信息",
    minWidth: "240",
    showOverflowTooltip: true,
}));
const __VLS_53 = __VLS_52({
    prop: "error_message",
    label: "错误信息",
    minWidth: "240",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_52));
const __VLS_55 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_56 = __VLS_asFunctionalComponent(__VLS_55, new __VLS_55({
    prop: "last_retry_at",
    label: "最后重试",
    width: "170",
}));
const __VLS_57 = __VLS_56({
    prop: "last_retry_at",
    label: "最后重试",
    width: "170",
}, ...__VLS_functionalComponentArgsRest(__VLS_56));
__VLS_58.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_58.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (__VLS_ctx.formatTime(row.last_retry_at));
}
var __VLS_58;
const __VLS_59 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_60 = __VLS_asFunctionalComponent(__VLS_59, new __VLS_59({
    prop: "updated_at",
    label: "进入死信",
    width: "170",
}));
const __VLS_61 = __VLS_60({
    prop: "updated_at",
    label: "进入死信",
    width: "170",
}, ...__VLS_functionalComponentArgsRest(__VLS_60));
__VLS_62.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_62.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (__VLS_ctx.formatTime(row.updated_at));
}
var __VLS_62;
const __VLS_63 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_64 = __VLS_asFunctionalComponent(__VLS_63, new __VLS_63({
    label: "操作",
    width: "180",
    fixed: "right",
}));
const __VLS_65 = __VLS_64({
    label: "操作",
    width: "180",
    fixed: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_64));
__VLS_66.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_66.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_67 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_68 = __VLS_asFunctionalComponent(__VLS_67, new __VLS_67({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
        type: "primary",
    }));
    const __VLS_69 = __VLS_68({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_68));
    let __VLS_71;
    let __VLS_72;
    let __VLS_73;
    const __VLS_74 = {
        onClick: (...[$event]) => {
            __VLS_ctx.goEvent(row);
        }
    };
    __VLS_70.slots.default;
    var __VLS_70;
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_75 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: "ucp.events",
        op: "C",
        size: "small",
        link: true,
        type: "warning",
    }));
    const __VLS_76 = __VLS_75({
        ...{ 'onClick': {} },
        menu: "ucp.events",
        op: "C",
        size: "small",
        link: true,
        type: "warning",
    }, ...__VLS_functionalComponentArgsRest(__VLS_75));
    let __VLS_78;
    let __VLS_79;
    let __VLS_80;
    const __VLS_81 = {
        onClick: (...[$event]) => {
            __VLS_ctx.onReplay(row);
        }
    };
    __VLS_77.slots.default;
    var __VLS_77;
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_82 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: "ucp.events",
        op: "C",
        size: "small",
        link: true,
        type: "danger",
    }));
    const __VLS_83 = __VLS_82({
        ...{ 'onClick': {} },
        menu: "ucp.events",
        op: "C",
        size: "small",
        link: true,
        type: "danger",
    }, ...__VLS_functionalComponentArgsRest(__VLS_82));
    let __VLS_85;
    let __VLS_86;
    let __VLS_87;
    const __VLS_88 = {
        onClick: (...[$event]) => {
            __VLS_ctx.onDiscard(row);
        }
    };
    __VLS_84.slots.default;
    var __VLS_84;
}
var __VLS_66;
var __VLS_18;
const __VLS_89 = {}.ElPagination;
/** @type {[typeof __VLS_components.ElPagination, typeof __VLS_components.elPagination, ]} */ ;
// @ts-ignore
const __VLS_90 = __VLS_asFunctionalComponent(__VLS_89, new __VLS_89({
    ...{ 'onCurrentChange': {} },
    ...{ 'onSizeChange': {} },
    ...{ class: "pager" },
    currentPage: (__VLS_ctx.page),
    pageSize: (__VLS_ctx.pageSize),
    total: (__VLS_ctx.total),
    pageSizes: ([20, 50, 100]),
    layout: "total, sizes, prev, pager, next, jumper",
}));
const __VLS_91 = __VLS_90({
    ...{ 'onCurrentChange': {} },
    ...{ 'onSizeChange': {} },
    ...{ class: "pager" },
    currentPage: (__VLS_ctx.page),
    pageSize: (__VLS_ctx.pageSize),
    total: (__VLS_ctx.total),
    pageSizes: ([20, 50, 100]),
    layout: "total, sizes, prev, pager, next, jumper",
}, ...__VLS_functionalComponentArgsRest(__VLS_90));
let __VLS_93;
let __VLS_94;
let __VLS_95;
const __VLS_96 = {
    onCurrentChange: (__VLS_ctx.loadList)
};
const __VLS_97 = {
    onSizeChange: (__VLS_ctx.loadList)
};
var __VLS_92;
/** @type {__VLS_StyleScopedClasses['dead-letter-list']} */ ;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['desc']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['empty']} */ ;
/** @type {__VLS_StyleScopedClasses['empty']} */ ;
/** @type {__VLS_StyleScopedClasses['pager']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Refresh: Refresh,
            VideoPlay: VideoPlay,
            PermissionButton: PermissionButton,
            items: items,
            total: total,
            page: page,
            pageSize: pageSize,
            loading: loading,
            loadList: loadList,
            onReplay: onReplay,
            onDiscard: onDiscard,
            onScanRetries: onScanRetries,
            goEvent: goEvent,
            formatTime: formatTime,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
