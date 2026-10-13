/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { CopyDocument, Delete, Document, Edit, InfoFilled, MoreFilled, Plus, Position, Search } from '@element-plus/icons-vue';
import PermissionButton from '@/components/PermissionButton.vue';
import { useUserStore } from '@/stores/user';
import { formatDateTime } from '@/utils/datetime';
import { reportsApi, REPORT_VISIBILITY_LABELS } from '@/api/reports';
import { datasetsApi } from '@/api/datasets';
const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;
const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
function positiveInt(value, fallback) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
function visibilityTagType(v) {
    return v === 'public' ? 'success' : v === 'scoped' ? 'warning' : 'info';
}
const list = ref([]);
const datasets = ref([]);
const loading = ref(false);
const loadError = ref('');
const pushing = ref(null);
const copying = ref(null);
const filterDataset = ref(route.query.dataset ? positiveInt(route.query.dataset, 0) || null : null);
const filterKeyword = ref(typeof route.query.keyword === 'string' ? route.query.keyword : '');
const page = ref(positiveInt(route.query.page, 1));
let searchTimer;
let requestSequence = 0;
const hasFilters = computed(() => Boolean(filterDataset.value || filterKeyword.value.trim()));
const pageCount = computed(() => Math.max(1, Math.ceil(list.value.length / PAGE_SIZE)));
const pagedList = computed(() => {
    const start = (page.value - 1) * PAGE_SIZE;
    return list.value.slice(start, start + PAGE_SIZE);
});
function syncRouteQuery() {
    const query = {};
    if (filterDataset.value)
        query.dataset = String(filterDataset.value);
    if (filterKeyword.value.trim())
        query.keyword = filterKeyword.value.trim();
    if (page.value > 1)
        query.page = String(page.value);
    void router.replace({ query });
}
async function load() {
    const sequence = ++requestSequence;
    loading.value = true;
    loadError.value = '';
    try {
        const result = await reportsApi.list({
            dataset_id: filterDataset.value || undefined,
            keyword: filterKeyword.value.trim() || undefined,
        });
        if (sequence !== requestSequence)
            return;
        list.value = result;
        if (page.value > Math.max(1, Math.ceil(result.length / PAGE_SIZE))) {
            page.value = 1;
            syncRouteQuery();
        }
    }
    catch (e) {
        if (sequence !== requestSequence)
            return;
        list.value = [];
        loadError.value = e?.response?.data?.detail || '报表加载失败，请稍后重试';
    }
    finally {
        if (sequence === requestSequence)
            loading.value = false;
    }
}
async function loadDatasets() {
    try {
        datasets.value = await datasetsApi.list();
    }
    catch {
        datasets.value = [];
    }
}
function openDesigner(row) {
    router.push({
        path: row ? `/report/designer/${row.id}` : '/report/designer/new',
        query: { returnTo: route.fullPath },
    });
}
function openRun(row) {
    router.push({ path: `/report/run/${row.id}`, query: { returnTo: route.fullPath } });
}
async function handlePush(row) {
    if (!row.can_edit || !row.active_push_target_count)
        return;
    pushing.value = row.id;
    try {
        const results = await reportsApi.push(row.id);
        const failed = results.filter((result) => !result.ok);
        if (failed.length) {
            ElMessage.error(`推送完成，但 ${failed.length} 个目标失败：${failed[0].message || failed[0].target_name}`);
        }
        else {
            const rows = results.reduce((sum, result) => sum + (result.rows || 0), 0);
            ElMessage.success(`报表推送成功：${results.length} 个目标，${rows} 行`);
        }
        await load();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '推送失败');
    }
    finally {
        pushing.value = null;
    }
}
async function handleCopy(row) {
    try {
        await ElMessageBox.confirm(`确认复制报表「${row.name}」？将生成一份完全相同的副本。`, '复制报表', { type: 'info', confirmButtonText: '确认复制' });
    }
    catch {
        return;
    }
    copying.value = row.id;
    try {
        const detail = await reportsApi.get(row.id);
        const result = await reportsApi.create({
            name: `${row.name} - 副本`,
            description: detail.description,
            dataset_id: detail.dataset_id,
            config: detail.config,
            visibility: 'private',
            scope_strategy: detail.scope_strategy,
            acl: [],
        });
        ElMessage.success('报表已复制');
        router.push({ path: `/report/designer/${result.id}`, query: { returnTo: route.fullPath } });
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '复制失败');
    }
    finally {
        copying.value = null;
    }
}
async function handleDelete(row) {
    try {
        await ElMessageBox.confirm(`确认删除报表「${row.name}」？该操作不可恢复。`, '删除确认', {
            type: 'warning',
            confirmButtonText: '删除',
            cancelButtonText: '取消',
        });
    }
    catch {
        return;
    }
    try {
        await reportsApi.remove(row.id);
        ElMessage.success('已删除');
        await load();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '删除失败');
    }
}
function canCopy() {
    return userStore.hasOp('report.list', 'C');
}
function canPush(row) {
    return row.can_edit && Boolean(row.active_push_target_count) && userStore.hasOp('report.list', 'C');
}
function canDelete(row) {
    return row.can_edit && userStore.hasOp('report.list', 'D');
}
function hasSecondaryActions(row) {
    return canCopy() || canPush(row) || canDelete(row);
}
function handleRowCommand(command, row) {
    if (command === 'copy')
        void handleCopy(row);
    if (command === 'push')
        void handlePush(row);
    if (command === 'delete')
        void handleDelete(row);
}
watch(filterDataset, () => {
    page.value = 1;
    syncRouteQuery();
    void load();
});
watch(filterKeyword, () => {
    window.clearTimeout(searchTimer);
    if (!filterKeyword.value.trim()) {
        page.value = 1;
        syncRouteQuery();
        void load();
        return;
    }
    searchTimer = window.setTimeout(() => {
        page.value = 1;
        syncRouteQuery();
        void load();
    }, SEARCH_DEBOUNCE_MS);
});
watch(page, syncRouteQuery);
onMounted(async () => {
    await Promise.all([loadDatasets(), load()]);
});
onBeforeUnmount(() => window.clearTimeout(searchTimer));
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['report-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['report-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['report-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['report-name-link']} */ ;
/** @type {__VLS_StyleScopedClasses['report-name-link']} */ ;
/** @type {__VLS_StyleScopedClasses['report-info-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['report-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['report-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['report-list-page']} */ ;
/** @type {__VLS_StyleScopedClasses['report-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['report-filters']} */ ;
/** @type {__VLS_StyleScopedClasses['dataset-filter']} */ ;
/** @type {__VLS_StyleScopedClasses['name-filter']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "report-list-page" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "report-toolbar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "report-filters" },
    role: "search",
    'aria-label': "筛选报表",
});
const __VLS_0 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    modelValue: (__VLS_ctx.filterDataset),
    placeholder: "全部数据集",
    clearable: true,
    ...{ class: "dataset-filter" },
}));
const __VLS_2 = __VLS_1({
    modelValue: (__VLS_ctx.filterDataset),
    placeholder: "全部数据集",
    clearable: true,
    ...{ class: "dataset-filter" },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
for (const [dataset] of __VLS_getVForSourceType((__VLS_ctx.datasets))) {
    const __VLS_4 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        key: (dataset.id),
        label: (dataset.name),
        value: (dataset.id),
    }));
    const __VLS_6 = __VLS_5({
        key: (dataset.id),
        label: (dataset.name),
        value: (dataset.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
}
var __VLS_3;
const __VLS_8 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    modelValue: (__VLS_ctx.filterKeyword),
    placeholder: "搜索报表名称",
    clearable: true,
    ...{ class: "name-filter" },
}));
const __VLS_10 = __VLS_9({
    modelValue: (__VLS_ctx.filterKeyword),
    placeholder: "搜索报表名称",
    clearable: true,
    ...{ class: "name-filter" },
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
__VLS_11.slots.default;
{
    const { prefix: __VLS_thisSlot } = __VLS_11.slots;
    const __VLS_12 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({}));
    const __VLS_14 = __VLS_13({}, ...__VLS_functionalComponentArgsRest(__VLS_13));
    __VLS_15.slots.default;
    const __VLS_16 = {}.Search;
    /** @type {[typeof __VLS_components.Search, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({}));
    const __VLS_18 = __VLS_17({}, ...__VLS_functionalComponentArgsRest(__VLS_17));
    var __VLS_15;
}
var __VLS_11;
/** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
// @ts-ignore
const __VLS_20 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
    ...{ 'onClick': {} },
    menu: "report.list",
    op: "C",
    type: "primary",
}));
const __VLS_21 = __VLS_20({
    ...{ 'onClick': {} },
    menu: "report.list",
    op: "C",
    type: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_20));
let __VLS_23;
let __VLS_24;
let __VLS_25;
const __VLS_26 = {
    onClick: (...[$event]) => {
        __VLS_ctx.openDesigner();
    }
};
__VLS_22.slots.default;
const __VLS_27 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_28 = __VLS_asFunctionalComponent(__VLS_27, new __VLS_27({}));
const __VLS_29 = __VLS_28({}, ...__VLS_functionalComponentArgsRest(__VLS_28));
__VLS_30.slots.default;
const __VLS_31 = {}.Plus;
/** @type {[typeof __VLS_components.Plus, ]} */ ;
// @ts-ignore
const __VLS_32 = __VLS_asFunctionalComponent(__VLS_31, new __VLS_31({}));
const __VLS_33 = __VLS_32({}, ...__VLS_functionalComponentArgsRest(__VLS_32));
var __VLS_30;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
var __VLS_22;
if (__VLS_ctx.loadError && !__VLS_ctx.loading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "report-error" },
        role: "alert",
    });
    const __VLS_35 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_36 = __VLS_asFunctionalComponent(__VLS_35, new __VLS_35({
        description: (__VLS_ctx.loadError),
    }));
    const __VLS_37 = __VLS_36({
        description: (__VLS_ctx.loadError),
    }, ...__VLS_functionalComponentArgsRest(__VLS_36));
    __VLS_38.slots.default;
    const __VLS_39 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_40 = __VLS_asFunctionalComponent(__VLS_39, new __VLS_39({
        ...{ 'onClick': {} },
        type: "primary",
    }));
    const __VLS_41 = __VLS_40({
        ...{ 'onClick': {} },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_40));
    let __VLS_43;
    let __VLS_44;
    let __VLS_45;
    const __VLS_46 = {
        onClick: (__VLS_ctx.load)
    };
    __VLS_42.slots.default;
    var __VLS_42;
    var __VLS_38;
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "report-table-region" },
    });
    const __VLS_47 = {}.ElTable;
    /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
    // @ts-ignore
    const __VLS_48 = __VLS_asFunctionalComponent(__VLS_47, new __VLS_47({
        data: (__VLS_ctx.pagedList),
        stripe: true,
        height: "100%",
        tableLayout: "fixed",
    }));
    const __VLS_49 = __VLS_48({
        data: (__VLS_ctx.pagedList),
        stripe: true,
        height: "100%",
        tableLayout: "fixed",
    }, ...__VLS_functionalComponentArgsRest(__VLS_48));
    __VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
    __VLS_50.slots.default;
    const __VLS_51 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_52 = __VLS_asFunctionalComponent(__VLS_51, new __VLS_51({
        label: "报表名称",
        minWidth: "240",
    }));
    const __VLS_53 = __VLS_52({
        label: "报表名称",
        minWidth: "240",
    }, ...__VLS_functionalComponentArgsRest(__VLS_52));
    __VLS_54.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_54.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "report-name-cell" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "report-name-line" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.loadError && !__VLS_ctx.loading))
                        return;
                    __VLS_ctx.openRun(row);
                } },
            ...{ class: "report-name-link" },
            type: "button",
        });
        (row.name);
        const __VLS_55 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_56 = __VLS_asFunctionalComponent(__VLS_55, new __VLS_55({
            type: (__VLS_ctx.visibilityTagType(row.visibility)),
            size: "small",
            effect: "plain",
        }));
        const __VLS_57 = __VLS_56({
            type: (__VLS_ctx.visibilityTagType(row.visibility)),
            size: "small",
            effect: "plain",
        }, ...__VLS_functionalComponentArgsRest(__VLS_56));
        __VLS_58.slots.default;
        (__VLS_ctx.REPORT_VISIBILITY_LABELS[row.visibility]);
        var __VLS_58;
        const __VLS_59 = {}.ElTooltip;
        /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
        // @ts-ignore
        const __VLS_60 = __VLS_asFunctionalComponent(__VLS_59, new __VLS_59({
            content: (`更新时间：${__VLS_ctx.formatDateTime(row.updated_at)}`),
            placement: "top",
        }));
        const __VLS_61 = __VLS_60({
            content: (`更新时间：${__VLS_ctx.formatDateTime(row.updated_at)}`),
            placement: "top",
        }, ...__VLS_functionalComponentArgsRest(__VLS_60));
        __VLS_62.slots.default;
        const __VLS_63 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_64 = __VLS_asFunctionalComponent(__VLS_63, new __VLS_63({
            ...{ class: "report-info-icon" },
            'aria-label': "查看报表信息",
        }));
        const __VLS_65 = __VLS_64({
            ...{ class: "report-info-icon" },
            'aria-label': "查看报表信息",
        }, ...__VLS_functionalComponentArgsRest(__VLS_64));
        __VLS_66.slots.default;
        const __VLS_67 = {}.InfoFilled;
        /** @type {[typeof __VLS_components.InfoFilled, ]} */ ;
        // @ts-ignore
        const __VLS_68 = __VLS_asFunctionalComponent(__VLS_67, new __VLS_67({}));
        const __VLS_69 = __VLS_68({}, ...__VLS_functionalComponentArgsRest(__VLS_68));
        var __VLS_66;
        var __VLS_62;
        if (row.description) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "report-description" },
            });
            (row.description);
        }
    }
    var __VLS_54;
    const __VLS_71 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_72 = __VLS_asFunctionalComponent(__VLS_71, new __VLS_71({
        label: "数据集",
        minWidth: "180",
    }));
    const __VLS_73 = __VLS_72({
        label: "数据集",
        minWidth: "180",
    }, ...__VLS_functionalComponentArgsRest(__VLS_72));
    __VLS_74.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_74.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        (row.dataset_name || `#${row.dataset_id}`);
    }
    var __VLS_74;
    const __VLS_75 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_76 = __VLS_asFunctionalComponent(__VLS_75, new __VLS_75({
        label: "所有者",
        width: "120",
    }));
    const __VLS_77 = __VLS_76({
        label: "所有者",
        width: "120",
    }, ...__VLS_functionalComponentArgsRest(__VLS_76));
    __VLS_78.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_78.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        (row.owner_name || '—');
    }
    var __VLS_78;
    const __VLS_79 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_80 = __VLS_asFunctionalComponent(__VLS_79, new __VLS_79({
        label: "操作",
        width: "150",
        fixed: "right",
        align: "center",
    }));
    const __VLS_81 = __VLS_80({
        label: "操作",
        width: "150",
        fixed: "right",
        align: "center",
    }, ...__VLS_functionalComponentArgsRest(__VLS_80));
    __VLS_82.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_82.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "row-actions" },
        });
        if (row.can_edit) {
            /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
            // @ts-ignore
            const __VLS_83 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
                ...{ 'onClick': {} },
                menu: "report.list",
                op: "U",
                size: "small",
                link: true,
            }));
            const __VLS_84 = __VLS_83({
                ...{ 'onClick': {} },
                menu: "report.list",
                op: "U",
                size: "small",
                link: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_83));
            let __VLS_86;
            let __VLS_87;
            let __VLS_88;
            const __VLS_89 = {
                onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.loadError && !__VLS_ctx.loading))
                        return;
                    if (!(row.can_edit))
                        return;
                    __VLS_ctx.openDesigner(row);
                }
            };
            __VLS_85.slots.default;
            const __VLS_90 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_91 = __VLS_asFunctionalComponent(__VLS_90, new __VLS_90({}));
            const __VLS_92 = __VLS_91({}, ...__VLS_functionalComponentArgsRest(__VLS_91));
            __VLS_93.slots.default;
            const __VLS_94 = {}.Edit;
            /** @type {[typeof __VLS_components.Edit, ]} */ ;
            // @ts-ignore
            const __VLS_95 = __VLS_asFunctionalComponent(__VLS_94, new __VLS_94({}));
            const __VLS_96 = __VLS_95({}, ...__VLS_functionalComponentArgsRest(__VLS_95));
            var __VLS_93;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            var __VLS_85;
        }
        else {
            /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
            // @ts-ignore
            const __VLS_98 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
                ...{ 'onClick': {} },
                menu: "report.list",
                op: "C",
                size: "small",
                link: true,
            }));
            const __VLS_99 = __VLS_98({
                ...{ 'onClick': {} },
                menu: "report.list",
                op: "C",
                size: "small",
                link: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_98));
            let __VLS_101;
            let __VLS_102;
            let __VLS_103;
            const __VLS_104 = {
                onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.loadError && !__VLS_ctx.loading))
                        return;
                    if (!!(row.can_edit))
                        return;
                    __VLS_ctx.openDesigner(row);
                }
            };
            __VLS_100.slots.default;
            const __VLS_105 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_106 = __VLS_asFunctionalComponent(__VLS_105, new __VLS_105({}));
            const __VLS_107 = __VLS_106({}, ...__VLS_functionalComponentArgsRest(__VLS_106));
            __VLS_108.slots.default;
            const __VLS_109 = {}.Edit;
            /** @type {[typeof __VLS_components.Edit, ]} */ ;
            // @ts-ignore
            const __VLS_110 = __VLS_asFunctionalComponent(__VLS_109, new __VLS_109({}));
            const __VLS_111 = __VLS_110({}, ...__VLS_functionalComponentArgsRest(__VLS_110));
            var __VLS_108;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            var __VLS_100;
        }
        if (__VLS_ctx.hasSecondaryActions(row)) {
            const __VLS_113 = {}.ElDropdown;
            /** @type {[typeof __VLS_components.ElDropdown, typeof __VLS_components.elDropdown, typeof __VLS_components.ElDropdown, typeof __VLS_components.elDropdown, ]} */ ;
            // @ts-ignore
            const __VLS_114 = __VLS_asFunctionalComponent(__VLS_113, new __VLS_113({
                ...{ 'onCommand': {} },
                trigger: "click",
            }));
            const __VLS_115 = __VLS_114({
                ...{ 'onCommand': {} },
                trigger: "click",
            }, ...__VLS_functionalComponentArgsRest(__VLS_114));
            let __VLS_117;
            let __VLS_118;
            let __VLS_119;
            const __VLS_120 = {
                onCommand: (...[$event]) => {
                    if (!!(__VLS_ctx.loadError && !__VLS_ctx.loading))
                        return;
                    if (!(__VLS_ctx.hasSecondaryActions(row)))
                        return;
                    __VLS_ctx.handleRowCommand($event, row);
                }
            };
            __VLS_116.slots.default;
            const __VLS_121 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_122 = __VLS_asFunctionalComponent(__VLS_121, new __VLS_121({
                link: true,
                size: "small",
                'aria-label': "更多操作",
                title: "更多操作",
            }));
            const __VLS_123 = __VLS_122({
                link: true,
                size: "small",
                'aria-label': "更多操作",
                title: "更多操作",
            }, ...__VLS_functionalComponentArgsRest(__VLS_122));
            __VLS_124.slots.default;
            const __VLS_125 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_126 = __VLS_asFunctionalComponent(__VLS_125, new __VLS_125({}));
            const __VLS_127 = __VLS_126({}, ...__VLS_functionalComponentArgsRest(__VLS_126));
            __VLS_128.slots.default;
            const __VLS_129 = {}.MoreFilled;
            /** @type {[typeof __VLS_components.MoreFilled, ]} */ ;
            // @ts-ignore
            const __VLS_130 = __VLS_asFunctionalComponent(__VLS_129, new __VLS_129({}));
            const __VLS_131 = __VLS_130({}, ...__VLS_functionalComponentArgsRest(__VLS_130));
            var __VLS_128;
            var __VLS_124;
            {
                const { dropdown: __VLS_thisSlot } = __VLS_116.slots;
                const __VLS_133 = {}.ElDropdownMenu;
                /** @type {[typeof __VLS_components.ElDropdownMenu, typeof __VLS_components.elDropdownMenu, typeof __VLS_components.ElDropdownMenu, typeof __VLS_components.elDropdownMenu, ]} */ ;
                // @ts-ignore
                const __VLS_134 = __VLS_asFunctionalComponent(__VLS_133, new __VLS_133({}));
                const __VLS_135 = __VLS_134({}, ...__VLS_functionalComponentArgsRest(__VLS_134));
                __VLS_136.slots.default;
                if (__VLS_ctx.canCopy()) {
                    const __VLS_137 = {}.ElDropdownItem;
                    /** @type {[typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, ]} */ ;
                    // @ts-ignore
                    const __VLS_138 = __VLS_asFunctionalComponent(__VLS_137, new __VLS_137({
                        command: "copy",
                        disabled: (__VLS_ctx.copying === row.id),
                    }));
                    const __VLS_139 = __VLS_138({
                        command: "copy",
                        disabled: (__VLS_ctx.copying === row.id),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_138));
                    __VLS_140.slots.default;
                    const __VLS_141 = {}.ElIcon;
                    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
                    // @ts-ignore
                    const __VLS_142 = __VLS_asFunctionalComponent(__VLS_141, new __VLS_141({}));
                    const __VLS_143 = __VLS_142({}, ...__VLS_functionalComponentArgsRest(__VLS_142));
                    __VLS_144.slots.default;
                    const __VLS_145 = {}.CopyDocument;
                    /** @type {[typeof __VLS_components.CopyDocument, ]} */ ;
                    // @ts-ignore
                    const __VLS_146 = __VLS_asFunctionalComponent(__VLS_145, new __VLS_145({}));
                    const __VLS_147 = __VLS_146({}, ...__VLS_functionalComponentArgsRest(__VLS_146));
                    var __VLS_144;
                    var __VLS_140;
                }
                if (__VLS_ctx.canPush(row)) {
                    const __VLS_149 = {}.ElDropdownItem;
                    /** @type {[typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, ]} */ ;
                    // @ts-ignore
                    const __VLS_150 = __VLS_asFunctionalComponent(__VLS_149, new __VLS_149({
                        command: "push",
                        disabled: (__VLS_ctx.pushing === row.id),
                    }));
                    const __VLS_151 = __VLS_150({
                        command: "push",
                        disabled: (__VLS_ctx.pushing === row.id),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_150));
                    __VLS_152.slots.default;
                    const __VLS_153 = {}.ElIcon;
                    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
                    // @ts-ignore
                    const __VLS_154 = __VLS_asFunctionalComponent(__VLS_153, new __VLS_153({}));
                    const __VLS_155 = __VLS_154({}, ...__VLS_functionalComponentArgsRest(__VLS_154));
                    __VLS_156.slots.default;
                    const __VLS_157 = {}.Position;
                    /** @type {[typeof __VLS_components.Position, ]} */ ;
                    // @ts-ignore
                    const __VLS_158 = __VLS_asFunctionalComponent(__VLS_157, new __VLS_157({}));
                    const __VLS_159 = __VLS_158({}, ...__VLS_functionalComponentArgsRest(__VLS_158));
                    var __VLS_156;
                    var __VLS_152;
                }
                if (__VLS_ctx.canDelete(row)) {
                    const __VLS_161 = {}.ElDropdownItem;
                    /** @type {[typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, ]} */ ;
                    // @ts-ignore
                    const __VLS_162 = __VLS_asFunctionalComponent(__VLS_161, new __VLS_161({
                        command: "delete",
                        divided: true,
                        ...{ class: "danger-menu-item" },
                    }));
                    const __VLS_163 = __VLS_162({
                        command: "delete",
                        divided: true,
                        ...{ class: "danger-menu-item" },
                    }, ...__VLS_functionalComponentArgsRest(__VLS_162));
                    __VLS_164.slots.default;
                    const __VLS_165 = {}.ElIcon;
                    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
                    // @ts-ignore
                    const __VLS_166 = __VLS_asFunctionalComponent(__VLS_165, new __VLS_165({}));
                    const __VLS_167 = __VLS_166({}, ...__VLS_functionalComponentArgsRest(__VLS_166));
                    __VLS_168.slots.default;
                    const __VLS_169 = {}.Delete;
                    /** @type {[typeof __VLS_components.Delete, ]} */ ;
                    // @ts-ignore
                    const __VLS_170 = __VLS_asFunctionalComponent(__VLS_169, new __VLS_169({}));
                    const __VLS_171 = __VLS_170({}, ...__VLS_functionalComponentArgsRest(__VLS_170));
                    var __VLS_168;
                    var __VLS_164;
                }
                var __VLS_136;
            }
            var __VLS_116;
        }
    }
    var __VLS_82;
    {
        const { empty: __VLS_thisSlot } = __VLS_50.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "report-empty" },
        });
        const __VLS_173 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_174 = __VLS_asFunctionalComponent(__VLS_173, new __VLS_173({}));
        const __VLS_175 = __VLS_174({}, ...__VLS_functionalComponentArgsRest(__VLS_174));
        __VLS_176.slots.default;
        const __VLS_177 = {}.Document;
        /** @type {[typeof __VLS_components.Document, ]} */ ;
        // @ts-ignore
        const __VLS_178 = __VLS_asFunctionalComponent(__VLS_177, new __VLS_177({}));
        const __VLS_179 = __VLS_178({}, ...__VLS_functionalComponentArgsRest(__VLS_178));
        var __VLS_176;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.hasFilters ? '没有符合筛选条件的报表' : '暂无报表');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
        (__VLS_ctx.hasFilters ? '可调整数据集或名称后重试' : '新建报表后将在这里统一管理');
    }
    var __VLS_50;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.footer, __VLS_intrinsicElements.footer)({
        ...{ class: "report-pagination" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "result-count" },
    });
    (__VLS_ctx.list.length);
    if (__VLS_ctx.pageCount > 1) {
        const __VLS_181 = {}.ElPagination;
        /** @type {[typeof __VLS_components.ElPagination, typeof __VLS_components.elPagination, ]} */ ;
        // @ts-ignore
        const __VLS_182 = __VLS_asFunctionalComponent(__VLS_181, new __VLS_181({
            currentPage: (__VLS_ctx.page),
            pageSize: (__VLS_ctx.PAGE_SIZE),
            total: (__VLS_ctx.list.length),
            layout: "prev, pager, next",
            background: true,
        }));
        const __VLS_183 = __VLS_182({
            currentPage: (__VLS_ctx.page),
            pageSize: (__VLS_ctx.PAGE_SIZE),
            total: (__VLS_ctx.list.length),
            layout: "prev, pager, next",
            background: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_182));
    }
}
/** @type {__VLS_StyleScopedClasses['report-list-page']} */ ;
/** @type {__VLS_StyleScopedClasses['report-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['report-filters']} */ ;
/** @type {__VLS_StyleScopedClasses['dataset-filter']} */ ;
/** @type {__VLS_StyleScopedClasses['name-filter']} */ ;
/** @type {__VLS_StyleScopedClasses['report-error']} */ ;
/** @type {__VLS_StyleScopedClasses['report-table-region']} */ ;
/** @type {__VLS_StyleScopedClasses['report-name-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['report-name-line']} */ ;
/** @type {__VLS_StyleScopedClasses['report-name-link']} */ ;
/** @type {__VLS_StyleScopedClasses['report-info-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['report-description']} */ ;
/** @type {__VLS_StyleScopedClasses['row-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['danger-menu-item']} */ ;
/** @type {__VLS_StyleScopedClasses['report-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['report-pagination']} */ ;
/** @type {__VLS_StyleScopedClasses['result-count']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            CopyDocument: CopyDocument,
            Delete: Delete,
            Document: Document,
            Edit: Edit,
            InfoFilled: InfoFilled,
            MoreFilled: MoreFilled,
            Plus: Plus,
            Position: Position,
            Search: Search,
            PermissionButton: PermissionButton,
            formatDateTime: formatDateTime,
            REPORT_VISIBILITY_LABELS: REPORT_VISIBILITY_LABELS,
            PAGE_SIZE: PAGE_SIZE,
            visibilityTagType: visibilityTagType,
            list: list,
            datasets: datasets,
            loading: loading,
            loadError: loadError,
            pushing: pushing,
            copying: copying,
            filterDataset: filterDataset,
            filterKeyword: filterKeyword,
            page: page,
            hasFilters: hasFilters,
            pageCount: pageCount,
            pagedList: pagedList,
            load: load,
            openDesigner: openDesigner,
            openRun: openRun,
            canCopy: canCopy,
            canPush: canPush,
            canDelete: canDelete,
            hasSecondaryActions: hasSecondaryActions,
            handleRowCommand: handleRowCommand,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
