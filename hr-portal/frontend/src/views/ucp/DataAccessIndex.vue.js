/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft } from '@element-plus/icons-vue';
import SystemsTabView from './tabs/SystemsTabView.vue';
import EventsTabView from './tabs/EventsTabView.vue';
import PipelinesTabView from './tabs/PipelinesTabView.vue';
import MonitorTabView from './tabs/MonitorTabView.vue';
const route = useRoute();
const router = useRouter();
const activeTab = ref((route.query.tab || 'systems'));
const currentSystemCode = computed(() => route.query.system || '');
const currentSystemLabel = computed(() => {
    if (activeTab.value === 'systems')
        return '接入系统';
    return currentSystemCode.value ? `系统：${currentSystemCode.value}` : '数据接入';
});
const tabSubtitles = {
    systems: '',
    events: '事件总线 / 触发器 / 死信队列',
    pipelines: '流水线管理 / 流水线编排',
    monitor: '运行监控 / 外部账号 / 审批 / OA 同步',
};
watch(() => route.query, (q) => {
    if (q.tab)
        activeTab.value = q.tab || 'systems';
});
function goSystems() {
    router.push({ name: 'UcpIndex', query: { tab: 'systems' } });
}
function openSystem(systemCode, subTab = 'events') {
    activeTab.value = subTab;
    router.push({ name: 'UcpIndex', query: { tab: subTab, system: systemCode } });
}
function changeSystem(systemCode) {
    router.replace({ query: { ...route.query, system: systemCode } });
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['da-tabs']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "data-access-index" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "page-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "header-left" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
    ...{ class: "page-title" },
});
(__VLS_ctx.currentSystemLabel);
if (__VLS_ctx.activeTab !== 'systems') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "page-subtitle" },
    });
    (__VLS_ctx.tabSubtitles[__VLS_ctx.activeTab]);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "header-right" },
});
if (__VLS_ctx.activeTab !== 'systems') {
    const __VLS_0 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        ...{ 'onClick': {} },
        link: true,
    }));
    const __VLS_2 = __VLS_1({
        ...{ 'onClick': {} },
        link: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    let __VLS_4;
    let __VLS_5;
    let __VLS_6;
    const __VLS_7 = {
        onClick: (__VLS_ctx.goSystems)
    };
    __VLS_3.slots.default;
    const __VLS_8 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({}));
    const __VLS_10 = __VLS_9({}, ...__VLS_functionalComponentArgsRest(__VLS_9));
    __VLS_11.slots.default;
    const __VLS_12 = {}.ArrowLeft;
    /** @type {[typeof __VLS_components.ArrowLeft, ]} */ ;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({}));
    const __VLS_14 = __VLS_13({}, ...__VLS_functionalComponentArgsRest(__VLS_13));
    var __VLS_11;
    var __VLS_3;
}
const __VLS_16 = {}.ElTabs;
/** @type {[typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    modelValue: (__VLS_ctx.activeTab),
    ...{ class: "da-tabs" },
}));
const __VLS_18 = __VLS_17({
    modelValue: (__VLS_ctx.activeTab),
    ...{ class: "da-tabs" },
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
__VLS_19.slots.default;
const __VLS_20 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    label: "接入系统",
    name: "systems",
}));
const __VLS_22 = __VLS_21({
    label: "接入系统",
    name: "systems",
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
const __VLS_24 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    label: "事件中心",
    name: "events",
}));
const __VLS_26 = __VLS_25({
    label: "事件中心",
    name: "events",
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
const __VLS_28 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    label: "流水线",
    name: "pipelines",
}));
const __VLS_30 = __VLS_29({
    label: "流水线",
    name: "pipelines",
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
const __VLS_32 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    label: "监控中心",
    name: "monitor",
}));
const __VLS_34 = __VLS_33({
    label: "监控中心",
    name: "monitor",
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
var __VLS_19;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "tab-content" },
});
if (__VLS_ctx.activeTab === 'systems') {
    /** @type {[typeof SystemsTabView, ]} */ ;
    // @ts-ignore
    const __VLS_36 = __VLS_asFunctionalComponent(SystemsTabView, new SystemsTabView({
        ...{ 'onOpenSystem': {} },
    }));
    const __VLS_37 = __VLS_36({
        ...{ 'onOpenSystem': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_36));
    let __VLS_39;
    let __VLS_40;
    let __VLS_41;
    const __VLS_42 = {
        onOpenSystem: (__VLS_ctx.openSystem)
    };
    var __VLS_38;
}
else if (__VLS_ctx.activeTab === 'events') {
    /** @type {[typeof EventsTabView, ]} */ ;
    // @ts-ignore
    const __VLS_43 = __VLS_asFunctionalComponent(EventsTabView, new EventsTabView({
        ...{ 'onChangeSystem': {} },
        currentSystemCode: (__VLS_ctx.currentSystemCode),
    }));
    const __VLS_44 = __VLS_43({
        ...{ 'onChangeSystem': {} },
        currentSystemCode: (__VLS_ctx.currentSystemCode),
    }, ...__VLS_functionalComponentArgsRest(__VLS_43));
    let __VLS_46;
    let __VLS_47;
    let __VLS_48;
    const __VLS_49 = {
        onChangeSystem: (__VLS_ctx.changeSystem)
    };
    var __VLS_45;
}
else if (__VLS_ctx.activeTab === 'pipelines') {
    /** @type {[typeof PipelinesTabView, ]} */ ;
    // @ts-ignore
    const __VLS_50 = __VLS_asFunctionalComponent(PipelinesTabView, new PipelinesTabView({
        ...{ 'onChangeSystem': {} },
        currentSystemCode: (__VLS_ctx.currentSystemCode),
    }));
    const __VLS_51 = __VLS_50({
        ...{ 'onChangeSystem': {} },
        currentSystemCode: (__VLS_ctx.currentSystemCode),
    }, ...__VLS_functionalComponentArgsRest(__VLS_50));
    let __VLS_53;
    let __VLS_54;
    let __VLS_55;
    const __VLS_56 = {
        onChangeSystem: (__VLS_ctx.changeSystem)
    };
    var __VLS_52;
}
else if (__VLS_ctx.activeTab === 'monitor') {
    /** @type {[typeof MonitorTabView, ]} */ ;
    // @ts-ignore
    const __VLS_57 = __VLS_asFunctionalComponent(MonitorTabView, new MonitorTabView({
        ...{ 'onChangeSystem': {} },
        currentSystemCode: (__VLS_ctx.currentSystemCode),
    }));
    const __VLS_58 = __VLS_57({
        ...{ 'onChangeSystem': {} },
        currentSystemCode: (__VLS_ctx.currentSystemCode),
    }, ...__VLS_functionalComponentArgsRest(__VLS_57));
    let __VLS_60;
    let __VLS_61;
    let __VLS_62;
    const __VLS_63 = {
        onChangeSystem: (__VLS_ctx.changeSystem)
    };
    var __VLS_59;
}
/** @type {__VLS_StyleScopedClasses['data-access-index']} */ ;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['header-left']} */ ;
/** @type {__VLS_StyleScopedClasses['page-title']} */ ;
/** @type {__VLS_StyleScopedClasses['page-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['header-right']} */ ;
/** @type {__VLS_StyleScopedClasses['da-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-content']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ArrowLeft: ArrowLeft,
            SystemsTabView: SystemsTabView,
            EventsTabView: EventsTabView,
            PipelinesTabView: PipelinesTabView,
            MonitorTabView: MonitorTabView,
            activeTab: activeTab,
            currentSystemCode: currentSystemCode,
            currentSystemLabel: currentSystemLabel,
            tabSubtitles: tabSubtitles,
            goSystems: goSystems,
            openSystem: openSystem,
            changeSystem: changeSystem,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
