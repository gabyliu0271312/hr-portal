/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useUserStore } from '@/stores/user';
import { ElMessageBox, ElMessage } from 'element-plus';
import { Avatar } from '@element-plus/icons-vue';
import { authApi } from '@/api/auth';
import { MENU_ROUTE_MAP } from '@/constants/menuRoutes';
import GlobalAiAssistant from '@/components/GlobalAiAssistant.vue';
import { PASSWORD_POLICY_HINT, validatePasswordPolicy } from '@/utils/passwordPolicy';
const router = useRouter();
const route = useRoute();
const userStore = useUserStore();
/** 把后端三层菜单结构组织成 TabMenu[] */
const tabGroups = computed(() => {
    return userStore.topMenus.map((tab) => {
        const groups = userStore.childrenOf(tab.id).map((g) => {
            const leaves = userStore.childrenOf(g.id).map((leaf) => ({
                id: leaf.id,
                code: leaf.code,
                label: leaf.label,
                routePath: MENU_ROUTE_MAP[leaf.code] ?? '/home',
            }));
            return {
                id: g.id,
                code: g.code,
                label: g.label,
                routePath: MENU_ROUTE_MAP[g.code] ?? '/home',
                children: leaves,
            };
        });
        return {
            id: tab.id,
            code: tab.code,
            label: tab.label,
            routePath: MENU_ROUTE_MAP[tab.code] ?? '/home',
            children: groups,
        };
    });
});
function tabContainsMenuCode(tab, code) {
    return tab.code === code
        || tab.children.some((g) => g.code === code || g.children.some((leaf) => leaf.code === code));
}
/** 当前激活的 tab：优先根据 menuCode 反查，动态路由再回退到 path 匹配 */
const activeTabId = computed(() => {
    const code = route.meta.menuCode;
    if (code) {
        const tab = tabGroups.value.find((item) => tabContainsMenuCode(item, code));
        if (tab)
            return tab.id;
    }
    for (const tab of tabGroups.value) {
        for (const g of tab.children) {
            if (g.routePath === route.path)
                return tab.id;
            for (const leaf of g.children) {
                if (leaf.routePath === route.path)
                    return tab.id;
            }
        }
    }
    return tabGroups.value[0]?.id ?? null;
});
const hideAside = computed(() => route.meta.hideAside === true);
/** 当前 tab 下的左侧菜单（二级分组 + 三级叶子）*/
const leftMenu = computed(() => {
    if (hideAside.value)
        return [];
    const tab = tabGroups.value.find((t) => t.id === activeTabId.value);
    if (!tab)
        return [];
    return tab.children;
});
/**
 * 叶子高亮判断：
 * 1) 优先用 menuCode 严格匹配（不同菜单即使误映射到同一 path 也只高亮一个）
 * 2) 兜底用 routePath 匹配（处理动态路由没有 menuCode 的场景）
 */
function isLeafActive(leaf) {
    const currentCode = route.meta.menuCode;
    if (currentCode && leaf.code === currentCode)
        return true;
    if (leaf.routePath && leaf.routePath === route.path)
        return true;
    return false;
}
// UCP 导航重构：基于用户实际权限聚合判断，7 项四字菜单
const UCP_MENU_AGGREGATION = {
    'ucp.systems': ['ucp.systems'],
    'ucp.connector_catalog': ['ucp.connector_catalog'],
    'ucp.pipelines': ['ucp.pipelines'],
    'ucp.executions': ['ucp.executions'],
    'ucp.events': ['ucp.events'],
    'ucp.monitor': ['ucp.monitor'],
    'ucp.scenarios': ['ucp.scenarios', 'ucp.oa_sync', 'ucp.external_accounts'],
    'ucp.assets': ['ucp.assets', 'ucp.governance'],
};
const visibleLeftMenu = computed(() => {
    const userCodes = new Set(userStore.menus.map(m => m.code));
    return leftMenu.value.filter((g) => {
        if (!g.code.startsWith('ucp.'))
            return true;
        if (g.code.endsWith('_group'))
            return false;
        const required = UCP_MENU_AGGREGATION[g.code];
        if (!required)
            return false;
        return required.some(code => userCodes.has(code));
    });
});
function onTabClick(tab) {
    // 如果该 tab 有自己的首页路由（如 /warehouse），直接跳转
    if (tab.routePath && tab.routePath !== '/home') {
        router.push(tab.routePath);
        return;
    }
    // 否则跳到该 tab 下第一个可达的叶子或分组
    const firstGroup = tab.children[0];
    if (!firstGroup)
        return;
    const firstLeaf = firstGroup.children[0];
    if (firstLeaf) {
        router.push(firstLeaf.routePath);
    }
    else {
        router.push(firstGroup.routePath);
    }
}
async function handleCommand(cmd) {
    if (cmd === 'logout') {
        try {
            await ElMessageBox.confirm('确定退出登录？', '提示', {
                type: 'warning',
                confirmButtonText: '退出',
                cancelButtonText: '取消',
            });
        }
        catch {
            return;
        }
        await userStore.logout();
        router.push('/login');
    }
    else if (cmd === 'changePassword') {
        try {
            const { value: oldPwd } = await ElMessageBox.prompt('请输入当前密码', '修改密码', { inputType: 'password', confirmButtonText: '下一步' });
            const { value: newPwd } = await ElMessageBox.prompt(`请输入新密码（${PASSWORD_POLICY_HINT}）`, '修改密码', { inputType: 'password', confirmButtonText: '提交' });
            const passwordError = validatePasswordPolicy(newPwd);
            if (passwordError) {
                ElMessage.warning(passwordError);
                return;
            }
            await authApi.changePassword(oldPwd, newPwd);
            ElMessage.success('密码已更新');
        }
        catch (e) {
            if (e === 'cancel' || e?.message === 'cancel')
                return;
            ElMessage.error(e?.response?.data?.detail || '修改失败');
        }
    }
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['system-name']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-item']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-item']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-item']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['leaf-item']} */ ;
/** @type {__VLS_StyleScopedClasses['leaf-item']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
// CSS variable injection 
// CSS variable injection end 
const __VLS_0 = {}.ElContainer;
/** @type {[typeof __VLS_components.ElContainer, typeof __VLS_components.elContainer, typeof __VLS_components.ElContainer, typeof __VLS_components.elContainer, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ style: {} },
}));
const __VLS_2 = __VLS_1({
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
var __VLS_4 = {};
__VLS_3.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "app-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "header-left" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.router.push('/home');
        } },
    ...{ class: "system-name" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.nav, __VLS_intrinsicElements.nav)({
    ...{ class: "top-tabs" },
});
for (const [g] of __VLS_getVForSourceType((__VLS_ctx.tabGroups))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.onTabClick(g);
            } },
        key: (g.id),
        ...{ class: "tab-item" },
        ...{ class: ({ active: __VLS_ctx.activeTabId === g.id }) },
    });
    (g.label);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "header-right" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "user-name" },
});
(__VLS_ctx.userStore.user?.display_name);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "user-roles" },
});
(__VLS_ctx.userStore.roles.join(' / ') || '无角色');
const __VLS_5 = {}.ElDropdown;
/** @type {[typeof __VLS_components.ElDropdown, typeof __VLS_components.elDropdown, typeof __VLS_components.ElDropdown, typeof __VLS_components.elDropdown, ]} */ ;
// @ts-ignore
const __VLS_6 = __VLS_asFunctionalComponent(__VLS_5, new __VLS_5({
    ...{ 'onCommand': {} },
}));
const __VLS_7 = __VLS_6({
    ...{ 'onCommand': {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_6));
let __VLS_9;
let __VLS_10;
let __VLS_11;
const __VLS_12 = {
    onCommand: (__VLS_ctx.handleCommand)
};
__VLS_8.slots.default;
const __VLS_13 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_14 = __VLS_asFunctionalComponent(__VLS_13, new __VLS_13({
    text: true,
}));
const __VLS_15 = __VLS_14({
    text: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_14));
__VLS_16.slots.default;
const __VLS_17 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_18 = __VLS_asFunctionalComponent(__VLS_17, new __VLS_17({}));
const __VLS_19 = __VLS_18({}, ...__VLS_functionalComponentArgsRest(__VLS_18));
__VLS_20.slots.default;
const __VLS_21 = {}.Avatar;
/** @type {[typeof __VLS_components.Avatar, ]} */ ;
// @ts-ignore
const __VLS_22 = __VLS_asFunctionalComponent(__VLS_21, new __VLS_21({}));
const __VLS_23 = __VLS_22({}, ...__VLS_functionalComponentArgsRest(__VLS_22));
var __VLS_20;
var __VLS_16;
{
    const { dropdown: __VLS_thisSlot } = __VLS_8.slots;
    const __VLS_25 = {}.ElDropdownMenu;
    /** @type {[typeof __VLS_components.ElDropdownMenu, typeof __VLS_components.elDropdownMenu, typeof __VLS_components.ElDropdownMenu, typeof __VLS_components.elDropdownMenu, ]} */ ;
    // @ts-ignore
    const __VLS_26 = __VLS_asFunctionalComponent(__VLS_25, new __VLS_25({}));
    const __VLS_27 = __VLS_26({}, ...__VLS_functionalComponentArgsRest(__VLS_26));
    __VLS_28.slots.default;
    const __VLS_29 = {}.ElDropdownItem;
    /** @type {[typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, ]} */ ;
    // @ts-ignore
    const __VLS_30 = __VLS_asFunctionalComponent(__VLS_29, new __VLS_29({
        command: "changePassword",
    }));
    const __VLS_31 = __VLS_30({
        command: "changePassword",
    }, ...__VLS_functionalComponentArgsRest(__VLS_30));
    __VLS_32.slots.default;
    var __VLS_32;
    const __VLS_33 = {}.ElDropdownItem;
    /** @type {[typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, ]} */ ;
    // @ts-ignore
    const __VLS_34 = __VLS_asFunctionalComponent(__VLS_33, new __VLS_33({
        command: "logout",
        divided: true,
    }));
    const __VLS_35 = __VLS_34({
        command: "logout",
        divided: true,
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
    ...{ style: {} },
}));
const __VLS_39 = __VLS_38({
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_38));
__VLS_40.slots.default;
if (!__VLS_ctx.hideAside && __VLS_ctx.visibleLeftMenu.length) {
    const __VLS_41 = {}.ElAside;
    /** @type {[typeof __VLS_components.ElAside, typeof __VLS_components.elAside, typeof __VLS_components.ElAside, typeof __VLS_components.elAside, ]} */ ;
    // @ts-ignore
    const __VLS_42 = __VLS_asFunctionalComponent(__VLS_41, new __VLS_41({
        width: "220px",
        ...{ class: "app-aside" },
    }));
    const __VLS_43 = __VLS_42({
        width: "220px",
        ...{ class: "app-aside" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_42));
    __VLS_44.slots.default;
    for (const [grp] of __VLS_getVForSourceType((__VLS_ctx.visibleLeftMenu))) {
        (grp.id);
        if (grp.children.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "group-title" },
            });
            (grp.label);
            for (const [c] of __VLS_getVForSourceType((grp.children))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ onClick: (...[$event]) => {
                            if (!(!__VLS_ctx.hideAside && __VLS_ctx.visibleLeftMenu.length))
                                return;
                            if (!(grp.children.length))
                                return;
                            __VLS_ctx.router.push(c.routePath);
                        } },
                    key: (c.id),
                    ...{ class: "leaf-item" },
                    ...{ class: ({ active: __VLS_ctx.isLeafActive(c) }) },
                });
                (c.label);
            }
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ onClick: (...[$event]) => {
                        if (!(!__VLS_ctx.hideAside && __VLS_ctx.visibleLeftMenu.length))
                            return;
                        if (!!(grp.children.length))
                            return;
                        __VLS_ctx.router.push(grp.routePath);
                    } },
                ...{ class: "leaf-item leaf-item--single" },
                ...{ class: ({ active: __VLS_ctx.isLeafActive(grp) }) },
            });
            (grp.label);
        }
    }
    var __VLS_44;
}
const __VLS_45 = {}.ElMain;
/** @type {[typeof __VLS_components.ElMain, typeof __VLS_components.elMain, typeof __VLS_components.ElMain, typeof __VLS_components.elMain, ]} */ ;
// @ts-ignore
const __VLS_46 = __VLS_asFunctionalComponent(__VLS_45, new __VLS_45({
    ...{ style: {} },
}));
const __VLS_47 = __VLS_46({
    ...{ style: {} },
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
/** @type {__VLS_StyleScopedClasses['app-header']} */ ;
/** @type {__VLS_StyleScopedClasses['header-left']} */ ;
/** @type {__VLS_StyleScopedClasses['system-name']} */ ;
/** @type {__VLS_StyleScopedClasses['top-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-item']} */ ;
/** @type {__VLS_StyleScopedClasses['header-right']} */ ;
/** @type {__VLS_StyleScopedClasses['user-name']} */ ;
/** @type {__VLS_StyleScopedClasses['user-roles']} */ ;
/** @type {__VLS_StyleScopedClasses['app-aside']} */ ;
/** @type {__VLS_StyleScopedClasses['group-title']} */ ;
/** @type {__VLS_StyleScopedClasses['leaf-item']} */ ;
/** @type {__VLS_StyleScopedClasses['leaf-item']} */ ;
/** @type {__VLS_StyleScopedClasses['leaf-item--single']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Avatar: Avatar,
            GlobalAiAssistant: GlobalAiAssistant,
            router: router,
            userStore: userStore,
            tabGroups: tabGroups,
            activeTabId: activeTabId,
            hideAside: hideAside,
            isLeafActive: isLeafActive,
            visibleLeftMenu: visibleLeftMenu,
            onTabClick: onTabClick,
            handleCommand: handleCommand,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
