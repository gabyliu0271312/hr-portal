/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowDown, ArrowLeftBold, ArrowRightBold, Filter, MoreFilled, Plus, Search } from '@element-plus/icons-vue';
const keyword = ref('');
const loading = ref(false);
const notice = ref('');
const router = useRouter();
const templates = [
    { name: '11', description: '--', status: 'inactive', createdAt: '2026-08-07 13:10' },
    { name: '半年度绩效评估（2026模板）', description: '半年度评估-360自愿评估-无投入度价值观', status: 'active', createdAt: '2026-06-22 15:05' },
    { name: '全年度绩效评估', description: '全年度评估-360自愿评估', status: 'active', createdAt: '2023-12-12 16:08' },
    { name: '半年度绩效评估', description: '半年度评估-360自愿评估', status: 'active', createdAt: '2023-06-15 17:31' },
    { name: '2022年全年度绩效评估', description: '创梦总部-2022年度评估', status: 'active', createdAt: '2022-12-06 17:50' },
    { name: '2022年半年度绩效评估', description: '创梦总部-2022半年度评估', status: 'active', createdAt: '2022-06-13 15:00' },
    { name: '2021年下半年度绩效评估', description: '--', status: 'active', createdAt: '2021-11-29 11:12' },
];
const filteredTemplates = computed(() => {
    const normalizedKeyword = keyword.value.trim().toLowerCase();
    return templates.filter((template) => !normalizedKeyword || `${template.name} ${template.description}`.toLowerCase().includes(normalizedKeyword));
});
function openCreatePage() {
    void router.push({ name: 'PerformanceTemplateCreate' });
}
function showComingSoon(action) {
    notice.value = `${action}功能将在后续模板配置阶段开放，当前仅展示列表原型。`;
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['toolbar-right']} */ ;
/** @type {__VLS_StyleScopedClasses['template-search']} */ ;
/** @type {__VLS_StyleScopedClasses['status-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['status-active']} */ ;
/** @type {__VLS_StyleScopedClasses['row-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['row-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['template-action-menu']} */ ;
/** @type {__VLS_StyleScopedClasses['template-action-menu']} */ ;
/** @type {__VLS_StyleScopedClasses['el-dropdown-menu__item']} */ ;
/** @type {__VLS_StyleScopedClasses['template-pagination']} */ ;
/** @type {__VLS_StyleScopedClasses['el-button']} */ ;
/** @type {__VLS_StyleScopedClasses['template-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-right']} */ ;
/** @type {__VLS_StyleScopedClasses['template-search']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "template-page" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "template-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "template-content" },
    'aria-label': "绩效模板列表",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "template-toolbar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "toolbar-left" },
});
const __VLS_0 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onClick': {} },
    ...{ class: "create-button" },
    type: "primary",
}));
const __VLS_2 = __VLS_1({
    ...{ 'onClick': {} },
    ...{ class: "create-button" },
    type: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onClick: (__VLS_ctx.openCreatePage)
};
__VLS_3.slots.default;
const __VLS_8 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({}));
const __VLS_10 = __VLS_9({}, ...__VLS_functionalComponentArgsRest(__VLS_9));
__VLS_11.slots.default;
const __VLS_12 = {}.Plus;
/** @type {[typeof __VLS_components.Plus, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({}));
const __VLS_14 = __VLS_13({}, ...__VLS_functionalComponentArgsRest(__VLS_13));
var __VLS_11;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
var __VLS_3;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "toolbar-right" },
});
const __VLS_16 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    modelValue: (__VLS_ctx.keyword),
    ...{ class: "template-search" },
    clearable: true,
    placeholder: "通过名称、备注搜索",
    'aria-label': "通过名称、备注搜索",
}));
const __VLS_18 = __VLS_17({
    modelValue: (__VLS_ctx.keyword),
    ...{ class: "template-search" },
    clearable: true,
    placeholder: "通过名称、备注搜索",
    'aria-label': "通过名称、备注搜索",
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
__VLS_19.slots.default;
{
    const { prefix: __VLS_thisSlot } = __VLS_19.slots;
    const __VLS_20 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({}));
    const __VLS_22 = __VLS_21({}, ...__VLS_functionalComponentArgsRest(__VLS_21));
    __VLS_23.slots.default;
    const __VLS_24 = {}.Search;
    /** @type {[typeof __VLS_components.Search, ]} */ ;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({}));
    const __VLS_26 = __VLS_25({}, ...__VLS_functionalComponentArgsRest(__VLS_25));
    var __VLS_23;
}
var __VLS_19;
const __VLS_28 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    ...{ 'onClick': {} },
    ...{ class: "filter-button" },
    'aria-label': "筛选模板",
}));
const __VLS_30 = __VLS_29({
    ...{ 'onClick': {} },
    ...{ class: "filter-button" },
    'aria-label': "筛选模板",
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
let __VLS_32;
let __VLS_33;
let __VLS_34;
const __VLS_35 = {
    onClick: (...[$event]) => {
        __VLS_ctx.showComingSoon('筛选');
    }
};
__VLS_31.slots.default;
const __VLS_36 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({}));
const __VLS_38 = __VLS_37({}, ...__VLS_functionalComponentArgsRest(__VLS_37));
__VLS_39.slots.default;
const __VLS_40 = {}.Filter;
/** @type {[typeof __VLS_components.Filter, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({}));
const __VLS_42 = __VLS_41({}, ...__VLS_functionalComponentArgsRest(__VLS_41));
var __VLS_39;
var __VLS_31;
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
    const __VLS_44 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
        description: (__VLS_ctx.keyword ? '没有找到匹配的绩效模板' : '暂无绩效模板'),
    }));
    const __VLS_46 = __VLS_45({
        description: (__VLS_ctx.keyword ? '没有找到匹配的绩效模板' : '暂无绩效模板'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_45));
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "template-table-wrap" },
    });
    const __VLS_48 = {}.ElTable;
    /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
    // @ts-ignore
    const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
        data: (__VLS_ctx.filteredTemplates),
        stripe: true,
        ...{ style: {} },
        maxHeight: "600",
        rowKey: "name",
    }));
    const __VLS_50 = __VLS_49({
        data: (__VLS_ctx.filteredTemplates),
        stripe: true,
        ...{ style: {} },
        maxHeight: "600",
        rowKey: "name",
    }, ...__VLS_functionalComponentArgsRest(__VLS_49));
    __VLS_51.slots.default;
    const __VLS_52 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
        prop: "name",
        label: "名称",
        minWidth: "220",
    }));
    const __VLS_54 = __VLS_53({
        prop: "name",
        label: "名称",
        minWidth: "220",
    }, ...__VLS_functionalComponentArgsRest(__VLS_53));
    const __VLS_56 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
        prop: "description",
        label: "描述",
        minWidth: "300",
        showOverflowTooltip: true,
    }));
    const __VLS_58 = __VLS_57({
        prop: "description",
        label: "描述",
        minWidth: "300",
        showOverflowTooltip: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_57));
    const __VLS_60 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
        label: "状态",
        minWidth: "130",
    }));
    const __VLS_62 = __VLS_61({
        label: "状态",
        minWidth: "130",
    }, ...__VLS_functionalComponentArgsRest(__VLS_61));
    __VLS_63.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_63.slots;
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
    var __VLS_63;
    const __VLS_64 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
        prop: "createdAt",
        label: "创建时间",
        minWidth: "170",
    }));
    const __VLS_66 = __VLS_65({
        prop: "createdAt",
        label: "创建时间",
        minWidth: "170",
    }, ...__VLS_functionalComponentArgsRest(__VLS_65));
    const __VLS_68 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
        label: "操作",
        width: "190",
        fixed: "right",
    }));
    const __VLS_70 = __VLS_69({
        label: "操作",
        width: "190",
        fixed: "right",
    }, ...__VLS_functionalComponentArgsRest(__VLS_69));
    __VLS_71.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_71.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "row-actions" },
        });
        const __VLS_72 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
            ...{ 'onClick': {} },
            link: true,
            type: "primary",
        }));
        const __VLS_74 = __VLS_73({
            ...{ 'onClick': {} },
            link: true,
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_73));
        let __VLS_76;
        let __VLS_77;
        let __VLS_78;
        const __VLS_79 = {
            onClick: (...[$event]) => {
                if (!!(__VLS_ctx.loading))
                    return;
                if (!!(__VLS_ctx.filteredTemplates.length === 0))
                    return;
                __VLS_ctx.showComingSoon(`编辑模板：${row.name}`);
            }
        };
        __VLS_75.slots.default;
        var __VLS_75;
        const __VLS_80 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
            ...{ 'onClick': {} },
            link: true,
            type: "primary",
            disabled: (row.status === 'inactive'),
        }));
        const __VLS_82 = __VLS_81({
            ...{ 'onClick': {} },
            link: true,
            type: "primary",
            disabled: (row.status === 'inactive'),
        }, ...__VLS_functionalComponentArgsRest(__VLS_81));
        let __VLS_84;
        let __VLS_85;
        let __VLS_86;
        const __VLS_87 = {
            onClick: (...[$event]) => {
                if (!!(__VLS_ctx.loading))
                    return;
                if (!!(__VLS_ctx.filteredTemplates.length === 0))
                    return;
                __VLS_ctx.showComingSoon('启用');
            }
        };
        __VLS_83.slots.default;
        (row.status === 'active' ? '停用' : '启用');
        var __VLS_83;
        const __VLS_88 = {}.ElDropdown;
        /** @type {[typeof __VLS_components.ElDropdown, typeof __VLS_components.elDropdown, typeof __VLS_components.ElDropdown, typeof __VLS_components.elDropdown, ]} */ ;
        // @ts-ignore
        const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
            ...{ 'onCommand': {} },
            trigger: "click",
        }));
        const __VLS_90 = __VLS_89({
            ...{ 'onCommand': {} },
            trigger: "click",
        }, ...__VLS_functionalComponentArgsRest(__VLS_89));
        let __VLS_92;
        let __VLS_93;
        let __VLS_94;
        const __VLS_95 = {
            onCommand: ((action) => __VLS_ctx.showComingSoon(`${action}模板：${row.name}`))
        };
        __VLS_91.slots.default;
        const __VLS_96 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
            ...{ class: "more-button" },
            link: true,
            'aria-label': "更多操作",
        }));
        const __VLS_98 = __VLS_97({
            ...{ class: "more-button" },
            link: true,
            'aria-label': "更多操作",
        }, ...__VLS_functionalComponentArgsRest(__VLS_97));
        __VLS_99.slots.default;
        const __VLS_100 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({}));
        const __VLS_102 = __VLS_101({}, ...__VLS_functionalComponentArgsRest(__VLS_101));
        __VLS_103.slots.default;
        const __VLS_104 = {}.MoreFilled;
        /** @type {[typeof __VLS_components.MoreFilled, ]} */ ;
        // @ts-ignore
        const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({}));
        const __VLS_106 = __VLS_105({}, ...__VLS_functionalComponentArgsRest(__VLS_105));
        var __VLS_103;
        var __VLS_99;
        {
            const { dropdown: __VLS_thisSlot } = __VLS_91.slots;
            const __VLS_108 = {}.ElDropdownMenu;
            /** @type {[typeof __VLS_components.ElDropdownMenu, typeof __VLS_components.elDropdownMenu, typeof __VLS_components.ElDropdownMenu, typeof __VLS_components.elDropdownMenu, ]} */ ;
            // @ts-ignore
            const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
                ...{ class: "template-action-menu" },
            }));
            const __VLS_110 = __VLS_109({
                ...{ class: "template-action-menu" },
            }, ...__VLS_functionalComponentArgsRest(__VLS_109));
            __VLS_111.slots.default;
            const __VLS_112 = {}.ElDropdownItem;
            /** @type {[typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, ]} */ ;
            // @ts-ignore
            const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
                command: "复制",
            }));
            const __VLS_114 = __VLS_113({
                command: "复制",
            }, ...__VLS_functionalComponentArgsRest(__VLS_113));
            __VLS_115.slots.default;
            var __VLS_115;
            const __VLS_116 = {}.ElDropdownItem;
            /** @type {[typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, ]} */ ;
            // @ts-ignore
            const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
                command: "删除",
            }));
            const __VLS_118 = __VLS_117({
                command: "删除",
            }, ...__VLS_functionalComponentArgsRest(__VLS_117));
            __VLS_119.slots.default;
            var __VLS_119;
            var __VLS_111;
        }
        var __VLS_91;
    }
    var __VLS_71;
    var __VLS_51;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "template-pagination" },
    'aria-label': "模板分页",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.filteredTemplates.length);
const __VLS_120 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
    link: true,
    disabled: true,
    'aria-label': "上一页",
}));
const __VLS_122 = __VLS_121({
    link: true,
    disabled: true,
    'aria-label': "上一页",
}, ...__VLS_functionalComponentArgsRest(__VLS_121));
__VLS_123.slots.default;
const __VLS_124 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({}));
const __VLS_126 = __VLS_125({}, ...__VLS_functionalComponentArgsRest(__VLS_125));
__VLS_127.slots.default;
const __VLS_128 = {}.ArrowLeftBold;
/** @type {[typeof __VLS_components.ArrowLeftBold, ]} */ ;
// @ts-ignore
const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({}));
const __VLS_130 = __VLS_129({}, ...__VLS_functionalComponentArgsRest(__VLS_129));
var __VLS_127;
var __VLS_123;
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ class: "page-current" },
    type: "button",
    'aria-current': "page",
});
const __VLS_132 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
    link: true,
    disabled: true,
    'aria-label': "下一页",
}));
const __VLS_134 = __VLS_133({
    link: true,
    disabled: true,
    'aria-label': "下一页",
}, ...__VLS_functionalComponentArgsRest(__VLS_133));
__VLS_135.slots.default;
const __VLS_136 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({}));
const __VLS_138 = __VLS_137({}, ...__VLS_functionalComponentArgsRest(__VLS_137));
__VLS_139.slots.default;
const __VLS_140 = {}.ArrowRightBold;
/** @type {[typeof __VLS_components.ArrowRightBold, ]} */ ;
// @ts-ignore
const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({}));
const __VLS_142 = __VLS_141({}, ...__VLS_functionalComponentArgsRest(__VLS_141));
var __VLS_139;
var __VLS_135;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "page-size" },
});
const __VLS_144 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({}));
const __VLS_146 = __VLS_145({}, ...__VLS_functionalComponentArgsRest(__VLS_145));
__VLS_147.slots.default;
const __VLS_148 = {}.ArrowDown;
/** @type {[typeof __VLS_components.ArrowDown, ]} */ ;
// @ts-ignore
const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({}));
const __VLS_150 = __VLS_149({}, ...__VLS_functionalComponentArgsRest(__VLS_149));
var __VLS_147;
if (__VLS_ctx.notice) {
    const __VLS_152 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
        ...{ 'onClose': {} },
        ...{ class: "template-notice" },
        title: (__VLS_ctx.notice),
        type: "info",
        showIcon: true,
        closable: true,
    }));
    const __VLS_154 = __VLS_153({
        ...{ 'onClose': {} },
        ...{ class: "template-notice" },
        title: (__VLS_ctx.notice),
        type: "info",
        showIcon: true,
        closable: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_153));
    let __VLS_156;
    let __VLS_157;
    let __VLS_158;
    const __VLS_159 = {
        onClose: (...[$event]) => {
            if (!(__VLS_ctx.notice))
                return;
            __VLS_ctx.notice = '';
        }
    };
    var __VLS_155;
}
/** @type {__VLS_StyleScopedClasses['template-page']} */ ;
/** @type {__VLS_StyleScopedClasses['template-title']} */ ;
/** @type {__VLS_StyleScopedClasses['template-content']} */ ;
/** @type {__VLS_StyleScopedClasses['template-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-left']} */ ;
/** @type {__VLS_StyleScopedClasses['create-button']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-right']} */ ;
/** @type {__VLS_StyleScopedClasses['template-search']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-button']} */ ;
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
            ArrowDown: ArrowDown,
            ArrowLeftBold: ArrowLeftBold,
            ArrowRightBold: ArrowRightBold,
            Filter: Filter,
            MoreFilled: MoreFilled,
            Plus: Plus,
            Search: Search,
            keyword: keyword,
            loading: loading,
            notice: notice,
            filteredTemplates: filteredTemplates,
            openCreatePage: openCreatePage,
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
