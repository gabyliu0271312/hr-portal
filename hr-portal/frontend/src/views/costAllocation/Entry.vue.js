/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, ref } from 'vue';
import { onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Histogram, Link, Setting } from '@element-plus/icons-vue';
import { api } from '@/api/client';
const route = useRoute();
const DEFAULT_PRODUCTION_APP_URL = 'http://192.168.10.13:37800/';
const appUrl = (import.meta.env.VITE_COST_ALLOCATION_APP_URL || DEFAULT_PRODUCTION_APP_URL).trim();
const configuredAdminUrl = (import.meta.env.VITE_COST_ALLOCATION_ADMIN_URL || '').trim();
const loading = ref(false);
const isAdminEntry = computed(() => route.meta.entryType === 'admin');
const adminUrl = computed(() => configuredAdminUrl || joinUrl(appUrl, '/admin/workbench'));
const targetUrl = computed(() => (isAdminEntry.value ? adminUrl.value : appUrl));
const normalizedTargetUrl = computed(() => normalizeUrl(targetUrl.value));
const entryType = computed(() => (isAdminEntry.value ? 'admin' : 'app'));
const pageTitle = computed(() => (isAdminEntry.value ? '成本分摊后台入口' : '人力成本分摊系统'));
const cardTitle = computed(() => (isAdminEntry.value ? '打开成本分摊后台' : '打开成本分摊系统'));
const cardDesc = computed(() => isAdminEntry.value
    ? '将直接进入生产环境的成本分摊系统后台。'
    : '将直接进入生产环境的人力成本分摊系统。');
const accessCode = computed(() => (isAdminEntry.value ? 'cost_allocation.admin' : 'cost_allocation.app'));
onMounted(() => {
    redirectToProduction();
});
watch(() => route.fullPath, () => {
    redirectToProduction();
});
function normalizeUrl(url) {
    const value = url.trim();
    if (!value)
        return '';
    if (/^https?:\/\//i.test(value))
        return value;
    return `https://${value}`;
}
function joinUrl(base, path) {
    if (!base)
        return '';
    return `${base.replace(/\/+$/, '')}${path}`;
}
function openCurrentTab() {
    redirectToProduction();
}
async function openNewTab() {
    const url = await getSsoUrl();
    if (!url) {
        return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
}
async function redirectToProduction() {
    const url = await getSsoUrl();
    if (!url)
        return;
    window.location.replace(url);
}
async function getSsoUrl() {
    if (loading.value)
        return '';
    loading.value = true;
    try {
        const resp = await api.get('/cost-allocation/external-sso-url', {
            params: { entry_type: entryType.value },
        });
        return resp.data.url;
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.detail || '获取成本分摊飞书登录地址失败');
        return '';
    }
    finally {
        loading.value = false;
    }
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['page-head']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title']} */ ;
/** @type {__VLS_StyleScopedClasses['entry-grid']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "entry-page" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "page-head" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "eyebrow" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({});
(__VLS_ctx.pageTitle);
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
(__VLS_ctx.normalizedTargetUrl ? '正在跳转到生产环境' : 'HR Portal 控制入口权限，成本分摊系统继续控制内部角色、流程和数据范围。');
const __VLS_0 = {}.ElTag;
/** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    type: "primary",
    effect: "plain",
}));
const __VLS_2 = __VLS_1({
    type: "primary",
    effect: "plain",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
var __VLS_3;
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "entry-grid" },
});
const __VLS_4 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
    ...{ class: "entry-card" },
    shadow: "never",
}));
const __VLS_6 = __VLS_5({
    ...{ class: "entry-card" },
    shadow: "never",
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
__VLS_7.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "card-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "card-icon" },
});
const __VLS_8 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({}));
const __VLS_10 = __VLS_9({}, ...__VLS_functionalComponentArgsRest(__VLS_9));
__VLS_11.slots.default;
const __VLS_12 = {}.Histogram;
/** @type {[typeof __VLS_components.Histogram, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({}));
const __VLS_14 = __VLS_13({}, ...__VLS_functionalComponentArgsRest(__VLS_13));
var __VLS_11;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
(__VLS_ctx.cardTitle);
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
(__VLS_ctx.cardDesc);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "action-row" },
});
const __VLS_16 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    ...{ 'onClick': {} },
    type: "primary",
    loading: (__VLS_ctx.loading),
}));
const __VLS_18 = __VLS_17({
    ...{ 'onClick': {} },
    type: "primary",
    loading: (__VLS_ctx.loading),
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
let __VLS_20;
let __VLS_21;
let __VLS_22;
const __VLS_23 = {
    onClick: (__VLS_ctx.openCurrentTab)
};
__VLS_19.slots.default;
const __VLS_24 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({}));
const __VLS_26 = __VLS_25({}, ...__VLS_functionalComponentArgsRest(__VLS_25));
__VLS_27.slots.default;
const __VLS_28 = {}.Link;
/** @type {[typeof __VLS_components.Link, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({}));
const __VLS_30 = __VLS_29({}, ...__VLS_functionalComponentArgsRest(__VLS_29));
var __VLS_27;
var __VLS_19;
const __VLS_32 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    ...{ 'onClick': {} },
    loading: (__VLS_ctx.loading),
}));
const __VLS_34 = __VLS_33({
    ...{ 'onClick': {} },
    loading: (__VLS_ctx.loading),
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
let __VLS_36;
let __VLS_37;
let __VLS_38;
const __VLS_39 = {
    onClick: (__VLS_ctx.openNewTab)
};
__VLS_35.slots.default;
var __VLS_35;
if (!__VLS_ctx.normalizedTargetUrl) {
    const __VLS_40 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
        ...{ class: "config-alert" },
        type: "warning",
        closable: (false),
        showIcon: true,
        title: "未配置成本分摊系统地址",
        description: "请配置 VITE_COST_ALLOCATION_APP_URL，后台入口可选配置 VITE_COST_ALLOCATION_ADMIN_URL，然后重新构建前端。",
    }));
    const __VLS_42 = __VLS_41({
        ...{ class: "config-alert" },
        type: "warning",
        closable: (false),
        showIcon: true,
        title: "未配置成本分摊系统地址",
        description: "请配置 VITE_COST_ALLOCATION_APP_URL，后台入口可选配置 VITE_COST_ALLOCATION_ADMIN_URL，然后重新构建前端。",
    }, ...__VLS_functionalComponentArgsRest(__VLS_41));
}
var __VLS_7;
const __VLS_44 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
    ...{ class: "info-card" },
    shadow: "never",
}));
const __VLS_46 = __VLS_45({
    ...{ class: "info-card" },
    shadow: "never",
}, ...__VLS_functionalComponentArgsRest(__VLS_45));
__VLS_47.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "info-title" },
});
const __VLS_48 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({}));
const __VLS_50 = __VLS_49({}, ...__VLS_functionalComponentArgsRest(__VLS_49));
__VLS_51.slots.default;
const __VLS_52 = {}.Setting;
/** @type {[typeof __VLS_components.Setting, ]} */ ;
// @ts-ignore
const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({}));
const __VLS_54 = __VLS_53({}, ...__VLS_functionalComponentArgsRest(__VLS_53));
var __VLS_51;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.dl, __VLS_intrinsicElements.dl)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.dt, __VLS_intrinsicElements.dt)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.dd, __VLS_intrinsicElements.dd)({});
(__VLS_ctx.accessCode);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.dt, __VLS_intrinsicElements.dt)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.dd, __VLS_intrinsicElements.dd)({});
(__VLS_ctx.normalizedTargetUrl || '未配置');
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.dt, __VLS_intrinsicElements.dt)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.dd, __VLS_intrinsicElements.dd)({});
var __VLS_47;
/** @type {__VLS_StyleScopedClasses['entry-page']} */ ;
/** @type {__VLS_StyleScopedClasses['page-head']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['entry-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['entry-card']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title']} */ ;
/** @type {__VLS_StyleScopedClasses['card-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['action-row']} */ ;
/** @type {__VLS_StyleScopedClasses['config-alert']} */ ;
/** @type {__VLS_StyleScopedClasses['info-card']} */ ;
/** @type {__VLS_StyleScopedClasses['info-title']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Histogram: Histogram,
            Link: Link,
            Setting: Setting,
            loading: loading,
            normalizedTargetUrl: normalizedTargetUrl,
            pageTitle: pageTitle,
            cardTitle: cardTitle,
            cardDesc: cardDesc,
            accessCode: accessCode,
            openCurrentTab: openCurrentTab,
            openNewTab: openNewTab,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
