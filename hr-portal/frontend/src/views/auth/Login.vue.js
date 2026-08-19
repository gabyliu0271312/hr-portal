/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useUserStore } from '@/stores/user';
import { authApi } from '@/api/auth';
const router = useRouter();
const route = useRoute();
const userStore = useUserStore();
const loginName = ref('');
const password = ref('');
const submitting = ref(false);
const ssoLoading = ref(false);
const errorMsg = ref(null);
async function onSubmit() {
    if (!loginName.value || !password.value) {
        errorMsg.value = '请输入账号和密码';
        return;
    }
    errorMsg.value = null;
    submitting.value = true;
    try {
        await userStore.login(loginName.value, password.value);
        const redirect = route.query.redirect || '/home';
        router.push(redirect);
    }
    catch (e) {
        const err = e;
        errorMsg.value = err.response?.data?.detail || '登录失败';
    }
    finally {
        submitting.value = false;
    }
}
async function onFeishuLogin() {
    ssoLoading.value = true;
    try {
        const { url, state } = await authApi.feishuUrl();
        sessionStorage.setItem('feishu_oauth_state', state);
        const redirect = route.query.redirect || '/home';
        sessionStorage.setItem('feishu_oauth_redirect', redirect);
        window.location.href = url;
    }
    catch (e) {
        const err = e;
        ElMessage.error(err.response?.data?.detail || '飞书登录暂不可用');
        ssoLoading.value = false;
    }
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['login__eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['login__divider']} */ ;
/** @type {__VLS_StyleScopedClasses['login__divider']} */ ;
/** @type {__VLS_StyleScopedClasses['login__sso']} */ ;
/** @type {__VLS_StyleScopedClasses['login__sso']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "login" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "login__bg" },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "login__inner" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "login__brand" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "login__brand-mark" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({
    ...{ class: "login__brand-name" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "login__brand-sub" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
    ...{ class: "login__panel" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "login__eyebrow" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
    ...{ class: "login__title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.form, __VLS_intrinsicElements.form)({
    ...{ onSubmit: (__VLS_ctx.onSubmit) },
    ...{ class: "login__form" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
    ...{ class: "login__field" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "login__label" },
});
const __VLS_0 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    modelValue: (__VLS_ctx.loginName),
    size: "large",
    placeholder: "登录名",
    autocomplete: "username",
}));
const __VLS_2 = __VLS_1({
    modelValue: (__VLS_ctx.loginName),
    size: "large",
    placeholder: "登录名",
    autocomplete: "username",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
    ...{ class: "login__field" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "login__label" },
});
const __VLS_4 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.password),
    type: "password",
    size: "large",
    showPassword: true,
    placeholder: "密码",
    autocomplete: "current-password",
}));
const __VLS_6 = __VLS_5({
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.password),
    type: "password",
    size: "large",
    showPassword: true,
    placeholder: "密码",
    autocomplete: "current-password",
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
let __VLS_8;
let __VLS_9;
let __VLS_10;
const __VLS_11 = {
    onKeyup: (__VLS_ctx.onSubmit)
};
var __VLS_7;
const __VLS_12 = {}.transition;
/** @type {[typeof __VLS_components.Transition, typeof __VLS_components.transition, typeof __VLS_components.Transition, typeof __VLS_components.transition, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    name: "fade",
}));
const __VLS_14 = __VLS_13({
    name: "fade",
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
__VLS_15.slots.default;
if (__VLS_ctx.errorMsg) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "login__error" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "login__error-bar" },
    });
    (__VLS_ctx.errorMsg);
}
var __VLS_15;
const __VLS_16 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    type: "primary",
    size: "large",
    ...{ class: "login__submit" },
    nativeType: "submit",
    loading: (__VLS_ctx.submitting),
}));
const __VLS_18 = __VLS_17({
    type: "primary",
    size: "large",
    ...{ class: "login__submit" },
    nativeType: "submit",
    loading: (__VLS_ctx.submitting),
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
__VLS_19.slots.default;
var __VLS_19;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "login__divider" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.onFeishuLogin) },
    ...{ class: "login__sso" },
    type: "button",
    disabled: (__VLS_ctx.ssoLoading),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "login__sso-icon" },
});
(__VLS_ctx.ssoLoading ? '正在跳转飞书…' : '飞书登录');
/** @type {__VLS_StyleScopedClasses['login']} */ ;
/** @type {__VLS_StyleScopedClasses['login__bg']} */ ;
/** @type {__VLS_StyleScopedClasses['login__inner']} */ ;
/** @type {__VLS_StyleScopedClasses['login__brand']} */ ;
/** @type {__VLS_StyleScopedClasses['login__brand-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['login__brand-name']} */ ;
/** @type {__VLS_StyleScopedClasses['login__brand-sub']} */ ;
/** @type {__VLS_StyleScopedClasses['login__panel']} */ ;
/** @type {__VLS_StyleScopedClasses['login__eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['login__title']} */ ;
/** @type {__VLS_StyleScopedClasses['login__form']} */ ;
/** @type {__VLS_StyleScopedClasses['login__field']} */ ;
/** @type {__VLS_StyleScopedClasses['login__label']} */ ;
/** @type {__VLS_StyleScopedClasses['login__field']} */ ;
/** @type {__VLS_StyleScopedClasses['login__label']} */ ;
/** @type {__VLS_StyleScopedClasses['login__error']} */ ;
/** @type {__VLS_StyleScopedClasses['login__error-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['login__submit']} */ ;
/** @type {__VLS_StyleScopedClasses['login__divider']} */ ;
/** @type {__VLS_StyleScopedClasses['login__sso']} */ ;
/** @type {__VLS_StyleScopedClasses['login__sso-icon']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            loginName: loginName,
            password: password,
            submitting: submitting,
            ssoLoading: ssoLoading,
            errorMsg: errorMsg,
            onSubmit: onSubmit,
            onFeishuLogin: onFeishuLogin,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
