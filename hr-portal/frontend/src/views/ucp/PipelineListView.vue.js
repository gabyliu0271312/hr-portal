/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { formatDateTime } from '@/utils/datetime';
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Refresh } from '@element-plus/icons-vue';
import { ucpApi, pipelineTemplateApi } from '@/api/ucp';
const router = useRouter();
const items = ref([]);
const totalCount = ref(0);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const keyword = ref('');
const filterTrigger = ref('');
const filterStatus = ref('');
const runningId = ref(null);
const enabledCount = computed(() => items.value.filter(x => x.status === 1).length);
const disabledCount = computed(() => items.value.filter(x => x.status === 2).length);
const recentFailedCount = computed(() => items.value.filter(x => x.recent_run_status === 'FAILED').length);
const triggerLabel = (t) => {
    switch (t) {
        case 'manual': return '手动';
        case 'cron': return '定时';
        case 'event': return '事件';
        case 'template': return '设计模板';
        default: return t || '-';
    }
};
const formatTime = (s) => (s ? formatDateTime(s) : '-');
const loadList = async () => {
    loading.value = true;
    try {
        const [pipelineRes, templates] = await Promise.all([
            ucpApi.pipelines(filterTrigger.value || undefined),
            pipelineTemplateApi.list({ limit: 200, offset: 0 }),
        ]);
        const pipelineItems = (pipelineRes.items || []).map((item) => ({ ...item, source_type: 'pipeline' }));
        const templateItems = (filterTrigger.value ? [] : templates).map((template) => ({
            id: -Number(template.id),
            pipeline_code: template.template_code,
            pipeline_name: template.name,
            trigger_type: 'template',
            status: 1,
            updated_at: template.updated_at,
            source_type: 'template',
            recent_run_status: null,
        }));
        let data = [...pipelineItems, ...templateItems].filter((item) => item.pipeline_code !== 'COST_ALLOCATION_LOCKED_INGEST');
        if (filterStatus.value !== '') {
            data = data.filter(item => item.source_type === 'pipeline' && item.status === Number(filterStatus.value));
        }
        if (keyword.value) {
            const kw = keyword.value.toLowerCase();
            data = data.filter(item => (item.pipeline_code || '').toLowerCase().includes(kw) || (item.pipeline_name || '').toLowerCase().includes(kw));
        }
        data.sort((left, right) => String(right.updated_at || '').localeCompare(String(left.updated_at || '')));
        items.value = data;
        totalCount.value = data.length;
    }
    catch (e) {
        ElMessage.error('加载流程编排列表失败: ' + (e?.message || e));
    }
    finally {
        loading.value = false;
    }
};
const openDesigner = (row) => {
    if (row) {
        router.push({ name: 'UcpPipelineDesigner', query: { code: row.pipeline_code } });
    }
    else {
        router.push({ name: 'UcpPipelineDesigner' });
    }
};
const runPipeline = async (row) => {
    try {
        await ElMessageBox.confirm(`确认手动执行流水线「${row.pipeline_name || row.pipeline_code}」？`, '提示', { type: 'info' });
        runningId.value = row.id;
        const result = await ucpApi.runPipeline(row.pipeline_code, { dry_run: false });
        ElMessage.success(`流水线已触发，执行 ID: ${result.pipeline_run_id}`);
    }
    catch (e) {
        if (e !== 'cancel')
            ElMessage.error('执行失败: ' + (e?.response?.data?.detail || e?.message || e));
    }
    finally {
        runningId.value = null;
    }
};
const toggleStatus = async (row) => {
    const newStatus = row.status === 1 ? 2 : 1;
    try {
        await ElMessageBox.confirm(`确认${newStatus === 1 ? '启用' : '禁用'}流水线「${row.pipeline_name || row.pipeline_code}」？`, '提示', { type: 'warning' });
        await ucpApi.togglePipeline(row.id, newStatus);
        ElMessage.success('操作成功');
        loadList();
    }
    catch (e) {
        if (e !== 'cancel')
            ElMessage.error('操作失败: ' + (e?.message || e));
    }
};
const deletePipeline = async (row) => {
    try {
        await ElMessageBox.confirm(`确认删除流水线「${row.pipeline_name || row.pipeline_code}」？此操作不可恢复。`, '确认删除', { type: 'warning' });
        if (row.source_type === 'template')
            await pipelineTemplateApi.remove(row.pipeline_code);
        else
            await ucpApi.deletePipeline(row.id);
        ElMessage.success('删除成功');
        loadList();
    }
    catch (e) {
        if (e !== 'cancel')
            ElMessage.error('删除失败: ' + (e?.message || e));
    }
};
onMounted(() => {
    loadList();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "pipeline-list" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "page-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "desc" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-row" },
});
const __VLS_0 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ class: "stat-card" },
}));
const __VLS_2 = __VLS_1({
    ...{ class: "stat-card" },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-value" },
});
(__VLS_ctx.totalCount);
var __VLS_3;
const __VLS_4 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
    ...{ class: "stat-card" },
}));
const __VLS_6 = __VLS_5({
    ...{ class: "stat-card" },
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
__VLS_7.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-value text-success" },
});
(__VLS_ctx.enabledCount);
var __VLS_7;
const __VLS_8 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    ...{ class: "stat-card" },
}));
const __VLS_10 = __VLS_9({
    ...{ class: "stat-card" },
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
__VLS_11.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-value text-danger" },
});
(__VLS_ctx.disabledCount);
var __VLS_11;
const __VLS_12 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    ...{ class: "stat-card" },
    ...{ class: ({ 'stat-card-warn': __VLS_ctx.recentFailedCount > 0 }) },
}));
const __VLS_14 = __VLS_13({
    ...{ class: "stat-card" },
    ...{ class: ({ 'stat-card-warn': __VLS_ctx.recentFailedCount > 0 }) },
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
__VLS_15.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-value text-warning" },
});
(__VLS_ctx.recentFailedCount);
var __VLS_15;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "toolbar" },
});
const __VLS_16 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    ...{ 'onClear': {} },
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.keyword),
    placeholder: "搜索流水线编码/名称",
    clearable: true,
    ...{ style: {} },
}));
const __VLS_18 = __VLS_17({
    ...{ 'onClear': {} },
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.keyword),
    placeholder: "搜索流水线编码/名称",
    clearable: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
let __VLS_20;
let __VLS_21;
let __VLS_22;
const __VLS_23 = {
    onClear: (__VLS_ctx.loadList)
};
const __VLS_24 = {
    onKeyup: (__VLS_ctx.loadList)
};
var __VLS_19;
const __VLS_25 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_26 = __VLS_asFunctionalComponent(__VLS_25, new __VLS_25({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.filterTrigger),
    placeholder: "触发方式",
    clearable: true,
    ...{ style: {} },
}));
const __VLS_27 = __VLS_26({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.filterTrigger),
    placeholder: "触发方式",
    clearable: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_26));
let __VLS_29;
let __VLS_30;
let __VLS_31;
const __VLS_32 = {
    onChange: (__VLS_ctx.loadList)
};
__VLS_28.slots.default;
const __VLS_33 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_34 = __VLS_asFunctionalComponent(__VLS_33, new __VLS_33({
    label: "手动（manual）",
    value: "manual",
}));
const __VLS_35 = __VLS_34({
    label: "手动（manual）",
    value: "manual",
}, ...__VLS_functionalComponentArgsRest(__VLS_34));
const __VLS_37 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_38 = __VLS_asFunctionalComponent(__VLS_37, new __VLS_37({
    label: "定时（cron）",
    value: "cron",
}));
const __VLS_39 = __VLS_38({
    label: "定时（cron）",
    value: "cron",
}, ...__VLS_functionalComponentArgsRest(__VLS_38));
const __VLS_41 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_42 = __VLS_asFunctionalComponent(__VLS_41, new __VLS_41({
    label: "事件（event）",
    value: "event",
}));
const __VLS_43 = __VLS_42({
    label: "事件（event）",
    value: "event",
}, ...__VLS_functionalComponentArgsRest(__VLS_42));
var __VLS_28;
const __VLS_45 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_46 = __VLS_asFunctionalComponent(__VLS_45, new __VLS_45({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.filterStatus),
    placeholder: "状态",
    clearable: true,
    ...{ style: {} },
}));
const __VLS_47 = __VLS_46({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.filterStatus),
    placeholder: "状态",
    clearable: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_46));
let __VLS_49;
let __VLS_50;
let __VLS_51;
const __VLS_52 = {
    onChange: (__VLS_ctx.loadList)
};
__VLS_48.slots.default;
const __VLS_53 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_54 = __VLS_asFunctionalComponent(__VLS_53, new __VLS_53({
    label: "启用",
    value: (1),
}));
const __VLS_55 = __VLS_54({
    label: "启用",
    value: (1),
}, ...__VLS_functionalComponentArgsRest(__VLS_54));
const __VLS_57 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_58 = __VLS_asFunctionalComponent(__VLS_57, new __VLS_57({
    label: "禁用",
    value: (2),
}));
const __VLS_59 = __VLS_58({
    label: "禁用",
    value: (2),
}, ...__VLS_functionalComponentArgsRest(__VLS_58));
var __VLS_48;
const __VLS_61 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_62 = __VLS_asFunctionalComponent(__VLS_61, new __VLS_61({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Refresh),
}));
const __VLS_63 = __VLS_62({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Refresh),
}, ...__VLS_functionalComponentArgsRest(__VLS_62));
let __VLS_65;
let __VLS_66;
let __VLS_67;
const __VLS_68 = {
    onClick: (__VLS_ctx.loadList)
};
__VLS_64.slots.default;
var __VLS_64;
const __VLS_69 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_70 = __VLS_asFunctionalComponent(__VLS_69, new __VLS_69({
    ...{ 'onClick': {} },
    type: "primary",
    icon: (__VLS_ctx.Plus),
}));
const __VLS_71 = __VLS_70({
    ...{ 'onClick': {} },
    type: "primary",
    icon: (__VLS_ctx.Plus),
}, ...__VLS_functionalComponentArgsRest(__VLS_70));
let __VLS_73;
let __VLS_74;
let __VLS_75;
const __VLS_76 = {
    onClick: (__VLS_ctx.openDesigner)
};
__VLS_72.slots.default;
var __VLS_72;
const __VLS_77 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_78 = __VLS_asFunctionalComponent(__VLS_77, new __VLS_77({
    data: (__VLS_ctx.items),
    stripe: true,
    border: true,
}));
const __VLS_79 = __VLS_78({
    data: (__VLS_ctx.items),
    stripe: true,
    border: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_78));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_80.slots.default;
const __VLS_81 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_82 = __VLS_asFunctionalComponent(__VLS_81, new __VLS_81({
    prop: "id",
    label: "ID",
    width: "65",
}));
const __VLS_83 = __VLS_82({
    prop: "id",
    label: "ID",
    width: "65",
}, ...__VLS_functionalComponentArgsRest(__VLS_82));
const __VLS_85 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_86 = __VLS_asFunctionalComponent(__VLS_85, new __VLS_85({
    prop: "pipeline_code",
    label: "流水线编码",
    minWidth: "170",
    showOverflowTooltip: true,
}));
const __VLS_87 = __VLS_86({
    prop: "pipeline_code",
    label: "流水线编码",
    minWidth: "170",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_86));
const __VLS_89 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_90 = __VLS_asFunctionalComponent(__VLS_89, new __VLS_89({
    prop: "pipeline_name",
    label: "名称",
    minWidth: "150",
    showOverflowTooltip: true,
}));
const __VLS_91 = __VLS_90({
    prop: "pipeline_name",
    label: "名称",
    minWidth: "150",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_90));
const __VLS_93 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_94 = __VLS_asFunctionalComponent(__VLS_93, new __VLS_93({
    label: "触发方式",
    width: "120",
}));
const __VLS_95 = __VLS_94({
    label: "触发方式",
    width: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_94));
__VLS_96.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_96.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_97 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_98 = __VLS_asFunctionalComponent(__VLS_97, new __VLS_97({
        size: "small",
    }));
    const __VLS_99 = __VLS_98({
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_98));
    __VLS_100.slots.default;
    (__VLS_ctx.triggerLabel(row.trigger_type));
    var __VLS_100;
}
var __VLS_96;
const __VLS_101 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_102 = __VLS_asFunctionalComponent(__VLS_101, new __VLS_101({
    label: "状态",
    width: "80",
    align: "center",
}));
const __VLS_103 = __VLS_102({
    label: "状态",
    width: "80",
    align: "center",
}, ...__VLS_functionalComponentArgsRest(__VLS_102));
__VLS_104.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_104.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    if (row.source_type === 'template') {
        const __VLS_105 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_106 = __VLS_asFunctionalComponent(__VLS_105, new __VLS_105({
            size: "small",
            type: "success",
        }));
        const __VLS_107 = __VLS_106({
            size: "small",
            type: "success",
        }, ...__VLS_functionalComponentArgsRest(__VLS_106));
        __VLS_108.slots.default;
        var __VLS_108;
    }
    else {
        const __VLS_109 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_110 = __VLS_asFunctionalComponent(__VLS_109, new __VLS_109({
            size: "small",
            type: (row.status === 1 ? 'success' : 'info'),
        }));
        const __VLS_111 = __VLS_110({
            size: "small",
            type: (row.status === 1 ? 'success' : 'info'),
        }, ...__VLS_functionalComponentArgsRest(__VLS_110));
        __VLS_112.slots.default;
        (row.status === 1 ? '启用' : '禁用');
        var __VLS_112;
    }
}
var __VLS_104;
const __VLS_113 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_114 = __VLS_asFunctionalComponent(__VLS_113, new __VLS_113({
    prop: "updated_at",
    label: "更新时间",
    width: "170",
}));
const __VLS_115 = __VLS_114({
    prop: "updated_at",
    label: "更新时间",
    width: "170",
}, ...__VLS_functionalComponentArgsRest(__VLS_114));
__VLS_116.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_116.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (__VLS_ctx.formatTime(row.updated_at));
}
var __VLS_116;
const __VLS_117 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_118 = __VLS_asFunctionalComponent(__VLS_117, new __VLS_117({
    label: "操作",
    width: "240",
    fixed: "right",
}));
const __VLS_119 = __VLS_118({
    label: "操作",
    width: "240",
    fixed: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_118));
__VLS_120.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_120.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_121 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_122 = __VLS_asFunctionalComponent(__VLS_121, new __VLS_121({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
        type: "primary",
    }));
    const __VLS_123 = __VLS_122({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_122));
    let __VLS_125;
    let __VLS_126;
    let __VLS_127;
    const __VLS_128 = {
        onClick: (...[$event]) => {
            __VLS_ctx.openDesigner(row);
        }
    };
    __VLS_124.slots.default;
    var __VLS_124;
    const __VLS_129 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_130 = __VLS_asFunctionalComponent(__VLS_129, new __VLS_129({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
        type: "success",
        loading: (__VLS_ctx.runningId === row.id),
    }));
    const __VLS_131 = __VLS_130({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
        type: "success",
        loading: (__VLS_ctx.runningId === row.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_130));
    let __VLS_133;
    let __VLS_134;
    let __VLS_135;
    const __VLS_136 = {
        onClick: (...[$event]) => {
            __VLS_ctx.runPipeline(row);
        }
    };
    __VLS_132.slots.default;
    var __VLS_132;
    if (row.source_type !== 'template') {
        const __VLS_137 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_138 = __VLS_asFunctionalComponent(__VLS_137, new __VLS_137({
            ...{ 'onClick': {} },
            size: "small",
            link: true,
            type: (row.status === 1 ? 'warning' : 'success'),
        }));
        const __VLS_139 = __VLS_138({
            ...{ 'onClick': {} },
            size: "small",
            link: true,
            type: (row.status === 1 ? 'warning' : 'success'),
        }, ...__VLS_functionalComponentArgsRest(__VLS_138));
        let __VLS_141;
        let __VLS_142;
        let __VLS_143;
        const __VLS_144 = {
            onClick: (...[$event]) => {
                if (!(row.source_type !== 'template'))
                    return;
                __VLS_ctx.toggleStatus(row);
            }
        };
        __VLS_140.slots.default;
        (row.status === 1 ? '禁用' : '启用');
        var __VLS_140;
    }
    const __VLS_145 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_146 = __VLS_asFunctionalComponent(__VLS_145, new __VLS_145({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
        type: "danger",
    }));
    const __VLS_147 = __VLS_146({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
        type: "danger",
    }, ...__VLS_functionalComponentArgsRest(__VLS_146));
    let __VLS_149;
    let __VLS_150;
    let __VLS_151;
    const __VLS_152 = {
        onClick: (...[$event]) => {
            __VLS_ctx.deletePipeline(row);
        }
    };
    __VLS_148.slots.default;
    var __VLS_148;
}
var __VLS_120;
var __VLS_80;
const __VLS_153 = {}.ElPagination;
/** @type {[typeof __VLS_components.ElPagination, typeof __VLS_components.elPagination, ]} */ ;
// @ts-ignore
const __VLS_154 = __VLS_asFunctionalComponent(__VLS_153, new __VLS_153({
    ...{ 'onCurrentChange': {} },
    ...{ 'onSizeChange': {} },
    ...{ class: "pager" },
    currentPage: (__VLS_ctx.page),
    pageSize: (__VLS_ctx.pageSize),
    total: (__VLS_ctx.totalCount),
    pageSizes: ([20, 50, 100]),
    layout: "total, sizes, prev, pager, next, jumper",
}));
const __VLS_155 = __VLS_154({
    ...{ 'onCurrentChange': {} },
    ...{ 'onSizeChange': {} },
    ...{ class: "pager" },
    currentPage: (__VLS_ctx.page),
    pageSize: (__VLS_ctx.pageSize),
    total: (__VLS_ctx.totalCount),
    pageSizes: ([20, 50, 100]),
    layout: "total, sizes, prev, pager, next, jumper",
}, ...__VLS_functionalComponentArgsRest(__VLS_154));
let __VLS_157;
let __VLS_158;
let __VLS_159;
const __VLS_160 = {
    onCurrentChange: (__VLS_ctx.loadList)
};
const __VLS_161 = {
    onSizeChange: (__VLS_ctx.loadList)
};
var __VLS_156;
/** @type {__VLS_StyleScopedClasses['pipeline-list']} */ ;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['desc']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-row']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-value']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-value']} */ ;
/** @type {__VLS_StyleScopedClasses['text-success']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-value']} */ ;
/** @type {__VLS_StyleScopedClasses['text-danger']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-value']} */ ;
/** @type {__VLS_StyleScopedClasses['text-warning']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['pager']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Plus: Plus,
            Refresh: Refresh,
            items: items,
            totalCount: totalCount,
            loading: loading,
            page: page,
            pageSize: pageSize,
            keyword: keyword,
            filterTrigger: filterTrigger,
            filterStatus: filterStatus,
            runningId: runningId,
            enabledCount: enabledCount,
            disabledCount: disabledCount,
            recentFailedCount: recentFailedCount,
            triggerLabel: triggerLabel,
            formatTime: formatTime,
            loadList: loadList,
            openDesigner: openDesigner,
            runPipeline: runPipeline,
            toggleStatus: toggleStatus,
            deletePipeline: deletePipeline,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
