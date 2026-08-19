/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { onMounted, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useUserStore } from '@/stores/user';
const router = useRouter();
const route = useRoute();
const userStore = useUserStore();
const errorMsg = ref(null);
onMounted(async () => {
    const code = route.query.code;
    const state = route.query.state;
    const savedState = sessionStorage.getItem('feishu_oauth_state');
    const redirect = sessionStorage.getItem('feishu_oauth_redirect') || '/home';
    sessionStorage.removeItem('feishu_oauth_state');
    sessionStorage.removeItem('feishu_oauth_redirect');
    if (!code) {
        errorMsg.value = '飞书未返回授权码';
        return;
    }
    if (!state || state !== savedState) {
        errorMsg.value = '登录校验失败，请重新登录';
        return;
    }
    try {
        await userStore.loginByFeishu(code);
        router.replace(redirect);
    }
    catch (e) {
        const err = e;
        errorMsg.value = err.response?.data?.detail || '飞书登录失败';
    }
});
function backToLogin() {
    router.replace({ name: 'Login' });
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "callback" },
});
if (!__VLS_ctx.errorMsg) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "callback__loading" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "callback__spinner" },
    });
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "callback__error" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "callback__error-text" },
    });
    (__VLS_ctx.errorMsg);
    const __VLS_0 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        ...{ 'onClick': {} },
        type: "primary",
    }));
    const __VLS_2 = __VLS_1({
        ...{ 'onClick': {} },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    let __VLS_4;
    let __VLS_5;
    let __VLS_6;
    const __VLS_7 = {
        onClick: (__VLS_ctx.backToLogin)
    };
    __VLS_3.slots.default;
    var __VLS_3;
}
/** @type {__VLS_StyleScopedClasses['callback']} */ ;
/** @type {__VLS_StyleScopedClasses['callback__loading']} */ ;
/** @type {__VLS_StyleScopedClasses['callback__spinner']} */ ;
/** @type {__VLS_StyleScopedClasses['callback__error']} */ ;
/** @type {__VLS_StyleScopedClasses['callback__error-text']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            errorMsg: errorMsg,
            backToLogin: backToLogin,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
