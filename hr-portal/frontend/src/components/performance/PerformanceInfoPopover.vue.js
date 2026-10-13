/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { nextTick, onBeforeUnmount, ref } from 'vue';
let nextTooltipId = 0;
const props = withDefaults(defineProps(), {
    delay: 124,
    width: 420,
    gap: 10,
    viewportMargin: 16,
    iconColor: '#646a73',
});
const tooltipId = `performance-info-popover-${++nextTooltipId}`;
const anchor = ref(null);
const popover = ref(null);
const visible = ref(false);
const placement = ref('top');
const popoverStyle = ref({ width: `${props.width}px`, visibility: 'hidden' });
const arrowStyle = ref({});
let timer = null;
function updatePosition() {
    if (!visible.value || !anchor.value || !popover.value)
        return;
    const anchorRect = anchor.value.getBoundingClientRect();
    const popoverRect = popover.value.getBoundingClientRect();
    const centerX = anchorRect.left + anchorRect.width / 2;
    const maxLeft = Math.max(props.viewportMargin, window.innerWidth - popoverRect.width - props.viewportMargin);
    const left = Math.min(Math.max(props.viewportMargin, centerX - popoverRect.width / 2), maxLeft);
    const placeTop = anchorRect.top >= popoverRect.height + props.gap + props.viewportMargin;
    placement.value = placeTop ? 'top' : 'bottom';
    popoverStyle.value = {
        width: `${props.width}px`,
        left: `${left}px`,
        top: `${placeTop ? anchorRect.top - popoverRect.height - props.gap : anchorRect.bottom + props.gap}px`,
        visibility: 'visible',
    };
    arrowStyle.value = { left: `${Math.min(Math.max(8, centerX - left), popoverRect.width - 8)}px` };
}
function scheduleOpen() {
    if (timer !== null)
        clearTimeout(timer);
    timer = setTimeout(() => {
        visible.value = true;
        timer = null;
        void nextTick(updatePosition);
    }, props.delay);
}
function close() {
    if (timer !== null)
        clearTimeout(timer);
    timer = null;
    visible.value = false;
}
window.addEventListener('resize', updatePosition);
window.addEventListener('scroll', updatePosition, true);
onBeforeUnmount(() => {
    close();
    window.removeEventListener('resize', updatePosition);
    window.removeEventListener('scroll', updatePosition, true);
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    delay: 124,
    width: 420,
    gap: 10,
    viewportMargin: 16,
    iconColor: '#646a73',
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['performance-info-popover__anchor']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-info-popover__anchor']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-info-popover']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-info-popover__arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-info-popover__arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-info-popover__arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-info-popover__arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-info-popover--bottom']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-info-popover__arrow']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "performance-info-popover-root" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ onMouseenter: (__VLS_ctx.scheduleOpen) },
    ...{ onMouseleave: (__VLS_ctx.close) },
    ...{ onFocusin: (__VLS_ctx.scheduleOpen) },
    ...{ onFocusout: (__VLS_ctx.close) },
    ref: "anchor",
    ...{ class: "performance-info-popover__anchor invite-info-icon" },
    tabindex: "0",
    ...{ style: ({ color: __VLS_ctx.iconColor }) },
    'aria-describedby': (__VLS_ctx.visible ? __VLS_ctx.tooltipId : undefined),
});
/** @type {typeof __VLS_ctx.anchor} */ ;
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    'data-icon': "InfoOutlined",
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 2C5.925 23 1 18.075 1 12S5.925 1 12 1s11 4.925 11 11-4.925 11-11 11Zm-1-7.5v-4a1 1 0 1 1 0-2h1.004c.55 0 .998.445.998.996.003 1.668-.002 3.336-.002 5.004h.5a1 1 0 1 1 0 2h-3a1 1 0 1 1 0-2h.5Zm1-7a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z",
    fill: "currentColor",
});
const __VLS_0 = {}.Teleport;
/** @type {[typeof __VLS_components.Teleport, typeof __VLS_components.Teleport, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    to: "body",
}));
const __VLS_2 = __VLS_1({
    to: "body",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
if (__VLS_ctx.visible) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        id: (__VLS_ctx.tooltipId),
        ref: "popover",
        ...{ class: "performance-info-popover invite-info-tooltip" },
        ...{ class: (`performance-info-popover--${__VLS_ctx.placement}`) },
        role: "tooltip",
        ...{ style: (__VLS_ctx.popoverStyle) },
    });
    /** @type {typeof __VLS_ctx.popover} */ ;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "performance-info-popover__content" },
    });
    if (Array.isArray(__VLS_ctx.content)) {
        for (const [line] of __VLS_getVForSourceType((__VLS_ctx.content))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (line),
                ...{ class: "performance-info-popover__line invite-info-line" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
                ...{ class: "performance-info-popover__dot invite-info-dot" },
                'aria-hidden': "true",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (line);
        }
    }
    else {
        (__VLS_ctx.content);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "performance-info-popover__arrow" },
        ...{ style: (__VLS_ctx.arrowStyle) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        width: "16",
        height: "8",
        viewBox: "0 0 16 8",
        fill: "none",
        xmlns: "http://www.w3.org/2000/svg",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M8-.5H0v1c1.553 0 3.033.664 4.065 1.825l2.814 3.166a1.5 1.5 0 002.242 0l2.814-3.166A5.438 5.438 0 0116 .5v-1H8z",
    });
}
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['performance-info-popover-root']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-info-popover__anchor']} */ ;
/** @type {__VLS_StyleScopedClasses['invite-info-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-info-popover']} */ ;
/** @type {__VLS_StyleScopedClasses['invite-info-tooltip']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-info-popover__content']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-info-popover__line']} */ ;
/** @type {__VLS_StyleScopedClasses['invite-info-line']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-info-popover__dot']} */ ;
/** @type {__VLS_StyleScopedClasses['invite-info-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-info-popover__arrow']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            tooltipId: tooltipId,
            anchor: anchor,
            popover: popover,
            visible: visible,
            placement: placement,
            popoverStyle: popoverStyle,
            arrowStyle: arrowStyle,
            scheduleOpen: scheduleOpen,
            close: close,
        };
    },
    __typeProps: {},
    props: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeProps: {},
    props: {},
});
; /* PartiallyEnd: #4569/main.vue */
