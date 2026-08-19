/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
/**
 * 按钮级权限封装：根据当前用户对某菜单的操作权限，自动隐藏或置灰
 *
 * <PermissionButton menu="system.users" op="C" type="primary" @click="...">
 *   新建用户
 * </PermissionButton>
 *
 * 无权限时：默认隐藏；mode="disable" 改为置灰
 */
import { computed } from 'vue';
import { useUserStore } from '@/stores/user';
const props = defineProps();
const userStore = useUserStore();
const allowed = computed(() => {
    if (props.op === 'V') {
        return userStore.menus.some((m) => m.code === props.menu);
    }
    return userStore.hasOp(props.menu, props.op);
});
const visible = computed(() => allowed.value || props.mode === 'disable');
const internalDisabled = computed(() => props.disabled || (!allowed.value && props.mode === 'disable'));
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
if (__VLS_ctx.visible) {
    const __VLS_0 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        type: (__VLS_ctx.type),
        size: (__VLS_ctx.size),
        link: (__VLS_ctx.link),
        plain: (__VLS_ctx.plain),
        disabled: (__VLS_ctx.internalDisabled),
        title: (!__VLS_ctx.allowed ? '无权限' : undefined),
    }));
    const __VLS_2 = __VLS_1({
        type: (__VLS_ctx.type),
        size: (__VLS_ctx.size),
        link: (__VLS_ctx.link),
        plain: (__VLS_ctx.plain),
        disabled: (__VLS_ctx.internalDisabled),
        title: (!__VLS_ctx.allowed ? '无权限' : undefined),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    var __VLS_4 = {};
    __VLS_3.slots.default;
    var __VLS_5 = {};
    var __VLS_3;
}
// @ts-ignore
var __VLS_6 = __VLS_5;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            allowed: allowed,
            visible: visible,
            internalDisabled: internalDisabled,
        };
    },
    __typeProps: {},
});
const __VLS_component = (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeProps: {},
});
export default {};
; /* PartiallyEnd: #4569/main.vue */
