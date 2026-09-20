/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { nextTick, onBeforeUnmount, ref } from 'vue';
const props = withDefaults(defineProps(), { disabled: false, ariaInvalid: false });
const emit = defineEmits();
const root = ref(null);
const trigger = ref(null);
const dropdown = ref(null);
const open = ref(false);
const activeRole = ref('');
const dropdownStyle = ref({});
function positionDropdown() {
    if (!trigger.value)
        return;
    const rect = trigger.value.getBoundingClientRect();
    const estimatedHeight = Math.max(37.333, Math.min(184, props.options.length * 32 + 5.333));
    const placeAbove = window.innerHeight - rect.bottom < estimatedHeight + 4 && rect.top >= estimatedHeight + 4;
    dropdownStyle.value = {
        left: `${rect.left}px`,
        top: `${placeAbove ? rect.top - estimatedHeight - 4 : rect.bottom + 4}px`,
        width: `${rect.width}px`,
        maxHeight: '184px',
        transformOrigin: placeAbove ? '50% 100%' : '50% 0',
    };
}
function close() { open.value = false; }
function onDocumentPointerDown(event) {
    const target = event.target;
    if (!(target instanceof Node))
        return;
    if (!root.value?.contains(target) && !dropdown.value?.contains(target))
        close();
}
function toggle() {
    if (props.disabled)
        return;
    open.value = !open.value;
    if (!open.value)
        return;
    activeRole.value = props.modelValue.find((role) => props.options.includes(role)) || props.options[0] || '';
    void nextTick(positionDropdown);
}
function toggleRole(role) {
    emit('update:modelValue', props.modelValue.includes(role) ? props.modelValue.filter((item) => item !== role) : [...props.modelValue, role]);
}
function remove(role) { emit('update:modelValue', props.modelValue.filter((item) => item !== role)); }
document.addEventListener('pointerdown', onDocumentPointerDown);
window.addEventListener('resize', positionDropdown);
window.addEventListener('scroll', positionDropdown, true);
onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onDocumentPointerDown);
    window.removeEventListener('resize', positionDropdown);
    window.removeEventListener('scroll', positionDropdown, true);
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({ disabled: false, ariaInvalid: false });
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['performance-role-multi-select']} */ ;
/** @type {__VLS_StyleScopedClasses['role-select-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['role-select-tag-close']} */ ;
/** @type {__VLS_StyleScopedClasses['role-select-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['role-select-option']} */ ;
/** @type {__VLS_StyleScopedClasses['role-select-option']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-role-multi-select']} */ ;
/** @type {__VLS_StyleScopedClasses['role-select-trigger']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ref: "root",
    ...{ class: "performance-role-multi-select" },
    ...{ class: ({ disabled: __VLS_ctx.disabled, open: __VLS_ctx.open, 'has-options': __VLS_ctx.options.length > 0 }) },
});
/** @type {typeof __VLS_ctx.root} */ ;
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.toggle) },
    ref: "trigger",
    ...{ class: "role-select-trigger" },
    type: "button",
    disabled: (__VLS_ctx.disabled),
    'aria-expanded': (__VLS_ctx.options.length > 0 ? __VLS_ctx.open : undefined),
    'aria-haspopup': "listbox",
    'aria-invalid': (__VLS_ctx.ariaInvalid || undefined),
});
/** @type {typeof __VLS_ctx.trigger} */ ;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "role-select-content" },
});
if (__VLS_ctx.modelValue.length === 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "role-select-placeholder" },
    });
}
else {
    for (const [role] of __VLS_getVForSourceType((__VLS_ctx.modelValue))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            key: (role),
            ...{ class: "role-select-tag" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (role);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.modelValue.length === 0))
                        return;
                    __VLS_ctx.remove(role);
                } },
            ...{ onKeydown: (...[$event]) => {
                    if (!!(__VLS_ctx.modelValue.length === 0))
                        return;
                    __VLS_ctx.remove(role);
                } },
            ...{ class: "role-select-tag-close" },
            role: "button",
            tabindex: "0",
            'aria-label': (`移除${role}`),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            width: "12",
            height: "12",
            viewBox: "0 0 24 24",
            fill: "none",
            xmlns: "http://www.w3.org/2000/svg",
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M19.778 19.778a1.5 1.5 0 0 0 0-2.121L14.122 12l5.656-5.657a1.5 1.5 0 1 0-2.12-2.121L12 9.879 6.343 4.222a1.5 1.5 0 1 0-2.12 2.121L9.878 12l-5.657 5.657a1.5 1.5 0 1 0 2.121 2.121L12 14.121l5.657 5.657a1.5 1.5 0 0 0 2.121 0Z",
            fill: "currentColor",
        });
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "role-select-arrow" },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    width: "12",
    height: "12",
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "m3.414 7.086-.707.707a1 1 0 0 0 0 1.414l7.778 7.778a2 2 0 0 0 2.829 0l7.778-7.778a1 1 0 0 0 0-1.414l-.707-.707a1 1 0 0 0-1.415 0l-7.07 7.07-7.072-7.07a1 1 0 0 0-1.414 0Z",
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
if (__VLS_ctx.open && __VLS_ctx.options.length > 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ref: "dropdown",
        ...{ class: "role-select-dropdown" },
        ...{ style: (__VLS_ctx.dropdownStyle) },
        role: "listbox",
        'aria-multiselectable': "true",
    });
    /** @type {typeof __VLS_ctx.dropdown} */ ;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "role-select-menu" },
    });
    for (const [role] of __VLS_getVForSourceType((__VLS_ctx.options))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onMouseenter: (...[$event]) => {
                    if (!(__VLS_ctx.open && __VLS_ctx.options.length > 0))
                        return;
                    __VLS_ctx.activeRole = role;
                } },
            ...{ onFocus: (...[$event]) => {
                    if (!(__VLS_ctx.open && __VLS_ctx.options.length > 0))
                        return;
                    __VLS_ctx.activeRole = role;
                } },
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.open && __VLS_ctx.options.length > 0))
                        return;
                    __VLS_ctx.toggleRole(role);
                } },
            key: (role),
            ...{ class: "role-select-option" },
            ...{ class: ({ active: __VLS_ctx.activeRole === role, selected: __VLS_ctx.modelValue.includes(role) }) },
            type: "button",
            role: "option",
            'aria-selected': (__VLS_ctx.modelValue.includes(role)),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (role);
        if (__VLS_ctx.modelValue.includes(role)) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                width: "14",
                height: "14",
                viewBox: "0 0 24 24",
                fill: "none",
                'aria-hidden': "true",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
                d: "M4 11.293a1 1 0 0 1 1.414 0l4.072 4.07 9.07-9.07a1 1 0 0 1 1.415 0l.706.707a1 1 0 0 1 0 1.414L10.193 18.9a1 1 0 0 1-1.415 0l-5.485-5.485a1 1 0 0 1 0-1.414L4 11.293Z",
                fill: "currentColor",
            });
        }
    }
}
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['performance-role-multi-select']} */ ;
/** @type {__VLS_StyleScopedClasses['role-select-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['role-select-content']} */ ;
/** @type {__VLS_StyleScopedClasses['role-select-placeholder']} */ ;
/** @type {__VLS_StyleScopedClasses['role-select-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['role-select-tag-close']} */ ;
/** @type {__VLS_StyleScopedClasses['role-select-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['role-select-dropdown']} */ ;
/** @type {__VLS_StyleScopedClasses['role-select-menu']} */ ;
/** @type {__VLS_StyleScopedClasses['role-select-option']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            root: root,
            trigger: trigger,
            dropdown: dropdown,
            open: open,
            activeRole: activeRole,
            dropdownStyle: dropdownStyle,
            toggle: toggle,
            toggleRole: toggleRole,
            remove: remove,
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
