import { ref } from 'vue';
import InfoOutlinedIcon from './InfoOutlinedIcon.vue';
const props = withDefaults(defineProps(), { disabled: false });
const emit = defineEmits();
const options = ['评级', '评分', '评分映射等级型'];
const inputRefs = ref([]);
function setRef(element, index) {
    if (element)
        inputRefs.value[index] = element;
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({ disabled: false });
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['review-type-option']} */ ;
/** @type {__VLS_StyleScopedClasses['review-type-option']} */ ;
/** @type {__VLS_StyleScopedClasses['radio-wallpaper']} */ ;
/** @type {__VLS_StyleScopedClasses['review-type-option']} */ ;
/** @type {__VLS_StyleScopedClasses['radio-wallpaper']} */ ;
/** @type {__VLS_StyleScopedClasses['review-type-option']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "review-type-radio-group" },
    role: "radiogroup",
    'aria-label': "评估类型",
});
for (const [option, index] of __VLS_getVForSourceType((__VLS_ctx.options))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        key: (option),
        ...{ class: "review-type-option" },
        ...{ class: ({ checked: __VLS_ctx.modelValue === option, disabled: __VLS_ctx.disabled }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        ...{ onChange: (...[$event]) => {
                __VLS_ctx.emit('update:modelValue', option);
            } },
        ref: ((element) => __VLS_ctx.setRef(element, index)),
        type: "radio",
        name: "review-type",
        value: (option),
        checked: (__VLS_ctx.modelValue === option),
        disabled: (__VLS_ctx.disabled),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "radio-wallpaper" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (option);
    /** @type {[typeof InfoOutlinedIcon, ]} */ ;
    // @ts-ignore
    const __VLS_0 = __VLS_asFunctionalComponent(InfoOutlinedIcon, new InfoOutlinedIcon({
        ...{ class: "info-icon" },
    }));
    const __VLS_1 = __VLS_0({
        ...{ class: "info-icon" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_0));
}
/** @type {__VLS_StyleScopedClasses['review-type-radio-group']} */ ;
/** @type {__VLS_StyleScopedClasses['review-type-option']} */ ;
/** @type {__VLS_StyleScopedClasses['radio-wallpaper']} */ ;
/** @type {__VLS_StyleScopedClasses['info-icon']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            InfoOutlinedIcon: InfoOutlinedIcon,
            emit: emit,
            options: options,
            setRef: setRef,
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
