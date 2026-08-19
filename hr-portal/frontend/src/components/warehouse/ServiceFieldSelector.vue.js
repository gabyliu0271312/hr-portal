/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref, watch } from 'vue';
import { Plus, Delete } from '@element-plus/icons-vue';
const props = defineProps();
const emit = defineEmits();
const fields = ref([...props.modelValue]);
function add() { fields.value.push({ field: '', alias: '' }); }
function remove(idx) { fields.value.splice(idx, 1); emitChange(); }
function emitChange() { emit('update:modelValue', [...fields.value]); }
watch(() => props.modelValue, (v) => { fields.value = v ? [...v] : []; }, { deep: true });
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "field-selector" },
});
for (const [f, i] of __VLS_getVForSourceType((__VLS_ctx.fields))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (i),
        ...{ class: "field-row" },
    });
    const __VLS_0 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        ...{ 'onChange': {} },
        modelValue: (f.field),
        placeholder: "字段名",
        ...{ style: {} },
        list: (__VLS_ctx.availableFields?.length ? `field-datalist-${i}` : undefined),
    }));
    const __VLS_2 = __VLS_1({
        ...{ 'onChange': {} },
        modelValue: (f.field),
        placeholder: "字段名",
        ...{ style: {} },
        list: (__VLS_ctx.availableFields?.length ? `field-datalist-${i}` : undefined),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    let __VLS_4;
    let __VLS_5;
    let __VLS_6;
    const __VLS_7 = {
        onChange: (...[$event]) => {
            __VLS_ctx.emitChange();
        }
    };
    var __VLS_3;
    const __VLS_8 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        ...{ 'onChange': {} },
        modelValue: (f.alias),
        placeholder: "别名",
        ...{ style: {} },
    }));
    const __VLS_10 = __VLS_9({
        ...{ 'onChange': {} },
        modelValue: (f.alias),
        placeholder: "别名",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    let __VLS_12;
    let __VLS_13;
    let __VLS_14;
    const __VLS_15 = {
        onChange: (...[$event]) => {
            __VLS_ctx.emitChange();
        }
    };
    var __VLS_11;
    const __VLS_16 = {}.ElCheckbox;
    /** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
        ...{ 'onChange': {} },
        modelValue: (f.sensitive),
        ...{ style: {} },
    }));
    const __VLS_18 = __VLS_17({
        ...{ 'onChange': {} },
        modelValue: (f.sensitive),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_17));
    let __VLS_20;
    let __VLS_21;
    let __VLS_22;
    const __VLS_23 = {
        onChange: (...[$event]) => {
            __VLS_ctx.emitChange();
        }
    };
    __VLS_19.slots.default;
    var __VLS_19;
    const __VLS_24 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
        ...{ 'onClick': {} },
        icon: (__VLS_ctx.Delete),
        circle: true,
        size: "small",
        type: "danger",
        text: true,
    }));
    const __VLS_26 = __VLS_25({
        ...{ 'onClick': {} },
        icon: (__VLS_ctx.Delete),
        circle: true,
        size: "small",
        type: "danger",
        text: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
    let __VLS_28;
    let __VLS_29;
    let __VLS_30;
    const __VLS_31 = {
        onClick: (...[$event]) => {
            __VLS_ctx.remove(i);
        }
    };
    var __VLS_27;
}
const __VLS_32 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Plus),
    size: "small",
    type: "primary",
    text: true,
}));
const __VLS_34 = __VLS_33({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Plus),
    size: "small",
    type: "primary",
    text: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
let __VLS_36;
let __VLS_37;
let __VLS_38;
const __VLS_39 = {
    onClick: (__VLS_ctx.add)
};
__VLS_35.slots.default;
var __VLS_35;
if (__VLS_ctx.fields.length === 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
}
/** @type {__VLS_StyleScopedClasses['field-selector']} */ ;
/** @type {__VLS_StyleScopedClasses['field-row']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Plus: Plus,
            Delete: Delete,
            fields: fields,
            add: add,
            remove: remove,
            emitChange: emitChange,
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
