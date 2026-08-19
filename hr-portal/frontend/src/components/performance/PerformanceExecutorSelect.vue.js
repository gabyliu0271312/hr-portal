/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
const props = defineProps();
const emit = defineEmits();
const root = ref(null);
const searchInput = ref(null);
const open = ref(false);
const query = ref('');
const hoveredOption = ref(null);
const filteredOptions = computed(() => {
    const keyword = query.value.trim();
    return keyword ? props.options.filter((option) => option.label.includes(keyword)) : props.options;
});
function toggle() { if (props.disabled)
    return; open.value ? close() : show(); }
function show() { open.value = true; query.value = ''; hoveredOption.value = null; void nextTick(() => searchInput.value?.focus()); }
function close() { open.value = false; query.value = ''; hoveredOption.value = null; }
function choose(value) { emit('update:modelValue', value); close(); }
function chooseFirst() { const first = filteredOptions.value[0]; if (first)
    choose(first.label); }
function handleOutside(event) { if (root.value && event.target instanceof Node && !root.value.contains(event.target))
    close(); }
document.addEventListener('mousedown', handleOutside);
onBeforeUnmount(() => document.removeEventListener('mousedown', handleOutside));
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['ud__select__selector']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__select__selector']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__select__selector']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__select__selector']} */ ;
/** @type {__VLS_StyleScopedClasses['is-open']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__select__selector__search__input']} */ ;
/** @type {__VLS_StyleScopedClasses['universe-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['executor-option']} */ ;
/** @type {__VLS_StyleScopedClasses['executor-option']} */ ;
/** @type {__VLS_StyleScopedClasses['executor-options']} */ ;
/** @type {__VLS_StyleScopedClasses['executor-options']} */ ;
/** @type {__VLS_StyleScopedClasses['executor-option']} */ ;
/** @type {__VLS_StyleScopedClasses['executor-option']} */ ;
/** @type {__VLS_StyleScopedClasses['executor-option']} */ ;
/** @type {__VLS_StyleScopedClasses['executor-option']} */ ;
/** @type {__VLS_StyleScopedClasses['executor-options']} */ ;
/** @type {__VLS_StyleScopedClasses['executor-option']} */ ;
/** @type {__VLS_StyleScopedClasses['is-hovered']} */ ;
/** @type {__VLS_StyleScopedClasses['executor-option']} */ ;
/** @type {__VLS_StyleScopedClasses['is-hovered']} */ ;
/** @type {__VLS_StyleScopedClasses['executor-option__check']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ onMouseenter: (__VLS_ctx.show) },
    ...{ onMouseover: (__VLS_ctx.show) },
    ...{ onMouseleave: (__VLS_ctx.close) },
    ...{ onClick: (__VLS_ctx.show) },
    ...{ onKeydown: (__VLS_ctx.show) },
    ...{ onKeydown: (__VLS_ctx.show) },
    ...{ onKeydown: (__VLS_ctx.close) },
    ref: "root",
    ...{ class: "ud__select__selector ud__select__selector-md ud__select__selector-border-normal ud__select__selector-not-empty" },
    ...{ class: ({ 'is-open': __VLS_ctx.open, 'is-disabled': __VLS_ctx.disabled }) },
    role: "combobox",
    'aria-expanded': (__VLS_ctx.open),
    'aria-disabled': (__VLS_ctx.disabled),
    tabindex: "0",
});
/** @type {typeof __VLS_ctx.root} */ ;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "ud__empty-inline-element" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "ud__select__selector__content" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "ud__text ud__select__selector__selectItem" },
});
(__VLS_ctx.modelValue);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "ud__select__selector__search" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
    ...{ onClick: () => { } },
    ...{ onKeydown: (__VLS_ctx.close) },
    ...{ onKeydown: (__VLS_ctx.chooseFirst) },
    ref: "searchInput",
    ...{ class: "ud__select__selector__search__input ud__native-input" },
    role: "combobox",
    autocomplete: "off",
    type: "search",
    'aria-label': "搜索环节执行人",
    tabindex: (__VLS_ctx.open ? 0 : -1),
});
(__VLS_ctx.query);
/** @type {typeof __VLS_ctx.searchInput} */ ;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "ud__select__selector__arrow" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "universe-icon" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    width: "1em",
    height: "1em",
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    'data-icon': "DownBoldOutlined",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "m3.414 7.086-.707.707a1 1 0 0 0 0 1.414l7.778 7.778a2 2 0 0 0 2.829 0l7.778-7.778a1 1 0 0 0-1.414-1.414l-.707-.707a1 1 0 0 0-1.415 0l-7.07 7.07-7.072-7.07a1 1 0 0 0-1.414 0Z",
    fill: "currentColor",
});
if (__VLS_ctx.open) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "executor-options" },
        role: "listbox",
    });
    for (const [option] of __VLS_getVForSourceType((__VLS_ctx.filteredOptions))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onMouseenter: (...[$event]) => {
                    if (!(__VLS_ctx.open))
                        return;
                    __VLS_ctx.hoveredOption = option.type;
                } },
            ...{ onMouseleave: (...[$event]) => {
                    if (!(__VLS_ctx.open))
                        return;
                    __VLS_ctx.hoveredOption = null;
                } },
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.open))
                        return;
                    __VLS_ctx.choose(option.label);
                } },
            key: (option.type),
            ...{ class: "executor-option" },
            ...{ class: ({ 'is-hovered': __VLS_ctx.hoveredOption === option.type }) },
            type: "button",
            role: "option",
            'aria-selected': (option.label === __VLS_ctx.modelValue),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "executor-option__content" },
        });
        (option.label);
        if (option.label === __VLS_ctx.modelValue) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "executor-option__check" },
                'aria-hidden': "true",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                width: "1em",
                height: "1em",
                viewBox: "0 0 24 24",
                fill: "none",
                xmlns: "http://www.w3.org/2000/svg",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
                d: "M4 11.293a1 1 0 0 1 1.414 0l4.072 4.07 9.07-9.07a1 1 0 0 1 1.415 0l.706.707a1 1 0 0 1 0 1.414L10.193 18.9a1 1 0 0 1-1.415 0l-5.485-5.485a1 1 0 0 1 0-1.414L4 11.293Z",
                fill: "currentColor",
            });
        }
    }
}
/** @type {__VLS_StyleScopedClasses['ud__select__selector']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__select__selector-md']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__select__selector-border-normal']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__select__selector-not-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__empty-inline-element']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__select__selector__content']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__text']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__select__selector__selectItem']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__select__selector__search']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__select__selector__search__input']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__native-input']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__select__selector__arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['universe-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['executor-options']} */ ;
/** @type {__VLS_StyleScopedClasses['executor-option']} */ ;
/** @type {__VLS_StyleScopedClasses['executor-option__content']} */ ;
/** @type {__VLS_StyleScopedClasses['executor-option__check']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            root: root,
            searchInput: searchInput,
            open: open,
            query: query,
            hoveredOption: hoveredOption,
            filteredOptions: filteredOptions,
            show: show,
            close: close,
            choose: choose,
            chooseFirst: chooseFirst,
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
