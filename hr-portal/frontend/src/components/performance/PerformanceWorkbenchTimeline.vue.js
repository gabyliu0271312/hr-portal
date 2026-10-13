/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
const props = defineProps();
const viewport = ref();
const track = ref();
const viewportWidth = ref(0);
const trackWidth = ref(0);
const currentPage = ref(0);
const maxOffset = computed(() => Math.max(0, trackWidth.value - viewportWidth.value));
const pageCount = computed(() => viewportWidth.value > 0 ? Math.max(1, Math.ceil(trackWidth.value / viewportWidth.value)) : 1);
const trackOffset = computed(() => -Math.min(currentPage.value * viewportWidth.value, maxOffset.value));
const showPrevious = computed(() => currentPage.value > 0 && maxOffset.value > 0);
const showNext = computed(() => currentPage.value < pageCount.value - 1);
let observer;
function measureOverflow() {
    if (!viewport.value || !track.value)
        return;
    viewportWidth.value = viewport.value.clientWidth;
    trackWidth.value = track.value.scrollWidth;
    currentPage.value = Math.min(currentPage.value, pageCount.value - 1);
}
watch(() => props.nodes.map(node => node.node_id).join('|'), () => {
    currentPage.value = 0;
    void nextTick(measureOverflow);
});
onMounted(() => {
    void nextTick(measureOverflow);
    if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(measureOverflow);
        if (viewport.value)
            observer.observe(viewport.value);
        if (track.value)
            observer.observe(track.value);
    }
});
onBeforeUnmount(() => observer?.disconnect());
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['timeline-node']} */ ;
/** @type {__VLS_StyleScopedClasses['timeline-node']} */ ;
/** @type {__VLS_StyleScopedClasses['node-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['node-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['node-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['node-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['node-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['node-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['node-segment']} */ ;
/** @type {__VLS_StyleScopedClasses['current']} */ ;
/** @type {__VLS_StyleScopedClasses['node-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['timeline-navigation']} */ ;
/** @type {__VLS_StyleScopedClasses['is-next']} */ ;
/** @type {__VLS_StyleScopedClasses['is-previous']} */ ;
/** @type {__VLS_StyleScopedClasses['timeline-navigation']} */ ;
/** @type {__VLS_StyleScopedClasses['timeline-navigation']} */ ;
/** @type {__VLS_StyleScopedClasses['timeline-navigation']} */ ;
/** @type {__VLS_StyleScopedClasses['timeline-track']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "workbench-timeline" },
    'aria-label': "绩效流程节点",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ref: "viewport",
    ...{ class: "timeline-viewport" },
});
/** @type {typeof __VLS_ctx.viewport} */ ;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ref: "track",
    ...{ class: "timeline-track" },
    ...{ style: ({ transform: `translateX(${__VLS_ctx.trackOffset}px)` }) },
});
/** @type {typeof __VLS_ctx.track} */ ;
for (const [node, index] of __VLS_getVForSourceType((__VLS_ctx.nodes))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (node.node_id),
        ...{ class: "timeline-node" },
        ...{ class: ({ completed: node.completed, current: node.current }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "node-copy" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({
        title: (node.node_name),
    });
    (node.node_name);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        title: (node.range),
    });
    (node.range);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "node-rail" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({
        ...{ class: "node-segment" },
        ...{ class: ({ 'is-hidden': index === 0 }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "node-marker" },
    });
    if (node.completed) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            ...{ class: "node-success" },
            viewBox: "0 0 24 24",
            fill: "none",
            'data-icon': "SucceedFilled",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M11.996 22.98c-6.067 0-10.983-4.918-10.983-10.984S5.93 1.013 11.996 1.013c6.066 0 10.983 4.917 10.983 10.983 0 6.066-4.917 10.984-10.983 10.984Z",
            fill: "currentColor",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M17.537 10.746a1.38 1.38 0 0 0-.005-1.95 1.378 1.378 0 0 0-1.95-.005l-4.89 4.89-2.285-2.285a1.375 1.375 0 0 0-1.942.012 1.373 1.373 0 0 0-.013 1.942c1.178 1.175 2.356 2.348 3.53 3.528.392.394 1.03.394 1.422 0 2.037-2.051 4.087-4.09 6.133-6.132Z",
            fill: "#fff",
        });
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "node-dot" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({
        ...{ class: "node-segment" },
        ...{ class: ({ 'is-hidden': index === __VLS_ctx.nodes.length - 1 }) },
    });
}
if (__VLS_ctx.showPrevious) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "timeline-navigation is-previous" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.showPrevious))
                    return;
                __VLS_ctx.currentPage -= 1;
            } },
        type: "button",
        'aria-label': "查看前序节点",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        width: "16",
        height: "16",
        viewBox: "0 0 24 24",
        fill: "none",
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M16.293 2.293a1 1 0 0 1 0 1.414L8 12l8.293 8.293a1 1 0 1 1-1.414 1.414l-8.293-8.293a2 2 0 0 1 0-2.828l8.293-8.293a1 1 0 0 1 1.414 0Z",
        fill: "currentColor",
    });
}
if (__VLS_ctx.showNext) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "timeline-navigation is-next" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.showNext))
                    return;
                __VLS_ctx.currentPage += 1;
            } },
        type: "button",
        'aria-label': "查看后续节点",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        width: "16",
        height: "16",
        viewBox: "0 0 24 24",
        fill: "none",
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M7.707 21.707a1 1 0 0 1 0-1.414L16 12 7.707 3.707a1 1 0 1 1 1.414-1.414l8.293 8.293a2 2 0 0 1 0 2.828l-8.293 8.293a1 1 0 0 1-1.414 0Z",
        fill: "currentColor",
    });
}
/** @type {__VLS_StyleScopedClasses['workbench-timeline']} */ ;
/** @type {__VLS_StyleScopedClasses['timeline-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['timeline-track']} */ ;
/** @type {__VLS_StyleScopedClasses['timeline-node']} */ ;
/** @type {__VLS_StyleScopedClasses['node-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['node-rail']} */ ;
/** @type {__VLS_StyleScopedClasses['node-segment']} */ ;
/** @type {__VLS_StyleScopedClasses['node-marker']} */ ;
/** @type {__VLS_StyleScopedClasses['node-success']} */ ;
/** @type {__VLS_StyleScopedClasses['node-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['node-segment']} */ ;
/** @type {__VLS_StyleScopedClasses['timeline-navigation']} */ ;
/** @type {__VLS_StyleScopedClasses['is-previous']} */ ;
/** @type {__VLS_StyleScopedClasses['timeline-navigation']} */ ;
/** @type {__VLS_StyleScopedClasses['is-next']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            viewport: viewport,
            track: track,
            currentPage: currentPage,
            trackOffset: trackOffset,
            showPrevious: showPrevious,
            showNext: showNext,
        };
    },
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
