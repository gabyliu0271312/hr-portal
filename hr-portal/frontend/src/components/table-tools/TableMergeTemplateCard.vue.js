/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { Delete, Document, Plus, Upload } from '@element-plus/icons-vue';
import PermissionButton from '@/components/PermissionButton.vue';
const props = defineProps();
const emit = defineEmits();
function openPrimary() {
    if (props.canModify) {
        emit('edit', props.template);
    }
    else {
        emit('merge', props.template);
    }
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['template-card']} */ ;
/** @type {__VLS_StyleScopedClasses['template-card']} */ ;
/** @type {__VLS_StyleScopedClasses['template-card-body']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
    ...{ class: "template-card" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.openPrimary) },
    type: "button",
    ...{ class: "template-card-body" },
    'aria-label': (__VLS_ctx.canModify ? `编辑模板${__VLS_ctx.template.name}` : `使用模板${__VLS_ctx.template.name}进行合并`),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "template-card-icon" },
});
const __VLS_0 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({}));
const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
const __VLS_4 = {}.Document;
/** @type {[typeof __VLS_components.Document, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({}));
const __VLS_6 = __VLS_5({}, ...__VLS_functionalComponentArgsRest(__VLS_5));
var __VLS_3;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "template-card-info" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({
    ...{ class: "template-name" },
});
(__VLS_ctx.template.name);
if (__VLS_ctx.template.description) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "template-description" },
        title: (__VLS_ctx.template.description),
    });
    (__VLS_ctx.template.description);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "template-meta" },
});
for (const [key] of __VLS_getVForSourceType((__VLS_ctx.template.merge_keys))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        key: (key),
        ...{ class: "meta-tag" },
    });
    (key);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "meta-separator" },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "meta-count" },
});
(__VLS_ctx.template.mapping_count);
__VLS_asFunctionalElement(__VLS_intrinsicElements.footer, __VLS_intrinsicElements.footer)({
    ...{ class: "template-card-actions" },
});
const __VLS_8 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    ...{ 'onClick': {} },
    type: "primary",
    size: "small",
    icon: (__VLS_ctx.Upload),
}));
const __VLS_10 = __VLS_9({
    ...{ 'onClick': {} },
    type: "primary",
    size: "small",
    icon: (__VLS_ctx.Upload),
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
let __VLS_12;
let __VLS_13;
let __VLS_14;
const __VLS_15 = {
    onClick: (...[$event]) => {
        __VLS_ctx.emit('merge', __VLS_ctx.template);
    }
};
__VLS_11.slots.default;
var __VLS_11;
if (__VLS_ctx.canModify) {
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_16 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: "table_tools",
        op: "U",
        size: "small",
        icon: (__VLS_ctx.Plus),
    }));
    const __VLS_17 = __VLS_16({
        ...{ 'onClick': {} },
        menu: "table_tools",
        op: "U",
        size: "small",
        icon: (__VLS_ctx.Plus),
    }, ...__VLS_functionalComponentArgsRest(__VLS_16));
    let __VLS_19;
    let __VLS_20;
    let __VLS_21;
    const __VLS_22 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.canModify))
                return;
            __VLS_ctx.emit('add', __VLS_ctx.template);
        }
    };
    __VLS_18.slots.default;
    var __VLS_18;
}
if (__VLS_ctx.canModify) {
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_23 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: "table_tools",
        op: "D",
        size: "small",
        type: "danger",
        icon: (__VLS_ctx.Delete),
    }));
    const __VLS_24 = __VLS_23({
        ...{ 'onClick': {} },
        menu: "table_tools",
        op: "D",
        size: "small",
        type: "danger",
        icon: (__VLS_ctx.Delete),
    }, ...__VLS_functionalComponentArgsRest(__VLS_23));
    let __VLS_26;
    let __VLS_27;
    let __VLS_28;
    const __VLS_29 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.canModify))
                return;
            __VLS_ctx.emit('delete', __VLS_ctx.template);
        }
    };
    __VLS_25.slots.default;
    var __VLS_25;
}
/** @type {__VLS_StyleScopedClasses['template-card']} */ ;
/** @type {__VLS_StyleScopedClasses['template-card-body']} */ ;
/** @type {__VLS_StyleScopedClasses['template-card-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['template-card-info']} */ ;
/** @type {__VLS_StyleScopedClasses['template-name']} */ ;
/** @type {__VLS_StyleScopedClasses['template-description']} */ ;
/** @type {__VLS_StyleScopedClasses['template-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['meta-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['meta-separator']} */ ;
/** @type {__VLS_StyleScopedClasses['meta-count']} */ ;
/** @type {__VLS_StyleScopedClasses['template-card-actions']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Delete: Delete,
            Document: Document,
            Plus: Plus,
            Upload: Upload,
            PermissionButton: PermissionButton,
            emit: emit,
            openPrimary: openPrimary,
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
