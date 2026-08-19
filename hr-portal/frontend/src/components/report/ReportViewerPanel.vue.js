/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ArrowLeft, Download, Edit, InfoFilled, Refresh } from '@element-plus/icons-vue';
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
const integrity = ref(null);
const runtimeFilters = ref([]);
const runtimeFilterRef = ref(null);
const columnLabels = ref({});
const datasetTables = ref([]);
function datasetTableName(table) {
    return table.table_label || table.table_name;
}
async function loadReport() {
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
        ElMessage.error(e?.response?.data?.detail || '加载报表失败');
    }
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
    await run();
});
const __VLS_exposed = { run };
defineExpose(__VLS_exposed);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['report-view-card']} */ ;
/** @type {__VLS_StyleScopedClasses['report-view-card']} */ ;
/** @type {__VLS_StyleScopedClasses['report-info-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['report-info-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['report-info-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['report-view-card']} */ ;
/** @type {__VLS_StyleScopedClasses['report-view-card']} */ ;
/** @type {__VLS_StyleScopedClasses['report-view-card']} */ ;
/** @type {__VLS_StyleScopedClasses['report-view-card']} */ ;
/** @type {__VLS_StyleScopedClasses['viewer-head']} */ ;
/** @type {__VLS_StyleScopedClasses['viewer-actions']} */ ;
// CSS variable injection 
// CSS variable injection end 
if (__VLS_ctx.report) {
    const __VLS_0 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        ...{ class: "report-view-card" },
    }));
    const __VLS_2 = __VLS_1({
        ...{ class: "report-view-card" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    var __VLS_4 = {};
    __VLS_3.slots.default;
    {
        const { header: __VLS_thisSlot } = __VLS_3.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "viewer-head" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "viewer-title-area" },
        });
        const __VLS_5 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_6 = __VLS_asFunctionalComponent(__VLS_5, new __VLS_5({
            ...{ 'onClick': {} },
            link: true,
        }));
        const __VLS_7 = __VLS_6({
            ...{ 'onClick': {} },
            link: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_6));
        let __VLS_9;
        let __VLS_10;
        let __VLS_11;
        const __VLS_12 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.report))
                    return;
                __VLS_ctx.router.push('/report/list');
            }
        };
        __VLS_8.slots.default;
        const __VLS_13 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_14 = __VLS_asFunctionalComponent(__VLS_13, new __VLS_13({}));
        const __VLS_15 = __VLS_14({}, ...__VLS_functionalComponentArgsRest(__VLS_14));
        __VLS_16.slots.default;
        const __VLS_17 = {}.ArrowLeft;
        /** @type {[typeof __VLS_components.ArrowLeft, ]} */ ;
        // @ts-ignore
        const __VLS_18 = __VLS_asFunctionalComponent(__VLS_17, new __VLS_17({}));
        const __VLS_19 = __VLS_18({}, ...__VLS_functionalComponentArgsRest(__VLS_18));
        var __VLS_16;
        var __VLS_8;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "viewer-title" },
        });
        (__VLS_ctx.report.name);
        const __VLS_21 = {}.ElTooltip;
        /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
        // @ts-ignore
        const __VLS_22 = __VLS_asFunctionalComponent(__VLS_21, new __VLS_21({
            placement: "bottom-start",
            width: (320),
        }));
        const __VLS_23 = __VLS_22({
            placement: "bottom-start",
            width: (320),
        }, ...__VLS_functionalComponentArgsRest(__VLS_22));
        __VLS_24.slots.default;
        {
            const { content: __VLS_thisSlot } = __VLS_24.slots;
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
        const __VLS_25 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_26 = __VLS_asFunctionalComponent(__VLS_25, new __VLS_25({
            ...{ class: "info-icon" },
        }));
        const __VLS_27 = __VLS_26({
            ...{ class: "info-icon" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_26));
        __VLS_28.slots.default;
        const __VLS_29 = {}.InfoFilled;
        /** @type {[typeof __VLS_components.InfoFilled, ]} */ ;
        // @ts-ignore
        const __VLS_30 = __VLS_asFunctionalComponent(__VLS_29, new __VLS_29({}));
        const __VLS_31 = __VLS_30({}, ...__VLS_functionalComponentArgsRest(__VLS_30));
        var __VLS_28;
        var __VLS_24;
        const __VLS_33 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_34 = __VLS_asFunctionalComponent(__VLS_33, new __VLS_33({
            type: (__VLS_ctx.visibilityTagType),
            size: "small",
            effect: "plain",
        }));
        const __VLS_35 = __VLS_34({
            type: (__VLS_ctx.visibilityTagType),
            size: "small",
            effect: "plain",
        }, ...__VLS_functionalComponentArgsRest(__VLS_34));
        __VLS_36.slots.default;
        (__VLS_ctx.REPORT_VISIBILITY_LABELS[__VLS_ctx.report.visibility]);
        var __VLS_36;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "viewer-actions" },
        });
        var __VLS_37 = {};
        const __VLS_39 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_40 = __VLS_asFunctionalComponent(__VLS_39, new __VLS_39({
            ...{ 'onClick': {} },
            loading: (__VLS_ctx.loading),
        }));
        const __VLS_41 = __VLS_40({
            ...{ 'onClick': {} },
            loading: (__VLS_ctx.loading),
        }, ...__VLS_functionalComponentArgsRest(__VLS_40));
        let __VLS_43;
        let __VLS_44;
        let __VLS_45;
        const __VLS_46 = {
            onClick: (__VLS_ctx.run)
        };
        __VLS_42.slots.default;
        const __VLS_47 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_48 = __VLS_asFunctionalComponent(__VLS_47, new __VLS_47({
            ...{ style: {} },
        }));
        const __VLS_49 = __VLS_48({
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_48));
        __VLS_50.slots.default;
        const __VLS_51 = {}.Refresh;
        /** @type {[typeof __VLS_components.Refresh, ]} */ ;
        // @ts-ignore
        const __VLS_52 = __VLS_asFunctionalComponent(__VLS_51, new __VLS_51({}));
        const __VLS_53 = __VLS_52({}, ...__VLS_functionalComponentArgsRest(__VLS_52));
        var __VLS_50;
        var __VLS_42;
        /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
        // @ts-ignore
        const __VLS_55 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
            ...{ 'onClick': {} },
            menu: "report.list",
            op: "U",
        }));
        const __VLS_56 = __VLS_55({
            ...{ 'onClick': {} },
            menu: "report.list",
            op: "U",
        }, ...__VLS_functionalComponentArgsRest(__VLS_55));
        let __VLS_58;
        let __VLS_59;
        let __VLS_60;
        const __VLS_61 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.report))
                    return;
                __VLS_ctx.router.push(`/report/designer/${__VLS_ctx.report.id}`);
            }
        };
        __VLS_57.slots.default;
        const __VLS_62 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_63 = __VLS_asFunctionalComponent(__VLS_62, new __VLS_62({
            ...{ style: {} },
        }));
        const __VLS_64 = __VLS_63({
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_63));
        __VLS_65.slots.default;
        const __VLS_66 = {}.Edit;
        /** @type {[typeof __VLS_components.Edit, ]} */ ;
        // @ts-ignore
        const __VLS_67 = __VLS_asFunctionalComponent(__VLS_66, new __VLS_66({}));
        const __VLS_68 = __VLS_67({}, ...__VLS_functionalComponentArgsRest(__VLS_67));
        var __VLS_65;
        var __VLS_57;
        /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
        // @ts-ignore
        const __VLS_70 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
            ...{ 'onClick': {} },
            menu: "report.list",
            op: "E",
        }));
        const __VLS_71 = __VLS_70({
            ...{ 'onClick': {} },
            menu: "report.list",
            op: "E",
        }, ...__VLS_functionalComponentArgsRest(__VLS_70));
        let __VLS_73;
        let __VLS_74;
        let __VLS_75;
        const __VLS_76 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.report))
                    return;
                __VLS_ctx.doExport('csv');
            }
        };
        __VLS_72.slots.default;
        const __VLS_77 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_78 = __VLS_asFunctionalComponent(__VLS_77, new __VLS_77({
            ...{ style: {} },
        }));
        const __VLS_79 = __VLS_78({
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_78));
        __VLS_80.slots.default;
        const __VLS_81 = {}.Download;
        /** @type {[typeof __VLS_components.Download, ]} */ ;
        // @ts-ignore
        const __VLS_82 = __VLS_asFunctionalComponent(__VLS_81, new __VLS_81({}));
        const __VLS_83 = __VLS_82({}, ...__VLS_functionalComponentArgsRest(__VLS_82));
        var __VLS_80;
        var __VLS_72;
        /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
        // @ts-ignore
        const __VLS_85 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
            ...{ 'onClick': {} },
            menu: "report.list",
            op: "E",
            type: "primary",
        }));
        const __VLS_86 = __VLS_85({
            ...{ 'onClick': {} },
            menu: "report.list",
            op: "E",
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_85));
        let __VLS_88;
        let __VLS_89;
        let __VLS_90;
        const __VLS_91 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.report))
                    return;
                __VLS_ctx.doExport('xlsx');
            }
        };
        __VLS_87.slots.default;
        const __VLS_92 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
            ...{ style: {} },
        }));
        const __VLS_94 = __VLS_93({
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_93));
        __VLS_95.slots.default;
        const __VLS_96 = {}.Download;
        /** @type {[typeof __VLS_components.Download, ]} */ ;
        // @ts-ignore
        const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({}));
        const __VLS_98 = __VLS_97({}, ...__VLS_functionalComponentArgsRest(__VLS_97));
        var __VLS_95;
        var __VLS_87;
    }
    /** @type {[typeof ReportRuntimeFilters, ]} */ ;
    // @ts-ignore
    const __VLS_100 = __VLS_asFunctionalComponent(ReportRuntimeFilters, new ReportRuntimeFilters({
        ...{ 'onApply': {} },
        ref: "runtimeFilterRef",
        filters: (__VLS_ctx.report.config.filters || []),
        filterLogic: (__VLS_ctx.report.config.filter_logic),
        columnLabels: (__VLS_ctx.columnLabels),
        currentDatasetTables: (__VLS_ctx.datasetTables),
    }));
    const __VLS_101 = __VLS_100({
        ...{ 'onApply': {} },
        ref: "runtimeFilterRef",
        filters: (__VLS_ctx.report.config.filters || []),
        filterLogic: (__VLS_ctx.report.config.filter_logic),
        columnLabels: (__VLS_ctx.columnLabels),
        currentDatasetTables: (__VLS_ctx.datasetTables),
    }, ...__VLS_functionalComponentArgsRest(__VLS_100));
    let __VLS_103;
    let __VLS_104;
    let __VLS_105;
    const __VLS_106 = {
        onApply: (__VLS_ctx.applyRuntimeFilters)
    };
    /** @type {typeof __VLS_ctx.runtimeFilterRef} */ ;
    var __VLS_107 = {};
    var __VLS_102;
    if (__VLS_ctx.integrity && !__VLS_ctx.integrity.ok) {
        const __VLS_109 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_110 = __VLS_asFunctionalComponent(__VLS_109, new __VLS_109({
            type: "warning",
            closable: (false),
            showIcon: true,
            ...{ style: {} },
        }));
        const __VLS_111 = __VLS_110({
            type: "warning",
            closable: (false),
            showIcon: true,
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_110));
        __VLS_112.slots.default;
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
        var __VLS_112;
    }
    if (__VLS_ctx.runWarnings.length) {
        const __VLS_113 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_114 = __VLS_asFunctionalComponent(__VLS_113, new __VLS_113({
            type: "warning",
            closable: (true),
            showIcon: true,
            ...{ style: {} },
        }));
        const __VLS_115 = __VLS_114({
            type: "warning",
            closable: (true),
            showIcon: true,
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_114));
        __VLS_116.slots.default;
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
        var __VLS_116;
    }
    /** @type {[typeof ReportPreviewTable, ]} */ ;
    // @ts-ignore
    const __VLS_117 = __VLS_asFunctionalComponent(ReportPreviewTable, new ReportPreviewTable({
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
    const __VLS_118 = __VLS_117({
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
    }, ...__VLS_functionalComponentArgsRest(__VLS_117));
    let __VLS_120;
    let __VLS_121;
    let __VLS_122;
    const __VLS_123 = {
        'onUpdate:page': (...[$event]) => {
            if (!(__VLS_ctx.report))
                return;
            __VLS_ctx.page = $event;
        }
    };
    const __VLS_124 = {
        'onUpdate:pageSize': (...[$event]) => {
            if (!(__VLS_ctx.report))
                return;
            __VLS_ctx.pageSize = $event;
        }
    };
    const __VLS_125 = {
        onPageChange: (__VLS_ctx.run)
    };
    var __VLS_119;
    var __VLS_126 = {};
    var __VLS_3;
}
else {
    const __VLS_128 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({}));
    const __VLS_130 = __VLS_129({}, ...__VLS_functionalComponentArgsRest(__VLS_129));
    var __VLS_132 = {};
    __VLS_131.slots.default;
    const __VLS_133 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_134 = __VLS_asFunctionalComponent(__VLS_133, new __VLS_133({
        description: "加载报表中...",
    }));
    const __VLS_135 = __VLS_134({
        description: "加载报表中...",
    }, ...__VLS_functionalComponentArgsRest(__VLS_134));
    var __VLS_131;
}
/** @type {__VLS_StyleScopedClasses['report-view-card']} */ ;
/** @type {__VLS_StyleScopedClasses['viewer-head']} */ ;
/** @type {__VLS_StyleScopedClasses['viewer-title-area']} */ ;
/** @type {__VLS_StyleScopedClasses['viewer-title']} */ ;
/** @type {__VLS_StyleScopedClasses['report-info-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['tip-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['info-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['viewer-actions']} */ ;
// @ts-ignore
var __VLS_38 = __VLS_37, __VLS_108 = __VLS_107, __VLS_127 = __VLS_126;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ArrowLeft: ArrowLeft,
            Download: Download,
            Edit: Edit,
            InfoFilled: InfoFilled,
            Refresh: Refresh,
            PermissionButton: PermissionButton,
            formatDateTime: formatDateTime,
            ReportPreviewTable: ReportPreviewTable,
            ReportRuntimeFilters: ReportRuntimeFilters,
            REPORT_VISIBILITY_LABELS: REPORT_VISIBILITY_LABELS,
            router: router,
            report: report,
            visibilityTagType: visibilityTagType,
            columns: columns,
            items: items,
            total: total,
            runWarnings: runWarnings,
            page: page,
            pageSize: pageSize,
            loading: loading,
            integrity: integrity,
            runtimeFilterRef: runtimeFilterRef,
            columnLabels: columnLabels,
            datasetTables: datasetTables,
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
