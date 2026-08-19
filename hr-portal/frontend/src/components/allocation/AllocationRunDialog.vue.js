/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { allocationApi } from '@/api/allocation';
import { datasetsApi } from '@/api/datasets';
import { dataApi } from '@/api/data';
import ReportFilterList from '@/components/report/ReportFilterList.vue';
const props = defineProps();
const emit = defineEmits();
const filters = ref([]);
const allColumns = ref([]);
const currentDataset = ref(null);
const loading = ref(false);
const running = ref(false);
function datasetTableName(table) {
    return table.table_label || table.table_name;
}
async function init() {
    if (!props.scheme)
        return;
    filters.value = [];
    loading.value = true;
    try {
        if (!props.scheme.dataset_id) {
            currentDataset.value = null;
            allColumns.value = [];
            return;
        }
        const ds = await datasetsApi.get(props.scheme.dataset_id);
        currentDataset.value = ds;
        const cols = [];
        for (const table of ds.tables) {
            const tableColumns = await dataApi.columns(table.table_name);
            const tableName = datasetTableName(table);
            for (const col of tableColumns) {
                cols.push({ ...col, code: `${table.alias}.${col.code}`, label: `${tableName}.${col.label}` });
            }
        }
        allColumns.value = cols;
    }
    finally {
        loading.value = false;
    }
}
watch(() => props.visible, (v) => { if (v)
    init(); });
async function confirm() {
    if (!props.scheme)
        return;
    if (!props.scheme.dataset_id) {
        ElMessage.error('方案未绑定数据集');
        return;
    }
    running.value = true;
    try {
        const run = await allocationApi.runScheme(props.scheme.id, filters.value);
        ElMessage.success(`存档成功，共写入 ${run.rows_written} 行（${run.period_ym}）`);
        if (run.warnings && run.warnings.length) {
            ElMessage({
                type: 'warning',
                message: '字段类型不一致已自动兼容（可能漏匹配）：\n' + run.warnings.join('\n'),
                duration: 0,
                showClose: true,
            });
        }
        emit('update:visible', false);
        emit('done', run);
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '执行失败');
    }
    finally {
        running.value = false;
    }
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
const __VLS_0 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.visible),
    title: "计算存档",
    width: "680px",
    closeOnClickModal: (false),
}));
const __VLS_2 = __VLS_1({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.visible),
    title: "计算存档",
    width: "680px",
    closeOnClickModal: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    'onUpdate:modelValue': (...[$event]) => {
        __VLS_ctx.emit('update:visible', $event);
    }
};
var __VLS_8 = {};
__VLS_3.slots.default;
if (__VLS_ctx.scheme) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_9 = {}.ElDescriptions;
    /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
    // @ts-ignore
    const __VLS_10 = __VLS_asFunctionalComponent(__VLS_9, new __VLS_9({
        column: (2),
        size: "small",
        border: true,
        ...{ style: {} },
    }));
    const __VLS_11 = __VLS_10({
        column: (2),
        size: "small",
        border: true,
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_10));
    __VLS_12.slots.default;
    const __VLS_13 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_14 = __VLS_asFunctionalComponent(__VLS_13, new __VLS_13({
        label: "方案",
    }));
    const __VLS_15 = __VLS_14({
        label: "方案",
    }, ...__VLS_functionalComponentArgsRest(__VLS_14));
    __VLS_16.slots.default;
    (__VLS_ctx.scheme.name);
    var __VLS_16;
    const __VLS_17 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_18 = __VLS_asFunctionalComponent(__VLS_17, new __VLS_17({
        label: "写入结果表",
    }));
    const __VLS_19 = __VLS_18({
        label: "写入结果表",
    }, ...__VLS_functionalComponentArgsRest(__VLS_18));
    __VLS_20.slots.default;
    (__VLS_ctx.scheme.result_table_label);
    var __VLS_20;
    const __VLS_21 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_22 = __VLS_asFunctionalComponent(__VLS_21, new __VLS_21({
        label: "数据集",
        span: (2),
    }));
    const __VLS_23 = __VLS_22({
        label: "数据集",
        span: (2),
    }, ...__VLS_functionalComponentArgsRest(__VLS_22));
    __VLS_24.slots.default;
    const __VLS_25 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_26 = __VLS_asFunctionalComponent(__VLS_25, new __VLS_25({
        size: "small",
        type: "warning",
        effect: "plain",
    }));
    const __VLS_27 = __VLS_26({
        size: "small",
        type: "warning",
        effect: "plain",
    }, ...__VLS_functionalComponentArgsRest(__VLS_26));
    __VLS_28.slots.default;
    var __VLS_28;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: {} },
    });
    (__VLS_ctx.scheme.dataset_name || `#${__VLS_ctx.scheme.dataset_id}`);
    var __VLS_24;
    var __VLS_12;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "run-section-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "run-help" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
    /** @type {[typeof ReportFilterList, ]} */ ;
    // @ts-ignore
    const __VLS_29 = __VLS_asFunctionalComponent(ReportFilterList, new ReportFilterList({
        filters: (__VLS_ctx.filters),
        allColumns: (__VLS_ctx.allColumns),
        currentDatasetTables: (__VLS_ctx.currentDataset?.tables),
    }));
    const __VLS_30 = __VLS_29({
        filters: (__VLS_ctx.filters),
        allColumns: (__VLS_ctx.allColumns),
        currentDatasetTables: (__VLS_ctx.currentDataset?.tables),
    }, ...__VLS_functionalComponentArgsRest(__VLS_29));
    const __VLS_32 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
        type: "warning",
        closable: (false),
        showIcon: true,
        ...{ style: {} },
    }));
    const __VLS_34 = __VLS_33({
        type: "warning",
        closable: (false),
        showIcon: true,
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_33));
    __VLS_35.slots.default;
    (__VLS_ctx.scheme.result_table_label);
    var __VLS_35;
}
{
    const { footer: __VLS_thisSlot } = __VLS_3.slots;
    const __VLS_36 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
        ...{ 'onClick': {} },
    }));
    const __VLS_38 = __VLS_37({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_37));
    let __VLS_40;
    let __VLS_41;
    let __VLS_42;
    const __VLS_43 = {
        onClick: (...[$event]) => {
            __VLS_ctx.emit('update:visible', false);
        }
    };
    __VLS_39.slots.default;
    var __VLS_39;
    const __VLS_44 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.running),
    }));
    const __VLS_46 = __VLS_45({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.running),
    }, ...__VLS_functionalComponentArgsRest(__VLS_45));
    let __VLS_48;
    let __VLS_49;
    let __VLS_50;
    const __VLS_51 = {
        onClick: (__VLS_ctx.confirm)
    };
    __VLS_47.slots.default;
    var __VLS_47;
}
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['run-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['run-help']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ReportFilterList: ReportFilterList,
            emit: emit,
            filters: filters,
            allColumns: allColumns,
            currentDataset: currentDataset,
            loading: loading,
            running: running,
            confirm: confirm,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
