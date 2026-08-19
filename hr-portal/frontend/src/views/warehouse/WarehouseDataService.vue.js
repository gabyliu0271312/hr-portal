/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref } from 'vue';
import WarehouseAds from './WarehouseAds.vue';
import ApiServiceTab from './ApiServiceTab.vue';
import SubscriptionTab from './SubscriptionTab.vue';
import PushTargetList from '@/components/push/PushTargetList.vue';
import ServiceRunLogPanel from '@/components/warehouse/ServiceRunLogPanel.vue';
const tabs = [
    { name: 'ads', label: '消费资产' },
    { name: 'api', label: 'API 服务' },
    { name: 'push', label: '数据推送' },
    { name: 'subscribe', label: '订阅管理' },
    { name: 'monitor', label: '服务监控' },
];
const activeTab = ref('ads');
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['tab-item']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-item']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "tab-bar" },
});
for (const [tab] of __VLS_getVForSourceType((__VLS_ctx.tabs))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.activeTab = tab.name;
            } },
        key: (tab.name),
        ...{ class: "tab-item" },
        ...{ class: ({ active: __VLS_ctx.activeTab === tab.name }) },
    });
    (tab.label);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "tab-content" },
});
__VLS_asFunctionalDirective(__VLS_directives.vShow)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.activeTab === 'ads') }, null, null);
/** @type {[typeof WarehouseAds, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(WarehouseAds, new WarehouseAds({}));
const __VLS_1 = __VLS_0({}, ...__VLS_functionalComponentArgsRest(__VLS_0));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "tab-content" },
});
__VLS_asFunctionalDirective(__VLS_directives.vShow)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.activeTab === 'api') }, null, null);
/** @type {[typeof ApiServiceTab, ]} */ ;
// @ts-ignore
const __VLS_3 = __VLS_asFunctionalComponent(ApiServiceTab, new ApiServiceTab({}));
const __VLS_4 = __VLS_3({}, ...__VLS_functionalComponentArgsRest(__VLS_3));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "tab-content" },
});
__VLS_asFunctionalDirective(__VLS_directives.vShow)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.activeTab === 'push') }, null, null);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
/** @type {[typeof PushTargetList, ]} */ ;
// @ts-ignore
const __VLS_6 = __VLS_asFunctionalComponent(PushTargetList, new PushTargetList({
    sourceTable: "",
    hideHeader: (false),
}));
const __VLS_7 = __VLS_6({
    sourceTable: "",
    hideHeader: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_6));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "tab-content" },
});
__VLS_asFunctionalDirective(__VLS_directives.vShow)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.activeTab === 'subscribe') }, null, null);
/** @type {[typeof SubscriptionTab, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(SubscriptionTab, new SubscriptionTab({}));
const __VLS_10 = __VLS_9({}, ...__VLS_functionalComponentArgsRest(__VLS_9));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "tab-content" },
});
__VLS_asFunctionalDirective(__VLS_directives.vShow)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.activeTab === 'monitor') }, null, null);
/** @type {[typeof ServiceRunLogPanel, ]} */ ;
// @ts-ignore
const __VLS_12 = __VLS_asFunctionalComponent(ServiceRunLogPanel, new ServiceRunLogPanel({
    compact: (false),
}));
const __VLS_13 = __VLS_12({
    compact: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_12));
/** @type {__VLS_StyleScopedClasses['tab-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-item']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-content']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-content']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-content']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-content']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-content']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            WarehouseAds: WarehouseAds,
            ApiServiceTab: ApiServiceTab,
            SubscriptionTab: SubscriptionTab,
            PushTargetList: PushTargetList,
            ServiceRunLogPanel: ServiceRunLogPanel,
            tabs: tabs,
            activeTab: activeTab,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
