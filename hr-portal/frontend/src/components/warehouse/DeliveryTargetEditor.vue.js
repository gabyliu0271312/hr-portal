/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref, watch } from 'vue';
const props = defineProps();
const emit = defineEmits();
const target = ref(props.modelValue?.target || 'feishu');
const address = ref(props.modelValue?.address || '');
const TARGETS = [
    { label: '飞书消息', value: 'feishu' },
    { label: '邮件', value: 'email' },
    { label: 'Webhook', value: 'webhook' },
    { label: '文件下载', value: 'file' },
];
function emitChange() {
    emit('update:modelValue', { target: target.value, address: address.value });
}
watch(target, emitChange);
watch(address, emitChange);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "delivery-editor" },
});
const __VLS_0 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    modelValue: (__VLS_ctx.target),
    placeholder: "投递方式",
    ...{ style: {} },
}));
const __VLS_2 = __VLS_1({
    modelValue: (__VLS_ctx.target),
    placeholder: "投递方式",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
for (const [t] of __VLS_getVForSourceType((__VLS_ctx.TARGETS))) {
    const __VLS_4 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        key: (t.value),
        label: (t.label),
        value: (t.value),
    }));
    const __VLS_6 = __VLS_5({
        key: (t.value),
        label: (t.label),
        value: (t.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
}
var __VLS_3;
if (__VLS_ctx.target === 'webhook' || __VLS_ctx.target === 'email') {
    const __VLS_8 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        modelValue: (__VLS_ctx.address),
        placeholder: (__VLS_ctx.target === 'webhook' ? 'Webhook URL' : '邮箱地址'),
        ...{ style: {} },
    }));
    const __VLS_10 = __VLS_9({
        modelValue: (__VLS_ctx.address),
        placeholder: (__VLS_ctx.target === 'webhook' ? 'Webhook URL' : '邮箱地址'),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
}
/** @type {__VLS_StyleScopedClasses['delivery-editor']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            target: target,
            address: address,
            TARGETS: TARGETS,
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
