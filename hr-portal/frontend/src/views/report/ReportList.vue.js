/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Document, Edit, Delete, View, Position, CopyDocument } from '@element-plus/icons-vue';
import PermissionButton from '@/components/PermissionButton.vue';
import { formatDateTime } from '@/utils/datetime';
import { reportsApi, REPORT_VISIBILITY_LABELS } from '@/api/reports';
import { datasetsApi } from '@/api/datasets';
const router = useRouter();
function visibilityTagType(v) {
    return v === 'public' ? 'success' : v === 'scoped' ? 'warning' : 'info';
}
const list = ref([]);
const datasets = ref([]);
const loading = ref(false);
const pushing = ref(null);
const copying = ref(null);
const filterDataset = ref(null);
const filterKeyword = ref('');
async function load() {
    loading.value = true;
    try {
        list.value = await reportsApi.list({
            dataset_id: filterDataset.value || undefined,
            keyword: filterKeyword.value || undefined,
        });
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '加载失败');
    }
    finally {
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
    if (row) {
        router.push(`/report/designer/${row.id}`);
    }
    else {
        router.push('/report/designer/new');
    }
}
function openRun(row) {
    router.push(`/report/run/${row.id}`);
}
async function handlePush(row) {
    if (!row.can_edit || !row.active_push_target_count)
        return;
    pushing.value = row.id;
    try {
        const results = await reportsApi.push(row.id);
        const failed = results.filter((r) => !r.ok);
        if (failed.length) {
            ElMessage.error(`推送完成，但 ${failed.length} 个目标失败：${failed[0].message || failed[0].target_name}`);
        }
        else {
            const rows = results.reduce((sum, r) => sum + (r.rows || 0), 0);
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
        const r = await reportsApi.create({
            name: `${row.name} - 副本`,
            description: detail.description,
            dataset_id: detail.dataset_id,
            config: detail.config,
            visibility: 'private',
            scope_strategy: detail.scope_strategy,
            acl: [],
        });
        ElMessage.success('报表已复制');
        router.push(`/report/designer/${r.id}`);
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
        });
    }
    catch {
        return;
    }
    try {
        await reportsApi.remove(row.id);
        ElMessage.success('已删���');
        await load();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '删除失败');
    }
}
const filteredList = computed(() => list.value);
onMounted(async () => {
    await Promise.all([loadDatasets(), load()]);
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['report-name-link']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
const __VLS_0 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({}));
const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
{
    const { header: __VLS_thisSlot } = __VLS_3.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: {} },
    });
    (__VLS_ctx.filteredList.length);
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_4 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: "report.list",
        op: "C",
        type: "primary",
    }));
    const __VLS_5 = __VLS_4({
        ...{ 'onClick': {} },
        menu: "report.list",
        op: "C",
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_4));
    let __VLS_7;
    let __VLS_8;
    let __VLS_9;
    const __VLS_10 = {
        onClick: (...[$event]) => {
            __VLS_ctx.openDesigner();
        }
    };
    __VLS_6.slots.default;
    const __VLS_11 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_12 = __VLS_asFunctionalComponent(__VLS_11, new __VLS_11({
        ...{ style: {} },
    }));
    const __VLS_13 = __VLS_12({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_12));
    __VLS_14.slots.default;
    const __VLS_15 = {}.Plus;
    /** @type {[typeof __VLS_components.Plus, ]} */ ;
    // @ts-ignore
    const __VLS_16 = __VLS_asFunctionalComponent(__VLS_15, new __VLS_15({}));
    const __VLS_17 = __VLS_16({}, ...__VLS_functionalComponentArgsRest(__VLS_16));
    var __VLS_14;
    var __VLS_6;
}
const __VLS_19 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_20 = __VLS_asFunctionalComponent(__VLS_19, new __VLS_19({
    inline: true,
    ...{ style: {} },
}));
const __VLS_21 = __VLS_20({
    inline: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_20));
__VLS_22.slots.default;
const __VLS_23 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_24 = __VLS_asFunctionalComponent(__VLS_23, new __VLS_23({
    label: "数据集",
}));
const __VLS_25 = __VLS_24({
    label: "数据集",
}, ...__VLS_functionalComponentArgsRest(__VLS_24));
__VLS_26.slots.default;
const __VLS_27 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_28 = __VLS_asFunctionalComponent(__VLS_27, new __VLS_27({
    ...{ 'onChange': {} },
    ...{ 'onClear': {} },
    modelValue: (__VLS_ctx.filterDataset),
    placeholder: "全部",
    clearable: true,
    ...{ style: {} },
}));
const __VLS_29 = __VLS_28({
    ...{ 'onChange': {} },
    ...{ 'onClear': {} },
    modelValue: (__VLS_ctx.filterDataset),
    placeholder: "全部",
    clearable: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_28));
let __VLS_31;
let __VLS_32;
let __VLS_33;
const __VLS_34 = {
    onChange: (__VLS_ctx.load)
};
const __VLS_35 = {
    onClear: (__VLS_ctx.load)
};
__VLS_30.slots.default;
for (const [ds] of __VLS_getVForSourceType((__VLS_ctx.datasets))) {
    const __VLS_36 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
        key: (ds.id),
        label: (ds.name),
        value: (ds.id),
    }));
    const __VLS_38 = __VLS_37({
        key: (ds.id),
        label: (ds.name),
        value: (ds.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_37));
}
var __VLS_30;
var __VLS_26;
const __VLS_40 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
    label: "名称",
}));
const __VLS_42 = __VLS_41({
    label: "名称",
}, ...__VLS_functionalComponentArgsRest(__VLS_41));
__VLS_43.slots.default;
const __VLS_44 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
    ...{ 'onKeyup': {} },
    ...{ 'onClear': {} },
    modelValue: (__VLS_ctx.filterKeyword),
    placeholder: "按报表名搜索",
    clearable: true,
    ...{ style: {} },
}));
const __VLS_46 = __VLS_45({
    ...{ 'onKeyup': {} },
    ...{ 'onClear': {} },
    modelValue: (__VLS_ctx.filterKeyword),
    placeholder: "按报表名搜索",
    clearable: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_45));
let __VLS_48;
let __VLS_49;
let __VLS_50;
const __VLS_51 = {
    onKeyup: (__VLS_ctx.load)
};
const __VLS_52 = {
    onClear: (__VLS_ctx.load)
};
var __VLS_47;
var __VLS_43;
const __VLS_53 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_54 = __VLS_asFunctionalComponent(__VLS_53, new __VLS_53({}));
const __VLS_55 = __VLS_54({}, ...__VLS_functionalComponentArgsRest(__VLS_54));
__VLS_56.slots.default;
const __VLS_57 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_58 = __VLS_asFunctionalComponent(__VLS_57, new __VLS_57({
    ...{ 'onClick': {} },
}));
const __VLS_59 = __VLS_58({
    ...{ 'onClick': {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_58));
let __VLS_61;
let __VLS_62;
let __VLS_63;
const __VLS_64 = {
    onClick: (__VLS_ctx.load)
};
__VLS_60.slots.default;
var __VLS_60;
var __VLS_56;
var __VLS_22;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
const __VLS_65 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_66 = __VLS_asFunctionalComponent(__VLS_65, new __VLS_65({
    data: (__VLS_ctx.filteredList),
    stripe: true,
    ...{ style: {} },
    maxHeight: "600",
}));
const __VLS_67 = __VLS_66({
    data: (__VLS_ctx.filteredList),
    stripe: true,
    ...{ style: {} },
    maxHeight: "600",
}, ...__VLS_functionalComponentArgsRest(__VLS_66));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_68.slots.default;
const __VLS_69 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_70 = __VLS_asFunctionalComponent(__VLS_69, new __VLS_69({
    label: "报表名",
    minWidth: "220",
}));
const __VLS_71 = __VLS_70({
    label: "报表名",
    minWidth: "220",
}, ...__VLS_functionalComponentArgsRest(__VLS_70));
__VLS_72.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_72.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.openRun(row);
            } },
        ...{ class: "report-name-link" },
        type: "button",
    });
    (row.name);
    const __VLS_73 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_74 = __VLS_asFunctionalComponent(__VLS_73, new __VLS_73({
        type: (__VLS_ctx.visibilityTagType(row.visibility)),
        size: "small",
        ...{ style: {} },
    }));
    const __VLS_75 = __VLS_74({
        type: (__VLS_ctx.visibilityTagType(row.visibility)),
        size: "small",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_74));
    __VLS_76.slots.default;
    (__VLS_ctx.REPORT_VISIBILITY_LABELS[row.visibility]);
    var __VLS_76;
    if (row.description) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        (row.description);
    }
}
var __VLS_72;
const __VLS_77 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_78 = __VLS_asFunctionalComponent(__VLS_77, new __VLS_77({
    label: "数据来源",
    minWidth: "200",
}));
const __VLS_79 = __VLS_78({
    label: "数据来源",
    minWidth: "200",
}, ...__VLS_functionalComponentArgsRest(__VLS_78));
__VLS_80.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_80.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    const __VLS_81 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_82 = __VLS_asFunctionalComponent(__VLS_81, new __VLS_81({
        size: "small",
        type: "warning",
        effect: "plain",
    }));
    const __VLS_83 = __VLS_82({
        size: "small",
        type: "warning",
        effect: "plain",
    }, ...__VLS_functionalComponentArgsRest(__VLS_82));
    __VLS_84.slots.default;
    var __VLS_84;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({
        ...{ style: {} },
    });
    (row.dataset_name || `#${row.dataset_id}`);
}
var __VLS_80;
const __VLS_85 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_86 = __VLS_asFunctionalComponent(__VLS_85, new __VLS_85({
    label: "所有者",
    width: "120",
}));
const __VLS_87 = __VLS_86({
    label: "所有者",
    width: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_86));
__VLS_88.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_88.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (row.owner_name || '—');
}
var __VLS_88;
const __VLS_89 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_90 = __VLS_asFunctionalComponent(__VLS_89, new __VLS_89({
    label: "运行次数",
    width: "100",
}));
const __VLS_91 = __VLS_90({
    label: "运行次数",
    width: "100",
}, ...__VLS_functionalComponentArgsRest(__VLS_90));
__VLS_92.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_92.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (row.run_count);
}
var __VLS_92;
const __VLS_93 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_94 = __VLS_asFunctionalComponent(__VLS_93, new __VLS_93({
    label: "上次运行",
    minWidth: "180",
}));
const __VLS_95 = __VLS_94({
    label: "上次运行",
    minWidth: "180",
}, ...__VLS_functionalComponentArgsRest(__VLS_94));
__VLS_96.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_96.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    if (row.last_run_at) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.formatDateTime(row.last_run_at));
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
    }
}
var __VLS_96;
const __VLS_97 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_98 = __VLS_asFunctionalComponent(__VLS_97, new __VLS_97({
    label: "更新时间",
    minWidth: "180",
}));
const __VLS_99 = __VLS_98({
    label: "更新时间",
    minWidth: "180",
}, ...__VLS_functionalComponentArgsRest(__VLS_98));
__VLS_100.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_100.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (__VLS_ctx.formatDateTime(row.updated_at));
}
var __VLS_100;
const __VLS_101 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_102 = __VLS_asFunctionalComponent(__VLS_101, new __VLS_101({
    label: "操作",
    width: "420",
    fixed: "right",
}));
const __VLS_103 = __VLS_102({
    label: "操作",
    width: "420",
    fixed: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_102));
__VLS_104.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_104.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_105 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: "report.list",
        op: "V",
        size: "small",
    }));
    const __VLS_106 = __VLS_105({
        ...{ 'onClick': {} },
        menu: "report.list",
        op: "V",
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_105));
    let __VLS_108;
    let __VLS_109;
    let __VLS_110;
    const __VLS_111 = {
        onClick: (...[$event]) => {
            __VLS_ctx.openRun(row);
        }
    };
    __VLS_107.slots.default;
    const __VLS_112 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
        ...{ style: {} },
    }));
    const __VLS_114 = __VLS_113({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_113));
    __VLS_115.slots.default;
    const __VLS_116 = {}.View;
    /** @type {[typeof __VLS_components.View, ]} */ ;
    // @ts-ignore
    const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({}));
    const __VLS_118 = __VLS_117({}, ...__VLS_functionalComponentArgsRest(__VLS_117));
    var __VLS_115;
    var __VLS_107;
    if (row.can_edit) {
        /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
        // @ts-ignore
        const __VLS_120 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
            ...{ 'onClick': {} },
            menu: "report.list",
            op: "U",
            size: "small",
        }));
        const __VLS_121 = __VLS_120({
            ...{ 'onClick': {} },
            menu: "report.list",
            op: "U",
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_120));
        let __VLS_123;
        let __VLS_124;
        let __VLS_125;
        const __VLS_126 = {
            onClick: (...[$event]) => {
                if (!(row.can_edit))
                    return;
                __VLS_ctx.openDesigner(row);
            }
        };
        __VLS_122.slots.default;
        const __VLS_127 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_128 = __VLS_asFunctionalComponent(__VLS_127, new __VLS_127({
            ...{ style: {} },
        }));
        const __VLS_129 = __VLS_128({
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_128));
        __VLS_130.slots.default;
        const __VLS_131 = {}.Edit;
        /** @type {[typeof __VLS_components.Edit, ]} */ ;
        // @ts-ignore
        const __VLS_132 = __VLS_asFunctionalComponent(__VLS_131, new __VLS_131({}));
        const __VLS_133 = __VLS_132({}, ...__VLS_functionalComponentArgsRest(__VLS_132));
        var __VLS_130;
        var __VLS_122;
    }
    else {
        /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
        // @ts-ignore
        const __VLS_135 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
            ...{ 'onClick': {} },
            menu: "report.list",
            op: "C",
            size: "small",
        }));
        const __VLS_136 = __VLS_135({
            ...{ 'onClick': {} },
            menu: "report.list",
            op: "C",
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_135));
        let __VLS_138;
        let __VLS_139;
        let __VLS_140;
        const __VLS_141 = {
            onClick: (...[$event]) => {
                if (!!(row.can_edit))
                    return;
                __VLS_ctx.openDesigner(row);
            }
        };
        __VLS_137.slots.default;
        const __VLS_142 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_143 = __VLS_asFunctionalComponent(__VLS_142, new __VLS_142({
            ...{ style: {} },
        }));
        const __VLS_144 = __VLS_143({
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_143));
        __VLS_145.slots.default;
        const __VLS_146 = {}.Edit;
        /** @type {[typeof __VLS_components.Edit, ]} */ ;
        // @ts-ignore
        const __VLS_147 = __VLS_asFunctionalComponent(__VLS_146, new __VLS_146({}));
        const __VLS_148 = __VLS_147({}, ...__VLS_functionalComponentArgsRest(__VLS_147));
        var __VLS_145;
        var __VLS_137;
    }
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_150 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: "report.list",
        op: "C",
        size: "small",
        loading: (__VLS_ctx.copying === row.id),
    }));
    const __VLS_151 = __VLS_150({
        ...{ 'onClick': {} },
        menu: "report.list",
        op: "C",
        size: "small",
        loading: (__VLS_ctx.copying === row.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_150));
    let __VLS_153;
    let __VLS_154;
    let __VLS_155;
    const __VLS_156 = {
        onClick: (...[$event]) => {
            __VLS_ctx.handleCopy(row);
        }
    };
    __VLS_152.slots.default;
    const __VLS_157 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_158 = __VLS_asFunctionalComponent(__VLS_157, new __VLS_157({
        ...{ style: {} },
    }));
    const __VLS_159 = __VLS_158({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_158));
    __VLS_160.slots.default;
    const __VLS_161 = {}.CopyDocument;
    /** @type {[typeof __VLS_components.CopyDocument, ]} */ ;
    // @ts-ignore
    const __VLS_162 = __VLS_asFunctionalComponent(__VLS_161, new __VLS_161({}));
    const __VLS_163 = __VLS_162({}, ...__VLS_functionalComponentArgsRest(__VLS_162));
    var __VLS_160;
    var __VLS_152;
    if (row.can_edit && row.active_push_target_count) {
        /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
        // @ts-ignore
        const __VLS_165 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
            ...{ 'onClick': {} },
            menu: "report.list",
            op: "C",
            size: "small",
            type: "success",
            loading: (__VLS_ctx.pushing === row.id),
        }));
        const __VLS_166 = __VLS_165({
            ...{ 'onClick': {} },
            menu: "report.list",
            op: "C",
            size: "small",
            type: "success",
            loading: (__VLS_ctx.pushing === row.id),
        }, ...__VLS_functionalComponentArgsRest(__VLS_165));
        let __VLS_168;
        let __VLS_169;
        let __VLS_170;
        const __VLS_171 = {
            onClick: (...[$event]) => {
                if (!(row.can_edit && row.active_push_target_count))
                    return;
                __VLS_ctx.handlePush(row);
            }
        };
        __VLS_167.slots.default;
        const __VLS_172 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_173 = __VLS_asFunctionalComponent(__VLS_172, new __VLS_172({
            ...{ style: {} },
        }));
        const __VLS_174 = __VLS_173({
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_173));
        __VLS_175.slots.default;
        const __VLS_176 = {}.Position;
        /** @type {[typeof __VLS_components.Position, ]} */ ;
        // @ts-ignore
        const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({}));
        const __VLS_178 = __VLS_177({}, ...__VLS_functionalComponentArgsRest(__VLS_177));
        var __VLS_175;
        var __VLS_167;
    }
    if (row.can_edit) {
        /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
        // @ts-ignore
        const __VLS_180 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
            ...{ 'onClick': {} },
            menu: "report.list",
            op: "D",
            size: "small",
            type: "danger",
        }));
        const __VLS_181 = __VLS_180({
            ...{ 'onClick': {} },
            menu: "report.list",
            op: "D",
            size: "small",
            type: "danger",
        }, ...__VLS_functionalComponentArgsRest(__VLS_180));
        let __VLS_183;
        let __VLS_184;
        let __VLS_185;
        const __VLS_186 = {
            onClick: (...[$event]) => {
                if (!(row.can_edit))
                    return;
                __VLS_ctx.handleDelete(row);
            }
        };
        __VLS_182.slots.default;
        const __VLS_187 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_188 = __VLS_asFunctionalComponent(__VLS_187, new __VLS_187({
            ...{ style: {} },
        }));
        const __VLS_189 = __VLS_188({
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_188));
        __VLS_190.slots.default;
        const __VLS_191 = {}.Delete;
        /** @type {[typeof __VLS_components.Delete, ]} */ ;
        // @ts-ignore
        const __VLS_192 = __VLS_asFunctionalComponent(__VLS_191, new __VLS_191({}));
        const __VLS_193 = __VLS_192({}, ...__VLS_functionalComponentArgsRest(__VLS_192));
        var __VLS_190;
        var __VLS_182;
    }
}
var __VLS_104;
{
    const { empty: __VLS_thisSlot } = __VLS_68.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_195 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_196 = __VLS_asFunctionalComponent(__VLS_195, new __VLS_195({
        ...{ style: {} },
    }));
    const __VLS_197 = __VLS_196({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_196));
    __VLS_198.slots.default;
    const __VLS_199 = {}.Document;
    /** @type {[typeof __VLS_components.Document, ]} */ ;
    // @ts-ignore
    const __VLS_200 = __VLS_asFunctionalComponent(__VLS_199, new __VLS_199({}));
    const __VLS_201 = __VLS_200({}, ...__VLS_functionalComponentArgsRest(__VLS_200));
    var __VLS_198;
}
var __VLS_68;
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['report-name-link']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Plus: Plus,
            Document: Document,
            Edit: Edit,
            Delete: Delete,
            View: View,
            Position: Position,
            CopyDocument: CopyDocument,
            PermissionButton: PermissionButton,
            formatDateTime: formatDateTime,
            REPORT_VISIBILITY_LABELS: REPORT_VISIBILITY_LABELS,
            visibilityTagType: visibilityTagType,
            datasets: datasets,
            loading: loading,
            pushing: pushing,
            copying: copying,
            filterDataset: filterDataset,
            filterKeyword: filterKeyword,
            load: load,
            openDesigner: openDesigner,
            openRun: openRun,
            handlePush: handlePush,
            handleCopy: handleCopy,
            handleDelete: handleDelete,
            filteredList: filteredList,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
