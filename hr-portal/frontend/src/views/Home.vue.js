/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '@/stores/user';
import { TOOLS_CATALOG } from '@/constants/toolsCatalog';
import ToolCard from '@/components/ToolCard.vue';
const userStore = useUserStore();
const router = useRouter();
// C1：快速进入只显示有权限的工具，与工具中心同源（TOOLS_CATALOG）同样式（ToolCard）
const visibleTools = computed(() => TOOLS_CATALOG.filter((t) => userStore.menus.some((m) => m.code === t.code)));
const greeting = computed(() => {
    const h = new Date().getHours();
    if (h < 6)
        return '夜深了';
    if (h < 11)
        return '早上好';
    if (h < 14)
        return '中午好';
    if (h < 18)
        return '下午好';
    return '晚上好';
});
const today = computed(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
const __VLS_0 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ style: {} },
}));
const __VLS_2 = __VLS_1({
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
(__VLS_ctx.today);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
(__VLS_ctx.greeting);
(__VLS_ctx.userStore.user?.display_name || '同事');
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
(__VLS_ctx.userStore.roles.join(' / ') || '无');
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
(__VLS_ctx.userStore.menus.length);
var __VLS_3;
const __VLS_4 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({}));
const __VLS_6 = __VLS_5({}, ...__VLS_functionalComponentArgsRest(__VLS_5));
__VLS_7.slots.default;
{
    const { header: __VLS_thisSlot } = __VLS_7.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: {} },
    });
}
if (!__VLS_ctx.visibleTools.length) {
    const __VLS_8 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        description: "暂无可用工具，请联系管理员开通提效工具权限",
    }));
    const __VLS_10 = __VLS_9({
        description: "暂无可用工具，请联系管理员开通提效工具权限",
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "tool-grid" },
    });
    for (const [tool] of __VLS_getVForSourceType((__VLS_ctx.visibleTools))) {
        /** @type {[typeof ToolCard, ]} */ ;
        // @ts-ignore
        const __VLS_12 = __VLS_asFunctionalComponent(ToolCard, new ToolCard({
            ...{ 'onOpen': {} },
            key: (tool.code),
            tool: (tool),
        }));
        const __VLS_13 = __VLS_12({
            ...{ 'onOpen': {} },
            key: (tool.code),
            tool: (tool),
        }, ...__VLS_functionalComponentArgsRest(__VLS_12));
        let __VLS_15;
        let __VLS_16;
        let __VLS_17;
        const __VLS_18 = {
            onOpen: (__VLS_ctx.router.push)
        };
        var __VLS_14;
    }
}
var __VLS_7;
/** @type {__VLS_StyleScopedClasses['tool-grid']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ToolCard: ToolCard,
            userStore: userStore,
            router: router,
            visibleTools: visibleTools,
            greeting: greeting,
            today: today,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
