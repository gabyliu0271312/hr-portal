/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Download, Edit, InfoFilled, Refresh } from '@element-plus/icons-vue';
import FullscreenWorkspaceShell from '@/components/layout/FullscreenWorkspaceShell.vue';
import PermissionButton from '@/components/PermissionButton.vue';
import { formatDateTime } from '@/utils/datetime';
import ReportPreviewTable from '@/components/report/ReportPreviewTable.vue';
import ReportRuntimeFilters from '@/components/report/ReportRuntimeFilters.vue';
import { reportsApi, REPORT_VISIBILITY_LABELS } from '@/api/reports';
import { datasetsApi } from '@/api/datasets';
import { dataApi } from '@/api/data';
import { getToken } from '@/api/client';
const props = defineProps();
const router = useRouter();
const route = useRoute();
const reportListTarget = computed(() => {
    const target = route.query.returnTo;
    return typeof target === 'string' && target.startsWith('/report/list') ? target : '/report/list';
});
const report = ref(null);
const visibilityTagType = computed(() => {
    const v = report.value?.visibility;
    return v === 'public' ? 'success' : v === 'scoped' ? 'warning' : 'info';
});
const columns = ref([]);
const items = ref([]);
const total = ref(0);
const runWarnings = ref([]);
const page = ref(1);
const pageSize = ref(50);
const loading = ref(false);
const loadingReport = ref(false);
const reportLoadError = ref('');
const integrity = ref(null);
const runtimeFilters = ref([]);
const runtimeFilterRef = ref(null);
const columnLabels = ref({});
const datasetTables = ref([]);
function datasetTableName(table) {
    return table.table_label || table.table_name;
}
async function loadReport() {
    loadingReport.value = true;
    reportLoadError.value = '';
    try {
        report.value = await reportsApi.get(props.reportId);
        try {
            integrity.value = await datasetsApi.integrity(report.value.dataset_id);
        }
        catch {
            integrity.value = null;
        }
        await loadDatasetColumnLabels(report.value.dataset_id);
    }
    catch (e) {
        reportLoadError.value = e?.response?.data?.detail || '加载报表失败';
    }
    finally {
        loadingReport.value = false;
    }
}
async function retryLoadReport() {
    await loadReport();
    if (report.value)
        await run();
}
async function loadDatasetColumnLabels(datasetId) {
    try {
        const ds = await datasetsApi.get(datasetId);
        datasetTables.value = ds.tables;
        const entries = [];
        for (const table of ds.tables) {
            const cols = await dataApi.columns(table.table_name);
            const tableName = datasetTableName(table);
            for (const col of cols) {
                entries.push([`${table.alias}.${col.code}`, `${tableName}.${col.label}`]);
            }
        }
        columnLabels.value = Object.fromEntries(entries);
    }
    catch {
        columnLabels.value = {};
    }
}
async function run() {
    if (integrity.value && !integrity.value.ok) {
        ElMessage.warning('数据集关联不完整，请先修复后再运行');
        return;
    }
    loading.value = true;
    try {
        const res = await reportsApi.run(props.reportId, page.value, pageSize.value, runtimeFilters.value);
        columns.value = res.columns;
        items.value = res.items;
        total.value = res.total;
        runWarnings.value = res.warnings || [];
        if (report.value) {
            report.value.last_run_at = new Date().toISOString();
            report.value.run_count = (report.value.run_count || 0) + 1;
        }
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '运行失败');
    }
    finally {
        loading.value = false;
    }
}
async function doExport(format) {
    try {
        const url = format === 'xlsx'
            ? reportsApi.exportXlsxUrl(props.reportId, runtimeFilters.value)
            : reportsApi.exportCsvUrl(props.reportId, runtimeFilters.value);
        const resp = await fetch(url, {
            headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (!resp.ok) {
            const text = await resp.text();
            throw new Error(text || `HTTP ${resp.status}`);
        }
        const blob = await resp.blob();
        const dlUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = dlUrl;
        a.download = `${report.value?.name || 'report'}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(dlUrl);
        // 检查导出警告头（如 XLSX 大数文本降级提示）
        const exportWarning = resp.headers.get('X-Export-Warnings');
        if (exportWarning) {
            ElMessage.warning(exportWarning);
        }
        else {
            ElMessage.success('导出成功');
        }
    }
    catch (e) {
        ElMessage.error(e?.message || '导出失败');
    }
}
const sourceSummary = computed(() => {
    if (!report.value)
        return '';
    return `数据集 · ${report.value.dataset_name || `#${report.value.dataset_id}`}`;
});
const fieldCount = computed(() => columns.value.length || report.value?.config.columns?.length || 0);
function applyRuntimeFilters(filters) {
    runtimeFilters.value = filters;
    page.value = 1;
    run();
}
onMounted(async () => {
    await loadReport();
    if (report.value)
        await run();
});
const __VLS_exposed = { run };
defineExpose(__VLS_exposed);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['report-info-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['report-info-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['report-info-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['report-view-content']} */ ;
/** @type {__VLS_StyleScopedClasses['report-view-content']} */ ;
/** @type {__VLS_StyleScopedClasses['report-view-content']} */ ;
/** @type {__VLS_StyleScopedClasses['report-view-content']} */ ;
// CSS variable injection 
// CSS variable injection end 
/** @type {[typeof FullscreenWorkspaceShell, typeof FullscreenWorkspaceShell, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(FullscreenWorkspaceShell, new FullscreenWorkspaceShell({
    ...{ 'onBack': {} },
    title: (__VLS_ctx.report?.name || '查看报表'),
    subtitle: (__VLS_ctx.report ? __VLS_ctx.sourceSummary : ''),
}));
const __VLS_1 = __VLS_0({
    ...{ 'onBack': {} },
    title: (__VLS_ctx.report?.name || '查看报表'),
    subtitle: (__VLS_ctx.report ? __VLS_ctx.sourceSummary : ''),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
let __VLS_3;
let __VLS_4;
let __VLS_5;
const __VLS_6 = {
    onBack: (...[$event]) => {
        __VLS_ctx.router.push(__VLS_ctx.reportListTarget);
    }
};
var __VLS_7 = {};
__VLS_2.slots.default;
if (__VLS_ctx.report) {
    {
        const { 'title-extra': __VLS_thisSlot } = __VLS_2.slots;
        const __VLS_8 = {}.ElTooltip;
        /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
        // @ts-ignore
        const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
            placement: "bottom-start",
            width: (320),
        }));
        const __VLS_10 = __VLS_9({
            placement: "bottom-start",
            width: (320),
        }, ...__VLS_functionalComponentArgsRest(__VLS_9));
        __VLS_11.slots.default;
        {
            const { content: __VLS_thisSlot } = __VLS_11.slots;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "report-info-tip" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (__VLS_ctx.sourceSummary);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (__VLS_ctx.report.owner_name || '—');
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (__VLS_ctx.fieldCount);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (__VLS_ctx.report.run_count);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (__VLS_ctx.formatDateTime(__VLS_ctx.report.last_run_at));
            if (__VLS_ctx.report.description) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "tip-desc" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
                (__VLS_ctx.report.description);
            }
        }
        const __VLS_12 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
            ...{ class: "info-icon" },
        }));
        const __VLS_14 = __VLS_13({
            ...{ class: "info-icon" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_13));
        __VLS_15.slots.default;
        const __VLS_16 = {}.InfoFilled;
        /** @type {[typeof __VLS_components.InfoFilled, ]} */ ;
        // @ts-ignore
        const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({}));
        const __VLS_18 = __VLS_17({}, ...__VLS_functionalComponentArgsRest(__VLS_17));
        var __VLS_15;
        var __VLS_11;
        const __VLS_20 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
            type: (__VLS_ctx.visibilityTagType),
            size: "small",
            effect: "plain",
        }));
        const __VLS_22 = __VLS_21({
            type: (__VLS_ctx.visibilityTagType),
            size: "small",
            effect: "plain",
        }, ...__VLS_functionalComponentArgsRest(__VLS_21));
        __VLS_23.slots.default;
        (__VLS_ctx.REPORT_VISIBILITY_LABELS[__VLS_ctx.report.visibility]);
        var __VLS_23;
    }
}
if (__VLS_ctx.report) {
    {
        const { actions: __VLS_thisSlot } = __VLS_2.slots;
        var __VLS_24 = {};
        const __VLS_26 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_27 = __VLS_asFunctionalComponent(__VLS_26, new __VLS_26({
            ...{ 'onClick': {} },
            loading: (__VLS_ctx.loading),
        }));
        const __VLS_28 = __VLS_27({
            ...{ 'onClick': {} },
            loading: (__VLS_ctx.loading),
        }, ...__VLS_functionalComponentArgsRest(__VLS_27));
        let __VLS_30;
        let __VLS_31;
        let __VLS_32;
        const __VLS_33 = {
            onClick: (__VLS_ctx.run)
        };
        __VLS_29.slots.default;
        const __VLS_34 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_35 = __VLS_asFunctionalComponent(__VLS_34, new __VLS_34({
            ...{ style: {} },
        }));
        const __VLS_36 = __VLS_35({
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_35));
        __VLS_37.slots.default;
        const __VLS_38 = {}.Refresh;
        /** @type {[typeof __VLS_components.Refresh, ]} */ ;
        // @ts-ignore
        const __VLS_39 = __VLS_asFunctionalComponent(__VLS_38, new __VLS_38({}));
        const __VLS_40 = __VLS_39({}, ...__VLS_functionalComponentArgsRest(__VLS_39));
        var __VLS_37;
        var __VLS_29;
        /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
        // @ts-ignore
        const __VLS_42 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
            ...{ 'onClick': {} },
            menu: "report.list",
            op: "U",
        }));
        const __VLS_43 = __VLS_42({
            ...{ 'onClick': {} },
            menu: "report.list",
            op: "U",
        }, ...__VLS_functionalComponentArgsRest(__VLS_42));
        let __VLS_45;
        let __VLS_46;
        let __VLS_47;
        const __VLS_48 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.report))
                    return;
                __VLS_ctx.router.push({ path: `/report/designer/${__VLS_ctx.report.id}`, query: { returnTo: __VLS_ctx.reportListTarget } });
            }
        };
        __VLS_44.slots.default;
        const __VLS_49 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_50 = __VLS_asFunctionalComponent(__VLS_49, new __VLS_49({
            ...{ style: {} },
        }));
        const __VLS_51 = __VLS_50({
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_50));
        __VLS_52.slots.default;
        const __VLS_53 = {}.Edit;
        /** @type {[typeof __VLS_components.Edit, ]} */ ;
        // @ts-ignore
        const __VLS_54 = __VLS_asFunctionalComponent(__VLS_53, new __VLS_53({}));
        const __VLS_55 = __VLS_54({}, ...__VLS_functionalComponentArgsRest(__VLS_54));
        var __VLS_52;
        var __VLS_44;
        /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
        // @ts-ignore
        const __VLS_57 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
            ...{ 'onClick': {} },
            menu: "report.list",
            op: "E",
        }));
        const __VLS_58 = __VLS_57({
            ...{ 'onClick': {} },
            menu: "report.list",
            op: "E",
        }, ...__VLS_functionalComponentArgsRest(__VLS_57));
        let __VLS_60;
        let __VLS_61;
        let __VLS_62;
        const __VLS_63 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.report))
                    return;
                __VLS_ctx.doExport('csv');
            }
        };
        __VLS_59.slots.default;
        const __VLS_64 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
            ...{ style: {} },
        }));
        const __VLS_66 = __VLS_65({
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_65));
        __VLS_67.slots.default;
        const __VLS_68 = {}.Download;
        /** @type {[typeof __VLS_components.Download, ]} */ ;
        // @ts-ignore
        const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({}));
        const __VLS_70 = __VLS_69({}, ...__VLS_functionalComponentArgsRest(__VLS_69));
        var __VLS_67;
        var __VLS_59;
        /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
        // @ts-ignore
        const __VLS_72 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
            ...{ 'onClick': {} },
            menu: "report.list",
            op: "E",
            type: "primary",
        }));
        const __VLS_73 = __VLS_72({
            ...{ 'onClick': {} },
            menu: "report.list",
            op: "E",
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_72));
        let __VLS_75;
        let __VLS_76;
        let __VLS_77;
        const __VLS_78 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.report))
                    return;
                __VLS_ctx.doExport('xlsx');
            }
        };
        __VLS_74.slots.default;
        const __VLS_79 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_80 = __VLS_asFunctionalComponent(__VLS_79, new __VLS_79({
            ...{ style: {} },
        }));
        const __VLS_81 = __VLS_80({
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_80));
        __VLS_82.slots.default;
        const __VLS_83 = {}.Download;
        /** @type {[typeof __VLS_components.Download, ]} */ ;
        // @ts-ignore
        const __VLS_84 = __VLS_asFunctionalComponent(__VLS_83, new __VLS_83({}));
        const __VLS_85 = __VLS_84({}, ...__VLS_functionalComponentArgsRest(__VLS_84));
        var __VLS_82;
        var __VLS_74;
    }
}
if (__VLS_ctx.report) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "report-view-content" },
    });
    /** @type {[typeof ReportRuntimeFilters, ]} */ ;
    // @ts-ignore
    const __VLS_87 = __VLS_asFunctionalComponent(ReportRuntimeFilters, new ReportRuntimeFilters({
        ...{ 'onApply': {} },
        ref: "runtimeFilterRef",
        filters: (__VLS_ctx.report.config.filters || []),
        filterLogic: (__VLS_ctx.report.config.filter_logic),
        columnLabels: (__VLS_ctx.columnLabels),
        currentDatasetTables: (__VLS_ctx.datasetTables),
    }));
    const __VLS_88 = __VLS_87({
        ...{ 'onApply': {} },
        ref: "runtimeFilterRef",
        filters: (__VLS_ctx.report.config.filters || []),
        filterLogic: (__VLS_ctx.report.config.filter_logic),
        columnLabels: (__VLS_ctx.columnLabels),
        currentDatasetTables: (__VLS_ctx.datasetTables),
    }, ...__VLS_functionalComponentArgsRest(__VLS_87));
    let __VLS_90;
    let __VLS_91;
    let __VLS_92;
    const __VLS_93 = {
        onApply: (__VLS_ctx.applyRuntimeFilters)
    };
    /** @type {typeof __VLS_ctx.runtimeFilterRef} */ ;
    var __VLS_94 = {};
    var __VLS_89;
    if (__VLS_ctx.integrity && !__VLS_ctx.integrity.ok) {
        const __VLS_96 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
            type: "warning",
            closable: (false),
            showIcon: true,
            ...{ style: {} },
        }));
        const __VLS_98 = __VLS_97({
            type: "warning",
            closable: (false),
            showIcon: true,
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_97));
        __VLS_99.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({
            ...{ style: {} },
        });
        for (const [iss, i] of __VLS_getVForSourceType((__VLS_ctx.integrity.issues))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({
                key: (i),
            });
            (iss);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        var __VLS_99;
    }
    if (__VLS_ctx.runWarnings.length) {
        const __VLS_100 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
            type: "warning",
            closable: (true),
            showIcon: true,
            ...{ style: {} },
        }));
        const __VLS_102 = __VLS_101({
            type: "warning",
            closable: (true),
            showIcon: true,
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_101));
        __VLS_103.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({
            ...{ style: {} },
        });
        for (const [w, i] of __VLS_getVForSourceType((__VLS_ctx.runWarnings))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({
                key: (i),
            });
            (w);
        }
        var __VLS_103;
    }
    /** @type {[typeof ReportPreviewTable, ]} */ ;
    // @ts-ignore
    const __VLS_104 = __VLS_asFunctionalComponent(ReportPreviewTable, new ReportPreviewTable({
        ...{ 'onUpdate:page': {} },
        ...{ 'onUpdate:pageSize': {} },
        ...{ 'onPageChange': {} },
        columns: (__VLS_ctx.columns),
        items: (__VLS_ctx.items),
        total: (__VLS_ctx.total),
        page: (__VLS_ctx.page),
        pageSize: (__VLS_ctx.pageSize),
        loading: (__VLS_ctx.loading),
        columnSettings: (__VLS_ctx.report.config.column_settings || {}),
        fillViewport: true,
        pageSizes: ([20, 50, 100]),
    }));
    const __VLS_105 = __VLS_104({
        ...{ 'onUpdate:page': {} },
        ...{ 'onUpdate:pageSize': {} },
        ...{ 'onPageChange': {} },
        columns: (__VLS_ctx.columns),
        items: (__VLS_ctx.items),
        total: (__VLS_ctx.total),
        page: (__VLS_ctx.page),
        pageSize: (__VLS_ctx.pageSize),
        loading: (__VLS_ctx.loading),
        columnSettings: (__VLS_ctx.report.config.column_settings || {}),
        fillViewport: true,
        pageSizes: ([20, 50, 100]),
    }, ...__VLS_functionalComponentArgsRest(__VLS_104));
    let __VLS_107;
    let __VLS_108;
    let __VLS_109;
    const __VLS_110 = {
        'onUpdate:page': (...[$event]) => {
            if (!(__VLS_ctx.report))
                return;
            __VLS_ctx.page = $event;
        }
    };
    const __VLS_111 = {
        'onUpdate:pageSize': (...[$event]) => {
            if (!(__VLS_ctx.report))
                return;
            __VLS_ctx.pageSize = $event;
        }
    };
    const __VLS_112 = {
        onPageChange: (__VLS_ctx.run)
    };
    var __VLS_106;
    var __VLS_113 = {};
}
else if (__VLS_ctx.reportLoadError) {
    const __VLS_115 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_116 = __VLS_asFunctionalComponent(__VLS_115, new __VLS_115({
        description: (__VLS_ctx.reportLoadError),
    }));
    const __VLS_117 = __VLS_116({
        description: (__VLS_ctx.reportLoadError),
    }, ...__VLS_functionalComponentArgsRest(__VLS_116));
    __VLS_118.slots.default;
    const __VLS_119 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_120 = __VLS_asFunctionalComponent(__VLS_119, new __VLS_119({
        ...{ 'onClick': {} },
        type: "primary",
    }));
    const __VLS_121 = __VLS_120({
        ...{ 'onClick': {} },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_120));
    let __VLS_123;
    let __VLS_124;
    let __VLS_125;
    const __VLS_126 = {
        onClick: (__VLS_ctx.retryLoadReport)
    };
    __VLS_122.slots.default;
    var __VLS_122;
    var __VLS_118;
}
else {
    const __VLS_127 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_128 = __VLS_asFunctionalComponent(__VLS_127, new __VLS_127({
        description: "加载报表中...",
    }));
    const __VLS_129 = __VLS_128({
        description: "加载报表中...",
    }, ...__VLS_functionalComponentArgsRest(__VLS_128));
}
var __VLS_2;
/** @type {__VLS_StyleScopedClasses['report-info-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['tip-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['info-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['report-view-content']} */ ;
// @ts-ignore
var __VLS_25 = __VLS_24, __VLS_95 = __VLS_94, __VLS_114 = __VLS_113;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Download: Download,
            Edit: Edit,
            InfoFilled: InfoFilled,
            Refresh: Refresh,
            FullscreenWorkspaceShell: FullscreenWorkspaceShell,
            PermissionButton: PermissionButton,
            formatDateTime: formatDateTime,
            ReportPreviewTable: ReportPreviewTable,
            ReportRuntimeFilters: ReportRuntimeFilters,
            REPORT_VISIBILITY_LABELS: REPORT_VISIBILITY_LABELS,
            router: router,
            reportListTarget: reportListTarget,
            report: report,
            visibilityTagType: visibilityTagType,
            columns: columns,
            items: items,
            total: total,
            runWarnings: runWarnings,
            page: page,
            pageSize: pageSize,
            loading: loading,
            reportLoadError: reportLoadError,
            integrity: integrity,
            runtimeFilterRef: runtimeFilterRef,
            columnLabels: columnLabels,
            datasetTables: datasetTables,
            retryLoadReport: retryLoadReport,
            run: run,
            doExport: doExport,
            sourceSummary: sourceSummary,
            fieldCount: fieldCount,
            applyRuntimeFilters: applyRuntimeFilters,
        };
    },
    __typeProps: {},
});
const __VLS_component = (await import('vue')).defineComponent({
    setup() {
        return {
            ...__VLS_exposed,
        };
    },
    __typeProps: {},
});
export default {};
; /* PartiallyEnd: #4569/main.vue */
