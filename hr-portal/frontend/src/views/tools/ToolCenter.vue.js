/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '@/stores/user';
import { TOOLS_CATALOG } from '@/constants/toolsCatalog';
import ToolCard from '@/components/ToolCard.vue';
const router = useRouter();
const userStore = useUserStore();
const visibleTools = computed(() => TOOLS_CATALOG.filter((t) => userStore.menus.some((m) => m.code === t.code)));
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
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({}));
const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
{
    const { header: __VLS_thisSlot } = __VLS_3.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
}
if (!__VLS_ctx.visibleTools.length) {
    const __VLS_4 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        description: "暂无可用工具，请联系管理员开通提效工具权限",
    }));
    const __VLS_6 = __VLS_5({
        description: "暂无可用工具，请联系管理员开通提效工具权限",
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "tool-grid" },
    });
    for (const [tool] of __VLS_getVForSourceType((__VLS_ctx.visibleTools))) {
        /** @type {[typeof ToolCard, ]} */ ;
        // @ts-ignore
        const __VLS_8 = __VLS_asFunctionalComponent(ToolCard, new ToolCard({
            ...{ 'onOpen': {} },
            key: (tool.code),
            tool: (tool),
        }));
        const __VLS_9 = __VLS_8({
            ...{ 'onOpen': {} },
            key: (tool.code),
            tool: (tool),
        }, ...__VLS_functionalComponentArgsRest(__VLS_8));
        let __VLS_11;
        let __VLS_12;
        let __VLS_13;
        const __VLS_14 = {
            onOpen: (__VLS_ctx.router.push)
        };
        var __VLS_10;
    }
}
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['tool-grid']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ToolCard: ToolCard,
            router: router,
            visibleTools: visibleTools,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
