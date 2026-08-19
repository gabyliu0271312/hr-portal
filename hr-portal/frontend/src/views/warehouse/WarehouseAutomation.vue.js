/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref } from 'vue';
import AutomationStatusBar from '@/components/warehouse/automation/AutomationStatusBar.vue';
import OdsDwdAutomationTab from '@/components/warehouse/automation/OdsDwdAutomationTab.vue';
import MetricAutomationTab from '@/components/warehouse/automation/MetricAutomationTab.vue';
import L4PilotTab from '@/components/warehouse/automation/L4PilotTab.vue';
import AutomationAuditTab from '@/components/warehouse/automation/AutomationAuditTab.vue';
const activeTab = ref('ods-dwd');
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "automation-page" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "page-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({});
/** @type {[typeof AutomationStatusBar, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(AutomationStatusBar, new AutomationStatusBar({}));
const __VLS_1 = __VLS_0({}, ...__VLS_functionalComponentArgsRest(__VLS_0));
const __VLS_3 = {}.ElTabs;
/** @type {[typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, ]} */ ;
// @ts-ignore
const __VLS_4 = __VLS_asFunctionalComponent(__VLS_3, new __VLS_3({
    modelValue: (__VLS_ctx.activeTab),
}));
const __VLS_5 = __VLS_4({
    modelValue: (__VLS_ctx.activeTab),
}, ...__VLS_functionalComponentArgsRest(__VLS_4));
__VLS_6.slots.default;
const __VLS_7 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_8 = __VLS_asFunctionalComponent(__VLS_7, new __VLS_7({
    label: "ODS→DWD 自动化",
    name: "ods-dwd",
}));
const __VLS_9 = __VLS_8({
    label: "ODS→DWD 自动化",
    name: "ods-dwd",
}, ...__VLS_functionalComponentArgsRest(__VLS_8));
__VLS_10.slots.default;
/** @type {[typeof OdsDwdAutomationTab, ]} */ ;
// @ts-ignore
const __VLS_11 = __VLS_asFunctionalComponent(OdsDwdAutomationTab, new OdsDwdAutomationTab({}));
const __VLS_12 = __VLS_11({}, ...__VLS_functionalComponentArgsRest(__VLS_11));
var __VLS_10;
const __VLS_14 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_15 = __VLS_asFunctionalComponent(__VLS_14, new __VLS_14({
    label: "指标自动化",
    name: "metric",
}));
const __VLS_16 = __VLS_15({
    label: "指标自动化",
    name: "metric",
}, ...__VLS_functionalComponentArgsRest(__VLS_15));
__VLS_17.slots.default;
/** @type {[typeof MetricAutomationTab, ]} */ ;
// @ts-ignore
const __VLS_18 = __VLS_asFunctionalComponent(MetricAutomationTab, new MetricAutomationTab({}));
const __VLS_19 = __VLS_18({}, ...__VLS_functionalComponentArgsRest(__VLS_18));
var __VLS_17;
const __VLS_21 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_22 = __VLS_asFunctionalComponent(__VLS_21, new __VLS_21({
    label: "L4 全自动试点",
    name: "l4",
}));
const __VLS_23 = __VLS_22({
    label: "L4 全自动试点",
    name: "l4",
}, ...__VLS_functionalComponentArgsRest(__VLS_22));
__VLS_24.slots.default;
/** @type {[typeof L4PilotTab, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(L4PilotTab, new L4PilotTab({}));
const __VLS_26 = __VLS_25({}, ...__VLS_functionalComponentArgsRest(__VLS_25));
var __VLS_24;
const __VLS_28 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    label: "运行记录 / 审计",
    name: "audit",
}));
const __VLS_30 = __VLS_29({
    label: "运行记录 / 审计",
    name: "audit",
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
__VLS_31.slots.default;
/** @type {[typeof AutomationAuditTab, ]} */ ;
// @ts-ignore
const __VLS_32 = __VLS_asFunctionalComponent(AutomationAuditTab, new AutomationAuditTab({}));
const __VLS_33 = __VLS_32({}, ...__VLS_functionalComponentArgsRest(__VLS_32));
var __VLS_31;
var __VLS_6;
/** @type {__VLS_StyleScopedClasses['automation-page']} */ ;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            AutomationStatusBar: AutomationStatusBar,
            OdsDwdAutomationTab: OdsDwdAutomationTab,
            MetricAutomationTab: MetricAutomationTab,
            L4PilotTab: L4PilotTab,
            AutomationAuditTab: AutomationAuditTab,
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
