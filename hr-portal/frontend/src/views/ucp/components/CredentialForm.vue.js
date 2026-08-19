/// <reference types="../../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, ref, watch } from 'vue';
const props = defineProps();
const emit = defineEmits();
const showSecret = ref(false);
const defaults = {
    none: { label: '无认证', fields: [] },
    api_key: { label: 'API Key', fields: [{ key: 'api_key', label: 'API Key' }] },
    app_key_secret: { label: 'App Key / Secret', fields: [{ key: 'app_id', label: 'App ID' }, { key: 'app_secret', label: 'App Secret' }] },
    basic: { label: 'Basic Auth', fields: [{ key: 'username', label: '用户名' }, { key: 'password', label: '密码' }] },
    oauth2: { label: 'OAuth2', fields: [{ key: 'client_id', label: 'Client ID' }, { key: 'client_secret', label: 'Client Secret' }] },
    token: { label: 'Token', fields: [{ key: 'token', label: 'Token' }] },
    hmac_sha256_timestamped: { label: 'HMAC-SHA256 时间戳签名', fields: [{ key: 'signing_secret', label: '签名密钥' }] },
};
const model = computed({ get: () => props.modelValue, set: (value) => emit('update:modelValue', value) });
const authOptions = computed(() => Object.entries(defaults)
    .filter(([value]) => !props.allowedAuthTypes?.length || props.allowedAuthTypes.includes(value))
    .map(([value, item]) => ({ value, label: item.label })));
const fields = computed(() => props.schema?.length ? props.schema.filter((item) => item.required !== false).map((item) => ({ key: item.key, label: item.label || item.key })) : defaults[model.value.auth_type]?.fields || []);
watch(() => model.value.auth_type, (value, oldValue) => { if (value !== oldValue && !props.editMode)
    model.value.secrets = {}; });
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "credential-form" },
});
const __VLS_0 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    label: "认证方式",
    required: true,
}));
const __VLS_2 = __VLS_1({
    label: "认证方式",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
const __VLS_4 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
    modelValue: (__VLS_ctx.model.auth_type),
    ...{ style: {} },
    disabled: (__VLS_ctx.readonlyAuth),
}));
const __VLS_6 = __VLS_5({
    modelValue: (__VLS_ctx.model.auth_type),
    ...{ style: {} },
    disabled: (__VLS_ctx.readonlyAuth),
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
__VLS_7.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.authOptions))) {
    const __VLS_8 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        key: (item.value),
        label: (item.label),
        value: (item.value),
    }));
    const __VLS_10 = __VLS_9({
        key: (item.value),
        label: (item.label),
        value: (item.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
}
var __VLS_7;
var __VLS_3;
const __VLS_12 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    label: "密钥配置",
    required: true,
}));
const __VLS_14 = __VLS_13({
    label: "密钥配置",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
__VLS_15.slots.default;
for (const [field] of __VLS_getVForSourceType((__VLS_ctx.fields))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (field.key),
        ...{ class: "secret-row" },
    });
    const __VLS_16 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
        modelValue: (field.label),
        disabled: true,
        ...{ style: {} },
    }));
    const __VLS_18 = __VLS_17({
        modelValue: (field.label),
        disabled: true,
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_17));
    const __VLS_20 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
        modelValue: (__VLS_ctx.model.secrets[field.key]),
        type: (__VLS_ctx.showSecret ? 'text' : 'password'),
        placeholder: (__VLS_ctx.editMode ? `留空则不修改；输入新的 ${field.label}` : `输入 ${field.label}`),
        ...{ style: {} },
    }));
    const __VLS_22 = __VLS_21({
        modelValue: (__VLS_ctx.model.secrets[field.key]),
        type: (__VLS_ctx.showSecret ? 'text' : 'password'),
        placeholder: (__VLS_ctx.editMode ? `留空则不修改；输入新的 ${field.label}` : `输入 ${field.label}`),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
}
const __VLS_24 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    ...{ 'onClick': {} },
    size: "small",
    link: true,
}));
const __VLS_26 = __VLS_25({
    ...{ 'onClick': {} },
    size: "small",
    link: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
let __VLS_28;
let __VLS_29;
let __VLS_30;
const __VLS_31 = {
    onClick: (...[$event]) => {
        __VLS_ctx.showSecret = !__VLS_ctx.showSecret;
    }
};
__VLS_27.slots.default;
(__VLS_ctx.showSecret ? '隐藏' : '显示');
var __VLS_27;
var __VLS_15;
/** @type {__VLS_StyleScopedClasses['credential-form']} */ ;
/** @type {__VLS_StyleScopedClasses['secret-row']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            showSecret: showSecret,
            model: model,
            authOptions: authOptions,
            fields: fields,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
