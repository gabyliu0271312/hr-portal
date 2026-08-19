/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref, computed, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { ucpApi } from '@/api/ucp';
const props = defineProps();
const emit = defineEmits();
const visible = ref(props.modelValue);
watch(() => props.modelValue, (v) => visible.value = v);
watch(visible, (v) => emit('update:modelValue', v));
const form = ref({
    target_type: 'all',
    dry_run: true,
    skip_existing: true,
});
const jsonText = ref('');
const result = ref(null);
const importing = ref(false);
const allErrors = computed(() => {
    if (!result.value)
        return [];
    return [
        ...result.value.credentials.errors.map((e) => ({ type: 'credential', ...e })),
        ...result.value.resources.errors.map((e) => ({ type: 'system', ...e })),
        ...result.value.pipelines.errors.map((e) => ({ type: 'pipeline', ...e })),
    ];
});
const hasErrors = computed(() => allErrors.value.length > 0);
function onOpen() {
    jsonText.value = '';
    result.value = null;
}
function onFileChange(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        jsonText.value = String(e.target?.result || '');
        ElMessage.success(`已加载 ${file.name}（${jsonText.value.length} 字符）`);
    };
    if (file.raw)
        reader.readAsText(file.raw);
}
function formatJson() {
    try {
        const obj = JSON.parse(jsonText.value);
        jsonText.value = JSON.stringify(obj, null, 2);
        ElMessage.success('JSON 已格式化');
    }
    catch {
        ElMessage.error('当前内容不是有效 JSON（YAML 也可粘贴，后端会自动转换）');
    }
}
async function doImport() {
    if (!jsonText.value.trim()) {
        ElMessage.warning('请粘贴或上传配置内容');
        return;
    }
    let content;
    try {
        content = JSON.parse(jsonText.value);
    }
    catch {
        ElMessage.error('JSON 解析失败，请检查格式');
        return;
    }
    importing.value = true;
    try {
        result.value = await ucpApi.configImport({
            content,
            target_type: form.value.target_type,
            dry_run: form.value.dry_run,
            skip_existing: form.value.skip_existing,
        });
        if (!form.value.dry_run && !hasErrors.value) {
            emit('imported');
        }
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '导入失败');
    }
    finally {
        importing.value = false;
    }
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
const __VLS_0 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onOpen': {} },
    modelValue: (__VLS_ctx.visible),
    title: "导入 UCP 配置",
    width: "720px",
    destroyOnClose: true,
}));
const __VLS_2 = __VLS_1({
    ...{ 'onOpen': {} },
    modelValue: (__VLS_ctx.visible),
    title: "导入 UCP 配置",
    width: "720px",
    destroyOnClose: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onOpen: (__VLS_ctx.onOpen)
};
var __VLS_8 = {};
__VLS_3.slots.default;
const __VLS_9 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_10 = __VLS_asFunctionalComponent(__VLS_9, new __VLS_9({
    model: (__VLS_ctx.form),
    labelWidth: "100px",
    size: "default",
}));
const __VLS_11 = __VLS_10({
    model: (__VLS_ctx.form),
    labelWidth: "100px",
    size: "default",
}, ...__VLS_functionalComponentArgsRest(__VLS_10));
__VLS_12.slots.default;
const __VLS_13 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_14 = __VLS_asFunctionalComponent(__VLS_13, new __VLS_13({
    label: "导入范围",
}));
const __VLS_15 = __VLS_14({
    label: "导入范围",
}, ...__VLS_functionalComponentArgsRest(__VLS_14));
__VLS_16.slots.default;
const __VLS_17 = {}.ElRadioGroup;
/** @type {[typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, ]} */ ;
// @ts-ignore
const __VLS_18 = __VLS_asFunctionalComponent(__VLS_17, new __VLS_17({
    modelValue: (__VLS_ctx.form.target_type),
}));
const __VLS_19 = __VLS_18({
    modelValue: (__VLS_ctx.form.target_type),
}, ...__VLS_functionalComponentArgsRest(__VLS_18));
__VLS_20.slots.default;
const __VLS_21 = {}.ElRadioButton;
/** @type {[typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, ]} */ ;
// @ts-ignore
const __VLS_22 = __VLS_asFunctionalComponent(__VLS_21, new __VLS_21({
    value: "all",
}));
const __VLS_23 = __VLS_22({
    value: "all",
}, ...__VLS_functionalComponentArgsRest(__VLS_22));
__VLS_24.slots.default;
var __VLS_24;
const __VLS_25 = {}.ElRadioButton;
/** @type {[typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, ]} */ ;
// @ts-ignore
const __VLS_26 = __VLS_asFunctionalComponent(__VLS_25, new __VLS_25({
    value: "system",
}));
const __VLS_27 = __VLS_26({
    value: "system",
}, ...__VLS_functionalComponentArgsRest(__VLS_26));
__VLS_28.slots.default;
var __VLS_28;
const __VLS_29 = {}.ElRadioButton;
/** @type {[typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, ]} */ ;
// @ts-ignore
const __VLS_30 = __VLS_asFunctionalComponent(__VLS_29, new __VLS_29({
    value: "pipeline",
}));
const __VLS_31 = __VLS_30({
    value: "pipeline",
}, ...__VLS_functionalComponentArgsRest(__VLS_30));
__VLS_32.slots.default;
var __VLS_32;
const __VLS_33 = {}.ElRadioButton;
/** @type {[typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, ]} */ ;
// @ts-ignore
const __VLS_34 = __VLS_asFunctionalComponent(__VLS_33, new __VLS_33({
    value: "credential",
}));
const __VLS_35 = __VLS_34({
    value: "credential",
}, ...__VLS_functionalComponentArgsRest(__VLS_34));
__VLS_36.slots.default;
var __VLS_36;
var __VLS_20;
var __VLS_16;
const __VLS_37 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_38 = __VLS_asFunctionalComponent(__VLS_37, new __VLS_37({
    label: "导入策略",
}));
const __VLS_39 = __VLS_38({
    label: "导入策略",
}, ...__VLS_functionalComponentArgsRest(__VLS_38));
__VLS_40.slots.default;
const __VLS_41 = {}.ElCheckbox;
/** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
// @ts-ignore
const __VLS_42 = __VLS_asFunctionalComponent(__VLS_41, new __VLS_41({
    modelValue: (__VLS_ctx.form.dry_run),
}));
const __VLS_43 = __VLS_42({
    modelValue: (__VLS_ctx.form.dry_run),
}, ...__VLS_functionalComponentArgsRest(__VLS_42));
__VLS_44.slots.default;
var __VLS_44;
const __VLS_45 = {}.ElCheckbox;
/** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
// @ts-ignore
const __VLS_46 = __VLS_asFunctionalComponent(__VLS_45, new __VLS_45({
    modelValue: (__VLS_ctx.form.skip_existing),
}));
const __VLS_47 = __VLS_46({
    modelValue: (__VLS_ctx.form.skip_existing),
}, ...__VLS_functionalComponentArgsRest(__VLS_46));
__VLS_48.slots.default;
var __VLS_48;
var __VLS_40;
const __VLS_49 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_50 = __VLS_asFunctionalComponent(__VLS_49, new __VLS_49({
    label: "JSON 内容",
    required: true,
}));
const __VLS_51 = __VLS_50({
    label: "JSON 内容",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_50));
__VLS_52.slots.default;
const __VLS_53 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_54 = __VLS_asFunctionalComponent(__VLS_53, new __VLS_53({
    modelValue: (__VLS_ctx.jsonText),
    type: "textarea",
    rows: (14),
    placeholder: '粘贴导出的 JSON/YAML 内容，或留空从下方选择文件',
}));
const __VLS_55 = __VLS_54({
    modelValue: (__VLS_ctx.jsonText),
    type: "textarea",
    rows: (14),
    placeholder: '粘贴导出的 JSON/YAML 内容，或留空从下方选择文件',
}, ...__VLS_functionalComponentArgsRest(__VLS_54));
var __VLS_52;
const __VLS_57 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_58 = __VLS_asFunctionalComponent(__VLS_57, new __VLS_57({}));
const __VLS_59 = __VLS_58({}, ...__VLS_functionalComponentArgsRest(__VLS_58));
__VLS_60.slots.default;
const __VLS_61 = {}.ElUpload;
/** @type {[typeof __VLS_components.ElUpload, typeof __VLS_components.elUpload, typeof __VLS_components.ElUpload, typeof __VLS_components.elUpload, ]} */ ;
// @ts-ignore
const __VLS_62 = __VLS_asFunctionalComponent(__VLS_61, new __VLS_61({
    autoUpload: (false),
    showFileList: (false),
    accept: ".json,.yaml,.yml",
    onChange: (__VLS_ctx.onFileChange),
}));
const __VLS_63 = __VLS_62({
    autoUpload: (false),
    showFileList: (false),
    accept: ".json,.yaml,.yml",
    onChange: (__VLS_ctx.onFileChange),
}, ...__VLS_functionalComponentArgsRest(__VLS_62));
__VLS_64.slots.default;
const __VLS_65 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_66 = __VLS_asFunctionalComponent(__VLS_65, new __VLS_65({}));
const __VLS_67 = __VLS_66({}, ...__VLS_functionalComponentArgsRest(__VLS_66));
__VLS_68.slots.default;
var __VLS_68;
var __VLS_64;
if (__VLS_ctx.jsonText) {
    const __VLS_69 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_70 = __VLS_asFunctionalComponent(__VLS_69, new __VLS_69({
        ...{ 'onClick': {} },
        link: true,
        type: "primary",
    }));
    const __VLS_71 = __VLS_70({
        ...{ 'onClick': {} },
        link: true,
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_70));
    let __VLS_73;
    let __VLS_74;
    let __VLS_75;
    const __VLS_76 = {
        onClick: (__VLS_ctx.formatJson)
    };
    __VLS_72.slots.default;
    var __VLS_72;
}
if (__VLS_ctx.jsonText) {
    const __VLS_77 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_78 = __VLS_asFunctionalComponent(__VLS_77, new __VLS_77({
        ...{ 'onClick': {} },
        link: true,
        type: "danger",
    }));
    const __VLS_79 = __VLS_78({
        ...{ 'onClick': {} },
        link: true,
        type: "danger",
    }, ...__VLS_functionalComponentArgsRest(__VLS_78));
    let __VLS_81;
    let __VLS_82;
    let __VLS_83;
    const __VLS_84 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.jsonText))
                return;
            __VLS_ctx.jsonText = '';
        }
    };
    __VLS_80.slots.default;
    var __VLS_80;
}
var __VLS_60;
var __VLS_12;
if (__VLS_ctx.result) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "result-box mt-3" },
    });
    const __VLS_85 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_86 = __VLS_asFunctionalComponent(__VLS_85, new __VLS_85({
        type: (__VLS_ctx.result.dry_run ? 'info' : (__VLS_ctx.hasErrors ? 'warning' : 'success')),
        closable: (false),
        showIcon: true,
    }));
    const __VLS_87 = __VLS_86({
        type: (__VLS_ctx.result.dry_run ? 'info' : (__VLS_ctx.hasErrors ? 'warning' : 'success')),
        closable: (false),
        showIcon: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_86));
    __VLS_88.slots.default;
    {
        const { title: __VLS_thisSlot } = __VLS_88.slots;
        (__VLS_ctx.result.dry_run ? '校验结果（未实际导入）' : (__VLS_ctx.hasErrors ? '部分导入成功' : '导入成功'));
    }
    var __VLS_88;
    const __VLS_89 = {}.ElRow;
    /** @type {[typeof __VLS_components.ElRow, typeof __VLS_components.elRow, typeof __VLS_components.ElRow, typeof __VLS_components.elRow, ]} */ ;
    // @ts-ignore
    const __VLS_90 = __VLS_asFunctionalComponent(__VLS_89, new __VLS_89({
        gutter: (12),
        ...{ class: "mt-2" },
    }));
    const __VLS_91 = __VLS_90({
        gutter: (12),
        ...{ class: "mt-2" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_90));
    __VLS_92.slots.default;
    const __VLS_93 = {}.ElCol;
    /** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
    // @ts-ignore
    const __VLS_94 = __VLS_asFunctionalComponent(__VLS_93, new __VLS_93({
        span: (8),
    }));
    const __VLS_95 = __VLS_94({
        span: (8),
    }, ...__VLS_functionalComponentArgsRest(__VLS_94));
    __VLS_96.slots.default;
    const __VLS_97 = {}.ElStatistic;
    /** @type {[typeof __VLS_components.ElStatistic, typeof __VLS_components.elStatistic, ]} */ ;
    // @ts-ignore
    const __VLS_98 = __VLS_asFunctionalComponent(__VLS_97, new __VLS_97({
        value: (__VLS_ctx.result.credentials.created),
        title: ('凭证 新增'),
    }));
    const __VLS_99 = __VLS_98({
        value: (__VLS_ctx.result.credentials.created),
        title: ('凭证 新增'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_98));
    var __VLS_96;
    const __VLS_101 = {}.ElCol;
    /** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
    // @ts-ignore
    const __VLS_102 = __VLS_asFunctionalComponent(__VLS_101, new __VLS_101({
        span: (8),
    }));
    const __VLS_103 = __VLS_102({
        span: (8),
    }, ...__VLS_functionalComponentArgsRest(__VLS_102));
    __VLS_104.slots.default;
    const __VLS_105 = {}.ElStatistic;
    /** @type {[typeof __VLS_components.ElStatistic, typeof __VLS_components.elStatistic, ]} */ ;
    // @ts-ignore
    const __VLS_106 = __VLS_asFunctionalComponent(__VLS_105, new __VLS_105({
        value: (__VLS_ctx.result.resources.created),
        title: ('系统 新增'),
    }));
    const __VLS_107 = __VLS_106({
        value: (__VLS_ctx.result.resources.created),
        title: ('系统 新增'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_106));
    var __VLS_104;
    const __VLS_109 = {}.ElCol;
    /** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
    // @ts-ignore
    const __VLS_110 = __VLS_asFunctionalComponent(__VLS_109, new __VLS_109({
        span: (8),
    }));
    const __VLS_111 = __VLS_110({
        span: (8),
    }, ...__VLS_functionalComponentArgsRest(__VLS_110));
    __VLS_112.slots.default;
    const __VLS_113 = {}.ElStatistic;
    /** @type {[typeof __VLS_components.ElStatistic, typeof __VLS_components.elStatistic, ]} */ ;
    // @ts-ignore
    const __VLS_114 = __VLS_asFunctionalComponent(__VLS_113, new __VLS_113({
        value: (__VLS_ctx.result.pipelines.created),
        title: ('流水线 新增'),
    }));
    const __VLS_115 = __VLS_114({
        value: (__VLS_ctx.result.pipelines.created),
        title: ('流水线 新增'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_114));
    var __VLS_112;
    var __VLS_92;
    const __VLS_117 = {}.ElRow;
    /** @type {[typeof __VLS_components.ElRow, typeof __VLS_components.elRow, typeof __VLS_components.ElRow, typeof __VLS_components.elRow, ]} */ ;
    // @ts-ignore
    const __VLS_118 = __VLS_asFunctionalComponent(__VLS_117, new __VLS_117({
        gutter: (12),
        ...{ class: "mt-2" },
    }));
    const __VLS_119 = __VLS_118({
        gutter: (12),
        ...{ class: "mt-2" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_118));
    __VLS_120.slots.default;
    const __VLS_121 = {}.ElCol;
    /** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
    // @ts-ignore
    const __VLS_122 = __VLS_asFunctionalComponent(__VLS_121, new __VLS_121({
        span: (8),
    }));
    const __VLS_123 = __VLS_122({
        span: (8),
    }, ...__VLS_functionalComponentArgsRest(__VLS_122));
    __VLS_124.slots.default;
    const __VLS_125 = {}.ElStatistic;
    /** @type {[typeof __VLS_components.ElStatistic, typeof __VLS_components.elStatistic, ]} */ ;
    // @ts-ignore
    const __VLS_126 = __VLS_asFunctionalComponent(__VLS_125, new __VLS_125({
        value: (__VLS_ctx.result.credentials.skipped),
        title: ('凭证 跳过'),
    }));
    const __VLS_127 = __VLS_126({
        value: (__VLS_ctx.result.credentials.skipped),
        title: ('凭证 跳过'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_126));
    var __VLS_124;
    const __VLS_129 = {}.ElCol;
    /** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
    // @ts-ignore
    const __VLS_130 = __VLS_asFunctionalComponent(__VLS_129, new __VLS_129({
        span: (8),
    }));
    const __VLS_131 = __VLS_130({
        span: (8),
    }, ...__VLS_functionalComponentArgsRest(__VLS_130));
    __VLS_132.slots.default;
    const __VLS_133 = {}.ElStatistic;
    /** @type {[typeof __VLS_components.ElStatistic, typeof __VLS_components.elStatistic, ]} */ ;
    // @ts-ignore
    const __VLS_134 = __VLS_asFunctionalComponent(__VLS_133, new __VLS_133({
        value: (__VLS_ctx.result.resources.skipped),
        title: ('系统 跳过'),
    }));
    const __VLS_135 = __VLS_134({
        value: (__VLS_ctx.result.resources.skipped),
        title: ('系统 跳过'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_134));
    var __VLS_132;
    const __VLS_137 = {}.ElCol;
    /** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
    // @ts-ignore
    const __VLS_138 = __VLS_asFunctionalComponent(__VLS_137, new __VLS_137({
        span: (8),
    }));
    const __VLS_139 = __VLS_138({
        span: (8),
    }, ...__VLS_functionalComponentArgsRest(__VLS_138));
    __VLS_140.slots.default;
    const __VLS_141 = {}.ElStatistic;
    /** @type {[typeof __VLS_components.ElStatistic, typeof __VLS_components.elStatistic, ]} */ ;
    // @ts-ignore
    const __VLS_142 = __VLS_asFunctionalComponent(__VLS_141, new __VLS_141({
        value: (__VLS_ctx.result.pipelines.skipped),
        title: ('流水线 跳过'),
    }));
    const __VLS_143 = __VLS_142({
        value: (__VLS_ctx.result.pipelines.skipped),
        title: ('流水线 跳过'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_142));
    var __VLS_140;
    var __VLS_120;
    if (__VLS_ctx.hasErrors) {
        const __VLS_145 = {}.ElCollapse;
        /** @type {[typeof __VLS_components.ElCollapse, typeof __VLS_components.elCollapse, typeof __VLS_components.ElCollapse, typeof __VLS_components.elCollapse, ]} */ ;
        // @ts-ignore
        const __VLS_146 = __VLS_asFunctionalComponent(__VLS_145, new __VLS_145({
            ...{ class: "mt-3" },
        }));
        const __VLS_147 = __VLS_146({
            ...{ class: "mt-3" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_146));
        __VLS_148.slots.default;
        const __VLS_149 = {}.ElCollapseItem;
        /** @type {[typeof __VLS_components.ElCollapseItem, typeof __VLS_components.elCollapseItem, typeof __VLS_components.ElCollapseItem, typeof __VLS_components.elCollapseItem, ]} */ ;
        // @ts-ignore
        const __VLS_150 = __VLS_asFunctionalComponent(__VLS_149, new __VLS_149({
            title: "错误明细",
            name: "errors",
        }));
        const __VLS_151 = __VLS_150({
            title: "错误明细",
            name: "errors",
        }, ...__VLS_functionalComponentArgsRest(__VLS_150));
        __VLS_152.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.pre, __VLS_intrinsicElements.pre)({});
        (JSON.stringify(__VLS_ctx.allErrors, null, 2));
        var __VLS_152;
        var __VLS_148;
    }
}
{
    const { footer: __VLS_thisSlot } = __VLS_3.slots;
    const __VLS_153 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_154 = __VLS_asFunctionalComponent(__VLS_153, new __VLS_153({
        ...{ 'onClick': {} },
    }));
    const __VLS_155 = __VLS_154({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_154));
    let __VLS_157;
    let __VLS_158;
    let __VLS_159;
    const __VLS_160 = {
        onClick: (...[$event]) => {
            __VLS_ctx.visible = false;
        }
    };
    __VLS_156.slots.default;
    var __VLS_156;
    const __VLS_161 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_162 = __VLS_asFunctionalComponent(__VLS_161, new __VLS_161({
        ...{ 'onClick': {} },
        loading: (__VLS_ctx.importing),
        type: "primary",
    }));
    const __VLS_163 = __VLS_162({
        ...{ 'onClick': {} },
        loading: (__VLS_ctx.importing),
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_162));
    let __VLS_165;
    let __VLS_166;
    let __VLS_167;
    const __VLS_168 = {
        onClick: (__VLS_ctx.doImport)
    };
    __VLS_164.slots.default;
    (__VLS_ctx.form.dry_run ? '校验' : '导入');
    var __VLS_164;
}
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['result-box']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-3']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-2']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-2']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-3']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            visible: visible,
            form: form,
            jsonText: jsonText,
            result: result,
            importing: importing,
            allErrors: allErrors,
            hasErrors: hasErrors,
            onOpen: onOpen,
            onFileChange: onFileChange,
            formatJson: formatJson,
            doImport: doImport,
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
