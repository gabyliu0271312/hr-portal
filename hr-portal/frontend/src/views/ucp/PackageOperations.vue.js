/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, defineComponent, h, onMounted, reactive, ref } from 'vue';
import { ElButton, ElCheckbox, ElInput, ElInputNumber, ElTable, ElTableColumn } from 'element-plus';
import { ElMessage } from 'element-plus';
import { ucpApi } from '@/api/ucp';
const FieldEditor = defineComponent({ props: { modelValue: { type: Array, required: true }, title: { type: String, required: true }, allowSensitive: Boolean }, emits: ['update:modelValue'], setup(props, { emit }) { const rows = () => props.modelValue; const add = () => emit('update:modelValue', [...rows(), { field_id: '', label: '', type: 'string', required: false, sensitive: false }]); const update = (index, key, value) => { const next = [...rows()]; next[index] = { ...next[index], [key]: value }; emit('update:modelValue', next); }; const remove = (index) => emit('update:modelValue', rows().filter((_, rowIndex) => rowIndex !== index)); return () => h('div', [h('div', { class: 'field-title' }, [props.title, h(ElButton, { link: true, type: 'primary', onClick: add }, () => '新增字段')]), h(ElTable, { data: rows(), border: true, size: 'small' }, () => [h(ElTableColumn, { label: '字段编码' }, { default: ({ row, $index }) => h(ElInput, { modelValue: row.field_id, 'onUpdate:modelValue': (value) => update($index, 'field_id', value) }) }), h(ElTableColumn, { label: '展示名称' }, { default: ({ row, $index }) => h(ElInput, { modelValue: row.label, 'onUpdate:modelValue': (value) => update($index, 'label', value) }) }), h(ElTableColumn, { label: '类型', width: 120 }, { default: ({ row, $index }) => h('select', { value: row.type, onChange: (event) => update($index, 'type', event.target.value) }, ['string', 'number', 'integer', 'boolean', 'date'].map(type => h('option', { value: type }, type))) }), h(ElTableColumn, { label: '必填', width: 70 }, { default: ({ row, $index }) => h(ElCheckbox, { modelValue: row.required, 'onUpdate:modelValue': (value) => update($index, 'required', Boolean(value)) }) }), props.allowSensitive ? h(ElTableColumn, { label: '敏感', width: 70 }, { default: ({ row, $index }) => h(ElCheckbox, { modelValue: row.sensitive, 'onUpdate:modelValue': (value) => update($index, 'sensitive', Boolean(value)) }) }) : null, h(ElTableColumn, { width: 70 }, { default: ({ $index }) => h(ElButton, { link: true, type: 'danger', onClick: () => remove($index) }, () => '删除') })].filter(Boolean))]); } });
const props = defineProps();
const emit = defineEmits(['changed']);
const items = ref([]);
const testSystems = ref([]);
const testSystemId = ref();
const loading = ref(false);
const editorVisible = ref(false);
const openApiVisible = ref(false);
const openApiText = ref('');
const candidates = ref([]);
const chosen = ref([]);
const step = ref(0);
const empty = () => ({ id: 0, operation_code: '', operation_name: '', method: 'GET', path: '', inputFields: [], outputFields: [], errorRules: [] });
const editor = reactive(empty());
const testParameters = reactive({});
const requiredFields = computed(() => fieldsFromSchema(editor.input_schema || toSchema(editor.inputFields)).filter(field => field.required));
const editable = (row) => ['DRAFT', 'FAILED'].includes(row.status);
const fieldsFromSchema = (schema) => Object.entries(schema?.properties || {}).map(([field_id, value]) => ({ field_id, label: value.title || field_id, type: value.type || 'string', required: (schema.required || []).includes(field_id), sensitive: Boolean(value.sensitive) }));
const toSchema = (fields) => ({ type: 'object', properties: Object.fromEntries(fields.map(field => [field.field_id, { type: field.type, title: field.label, sensitive: field.sensitive }])), required: fields.filter(field => field.required).map(field => field.field_id) });
async function load() { loading.value = true; try {
    items.value = await ucpApi.packageOperations(props.packageCode);
}
finally {
    loading.value = false;
} }
function openEditor(row) { Object.assign(editor, empty(), row || {}, row ? { inputFields: fieldsFromSchema(row.input_schema), outputFields: fieldsFromSchema(row.output_schema), errorRules: row.error_rules || [] } : {}); Object.keys(testParameters).forEach(key => delete testParameters[key]); step.value = 0; editorVisible.value = true; }
async function openTest(row) { openEditor(row); testSystems.value = (await ucpApi.systems()).items.filter((item) => item.package_id === props.packageId); testSystemId.value = testSystems.value[0]?.id; step.value = 4; }
async function save() { try {
    const path = String(editor.path || '').trim();
    if (!editor.operation_code || !editor.operation_name || !path)
        return ElMessage.error('请填写动作编码、名称和相对路径');
    if (!path.startsWith('/'))
        return ElMessage.error('相对路径必须以 / 开头');
    const requestTemplate = Object.fromEntries(editor.inputFields.map((field) => [field.field_id, `{{${field.field_id}}}`]));
    const payload = { operation_code: editor.operation_code, operation_name: editor.operation_name, object_code: 'CUSTOM', method: editor.method, path, input_schema: toSchema(editor.inputFields), output_schema: toSchema(editor.outputFields), error_rules: editor.errorRules, query_config: editor.method === 'GET' ? requestTemplate : {}, body_template: editor.method === 'POST' ? requestTemplate : undefined };
    if (editor.id)
        await ucpApi.updatePackageOperation(props.packageCode, editor.id, payload);
    else
        await ucpApi.createPackageOperation(props.packageCode, payload);
    editorVisible.value = false;
    await load();
    emit('changed');
}
catch (error) {
    ElMessage.error(error?.response?.data?.detail || '保存失败');
} }
async function runTest(row) { const missing = requiredFields.value.filter(field => !testParameters[field.field_id]); if (missing.length)
    return ElMessage.error(`请填写测试参数：${missing.map(field => field.label).join('、')}`); if (!testSystemId.value)
    return ElMessage.error('请先选择已配置凭证的测试系统'); const result = await ucpApi.testPackageOperation(props.packageCode, row.id, { system_id: testSystemId.value, context: { ...testParameters } }); result.status === 'SUCCESS' ? ElMessage.success(result.message) : ElMessage.error(result.message || '测试失败'); editorVisible.value = false; await load(); }
async function publish(row) { await ucpApi.publishPackageOperation(props.packageCode, row.id); await load(); emit('changed'); }
async function disable(row) { await ucpApi.disablePackageOperation(props.packageCode, row.id); await load(); }
function openApiImport() { openApiText.value = ''; candidates.value = []; chosen.value = []; openApiVisible.value = true; }
async function preview() { try {
    const result = await ucpApi.previewPackageOpenApi(props.packageCode, JSON.parse(openApiText.value));
    candidates.value = result.operations;
    chosen.value = result.operations.map((item) => item.operation_id);
}
catch {
    ElMessage.error('OpenAPI 文档格式无效');
} }
async function importOpenApi() { await ucpApi.importPackageOpenApi(props.packageCode, { document: JSON.parse(openApiText.value), selected_operation_ids: chosen.value }); openApiVisible.value = false; await load(); }
onMounted(load);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['actions']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "ops" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "actions" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
const __VLS_0 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onClick': {} },
}));
const __VLS_2 = __VLS_1({
    ...{ 'onClick': {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onClick: (__VLS_ctx.openApiImport)
};
__VLS_3.slots.default;
var __VLS_3;
const __VLS_8 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    ...{ 'onClick': {} },
    type: "primary",
}));
const __VLS_10 = __VLS_9({
    ...{ 'onClick': {} },
    type: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
let __VLS_12;
let __VLS_13;
let __VLS_14;
const __VLS_15 = {
    onClick: (...[$event]) => {
        __VLS_ctx.openEditor();
    }
};
__VLS_11.slots.default;
var __VLS_11;
const __VLS_16 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    data: (__VLS_ctx.items),
    border: true,
}));
const __VLS_18 = __VLS_17({
    data: (__VLS_ctx.items),
    border: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_19.slots.default;
const __VLS_20 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    prop: "operation_name",
    label: "业务动作",
}));
const __VLS_22 = __VLS_21({
    prop: "operation_name",
    label: "业务动作",
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
const __VLS_24 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    prop: "path",
    label: "相对路径",
    minWidth: "220",
    showOverflowTooltip: true,
}));
const __VLS_26 = __VLS_25({
    prop: "path",
    label: "相对路径",
    minWidth: "220",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
const __VLS_28 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    label: "动作类型",
}));
const __VLS_30 = __VLS_29({
    label: "动作类型",
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
__VLS_31.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_31.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (row.method === 'POST' ? '查询' : '查询');
}
var __VLS_31;
const __VLS_32 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    prop: "status",
    label: "状态",
}));
const __VLS_34 = __VLS_33({
    prop: "status",
    label: "状态",
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
const __VLS_36 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
    label: "操作",
}));
const __VLS_38 = __VLS_37({
    label: "操作",
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
__VLS_39.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_39.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    if (__VLS_ctx.editable(row)) {
        const __VLS_40 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
            ...{ 'onClick': {} },
            link: true,
        }));
        const __VLS_42 = __VLS_41({
            ...{ 'onClick': {} },
            link: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_41));
        let __VLS_44;
        let __VLS_45;
        let __VLS_46;
        const __VLS_47 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.editable(row)))
                    return;
                __VLS_ctx.openEditor(row);
            }
        };
        __VLS_43.slots.default;
        var __VLS_43;
    }
    if (__VLS_ctx.editable(row)) {
        const __VLS_48 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
            ...{ 'onClick': {} },
            link: true,
        }));
        const __VLS_50 = __VLS_49({
            ...{ 'onClick': {} },
            link: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_49));
        let __VLS_52;
        let __VLS_53;
        let __VLS_54;
        const __VLS_55 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.editable(row)))
                    return;
                __VLS_ctx.openTest(row);
            }
        };
        __VLS_51.slots.default;
        var __VLS_51;
    }
    if (['TESTED', 'PENDING_APPROVAL'].includes(row.status)) {
        const __VLS_56 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
            ...{ 'onClick': {} },
            link: true,
            type: "success",
        }));
        const __VLS_58 = __VLS_57({
            ...{ 'onClick': {} },
            link: true,
            type: "success",
        }, ...__VLS_functionalComponentArgsRest(__VLS_57));
        let __VLS_60;
        let __VLS_61;
        let __VLS_62;
        const __VLS_63 = {
            onClick: (...[$event]) => {
                if (!(['TESTED', 'PENDING_APPROVAL'].includes(row.status)))
                    return;
                __VLS_ctx.publish(row);
            }
        };
        __VLS_59.slots.default;
        var __VLS_59;
    }
    if (row.status === 'PUBLISHED') {
        const __VLS_64 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
            ...{ 'onClick': {} },
            link: true,
            type: "danger",
        }));
        const __VLS_66 = __VLS_65({
            ...{ 'onClick': {} },
            link: true,
            type: "danger",
        }, ...__VLS_functionalComponentArgsRest(__VLS_65));
        let __VLS_68;
        let __VLS_69;
        let __VLS_70;
        const __VLS_71 = {
            onClick: (...[$event]) => {
                if (!(row.status === 'PUBLISHED'))
                    return;
                __VLS_ctx.disable(row);
            }
        };
        __VLS_67.slots.default;
        var __VLS_67;
    }
}
var __VLS_39;
var __VLS_19;
const __VLS_72 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
    modelValue: (__VLS_ctx.editorVisible),
    title: "业务动作定义",
    width: "820px",
    destroyOnClose: true,
}));
const __VLS_74 = __VLS_73({
    modelValue: (__VLS_ctx.editorVisible),
    title: "业务动作定义",
    width: "820px",
    destroyOnClose: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_73));
__VLS_75.slots.default;
const __VLS_76 = {}.ElSteps;
/** @type {[typeof __VLS_components.ElSteps, typeof __VLS_components.elSteps, typeof __VLS_components.ElSteps, typeof __VLS_components.elSteps, ]} */ ;
// @ts-ignore
const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
    active: (__VLS_ctx.step),
    finishStatus: "success",
    simple: true,
}));
const __VLS_78 = __VLS_77({
    active: (__VLS_ctx.step),
    finishStatus: "success",
    simple: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_77));
__VLS_79.slots.default;
const __VLS_80 = {}.ElStep;
/** @type {[typeof __VLS_components.ElStep, typeof __VLS_components.elStep, ]} */ ;
// @ts-ignore
const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
    title: "基础信息",
}));
const __VLS_82 = __VLS_81({
    title: "基础信息",
}, ...__VLS_functionalComponentArgsRest(__VLS_81));
const __VLS_84 = {}.ElStep;
/** @type {[typeof __VLS_components.ElStep, typeof __VLS_components.elStep, ]} */ ;
// @ts-ignore
const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
    title: "请求参数",
}));
const __VLS_86 = __VLS_85({
    title: "请求参数",
}, ...__VLS_functionalComponentArgsRest(__VLS_85));
const __VLS_88 = {}.ElStep;
/** @type {[typeof __VLS_components.ElStep, typeof __VLS_components.elStep, ]} */ ;
// @ts-ignore
const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
    title: "返回字段",
}));
const __VLS_90 = __VLS_89({
    title: "返回字段",
}, ...__VLS_functionalComponentArgsRest(__VLS_89));
const __VLS_92 = {}.ElStep;
/** @type {[typeof __VLS_components.ElStep, typeof __VLS_components.elStep, ]} */ ;
// @ts-ignore
const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
    title: "错误与脱敏",
}));
const __VLS_94 = __VLS_93({
    title: "错误与脱敏",
}, ...__VLS_functionalComponentArgsRest(__VLS_93));
const __VLS_96 = {}.ElStep;
/** @type {[typeof __VLS_components.ElStep, typeof __VLS_components.elStep, ]} */ ;
// @ts-ignore
const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
    title: "测试发布",
}));
const __VLS_98 = __VLS_97({
    title: "测试发布",
}, ...__VLS_functionalComponentArgsRest(__VLS_97));
var __VLS_79;
const __VLS_100 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
    model: (__VLS_ctx.editor),
    labelWidth: "100px",
    ...{ class: "step-form" },
}));
const __VLS_102 = __VLS_101({
    model: (__VLS_ctx.editor),
    labelWidth: "100px",
    ...{ class: "step-form" },
}, ...__VLS_functionalComponentArgsRest(__VLS_101));
__VLS_asFunctionalDirective(__VLS_directives.vShow)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.step === 0) }, null, null);
__VLS_103.slots.default;
const __VLS_104 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
    label: "动作编码",
    required: true,
}));
const __VLS_106 = __VLS_105({
    label: "动作编码",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_105));
__VLS_107.slots.default;
const __VLS_108 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
    modelValue: (__VLS_ctx.editor.operation_code),
    disabled: (Boolean(__VLS_ctx.editor.id)),
}));
const __VLS_110 = __VLS_109({
    modelValue: (__VLS_ctx.editor.operation_code),
    disabled: (Boolean(__VLS_ctx.editor.id)),
}, ...__VLS_functionalComponentArgsRest(__VLS_109));
var __VLS_107;
const __VLS_112 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
    label: "动作名称",
    required: true,
}));
const __VLS_114 = __VLS_113({
    label: "动作名称",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_113));
__VLS_115.slots.default;
const __VLS_116 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
    modelValue: (__VLS_ctx.editor.operation_name),
}));
const __VLS_118 = __VLS_117({
    modelValue: (__VLS_ctx.editor.operation_name),
}, ...__VLS_functionalComponentArgsRest(__VLS_117));
var __VLS_115;
const __VLS_120 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
    label: "查询方式",
}));
const __VLS_122 = __VLS_121({
    label: "查询方式",
}, ...__VLS_functionalComponentArgsRest(__VLS_121));
__VLS_123.slots.default;
const __VLS_124 = {}.ElRadioGroup;
/** @type {[typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, ]} */ ;
// @ts-ignore
const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
    modelValue: (__VLS_ctx.editor.method),
}));
const __VLS_126 = __VLS_125({
    modelValue: (__VLS_ctx.editor.method),
}, ...__VLS_functionalComponentArgsRest(__VLS_125));
__VLS_127.slots.default;
const __VLS_128 = {}.ElRadio;
/** @type {[typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, ]} */ ;
// @ts-ignore
const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
    value: "GET",
}));
const __VLS_130 = __VLS_129({
    value: "GET",
}, ...__VLS_functionalComponentArgsRest(__VLS_129));
__VLS_131.slots.default;
var __VLS_131;
const __VLS_132 = {}.ElRadio;
/** @type {[typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, ]} */ ;
// @ts-ignore
const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
    value: "POST",
}));
const __VLS_134 = __VLS_133({
    value: "POST",
}, ...__VLS_functionalComponentArgsRest(__VLS_133));
__VLS_135.slots.default;
var __VLS_135;
var __VLS_127;
var __VLS_123;
const __VLS_136 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
    label: "相对路径",
    required: true,
}));
const __VLS_138 = __VLS_137({
    label: "相对路径",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_137));
__VLS_139.slots.default;
const __VLS_140 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
    modelValue: (__VLS_ctx.editor.path),
    placeholder: "例如 /open-apis/contact/v3/users",
}));
const __VLS_142 = __VLS_141({
    modelValue: (__VLS_ctx.editor.path),
    placeholder: "例如 /open-apis/contact/v3/users",
}, ...__VLS_functionalComponentArgsRest(__VLS_141));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-hint" },
});
var __VLS_139;
const __VLS_144 = {}.ElAlert;
/** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
// @ts-ignore
const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
    title: "基础 URL、域名白名单、认证和技术 Header 由接入类型统一托管。",
    type: "info",
    closable: (false),
}));
const __VLS_146 = __VLS_145({
    title: "基础 URL、域名白名单、认证和技术 Header 由接入类型统一托管。",
    type: "info",
    closable: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_145));
var __VLS_103;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "step-form" },
});
__VLS_asFunctionalDirective(__VLS_directives.vShow)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.step === 1) }, null, null);
const __VLS_148 = {}.FieldEditor;
/** @type {[typeof __VLS_components.FieldEditor, ]} */ ;
// @ts-ignore
const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
    modelValue: (__VLS_ctx.editor.inputFields),
    title: "请求业务字段",
}));
const __VLS_150 = __VLS_149({
    modelValue: (__VLS_ctx.editor.inputFields),
    title: "请求业务字段",
}, ...__VLS_functionalComponentArgsRest(__VLS_149));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "step-form" },
});
__VLS_asFunctionalDirective(__VLS_directives.vShow)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.step === 2) }, null, null);
const __VLS_152 = {}.FieldEditor;
/** @type {[typeof __VLS_components.FieldEditor, ]} */ ;
// @ts-ignore
const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
    modelValue: (__VLS_ctx.editor.outputFields),
    title: "返回业务字段",
    allowSensitive: (true),
}));
const __VLS_154 = __VLS_153({
    modelValue: (__VLS_ctx.editor.outputFields),
    title: "返回业务字段",
    allowSensitive: (true),
}, ...__VLS_functionalComponentArgsRest(__VLS_153));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "step-form" },
});
__VLS_asFunctionalDirective(__VLS_directives.vShow)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.step === 3) }, null, null);
const __VLS_156 = {}.ElAlert;
/** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
// @ts-ignore
const __VLS_157 = __VLS_asFunctionalComponent(__VLS_156, new __VLS_156({
    title: "敏感字段不会保存到样本和测试结果中。",
    type: "warning",
    closable: (false),
}));
const __VLS_158 = __VLS_157({
    title: "敏感字段不会保存到样本和测试结果中。",
    type: "warning",
    closable: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_157));
const __VLS_160 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
    data: (__VLS_ctx.editor.errorRules),
    size: "small",
    border: true,
    ...{ style: {} },
}));
const __VLS_162 = __VLS_161({
    data: (__VLS_ctx.editor.errorRules),
    size: "small",
    border: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_161));
__VLS_163.slots.default;
const __VLS_164 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({
    label: "状态码",
}));
const __VLS_166 = __VLS_165({
    label: "状态码",
}, ...__VLS_functionalComponentArgsRest(__VLS_165));
__VLS_167.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_167.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_168 = {}.ElInputNumber;
    /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
    // @ts-ignore
    const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({
        modelValue: (row.status_code),
        min: (100),
        max: (599),
    }));
    const __VLS_170 = __VLS_169({
        modelValue: (row.status_code),
        min: (100),
        max: (599),
    }, ...__VLS_functionalComponentArgsRest(__VLS_169));
}
var __VLS_167;
const __VLS_172 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_173 = __VLS_asFunctionalComponent(__VLS_172, new __VLS_172({
    label: "错误码",
}));
const __VLS_174 = __VLS_173({
    label: "错误码",
}, ...__VLS_functionalComponentArgsRest(__VLS_173));
__VLS_175.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_175.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_176 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({
        modelValue: (row.error_code),
    }));
    const __VLS_178 = __VLS_177({
        modelValue: (row.error_code),
    }, ...__VLS_functionalComponentArgsRest(__VLS_177));
}
var __VLS_175;
const __VLS_180 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_181 = __VLS_asFunctionalComponent(__VLS_180, new __VLS_180({
    label: "业务提示",
}));
const __VLS_182 = __VLS_181({
    label: "业务提示",
}, ...__VLS_functionalComponentArgsRest(__VLS_181));
__VLS_183.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_183.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_184 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_185 = __VLS_asFunctionalComponent(__VLS_184, new __VLS_184({
        modelValue: (row.message),
    }));
    const __VLS_186 = __VLS_185({
        modelValue: (row.message),
    }, ...__VLS_functionalComponentArgsRest(__VLS_185));
}
var __VLS_183;
const __VLS_188 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_189 = __VLS_asFunctionalComponent(__VLS_188, new __VLS_188({
    width: "70",
}));
const __VLS_190 = __VLS_189({
    width: "70",
}, ...__VLS_functionalComponentArgsRest(__VLS_189));
__VLS_191.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_191.slots;
    const [{ $index }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_192 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_193 = __VLS_asFunctionalComponent(__VLS_192, new __VLS_192({
        ...{ 'onClick': {} },
        link: true,
        type: "danger",
    }));
    const __VLS_194 = __VLS_193({
        ...{ 'onClick': {} },
        link: true,
        type: "danger",
    }, ...__VLS_functionalComponentArgsRest(__VLS_193));
    let __VLS_196;
    let __VLS_197;
    let __VLS_198;
    const __VLS_199 = {
        onClick: (...[$event]) => {
            __VLS_ctx.editor.errorRules.splice($index, 1);
        }
    };
    __VLS_195.slots.default;
    var __VLS_195;
}
var __VLS_191;
var __VLS_163;
const __VLS_200 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_201 = __VLS_asFunctionalComponent(__VLS_200, new __VLS_200({
    ...{ 'onClick': {} },
    link: true,
    type: "primary",
}));
const __VLS_202 = __VLS_201({
    ...{ 'onClick': {} },
    link: true,
    type: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_201));
let __VLS_204;
let __VLS_205;
let __VLS_206;
const __VLS_207 = {
    onClick: (...[$event]) => {
        __VLS_ctx.editor.errorRules.push({ status_code: 404, error_code: '', message: '未找到符合条件的业务数据', priority: 0 });
    }
};
__VLS_203.slots.default;
var __VLS_203;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "step-form" },
});
__VLS_asFunctionalDirective(__VLS_directives.vShow)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.step === 4) }, null, null);
const __VLS_208 = {}.ElResult;
/** @type {[typeof __VLS_components.ElResult, typeof __VLS_components.elResult, typeof __VLS_components.ElResult, typeof __VLS_components.elResult, ]} */ ;
// @ts-ignore
const __VLS_209 = __VLS_asFunctionalComponent(__VLS_208, new __VLS_208({
    icon: "info",
    title: "使用已有系统进行连接测试",
    subTitle: "测试将使用所选系统的有效凭证发起只读请求；填写的参数只用于本次测试。",
}));
const __VLS_210 = __VLS_209({
    icon: "info",
    title: "使用已有系统进行连接测试",
    subTitle: "测试将使用所选系统的有效凭证发起只读请求；填写的参数只用于本次测试。",
}, ...__VLS_functionalComponentArgsRest(__VLS_209));
__VLS_211.slots.default;
{
    const { extra: __VLS_thisSlot } = __VLS_211.slots;
    if (__VLS_ctx.editor.id) {
        const __VLS_212 = {}.ElForm;
        /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
        // @ts-ignore
        const __VLS_213 = __VLS_asFunctionalComponent(__VLS_212, new __VLS_212({
            model: (__VLS_ctx.testParameters),
            labelWidth: "110px",
            ...{ style: {} },
        }));
        const __VLS_214 = __VLS_213({
            model: (__VLS_ctx.testParameters),
            labelWidth: "110px",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_213));
        __VLS_215.slots.default;
        const __VLS_216 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_217 = __VLS_asFunctionalComponent(__VLS_216, new __VLS_216({
            label: "测试系统",
            required: true,
        }));
        const __VLS_218 = __VLS_217({
            label: "测试系统",
            required: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_217));
        __VLS_219.slots.default;
        const __VLS_220 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_221 = __VLS_asFunctionalComponent(__VLS_220, new __VLS_220({
            modelValue: (__VLS_ctx.testSystemId),
            placeholder: "选择已配置凭证的系统",
            ...{ style: {} },
        }));
        const __VLS_222 = __VLS_221({
            modelValue: (__VLS_ctx.testSystemId),
            placeholder: "选择已配置凭证的系统",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_221));
        __VLS_223.slots.default;
        for (const [system] of __VLS_getVForSourceType((__VLS_ctx.testSystems))) {
            const __VLS_224 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_225 = __VLS_asFunctionalComponent(__VLS_224, new __VLS_224({
                key: (system.id),
                label: (system.system_name),
                value: (system.id),
            }));
            const __VLS_226 = __VLS_225({
                key: (system.id),
                label: (system.system_name),
                value: (system.id),
            }, ...__VLS_functionalComponentArgsRest(__VLS_225));
        }
        var __VLS_223;
        var __VLS_219;
        for (const [field] of __VLS_getVForSourceType((__VLS_ctx.requiredFields))) {
            const __VLS_228 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_229 = __VLS_asFunctionalComponent(__VLS_228, new __VLS_228({
                key: (field.field_id),
                label: (field.label),
                required: true,
            }));
            const __VLS_230 = __VLS_229({
                key: (field.field_id),
                label: (field.label),
                required: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_229));
            __VLS_231.slots.default;
            const __VLS_232 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_233 = __VLS_asFunctionalComponent(__VLS_232, new __VLS_232({
                modelValue: (__VLS_ctx.testParameters[field.field_id]),
            }));
            const __VLS_234 = __VLS_233({
                modelValue: (__VLS_ctx.testParameters[field.field_id]),
            }, ...__VLS_functionalComponentArgsRest(__VLS_233));
            var __VLS_231;
        }
        const __VLS_236 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_237 = __VLS_asFunctionalComponent(__VLS_236, new __VLS_236({
            ...{ 'onClick': {} },
            type: "primary",
        }));
        const __VLS_238 = __VLS_237({
            ...{ 'onClick': {} },
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_237));
        let __VLS_240;
        let __VLS_241;
        let __VLS_242;
        const __VLS_243 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.editor.id))
                    return;
                __VLS_ctx.runTest(__VLS_ctx.editor);
            }
        };
        __VLS_239.slots.default;
        var __VLS_239;
        var __VLS_215;
    }
}
var __VLS_211;
{
    const { footer: __VLS_thisSlot } = __VLS_75.slots;
    const __VLS_244 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_245 = __VLS_asFunctionalComponent(__VLS_244, new __VLS_244({
        ...{ 'onClick': {} },
        disabled: (__VLS_ctx.step === 0),
    }));
    const __VLS_246 = __VLS_245({
        ...{ 'onClick': {} },
        disabled: (__VLS_ctx.step === 0),
    }, ...__VLS_functionalComponentArgsRest(__VLS_245));
    let __VLS_248;
    let __VLS_249;
    let __VLS_250;
    const __VLS_251 = {
        onClick: (...[$event]) => {
            __VLS_ctx.step--;
        }
    };
    __VLS_247.slots.default;
    var __VLS_247;
    if (__VLS_ctx.step < 4) {
        const __VLS_252 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_253 = __VLS_asFunctionalComponent(__VLS_252, new __VLS_252({
            ...{ 'onClick': {} },
            type: "primary",
        }));
        const __VLS_254 = __VLS_253({
            ...{ 'onClick': {} },
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_253));
        let __VLS_256;
        let __VLS_257;
        let __VLS_258;
        const __VLS_259 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.step < 4))
                    return;
                __VLS_ctx.step++;
            }
        };
        __VLS_255.slots.default;
        var __VLS_255;
    }
    else {
        const __VLS_260 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_261 = __VLS_asFunctionalComponent(__VLS_260, new __VLS_260({
            ...{ 'onClick': {} },
            type: "primary",
        }));
        const __VLS_262 = __VLS_261({
            ...{ 'onClick': {} },
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_261));
        let __VLS_264;
        let __VLS_265;
        let __VLS_266;
        const __VLS_267 = {
            onClick: (__VLS_ctx.save)
        };
        __VLS_263.slots.default;
        var __VLS_263;
    }
}
var __VLS_75;
const __VLS_268 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_269 = __VLS_asFunctionalComponent(__VLS_268, new __VLS_268({
    modelValue: (__VLS_ctx.openApiVisible),
    title: "导入 OpenAPI",
    width: "680px",
}));
const __VLS_270 = __VLS_269({
    modelValue: (__VLS_ctx.openApiVisible),
    title: "导入 OpenAPI",
    width: "680px",
}, ...__VLS_functionalComponentArgsRest(__VLS_269));
__VLS_271.slots.default;
const __VLS_272 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_273 = __VLS_asFunctionalComponent(__VLS_272, new __VLS_272({
    modelValue: (__VLS_ctx.openApiText),
    type: "textarea",
    rows: (9),
    placeholder: "粘贴 OpenAPI 3.x 文档以转换为动作草稿",
}));
const __VLS_274 = __VLS_273({
    modelValue: (__VLS_ctx.openApiText),
    type: "textarea",
    rows: (9),
    placeholder: "粘贴 OpenAPI 3.x 文档以转换为动作草稿",
}, ...__VLS_functionalComponentArgsRest(__VLS_273));
const __VLS_276 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_277 = __VLS_asFunctionalComponent(__VLS_276, new __VLS_276({
    ...{ 'onClick': {} },
    ...{ style: {} },
}));
const __VLS_278 = __VLS_277({
    ...{ 'onClick': {} },
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_277));
let __VLS_280;
let __VLS_281;
let __VLS_282;
const __VLS_283 = {
    onClick: (__VLS_ctx.preview)
};
__VLS_279.slots.default;
var __VLS_279;
const __VLS_284 = {}.ElCheckboxGroup;
/** @type {[typeof __VLS_components.ElCheckboxGroup, typeof __VLS_components.elCheckboxGroup, typeof __VLS_components.ElCheckboxGroup, typeof __VLS_components.elCheckboxGroup, ]} */ ;
// @ts-ignore
const __VLS_285 = __VLS_asFunctionalComponent(__VLS_284, new __VLS_284({
    modelValue: (__VLS_ctx.chosen),
}));
const __VLS_286 = __VLS_285({
    modelValue: (__VLS_ctx.chosen),
}, ...__VLS_functionalComponentArgsRest(__VLS_285));
__VLS_287.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.candidates))) {
    const __VLS_288 = {}.ElCheckbox;
    /** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
    // @ts-ignore
    const __VLS_289 = __VLS_asFunctionalComponent(__VLS_288, new __VLS_288({
        key: (item.operation_id),
        label: (item.operation_id),
    }));
    const __VLS_290 = __VLS_289({
        key: (item.operation_id),
        label: (item.operation_id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_289));
    __VLS_291.slots.default;
    (item.template_name);
    var __VLS_291;
}
var __VLS_287;
{
    const { footer: __VLS_thisSlot } = __VLS_271.slots;
    const __VLS_292 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_293 = __VLS_asFunctionalComponent(__VLS_292, new __VLS_292({
        ...{ 'onClick': {} },
    }));
    const __VLS_294 = __VLS_293({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_293));
    let __VLS_296;
    let __VLS_297;
    let __VLS_298;
    const __VLS_299 = {
        onClick: (...[$event]) => {
            __VLS_ctx.openApiVisible = false;
        }
    };
    __VLS_295.slots.default;
    var __VLS_295;
    const __VLS_300 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_301 = __VLS_asFunctionalComponent(__VLS_300, new __VLS_300({
        ...{ 'onClick': {} },
        type: "primary",
    }));
    const __VLS_302 = __VLS_301({
        ...{ 'onClick': {} },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_301));
    let __VLS_304;
    let __VLS_305;
    let __VLS_306;
    const __VLS_307 = {
        onClick: (__VLS_ctx.importOpenApi)
    };
    __VLS_303.slots.default;
    var __VLS_303;
}
var __VLS_271;
/** @type {__VLS_StyleScopedClasses['ops']} */ ;
/** @type {__VLS_StyleScopedClasses['actions']} */ ;
/** @type {__VLS_StyleScopedClasses['step-form']} */ ;
/** @type {__VLS_StyleScopedClasses['form-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['step-form']} */ ;
/** @type {__VLS_StyleScopedClasses['step-form']} */ ;
/** @type {__VLS_StyleScopedClasses['step-form']} */ ;
/** @type {__VLS_StyleScopedClasses['step-form']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ElButton: ElButton,
            ElCheckbox: ElCheckbox,
            ElInput: ElInput,
            ElInputNumber: ElInputNumber,
            ElTable: ElTable,
            ElTableColumn: ElTableColumn,
            FieldEditor: FieldEditor,
            items: items,
            testSystems: testSystems,
            testSystemId: testSystemId,
            loading: loading,
            editorVisible: editorVisible,
            openApiVisible: openApiVisible,
            openApiText: openApiText,
            candidates: candidates,
            chosen: chosen,
            step: step,
            editor: editor,
            testParameters: testParameters,
            requiredFields: requiredFields,
            editable: editable,
            openEditor: openEditor,
            openTest: openTest,
            save: save,
            runTest: runTest,
            publish: publish,
            disable: disable,
            openApiImport: openApiImport,
            preview: preview,
            importOpenApi: importOpenApi,
        };
    },
    emits: {},
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    emits: {},
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
