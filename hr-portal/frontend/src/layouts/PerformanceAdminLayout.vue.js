/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useUserStore } from '@/stores/user';
import PerformanceExpandButton from '@/components/performance/PerformanceExpandButton.vue';
import PerformanceBrand from '@/components/performance/PerformanceBrand.vue';
import { DEFAULT_PERFORMANCE_ADMIN_SECTION, PERFORMANCE_ADMIN_MENU_ITEMS, } from '@/utils/performanceAdminNavigation';
const router = useRouter();
const route = useRoute();
const userStore = useUserStore();
const menuItems = PERFORMANCE_ADMIN_MENU_ITEMS;
const activeSection = ref(DEFAULT_PERFORMANCE_ADMIN_SECTION);
const evaluationExpanded = ref(false);
const userInitial = computed(() => userStore.user?.display_name?.trim().slice(0, 1) || '我');
watch(() => route.name, (name) => {
    if (name === 'PerformanceCycles' || name === 'PerformanceCycleCreate' || name === 'PerformanceCycleEdit')
        activeSection.value = 'cycles-projects';
    if (name === 'PerformanceTemplates')
        activeSection.value = 'templates';
    if (name === 'ReviewQuestionManagement' || name === 'ReviewQuestionCreate' || name === 'ReviewQuestionEdit' || name === 'ReviewRuleCreate' || name === 'ReviewRuleEdit' || name === 'TaggedFillQuestionManagement' || name === 'TaggedFillQuestionCreate' || name === 'TaggedFillQuestionEdit') {
        activeSection.value = 'evaluation-questions';
        evaluationExpanded.value = true;
    }
}, { immediate: true });
function navigateSection(section) {
    activeSection.value = section;
    if (section === 'cycles-projects')
        void router.push({ name: 'PerformanceCycles' });
    if (section === 'templates')
        void router.push({ name: 'PerformanceTemplates' });
    if (section === 'evaluation-questions')
        evaluationExpanded.value = !evaluationExpanded.value;
}
function toggleEvaluation() {
    evaluationExpanded.value = !evaluationExpanded.value;
}
function goReviewQuestions() {
    void router.push({ name: 'ReviewQuestionManagement' });
}
function goTaggedFillQuestions() {
    void router.push({ name: 'TaggedFillQuestionManagement' });
}
async function handleUserCommand(command) {
    await userStore.logout();
    await router.replace({ name: 'Login' });
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['performance-admin-app']} */ ;
/** @type {__VLS_StyleScopedClasses['user-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-menu-item']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-menu-item']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-menu-item']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-menu-item']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-menu-item']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-menu-item']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['el-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-submenu-item']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-submenu-item']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-submenu-item']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-admin-main']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-admin-main']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-admin-app']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-admin-aside']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-menu-item']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "performance-admin-app" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "performance-admin-header" },
});
/** @type {[typeof PerformanceBrand, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(PerformanceBrand, new PerformanceBrand({
    label: "创梦绩效设置",
    theme: "dark",
    ...{ class: "brand" },
}));
const __VLS_1 = __VLS_0({
    label: "创梦绩效设置",
    theme: "dark",
    ...{ class: "brand" },
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
const __VLS_3 = {}.ElDropdown;
/** @type {[typeof __VLS_components.ElDropdown, typeof __VLS_components.elDropdown, typeof __VLS_components.ElDropdown, typeof __VLS_components.elDropdown, ]} */ ;
// @ts-ignore
const __VLS_4 = __VLS_asFunctionalComponent(__VLS_3, new __VLS_3({
    ...{ 'onCommand': {} },
    trigger: "click",
}));
const __VLS_5 = __VLS_4({
    ...{ 'onCommand': {} },
    trigger: "click",
}, ...__VLS_functionalComponentArgsRest(__VLS_4));
let __VLS_7;
let __VLS_8;
let __VLS_9;
const __VLS_10 = {
    onCommand: (__VLS_ctx.handleUserCommand)
};
__VLS_6.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ class: "user-trigger" },
    type: "button",
    'aria-label': "用户菜单",
});
const __VLS_11 = {}.ElAvatar;
/** @type {[typeof __VLS_components.ElAvatar, typeof __VLS_components.elAvatar, typeof __VLS_components.ElAvatar, typeof __VLS_components.elAvatar, ]} */ ;
// @ts-ignore
const __VLS_12 = __VLS_asFunctionalComponent(__VLS_11, new __VLS_11({
    size: (28),
}));
const __VLS_13 = __VLS_12({
    size: (28),
}, ...__VLS_functionalComponentArgsRest(__VLS_12));
__VLS_14.slots.default;
(__VLS_ctx.userInitial);
var __VLS_14;
{
    const { dropdown: __VLS_thisSlot } = __VLS_6.slots;
    const __VLS_15 = {}.ElDropdownMenu;
    /** @type {[typeof __VLS_components.ElDropdownMenu, typeof __VLS_components.elDropdownMenu, typeof __VLS_components.ElDropdownMenu, typeof __VLS_components.elDropdownMenu, ]} */ ;
    // @ts-ignore
    const __VLS_16 = __VLS_asFunctionalComponent(__VLS_15, new __VLS_15({}));
    const __VLS_17 = __VLS_16({}, ...__VLS_functionalComponentArgsRest(__VLS_16));
    __VLS_18.slots.default;
    const __VLS_19 = {}.ElDropdownItem;
    /** @type {[typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, ]} */ ;
    // @ts-ignore
    const __VLS_20 = __VLS_asFunctionalComponent(__VLS_19, new __VLS_19({
        command: "logout",
    }));
    const __VLS_21 = __VLS_20({
        command: "logout",
    }, ...__VLS_functionalComponentArgsRest(__VLS_20));
    __VLS_22.slots.default;
    var __VLS_22;
    var __VLS_18;
}
var __VLS_6;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "performance-admin-body" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
    ...{ class: "performance-admin-aside" },
    'aria-label': "应用设置导航",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "aside-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.nav, __VLS_intrinsicElements.nav)({
    ...{ class: "admin-menu" },
});
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.menuItems))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (item.key),
        ...{ class: "menu-entry" },
    });
    if (item.key === 'evaluation-questions') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ onClick: (...[$event]) => {
                    if (!(item.key === 'evaluation-questions'))
                        return;
                    __VLS_ctx.navigateSection(item.key);
                } },
            ...{ onKeydown: (...[$event]) => {
                    if (!(item.key === 'evaluation-questions'))
                        return;
                    __VLS_ctx.navigateSection(item.key);
                } },
            ...{ onKeydown: (...[$event]) => {
                    if (!(item.key === 'evaluation-questions'))
                        return;
                    __VLS_ctx.navigateSection(item.key);
                } },
            ...{ class: "admin-menu-item has-expand" },
            'aria-expanded': (__VLS_ctx.evaluationExpanded),
            role: "button",
            tabindex: "0",
        });
        const __VLS_23 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_24 = __VLS_asFunctionalComponent(__VLS_23, new __VLS_23({}));
        const __VLS_25 = __VLS_24({}, ...__VLS_functionalComponentArgsRest(__VLS_24));
        __VLS_26.slots.default;
        const __VLS_27 = ((item.icon));
        // @ts-ignore
        const __VLS_28 = __VLS_asFunctionalComponent(__VLS_27, new __VLS_27({}));
        const __VLS_29 = __VLS_28({}, ...__VLS_functionalComponentArgsRest(__VLS_28));
        var __VLS_26;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "menu-label" },
        });
        (item.label);
        /** @type {[typeof PerformanceExpandButton, ]} */ ;
        // @ts-ignore
        const __VLS_31 = __VLS_asFunctionalComponent(PerformanceExpandButton, new PerformanceExpandButton({
            ...{ 'onClick': {} },
            ...{ 'onToggle': {} },
            variant: "navigation",
            iconVariant: "regular",
            label: "展开或收起评估题管理",
            expanded: (__VLS_ctx.evaluationExpanded),
        }));
        const __VLS_32 = __VLS_31({
            ...{ 'onClick': {} },
            ...{ 'onToggle': {} },
            variant: "navigation",
            iconVariant: "regular",
            label: "展开或收起评估题管理",
            expanded: (__VLS_ctx.evaluationExpanded),
        }, ...__VLS_functionalComponentArgsRest(__VLS_31));
        let __VLS_34;
        let __VLS_35;
        let __VLS_36;
        const __VLS_37 = {
            onClick: () => { }
        };
        const __VLS_38 = {
            onToggle: (__VLS_ctx.toggleEvaluation)
        };
        var __VLS_33;
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(item.key === 'evaluation-questions'))
                        return;
                    __VLS_ctx.navigateSection(item.key);
                } },
            ...{ class: "admin-menu-item" },
            ...{ class: ({ active: __VLS_ctx.activeSection === item.key }) },
            'aria-current': (__VLS_ctx.activeSection === item.key ? 'page' : undefined),
            type: "button",
        });
        const __VLS_39 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_40 = __VLS_asFunctionalComponent(__VLS_39, new __VLS_39({}));
        const __VLS_41 = __VLS_40({}, ...__VLS_functionalComponentArgsRest(__VLS_40));
        __VLS_42.slots.default;
        const __VLS_43 = ((item.icon));
        // @ts-ignore
        const __VLS_44 = __VLS_asFunctionalComponent(__VLS_43, new __VLS_43({}));
        const __VLS_45 = __VLS_44({}, ...__VLS_functionalComponentArgsRest(__VLS_44));
        var __VLS_42;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "menu-label" },
        });
        (item.label);
    }
    if (item.key === 'evaluation-questions' && __VLS_ctx.evaluationExpanded) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "admin-submenu" },
            'aria-label': "评估题管理子菜单",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.goReviewQuestions) },
            ...{ class: "admin-submenu-item" },
            ...{ class: ({ active: __VLS_ctx.route.name === 'ReviewQuestionManagement' }) },
            type: "button",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.goTaggedFillQuestions) },
            ...{ class: "admin-submenu-item" },
            ...{ class: ({ active: __VLS_ctx.route.name === 'TaggedFillQuestionManagement' }) },
            type: "button",
        });
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
    ...{ class: "performance-admin-main" },
});
const __VLS_47 = {}.RouterView;
/** @type {[typeof __VLS_components.RouterView, typeof __VLS_components.routerView, ]} */ ;
// @ts-ignore
const __VLS_48 = __VLS_asFunctionalComponent(__VLS_47, new __VLS_47({
    section: (__VLS_ctx.activeSection),
}));
const __VLS_49 = __VLS_48({
    section: (__VLS_ctx.activeSection),
}, ...__VLS_functionalComponentArgsRest(__VLS_48));
/** @type {__VLS_StyleScopedClasses['performance-admin-app']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-admin-header']} */ ;
/** @type {__VLS_StyleScopedClasses['brand']} */ ;
/** @type {__VLS_StyleScopedClasses['user-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-admin-body']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-admin-aside']} */ ;
/** @type {__VLS_StyleScopedClasses['aside-title']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-menu']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-entry']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-menu-item']} */ ;
/** @type {__VLS_StyleScopedClasses['has-expand']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-label']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-menu-item']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-label']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-submenu']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-submenu-item']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-submenu-item']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-admin-main']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformanceExpandButton: PerformanceExpandButton,
            PerformanceBrand: PerformanceBrand,
            route: route,
            menuItems: menuItems,
            activeSection: activeSection,
            evaluationExpanded: evaluationExpanded,
            userInitial: userInitial,
            navigateSection: navigateSection,
            toggleEvaluation: toggleEvaluation,
            goReviewQuestions: goReviewQuestions,
            goTaggedFillQuestions: goTaggedFillQuestions,
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
