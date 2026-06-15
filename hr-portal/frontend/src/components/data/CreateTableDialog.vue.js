/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { adminTablesApi } from '@/api/admin_tables';
import { pushTargetsApi } from '@/api/push_targets';
const emit = defineEmits();
const visible = ref(false);
const saving = ref(false);
const pushDialogRef = ref(null);
const DATASOURCE_TYPES = [
    { value: 'upload', label: '手动上传' },
    { value: 'beisen_report', label: '北森报表' },
    { value: 'beisen_api', label: '北森接口' },
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
        is_result_table: false, icon: 'Grid', display_order: 999,
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
    if (!form.table_name.trim() || !form.table_label.trim()) {
        ElMessage.warning('表名和中文名必填');
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
    label: "表名（英文）",
    required: true,
}));
const __VLS_11 = __VLS_10({
    label: "表名（英文）",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_10));
__VLS_12.slots.default;
const __VLS_13 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_14 = __VLS_asFunctionalComponent(__VLS_13, new __VLS_13({
    modelValue: (__VLS_ctx.form.table_name),
    placeholder: "如 my_custom_table",
}));
const __VLS_15 = __VLS_14({
    modelValue: (__VLS_ctx.form.table_name),
    placeholder: "如 my_custom_table",
}, ...__VLS_functionalComponentArgsRest(__VLS_14));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
var __VLS_12;
const __VLS_17 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_18 = __VLS_asFunctionalComponent(__VLS_17, new __VLS_17({
    label: "中文名",
    required: true,
}));
const __VLS_19 = __VLS_18({
    label: "中文名",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_18));
__VLS_20.slots.default;
const __VLS_21 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_22 = __VLS_asFunctionalComponent(__VLS_21, new __VLS_21({
    modelValue: (__VLS_ctx.form.table_label),
    placeholder: "如 自定义数据表",
}));
const __VLS_23 = __VLS_22({
    modelValue: (__VLS_ctx.form.table_label),
    placeholder: "如 自定义数据表",
}, ...__VLS_functionalComponentArgsRest(__VLS_22));
var __VLS_20;
const __VLS_25 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_26 = __VLS_asFunctionalComponent(__VLS_25, new __VLS_25({
    label: "描述",
}));
const __VLS_27 = __VLS_26({
    label: "描述",
}, ...__VLS_functionalComponentArgsRest(__VLS_26));
__VLS_28.slots.default;
const __VLS_29 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_30 = __VLS_asFunctionalComponent(__VLS_29, new __VLS_29({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    rows: (2),
    placeholder: "可选",
}));
const __VLS_31 = __VLS_30({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    rows: (2),
    placeholder: "可选",
}, ...__VLS_functionalComponentArgsRest(__VLS_30));
var __VLS_28;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
const __VLS_33 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_34 = __VLS_asFunctionalComponent(__VLS_33, new __VLS_33({
    label: "图标",
}));
const __VLS_35 = __VLS_34({
    label: "图标",
}, ...__VLS_functionalComponentArgsRest(__VLS_34));
__VLS_36.slots.default;
const __VLS_37 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_38 = __VLS_asFunctionalComponent(__VLS_37, new __VLS_37({
    modelValue: (__VLS_ctx.form.icon),
    ...{ style: {} },
}));
const __VLS_39 = __VLS_38({
    modelValue: (__VLS_ctx.form.icon),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_38));
__VLS_40.slots.default;
for (const [ic] of __VLS_getVForSourceType((__VLS_ctx.ICON_OPTIONS))) {
    const __VLS_41 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_42 = __VLS_asFunctionalComponent(__VLS_41, new __VLS_41({
        key: (ic),
        label: (ic),
        value: (ic),
    }));
    const __VLS_43 = __VLS_42({
        key: (ic),
        label: (ic),
        value: (ic),
    }, ...__VLS_functionalComponentArgsRest(__VLS_42));
}
var __VLS_40;
var __VLS_36;
const __VLS_45 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_46 = __VLS_asFunctionalComponent(__VLS_45, new __VLS_45({
    label: "显示顺序",
}));
const __VLS_47 = __VLS_46({
    label: "显示顺序",
}, ...__VLS_functionalComponentArgsRest(__VLS_46));
__VLS_48.slots.default;
const __VLS_49 = {}.ElInputNumber;
/** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
// @ts-ignore
const __VLS_50 = __VLS_asFunctionalComponent(__VLS_49, new __VLS_49({
    modelValue: (__VLS_ctx.form.display_order),
    min: (1),
    max: (9999),
    ...{ style: {} },
}));
const __VLS_51 = __VLS_50({
    modelValue: (__VLS_ctx.form.display_order),
    min: (1),
    max: (9999),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_50));
var __VLS_48;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "section-title" },
});
const __VLS_53 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_54 = __VLS_asFunctionalComponent(__VLS_53, new __VLS_53({
    label: "是否月度表",
}));
const __VLS_55 = __VLS_54({
    label: "是否月度表",
}, ...__VLS_functionalComponentArgsRest(__VLS_54));
__VLS_56.slots.default;
const __VLS_57 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_58 = __VLS_asFunctionalComponent(__VLS_57, new __VLS_57({
    modelValue: (__VLS_ctx.form.is_period),
    activeText: "是（按月存储，历史月份保留）",
    inactiveText: "否（全量替换）",
}));
const __VLS_59 = __VLS_58({
    modelValue: (__VLS_ctx.form.is_period),
    activeText: "是（按月存储，历史月份保留）",
    inactiveText: "否（全量替换）",
}, ...__VLS_functionalComponentArgsRest(__VLS_58));
var __VLS_56;
if (__VLS_ctx.form.is_period) {
    const __VLS_61 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_62 = __VLS_asFunctionalComponent(__VLS_61, new __VLS_61({
        label: "期间列名",
    }));
    const __VLS_63 = __VLS_62({
        label: "期间列名",
    }, ...__VLS_functionalComponentArgsRest(__VLS_62));
    __VLS_64.slots.default;
    const __VLS_65 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_66 = __VLS_asFunctionalComponent(__VLS_65, new __VLS_65({
        modelValue: (__VLS_ctx.form.period_col),
        ...{ style: {} },
        placeholder: "月份",
    }));
    const __VLS_67 = __VLS_66({
        modelValue: (__VLS_ctx.form.period_col),
        ...{ style: {} },
        placeholder: "月份",
    }, ...__VLS_functionalComponentArgsRest(__VLS_66));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: {} },
    });
    var __VLS_64;
    const __VLS_69 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_70 = __VLS_asFunctionalComponent(__VLS_69, new __VLS_69({
        label: "月份来源",
    }));
    const __VLS_71 = __VLS_70({
        label: "月份来源",
    }, ...__VLS_functionalComponentArgsRest(__VLS_70));
    __VLS_72.slots.default;
    const __VLS_73 = {}.ElRadioGroup;
    /** @type {[typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, ]} */ ;
    // @ts-ignore
    const __VLS_74 = __VLS_asFunctionalComponent(__VLS_73, new __VLS_73({
        modelValue: (__VLS_ctx.form.period_source),
    }));
    const __VLS_75 = __VLS_74({
        modelValue: (__VLS_ctx.form.period_source),
    }, ...__VLS_functionalComponentArgsRest(__VLS_74));
    __VLS_76.slots.default;
    const __VLS_77 = {}.ElRadio;
    /** @type {[typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, ]} */ ;
    // @ts-ignore
    const __VLS_78 = __VLS_asFunctionalComponent(__VLS_77, new __VLS_77({
        value: "field",
    }));
    const __VLS_79 = __VLS_78({
        value: "field",
    }, ...__VLS_functionalComponentArgsRest(__VLS_78));
    __VLS_80.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: {} },
    });
    var __VLS_80;
    const __VLS_81 = {}.ElRadio;
    /** @type {[typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, ]} */ ;
    // @ts-ignore
    const __VLS_82 = __VLS_asFunctionalComponent(__VLS_81, new __VLS_81({
        value: "inject",
    }));
    const __VLS_83 = __VLS_82({
        value: "inject",
    }, ...__VLS_functionalComponentArgsRest(__VLS_82));
    __VLS_84.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: {} },
    });
    var __VLS_84;
    var __VLS_76;
    var __VLS_72;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "section-title" },
});
const __VLS_85 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_86 = __VLS_asFunctionalComponent(__VLS_85, new __VLS_85({
    label: "可作为分摊结果表",
}));
const __VLS_87 = __VLS_86({
    label: "可作为分摊结果表",
}, ...__VLS_functionalComponentArgsRest(__VLS_86));
__VLS_88.slots.default;
const __VLS_89 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_90 = __VLS_asFunctionalComponent(__VLS_89, new __VLS_89({
    modelValue: (__VLS_ctx.form.is_result_table),
    activeText: "是（可在成本分摊方案中选为写入目标）",
}));
const __VLS_91 = __VLS_90({
    modelValue: (__VLS_ctx.form.is_result_table),
    activeText: "是（可在成本分摊方案中选为写入目标）",
}, ...__VLS_functionalComponentArgsRest(__VLS_90));
var __VLS_88;
const __VLS_93 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_94 = __VLS_asFunctionalComponent(__VLS_93, new __VLS_93({
    label: "创建接口配置",
}));
const __VLS_95 = __VLS_94({
    label: "创建接口配置",
}, ...__VLS_functionalComponentArgsRest(__VLS_94));
__VLS_96.slots.default;
const __VLS_97 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_98 = __VLS_asFunctionalComponent(__VLS_97, new __VLS_97({
    modelValue: (__VLS_ctx.form.create_datasource),
    activeText: "是（自动创建数据源接口配置）",
}));
const __VLS_99 = __VLS_98({
    modelValue: (__VLS_ctx.form.create_datasource),
    activeText: "是（自动创建数据源接口配置）",
}, ...__VLS_functionalComponentArgsRest(__VLS_98));
var __VLS_96;
if (__VLS_ctx.form.create_datasource) {
    const __VLS_101 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_102 = __VLS_asFunctionalComponent(__VLS_101, new __VLS_101({
        label: "接口类型",
    }));
    const __VLS_103 = __VLS_102({
        label: "接口类型",
    }, ...__VLS_functionalComponentArgsRest(__VLS_102));
    __VLS_104.slots.default;
    const __VLS_105 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_106 = __VLS_asFunctionalComponent(__VLS_105, new __VLS_105({
        modelValue: (__VLS_ctx.form.datasource_source_type),
        ...{ style: {} },
    }));
    const __VLS_107 = __VLS_106({
        modelValue: (__VLS_ctx.form.datasource_source_type),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_106));
    __VLS_108.slots.default;
    for (const [t] of __VLS_getVForSourceType((__VLS_ctx.DATASOURCE_TYPES))) {
        const __VLS_109 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_110 = __VLS_asFunctionalComponent(__VLS_109, new __VLS_109({
            key: (t.value),
            label: (t.label),
            value: (t.value),
        }));
        const __VLS_111 = __VLS_110({
            key: (t.value),
            label: (t.label),
            value: (t.value),
        }, ...__VLS_functionalComponentArgsRest(__VLS_110));
    }
    var __VLS_108;
    var __VLS_104;
}
if (__VLS_ctx.form.create_datasource) {
    const __VLS_113 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_114 = __VLS_asFunctionalComponent(__VLS_113, new __VLS_113({
        label: "同时创建推送目标",
    }));
    const __VLS_115 = __VLS_114({
        label: "同时创建推送目标",
    }, ...__VLS_functionalComponentArgsRest(__VLS_114));
    __VLS_116.slots.default;
    const __VLS_117 = {}.ElSwitch;
    /** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
    // @ts-ignore
    const __VLS_118 = __VLS_asFunctionalComponent(__VLS_117, new __VLS_117({
        modelValue: (__VLS_ctx.form.create_push_target),
        activeText: "是（配置对外推送）",
    }));
    const __VLS_119 = __VLS_118({
        modelValue: (__VLS_ctx.form.create_push_target),
        activeText: "是（配置对外推送）",
    }, ...__VLS_functionalComponentArgsRest(__VLS_118));
    var __VLS_116;
    if (__VLS_ctx.form.create_push_target) {
        const __VLS_121 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_122 = __VLS_asFunctionalComponent(__VLS_121, new __VLS_121({
            label: "推送方式",
            required: true,
        }));
        const __VLS_123 = __VLS_122({
            label: "推送方式",
            required: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_122));
        __VLS_124.slots.default;
        const __VLS_125 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_126 = __VLS_asFunctionalComponent(__VLS_125, new __VLS_125({
            modelValue: (__VLS_ctx.pushForm.push_type),
            ...{ style: {} },
        }));
        const __VLS_127 = __VLS_126({
            modelValue: (__VLS_ctx.pushForm.push_type),
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_126));
        __VLS_128.slots.default;
        const __VLS_129 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_130 = __VLS_asFunctionalComponent(__VLS_129, new __VLS_129({
            value: "external_db",
            label: "写入外部数据库（MySQL/PostgreSQL）",
        }));
        const __VLS_131 = __VLS_130({
            value: "external_db",
            label: "写入外部数据库（MySQL/PostgreSQL）",
        }, ...__VLS_functionalComponentArgsRest(__VLS_130));
        const __VLS_133 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_134 = __VLS_asFunctionalComponent(__VLS_133, new __VLS_133({
            value: "http_push",
            label: "POST JSON 到接口",
        }));
        const __VLS_135 = __VLS_134({
            value: "http_push",
            label: "POST JSON 到接口",
        }, ...__VLS_functionalComponentArgsRest(__VLS_134));
        const __VLS_137 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_138 = __VLS_asFunctionalComponent(__VLS_137, new __VLS_137({
            value: "api_expose",
            label: "暴露只读 API（对方主动拉取）",
        }));
        const __VLS_139 = __VLS_138({
            value: "api_expose",
            label: "暴露只读 API（对方主动拉取）",
        }, ...__VLS_functionalComponentArgsRest(__VLS_138));
        const __VLS_141 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_142 = __VLS_asFunctionalComponent(__VLS_141, new __VLS_141({
            value: "db_expose",
            label: "暴露只读数据库账号（对方直连 PostgreSQL）",
        }));
        const __VLS_143 = __VLS_142({
            value: "db_expose",
            label: "暴露只读数据库账号（对方直连 PostgreSQL）",
        }, ...__VLS_functionalComponentArgsRest(__VLS_142));
        var __VLS_128;
        var __VLS_124;
        if (__VLS_ctx.pushForm.push_type === 'external_db') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ style: {} },
            });
            const __VLS_145 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_146 = __VLS_asFunctionalComponent(__VLS_145, new __VLS_145({
                label: "目标表名",
                required: true,
            }));
            const __VLS_147 = __VLS_146({
                label: "目标表名",
                required: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_146));
            __VLS_148.slots.default;
            const __VLS_149 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_150 = __VLS_asFunctionalComponent(__VLS_149, new __VLS_149({
                modelValue: (__VLS_ctx.pushForm.target_table),
                placeholder: "如 beisen_salary_report",
            }));
            const __VLS_151 = __VLS_150({
                modelValue: (__VLS_ctx.pushForm.target_table),
                placeholder: "如 beisen_salary_report",
            }, ...__VLS_functionalComponentArgsRest(__VLS_150));
            var __VLS_148;
            const __VLS_153 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_154 = __VLS_asFunctionalComponent(__VLS_153, new __VLS_153({
                label: "数据库类型",
            }));
            const __VLS_155 = __VLS_154({
                label: "数据库类型",
            }, ...__VLS_functionalComponentArgsRest(__VLS_154));
            __VLS_156.slots.default;
            const __VLS_157 = {}.ElSelect;
            /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
            // @ts-ignore
            const __VLS_158 = __VLS_asFunctionalComponent(__VLS_157, new __VLS_157({
                modelValue: (__VLS_ctx.pushForm.dialect),
                ...{ style: {} },
            }));
            const __VLS_159 = __VLS_158({
                modelValue: (__VLS_ctx.pushForm.dialect),
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_158));
            __VLS_160.slots.default;
            const __VLS_161 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_162 = __VLS_asFunctionalComponent(__VLS_161, new __VLS_161({
                value: "mysql",
                label: "MySQL",
            }));
            const __VLS_163 = __VLS_162({
                value: "mysql",
                label: "MySQL",
            }, ...__VLS_functionalComponentArgsRest(__VLS_162));
            const __VLS_165 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_166 = __VLS_asFunctionalComponent(__VLS_165, new __VLS_165({
                value: "postgresql",
                label: "PostgreSQL",
            }));
            const __VLS_167 = __VLS_166({
                value: "postgresql",
                label: "PostgreSQL",
            }, ...__VLS_functionalComponentArgsRest(__VLS_166));
            var __VLS_160;
            var __VLS_156;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ style: {} },
            });
            const __VLS_169 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_170 = __VLS_asFunctionalComponent(__VLS_169, new __VLS_169({
                label: "Host",
                required: true,
            }));
            const __VLS_171 = __VLS_170({
                label: "Host",
                required: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_170));
            __VLS_172.slots.default;
            const __VLS_173 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_174 = __VLS_asFunctionalComponent(__VLS_173, new __VLS_173({
                modelValue: (__VLS_ctx.pushForm.host),
                placeholder: "192.168.1.100",
            }));
            const __VLS_175 = __VLS_174({
                modelValue: (__VLS_ctx.pushForm.host),
                placeholder: "192.168.1.100",
            }, ...__VLS_functionalComponentArgsRest(__VLS_174));
            var __VLS_172;
            const __VLS_177 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_178 = __VLS_asFunctionalComponent(__VLS_177, new __VLS_177({
                label: "Port",
            }));
            const __VLS_179 = __VLS_178({
                label: "Port",
            }, ...__VLS_functionalComponentArgsRest(__VLS_178));
            __VLS_180.slots.default;
            const __VLS_181 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_182 = __VLS_asFunctionalComponent(__VLS_181, new __VLS_181({
                modelValue: (__VLS_ctx.pushForm.port),
                placeholder: "3306",
            }));
            const __VLS_183 = __VLS_182({
                modelValue: (__VLS_ctx.pushForm.port),
                placeholder: "3306",
            }, ...__VLS_functionalComponentArgsRest(__VLS_182));
            var __VLS_180;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ style: {} },
            });
            const __VLS_185 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_186 = __VLS_asFunctionalComponent(__VLS_185, new __VLS_185({
                label: "数据库名",
                required: true,
            }));
            const __VLS_187 = __VLS_186({
                label: "数据库名",
                required: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_186));
            __VLS_188.slots.default;
            const __VLS_189 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_190 = __VLS_asFunctionalComponent(__VLS_189, new __VLS_189({
                modelValue: (__VLS_ctx.pushForm.database),
            }));
            const __VLS_191 = __VLS_190({
                modelValue: (__VLS_ctx.pushForm.database),
            }, ...__VLS_functionalComponentArgsRest(__VLS_190));
            var __VLS_188;
            const __VLS_193 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_194 = __VLS_asFunctionalComponent(__VLS_193, new __VLS_193({
                label: "用户名",
                required: true,
            }));
            const __VLS_195 = __VLS_194({
                label: "用户名",
                required: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_194));
            __VLS_196.slots.default;
            const __VLS_197 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_198 = __VLS_asFunctionalComponent(__VLS_197, new __VLS_197({
                modelValue: (__VLS_ctx.pushForm.db_user),
            }));
            const __VLS_199 = __VLS_198({
                modelValue: (__VLS_ctx.pushForm.db_user),
            }, ...__VLS_functionalComponentArgsRest(__VLS_198));
            var __VLS_196;
            const __VLS_201 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_202 = __VLS_asFunctionalComponent(__VLS_201, new __VLS_201({
                label: "密码",
            }));
            const __VLS_203 = __VLS_202({
                label: "密码",
            }, ...__VLS_functionalComponentArgsRest(__VLS_202));
            __VLS_204.slots.default;
            const __VLS_205 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_206 = __VLS_asFunctionalComponent(__VLS_205, new __VLS_205({
                modelValue: (__VLS_ctx.pushForm.password),
                type: "password",
                showPassword: true,
            }));
            const __VLS_207 = __VLS_206({
                modelValue: (__VLS_ctx.pushForm.password),
                type: "password",
                showPassword: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_206));
            var __VLS_204;
        }
        else if (__VLS_ctx.pushForm.push_type === 'http_push') {
            const __VLS_209 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_210 = __VLS_asFunctionalComponent(__VLS_209, new __VLS_209({
                label: "接口 URL",
                required: true,
            }));
            const __VLS_211 = __VLS_210({
                label: "接口 URL",
                required: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_210));
            __VLS_212.slots.default;
            const __VLS_213 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_214 = __VLS_asFunctionalComponent(__VLS_213, new __VLS_213({
                modelValue: (__VLS_ctx.pushForm.url),
                placeholder: "https://...",
            }));
            const __VLS_215 = __VLS_214({
                modelValue: (__VLS_ctx.pushForm.url),
                placeholder: "https://...",
            }, ...__VLS_functionalComponentArgsRest(__VLS_214));
            var __VLS_212;
            const __VLS_217 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_218 = __VLS_asFunctionalComponent(__VLS_217, new __VLS_217({
                label: "Bearer Token（可选）",
            }));
            const __VLS_219 = __VLS_218({
                label: "Bearer Token（可选）",
            }, ...__VLS_functionalComponentArgsRest(__VLS_218));
            __VLS_220.slots.default;
            const __VLS_221 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_222 = __VLS_asFunctionalComponent(__VLS_221, new __VLS_221({
                modelValue: (__VLS_ctx.pushForm.bearer_token),
                type: "password",
                showPassword: true,
            }));
            const __VLS_223 = __VLS_222({
                modelValue: (__VLS_ctx.pushForm.bearer_token),
                type: "password",
                showPassword: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_222));
            var __VLS_220;
        }
        else if (__VLS_ctx.pushForm.push_type === 'api_expose') {
            const __VLS_225 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_226 = __VLS_asFunctionalComponent(__VLS_225, new __VLS_225({
                label: "Access Token",
            }));
            const __VLS_227 = __VLS_226({
                label: "Access Token",
            }, ...__VLS_functionalComponentArgsRest(__VLS_226));
            __VLS_228.slots.default;
            const __VLS_229 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_230 = __VLS_asFunctionalComponent(__VLS_229, new __VLS_229({
                modelValue: (__VLS_ctx.pushForm.access_token),
                type: "password",
                showPassword: true,
                placeholder: "设置一个随机字符串",
            }));
            const __VLS_231 = __VLS_230({
                modelValue: (__VLS_ctx.pushForm.access_token),
                type: "password",
                showPassword: true,
                placeholder: "设置一个随机字符串",
            }, ...__VLS_functionalComponentArgsRest(__VLS_230));
            var __VLS_228;
        }
        else if (__VLS_ctx.pushForm.push_type === 'api_expose') {
            const __VLS_233 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_234 = __VLS_asFunctionalComponent(__VLS_233, new __VLS_233({
                label: "Access Token",
            }));
            const __VLS_235 = __VLS_234({
                label: "Access Token",
            }, ...__VLS_functionalComponentArgsRest(__VLS_234));
            __VLS_236.slots.default;
            const __VLS_237 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_238 = __VLS_asFunctionalComponent(__VLS_237, new __VLS_237({
                modelValue: (__VLS_ctx.pushForm.access_token),
                type: "password",
                showPassword: true,
                placeholder: "设置一个随机字符串",
            }));
            const __VLS_239 = __VLS_238({
                modelValue: (__VLS_ctx.pushForm.access_token),
                type: "password",
                showPassword: true,
                placeholder: "设置一个随机字符串",
            }, ...__VLS_functionalComponentArgsRest(__VLS_238));
            var __VLS_236;
        }
        else if (__VLS_ctx.pushForm.push_type === 'db_expose') {
            const __VLS_241 = {}.ElAlert;
            /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
            // @ts-ignore
            const __VLS_242 = __VLS_asFunctionalComponent(__VLS_241, new __VLS_241({
                type: "info",
                closable: (false),
                showIcon: true,
                ...{ style: {} },
            }));
            const __VLS_243 = __VLS_242({
                type: "info",
                closable: (false),
                showIcon: true,
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_242));
            __VLS_244.slots.default;
            var __VLS_244;
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
    }
}
var __VLS_8;
{
    const { footer: __VLS_thisSlot } = __VLS_3.slots;
    const __VLS_245 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_246 = __VLS_asFunctionalComponent(__VLS_245, new __VLS_245({
        ...{ 'onClick': {} },
    }));
    const __VLS_247 = __VLS_246({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_246));
    let __VLS_249;
    let __VLS_250;
    let __VLS_251;
    const __VLS_252 = {
        onClick: (...[$event]) => {
            __VLS_ctx.visible = false;
        }
    };
    __VLS_248.slots.default;
    var __VLS_248;
    const __VLS_253 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_254 = __VLS_asFunctionalComponent(__VLS_253, new __VLS_253({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
    }));
    const __VLS_255 = __VLS_254({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_254));
    let __VLS_257;
    let __VLS_258;
    let __VLS_259;
    const __VLS_260 = {
        onClick: (__VLS_ctx.confirm)
    };
    __VLS_256.slots.default;
    var __VLS_256;
}
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
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
});
export default (await import('vue')).defineComponent({
    setup() {
        return {
            ...__VLS_exposed,
        };
    },
    __typeEmits: {},
});
; /* PartiallyEnd: #4569/main.vue */
