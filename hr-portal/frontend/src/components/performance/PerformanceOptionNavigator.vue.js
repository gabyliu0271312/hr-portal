import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
const props = withDefaults(defineProps(), {
    label: '选项预览',
    previousLabel: '上一组选项',
    nextLabel: '下一组选项',
    appearanceVariant: 'default',
    layoutPolicy: () => ({}),
    fluid: false,
    interactive: true,
});
const emit = defineEmits();
const policy = computed(() => {
    const custom = props.layoutPolicy;
    return {
        viewportWidth: custom.viewportWidth ?? 552,
        viewportHeight: custom.viewportHeight ?? 38,
        optionMinWidth: custom.optionMinWidth ?? 42,
        optionHeight: custom.optionHeight ?? 32,
        connectorMinWidth: custom.connectorMinWidth ?? 12,
        connectorMaxWidth: custom.connectorMaxWidth ?? 88,
        overflowGap: custom.overflowGap ?? 12,
        naturalMax: custom.naturalMax ?? 5,
        distributedMax: custom.distributedMax ?? 10,
    };
});
const estimatedTrackWidth = computed(() => props.options.length * policy.value.optionMinWidth + Math.max(0, props.options.length - 1) * policy.value.overflowGap);
const measuredScrollWidth = ref(null);
const measuredClientWidth = ref(null);
const scrollRef = ref();
const currentPage = ref(0);
const hoveredIndex = ref(null);
const effectiveScrollWidth = computed(() => measuredScrollWidth.value ?? estimatedTrackWidth.value);
const effectiveClientWidth = computed(() => measuredClientWidth.value ?? policy.value.viewportWidth);
const isOverflowing = computed(() => effectiveScrollWidth.value > effectiveClientWidth.value);
const layoutMode = computed(() => isOverflowing.value ? 'overflow' : props.options.length <= policy.value.naturalMax ? 'natural' : props.options.length <= policy.value.distributedMax ? 'distributed' : 'fit');
const maxTrackOffset = computed(() => -Math.max(0, effectiveScrollWidth.value - effectiveClientWidth.value));
const pageCount = computed(() => isOverflowing.value ? Math.max(2, Math.ceil(effectiveScrollWidth.value / effectiveClientWidth.value)) : 1);
const trackOffset = computed(() => {
    if (!props.interactive || currentPage.value <= 0)
        return 0;
    return Math.max(-currentPage.value * effectiveClientWidth.value, maxTrackOffset.value);
});
const showPrevious = computed(() => props.interactive && currentPage.value > 0);
const showNext = computed(() => currentPage.value < pageCount.value - 1);
let resizeObserver;
function measureOverflow() {
    const element = scrollRef.value;
    if (!element || element.clientWidth <= 0 || element.scrollWidth <= 0)
        return;
    measuredScrollWidth.value = element.scrollWidth;
    measuredClientWidth.value = element.clientWidth;
}
function scheduleMeasure() {
    void nextTick(measureOverflow);
}
watch(() => props.options.map((option) => `${option.id}:${option.label}`).join('|'), () => {
    measuredScrollWidth.value = null;
    measuredClientWidth.value = null;
    currentPage.value = 0;
    hoveredIndex.value = null;
    scheduleMeasure();
});
watch(pageCount, (value) => {
    if (currentPage.value >= value)
        currentPage.value = value - 1;
});
onMounted(() => {
    scheduleMeasure();
    if (typeof ResizeObserver !== 'undefined' && scrollRef.value) {
        resizeObserver = new ResizeObserver(measureOverflow);
        resizeObserver.observe(scrollRef.value);
    }
});
onBeforeUnmount(() => resizeObserver?.disconnect());
function handleHover(index) {
    if (!props.interactive)
        return;
    hoveredIndex.value = index;
    emit('hover', index);
}
function moveNext() {
    if (!props.interactive || !showNext.value)
        return;
    currentPage.value += 1;
    hoveredIndex.value = null;
    emit('next');
}
function movePrevious() {
    if (!props.interactive || !showPrevious.value)
        return;
    currentPage.value -= 1;
    hoveredIndex.value = null;
    emit('previous');
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    label: '选项预览',
    previousLabel: '上一组选项',
    nextLabel: '下一组选项',
    appearanceVariant: 'default',
    layoutPolicy: () => ({}),
    fluid: false,
    interactive: true,
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['performance-option-navigator']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-option-navigator__scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-option-navigator__track']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-option-navigator__option']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-option-navigator__option']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-option-navigator__option']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-option-navigator__connector']} */ ;
/** @type {__VLS_StyleScopedClasses['is-overflowing']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-option-navigator']} */ ;
/** @type {__VLS_StyleScopedClasses['is-readonly']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-option-navigator__arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-option-navigator__arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-option-navigator__arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-option-navigator__arrow']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "performance-option-navigator" },
    ...{ class: ([`is-${__VLS_ctx.layoutMode}`, `is-${__VLS_ctx.appearanceVariant}`, { 'is-fluid': __VLS_ctx.fluid, 'is-readonly': !__VLS_ctx.interactive }]) },
    ...{ style: ({
            '--navigator-width': __VLS_ctx.fluid ? '100%' : `${__VLS_ctx.policy.viewportWidth}px`,
            '--navigator-height': `${__VLS_ctx.policy.viewportHeight}px`,
            '--navigator-option-min-width': `${__VLS_ctx.policy.optionMinWidth}px`,
            '--navigator-option-height': `${__VLS_ctx.policy.optionHeight}px`,
            '--navigator-connector-min': `${__VLS_ctx.policy.connectorMinWidth}px`,
            '--navigator-connector-max': `${__VLS_ctx.policy.connectorMaxWidth}px`,
        }) },
    'aria-label': (__VLS_ctx.label),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "performance-option-navigator__viewport" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ref: "scrollRef",
    ...{ class: "performance-option-navigator__scroll" },
});
/** @type {typeof __VLS_ctx.scrollRef} */ ;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "performance-option-navigator__track" },
    ...{ class: ({ 'is-overflowing': __VLS_ctx.isOverflowing }) },
    ...{ style: ({ transform: `translateX(${__VLS_ctx.trackOffset}px)` }) },
});
for (const [option, index] of __VLS_getVForSourceType((__VLS_ctx.options))) {
    (option.id);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onMouseenter: (...[$event]) => {
                __VLS_ctx.handleHover(index);
            } },
        ...{ onFocus: (...[$event]) => {
                __VLS_ctx.handleHover(index);
            } },
        ...{ class: "performance-option-navigator__option" },
        ...{ class: ({ 'is-hovered': __VLS_ctx.hoveredIndex === index }) },
        tabindex: (__VLS_ctx.interactive ? 0 : undefined),
        role: (__VLS_ctx.interactive ? 'button' : undefined),
        'aria-disabled': (__VLS_ctx.interactive ? undefined : 'true'),
    });
    (option.label);
    if (index < __VLS_ctx.options.length - 1) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "performance-option-navigator__connector" },
            ...{ class: ({ 'is-overflowing': __VLS_ctx.isOverflowing }) },
            'aria-hidden': "true",
        });
    }
}
if (__VLS_ctx.showPrevious) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "performance-option-navigator__arrow-wrap performance-option-navigator__arrow-wrap--previous" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "performance-option-navigator__mask performance-option-navigator__mask--previous" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.movePrevious) },
        ...{ class: "performance-option-navigator__arrow" },
        type: "button",
        disabled: (!__VLS_ctx.interactive),
        'aria-disabled': (__VLS_ctx.interactive ? undefined : 'true'),
        'aria-label': (__VLS_ctx.previousLabel),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        width: "16",
        height: "16",
        viewBox: "0 0 24 24",
        fill: "none",
        'data-icon': "LeftOutlined",
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M16.293 2.293a1 1 0 0 1 0 1.414L8 12l8.293 8.293a1 1 0 1 1-1.414 1.414l-8.293-8.293a2 2 0 0 1 0-2.828l8.293-8.293a1 1 0 0 1 1.414 0Z",
        fill: "currentColor",
    });
}
if (__VLS_ctx.showNext) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "performance-option-navigator__arrow-wrap performance-option-navigator__arrow-wrap--next" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "performance-option-navigator__mask performance-option-navigator__mask--next" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.moveNext) },
        ...{ class: "performance-option-navigator__arrow" },
        type: "button",
        disabled: (!__VLS_ctx.interactive),
        'aria-disabled': (__VLS_ctx.interactive ? undefined : 'true'),
        'aria-label': (__VLS_ctx.nextLabel),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        width: "16",
        height: "16",
        viewBox: "0 0 24 24",
        fill: "none",
        'data-icon': "RightOutlined",
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M7.707 21.707a1 1 0 0 1 0-1.414L16 12 7.707 3.707a1 1 0 1 1 1.414-1.414l8.293 8.293a2 2 0 0 1 0 2.828l-8.293 8.293a1 1 0 0 1-1.414 0Z",
        fill: "currentColor",
    });
}
/** @type {__VLS_StyleScopedClasses['performance-option-navigator']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-option-navigator__viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-option-navigator__scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-option-navigator__track']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-option-navigator__option']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-option-navigator__connector']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-option-navigator__arrow-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-option-navigator__arrow-wrap--previous']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-option-navigator__mask']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-option-navigator__mask--previous']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-option-navigator__arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-option-navigator__arrow-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-option-navigator__arrow-wrap--next']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-option-navigator__mask']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-option-navigator__mask--next']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-option-navigator__arrow']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            policy: policy,
            scrollRef: scrollRef,
            hoveredIndex: hoveredIndex,
            isOverflowing: isOverflowing,
            layoutMode: layoutMode,
            trackOffset: trackOffset,
            showPrevious: showPrevious,
            showNext: showNext,
            handleHover: handleHover,
            moveNext: moveNext,
            movePrevious: movePrevious,
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
