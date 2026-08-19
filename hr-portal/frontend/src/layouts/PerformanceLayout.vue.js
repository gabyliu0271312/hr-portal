/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowDown } from '@element-plus/icons-vue';
import { useUserStore } from '@/stores/user';
import { performanceApi } from '@/api/performance';
import { canManagePerformanceSettings } from '@/utils/performanceSettingsAccess';
import { openPerformanceSettingsInNewTab } from '@/utils/performanceSettingsNavigation';
import GlobalAiAssistant from '@/components/GlobalAiAssistant.vue';
const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const performanceContext = ref(null);
const canAdmin = computed(() => canManagePerformanceSettings(userStore.menus.map((menu) => menu.code), performanceContext.value));
const userInitial = computed(() => userStore.user?.display_name?.trim().slice(0, 1) || '我');
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
    ...{ class: "portal-link" },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "divider" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "app-name" },
});
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
const __VLS_5 = {}.ElDropdown;
/** @type {[typeof __VLS_components.ElDropdown, typeof __VLS_components.elDropdown, typeof __VLS_components.ElDropdown, typeof __VLS_components.elDropdown, ]} */ ;
// @ts-ignore
const __VLS_6 = __VLS_asFunctionalComponent(__VLS_5, new __VLS_5({
    ...{ 'onCommand': {} },
    trigger: "click",
}));
const __VLS_7 = __VLS_6({
    ...{ 'onCommand': {} },
    trigger: "click",
}, ...__VLS_functionalComponentArgsRest(__VLS_6));
let __VLS_9;
let __VLS_10;
let __VLS_11;
const __VLS_12 = {
    onCommand: (__VLS_ctx.handleUserCommand)
};
__VLS_8.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ class: "user-trigger" },
    type: "button",
});
const __VLS_13 = {}.ElAvatar;
/** @type {[typeof __VLS_components.ElAvatar, typeof __VLS_components.elAvatar, typeof __VLS_components.ElAvatar, typeof __VLS_components.elAvatar, ]} */ ;
// @ts-ignore
const __VLS_14 = __VLS_asFunctionalComponent(__VLS_13, new __VLS_13({
    size: (30),
}));
const __VLS_15 = __VLS_14({
    size: (30),
}, ...__VLS_functionalComponentArgsRest(__VLS_14));
__VLS_16.slots.default;
(__VLS_ctx.userInitial);
var __VLS_16;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "user-name" },
});
(__VLS_ctx.userStore.user?.display_name);
const __VLS_17 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_18 = __VLS_asFunctionalComponent(__VLS_17, new __VLS_17({}));
const __VLS_19 = __VLS_18({}, ...__VLS_functionalComponentArgsRest(__VLS_18));
__VLS_20.slots.default;
const __VLS_21 = {}.ArrowDown;
/** @type {[typeof __VLS_components.ArrowDown, ]} */ ;
// @ts-ignore
const __VLS_22 = __VLS_asFunctionalComponent(__VLS_21, new __VLS_21({}));
const __VLS_23 = __VLS_22({}, ...__VLS_functionalComponentArgsRest(__VLS_22));
var __VLS_20;
{
    const { dropdown: __VLS_thisSlot } = __VLS_8.slots;
    const __VLS_25 = {}.ElDropdownMenu;
    /** @type {[typeof __VLS_components.ElDropdownMenu, typeof __VLS_components.elDropdownMenu, typeof __VLS_components.ElDropdownMenu, typeof __VLS_components.elDropdownMenu, ]} */ ;
    // @ts-ignore
    const __VLS_26 = __VLS_asFunctionalComponent(__VLS_25, new __VLS_25({}));
    const __VLS_27 = __VLS_26({}, ...__VLS_functionalComponentArgsRest(__VLS_26));
    __VLS_28.slots.default;
    if (__VLS_ctx.canAdmin) {
        const __VLS_29 = {}.ElDropdownItem;
        /** @type {[typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, ]} */ ;
        // @ts-ignore
        const __VLS_30 = __VLS_asFunctionalComponent(__VLS_29, new __VLS_29({
            command: "settings",
        }));
        const __VLS_31 = __VLS_30({
            command: "settings",
        }, ...__VLS_functionalComponentArgsRest(__VLS_30));
        __VLS_32.slots.default;
        var __VLS_32;
    }
    const __VLS_33 = {}.ElDropdownItem;
    /** @type {[typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, ]} */ ;
    // @ts-ignore
    const __VLS_34 = __VLS_asFunctionalComponent(__VLS_33, new __VLS_33({
        command: "logout",
        divided: (__VLS_ctx.canAdmin),
    }));
    const __VLS_35 = __VLS_34({
        command: "logout",
        divided: (__VLS_ctx.canAdmin),
    }, ...__VLS_functionalComponentArgsRest(__VLS_34));
    __VLS_36.slots.default;
    var __VLS_36;
    var __VLS_28;
}
var __VLS_8;
const __VLS_37 = {}.ElContainer;
/** @type {[typeof __VLS_components.ElContainer, typeof __VLS_components.elContainer, typeof __VLS_components.ElContainer, typeof __VLS_components.elContainer, ]} */ ;
// @ts-ignore
const __VLS_38 = __VLS_asFunctionalComponent(__VLS_37, new __VLS_37({
    ...{ class: "performance-body" },
}));
const __VLS_39 = __VLS_38({
    ...{ class: "performance-body" },
}, ...__VLS_functionalComponentArgsRest(__VLS_38));
__VLS_40.slots.default;
const __VLS_41 = {}.ElAside;
/** @type {[typeof __VLS_components.ElAside, typeof __VLS_components.elAside, typeof __VLS_components.ElAside, typeof __VLS_components.elAside, ]} */ ;
// @ts-ignore
const __VLS_42 = __VLS_asFunctionalComponent(__VLS_41, new __VLS_41({
    width: "220px",
    ...{ class: "performance-aside" },
}));
const __VLS_43 = __VLS_42({
    width: "220px",
    ...{ class: "performance-aside" },
}, ...__VLS_functionalComponentArgsRest(__VLS_42));
__VLS_44.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "aside-title" },
});
(__VLS_ctx.activeTab?.label || '绩效管理');
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.activeMenu))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.router.push(item.path);
            } },
        key: (item.key),
        ...{ class: "menu-item" },
        ...{ class: ({ active: item.path === __VLS_ctx.route.path }) },
    });
    (item.label);
}
var __VLS_44;
const __VLS_45 = {}.ElMain;
/** @type {[typeof __VLS_components.ElMain, typeof __VLS_components.elMain, typeof __VLS_components.ElMain, typeof __VLS_components.elMain, ]} */ ;
// @ts-ignore
const __VLS_46 = __VLS_asFunctionalComponent(__VLS_45, new __VLS_45({
    ...{ class: "performance-main" },
}));
const __VLS_47 = __VLS_46({
    ...{ class: "performance-main" },
}, ...__VLS_functionalComponentArgsRest(__VLS_46));
__VLS_48.slots.default;
const __VLS_49 = {}.RouterView;
/** @type {[typeof __VLS_components.RouterView, typeof __VLS_components.routerView, ]} */ ;
// @ts-ignore
const __VLS_50 = __VLS_asFunctionalComponent(__VLS_49, new __VLS_49({}));
const __VLS_51 = __VLS_50({}, ...__VLS_functionalComponentArgsRest(__VLS_50));
var __VLS_48;
var __VLS_40;
/** @type {[typeof GlobalAiAssistant, ]} */ ;
// @ts-ignore
const __VLS_53 = __VLS_asFunctionalComponent(GlobalAiAssistant, new GlobalAiAssistant({}));
const __VLS_54 = __VLS_53({}, ...__VLS_functionalComponentArgsRest(__VLS_53));
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['performance-app']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-header']} */ ;
/** @type {__VLS_StyleScopedClasses['header-left']} */ ;
/** @type {__VLS_StyleScopedClasses['portal-link']} */ ;
/** @type {__VLS_StyleScopedClasses['divider']} */ ;
/** @type {__VLS_StyleScopedClasses['app-name']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-button']} */ ;
/** @type {__VLS_StyleScopedClasses['header-right']} */ ;
/** @type {__VLS_StyleScopedClasses['user-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['user-name']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-body']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-aside']} */ ;
/** @type {__VLS_StyleScopedClasses['aside-title']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-item']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-main']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ArrowDown: ArrowDown,
            GlobalAiAssistant: GlobalAiAssistant,
            route: route,
            router: router,
            userStore: userStore,
            canAdmin: canAdmin,
            userInitial: userInitial,
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
