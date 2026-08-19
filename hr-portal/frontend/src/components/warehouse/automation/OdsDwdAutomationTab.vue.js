/// <reference types="../../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { formatDateTime } from '@/utils/datetime';
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Setting, Refresh, CircleCheck, CircleClose, Clock } from '@element-plus/icons-vue';
import { listOdsDwdAutomationConfigs, updateOdsDwdAutomationConfig, getWarehouseFeatures, triggerOdsDwdSync } from '@/api/warehouse';
const router = useRouter();
const featureEnabled = ref(false);
const loading = ref(true);
const configs = ref([]);
const filterMode = ref('');
async function load() {
    loading.value = true;
    try {
        const f = await getWarehouseFeatures();
        featureEnabled.value = f.ods_dwd_automation;
        const params = {};
        if (filterMode.value)
            params.update_mode = filterMode.value;
        configs.value = await listOdsDwdAutomationConfigs(params);
    }
    catch {
        featureEnabled.value = false;
        configs.value = [];
    }
    finally {
        loading.value = false;
    }
}
async function toggleConfig(config) {
    try {
        if (config.enabled) {
            await updateOdsDwdAutomationConfig(config.ods_table_name, { enabled: false });
            ElMessage.success(`已暂停 ${config.ods_table_label || config.ods_table_name}`);
        }
        else {
            await ElMessageBox.confirm(`开启后，每次 ${config.ods_table_label || config.ods_table_name} 同步完成将自动更新 DWD，确定？`, '确认开启自动化', { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' });
            await updateOdsDwdAutomationConfig(config.ods_table_name, { enabled: true });
            ElMessage.success(`已开启 ${config.ods_table_label || config.ods_table_name}`);
        }
        await load();
    }
    catch (e) {
        if (e !== 'cancel')
            ElMessage.error(e?.response?.data?.detail || '操作失败');
    }
}
const triggering = ref(null);
async function doTrigger(config) {
    triggering.value = config.ods_table_name;
    try {
        let period;
        if (config.effective_ingestion_mode === 'period_full_snapshot' || (config.ods_sync_semantics === 'full_snapshot' &&
            config.missing_row_strategy === 'hard_delete' &&
            (config.business_key_fields || []).includes('cost_period'))) {
            period = window.prompt('请输入要处理的成本归属年月（YYYYMM，例如 202607）', '') || undefined;
            if (!period)
                return;
        }
        const r = await triggerOdsDwdSync(config.ods_table_name, period);
        ElMessage.success(r.message || '已触发同步');
        await load();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '触发失败');
    }
    finally {
        triggering.value = null;
    }
}
function goRecipe(tableName) { router.push({ path: '/warehouse/data-recipe', query: { table: tableName } }); }
function modeLabel(mode) { const map = { cleaning_rule: '清洗规则', passthrough: '直通更新' }; return map[mode] || mode; }
function syncLabel(config) {
    const mode = config.effective_ingestion_mode;
    if (mode === 'period_full_snapshot')
        return '按期间全量快照';
    if (mode === 'current_snapshot')
        return '当前状态全量快照';
    if (mode === 'incremental_upsert')
        return '增量更新';
    if (mode === 'append')
        return '增量追加';
    const map = { full_snapshot: '全量快照', incremental_append: '增量追加', incremental_upsert: '增量更新' };
    return map[config.ods_sync_semantics] || config.ods_sync_semantics;
}
function statusIcon(s) { if (s === 'success')
    return CircleCheck; if (s === 'failed')
    return CircleClose; return Clock; }
onMounted(load);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
if (!__VLS_ctx.featureEnabled && !__VLS_ctx.loading) {
    const __VLS_0 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        type: "info",
        closable: (false),
        showIcon: true,
        ...{ style: {} },
    }));
    const __VLS_2 = __VLS_1({
        type: "info",
        closable: (false),
        showIcon: true,
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_3.slots.default;
    {
        const { title: __VLS_thisSlot } = __VLS_3.slots;
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({});
    var __VLS_3;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "filter-bar" },
});
const __VLS_4 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.filterMode),
    placeholder: "更新模式",
    clearable: true,
    size: "default",
}));
const __VLS_6 = __VLS_5({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.filterMode),
    placeholder: "更新模式",
    clearable: true,
    size: "default",
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
let __VLS_8;
let __VLS_9;
let __VLS_10;
const __VLS_11 = {
    onChange: (__VLS_ctx.load)
};
__VLS_7.slots.default;
const __VLS_12 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    label: "清洗规则",
    value: "cleaning_rule",
}));
const __VLS_14 = __VLS_13({
    label: "清洗规则",
    value: "cleaning_rule",
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
const __VLS_16 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    label: "直通更新",
    value: "passthrough",
}));
const __VLS_18 = __VLS_17({
    label: "直通更新",
    value: "passthrough",
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
var __VLS_7;
const __VLS_20 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    data: (__VLS_ctx.configs),
    stripe: true,
    size: "default",
    ...{ style: {} },
}));
const __VLS_22 = __VLS_21({
    data: (__VLS_ctx.configs),
    stripe: true,
    size: "default",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_23.slots.default;
const __VLS_24 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    label: "ODS 表",
    minWidth: "160",
}));
const __VLS_26 = __VLS_25({
    label: "ODS 表",
    minWidth: "160",
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
__VLS_27.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_27.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (row.ods_table_label || row.ods_table_name);
    if (row.auto_created) {
        const __VLS_28 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
            size: "small",
            type: "info",
            effect: "plain",
            ...{ style: {} },
        }));
        const __VLS_30 = __VLS_29({
            size: "small",
            type: "info",
            effect: "plain",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_29));
        __VLS_31.slots.default;
        var __VLS_31;
    }
}
var __VLS_27;
const __VLS_32 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    label: "DWD 资产",
    minWidth: "140",
}));
const __VLS_34 = __VLS_33({
    label: "DWD 资产",
    minWidth: "140",
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
__VLS_35.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_35.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (row.dwd_table_label !== '-' ? row.dwd_table_label : (row.target_dwd_table_name || '-'));
}
var __VLS_35;
const __VLS_36 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
    label: "更新模式",
    width: "100",
}));
const __VLS_38 = __VLS_37({
    label: "更新模式",
    width: "100",
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
__VLS_39.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_39.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_40 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
        size: "small",
        type: (row.update_mode === 'cleaning_rule' ? 'success' : 'warning'),
    }));
    const __VLS_42 = __VLS_41({
        size: "small",
        type: (row.update_mode === 'cleaning_rule' ? 'success' : 'warning'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_41));
    __VLS_43.slots.default;
    (__VLS_ctx.modeLabel(row.update_mode));
    var __VLS_43;
}
var __VLS_39;
const __VLS_44 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
    label: "ODS语义",
    width: "100",
}));
const __VLS_46 = __VLS_45({
    label: "ODS语义",
    width: "100",
}, ...__VLS_functionalComponentArgsRest(__VLS_45));
__VLS_47.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_47.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (__VLS_ctx.syncLabel(row));
}
var __VLS_47;
const __VLS_48 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
    label: "最近状态",
    width: "90",
}));
const __VLS_50 = __VLS_49({
    label: "最近状态",
    width: "90",
}, ...__VLS_functionalComponentArgsRest(__VLS_49));
__VLS_51.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_51.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    if (row.last_execution_status === 'failed' && row.last_execution_error) {
        const __VLS_52 = {}.ElTooltip;
        /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
        // @ts-ignore
        const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
            content: (row.last_execution_error),
            placement: "top",
            showAfter: (300),
        }));
        const __VLS_54 = __VLS_53({
            content: (row.last_execution_error),
            placement: "top",
            showAfter: (300),
        }, ...__VLS_functionalComponentArgsRest(__VLS_53));
        __VLS_55.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: ({ color: '#F56C6C', cursor: 'help' }) },
        });
        const __VLS_56 = ((__VLS_ctx.statusIcon(row.last_execution_status)));
        // @ts-ignore
        const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
            ...{ style: {} },
        }));
        const __VLS_58 = __VLS_57({
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_57));
        var __VLS_55;
    }
    else if (row.last_execution_status) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: ({ color: row.last_execution_status === 'success' ? '#67C23A' : '#F56C6C' }) },
        });
        const __VLS_60 = ((__VLS_ctx.statusIcon(row.last_execution_status)));
        // @ts-ignore
        const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
            ...{ style: {} },
        }));
        const __VLS_62 = __VLS_61({
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_61));
        (row.last_execution_status === 'success' ? '成功' : '失败');
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
    }
}
var __VLS_51;
const __VLS_64 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
    label: "最近执行",
    minWidth: "130",
}));
const __VLS_66 = __VLS_65({
    label: "最近执行",
    minWidth: "130",
}, ...__VLS_functionalComponentArgsRest(__VLS_65));
__VLS_67.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_67.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (__VLS_ctx.formatDateTime(row.last_execution_at) || '-');
}
var __VLS_67;
const __VLS_68 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
    label: "操作",
    width: "240",
    fixed: "right",
}));
const __VLS_70 = __VLS_69({
    label: "操作",
    width: "240",
    fixed: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_69));
__VLS_71.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_71.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_72 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
        ...{ 'onClick': {} },
        size: "small",
    }));
    const __VLS_74 = __VLS_73({
        ...{ 'onClick': {} },
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_73));
    let __VLS_76;
    let __VLS_77;
    let __VLS_78;
    const __VLS_79 = {
        onClick: (...[$event]) => {
            __VLS_ctx.goRecipe(row.ods_table_name);
        }
    };
    __VLS_75.slots.default;
    const __VLS_80 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
        ...{ style: {} },
    }));
    const __VLS_82 = __VLS_81({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_81));
    __VLS_83.slots.default;
    const __VLS_84 = {}.Setting;
    /** @type {[typeof __VLS_components.Setting, ]} */ ;
    // @ts-ignore
    const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({}));
    const __VLS_86 = __VLS_85({}, ...__VLS_functionalComponentArgsRest(__VLS_85));
    var __VLS_83;
    var __VLS_75;
    const __VLS_88 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
        ...{ 'onClick': {} },
        size: "small",
        loading: (__VLS_ctx.triggering === row.ods_table_name),
    }));
    const __VLS_90 = __VLS_89({
        ...{ 'onClick': {} },
        size: "small",
        loading: (__VLS_ctx.triggering === row.ods_table_name),
    }, ...__VLS_functionalComponentArgsRest(__VLS_89));
    let __VLS_92;
    let __VLS_93;
    let __VLS_94;
    const __VLS_95 = {
        onClick: (...[$event]) => {
            __VLS_ctx.doTrigger(row);
        }
    };
    __VLS_91.slots.default;
    const __VLS_96 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
        ...{ style: {} },
    }));
    const __VLS_98 = __VLS_97({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_97));
    __VLS_99.slots.default;
    const __VLS_100 = {}.Refresh;
    /** @type {[typeof __VLS_components.Refresh, ]} */ ;
    // @ts-ignore
    const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({}));
    const __VLS_102 = __VLS_101({}, ...__VLS_functionalComponentArgsRest(__VLS_101));
    var __VLS_99;
    var __VLS_91;
    const __VLS_104 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
        ...{ 'onClick': {} },
        size: "small",
        type: (row.enabled ? 'warning' : 'success'),
    }));
    const __VLS_106 = __VLS_105({
        ...{ 'onClick': {} },
        size: "small",
        type: (row.enabled ? 'warning' : 'success'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_105));
    let __VLS_108;
    let __VLS_109;
    let __VLS_110;
    const __VLS_111 = {
        onClick: (...[$event]) => {
            __VLS_ctx.toggleConfig(row);
        }
    };
    __VLS_107.slots.default;
    (row.enabled ? '暂停' : '开启');
    var __VLS_107;
}
var __VLS_71;
var __VLS_23;
if (!__VLS_ctx.loading && __VLS_ctx.configs.length === 0) {
    const __VLS_112 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
        description: "暂无 ODS→DWD 自动化配置",
    }));
    const __VLS_114 = __VLS_113({
        description: "暂无 ODS→DWD 自动化配置",
    }, ...__VLS_functionalComponentArgsRest(__VLS_113));
    __VLS_115.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ style: {} },
    });
    const __VLS_116 = {}.ElLink;
    /** @type {[typeof __VLS_components.ElLink, typeof __VLS_components.elLink, typeof __VLS_components.ElLink, typeof __VLS_components.elLink, ]} */ ;
    // @ts-ignore
    const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
        ...{ 'onClick': {} },
        type: "primary",
    }));
    const __VLS_118 = __VLS_117({
        ...{ 'onClick': {} },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_117));
    let __VLS_120;
    let __VLS_121;
    let __VLS_122;
    const __VLS_123 = {
        onClick: (...[$event]) => {
            if (!(!__VLS_ctx.loading && __VLS_ctx.configs.length === 0))
                return;
            __VLS_ctx.router.push('/warehouse/data-recipe');
        }
    };
    __VLS_119.slots.default;
    var __VLS_119;
    var __VLS_115;
}
/** @type {__VLS_StyleScopedClasses['filter-bar']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            formatDateTime: formatDateTime,
            Setting: Setting,
            Refresh: Refresh,
            router: router,
            featureEnabled: featureEnabled,
            loading: loading,
            configs: configs,
            filterMode: filterMode,
            load: load,
            toggleConfig: toggleConfig,
            triggering: triggering,
            doTrigger: doTrigger,
            goRecipe: goRecipe,
            modeLabel: modeLabel,
            syncLabel: syncLabel,
            statusIcon: statusIcon,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
