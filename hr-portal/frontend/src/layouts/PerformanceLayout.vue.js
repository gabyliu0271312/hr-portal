/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowDown } from '@element-plus/icons-vue';
import { useUserStore } from '@/stores/user';
import { performanceApi } from '@/api/performance';
import { canManagePerformanceSettings } from '@/utils/performanceSettingsAccess';
import { openPerformanceSettingsInNewTab } from '@/utils/performanceSettingsNavigation';
import GlobalAiAssistant from '@/components/GlobalAiAssistant.vue';
import PerformanceBrand from '@/components/performance/PerformanceBrand.vue';
const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const performanceContext = ref(null);
const canAdmin = computed(() => canManagePerformanceSettings(userStore.menus.map((menu) => menu.code), performanceContext.value));
const userInitial = computed(() => userStore.user?.display_name?.trim().slice(0, 1) || '我');
const isWorkbench = computed(() => route.path === '/performance/workbench');
const isReview = computed(() => route.path === '/performance/review');
const tabs = computed(() => [
    {
        label: '工作台',
        path: '/performance/workbench',
        menu: [
            { key: 'todo', label: '我的待办', path: '/performance/workbench' },
            { key: 'mine', label: '我的绩效', path: '/performance/workbench' },
            { key: 'team', label: '团队进度', path: '/performance/workbench' },
            { key: 'appeals', label: '申诉处理', path: '/performance/workbench' },
        ],
    },
    {
        label: '绩效评估',
        path: '/performance/review',
        menu: [
            { key: 'current', label: '当前周期', path: '/performance/review' },
            { key: 'summary', label: '工作内容总结', path: '/performance/review' },
            { key: 'self', label: '员工自评', path: '/performance/review' },
            { key: 'manager', label: '上级评价', path: '/performance/review' },
            { key: 'project', label: '项目评价', path: '/performance/review' },
            { key: 'calibration', label: '校准管理', path: '/performance/review' },
            { key: 'results', label: '结果查看', path: '/performance/review' },
            { key: 'appeal-feedback', label: '申诉反馈', path: '/performance/review' },
        ],
    },
    {
        label: '项目管理',
        path: '/performance/projects',
        menu: [
            { key: 'list', label: '项目列表', path: '/performance/projects' },
            { key: 'members', label: '项目成员', path: '/performance/projects' },
            { key: 'weights', label: '项目权重', path: '/performance/projects' },
            { key: 'reviews', label: '项目评价', path: '/performance/projects' },
            { key: 'progress', label: '项目进度', path: '/performance/projects' },
        ],
    },
]);
const visibleTabs = computed(() => tabs.value.filter((tab) => !tab.adminOnly || canAdmin.value));
const activeTab = computed(() => visibleTabs.value.find((tab) => route.path === tab.path || route.path.startsWith(`${tab.path}/`))
    || visibleTabs.value[0]);
const activeMenu = computed(() => activeTab.value?.menu ?? []);
function isActive(path) {
    return route.path === path || route.path.startsWith(`${path}/`);
}
async function handleUserCommand(command) {
    if (command === 'settings') {
        openPerformanceSettingsInNewTab();
        return;
    }
    await userStore.logout();
    await router.replace({ name: 'Login' });
}
onMounted(async () => {
    try {
        performanceContext.value = await performanceApi.getAccessContext();
    }
    catch {
        performanceContext.value = null;
    }
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['launcher']} */ ;
/** @type {__VLS_StyleScopedClasses['launcher']} */ ;
/** @type {__VLS_StyleScopedClasses['portal-link']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-button']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-button']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-button']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-button']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-item']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-item']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-header']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-aside']} */ ;
// CSS variable injection 
// CSS variable injection end 
const __VLS_0 = {}.ElContainer;
/** @type {[typeof __VLS_components.ElContainer, typeof __VLS_components.elContainer, typeof __VLS_components.ElContainer, typeof __VLS_components.elContainer, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ class: "performance-app" },
}));
const __VLS_2 = __VLS_1({
    ...{ class: "performance-app" },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
var __VLS_4 = {};
__VLS_3.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "performance-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "header-left" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.router.push('/home');
        } },
    ...{ class: "launcher" },
    type: "button",
    'aria-label': "应用启动器",
});
for (const [index] of __VLS_getVForSourceType((9))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({
        key: (index),
    });
}
/** @type {[typeof PerformanceBrand, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(PerformanceBrand, new PerformanceBrand({
    label: "创梦绩效",
}));
const __VLS_6 = __VLS_5({
    label: "创梦绩效",
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
__VLS_asFunctionalElement(__VLS_intrinsicElements.nav, __VLS_intrinsicElements.nav)({
    ...{ class: "performance-tabs" },
});
for (const [tab] of __VLS_getVForSourceType((__VLS_ctx.visibleTabs))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.router.push(tab.path);
            } },
        key: (tab.path),
        ...{ class: "tab-button" },
        ...{ class: ({ active: __VLS_ctx.isActive(tab.path) }) },
        type: "button",
    });
    (tab.label);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "header-right" },
});
const __VLS_8 = {}.ElDropdown;
/** @type {[typeof __VLS_components.ElDropdown, typeof __VLS_components.elDropdown, typeof __VLS_components.ElDropdown, typeof __VLS_components.elDropdown, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    ...{ 'onCommand': {} },
    trigger: "click",
}));
const __VLS_10 = __VLS_9({
    ...{ 'onCommand': {} },
    trigger: "click",
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
let __VLS_12;
let __VLS_13;
let __VLS_14;
const __VLS_15 = {
    onCommand: (__VLS_ctx.handleUserCommand)
};
__VLS_11.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ class: "user-trigger" },
    type: "button",
});
const __VLS_16 = {}.ElAvatar;
/** @type {[typeof __VLS_components.ElAvatar, typeof __VLS_components.elAvatar, typeof __VLS_components.ElAvatar, typeof __VLS_components.elAvatar, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    size: (30),
}));
const __VLS_18 = __VLS_17({
    size: (30),
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
__VLS_19.slots.default;
(__VLS_ctx.userInitial);
var __VLS_19;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "user-name" },
});
(__VLS_ctx.userStore.user?.display_name);
const __VLS_20 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({}));
const __VLS_22 = __VLS_21({}, ...__VLS_functionalComponentArgsRest(__VLS_21));
__VLS_23.slots.default;
const __VLS_24 = {}.ArrowDown;
/** @type {[typeof __VLS_components.ArrowDown, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({}));
const __VLS_26 = __VLS_25({}, ...__VLS_functionalComponentArgsRest(__VLS_25));
var __VLS_23;
{
    const { dropdown: __VLS_thisSlot } = __VLS_11.slots;
    const __VLS_28 = {}.ElDropdownMenu;
    /** @type {[typeof __VLS_components.ElDropdownMenu, typeof __VLS_components.elDropdownMenu, typeof __VLS_components.ElDropdownMenu, typeof __VLS_components.elDropdownMenu, ]} */ ;
    // @ts-ignore
    const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({}));
    const __VLS_30 = __VLS_29({}, ...__VLS_functionalComponentArgsRest(__VLS_29));
    __VLS_31.slots.default;
    if (__VLS_ctx.canAdmin) {
        const __VLS_32 = {}.ElDropdownItem;
        /** @type {[typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, ]} */ ;
        // @ts-ignore
        const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
            command: "settings",
        }));
        const __VLS_34 = __VLS_33({
            command: "settings",
        }, ...__VLS_functionalComponentArgsRest(__VLS_33));
        __VLS_35.slots.default;
        var __VLS_35;
    }
    const __VLS_36 = {}.ElDropdownItem;
    /** @type {[typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, ]} */ ;
    // @ts-ignore
    const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
        command: "logout",
        divided: (__VLS_ctx.canAdmin),
    }));
    const __VLS_38 = __VLS_37({
        command: "logout",
        divided: (__VLS_ctx.canAdmin),
    }, ...__VLS_functionalComponentArgsRest(__VLS_37));
    __VLS_39.slots.default;
    var __VLS_39;
    var __VLS_31;
}
var __VLS_11;
const __VLS_40 = {}.ElContainer;
/** @type {[typeof __VLS_components.ElContainer, typeof __VLS_components.elContainer, typeof __VLS_components.ElContainer, typeof __VLS_components.elContainer, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
    ...{ class: "performance-body" },
}));
const __VLS_42 = __VLS_41({
    ...{ class: "performance-body" },
}, ...__VLS_functionalComponentArgsRest(__VLS_41));
__VLS_43.slots.default;
if (!__VLS_ctx.isWorkbench && !__VLS_ctx.isReview) {
    const __VLS_44 = {}.ElAside;
    /** @type {[typeof __VLS_components.ElAside, typeof __VLS_components.elAside, typeof __VLS_components.ElAside, typeof __VLS_components.elAside, ]} */ ;
    // @ts-ignore
    const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
        width: "220px",
        ...{ class: "performance-aside" },
    }));
    const __VLS_46 = __VLS_45({
        width: "220px",
        ...{ class: "performance-aside" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_45));
    __VLS_47.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "aside-title" },
    });
    (__VLS_ctx.activeTab?.label || '绩效管理');
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.activeMenu))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ onClick: (...[$event]) => {
                    if (!(!__VLS_ctx.isWorkbench && !__VLS_ctx.isReview))
                        return;
                    __VLS_ctx.router.push(item.path);
                } },
            key: (item.key),
            ...{ class: "menu-item" },
            ...{ class: ({ active: item.path === __VLS_ctx.route.path }) },
        });
        (item.label);
    }
    var __VLS_47;
}
const __VLS_48 = {}.ElMain;
/** @type {[typeof __VLS_components.ElMain, typeof __VLS_components.elMain, typeof __VLS_components.ElMain, typeof __VLS_components.elMain, ]} */ ;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
    ...{ class: (['performance-main', { 'review-main': __VLS_ctx.isReview }]) },
}));
const __VLS_50 = __VLS_49({
    ...{ class: (['performance-main', { 'review-main': __VLS_ctx.isReview }]) },
}, ...__VLS_functionalComponentArgsRest(__VLS_49));
__VLS_51.slots.default;
const __VLS_52 = {}.RouterView;
/** @type {[typeof __VLS_components.RouterView, typeof __VLS_components.routerView, ]} */ ;
// @ts-ignore
const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({}));
const __VLS_54 = __VLS_53({}, ...__VLS_functionalComponentArgsRest(__VLS_53));
var __VLS_51;
var __VLS_43;
/** @type {[typeof GlobalAiAssistant, ]} */ ;
// @ts-ignore
const __VLS_56 = __VLS_asFunctionalComponent(GlobalAiAssistant, new GlobalAiAssistant({}));
const __VLS_57 = __VLS_56({}, ...__VLS_functionalComponentArgsRest(__VLS_56));
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['performance-app']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-header']} */ ;
/** @type {__VLS_StyleScopedClasses['header-left']} */ ;
/** @type {__VLS_StyleScopedClasses['launcher']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-button']} */ ;
/** @type {__VLS_StyleScopedClasses['header-right']} */ ;
/** @type {__VLS_StyleScopedClasses['user-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['user-name']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-body']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-aside']} */ ;
/** @type {__VLS_StyleScopedClasses['aside-title']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-item']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ArrowDown: ArrowDown,
            GlobalAiAssistant: GlobalAiAssistant,
            PerformanceBrand: PerformanceBrand,
            route: route,
            router: router,
            userStore: userStore,
            canAdmin: canAdmin,
            userInitial: userInitial,
            isWorkbench: isWorkbench,
            isReview: isReview,
            visibleTabs: visibleTabs,
            activeTab: activeTab,
            activeMenu: activeMenu,
            isActive: isActive,
            handleUserCommand: handleUserCommand,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
