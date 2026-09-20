/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import PerformanceOptionNavigator from './PerformanceOptionNavigator.vue';
const props = defineProps();
const emit = defineEmits();
const navigatorOptions = computed(() => props.options.map((option) => ({ id: option.id, label: option.value })));
const layoutPolicy = {
    naturalMax: 5,
    distributedMax: 10,
    viewportWidth: 552,
    viewportHeight: 38,
    optionMinWidth: 42,
    optionHeight: 32,
    connectorMinWidth: 12,
    connectorMaxWidth: 88,
    overflowGap: 12,
};
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {[typeof PerformanceOptionNavigator, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(PerformanceOptionNavigator, new PerformanceOptionNavigator({
    ...{ 'onNext': {} },
    ...{ 'onPrevious': {} },
    ...{ 'onHover': {} },
    options: (__VLS_ctx.navigatorOptions),
    label: "固定分值选项预览",
    previousLabel: "上一组固定分值",
    nextLabel: "下一组固定分值",
    appearanceVariant: "score-preview",
    layoutPolicy: (__VLS_ctx.layoutPolicy),
}));
const __VLS_1 = __VLS_0({
    ...{ 'onNext': {} },
    ...{ 'onPrevious': {} },
    ...{ 'onHover': {} },
    options: (__VLS_ctx.navigatorOptions),
    label: "固定分值选项预览",
    previousLabel: "上一组固定分值",
    nextLabel: "下一组固定分值",
    appearanceVariant: "score-preview",
    layoutPolicy: (__VLS_ctx.layoutPolicy),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
let __VLS_3;
let __VLS_4;
let __VLS_5;
const __VLS_6 = {
    onNext: (...[$event]) => {
        __VLS_ctx.emit('next');
    }
};
const __VLS_7 = {
    onPrevious: (...[$event]) => {
        __VLS_ctx.emit('previous');
    }
};
const __VLS_8 = {
    onHover: (...[$event]) => {
        __VLS_ctx.emit('hover', $event);
    }
};
var __VLS_9 = {};
var __VLS_2;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformanceOptionNavigator: PerformanceOptionNavigator,
            emit: emit,
            navigatorOptions: navigatorOptions,
            layoutPolicy: layoutPolicy,
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
