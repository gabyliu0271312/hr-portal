/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref } from 'vue';
const __VLS_props = defineProps();
const emit = defineEmits();
const collapsed = ref({
    mine: false,
    others: false,
    team: false,
    other: false,
});
function toggleCategory(key) {
    collapsed.value[key] = !collapsed.value[key];
}
const statusLabel = {
    pending: '待完成',
    not_started: '未开始',
    overdue: '已逾期',
};
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['cycle-picker']} */ ;
/** @type {__VLS_StyleScopedClasses['cycle-picker']} */ ;
/** @type {__VLS_StyleScopedClasses['category-toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['category-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['review-node']} */ ;
/** @type {__VLS_StyleScopedClasses['review-node']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['review-node']} */ ;
/** @type {__VLS_StyleScopedClasses['review-node']} */ ;
/** @type {__VLS_StyleScopedClasses['review-node']} */ ;
/** @type {__VLS_StyleScopedClasses['review-node']} */ ;
/** @type {__VLS_StyleScopedClasses['sidebar-collapse']} */ ;
/** @type {__VLS_StyleScopedClasses['el-dropdown-menu__item']} */ ;
/** @type {__VLS_StyleScopedClasses['review-sidebar']} */ ;
/** @type {__VLS_StyleScopedClasses['review-node-list']} */ ;
/** @type {__VLS_StyleScopedClasses['review-node']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
    ...{ class: "review-sidebar" },
    'aria-label': "绩效评估节点导航",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "cycle-section" },
});
const __VLS_0 = {}.ElDropdown;
/** @type {[typeof __VLS_components.ElDropdown, typeof __VLS_components.elDropdown, typeof __VLS_components.ElDropdown, typeof __VLS_components.elDropdown, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onCommand': {} },
    trigger: "click",
}));
const __VLS_2 = __VLS_1({
    ...{ 'onCommand': {} },
    trigger: "click",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onCommand: (...[$event]) => {
        __VLS_ctx.emit('select-project', $event);
    }
};
__VLS_3.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ class: "cycle-picker" },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.activeProject?.cycle_name || (__VLS_ctx.loading ? '加载中…' : '暂无绩效周期'));
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    width: "12",
    height: "12",
    viewBox: "0 0 24 24",
    fill: "none",
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M11.22 18.46a1 1 0 0 0 1.56 0l8.305-10.334a1 1 0 0 0-.78-1.626H3.696a1 1 0 0 0-.78 1.626L11.22 18.46Z",
    fill: "currentColor",
});
{
    const { dropdown: __VLS_thisSlot } = __VLS_3.slots;
    const __VLS_8 = {}.ElDropdownMenu;
    /** @type {[typeof __VLS_components.ElDropdownMenu, typeof __VLS_components.elDropdownMenu, typeof __VLS_components.ElDropdownMenu, typeof __VLS_components.elDropdownMenu, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({}));
    const __VLS_10 = __VLS_9({}, ...__VLS_functionalComponentArgsRest(__VLS_9));
    __VLS_11.slots.default;
    for (const [project] of __VLS_getVForSourceType((__VLS_ctx.projects))) {
        const __VLS_12 = {}.ElDropdownItem;
        /** @type {[typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, ]} */ ;
        // @ts-ignore
        const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
            key: (project.project_id),
            command: (project.project_id),
        }));
        const __VLS_14 = __VLS_13({
            key: (project.project_id),
            command: (project.project_id),
        }, ...__VLS_functionalComponentArgsRest(__VLS_13));
        __VLS_15.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (project.cycle_name);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
        (project.project_name);
        var __VLS_15;
    }
    var __VLS_11;
}
var __VLS_3;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "sidebar-divider" },
    'aria-hidden': "true",
});
for (const [category] of __VLS_getVForSourceType((__VLS_ctx.categories))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (category.key),
        ...{ class: "review-category" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.toggleCategory(category.key);
            } },
        ...{ class: "category-toggle" },
        ...{ class: ({ active: category.nodes.some(node => node.node_id === __VLS_ctx.selectedNodeId) }) },
        type: "button",
        'aria-expanded': (!__VLS_ctx.collapsed[category.key]),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "category-icon" },
        'aria-hidden': "true",
    });
    if (category.key === 'mine') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            width: "16",
            height: "16",
            viewBox: "0 0 24 24",
            fill: "none",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M15 6.5a3 3 0 1 0-6 0 3 3 0 0 0 6 0Zm2 0a5 5 0 1 1-10 0 5 5 0 0 1 10 0ZM4 19v2h16v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4Zm-2 0a6 6 0 0 1 6-6h8a6 6 0 0 1 6 6v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-2Z",
            fill: "currentColor",
        });
    }
    else if (category.key === 'others') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            width: "16",
            height: "16",
            viewBox: "0 0 24 24",
            fill: "none",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M10.5 1.5a5 5 0 1 1-.002 10.002A5 5 0 0 1 10.5 1.5Zm-3 5a3.001 3.001 0 0 0 6 0 3.001 3.001 0 0 0-6 0ZM4.125 18c-.08.32-.125.654-.125 1v1h8.5v2H4c-1.1 0-2-.9-2-2v-1a6 6 0 0 1 6-6h4.5v2H8a4.003 4.003 0 0 0-3.875 3Zm14.382 2.164L19.671 19H15a1 1 0 0 1 0-2h4.586l-1.079-1.079a1 1 0 1 1 1.414-1.414l2.829 2.828a1 1 0 0 1 0 1.415l-2.828 2.828a1 1 0 1 1-1.415-1.414Z",
            fill: "currentColor",
        });
    }
    else if (category.key === 'team') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            width: "16",
            height: "16",
            viewBox: "0 0 24 24",
            fill: "none",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M8.5 4.5a2.5 2.5 0 1 0 .001 5.001A2.5 2.5 0 0 0 8.5 4.5ZM4 7a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0Zm1.835 7.5c-1.82 0-3.335 1.498-3.335 3.4v1.6h12v-1.6c0-1.901-1.515-3.4-3.335-3.4h-5.33ZM.5 17.9c0-2.982 2.39-5.4 5.335-5.4h5.33c2.945 0 5.335 2.418 5.335 5.4v1.6c0 1.1-.9 2-2 2h-12c-1.1 0-2-.9-2-2v-1.6Zm22 2.6h-4.135v-2H21.5v-.6c0-1.002-.845-1.9-2-1.9h-1.31a5.46 5.46 0 0 0-.985-2H19.5c2.21 0 4 1.746 4 3.9v1.6c.025.535-.49 1.02-1 1Zm-6-11a1.001 1.001 0 1 1 1 1c-.55 0-1-.447-1-1Zm1-3a3.001 3.001 0 0 0 0 6 3.001 3.001 0 0 0 0-6Z",
            fill: "currentColor",
        });
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            width: "16",
            height: "16",
            viewBox: "0 0 24 24",
            fill: "none",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M19.602 3.06a1.5 1.5 0 1 1 2.898.777l-.388 1.449-2.898-.776.388-1.45Zm-.774 2.888 2.898.777-3.897 14.543c-.076.285-.24.54-.468.727l-1.48 1.218a.17.17 0 0 1-.268-.073l-.65-1.798a1.394 1.394 0 0 1-.036-.835l3.901-14.559ZM3 3a1 1 0 1 0 0 2h12a1 1 0 1 0 0-2H3Zm-1 9a1 1 0 0 1 1-1h9a1 1 0 1 1 0 2H3a1 1 0 0 1-1-1Zm1 7a1 1 0 1 0 0 2h7a1 1 0 1 0 0-2H3Z",
            fill: "currentColor",
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "category-label" },
    });
    (category.label);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        ...{ class: "category-arrow" },
        ...{ class: ({ collapsed: __VLS_ctx.collapsed[category.key] }) },
        width: "14",
        height: "14",
        viewBox: "0 0 24 24",
        fill: "none",
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "m7.586 20.486.707.707a1 1 0 0 0 1.414 0l7.778-7.778a2 2 0 0 0 0-2.829L9.707 2.808a1 1 0 0 0-1.414 0l-.707.707a1 1 0 0 0 0 1.414l7.07 7.072-7.07 7.07a1 1 0 0 0 0 1.415Z",
        fill: "currentColor",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "review-node-list" },
    });
    __VLS_asFunctionalDirective(__VLS_directives.vShow)(null, { ...__VLS_directiveBindingRestFields, value: (!__VLS_ctx.collapsed[category.key]) }, null, null);
    for (const [node] of __VLS_getVForSourceType((category.nodes))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    __VLS_ctx.emit('select-node', node);
                } },
            key: (node.node_id),
            ...{ class: "review-node" },
            ...{ class: ({ active: node.node_id === __VLS_ctx.selectedNodeId }) },
            type: "button",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "node-group" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "node-label" },
        });
        (node.node_name);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.em, __VLS_intrinsicElements.em)({
            ...{ class: (`status-${node.status}`) },
        });
        (__VLS_ctx.statusLabel[node.status]);
    }
    if (!category.nodes.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "category-empty" },
        });
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ class: "sidebar-collapse" },
    type: "button",
    'aria-label': "收起侧边栏",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "m15.707 4.293-.707-.707a1 1 0 0 0-1.414 0l-7.778 7.778a2 2 0 0 0 0 2.829l7.778 7.778a1 1 0 0 0 1.414 0l.707-.707a1 1 0 0 0 0-1.414L8.636 12l7.071-7.071a1 1 0 0 0 0-1.414Z",
    fill: "currentColor",
});
/** @type {__VLS_StyleScopedClasses['review-sidebar']} */ ;
/** @type {__VLS_StyleScopedClasses['cycle-section']} */ ;
/** @type {__VLS_StyleScopedClasses['cycle-picker']} */ ;
/** @type {__VLS_StyleScopedClasses['sidebar-divider']} */ ;
/** @type {__VLS_StyleScopedClasses['review-category']} */ ;
/** @type {__VLS_StyleScopedClasses['category-toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['category-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['category-label']} */ ;
/** @type {__VLS_StyleScopedClasses['category-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['review-node-list']} */ ;
/** @type {__VLS_StyleScopedClasses['review-node']} */ ;
/** @type {__VLS_StyleScopedClasses['node-group']} */ ;
/** @type {__VLS_StyleScopedClasses['node-label']} */ ;
/** @type {__VLS_StyleScopedClasses['category-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['sidebar-collapse']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            emit: emit,
            collapsed: collapsed,
            toggleCategory: toggleCategory,
            statusLabel: statusLabel,
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
