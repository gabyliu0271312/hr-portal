/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref } from 'vue';
import PerformancePromptPopover from './PerformancePromptPopover.vue';
const props = defineProps();
const emit = defineEmits();
void props;
void emit;
const activeType = ref(null);
const anchor = ref(null);
const colors = [{ value: '#3B82F6', label: '用于常规提示', type: 'info' }, { value: '#F97316', label: '用于警示提示', type: 'warning' }, { value: '#EF4444', label: '用于较强负面内容提示', type: 'error' }, { value: '#10B981', label: '用于正向内容提示', type: 'success' }];
function showPopover(type, event) { activeType.value = type; anchor.value = event.currentTarget.getBoundingClientRect(); }
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['prompt-color']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-color']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ onMouseleave: (...[$event]) => {
            __VLS_ctx.activeType = null;
        } },
    ...{ class: "prompt-colors" },
});
for (const [color] of __VLS_getVForSourceType((__VLS_ctx.colors))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.$emit('update:modelValue', color.value);
            } },
        ...{ onMouseenter: (...[$event]) => {
                __VLS_ctx.showPopover(color.type, $event);
            } },
        key: (color.value),
        ...{ class: "prompt-color" },
        ...{ class: ({ selected: __VLS_ctx.modelValue === color.value }) },
        ...{ style: ({ backgroundColor: color.value }) },
        type: "button",
        'aria-label': (color.label),
    });
    if (__VLS_ctx.modelValue === color.value) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            viewBox: "0 0 24 24",
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "m9.218 17.41 10.612-10.614a.99.99 0 1 1 1.389 1.415c-3.545 3.425-4.251 4.105-11.419 11.074a.997.997 0 0 1-1.375.017c-1.924-1.8-3.709-3.567-5.573-5.428a.999.999 0 0 1 1.414-1.415l4.95 4.95Z",
        });
    }
}
/** @type {[typeof PerformancePromptPopover, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(PerformancePromptPopover, new PerformancePromptPopover({
    visible: (__VLS_ctx.activeType !== null),
    type: (__VLS_ctx.activeType || 'info'),
    anchor: (__VLS_ctx.anchor),
}));
const __VLS_1 = __VLS_0({
    visible: (__VLS_ctx.activeType !== null),
    type: (__VLS_ctx.activeType || 'info'),
    anchor: (__VLS_ctx.anchor),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
/** @type {__VLS_StyleScopedClasses['prompt-colors']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-color']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformancePromptPopover: PerformancePromptPopover,
            activeType: activeType,
            anchor: anchor,
            colors: colors,
            showPopover: showPopover,
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
