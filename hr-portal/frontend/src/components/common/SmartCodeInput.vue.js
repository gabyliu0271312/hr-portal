/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { CopyDocument, RefreshRight } from '@element-plus/icons-vue';
import { codegenApi } from '@/api/codegen';
const props = withDefaults(defineProps(), {
    scope: 'generic',
    prefix: '',
    context: null,
    datasetId: null,
    existingCodes: () => [],
    editable: false,
});
const emit = defineEmits();
const loading = ref(false);
const lastLabel = ref('');
const suggestion = ref(null);
let debounceTimer = null;
let requestSeq = 0;
const sourceLabel = computed(() => {
    if (!suggestion.value)
        return '待生成';
    return suggestion.value.source === 'ai' ? 'AI 生成' : '规则生成';
});
async function generate(force = false) {
    const label = props.label.trim();
    if (!label) {
        emit('update:modelValue', '');
        suggestion.value = null;
        lastLabel.value = '';
        return;
    }
    if (!force && lastLabel.value === label && props.modelValue)
        return;
    const seq = ++requestSeq;
    loading.value = true;
    try {
        const result = await codegenApi.suggest({
            label,
            scope: props.scope,
            prefix: props.prefix,
            context: props.context,
            dataset_id: props.datasetId,
            existing_codes: props.existingCodes,
        });
        if (seq !== requestSeq)
            return;
        suggestion.value = result;
        lastLabel.value = label;
        emit('update:modelValue', result.code);
        emit('suggested', result);
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '编码生成失败');
    }
    finally {
        loading.value = false;
    }
}
function scheduleGenerate() {
    if (debounceTimer)
        clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        generate(false);
    }, 600);
}
async function copyCode() {
    if (!props.modelValue)
        return;
    await navigator.clipboard?.writeText(props.modelValue);
    ElMessage.success('编码已复制');
}
watch(() => props.label, () => { scheduleGenerate(); }, { immediate: true });
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    scope: 'generic',
    prefix: '',
    context: null,
    datasetId: null,
    existingCodes: () => [],
    editable: false,
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['smart-code-input']} */ ;
/** @type {__VLS_StyleScopedClasses['code-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['code-hint']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "smart-code-input" },
});
const __VLS_0 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.modelValue),
    readonly: (!__VLS_ctx.editable),
    placeholder: "输入名称后自动生成",
}));
const __VLS_2 = __VLS_1({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.modelValue),
    readonly: (!__VLS_ctx.editable),
    placeholder: "输入名称后自动生成",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    'onUpdate:modelValue': ((v) => __VLS_ctx.emit('update:modelValue', v))
};
__VLS_3.slots.default;
{
    const { append: __VLS_thisSlot } = __VLS_3.slots;
    const __VLS_8 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        ...{ 'onClick': {} },
        loading: (__VLS_ctx.loading),
        title: "重新生成编码",
    }));
    const __VLS_10 = __VLS_9({
        ...{ 'onClick': {} },
        loading: (__VLS_ctx.loading),
        title: "重新生成编码",
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    let __VLS_12;
    let __VLS_13;
    let __VLS_14;
    const __VLS_15 = {
        onClick: (...[$event]) => {
            __VLS_ctx.generate(true);
        }
    };
    __VLS_11.slots.default;
    const __VLS_16 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({}));
    const __VLS_18 = __VLS_17({}, ...__VLS_functionalComponentArgsRest(__VLS_17));
    __VLS_19.slots.default;
    const __VLS_20 = {}.RefreshRight;
    /** @type {[typeof __VLS_components.RefreshRight, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({}));
    const __VLS_22 = __VLS_21({}, ...__VLS_functionalComponentArgsRest(__VLS_21));
    var __VLS_19;
    var __VLS_11;
    const __VLS_24 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
        ...{ 'onClick': {} },
        disabled: (!__VLS_ctx.modelValue),
        title: "复制编码",
    }));
    const __VLS_26 = __VLS_25({
        ...{ 'onClick': {} },
        disabled: (!__VLS_ctx.modelValue),
        title: "复制编码",
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
    let __VLS_28;
    let __VLS_29;
    let __VLS_30;
    const __VLS_31 = {
        onClick: (__VLS_ctx.copyCode)
    };
    __VLS_27.slots.default;
    const __VLS_32 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({}));
    const __VLS_34 = __VLS_33({}, ...__VLS_functionalComponentArgsRest(__VLS_33));
    __VLS_35.slots.default;
    const __VLS_36 = {}.CopyDocument;
    /** @type {[typeof __VLS_components.CopyDocument, ]} */ ;
    // @ts-ignore
    const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({}));
    const __VLS_38 = __VLS_37({}, ...__VLS_functionalComponentArgsRest(__VLS_37));
    var __VLS_35;
    var __VLS_27;
}
var __VLS_3;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "code-hint" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.sourceLabel);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
/** @type {__VLS_StyleScopedClasses['smart-code-input']} */ ;
/** @type {__VLS_StyleScopedClasses['code-hint']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            CopyDocument: CopyDocument,
            RefreshRight: RefreshRight,
            emit: emit,
            loading: loading,
            sourceLabel: sourceLabel,
            generate: generate,
            copyCode: copyCode,
        };
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
; /* PartiallyEnd: #4569/main.vue */
