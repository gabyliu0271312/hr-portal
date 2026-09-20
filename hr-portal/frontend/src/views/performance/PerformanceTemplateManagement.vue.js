/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { performanceTemplateApi } from '@/api/performance';
import PerformanceConfirmDialog from '@/components/performance/PerformanceConfirmDialog.vue';
import PerformanceListPage from '@/components/performance/PerformanceListPage.vue';
import PerformanceListToolbar from '@/components/performance/PerformanceListToolbar.vue';
import { ArrowDown, ArrowLeftBold, ArrowRightBold, MoreFilled, Plus } from '@element-plus/icons-vue';
const keyword = ref('');
const loading = ref(false);
const notice = ref('');
const deleteDialogVisible = ref(false);
const deleting = ref(false);
const pendingDeleteTemplate = ref(null);
const router = useRouter();
const seedTemplates = [
    { name: '11', description: '--', status: 'inactive', createdAt: '2026-08-07 13:10' },
    { name: '半年度绩效评估（2026模板）', description: '半年度评估-360自愿评估-无投入度价值观', status: 'active', createdAt: '2026-06-22 15:05' },
    { name: '全年度绩效评估', description: '全年度评估-360自愿评估', status: 'active', createdAt: '2023-12-12 16:08' },
    { name: '半年度绩效评估', description: '半年度评估-360自愿评估', status: 'active', createdAt: '2023-06-15 17:31' },
    { name: '2022年全年度绩效评估', description: '创梦总部-2022年度评估', status: 'active', createdAt: '2022-12-06 17:50' },
    { name: '2022年半年度绩效评估', description: '创梦总部-2022半年度评估', status: 'active', createdAt: '2022-06-13 15:00' },
    { name: '2021年下半年度绩效评估', description: '--', status: 'active', createdAt: '2021-11-29 11:12' },
];
const templates = ref([...seedTemplates]);
const filteredTemplates = computed(() => {
    const normalizedKeyword = keyword.value.trim().toLowerCase();
    return templates.value.filter((template) => !normalizedKeyword || `${template.name} ${template.description}`.toLowerCase().includes(normalizedKeyword));
});
function templateRowKey(template) {
    return template.templateId || template.name;
}
function openCreatePage() {
    void router.push({ name: 'PerformanceTemplateCreate' });
}
function openEditPage(template) {
    if (!template.templateId) {
        notice.value = '该行是接口不可用时的参考数据，无法编辑。';
        return;
    }
    void router.push({
        name: 'PerformanceTemplateCreate',
        query: { template_id: String(template.templateId) },
    });
}
async function handleTemplateAction(action, template) {
    if (action === '启用' || action === '停用') {
        if (!template.templateId) {
            notice.value = '该模板缺少真实 ID，无法更新状态。';
            return;
        }
        try {
            const updated = await performanceTemplateApi.updateStatus(template.templateId, action === '启用' ? 'active' : 'inactive');
            template.status = updated.status;
            notice.value = action === '启用' ? '模板已启用' : '模板已停用';
        }
        catch (error) {
            notice.value = error?.response?.data?.detail || '模板状态更新失败，请稍后重试';
        }
        return;
    }
    if (action !== '删除') {
        showComingSoon(`${action}模板：${template.name}`);
        return;
    }
    if (!template.templateId) {
        notice.value = '该行是接口不可用时的参考数据，无法删除。';
        return;
    }
    pendingDeleteTemplate.value = template;
    deleteDialogVisible.value = true;
}
async function confirmDelete() {
    const template = pendingDeleteTemplate.value;
    if (!template?.templateId || deleting.value)
        return;
    deleting.value = true;
    try {
        await performanceTemplateApi.remove(template.templateId);
        templates.value = templates.value.filter(item => item.templateId !== template.templateId);
        deleteDialogVisible.value = false;
        pendingDeleteTemplate.value = null;
        await loadTemplates();
        notice.value = '模板已删除';
    }
    catch (error) {
        notice.value = error?.response?.data?.detail || '模板删除失败，请稍后重试';
    }
    finally {
        deleting.value = false;
    }
}
function showComingSoon(action) {
    notice.value = `${action}功能将在后续模板配置阶段开放，当前仅展示列表原型。`;
}
async function loadTemplates() {
    try {
        const persisted = await performanceTemplateApi.list();
        const persistedRows = persisted.map((template) => ({
            templateId: template.template_id,
            name: template.name,
            description: template.description || '--',
            status: template.status,
            createdAt: template.created_at ? new Date(template.created_at).toLocaleString('zh-CN', { hour12: false }).replaceAll('/', '-') : '--',
        }));
        templates.value = persistedRows;
    }
    catch {
        // Keep the reference rows visible when the list API is temporarily unavailable.
    }
    finally {
        loading.value = false;
    }
}
onMounted(loadTemplates);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['status-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['status-active']} */ ;
/** @type {__VLS_StyleScopedClasses['row-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['row-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['template-action-menu']} */ ;
/** @type {__VLS_StyleScopedClasses['template-action-menu']} */ ;
/** @type {__VLS_StyleScopedClasses['el-dropdown-menu__item']} */ ;
/** @type {__VLS_StyleScopedClasses['template-pagination']} */ ;
/** @type {__VLS_StyleScopedClasses['el-button']} */ ;
// CSS variable injection 
// CSS variable injection end 
/** @type {[typeof PerformanceListPage, typeof PerformanceListPage, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(PerformanceListPage, new PerformanceListPage({
    title: "绩效模板",
}));
const __VLS_1 = __VLS_0({
    title: "绩效模板",
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
var __VLS_3 = {};
__VLS_2.slots.default;
/** @type {[typeof PerformanceListToolbar, typeof PerformanceListToolbar, ]} */ ;
// @ts-ignore
const __VLS_4 = __VLS_asFunctionalComponent(PerformanceListToolbar, new PerformanceListToolbar({
    ...{ 'onFilter': {} },
    keyword: (__VLS_ctx.keyword),
}));
const __VLS_5 = __VLS_4({
    ...{ 'onFilter': {} },
    keyword: (__VLS_ctx.keyword),
}, ...__VLS_functionalComponentArgsRest(__VLS_4));
let __VLS_7;
let __VLS_8;
let __VLS_9;
const __VLS_10 = {
    onFilter: (...[$event]) => {
        __VLS_ctx.showComingSoon('筛选');
    }
};
__VLS_6.slots.default;
{
    const { left: __VLS_thisSlot } = __VLS_6.slots;
    const __VLS_11 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_12 = __VLS_asFunctionalComponent(__VLS_11, new __VLS_11({
        ...{ 'onClick': {} },
        ...{ class: "create-button" },
        type: "primary",
    }));
    const __VLS_13 = __VLS_12({
        ...{ 'onClick': {} },
        ...{ class: "create-button" },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_12));
    let __VLS_15;
    let __VLS_16;
    let __VLS_17;
    const __VLS_18 = {
        onClick: (__VLS_ctx.openCreatePage)
    };
    __VLS_14.slots.default;
    const __VLS_19 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_20 = __VLS_asFunctionalComponent(__VLS_19, new __VLS_19({}));
    const __VLS_21 = __VLS_20({}, ...__VLS_functionalComponentArgsRest(__VLS_20));
    __VLS_22.slots.default;
    const __VLS_23 = {}.Plus;
    /** @type {[typeof __VLS_components.Plus, ]} */ ;
    // @ts-ignore
    const __VLS_24 = __VLS_asFunctionalComponent(__VLS_23, new __VLS_23({}));
    const __VLS_25 = __VLS_24({}, ...__VLS_functionalComponentArgsRest(__VLS_24));
    var __VLS_22;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    var __VLS_14;
}
var __VLS_6;
if (__VLS_ctx.loading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "template-loading" },
        role: "status",
    });
}
else if (__VLS_ctx.filteredTemplates.length === 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "template-empty" },
    });
    const __VLS_27 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_28 = __VLS_asFunctionalComponent(__VLS_27, new __VLS_27({
        description: (__VLS_ctx.keyword ? '没有找到匹配的绩效模板' : '暂无绩效模板'),
    }));
    const __VLS_29 = __VLS_28({
        description: (__VLS_ctx.keyword ? '没有找到匹配的绩效模板' : '暂无绩效模板'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_28));
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "template-table-wrap" },
    });
    const __VLS_31 = {}.ElTable;
    /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
    // @ts-ignore
    const __VLS_32 = __VLS_asFunctionalComponent(__VLS_31, new __VLS_31({
        data: (__VLS_ctx.filteredTemplates),
        stripe: true,
        ...{ style: {} },
        maxHeight: "600",
        rowKey: (__VLS_ctx.templateRowKey),
    }));
    const __VLS_33 = __VLS_32({
        data: (__VLS_ctx.filteredTemplates),
        stripe: true,
        ...{ style: {} },
        maxHeight: "600",
        rowKey: (__VLS_ctx.templateRowKey),
    }, ...__VLS_functionalComponentArgsRest(__VLS_32));
    __VLS_34.slots.default;
    const __VLS_35 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_36 = __VLS_asFunctionalComponent(__VLS_35, new __VLS_35({
        prop: "name",
        label: "名称",
        minWidth: "220",
    }));
    const __VLS_37 = __VLS_36({
        prop: "name",
        label: "名称",
        minWidth: "220",
    }, ...__VLS_functionalComponentArgsRest(__VLS_36));
    const __VLS_39 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_40 = __VLS_asFunctionalComponent(__VLS_39, new __VLS_39({
        prop: "description",
        label: "描述",
        minWidth: "300",
        showOverflowTooltip: true,
    }));
    const __VLS_41 = __VLS_40({
        prop: "description",
        label: "描述",
        minWidth: "300",
        showOverflowTooltip: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_40));
    const __VLS_43 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_44 = __VLS_asFunctionalComponent(__VLS_43, new __VLS_43({
        label: "状态",
        minWidth: "130",
    }));
    const __VLS_45 = __VLS_44({
        label: "状态",
        minWidth: "130",
    }, ...__VLS_functionalComponentArgsRest(__VLS_44));
    __VLS_46.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_46.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "status-badge" },
            ...{ class: (`status-${row.status}`) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({
            'aria-hidden': "true",
        });
        (row.status === 'active' ? '已启用' : '待完成配置');
    }
    var __VLS_46;
    const __VLS_47 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_48 = __VLS_asFunctionalComponent(__VLS_47, new __VLS_47({
        prop: "createdAt",
        label: "创建时间",
        minWidth: "170",
    }));
    const __VLS_49 = __VLS_48({
        prop: "createdAt",
        label: "创建时间",
        minWidth: "170",
    }, ...__VLS_functionalComponentArgsRest(__VLS_48));
    const __VLS_51 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_52 = __VLS_asFunctionalComponent(__VLS_51, new __VLS_51({
        label: "操作",
        width: "190",
        fixed: "right",
    }));
    const __VLS_53 = __VLS_52({
        label: "操作",
        width: "190",
        fixed: "right",
    }, ...__VLS_functionalComponentArgsRest(__VLS_52));
    __VLS_54.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_54.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "row-actions" },
        });
        const __VLS_55 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_56 = __VLS_asFunctionalComponent(__VLS_55, new __VLS_55({
            ...{ 'onClick': {} },
            link: true,
            type: "primary",
        }));
        const __VLS_57 = __VLS_56({
            ...{ 'onClick': {} },
            link: true,
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_56));
        let __VLS_59;
        let __VLS_60;
        let __VLS_61;
        const __VLS_62 = {
            onClick: (...[$event]) => {
                if (!!(__VLS_ctx.loading))
                    return;
                if (!!(__VLS_ctx.filteredTemplates.length === 0))
                    return;
                __VLS_ctx.openEditPage(row);
            }
        };
        __VLS_58.slots.default;
        var __VLS_58;
        const __VLS_63 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_64 = __VLS_asFunctionalComponent(__VLS_63, new __VLS_63({
            ...{ 'onClick': {} },
            link: true,
            type: "primary",
        }));
        const __VLS_65 = __VLS_64({
            ...{ 'onClick': {} },
            link: true,
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_64));
        let __VLS_67;
        let __VLS_68;
        let __VLS_69;
        const __VLS_70 = {
            onClick: (...[$event]) => {
                if (!!(__VLS_ctx.loading))
                    return;
                if (!!(__VLS_ctx.filteredTemplates.length === 0))
                    return;
                __VLS_ctx.handleTemplateAction(row.status === 'active' ? '停用' : '启用', row);
            }
        };
        __VLS_66.slots.default;
        (row.status === 'active' ? '停用' : '启用');
        var __VLS_66;
        const __VLS_71 = {}.ElDropdown;
        /** @type {[typeof __VLS_components.ElDropdown, typeof __VLS_components.elDropdown, typeof __VLS_components.ElDropdown, typeof __VLS_components.elDropdown, ]} */ ;
        // @ts-ignore
        const __VLS_72 = __VLS_asFunctionalComponent(__VLS_71, new __VLS_71({
            ...{ 'onCommand': {} },
            trigger: "click",
        }));
        const __VLS_73 = __VLS_72({
            ...{ 'onCommand': {} },
            trigger: "click",
        }, ...__VLS_functionalComponentArgsRest(__VLS_72));
        let __VLS_75;
        let __VLS_76;
        let __VLS_77;
        const __VLS_78 = {
            onCommand: ((action) => __VLS_ctx.handleTemplateAction(action, row))
        };
        __VLS_74.slots.default;
        const __VLS_79 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_80 = __VLS_asFunctionalComponent(__VLS_79, new __VLS_79({
            ...{ class: "more-button" },
            link: true,
            'aria-label': "更多操作",
        }));
        const __VLS_81 = __VLS_80({
            ...{ class: "more-button" },
            link: true,
            'aria-label': "更多操作",
        }, ...__VLS_functionalComponentArgsRest(__VLS_80));
        __VLS_82.slots.default;
        const __VLS_83 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_84 = __VLS_asFunctionalComponent(__VLS_83, new __VLS_83({}));
        const __VLS_85 = __VLS_84({}, ...__VLS_functionalComponentArgsRest(__VLS_84));
        __VLS_86.slots.default;
        const __VLS_87 = {}.MoreFilled;
        /** @type {[typeof __VLS_components.MoreFilled, ]} */ ;
        // @ts-ignore
        const __VLS_88 = __VLS_asFunctionalComponent(__VLS_87, new __VLS_87({}));
        const __VLS_89 = __VLS_88({}, ...__VLS_functionalComponentArgsRest(__VLS_88));
        var __VLS_86;
        var __VLS_82;
        {
            const { dropdown: __VLS_thisSlot } = __VLS_74.slots;
            const __VLS_91 = {}.ElDropdownMenu;
            /** @type {[typeof __VLS_components.ElDropdownMenu, typeof __VLS_components.elDropdownMenu, typeof __VLS_components.ElDropdownMenu, typeof __VLS_components.elDropdownMenu, ]} */ ;
            // @ts-ignore
            const __VLS_92 = __VLS_asFunctionalComponent(__VLS_91, new __VLS_91({
                ...{ class: "template-action-menu" },
            }));
            const __VLS_93 = __VLS_92({
                ...{ class: "template-action-menu" },
            }, ...__VLS_functionalComponentArgsRest(__VLS_92));
            __VLS_94.slots.default;
            const __VLS_95 = {}.ElDropdownItem;
            /** @type {[typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, ]} */ ;
            // @ts-ignore
            const __VLS_96 = __VLS_asFunctionalComponent(__VLS_95, new __VLS_95({
                command: "复制",
            }));
            const __VLS_97 = __VLS_96({
                command: "复制",
            }, ...__VLS_functionalComponentArgsRest(__VLS_96));
            __VLS_98.slots.default;
            var __VLS_98;
            const __VLS_99 = {}.ElDropdownItem;
            /** @type {[typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, ]} */ ;
            // @ts-ignore
            const __VLS_100 = __VLS_asFunctionalComponent(__VLS_99, new __VLS_99({
                command: "删除",
            }));
            const __VLS_101 = __VLS_100({
                command: "删除",
            }, ...__VLS_functionalComponentArgsRest(__VLS_100));
            __VLS_102.slots.default;
            var __VLS_102;
            var __VLS_94;
        }
        var __VLS_74;
    }
    var __VLS_54;
    var __VLS_34;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "template-pagination" },
    'aria-label': "模板分页",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.filteredTemplates.length);
const __VLS_103 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_104 = __VLS_asFunctionalComponent(__VLS_103, new __VLS_103({
    link: true,
    disabled: true,
    'aria-label': "上一页",
}));
const __VLS_105 = __VLS_104({
    link: true,
    disabled: true,
    'aria-label': "上一页",
}, ...__VLS_functionalComponentArgsRest(__VLS_104));
__VLS_106.slots.default;
const __VLS_107 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_108 = __VLS_asFunctionalComponent(__VLS_107, new __VLS_107({}));
const __VLS_109 = __VLS_108({}, ...__VLS_functionalComponentArgsRest(__VLS_108));
__VLS_110.slots.default;
const __VLS_111 = {}.ArrowLeftBold;
/** @type {[typeof __VLS_components.ArrowLeftBold, ]} */ ;
// @ts-ignore
const __VLS_112 = __VLS_asFunctionalComponent(__VLS_111, new __VLS_111({}));
const __VLS_113 = __VLS_112({}, ...__VLS_functionalComponentArgsRest(__VLS_112));
var __VLS_110;
var __VLS_106;
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ class: "page-current" },
    type: "button",
    'aria-current': "page",
});
const __VLS_115 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_116 = __VLS_asFunctionalComponent(__VLS_115, new __VLS_115({
    link: true,
    disabled: true,
    'aria-label': "下一页",
}));
const __VLS_117 = __VLS_116({
    link: true,
    disabled: true,
    'aria-label': "下一页",
}, ...__VLS_functionalComponentArgsRest(__VLS_116));
__VLS_118.slots.default;
const __VLS_119 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_120 = __VLS_asFunctionalComponent(__VLS_119, new __VLS_119({}));
const __VLS_121 = __VLS_120({}, ...__VLS_functionalComponentArgsRest(__VLS_120));
__VLS_122.slots.default;
const __VLS_123 = {}.ArrowRightBold;
/** @type {[typeof __VLS_components.ArrowRightBold, ]} */ ;
// @ts-ignore
const __VLS_124 = __VLS_asFunctionalComponent(__VLS_123, new __VLS_123({}));
const __VLS_125 = __VLS_124({}, ...__VLS_functionalComponentArgsRest(__VLS_124));
var __VLS_122;
var __VLS_118;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "page-size" },
});
const __VLS_127 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_128 = __VLS_asFunctionalComponent(__VLS_127, new __VLS_127({}));
const __VLS_129 = __VLS_128({}, ...__VLS_functionalComponentArgsRest(__VLS_128));
__VLS_130.slots.default;
const __VLS_131 = {}.ArrowDown;
/** @type {[typeof __VLS_components.ArrowDown, ]} */ ;
// @ts-ignore
const __VLS_132 = __VLS_asFunctionalComponent(__VLS_131, new __VLS_131({}));
const __VLS_133 = __VLS_132({}, ...__VLS_functionalComponentArgsRest(__VLS_132));
var __VLS_130;
if (__VLS_ctx.notice) {
    const __VLS_135 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_136 = __VLS_asFunctionalComponent(__VLS_135, new __VLS_135({
        ...{ 'onClose': {} },
        ...{ class: "template-notice" },
        title: (__VLS_ctx.notice),
        type: "info",
        showIcon: true,
        closable: true,
    }));
    const __VLS_137 = __VLS_136({
        ...{ 'onClose': {} },
        ...{ class: "template-notice" },
        title: (__VLS_ctx.notice),
        type: "info",
        showIcon: true,
        closable: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_136));
    let __VLS_139;
    let __VLS_140;
    let __VLS_141;
    const __VLS_142 = {
        onClose: (...[$event]) => {
            if (!(__VLS_ctx.notice))
                return;
            __VLS_ctx.notice = '';
        }
    };
    var __VLS_138;
}
/** @type {[typeof PerformanceConfirmDialog, ]} */ ;
// @ts-ignore
const __VLS_143 = __VLS_asFunctionalComponent(PerformanceConfirmDialog, new PerformanceConfirmDialog({
    ...{ 'onConfirm': {} },
    modelValue: (__VLS_ctx.deleteDialogVisible),
    loading: (__VLS_ctx.deleting),
}));
const __VLS_144 = __VLS_143({
    ...{ 'onConfirm': {} },
    modelValue: (__VLS_ctx.deleteDialogVisible),
    loading: (__VLS_ctx.deleting),
}, ...__VLS_functionalComponentArgsRest(__VLS_143));
let __VLS_146;
let __VLS_147;
let __VLS_148;
const __VLS_149 = {
    onConfirm: (__VLS_ctx.confirmDelete)
};
var __VLS_145;
var __VLS_2;
/** @type {__VLS_StyleScopedClasses['create-button']} */ ;
/** @type {__VLS_StyleScopedClasses['template-loading']} */ ;
/** @type {__VLS_StyleScopedClasses['template-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['template-table-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['status-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['row-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['more-button']} */ ;
/** @type {__VLS_StyleScopedClasses['template-action-menu']} */ ;
/** @type {__VLS_StyleScopedClasses['template-pagination']} */ ;
/** @type {__VLS_StyleScopedClasses['page-current']} */ ;
/** @type {__VLS_StyleScopedClasses['page-size']} */ ;
/** @type {__VLS_StyleScopedClasses['template-notice']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformanceConfirmDialog: PerformanceConfirmDialog,
            PerformanceListPage: PerformanceListPage,
            PerformanceListToolbar: PerformanceListToolbar,
            ArrowDown: ArrowDown,
            ArrowLeftBold: ArrowLeftBold,
            ArrowRightBold: ArrowRightBold,
            MoreFilled: MoreFilled,
            Plus: Plus,
            keyword: keyword,
            loading: loading,
            notice: notice,
            deleteDialogVisible: deleteDialogVisible,
            deleting: deleting,
            filteredTemplates: filteredTemplates,
            templateRowKey: templateRowKey,
            openCreatePage: openCreatePage,
            openEditPage: openEditPage,
            handleTemplateAction: handleTemplateAction,
            confirmDelete: confirmDelete,
            showComingSoon: showComingSoon,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
