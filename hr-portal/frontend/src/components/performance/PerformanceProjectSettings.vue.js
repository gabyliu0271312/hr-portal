/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, ref } from 'vue';
import { ElTableColumn } from 'element-plus';
import PerformancePermissionButton from './PerformancePermissionButton.vue';
import PerformanceListToolbar from './PerformanceListToolbar.vue';
import PerformanceManagementTable from './PerformanceManagementTable.vue';
import PerformanceProjectActions from './PerformanceProjectActions.vue';
const props = withDefaults(defineProps(), {
    projects: () => [],
    projectCount: 0,
    canCreate: false,
    managedProjectRefs: () => [],
});
const emit = defineEmits();
const keyword = ref('');
const filterOpen = ref(false);
const rows = computed(() => props.projects);
const filteredRows = computed(() => {
    const value = keyword.value.trim().toLowerCase();
    return rows.value.filter(project => !value || project.name.toLowerCase().includes(value));
});
const total = computed(() => props.projectCount || filteredRows.value.length);
function canManage(project) {
    return props.canCreate || props.managedProjectRefs.includes(project.project_ref);
}
function projectRow(row) {
    return row;
}
function statusLabel(status) {
    return { DRAFT: '待完成配置', STARTED: '进行中', ARCHIVED: '已归档' }[status] || status;
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    projects: () => [],
    projectCount: 0,
    canCreate: false,
    managedProjectRefs: () => [],
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['project-tools']} */ ;
/** @type {__VLS_StyleScopedClasses['project-tools']} */ ;
/** @type {__VLS_StyleScopedClasses['project-create']} */ ;
/** @type {__VLS_StyleScopedClasses['project-table-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['project-table-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['project-status']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "project-settings" },
    'aria-labelledby': "project-settings-title",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "project-heading" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
    id: "project-settings-title",
});
/** @type {[typeof PerformanceListToolbar, typeof PerformanceListToolbar, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(PerformanceListToolbar, new PerformanceListToolbar({
    ...{ 'onUpdate:keyword': {} },
    ...{ 'onFilter': {} },
    ...{ class: "project-tools" },
    keyword: (__VLS_ctx.keyword),
    searchPlaceholder: "通过项目名称搜索",
}));
const __VLS_1 = __VLS_0({
    ...{ 'onUpdate:keyword': {} },
    ...{ 'onFilter': {} },
    ...{ class: "project-tools" },
    keyword: (__VLS_ctx.keyword),
    searchPlaceholder: "通过项目名称搜索",
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
let __VLS_3;
let __VLS_4;
let __VLS_5;
const __VLS_6 = {
    'onUpdate:keyword': (...[$event]) => {
        __VLS_ctx.keyword = $event;
    }
};
const __VLS_7 = {
    onFilter: (...[$event]) => {
        __VLS_ctx.filterOpen = !__VLS_ctx.filterOpen;
    }
};
__VLS_2.slots.default;
{
    const { left: __VLS_thisSlot } = __VLS_2.slots;
    /** @type {[typeof PerformancePermissionButton, typeof PerformancePermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_8 = __VLS_asFunctionalComponent(PerformancePermissionButton, new PerformancePermissionButton({
        ...{ 'onClick': {} },
        op: "C",
        allowed: (__VLS_ctx.canCreate),
        ...{ class: "project-create primary-button" },
        'aria-label': "新建项目",
    }));
    const __VLS_9 = __VLS_8({
        ...{ 'onClick': {} },
        op: "C",
        allowed: (__VLS_ctx.canCreate),
        ...{ class: "project-create primary-button" },
        'aria-label': "新建项目",
    }, ...__VLS_functionalComponentArgsRest(__VLS_8));
    let __VLS_11;
    let __VLS_12;
    let __VLS_13;
    const __VLS_14 = {
        onClick: (...[$event]) => {
            __VLS_ctx.emit('create');
        }
    };
    __VLS_10.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        'aria-hidden': "true",
    });
    var __VLS_10;
}
var __VLS_2;
if (__VLS_ctx.filterOpen) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "project-filter-panel" },
        role: "status",
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "project-table-wrap" },
});
/** @type {[typeof PerformanceManagementTable, typeof PerformanceManagementTable, ]} */ ;
// @ts-ignore
const __VLS_15 = __VLS_asFunctionalComponent(PerformanceManagementTable, new PerformanceManagementTable({
    rows: (__VLS_ctx.filteredRows),
    loading: (false),
    loadingText: "正在加载项目...",
    emptyText: "暂无项目",
    tableAriaLabel: "项目设置表格",
    paginationAriaLabel: "项目分页",
    total: (__VLS_ctx.total),
}));
const __VLS_16 = __VLS_15({
    rows: (__VLS_ctx.filteredRows),
    loading: (false),
    loadingText: "正在加载项目...",
    emptyText: "暂无项目",
    tableAriaLabel: "项目设置表格",
    paginationAriaLabel: "项目分页",
    total: (__VLS_ctx.total),
}, ...__VLS_functionalComponentArgsRest(__VLS_15));
__VLS_17.slots.default;
const __VLS_18 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_19 = __VLS_asFunctionalComponent(__VLS_18, new __VLS_18({
    prop: "name",
    label: "项目名称",
    minWidth: "220",
}));
const __VLS_20 = __VLS_19({
    prop: "name",
    label: "项目名称",
    minWidth: "220",
}, ...__VLS_functionalComponentArgsRest(__VLS_19));
const __VLS_22 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_23 = __VLS_asFunctionalComponent(__VLS_22, new __VLS_22({
    prop: "description",
    label: "描述",
    minWidth: "260",
}));
const __VLS_24 = __VLS_23({
    prop: "description",
    label: "描述",
    minWidth: "260",
}, ...__VLS_functionalComponentArgsRest(__VLS_23));
__VLS_25.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_25.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (row.description || '--');
}
var __VLS_25;
const __VLS_26 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_27 = __VLS_asFunctionalComponent(__VLS_26, new __VLS_26({
    label: "项目管理员",
    minWidth: "180",
}));
const __VLS_28 = __VLS_27({
    label: "项目管理员",
    minWidth: "180",
}, ...__VLS_functionalComponentArgsRest(__VLS_27));
__VLS_29.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_29.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (row.administrators.join('、') || '--');
}
var __VLS_29;
const __VLS_30 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_31 = __VLS_asFunctionalComponent(__VLS_30, new __VLS_30({
    label: "状态",
    minWidth: "150",
}));
const __VLS_32 = __VLS_31({
    label: "状态",
    minWidth: "150",
}, ...__VLS_functionalComponentArgsRest(__VLS_31));
__VLS_33.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_33.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "project-status" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.i)({});
    (__VLS_ctx.statusLabel(row.status));
}
var __VLS_33;
const __VLS_34 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_35 = __VLS_asFunctionalComponent(__VLS_34, new __VLS_34({
    prop: "evaluated_count",
    label: "评估人数",
    minWidth: "120",
}));
const __VLS_36 = __VLS_35({
    prop: "evaluated_count",
    label: "评估人数",
    minWidth: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_35));
const __VLS_38 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_39 = __VLS_asFunctionalComponent(__VLS_38, new __VLS_38({
    label: "操作",
    width: "181",
    fixed: "right",
    className: "fixed-operation",
}));
const __VLS_40 = __VLS_39({
    label: "操作",
    width: "181",
    fixed: "right",
    className: "fixed-operation",
}, ...__VLS_functionalComponentArgsRest(__VLS_39));
__VLS_41.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_41.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    /** @type {[typeof PerformanceProjectActions, ]} */ ;
    // @ts-ignore
    const __VLS_42 = __VLS_asFunctionalComponent(PerformanceProjectActions, new PerformanceProjectActions({
        ...{ 'onEdit': {} },
        ...{ 'onStart': {} },
        ...{ 'onCopy': {} },
        ...{ 'onRemove': {} },
        canManage: (__VLS_ctx.canManage(__VLS_ctx.projectRow(row))),
        started: (__VLS_ctx.projectRow(row).status === 'STARTED'),
        projectName: (__VLS_ctx.projectRow(row).name),
    }));
    const __VLS_43 = __VLS_42({
        ...{ 'onEdit': {} },
        ...{ 'onStart': {} },
        ...{ 'onCopy': {} },
        ...{ 'onRemove': {} },
        canManage: (__VLS_ctx.canManage(__VLS_ctx.projectRow(row))),
        started: (__VLS_ctx.projectRow(row).status === 'STARTED'),
        projectName: (__VLS_ctx.projectRow(row).name),
    }, ...__VLS_functionalComponentArgsRest(__VLS_42));
    let __VLS_45;
    let __VLS_46;
    let __VLS_47;
    const __VLS_48 = {
        onEdit: (...[$event]) => {
            __VLS_ctx.emit('edit', __VLS_ctx.projectRow(row));
        }
    };
    const __VLS_49 = {
        onStart: (...[$event]) => {
            __VLS_ctx.emit('start', __VLS_ctx.projectRow(row));
        }
    };
    const __VLS_50 = {
        onCopy: (...[$event]) => {
            __VLS_ctx.emit('copy', __VLS_ctx.projectRow(row));
        }
    };
    const __VLS_51 = {
        onRemove: (...[$event]) => {
            __VLS_ctx.emit('remove', __VLS_ctx.projectRow(row));
        }
    };
    var __VLS_44;
}
var __VLS_41;
var __VLS_17;
/** @type {__VLS_StyleScopedClasses['project-settings']} */ ;
/** @type {__VLS_StyleScopedClasses['project-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['project-tools']} */ ;
/** @type {__VLS_StyleScopedClasses['project-create']} */ ;
/** @type {__VLS_StyleScopedClasses['primary-button']} */ ;
/** @type {__VLS_StyleScopedClasses['project-filter-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['project-table-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['project-status']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ElTableColumn: ElTableColumn,
            PerformancePermissionButton: PerformancePermissionButton,
            PerformanceListToolbar: PerformanceListToolbar,
            PerformanceManagementTable: PerformanceManagementTable,
            PerformanceProjectActions: PerformanceProjectActions,
            emit: emit,
            keyword: keyword,
            filterOpen: filterOpen,
            filteredRows: filteredRows,
            total: total,
            canManage: canManage,
            projectRow: projectRow,
            statusLabel: statusLabel,
        };
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
; /* PartiallyEnd: #4569/main.vue */
