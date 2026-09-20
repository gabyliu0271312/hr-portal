import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { PERFORMANCE_LEVEL_COLORS } from './performanceColorOptions';
const props = withDefaults(defineProps(), {
    options: () => PERFORMANCE_LEVEL_COLORS,
    label: '选择颜色',
});
const emit = defineEmits();
const triggerRef = ref(null);
const panelRef = ref(null);
const expanded = ref(false);
const panelPosition = ref({ left: '0px', top: '0px' });
const selected = computed(() => props.options.find((option) => option.value === props.modelValue));
const triggerColor = computed(() => selected.value?.trigger || props.modelValue);
function positionPanel() {
    const rect = triggerRef.value?.getBoundingClientRect();
    if (!rect)
        return;
    const width = 189.333;
    const height = 77.333;
    const left = Math.min(window.innerWidth - width - 8, Math.max(8, rect.left + rect.width / 2 - width / 2));
    const top = Math.max(8, rect.top - height - 10);
    panelPosition.value = { left: `${left}px`, top: `${top}px` };
}
async function open() {
    expanded.value = true;
    emit('open');
    await nextTick();
    positionPanel();
}
function close() {
    if (!expanded.value)
        return;
    expanded.value = false;
    emit('close');
}
function toggle() {
    if (expanded.value)
        close();
    else
        void open();
}
function selectColor(value) {
    emit('update:modelValue', value);
    close();
    triggerRef.value?.focus();
}
function handlePointerDown(event) {
    const target = event.target;
    if (!triggerRef.value?.contains(target) && !panelRef.value?.contains(target))
        close();
}
function handleKeydown(event) {
    if (event.key === 'Escape')
        close();
}
onMounted(() => {
    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('resize', positionPanel);
    window.addEventListener('scroll', positionPanel, true);
    window.addEventListener('keydown', handleKeydown);
});
onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', handlePointerDown);
    window.removeEventListener('resize', positionPanel);
    window.removeEventListener('scroll', positionPanel, true);
    window.removeEventListener('keydown', handleKeydown);
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    options: () => PERFORMANCE_LEVEL_COLORS,
    label: '选择颜色',
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['performance-color-picker-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-color-swatch']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-color-picker-arrow']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onPointerdown: () => { } },
    ...{ onClick: (__VLS_ctx.toggle) },
    ref: "triggerRef",
    ...{ class: "performance-color-picker-trigger" },
    type: "button",
    'aria-label': (__VLS_ctx.label),
    'aria-expanded': (__VLS_ctx.expanded),
    ...{ style: ({ backgroundColor: __VLS_ctx.triggerColor }) },
});
/** @type {typeof __VLS_ctx.triggerRef} */ ;
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    width: "10",
    height: "10",
    viewBox: "0 0 24 24",
    fill: "none",
    'data-icon': "ExpandDownFilled",
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M11.22 18.46a1 1 0 0 0 1.56 0l8.305-10.334a1 1 0 0 0-.78-1.626H3.696a1 1 0 0 0-.78 1.626L11.22 18.46Z",
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
if (__VLS_ctx.expanded) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ onPointerdown: () => { } },
        ref: "panelRef",
        ...{ class: "performance-color-picker-popover" },
        role: "tooltip",
        ...{ style: (__VLS_ctx.panelPosition) },
    });
    /** @type {typeof __VLS_ctx.panelRef} */ ;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "performance-color-picker-palette" },
        role: "listbox",
        'aria-label': (__VLS_ctx.label),
    });
    for (const [option, index] of __VLS_getVForSourceType((__VLS_ctx.options))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.expanded))
                        return;
                    __VLS_ctx.selectColor(option.value);
                } },
            key: (option.value),
            ...{ class: "performance-color-swatch" },
            ...{ class: ({ active: __VLS_ctx.modelValue === option.value }) },
            type: "button",
            role: "option",
            'aria-label': (`颜色 ${index + 1}`),
            'aria-selected': (__VLS_ctx.modelValue === option.value),
            ...{ style: ({ backgroundColor: option.value }) },
        });
        if (__VLS_ctx.modelValue === option.value) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                width: "12",
                height: "12",
                viewBox: "0 0 24 24",
                fill: "none",
                'data-icon': "DoneOutlined",
                'aria-hidden': "true",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
                d: "M9.218 17.41 19.83 6.796a.99.99 0 1 1 1.389 1.415c-3.545 3.425-4.251 4.105-11.419 11.074a.997.997 0 0 1-1.375.017c-1.924-1.8-3.709-3.567-5.573-5.428a.999.999 0 0 1 1.414-1.415l4.95 4.95Z",
                fill: "currentColor",
            });
        }
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        ...{ class: "performance-color-picker-arrow" },
        width: "16",
        height: "8",
        viewBox: "0 0 16 8",
        fill: "none",
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M8-.5H0v1c1.553 0 3.033.664 4.065 1.825l2.814 3.166a1.5 1.5 0 0 0 2.242 0l2.814-3.166A5.438 5.438 0 0 1 16 .5v-1H8z",
    });
}
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['performance-color-picker-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-color-picker-popover']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-color-picker-palette']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-color-swatch']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-color-picker-arrow']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            triggerRef: triggerRef,
            panelRef: panelRef,
            expanded: expanded,
            panelPosition: panelPosition,
            triggerColor: triggerColor,
            toggle: toggle,
            selectColor: selectColor,
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
