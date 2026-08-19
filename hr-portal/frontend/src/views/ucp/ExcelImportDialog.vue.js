/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { Upload, Check } from '@element-plus/icons-vue';
import { ucpApi } from '@/api/ucp';
const props = defineProps();
const emit = defineEmits();
// 步骤：1 上传 → 2 配置映射 → 3 导入
const step = ref(1);
const uploading = ref(false);
const importing = ref(false);
const fileKey = ref('');
const fileName = ref('');
const headers = ref([]);
const previewRows = ref([]);
const totalRows = ref(0);
const sheetNames = ref([]);
const selectedSheet = ref('');
const targetTable = ref('');
const joinKey = ref('');
const mappingRules = ref([]);
const importResult = ref(null);
const dialogVisible = computed({
    get: () => props.visible,
    set: (v) => emit('update:visible', v),
});
function reset() {
    step.value = 1;
    fileKey.value = '';
    fileName.value = '';
    headers.value = [];
    previewRows.value = [];
    totalRows.value = 0;
    sheetNames.value = [];
    selectedSheet.value = '';
    targetTable.value = '';
    joinKey.value = '';
    mappingRules.value = [];
    importResult.value = null;
}
async function handleUpload(file) {
    uploading.value = true;
    try {
        const res = await ucpApi.excelUpload(file);
        fileKey.value = res.file_key;
        fileName.value = res.filename;
        headers.value = res.headers;
        previewRows.value = res.preview_rows;
        totalRows.value = res.total_rows;
        sheetNames.value = res.sheet_names;
        selectedSheet.value = res.sheet_names[0] || '';
        // 默认映射：source === target（同名映射，可编辑）
        mappingRules.value = res.headers.map((h) => ({ source: h, target: h }));
        step.value = 2;
        ElMessage.success(`解析成功：${res.total_rows} 行，${res.headers.length} 列`);
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail?.message || e?.response?.data?.detail || '上传解析失败');
    }
    finally {
        uploading.value = false;
    }
    return false; // 阻止 el-upload 自动上传
}
function addMapping() {
    mappingRules.value.push({ source: '', target: '' });
}
function removeMapping(idx) {
    mappingRules.value.splice(idx, 1);
}
async function doImport() {
    if (!targetTable.value) {
        ElMessage.warning('请填写目标表名');
        return;
    }
    if (!joinKey.value) {
        ElMessage.warning('请填写幂等主键字段');
        return;
    }
    importing.value = true;
    try {
        const res = await ucpApi.excelImport({
            file_key: fileKey.value,
            target_table: targetTable.value,
            join_key: joinKey.value,
            mapping_rules: mappingRules.value.filter((r) => r.source && r.target),
            sheet_name: selectedSheet.value || undefined,
        });
        importResult.value = res;
        step.value = 3;
        if (res.failed_count === 0) {
            ElMessage.success(`导入成功：${res.success_count} 行`);
        }
        else {
            ElMessage.warning(`导入完成：${res.success_count} 成功，${res.failed_count} 失败`);
        }
        emit('success');
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail?.message || e?.response?.data?.detail || '导入失败');
    }
    finally {
        importing.value = false;
    }
}
function close() {
    dialogVisible.value = false;
    setTimeout(reset, 300);
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
const __VLS_0 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onClose': {} },
    modelValue: (__VLS_ctx.dialogVisible),
    title: "Excel 文件导入",
    width: "780px",
}));
const __VLS_2 = __VLS_1({
    ...{ 'onClose': {} },
    modelValue: (__VLS_ctx.dialogVisible),
    title: "Excel 文件导入",
    width: "780px",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onClose: (__VLS_ctx.close)
};
var __VLS_8 = {};
__VLS_3.slots.default;
const __VLS_9 = {}.ElSteps;
/** @type {[typeof __VLS_components.ElSteps, typeof __VLS_components.elSteps, typeof __VLS_components.ElSteps, typeof __VLS_components.elSteps, ]} */ ;
// @ts-ignore
const __VLS_10 = __VLS_asFunctionalComponent(__VLS_9, new __VLS_9({
    active: (__VLS_ctx.step - 1),
    finishStatus: "success",
    alignCenter: true,
    ...{ style: {} },
}));
const __VLS_11 = __VLS_10({
    active: (__VLS_ctx.step - 1),
    finishStatus: "success",
    alignCenter: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_10));
__VLS_12.slots.default;
const __VLS_13 = {}.ElStep;
/** @type {[typeof __VLS_components.ElStep, typeof __VLS_components.elStep, ]} */ ;
// @ts-ignore
const __VLS_14 = __VLS_asFunctionalComponent(__VLS_13, new __VLS_13({
    title: "上传文件",
}));
const __VLS_15 = __VLS_14({
    title: "上传文件",
}, ...__VLS_functionalComponentArgsRest(__VLS_14));
const __VLS_17 = {}.ElStep;
/** @type {[typeof __VLS_components.ElStep, typeof __VLS_components.elStep, ]} */ ;
// @ts-ignore
const __VLS_18 = __VLS_asFunctionalComponent(__VLS_17, new __VLS_17({
    title: "配置映射",
}));
const __VLS_19 = __VLS_18({
    title: "配置映射",
}, ...__VLS_functionalComponentArgsRest(__VLS_18));
const __VLS_21 = {}.ElStep;
/** @type {[typeof __VLS_components.ElStep, typeof __VLS_components.elStep, ]} */ ;
// @ts-ignore
const __VLS_22 = __VLS_asFunctionalComponent(__VLS_21, new __VLS_21({
    title: "导入结果",
}));
const __VLS_23 = __VLS_22({
    title: "导入结果",
}, ...__VLS_functionalComponentArgsRest(__VLS_22));
var __VLS_12;
if (__VLS_ctx.step === 1) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    const __VLS_25 = {}.ElUpload;
    /** @type {[typeof __VLS_components.ElUpload, typeof __VLS_components.elUpload, typeof __VLS_components.ElUpload, typeof __VLS_components.elUpload, ]} */ ;
    // @ts-ignore
    const __VLS_26 = __VLS_asFunctionalComponent(__VLS_25, new __VLS_25({
        autoUpload: (true),
        showFileList: (false),
        httpRequest: ((opts) => __VLS_ctx.handleUpload(opts.file)),
        accept: ".xlsx,.xls",
        drag: true,
    }));
    const __VLS_27 = __VLS_26({
        autoUpload: (true),
        showFileList: (false),
        httpRequest: ((opts) => __VLS_ctx.handleUpload(opts.file)),
        accept: ".xlsx,.xls",
        drag: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_26));
    __VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.uploading) }, null, null);
    __VLS_28.slots.default;
    const __VLS_29 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_30 = __VLS_asFunctionalComponent(__VLS_29, new __VLS_29({
        ...{ class: "el-icon--upload" },
    }));
    const __VLS_31 = __VLS_30({
        ...{ class: "el-icon--upload" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_30));
    __VLS_32.slots.default;
    const __VLS_33 = {}.Upload;
    /** @type {[typeof __VLS_components.Upload, ]} */ ;
    // @ts-ignore
    const __VLS_34 = __VLS_asFunctionalComponent(__VLS_33, new __VLS_33({}));
    const __VLS_35 = __VLS_34({}, ...__VLS_functionalComponentArgsRest(__VLS_34));
    var __VLS_32;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "el-upload__text" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.em, __VLS_intrinsicElements.em)({});
    {
        const { tip: __VLS_thisSlot } = __VLS_28.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "el-upload__tip" },
        });
    }
    var __VLS_28;
}
if (__VLS_ctx.step === 2) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    const __VLS_37 = {}.ElDescriptions;
    /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
    // @ts-ignore
    const __VLS_38 = __VLS_asFunctionalComponent(__VLS_37, new __VLS_37({
        column: (2),
        border: true,
        ...{ style: {} },
    }));
    const __VLS_39 = __VLS_38({
        column: (2),
        border: true,
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_38));
    __VLS_40.slots.default;
    const __VLS_41 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_42 = __VLS_asFunctionalComponent(__VLS_41, new __VLS_41({
        label: "文件名",
    }));
    const __VLS_43 = __VLS_42({
        label: "文件名",
    }, ...__VLS_functionalComponentArgsRest(__VLS_42));
    __VLS_44.slots.default;
    (__VLS_ctx.fileName);
    var __VLS_44;
    const __VLS_45 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_46 = __VLS_asFunctionalComponent(__VLS_45, new __VLS_45({
        label: "总行数",
    }));
    const __VLS_47 = __VLS_46({
        label: "总行数",
    }, ...__VLS_functionalComponentArgsRest(__VLS_46));
    __VLS_48.slots.default;
    (__VLS_ctx.totalRows);
    var __VLS_48;
    const __VLS_49 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_50 = __VLS_asFunctionalComponent(__VLS_49, new __VLS_49({
        label: "工作表",
    }));
    const __VLS_51 = __VLS_50({
        label: "工作表",
    }, ...__VLS_functionalComponentArgsRest(__VLS_50));
    __VLS_52.slots.default;
    if (__VLS_ctx.sheetNames.length) {
        const __VLS_53 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_54 = __VLS_asFunctionalComponent(__VLS_53, new __VLS_53({
            modelValue: (__VLS_ctx.selectedSheet),
            size: "small",
            ...{ style: {} },
        }));
        const __VLS_55 = __VLS_54({
            modelValue: (__VLS_ctx.selectedSheet),
            size: "small",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_54));
        __VLS_56.slots.default;
        for (const [s] of __VLS_getVForSourceType((__VLS_ctx.sheetNames))) {
            const __VLS_57 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_58 = __VLS_asFunctionalComponent(__VLS_57, new __VLS_57({
                key: (s),
                label: (s),
                value: (s),
            }));
            const __VLS_59 = __VLS_58({
                key: (s),
                label: (s),
                value: (s),
            }, ...__VLS_functionalComponentArgsRest(__VLS_58));
        }
        var __VLS_56;
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
    var __VLS_52;
    const __VLS_61 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_62 = __VLS_asFunctionalComponent(__VLS_61, new __VLS_61({
        label: "列数",
    }));
    const __VLS_63 = __VLS_62({
        label: "列数",
    }, ...__VLS_functionalComponentArgsRest(__VLS_62));
    __VLS_64.slots.default;
    (__VLS_ctx.headers.length);
    var __VLS_64;
    var __VLS_40;
    const __VLS_65 = {}.ElForm;
    /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
    // @ts-ignore
    const __VLS_66 = __VLS_asFunctionalComponent(__VLS_65, new __VLS_65({
        labelWidth: "110px",
        ...{ style: {} },
    }));
    const __VLS_67 = __VLS_66({
        labelWidth: "110px",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_66));
    __VLS_68.slots.default;
    const __VLS_69 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_70 = __VLS_asFunctionalComponent(__VLS_69, new __VLS_69({
        label: "目标表名",
        required: true,
    }));
    const __VLS_71 = __VLS_70({
        label: "目标表名",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_70));
    __VLS_72.slots.default;
    const __VLS_73 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_74 = __VLS_asFunctionalComponent(__VLS_73, new __VLS_73({
        modelValue: (__VLS_ctx.targetTable),
        placeholder: "如 hr_pending_employee_full",
    }));
    const __VLS_75 = __VLS_74({
        modelValue: (__VLS_ctx.targetTable),
        placeholder: "如 hr_pending_employee_full",
    }, ...__VLS_functionalComponentArgsRest(__VLS_74));
    var __VLS_72;
    const __VLS_77 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_78 = __VLS_asFunctionalComponent(__VLS_77, new __VLS_77({
        label: "幂等主键",
        required: true,
    }));
    const __VLS_79 = __VLS_78({
        label: "幂等主键",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_78));
    __VLS_80.slots.default;
    const __VLS_81 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_82 = __VLS_asFunctionalComponent(__VLS_81, new __VLS_81({
        modelValue: (__VLS_ctx.joinKey),
        placeholder: "如 application_id / employee_id",
    }));
    const __VLS_83 = __VLS_82({
        modelValue: (__VLS_ctx.joinKey),
        placeholder: "如 application_id / employee_id",
    }, ...__VLS_functionalComponentArgsRest(__VLS_82));
    var __VLS_80;
    var __VLS_68;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: {} },
    });
    const __VLS_85 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_86 = __VLS_asFunctionalComponent(__VLS_85, new __VLS_85({
        ...{ 'onClick': {} },
        size: "small",
    }));
    const __VLS_87 = __VLS_86({
        ...{ 'onClick': {} },
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_86));
    let __VLS_89;
    let __VLS_90;
    let __VLS_91;
    const __VLS_92 = {
        onClick: (__VLS_ctx.addMapping)
    };
    __VLS_88.slots.default;
    var __VLS_88;
    const __VLS_93 = {}.ElTable;
    /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
    // @ts-ignore
    const __VLS_94 = __VLS_asFunctionalComponent(__VLS_93, new __VLS_93({
        data: (__VLS_ctx.mappingRules),
        stripe: true,
        size: "small",
        maxHeight: "180",
        ...{ style: {} },
    }));
    const __VLS_95 = __VLS_94({
        data: (__VLS_ctx.mappingRules),
        stripe: true,
        size: "small",
        maxHeight: "180",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_94));
    __VLS_96.slots.default;
    const __VLS_97 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_98 = __VLS_asFunctionalComponent(__VLS_97, new __VLS_97({
        label: "Excel 列名",
        minWidth: "180",
    }));
    const __VLS_99 = __VLS_98({
        label: "Excel 列名",
        minWidth: "180",
    }, ...__VLS_functionalComponentArgsRest(__VLS_98));
    __VLS_100.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_100.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_101 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_102 = __VLS_asFunctionalComponent(__VLS_101, new __VLS_101({
            modelValue: (row.source),
            size: "small",
            filterable: true,
        }));
        const __VLS_103 = __VLS_102({
            modelValue: (row.source),
            size: "small",
            filterable: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_102));
        __VLS_104.slots.default;
        for (const [h] of __VLS_getVForSourceType((__VLS_ctx.headers))) {
            const __VLS_105 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_106 = __VLS_asFunctionalComponent(__VLS_105, new __VLS_105({
                key: (h),
                label: (h),
                value: (h),
            }));
            const __VLS_107 = __VLS_106({
                key: (h),
                label: (h),
                value: (h),
            }, ...__VLS_functionalComponentArgsRest(__VLS_106));
        }
        var __VLS_104;
    }
    var __VLS_100;
    const __VLS_109 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_110 = __VLS_asFunctionalComponent(__VLS_109, new __VLS_109({
        label: "→",
        width: "40",
        align: "center",
    }));
    const __VLS_111 = __VLS_110({
        label: "→",
        width: "40",
        align: "center",
    }, ...__VLS_functionalComponentArgsRest(__VLS_110));
    __VLS_112.slots.default;
    var __VLS_112;
    const __VLS_113 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_114 = __VLS_asFunctionalComponent(__VLS_113, new __VLS_113({
        label: "目标字段",
        minWidth: "180",
    }));
    const __VLS_115 = __VLS_114({
        label: "目标字段",
        minWidth: "180",
    }, ...__VLS_functionalComponentArgsRest(__VLS_114));
    __VLS_116.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_116.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_117 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_118 = __VLS_asFunctionalComponent(__VLS_117, new __VLS_117({
            modelValue: (row.target),
            size: "small",
            placeholder: "目标字段名",
        }));
        const __VLS_119 = __VLS_118({
            modelValue: (row.target),
            size: "small",
            placeholder: "目标字段名",
        }, ...__VLS_functionalComponentArgsRest(__VLS_118));
    }
    var __VLS_116;
    const __VLS_121 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_122 = __VLS_asFunctionalComponent(__VLS_121, new __VLS_121({
        label: "操作",
        width: "70",
    }));
    const __VLS_123 = __VLS_122({
        label: "操作",
        width: "70",
    }, ...__VLS_functionalComponentArgsRest(__VLS_122));
    __VLS_124.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_124.slots;
        const [{ $index }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_125 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_126 = __VLS_asFunctionalComponent(__VLS_125, new __VLS_125({
            ...{ 'onClick': {} },
            size: "small",
            link: true,
            type: "danger",
        }));
        const __VLS_127 = __VLS_126({
            ...{ 'onClick': {} },
            size: "small",
            link: true,
            type: "danger",
        }, ...__VLS_functionalComponentArgsRest(__VLS_126));
        let __VLS_129;
        let __VLS_130;
        let __VLS_131;
        const __VLS_132 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.step === 2))
                    return;
                __VLS_ctx.removeMapping($index);
            }
        };
        __VLS_128.slots.default;
        var __VLS_128;
    }
    var __VLS_124;
    var __VLS_96;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_133 = {}.ElTable;
    /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
    // @ts-ignore
    const __VLS_134 = __VLS_asFunctionalComponent(__VLS_133, new __VLS_133({
        data: (__VLS_ctx.previewRows),
        stripe: true,
        size: "small",
        maxHeight: "200",
        ...{ style: {} },
    }));
    const __VLS_135 = __VLS_134({
        data: (__VLS_ctx.previewRows),
        stripe: true,
        size: "small",
        maxHeight: "200",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_134));
    __VLS_136.slots.default;
    for (const [h] of __VLS_getVForSourceType((__VLS_ctx.headers.slice(0, 8)))) {
        const __VLS_137 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_138 = __VLS_asFunctionalComponent(__VLS_137, new __VLS_137({
            key: (h),
            label: (h),
            minWidth: "120",
            showOverflowTooltip: true,
        }));
        const __VLS_139 = __VLS_138({
            key: (h),
            label: (h),
            minWidth: "120",
            showOverflowTooltip: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_138));
        __VLS_140.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_140.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (row[h] ?? '');
        }
        var __VLS_140;
    }
    var __VLS_136;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_141 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_142 = __VLS_asFunctionalComponent(__VLS_141, new __VLS_141({
        ...{ 'onClick': {} },
    }));
    const __VLS_143 = __VLS_142({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_142));
    let __VLS_145;
    let __VLS_146;
    let __VLS_147;
    const __VLS_148 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.step === 2))
                return;
            __VLS_ctx.step = 1;
        }
    };
    __VLS_144.slots.default;
    var __VLS_144;
    const __VLS_149 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_150 = __VLS_asFunctionalComponent(__VLS_149, new __VLS_149({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.importing),
    }));
    const __VLS_151 = __VLS_150({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.importing),
    }, ...__VLS_functionalComponentArgsRest(__VLS_150));
    let __VLS_153;
    let __VLS_154;
    let __VLS_155;
    const __VLS_156 = {
        onClick: (__VLS_ctx.doImport)
    };
    __VLS_152.slots.default;
    const __VLS_157 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_158 = __VLS_asFunctionalComponent(__VLS_157, new __VLS_157({
        ...{ style: {} },
    }));
    const __VLS_159 = __VLS_158({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_158));
    __VLS_160.slots.default;
    const __VLS_161 = {}.Check;
    /** @type {[typeof __VLS_components.Check, ]} */ ;
    // @ts-ignore
    const __VLS_162 = __VLS_asFunctionalComponent(__VLS_161, new __VLS_161({}));
    const __VLS_163 = __VLS_162({}, ...__VLS_functionalComponentArgsRest(__VLS_162));
    var __VLS_160;
    var __VLS_152;
}
if (__VLS_ctx.step === 3 && __VLS_ctx.importResult) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    const __VLS_165 = {}.ElResult;
    /** @type {[typeof __VLS_components.ElResult, typeof __VLS_components.elResult, ]} */ ;
    // @ts-ignore
    const __VLS_166 = __VLS_asFunctionalComponent(__VLS_165, new __VLS_165({
        icon: (__VLS_ctx.importResult.failed_count === 0 ? 'success' : 'warning'),
        title: (__VLS_ctx.importResult.status === 'SUCCESS' ? '导入成功' : '导入完成（部分失败）'),
        subTitle: (`目标表 ${__VLS_ctx.importResult.target_table}：成功 ${__VLS_ctx.importResult.success_count} / ${__VLS_ctx.importResult.total_rows} 行`),
    }));
    const __VLS_167 = __VLS_166({
        icon: (__VLS_ctx.importResult.failed_count === 0 ? 'success' : 'warning'),
        title: (__VLS_ctx.importResult.status === 'SUCCESS' ? '导入成功' : '导入完成（部分失败）'),
        subTitle: (`目标表 ${__VLS_ctx.importResult.target_table}：成功 ${__VLS_ctx.importResult.success_count} / ${__VLS_ctx.importResult.total_rows} 行`),
    }, ...__VLS_functionalComponentArgsRest(__VLS_166));
    if (__VLS_ctx.importResult.failed_details.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        (__VLS_ctx.importResult.failed_details.length);
        const __VLS_169 = {}.ElTable;
        /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
        // @ts-ignore
        const __VLS_170 = __VLS_asFunctionalComponent(__VLS_169, new __VLS_169({
            data: (__VLS_ctx.importResult.failed_details),
            stripe: true,
            size: "small",
            maxHeight: "200",
        }));
        const __VLS_171 = __VLS_170({
            data: (__VLS_ctx.importResult.failed_details),
            stripe: true,
            size: "small",
            maxHeight: "200",
        }, ...__VLS_functionalComponentArgsRest(__VLS_170));
        __VLS_172.slots.default;
        const __VLS_173 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_174 = __VLS_asFunctionalComponent(__VLS_173, new __VLS_173({
            label: "行号",
            width: "80",
            prop: "row_index",
        }));
        const __VLS_175 = __VLS_174({
            label: "行号",
            width: "80",
            prop: "row_index",
        }, ...__VLS_functionalComponentArgsRest(__VLS_174));
        const __VLS_177 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_178 = __VLS_asFunctionalComponent(__VLS_177, new __VLS_177({
            label: "原因",
            prop: "reason",
            showOverflowTooltip: true,
        }));
        const __VLS_179 = __VLS_178({
            label: "原因",
            prop: "reason",
            showOverflowTooltip: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_178));
        var __VLS_172;
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_181 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_182 = __VLS_asFunctionalComponent(__VLS_181, new __VLS_181({
        ...{ 'onClick': {} },
        type: "primary",
    }));
    const __VLS_183 = __VLS_182({
        ...{ 'onClick': {} },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_182));
    let __VLS_185;
    let __VLS_186;
    let __VLS_187;
    const __VLS_188 = {
        onClick: (__VLS_ctx.close)
    };
    __VLS_184.slots.default;
    var __VLS_184;
}
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['el-icon--upload']} */ ;
/** @type {__VLS_StyleScopedClasses['el-upload__text']} */ ;
/** @type {__VLS_StyleScopedClasses['el-upload__tip']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Upload: Upload,
            Check: Check,
            step: step,
            uploading: uploading,
            importing: importing,
            fileName: fileName,
            headers: headers,
            previewRows: previewRows,
            totalRows: totalRows,
            sheetNames: sheetNames,
            selectedSheet: selectedSheet,
            targetTable: targetTable,
            joinKey: joinKey,
            mappingRules: mappingRules,
            importResult: importResult,
            dialogVisible: dialogVisible,
            handleUpload: handleUpload,
            addMapping: addMapping,
            removeMapping: removeMapping,
            doImport: doImport,
            close: close,
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
