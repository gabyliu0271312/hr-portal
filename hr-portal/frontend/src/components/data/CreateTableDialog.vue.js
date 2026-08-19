/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import SmartCodeInput from '@/components/common/SmartCodeInput.vue';
import { adminTablesApi } from '@/api/admin_tables';
import { pushTargetsApi } from '@/api/push_targets';
import { SCOPE_STRATEGY_OPTIONS } from '@/constants/scopeStrategy';
const props = withDefaults(defineProps(), {
    existingTableNames: () => [],
});
const emit = defineEmits();
const visible = ref(false);
const saving = ref(false);
const pushDialogRef = ref(null);
const DATASOURCE_TYPES = [
    { value: 'upload', label: '手动上传' },
    { value: 'beisen_report', label: '北森报表' },
    { value: 'beisen_api', label: '北森接口' },
    { value: 'feishu_sheet', label: '飞书在线表格' },
    { value: 'http_generic', label: '通用 HTTP' },
];
const ICON_OPTIONS = [
    'Grid', 'List', 'Calendar', 'Money', 'Histogram',
    'OfficeBuilding', 'Collection', 'TrendCharts', 'DataLine', 'Document',
];
const form = reactive({
    table_name: '',
    table_label: '',
    description: '',
    is_period: false,
    period_col: 'month',
    period_source: 'field',
    is_result_table: false,
    icon: 'Grid',
    display_order: 999,
    scope_strategy: 'cross_filter',
    create_datasource: false,
    datasource_source_type: 'upload',
    create_push_target: false,
});
// 推送目标内嵌表单状态（与 PushTargetDialog 共享同一套字段结构）
const pushForm = reactive({
    name: '',
    push_type: 'external_db',
    schedule: '手动触发',
    period_ym: '',
    dialect: 'mysql',
    host: '', port: '3306', database: '', db_user: '', password: '', target_table: '',
    url: '', method: 'POST', bearer_token: '', batch_size: '500',
    access_token: '',
    field_mappings: [],
    is_active: true,
});
function open() {
    Object.assign(form, {
        table_name: '', table_label: '', description: '',
        is_period: false, period_col: 'month', period_source: 'field',
        is_result_table: false, icon: 'Grid', display_order: 999, scope_strategy: 'cross_filter',
        create_datasource: false, datasource_source_type: 'upload',
        create_push_target: false,
    });
    Object.assign(pushForm, {
        name: '', push_type: 'external_db', schedule: '手动触发', period_ym: '',
        dialect: 'mysql', host: '', port: '3306', database: '', db_user: '', password: '', target_table: '',
        url: '', method: 'POST', bearer_token: '', batch_size: '500', access_token: '',
        field_mappings: [], is_active: true,
    });
    visible.value = true;
}
function buildPushPayload(tableName) {
    const base = {
        source_table: tableName,
        name: pushForm.name || `${form.table_label}推送`,
        push_type: pushForm.push_type,
        settings: { period_ym: pushForm.period_ym },
        secrets: {},
        field_mappings: pushForm.field_mappings.filter((m) => m.source && m.target),
        is_active: pushForm.is_active,
        schedule: pushForm.schedule,
    };
    if (pushForm.push_type === 'external_db') {
        base.settings = {
            ...base.settings,
            dialect: pushForm.dialect, host: pushForm.host, port: Number(pushForm.port),
            database: pushForm.database, user: pushForm.db_user, target_table: pushForm.target_table,
        };
        if (pushForm.password)
            base.secrets = { password: pushForm.password };
    }
    else if (pushForm.push_type === 'http_push') {
        base.settings = { ...base.settings, url: pushForm.url, method: pushForm.method, batch_size: Number(pushForm.batch_size) };
        if (pushForm.bearer_token)
            base.secrets = { bearer_token: pushForm.bearer_token };
    }
    else if (pushForm.push_type === 'api_expose') {
        if (pushForm.access_token)
            base.secrets = { access_token: pushForm.access_token };
    }
    return base;
}
async function confirm() {
    if (!form.table_label.trim()) {
        ElMessage.warning('请填写中文名');
        return;
    }
    if (!form.table_name.trim()) {
        ElMessage.warning('表名正在生成，请稍后再创建');
        return;
    }
    saving.value = true;
    try {
        const result = await adminTablesApi.create({
            table_name: form.table_name.trim(),
            table_label: form.table_label.trim(),
            description: form.description.trim() || null,
            is_period: form.is_period,
            period_col: form.period_col,
            period_source: form.period_source,
            is_result_table: form.is_result_table,
            icon: form.icon,
            display_order: form.display_order,
            scope_strategy: form.scope_strategy,
            create_datasource: form.create_datasource,
            datasource_source_type: form.datasource_source_type,
        });
        // 同时创建推送目标
        if (form.create_push_target && form.create_datasource) {
            try {
                await pushTargetsApi.create(buildPushPayload(result.table_name));
            }
            catch {
                ElMessage.warning('视图已创建，但推送目标创建失败，请到接口配置页补充配置');
            }
        }
        ElMessage.success(`视图「${result.table_label}」创建成功`);
        visible.value = false;
        emit('done', result);
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '创建失败');
    }
    finally {
        saving.value = false;
    }
}
const __VLS_exposed = { open };
defineExpose(__VLS_exposed);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    existingTableNames: () => [],
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
const __VLS_0 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    modelValue: (__VLS_ctx.visible),
    title: "新建视图",
    width: "560px",
    closeOnClickModal: (false),
}));
const __VLS_2 = __VLS_1({
    modelValue: (__VLS_ctx.visible),
    title: "新建视图",
    width: "560px",
    closeOnClickModal: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
var __VLS_4 = {};
__VLS_3.slots.default;
const __VLS_5 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_6 = __VLS_asFunctionalComponent(__VLS_5, new __VLS_5({
    model: (__VLS_ctx.form),
    labelPosition: "top",
}));
const __VLS_7 = __VLS_6({
    model: (__VLS_ctx.form),
    labelPosition: "top",
}, ...__VLS_functionalComponentArgsRest(__VLS_6));
__VLS_8.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "section-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
const __VLS_9 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_10 = __VLS_asFunctionalComponent(__VLS_9, new __VLS_9({
    label: "中文名",
    required: true,
}));
const __VLS_11 = __VLS_10({
    label: "中文名",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_10));
__VLS_12.slots.default;
const __VLS_13 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_14 = __VLS_asFunctionalComponent(__VLS_13, new __VLS_13({
    modelValue: (__VLS_ctx.form.table_label),
    placeholder: "如 自定义数据表",
}));
const __VLS_15 = __VLS_14({
    modelValue: (__VLS_ctx.form.table_label),
    placeholder: "如 自定义数据表",
}, ...__VLS_functionalComponentArgsRest(__VLS_14));
var __VLS_12;
const __VLS_17 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_18 = __VLS_asFunctionalComponent(__VLS_17, new __VLS_17({
    label: "表名（英文编码）",
    required: true,
}));
const __VLS_19 = __VLS_18({
    label: "表名（英文编码）",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_18));
__VLS_20.slots.default;
/** @type {[typeof SmartCodeInput, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(SmartCodeInput, new SmartCodeInput({
    modelValue: (__VLS_ctx.form.table_name),
    label: (__VLS_ctx.form.table_label),
    scope: "table",
    prefix: "ods_",
    context: "数据视图表名",
    existingCodes: (props.existingTableNames),
    editable: true,
}));
const __VLS_22 = __VLS_21({
    modelValue: (__VLS_ctx.form.table_name),
    label: (__VLS_ctx.form.table_label),
    scope: "table",
    prefix: "ods_",
    context: "数据视图表名",
    existingCodes: (props.existingTableNames),
    editable: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
var __VLS_20;
const __VLS_24 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    label: "描述",
}));
const __VLS_26 = __VLS_25({
    label: "描述",
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
__VLS_27.slots.default;
const __VLS_28 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    rows: (2),
    placeholder: "可选",
}));
const __VLS_30 = __VLS_29({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    rows: (2),
    placeholder: "可选",
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
var __VLS_27;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
const __VLS_32 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    label: "图标",
}));
const __VLS_34 = __VLS_33({
    label: "图标",
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
__VLS_35.slots.default;
const __VLS_36 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
    modelValue: (__VLS_ctx.form.icon),
    ...{ style: {} },
}));
const __VLS_38 = __VLS_37({
    modelValue: (__VLS_ctx.form.icon),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
__VLS_39.slots.default;
for (const [ic] of __VLS_getVForSourceType((__VLS_ctx.ICON_OPTIONS))) {
    const __VLS_40 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
        key: (ic),
        label: (ic),
        value: (ic),
    }));
    const __VLS_42 = __VLS_41({
        key: (ic),
        label: (ic),
        value: (ic),
    }, ...__VLS_functionalComponentArgsRest(__VLS_41));
}
var __VLS_39;
var __VLS_35;
const __VLS_44 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
    label: "显示顺序",
}));
const __VLS_46 = __VLS_45({
    label: "显示顺序",
}, ...__VLS_functionalComponentArgsRest(__VLS_45));
__VLS_47.slots.default;
const __VLS_48 = {}.ElInputNumber;
/** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
    modelValue: (__VLS_ctx.form.display_order),
    min: (1),
    max: (9999),
    ...{ style: {} },
}));
const __VLS_50 = __VLS_49({
    modelValue: (__VLS_ctx.form.display_order),
    min: (1),
    max: (9999),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_49));
var __VLS_47;
const __VLS_52 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
    label: "数据范围策略",
}));
const __VLS_54 = __VLS_53({
    label: "数据范围策略",
}, ...__VLS_functionalComponentArgsRest(__VLS_53));
__VLS_55.slots.default;
const __VLS_56 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
    modelValue: (__VLS_ctx.form.scope_strategy),
    ...{ style: {} },
}));
const __VLS_58 = __VLS_57({
    modelValue: (__VLS_ctx.form.scope_strategy),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_57));
__VLS_59.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.SCOPE_STRATEGY_OPTIONS))) {
    const __VLS_60 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
        key: (item.value),
        label: (item.label),
        value: (item.value),
    }));
    const __VLS_62 = __VLS_61({
        key: (item.value),
        label: (item.label),
        value: (item.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_61));
}
var __VLS_59;
var __VLS_55;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "section-title" },
});
const __VLS_64 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
    label: "是否月度表",
}));
const __VLS_66 = __VLS_65({
    label: "是否月度表",
}, ...__VLS_functionalComponentArgsRest(__VLS_65));
__VLS_67.slots.default;
const __VLS_68 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
    modelValue: (__VLS_ctx.form.is_period),
    activeText: "是（按月存储，历史月份保留）",
    inactiveText: "否（全量替换）",
}));
const __VLS_70 = __VLS_69({
    modelValue: (__VLS_ctx.form.is_period),
    activeText: "是（按月存储，历史月份保留）",
    inactiveText: "否（全量替换）",
}, ...__VLS_functionalComponentArgsRest(__VLS_69));
var __VLS_67;
if (__VLS_ctx.form.is_period) {
    if (__VLS_ctx.form.period_source === 'field') {
        const __VLS_72 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
            label: "期间字段",
        }));
        const __VLS_74 = __VLS_73({
            label: "期间字段",
        }, ...__VLS_functionalComponentArgsRest(__VLS_73));
        __VLS_75.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
        var __VLS_75;
    }
    else {
        const __VLS_76 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
            label: "期间字段编码",
        }));
        const __VLS_78 = __VLS_77({
            label: "期间字段编码",
        }, ...__VLS_functionalComponentArgsRest(__VLS_77));
        __VLS_79.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.b, __VLS_intrinsicElements.b)({});
        var __VLS_79;
    }
    const __VLS_80 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
        label: "月份来源",
    }));
    const __VLS_82 = __VLS_81({
        label: "月份来源",
    }, ...__VLS_functionalComponentArgsRest(__VLS_81));
    __VLS_83.slots.default;
    const __VLS_84 = {}.ElRadioGroup;
    /** @type {[typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, ]} */ ;
    // @ts-ignore
    const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
        modelValue: (__VLS_ctx.form.period_source),
    }));
    const __VLS_86 = __VLS_85({
        modelValue: (__VLS_ctx.form.period_source),
    }, ...__VLS_functionalComponentArgsRest(__VLS_85));
    __VLS_87.slots.default;
    const __VLS_88 = {}.ElRadio;
    /** @type {[typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, ]} */ ;
    // @ts-ignore
    const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
        value: "field",
    }));
    const __VLS_90 = __VLS_89({
        value: "field",
    }, ...__VLS_functionalComponentArgsRest(__VLS_89));
    __VLS_91.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: {} },
    });
    var __VLS_91;
    const __VLS_92 = {}.ElRadio;
    /** @type {[typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, ]} */ ;
    // @ts-ignore
    const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
        value: "inject",
    }));
    const __VLS_94 = __VLS_93({
        value: "inject",
    }, ...__VLS_functionalComponentArgsRest(__VLS_93));
    __VLS_95.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: {} },
    });
    var __VLS_95;
    var __VLS_87;
    var __VLS_83;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "section-title" },
});
const __VLS_96 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
    label: "可作为分摊结果表",
}));
const __VLS_98 = __VLS_97({
    label: "可作为分摊结果表",
}, ...__VLS_functionalComponentArgsRest(__VLS_97));
__VLS_99.slots.default;
const __VLS_100 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
    modelValue: (__VLS_ctx.form.is_result_table),
    activeText: "是（可在成本分摊方案中选为写入目标）",
}));
const __VLS_102 = __VLS_101({
    modelValue: (__VLS_ctx.form.is_result_table),
    activeText: "是（可在成本分摊方案中选为写入目标）",
}, ...__VLS_functionalComponentArgsRest(__VLS_101));
var __VLS_99;
const __VLS_104 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
    label: "创建接口配置",
}));
const __VLS_106 = __VLS_105({
    label: "创建接口配置",
}, ...__VLS_functionalComponentArgsRest(__VLS_105));
__VLS_107.slots.default;
const __VLS_108 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
    modelValue: (__VLS_ctx.form.create_datasource),
    activeText: "是（自动创建数据源接口配置）",
}));
const __VLS_110 = __VLS_109({
    modelValue: (__VLS_ctx.form.create_datasource),
    activeText: "是（自动创建数据源接口配置）",
}, ...__VLS_functionalComponentArgsRest(__VLS_109));
var __VLS_107;
if (__VLS_ctx.form.create_datasource) {
    const __VLS_112 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
        label: "接口类型",
    }));
    const __VLS_114 = __VLS_113({
        label: "接口类型",
    }, ...__VLS_functionalComponentArgsRest(__VLS_113));
    __VLS_115.slots.default;
    const __VLS_116 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
        modelValue: (__VLS_ctx.form.datasource_source_type),
        ...{ style: {} },
    }));
    const __VLS_118 = __VLS_117({
        modelValue: (__VLS_ctx.form.datasource_source_type),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_117));
    __VLS_119.slots.default;
    for (const [t] of __VLS_getVForSourceType((__VLS_ctx.DATASOURCE_TYPES))) {
        const __VLS_120 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
            key: (t.value),
            label: (t.label),
            value: (t.value),
        }));
        const __VLS_122 = __VLS_121({
            key: (t.value),
            label: (t.label),
            value: (t.value),
        }, ...__VLS_functionalComponentArgsRest(__VLS_121));
    }
    var __VLS_119;
    var __VLS_115;
}
if (__VLS_ctx.form.create_datasource) {
    const __VLS_124 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
        label: "同时创建推送目标",
    }));
    const __VLS_126 = __VLS_125({
        label: "同时创建推送目标",
    }, ...__VLS_functionalComponentArgsRest(__VLS_125));
    __VLS_127.slots.default;
    const __VLS_128 = {}.ElSwitch;
    /** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
    // @ts-ignore
    const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
        modelValue: (__VLS_ctx.form.create_push_target),
        activeText: "是（配置对外推送）",
    }));
    const __VLS_130 = __VLS_129({
        modelValue: (__VLS_ctx.form.create_push_target),
        activeText: "是（配置对外推送）",
    }, ...__VLS_functionalComponentArgsRest(__VLS_129));
    var __VLS_127;
    if (__VLS_ctx.form.create_push_target) {
        const __VLS_132 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
            label: "推送方式",
            required: true,
        }));
        const __VLS_134 = __VLS_133({
            label: "推送方式",
            required: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_133));
        __VLS_135.slots.default;
        const __VLS_136 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
            modelValue: (__VLS_ctx.pushForm.push_type),
            ...{ style: {} },
        }));
        const __VLS_138 = __VLS_137({
            modelValue: (__VLS_ctx.pushForm.push_type),
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_137));
        __VLS_139.slots.default;
        const __VLS_140 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
            value: "external_db",
            label: "写入外部数据库（MySQL/PostgreSQL）",
        }));
        const __VLS_142 = __VLS_141({
            value: "external_db",
            label: "写入外部数据库（MySQL/PostgreSQL）",
        }, ...__VLS_functionalComponentArgsRest(__VLS_141));
        const __VLS_144 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
            value: "http_push",
            label: "POST JSON 到接口",
        }));
        const __VLS_146 = __VLS_145({
            value: "http_push",
            label: "POST JSON 到接口",
        }, ...__VLS_functionalComponentArgsRest(__VLS_145));
        const __VLS_148 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
            value: "api_expose",
            label: "暴露只读 API（对方主动拉取）",
        }));
        const __VLS_150 = __VLS_149({
            value: "api_expose",
            label: "暴露只读 API（对方主动拉取）",
        }, ...__VLS_functionalComponentArgsRest(__VLS_149));
        const __VLS_152 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
            value: "db_realtime",
            label: "实时只读数据库访问（对方直连 PostgreSQL）",
        }));
        const __VLS_154 = __VLS_153({
            value: "db_realtime",
            label: "实时只读数据库访问（对方直连 PostgreSQL）",
        }, ...__VLS_functionalComponentArgsRest(__VLS_153));
        const __VLS_156 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_157 = __VLS_asFunctionalComponent(__VLS_156, new __VLS_156({
            value: "db_snapshot",
            label: "同步快照数据库访问（支持定时刷新）",
        }));
        const __VLS_158 = __VLS_157({
            value: "db_snapshot",
            label: "同步快照数据库访问（支持定时刷新）",
        }, ...__VLS_functionalComponentArgsRest(__VLS_157));
        var __VLS_139;
        var __VLS_135;
        if (__VLS_ctx.pushForm.push_type === 'external_db') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ style: {} },
            });
            const __VLS_160 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
                label: "目标表名",
                required: true,
            }));
            const __VLS_162 = __VLS_161({
                label: "目标表名",
                required: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_161));
            __VLS_163.slots.default;
            const __VLS_164 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({
                modelValue: (__VLS_ctx.pushForm.target_table),
                placeholder: "如 beisen_salary_report",
            }));
            const __VLS_166 = __VLS_165({
                modelValue: (__VLS_ctx.pushForm.target_table),
                placeholder: "如 beisen_salary_report",
            }, ...__VLS_functionalComponentArgsRest(__VLS_165));
            var __VLS_163;
            const __VLS_168 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({
                label: "数据库类型",
            }));
            const __VLS_170 = __VLS_169({
                label: "数据库类型",
            }, ...__VLS_functionalComponentArgsRest(__VLS_169));
            __VLS_171.slots.default;
            const __VLS_172 = {}.ElSelect;
            /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
            // @ts-ignore
            const __VLS_173 = __VLS_asFunctionalComponent(__VLS_172, new __VLS_172({
                modelValue: (__VLS_ctx.pushForm.dialect),
                ...{ style: {} },
            }));
            const __VLS_174 = __VLS_173({
                modelValue: (__VLS_ctx.pushForm.dialect),
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_173));
            __VLS_175.slots.default;
            const __VLS_176 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({
                value: "mysql",
                label: "MySQL",
            }));
            const __VLS_178 = __VLS_177({
                value: "mysql",
                label: "MySQL",
            }, ...__VLS_functionalComponentArgsRest(__VLS_177));
            const __VLS_180 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_181 = __VLS_asFunctionalComponent(__VLS_180, new __VLS_180({
                value: "postgresql",
                label: "PostgreSQL",
            }));
            const __VLS_182 = __VLS_181({
                value: "postgresql",
                label: "PostgreSQL",
            }, ...__VLS_functionalComponentArgsRest(__VLS_181));
            var __VLS_175;
            var __VLS_171;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ style: {} },
            });
            const __VLS_184 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_185 = __VLS_asFunctionalComponent(__VLS_184, new __VLS_184({
                label: "Host",
                required: true,
            }));
            const __VLS_186 = __VLS_185({
                label: "Host",
                required: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_185));
            __VLS_187.slots.default;
            const __VLS_188 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_189 = __VLS_asFunctionalComponent(__VLS_188, new __VLS_188({
                modelValue: (__VLS_ctx.pushForm.host),
                placeholder: "192.168.1.100",
            }));
            const __VLS_190 = __VLS_189({
                modelValue: (__VLS_ctx.pushForm.host),
                placeholder: "192.168.1.100",
            }, ...__VLS_functionalComponentArgsRest(__VLS_189));
            var __VLS_187;
            const __VLS_192 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_193 = __VLS_asFunctionalComponent(__VLS_192, new __VLS_192({
                label: "Port",
            }));
            const __VLS_194 = __VLS_193({
                label: "Port",
            }, ...__VLS_functionalComponentArgsRest(__VLS_193));
            __VLS_195.slots.default;
            const __VLS_196 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_197 = __VLS_asFunctionalComponent(__VLS_196, new __VLS_196({
                modelValue: (__VLS_ctx.pushForm.port),
                placeholder: "3306",
            }));
            const __VLS_198 = __VLS_197({
                modelValue: (__VLS_ctx.pushForm.port),
                placeholder: "3306",
            }, ...__VLS_functionalComponentArgsRest(__VLS_197));
            var __VLS_195;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ style: {} },
            });
            const __VLS_200 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_201 = __VLS_asFunctionalComponent(__VLS_200, new __VLS_200({
                label: "数据库名",
                required: true,
            }));
            const __VLS_202 = __VLS_201({
                label: "数据库名",
                required: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_201));
            __VLS_203.slots.default;
            const __VLS_204 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_205 = __VLS_asFunctionalComponent(__VLS_204, new __VLS_204({
                modelValue: (__VLS_ctx.pushForm.database),
            }));
            const __VLS_206 = __VLS_205({
                modelValue: (__VLS_ctx.pushForm.database),
            }, ...__VLS_functionalComponentArgsRest(__VLS_205));
            var __VLS_203;
            const __VLS_208 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_209 = __VLS_asFunctionalComponent(__VLS_208, new __VLS_208({
                label: "用户名",
                required: true,
            }));
            const __VLS_210 = __VLS_209({
                label: "用户名",
                required: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_209));
            __VLS_211.slots.default;
            const __VLS_212 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_213 = __VLS_asFunctionalComponent(__VLS_212, new __VLS_212({
                modelValue: (__VLS_ctx.pushForm.db_user),
            }));
            const __VLS_214 = __VLS_213({
                modelValue: (__VLS_ctx.pushForm.db_user),
            }, ...__VLS_functionalComponentArgsRest(__VLS_213));
            var __VLS_211;
            const __VLS_216 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_217 = __VLS_asFunctionalComponent(__VLS_216, new __VLS_216({
                label: "密码",
            }));
            const __VLS_218 = __VLS_217({
                label: "密码",
            }, ...__VLS_functionalComponentArgsRest(__VLS_217));
            __VLS_219.slots.default;
            const __VLS_220 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_221 = __VLS_asFunctionalComponent(__VLS_220, new __VLS_220({
                modelValue: (__VLS_ctx.pushForm.password),
                type: "password",
                showPassword: true,
            }));
            const __VLS_222 = __VLS_221({
                modelValue: (__VLS_ctx.pushForm.password),
                type: "password",
                showPassword: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_221));
            var __VLS_219;
        }
        else if (__VLS_ctx.pushForm.push_type === 'http_push') {
            const __VLS_224 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_225 = __VLS_asFunctionalComponent(__VLS_224, new __VLS_224({
                label: "接口 URL",
                required: true,
            }));
            const __VLS_226 = __VLS_225({
                label: "接口 URL",
                required: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_225));
            __VLS_227.slots.default;
            const __VLS_228 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_229 = __VLS_asFunctionalComponent(__VLS_228, new __VLS_228({
                modelValue: (__VLS_ctx.pushForm.url),
                placeholder: "https://...",
            }));
            const __VLS_230 = __VLS_229({
                modelValue: (__VLS_ctx.pushForm.url),
                placeholder: "https://...",
            }, ...__VLS_functionalComponentArgsRest(__VLS_229));
            var __VLS_227;
            const __VLS_232 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_233 = __VLS_asFunctionalComponent(__VLS_232, new __VLS_232({
                label: "Bearer Token（可选）",
            }));
            const __VLS_234 = __VLS_233({
                label: "Bearer Token（可选）",
            }, ...__VLS_functionalComponentArgsRest(__VLS_233));
            __VLS_235.slots.default;
            const __VLS_236 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_237 = __VLS_asFunctionalComponent(__VLS_236, new __VLS_236({
                modelValue: (__VLS_ctx.pushForm.bearer_token),
                type: "password",
                showPassword: true,
            }));
            const __VLS_238 = __VLS_237({
                modelValue: (__VLS_ctx.pushForm.bearer_token),
                type: "password",
                showPassword: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_237));
            var __VLS_235;
        }
        else if (__VLS_ctx.pushForm.push_type === 'api_expose') {
            const __VLS_240 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_241 = __VLS_asFunctionalComponent(__VLS_240, new __VLS_240({
                label: "Access Token",
            }));
            const __VLS_242 = __VLS_241({
                label: "Access Token",
            }, ...__VLS_functionalComponentArgsRest(__VLS_241));
            __VLS_243.slots.default;
            const __VLS_244 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_245 = __VLS_asFunctionalComponent(__VLS_244, new __VLS_244({
                modelValue: (__VLS_ctx.pushForm.access_token),
                type: "password",
                showPassword: true,
                placeholder: "设置一个随机字符串",
            }));
            const __VLS_246 = __VLS_245({
                modelValue: (__VLS_ctx.pushForm.access_token),
                type: "password",
                showPassword: true,
                placeholder: "设置一个随机字符串",
            }, ...__VLS_functionalComponentArgsRest(__VLS_245));
            var __VLS_243;
        }
        else if (__VLS_ctx.pushForm.push_type === 'api_expose') {
            const __VLS_248 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_249 = __VLS_asFunctionalComponent(__VLS_248, new __VLS_248({
                label: "Access Token",
            }));
            const __VLS_250 = __VLS_249({
                label: "Access Token",
            }, ...__VLS_functionalComponentArgsRest(__VLS_249));
            __VLS_251.slots.default;
            const __VLS_252 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_253 = __VLS_asFunctionalComponent(__VLS_252, new __VLS_252({
                modelValue: (__VLS_ctx.pushForm.access_token),
                type: "password",
                showPassword: true,
                placeholder: "设置一个随机字符串",
            }));
            const __VLS_254 = __VLS_253({
                modelValue: (__VLS_ctx.pushForm.access_token),
                type: "password",
                showPassword: true,
                placeholder: "设置一个随机字符串",
            }, ...__VLS_functionalComponentArgsRest(__VLS_253));
            var __VLS_251;
        }
        else if (__VLS_ctx.pushForm.push_type === 'db_realtime' || __VLS_ctx.pushForm.push_type === 'db_snapshot') {
            const __VLS_256 = {}.ElAlert;
            /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
            // @ts-ignore
            const __VLS_257 = __VLS_asFunctionalComponent(__VLS_256, new __VLS_256({
                type: "info",
                closable: (false),
                showIcon: true,
                ...{ style: {} },
            }));
            const __VLS_258 = __VLS_257({
                type: "info",
                closable: (false),
                showIcon: true,
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_257));
            __VLS_259.slots.default;
            var __VLS_259;
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
    }
}
var __VLS_8;
{
    const { footer: __VLS_thisSlot } = __VLS_3.slots;
    const __VLS_260 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_261 = __VLS_asFunctionalComponent(__VLS_260, new __VLS_260({
        ...{ 'onClick': {} },
    }));
    const __VLS_262 = __VLS_261({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_261));
    let __VLS_264;
    let __VLS_265;
    let __VLS_266;
    const __VLS_267 = {
        onClick: (...[$event]) => {
            __VLS_ctx.visible = false;
        }
    };
    __VLS_263.slots.default;
    var __VLS_263;
    const __VLS_268 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_269 = __VLS_asFunctionalComponent(__VLS_268, new __VLS_268({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
    }));
    const __VLS_270 = __VLS_269({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_269));
    let __VLS_272;
    let __VLS_273;
    let __VLS_274;
    const __VLS_275 = {
        onClick: (__VLS_ctx.confirm)
    };
    __VLS_271.slots.default;
    var __VLS_271;
}
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            SmartCodeInput: SmartCodeInput,
            SCOPE_STRATEGY_OPTIONS: SCOPE_STRATEGY_OPTIONS,
            visible: visible,
            saving: saving,
            DATASOURCE_TYPES: DATASOURCE_TYPES,
            ICON_OPTIONS: ICON_OPTIONS,
            form: form,
            pushForm: pushForm,
            confirm: confirm,
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
