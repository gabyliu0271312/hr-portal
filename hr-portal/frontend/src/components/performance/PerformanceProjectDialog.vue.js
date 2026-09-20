/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, reactive, watch } from 'vue';
import PerformancePermissionButton from './PerformancePermissionButton.vue';
const props = withDefaults(defineProps(), {
    project: null,
    saving: false,
});
const emit = defineEmits();
const form = reactive({ name: '', description: '', administrators: '' });
const error = computed(() => !form.name.trim() ? '请输入项目名称' : '');
function syncForm(project = props.project) {
    form.name = project?.name || '';
    form.description = project?.description || '';
    form.administrators = project?.administrators.join('、') || '';
}
function close() {
    if (!props.saving)
        emit('update:modelValue', false);
}
function submit() {
    if (error.value || !props.canSubmit || props.saving)
        return;
    emit('submit', {
        name: form.name.trim(),
        description: form.description.trim() || null,
        administrators: form.administrators.split(/[、,，]/).map(value => value.trim()).filter(Boolean),
    });
}
watch(() => [props.modelValue, props.project], () => {
    if (props.modelValue)
        syncForm();
}, { immediate: true });
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    project: null,
    saving: false,
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['project-dialog__header']} */ ;
/** @type {__VLS_StyleScopedClasses['project-dialog__header']} */ ;
/** @type {__VLS_StyleScopedClasses['project-dialog__body']} */ ;
/** @type {__VLS_StyleScopedClasses['project-dialog__body']} */ ;
/** @type {__VLS_StyleScopedClasses['project-dialog__body']} */ ;
/** @type {__VLS_StyleScopedClasses['project-dialog__body']} */ ;
/** @type {__VLS_StyleScopedClasses['project-dialog__body']} */ ;
/** @type {__VLS_StyleScopedClasses['project-dialog__body']} */ ;
/** @type {__VLS_StyleScopedClasses['project-dialog__body']} */ ;
/** @type {__VLS_StyleScopedClasses['project-dialog__body']} */ ;
/** @type {__VLS_StyleScopedClasses['project-dialog__footer']} */ ;
/** @type {__VLS_StyleScopedClasses['project-dialog__footer']} */ ;
/** @type {__VLS_StyleScopedClasses['project-dialog__footer']} */ ;
/** @type {__VLS_StyleScopedClasses['project-submit']} */ ;
// CSS variable injection 
// CSS variable injection end 
if (__VLS_ctx.modelValue) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (__VLS_ctx.close) },
        ...{ class: "project-dialog-mask" },
        role: "presentation",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.form, __VLS_intrinsicElements.form)({
        ...{ onSubmit: (__VLS_ctx.submit) },
        ...{ class: "project-dialog" },
        role: "dialog",
        'aria-modal': "true",
        'aria-labelledby': "project-dialog-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
        ...{ class: "project-dialog__header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
        id: "project-dialog-title",
    });
    (__VLS_ctx.mode === 'create' ? '新建项目' : '编辑项目');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.close) },
        type: "button",
        'aria-label': "关闭项目弹窗",
        disabled: (__VLS_ctx.saving),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "project-dialog__body" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        for: "project-name",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        id: "project-name",
        maxlength: "128",
        required: true,
        'aria-invalid': (Boolean(__VLS_ctx.error)),
    });
    (__VLS_ctx.form.name);
    if (__VLS_ctx.error) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({
            ...{ class: "project-error" },
            role: "alert",
        });
        (__VLS_ctx.error);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        for: "project-description",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.textarea)({
        id: "project-description",
        value: (__VLS_ctx.form.description),
        maxlength: "500",
        rows: "3",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        for: "project-administrators",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        id: "project-administrators",
        placeholder: "多个管理员用顿号或逗号分隔",
        maxlength: "500",
    });
    (__VLS_ctx.form.administrators);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.footer, __VLS_intrinsicElements.footer)({
        ...{ class: "project-dialog__footer" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.close) },
        type: "button",
        disabled: (__VLS_ctx.saving),
    });
    /** @type {[typeof PerformancePermissionButton, typeof PerformancePermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_0 = __VLS_asFunctionalComponent(PerformancePermissionButton, new PerformancePermissionButton({
        ...{ 'onClick': {} },
        allowed: (__VLS_ctx.canSubmit),
        ...{ class: "project-submit" },
        disabled: (__VLS_ctx.saving || Boolean(__VLS_ctx.error)),
    }));
    const __VLS_1 = __VLS_0({
        ...{ 'onClick': {} },
        allowed: (__VLS_ctx.canSubmit),
        ...{ class: "project-submit" },
        disabled: (__VLS_ctx.saving || Boolean(__VLS_ctx.error)),
    }, ...__VLS_functionalComponentArgsRest(__VLS_0));
    let __VLS_3;
    let __VLS_4;
    let __VLS_5;
    const __VLS_6 = {
        onClick: (__VLS_ctx.submit)
    };
    __VLS_2.slots.default;
    (__VLS_ctx.saving ? '保存中...' : '保存');
    var __VLS_2;
}
/** @type {__VLS_StyleScopedClasses['project-dialog-mask']} */ ;
/** @type {__VLS_StyleScopedClasses['project-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['project-dialog__header']} */ ;
/** @type {__VLS_StyleScopedClasses['project-dialog__body']} */ ;
/** @type {__VLS_StyleScopedClasses['project-error']} */ ;
/** @type {__VLS_StyleScopedClasses['project-dialog__footer']} */ ;
/** @type {__VLS_StyleScopedClasses['project-submit']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformancePermissionButton: PerformancePermissionButton,
            form: form,
            error: error,
            close: close,
            submit: submit,
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
