import { reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import PerformanceTextField from './PerformanceTextField.vue';
import TagItemEditor from './TagItemEditor.vue';
const props = withDefaults(defineProps(), { mode: 'create' });
const emit = defineEmits();
const draft = reactive(clone(props.modelValue));
const submitted = ref(false);
function clone(value) {
    return { ...value, tags: value.tags.map((tag) => ({ ...tag })) };
}
watch(draft, () => emit('update:modelValue', clone(draft)), { deep: true });
function addTag() {
    draft.tags = [
        ...draft.tags,
        { id: `draft-${Date.now()}-${draft.tags.length}`, name: '', description: '', prompt: '' },
    ];
}
function removeTag(index) {
    if (draft.tags.length <= 1)
        return;
    draft.tags.splice(index, 1);
}
function validate() {
    submitted.value = true;
    const valid = Boolean(draft.name.trim()) && draft.tags.every((tag) => Boolean(tag.name.trim()));
    if (!valid)
        ElMessage.error('请完善必填内容');
    return valid;
}
function preview() {
    if (validate())
        emit('preview', clone(draft));
}
function submit() {
    if (validate())
        ElMessage.success(props.mode === 'edit' ? '编辑内容已准备' : '创建内容已准备');
}
const __VLS_exposed = { preview, submit };
defineExpose(__VLS_exposed);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({ mode: 'create' });
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['language-tab']} */ ;
/** @type {__VLS_StyleScopedClasses['language-config']} */ ;
/** @type {__VLS_StyleScopedClasses['add-tag']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "tag-fill-question-form" },
    'data-mode': (__VLS_ctx.mode),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "language-bar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ class: "language-tab is-active" },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ class: "language-config" },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
    ...{ class: "form-field" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "field-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "required-mark" },
});
/** @type {[typeof PerformanceTextField, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(PerformanceTextField, new PerformanceTextField({
    modelValue: (__VLS_ctx.draft.name),
    variant: "feishu-input",
    placeholder: "请输入名称",
    maxlength: (500),
    invalid: (__VLS_ctx.submitted && !__VLS_ctx.draft.name.trim()),
}));
const __VLS_1 = __VLS_0({
    modelValue: (__VLS_ctx.draft.name),
    variant: "feishu-input",
    placeholder: "请输入名称",
    maxlength: (500),
    invalid: (__VLS_ctx.submitted && !__VLS_ctx.draft.name.trim()),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
if (__VLS_ctx.submitted && !__VLS_ctx.draft.name.trim()) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "field-error" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
    ...{ class: "form-field" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "field-label" },
});
/** @type {[typeof PerformanceTextField, ]} */ ;
// @ts-ignore
const __VLS_3 = __VLS_asFunctionalComponent(PerformanceTextField, new PerformanceTextField({
    modelValue: (__VLS_ctx.draft.description),
    type: "textarea",
    placeholder: "请输入描述",
    maxlength: (20000),
    showCount: true,
}));
const __VLS_4 = __VLS_3({
    modelValue: (__VLS_ctx.draft.description),
    type: "textarea",
    placeholder: "请输入描述",
    maxlength: (20000),
    showCount: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_3));
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "tags-section" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
    ...{ class: "section-title" },
});
for (const [tag, index] of __VLS_getVForSourceType((__VLS_ctx.draft.tags))) {
    /** @type {[typeof TagItemEditor, ]} */ ;
    // @ts-ignore
    const __VLS_6 = __VLS_asFunctionalComponent(TagItemEditor, new TagItemEditor({
        ...{ 'onUpdate:modelValue': {} },
        ...{ 'onRemove': {} },
        key: (tag.id),
        modelValue: (tag),
        canRemove: (__VLS_ctx.draft.tags.length > 1),
        submitted: (__VLS_ctx.submitted),
    }));
    const __VLS_7 = __VLS_6({
        ...{ 'onUpdate:modelValue': {} },
        ...{ 'onRemove': {} },
        key: (tag.id),
        modelValue: (tag),
        canRemove: (__VLS_ctx.draft.tags.length > 1),
        submitted: (__VLS_ctx.submitted),
    }, ...__VLS_functionalComponentArgsRest(__VLS_6));
    let __VLS_9;
    let __VLS_10;
    let __VLS_11;
    const __VLS_12 = {
        'onUpdate:modelValue': (...[$event]) => {
            __VLS_ctx.draft.tags[index] = $event;
        }
    };
    const __VLS_13 = {
        onRemove: (...[$event]) => {
            __VLS_ctx.removeTag(index);
        }
    };
    var __VLS_8;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.addTag) },
    ...{ class: "add-tag" },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
    ...{ class: "form-field" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "field-label" },
});
/** @type {[typeof PerformanceTextField, ]} */ ;
// @ts-ignore
const __VLS_14 = __VLS_asFunctionalComponent(PerformanceTextField, new PerformanceTextField({
    modelValue: (__VLS_ctx.draft.remark),
    type: "textarea",
    placeholder: "填写帮助管理员理解此问题的内容，备注仅展示在飞书绩效管理后台",
    maxlength: (2000),
    showCount: true,
}));
const __VLS_15 = __VLS_14({
    modelValue: (__VLS_ctx.draft.remark),
    type: "textarea",
    placeholder: "填写帮助管理员理解此问题的内容，备注仅展示在飞书绩效管理后台",
    maxlength: (2000),
    showCount: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_14));
/** @type {__VLS_StyleScopedClasses['tag-fill-question-form']} */ ;
/** @type {__VLS_StyleScopedClasses['language-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['language-tab']} */ ;
/** @type {__VLS_StyleScopedClasses['is-active']} */ ;
/** @type {__VLS_StyleScopedClasses['language-config']} */ ;
/** @type {__VLS_StyleScopedClasses['form-field']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['required-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['field-error']} */ ;
/** @type {__VLS_StyleScopedClasses['form-field']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['tags-section']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['add-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['form-field']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformanceTextField: PerformanceTextField,
            TagItemEditor: TagItemEditor,
            draft: draft,
            submitted: submitted,
            addTag: addTag,
            removeTag: removeTag,
        };
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {
            ...__VLS_exposed,
        };
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
; /* PartiallyEnd: #4569/main.vue */
