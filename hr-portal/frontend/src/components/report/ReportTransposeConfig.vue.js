/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, ref } from 'vue';
import { Delete, InfoFilled, Plus } from '@element-plus/icons-vue';
import { dataApi } from '@/api/data';
import { REPORT_AGG_FUNCS } from '@/constants/reportAggregation';
const props = defineProps();
const emit = defineEmits();
const ccNameOptions = ref([]);
const ccCodeOptions = ref([]);
let ccMasterLoaded = false;
const allSelectedColumns = computed(() => props.selectedColumns?.length
    ? props.selectedColumns
    : [...props.selectedDimensions, ...props.selectedMeasures]);
function instanceIdOf(column) {
    return column._instance_id || column.code;
}
function sourceCode(instanceId) {
    return instanceId.replace(/#\d+$/, '');
}
function columnLabel(column) {
    const instanceId = instanceIdOf(column);
    if (instanceId === column.code)
        return column.label;
    return `${column.label} (${instanceId.split('#').pop()})`;
}
const activeTab = ref('remap');
const conflictOptions = computed(() => [
    { value: 'first', label: '取第一条' },
    { value: 'last', label: '取最后一条' },
    { value: 'join', label: '合并文本' },
    ...REPORT_AGG_FUNCS,
]);
const columnToRowConflictOptions = computed(() => [
    { value: 'keep_all', label: '保留明细' },
    ...conflictOptions.value,
]);
function defaultColumnToRow() {
    return {
        enabled: false,
        source_cols: [],
        group_by: [],
        item_label: '项目',
        value_label: '金额',
        conflict_strategy: 'keep_all',
    };
}
function defaultRowToColumn() {
    return {
        enabled: false,
        group_by: [],
        pivot_col: '',
        value_col: '',
        pivot_values: [],
        fill_value: '--',
        conflict_strategy: 'first',
    };
}
const columnToRowEnabled = computed(() => (props.transpose.column_to_row || defaultColumnToRow()).enabled);
const rowToColumnEnabled = computed(() => (props.transpose.row_to_column || defaultRowToColumn()).enabled);
async function ensureCcMaster() {
    if (ccMasterLoaded)
        return;
    ccMasterLoaded = true;
    try {
        const names = await dataApi.distinct('cost_center_monthly', 'name', 'code');
        ccNameOptions.value = names.map((r) => ({
            value: r.value,
            label: r.extra ? `${r.value} (${r.extra})` : r.value,
            extra: r.extra || '',
        }));
        const codes = await dataApi.distinct('cost_center_monthly', 'code', 'name');
        ccCodeOptions.value = codes.map((r) => ({
            value: r.value,
            label: r.extra ? `${r.value} (${r.extra})` : r.value,
        }));
    }
    catch {
        ccMasterLoaded = false;
    }
}
function tdimKind(qual) {
    const source = sourceCode(qual);
    const t = source.includes('.') ? source.slice(source.indexOf('.') + 1) : source;
    if (t === 'dimension_value' || t === 'name')
        return 'name';
    if (t === 'code')
        return 'code';
    return null;
}
function onTransposeDimValue(rule, d) {
    if (tdimKind(d.dim) !== 'name')
        return;
    const opt = ccNameOptions.value.find((o) => o.value === d.value);
    if (!opt || !opt.extra)
        return;
    const codeQuals = props.selectedDimensions
        .filter((column) => tdimKind(instanceIdOf(column)) === 'code')
        .map(instanceIdOf);
    for (const cq of codeQuals) {
        const ex = rule.dims.find((x) => x.dim === cq);
        if (ex)
            ex.value = opt.extra;
        else
            rule.dims.push({ dim: cq, value: opt.extra });
    }
}
function patch(changes) {
    emit('update:transpose', { ...props.transpose, ...changes });
}
function patchColumnToRow(changes) {
    patch({ column_to_row: { ...defaultColumnToRow(), ...(props.transpose.column_to_row || {}), ...changes } });
}
function patchRowToColumn(changes) {
    patch({ row_to_column: { ...defaultRowToColumn(), ...(props.transpose.row_to_column || {}), ...changes } });
}
function addRule() {
    patch({ rules: [...(props.transpose.rules || []), { source_col: '', dims: [{ dim: '', value: '' }], target_cols: [] }] });
}
function removeRule(i) {
    const rules = [...(props.transpose.rules || [])];
    rules.splice(i, 1);
    patch({ rules });
}
function addDimUpdate(ruleIdx) {
    const rules = (props.transpose.rules || []).map((r, i) => i === ruleIdx ? { ...r, dims: [...r.dims, { dim: '', value: '' }] } : r);
    patch({ rules });
}
function removeDimUpdate(ruleIdx, dimIdx) {
    const rules = (props.transpose.rules || []).map((r, i) => {
        if (i !== ruleIdx)
            return r;
        const dims = [...r.dims];
        dims.splice(dimIdx, 1);
        return { ...r, dims };
    });
    patch({ rules });
}
function addPivotValue() {
    const cfg = { ...defaultRowToColumn(), ...(props.transpose.row_to_column || {}) };
    patchRowToColumn({ pivot_values: [...cfg.pivot_values, { value: '', label: '' }] });
}
function removePivotValue(index) {
    const cfg = { ...defaultRowToColumn(), ...(props.transpose.row_to_column || {}) };
    const values = [...cfg.pivot_values];
    values.splice(index, 1);
    patchRowToColumn({ pivot_values: values });
}
function updatePivotValue(index, patchValue) {
    const cfg = { ...defaultRowToColumn(), ...(props.transpose.row_to_column || {}) };
    const values = cfg.pivot_values.map((item, i) => (i === index ? { ...item, ...patchValue } : item));
    patchRowToColumn({ pivot_values: values });
}
const __VLS_exposed = { ensureCcMaster, ccNameOptions };
defineExpose(__VLS_exposed);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['reshape-line']} */ ;
/** @type {__VLS_StyleScopedClasses['reshape-label']} */ ;
/** @type {__VLS_StyleScopedClasses['tip-block']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "reshape-config" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "reshape-head" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "reshape-title" },
});
const __VLS_0 = {}.ElTooltip;
/** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    placement: "right",
    width: (420),
}));
const __VLS_2 = __VLS_1({
    placement: "right",
    width: (420),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
{
    const { content: __VLS_thisSlot } = __VLS_3.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "tip-block" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
}
const __VLS_4 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
    ...{ class: "info-icon" },
}));
const __VLS_6 = __VLS_5({
    ...{ class: "info-icon" },
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
__VLS_7.slots.default;
const __VLS_8 = {}.InfoFilled;
/** @type {[typeof __VLS_components.InfoFilled, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({}));
const __VLS_10 = __VLS_9({}, ...__VLS_functionalComponentArgsRest(__VLS_9));
var __VLS_7;
var __VLS_3;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "reshape-subtitle" },
});
const __VLS_12 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.transpose.enabled),
    activeText: "启用",
    inactiveText: "关闭",
}));
const __VLS_14 = __VLS_13({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.transpose.enabled),
    activeText: "启用",
    inactiveText: "关闭",
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
let __VLS_16;
let __VLS_17;
let __VLS_18;
const __VLS_19 = {
    'onUpdate:modelValue': ((v) => __VLS_ctx.patch({ enabled: v }))
};
var __VLS_15;
if (__VLS_ctx.transpose.enabled) {
    const __VLS_20 = {}.ElTabs;
    /** @type {[typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
        modelValue: (__VLS_ctx.activeTab),
        ...{ class: "reshape-tabs" },
    }));
    const __VLS_22 = __VLS_21({
        modelValue: (__VLS_ctx.activeTab),
        ...{ class: "reshape-tabs" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
    __VLS_23.slots.default;
    const __VLS_24 = {}.ElTabPane;
    /** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
        name: "remap",
    }));
    const __VLS_26 = __VLS_25({
        name: "remap",
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
    __VLS_27.slots.default;
    {
        const { label: __VLS_thisSlot } = __VLS_27.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "tab-label" },
        });
        const __VLS_28 = {}.ElTooltip;
        /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
        // @ts-ignore
        const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
            placement: "top",
            width: (360),
        }));
        const __VLS_30 = __VLS_29({
            placement: "top",
            width: (360),
        }, ...__VLS_functionalComponentArgsRest(__VLS_29));
        __VLS_31.slots.default;
        {
            const { content: __VLS_thisSlot } = __VLS_31.slots;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "tip-block" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        }
        const __VLS_32 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
            ...{ class: "tab-info-icon" },
        }));
        const __VLS_34 = __VLS_33({
            ...{ class: "tab-info-icon" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_33));
        __VLS_35.slots.default;
        const __VLS_36 = {}.InfoFilled;
        /** @type {[typeof __VLS_components.InfoFilled, ]} */ ;
        // @ts-ignore
        const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({}));
        const __VLS_38 = __VLS_37({}, ...__VLS_functionalComponentArgsRest(__VLS_37));
        var __VLS_35;
        var __VLS_31;
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "pane-note" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "switch-line" },
    });
    const __VLS_40 = {}.ElSwitch;
    /** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
    // @ts-ignore
    const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.transpose.drop_zero_measures),
        activeText: "删除全零度量列",
    }));
    const __VLS_42 = __VLS_41({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.transpose.drop_zero_measures),
        activeText: "删除全零度量列",
    }, ...__VLS_functionalComponentArgsRest(__VLS_41));
    let __VLS_44;
    let __VLS_45;
    let __VLS_46;
    const __VLS_47 = {
        'onUpdate:modelValue': ((v) => __VLS_ctx.patch({ drop_zero_measures: v }))
    };
    var __VLS_43;
    for (const [rule, ri] of __VLS_getVForSourceType((__VLS_ctx.transpose.rules))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (ri),
            ...{ class: "reshape-box" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "reshape-line" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "reshape-label" },
        });
        const __VLS_48 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
            modelValue: (rule.source_col),
            placeholder: "选要搬运的度量列",
            ...{ style: {} },
            filterable: true,
        }));
        const __VLS_50 = __VLS_49({
            modelValue: (rule.source_col),
            placeholder: "选要搬运的度量列",
            ...{ style: {} },
            filterable: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_49));
        __VLS_51.slots.default;
        for (const [c] of __VLS_getVForSourceType((__VLS_ctx.selectedMeasures))) {
            const __VLS_52 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
                key: (__VLS_ctx.instanceIdOf(c)),
                label: (__VLS_ctx.columnLabel(c)),
                value: (__VLS_ctx.instanceIdOf(c)),
            }));
            const __VLS_54 = __VLS_53({
                key: (__VLS_ctx.instanceIdOf(c)),
                label: (__VLS_ctx.columnLabel(c)),
                value: (__VLS_ctx.instanceIdOf(c)),
            }, ...__VLS_functionalComponentArgsRest(__VLS_53));
        }
        var __VLS_51;
        const __VLS_56 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
            ...{ 'onClick': {} },
            link: true,
            type: "danger",
            ...{ style: {} },
        }));
        const __VLS_58 = __VLS_57({
            ...{ 'onClick': {} },
            link: true,
            type: "danger",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_57));
        let __VLS_60;
        let __VLS_61;
        let __VLS_62;
        const __VLS_63 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.transpose.enabled))
                    return;
                __VLS_ctx.removeRule(ri);
            }
        };
        __VLS_59.slots.default;
        const __VLS_64 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({}));
        const __VLS_66 = __VLS_65({}, ...__VLS_functionalComponentArgsRest(__VLS_65));
        __VLS_67.slots.default;
        const __VLS_68 = {}.Delete;
        /** @type {[typeof __VLS_components.Delete, ]} */ ;
        // @ts-ignore
        const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({}));
        const __VLS_70 = __VLS_69({}, ...__VLS_functionalComponentArgsRest(__VLS_69));
        var __VLS_67;
        var __VLS_59;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "reshape-line align-top" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "reshape-label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "line-stack" },
        });
        for (const [d, di] of __VLS_getVForSourceType((rule.dims))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (di),
                ...{ class: "inline-controls" },
            });
            const __VLS_72 = {}.ElSelect;
            /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
            // @ts-ignore
            const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
                ...{ 'onChange': {} },
                modelValue: (d.dim),
                placeholder: "维度列",
                ...{ style: {} },
                filterable: true,
            }));
            const __VLS_74 = __VLS_73({
                ...{ 'onChange': {} },
                modelValue: (d.dim),
                placeholder: "维度列",
                ...{ style: {} },
                filterable: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_73));
            let __VLS_76;
            let __VLS_77;
            let __VLS_78;
            const __VLS_79 = {
                onChange: (...[$event]) => {
                    if (!(__VLS_ctx.transpose.enabled))
                        return;
                    __VLS_ctx.ensureCcMaster();
                }
            };
            __VLS_75.slots.default;
            for (const [c] of __VLS_getVForSourceType((__VLS_ctx.selectedDimensions))) {
                const __VLS_80 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
                    key: (__VLS_ctx.instanceIdOf(c)),
                    label: (__VLS_ctx.columnLabel(c)),
                    value: (__VLS_ctx.instanceIdOf(c)),
                }));
                const __VLS_82 = __VLS_81({
                    key: (__VLS_ctx.instanceIdOf(c)),
                    label: (__VLS_ctx.columnLabel(c)),
                    value: (__VLS_ctx.instanceIdOf(c)),
                }, ...__VLS_functionalComponentArgsRest(__VLS_81));
            }
            var __VLS_75;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "arrow" },
            });
            if (__VLS_ctx.tdimKind(d.dim) === 'name') {
                const __VLS_84 = {}.ElSelect;
                /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                // @ts-ignore
                const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
                    ...{ 'onVisibleChange': {} },
                    ...{ 'onChange': {} },
                    modelValue: (d.value),
                    filterable: true,
                    allowCreate: true,
                    defaultFirstOption: true,
                    reserveKeyword: (false),
                    placeholder: "选成本中心（带编码）或手填",
                    ...{ style: {} },
                }));
                const __VLS_86 = __VLS_85({
                    ...{ 'onVisibleChange': {} },
                    ...{ 'onChange': {} },
                    modelValue: (d.value),
                    filterable: true,
                    allowCreate: true,
                    defaultFirstOption: true,
                    reserveKeyword: (false),
                    placeholder: "选成本中心（带编码）或手填",
                    ...{ style: {} },
                }, ...__VLS_functionalComponentArgsRest(__VLS_85));
                let __VLS_88;
                let __VLS_89;
                let __VLS_90;
                const __VLS_91 = {
                    onVisibleChange: ((v) => v && __VLS_ctx.ensureCcMaster())
                };
                const __VLS_92 = {
                    onChange: (...[$event]) => {
                        if (!(__VLS_ctx.transpose.enabled))
                            return;
                        if (!(__VLS_ctx.tdimKind(d.dim) === 'name'))
                            return;
                        __VLS_ctx.onTransposeDimValue(rule, d);
                    }
                };
                __VLS_87.slots.default;
                for (const [o] of __VLS_getVForSourceType((__VLS_ctx.ccNameOptions))) {
                    const __VLS_93 = {}.ElOption;
                    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                    // @ts-ignore
                    const __VLS_94 = __VLS_asFunctionalComponent(__VLS_93, new __VLS_93({
                        key: (o.value),
                        label: (o.label),
                        value: (o.value),
                    }));
                    const __VLS_95 = __VLS_94({
                        key: (o.value),
                        label: (o.label),
                        value: (o.value),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_94));
                }
                var __VLS_87;
            }
            else if (__VLS_ctx.tdimKind(d.dim) === 'code') {
                const __VLS_97 = {}.ElSelect;
                /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                // @ts-ignore
                const __VLS_98 = __VLS_asFunctionalComponent(__VLS_97, new __VLS_97({
                    ...{ 'onVisibleChange': {} },
                    modelValue: (d.value),
                    filterable: true,
                    allowCreate: true,
                    defaultFirstOption: true,
                    reserveKeyword: (false),
                    placeholder: "选编码（带名称）或手填",
                    ...{ style: {} },
                }));
                const __VLS_99 = __VLS_98({
                    ...{ 'onVisibleChange': {} },
                    modelValue: (d.value),
                    filterable: true,
                    allowCreate: true,
                    defaultFirstOption: true,
                    reserveKeyword: (false),
                    placeholder: "选编码（带名称）或手填",
                    ...{ style: {} },
                }, ...__VLS_functionalComponentArgsRest(__VLS_98));
                let __VLS_101;
                let __VLS_102;
                let __VLS_103;
                const __VLS_104 = {
                    onVisibleChange: ((v) => v && __VLS_ctx.ensureCcMaster())
                };
                __VLS_100.slots.default;
                for (const [o] of __VLS_getVForSourceType((__VLS_ctx.ccCodeOptions))) {
                    const __VLS_105 = {}.ElOption;
                    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                    // @ts-ignore
                    const __VLS_106 = __VLS_asFunctionalComponent(__VLS_105, new __VLS_105({
                        key: (o.value),
                        label: (o.label),
                        value: (o.value),
                    }));
                    const __VLS_107 = __VLS_106({
                        key: (o.value),
                        label: (o.label),
                        value: (o.value),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_106));
                }
                var __VLS_100;
            }
            else {
                const __VLS_109 = {}.ElInput;
                /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                // @ts-ignore
                const __VLS_110 = __VLS_asFunctionalComponent(__VLS_109, new __VLS_109({
                    modelValue: (d.value),
                    placeholder: "新值，如：招聘",
                    ...{ style: {} },
                }));
                const __VLS_111 = __VLS_110({
                    modelValue: (d.value),
                    placeholder: "新值，如：招聘",
                    ...{ style: {} },
                }, ...__VLS_functionalComponentArgsRest(__VLS_110));
            }
            const __VLS_113 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_114 = __VLS_asFunctionalComponent(__VLS_113, new __VLS_113({
                ...{ 'onClick': {} },
                link: true,
                type: "danger",
                disabled: (rule.dims.length === 1),
            }));
            const __VLS_115 = __VLS_114({
                ...{ 'onClick': {} },
                link: true,
                type: "danger",
                disabled: (rule.dims.length === 1),
            }, ...__VLS_functionalComponentArgsRest(__VLS_114));
            let __VLS_117;
            let __VLS_118;
            let __VLS_119;
            const __VLS_120 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.transpose.enabled))
                        return;
                    __VLS_ctx.removeDimUpdate(ri, di);
                }
            };
            __VLS_116.slots.default;
            const __VLS_121 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_122 = __VLS_asFunctionalComponent(__VLS_121, new __VLS_121({}));
            const __VLS_123 = __VLS_122({}, ...__VLS_functionalComponentArgsRest(__VLS_122));
            __VLS_124.slots.default;
            const __VLS_125 = {}.Delete;
            /** @type {[typeof __VLS_components.Delete, ]} */ ;
            // @ts-ignore
            const __VLS_126 = __VLS_asFunctionalComponent(__VLS_125, new __VLS_125({}));
            const __VLS_127 = __VLS_126({}, ...__VLS_functionalComponentArgsRest(__VLS_126));
            var __VLS_124;
            var __VLS_116;
        }
        const __VLS_129 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_130 = __VLS_asFunctionalComponent(__VLS_129, new __VLS_129({
            ...{ 'onClick': {} },
            link: true,
            type: "primary",
            size: "small",
        }));
        const __VLS_131 = __VLS_130({
            ...{ 'onClick': {} },
            link: true,
            type: "primary",
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_130));
        let __VLS_133;
        let __VLS_134;
        let __VLS_135;
        const __VLS_136 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.transpose.enabled))
                    return;
                __VLS_ctx.addDimUpdate(ri);
            }
        };
        __VLS_132.slots.default;
        const __VLS_137 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_138 = __VLS_asFunctionalComponent(__VLS_137, new __VLS_137({
            ...{ style: {} },
        }));
        const __VLS_139 = __VLS_138({
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_138));
        __VLS_140.slots.default;
        const __VLS_141 = {}.Plus;
        /** @type {[typeof __VLS_components.Plus, ]} */ ;
        // @ts-ignore
        const __VLS_142 = __VLS_asFunctionalComponent(__VLS_141, new __VLS_141({}));
        const __VLS_143 = __VLS_142({}, ...__VLS_functionalComponentArgsRest(__VLS_142));
        var __VLS_140;
        var __VLS_132;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "reshape-line align-top" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "reshape-label" },
        });
        const __VLS_145 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_146 = __VLS_asFunctionalComponent(__VLS_145, new __VLS_145({
            modelValue: (rule.target_cols),
            multiple: true,
            placeholder: "源值写入这些度量列",
            ...{ style: {} },
            filterable: true,
        }));
        const __VLS_147 = __VLS_146({
            modelValue: (rule.target_cols),
            multiple: true,
            placeholder: "源值写入这些度量列",
            ...{ style: {} },
            filterable: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_146));
        __VLS_148.slots.default;
        for (const [c] of __VLS_getVForSourceType((__VLS_ctx.selectedMeasures))) {
            const __VLS_149 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_150 = __VLS_asFunctionalComponent(__VLS_149, new __VLS_149({
                key: (__VLS_ctx.instanceIdOf(c)),
                label: (__VLS_ctx.columnLabel(c)),
                value: (__VLS_ctx.instanceIdOf(c)),
            }));
            const __VLS_151 = __VLS_150({
                key: (__VLS_ctx.instanceIdOf(c)),
                label: (__VLS_ctx.columnLabel(c)),
                value: (__VLS_ctx.instanceIdOf(c)),
            }, ...__VLS_functionalComponentArgsRest(__VLS_150));
        }
        var __VLS_148;
    }
    const __VLS_153 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_154 = __VLS_asFunctionalComponent(__VLS_153, new __VLS_153({
        ...{ 'onClick': {} },
        link: true,
        type: "primary",
    }));
    const __VLS_155 = __VLS_154({
        ...{ 'onClick': {} },
        link: true,
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_154));
    let __VLS_157;
    let __VLS_158;
    let __VLS_159;
    const __VLS_160 = {
        onClick: (__VLS_ctx.addRule)
    };
    __VLS_156.slots.default;
    const __VLS_161 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_162 = __VLS_asFunctionalComponent(__VLS_161, new __VLS_161({
        ...{ style: {} },
    }));
    const __VLS_163 = __VLS_162({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_162));
    __VLS_164.slots.default;
    const __VLS_165 = {}.Plus;
    /** @type {[typeof __VLS_components.Plus, ]} */ ;
    // @ts-ignore
    const __VLS_166 = __VLS_asFunctionalComponent(__VLS_165, new __VLS_165({}));
    const __VLS_167 = __VLS_166({}, ...__VLS_functionalComponentArgsRest(__VLS_166));
    var __VLS_164;
    var __VLS_156;
    var __VLS_27;
    const __VLS_169 = {}.ElTabPane;
    /** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
    // @ts-ignore
    const __VLS_170 = __VLS_asFunctionalComponent(__VLS_169, new __VLS_169({
        name: "column-to-row",
    }));
    const __VLS_171 = __VLS_170({
        name: "column-to-row",
    }, ...__VLS_functionalComponentArgsRest(__VLS_170));
    __VLS_172.slots.default;
    {
        const { label: __VLS_thisSlot } = __VLS_172.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "tab-label" },
        });
        const __VLS_173 = {}.ElTooltip;
        /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
        // @ts-ignore
        const __VLS_174 = __VLS_asFunctionalComponent(__VLS_173, new __VLS_173({
            placement: "top",
            width: (380),
        }));
        const __VLS_175 = __VLS_174({
            placement: "top",
            width: (380),
        }, ...__VLS_functionalComponentArgsRest(__VLS_174));
        __VLS_176.slots.default;
        {
            const { content: __VLS_thisSlot } = __VLS_176.slots;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "tip-block" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        }
        const __VLS_177 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_178 = __VLS_asFunctionalComponent(__VLS_177, new __VLS_177({
            ...{ class: "tab-info-icon" },
        }));
        const __VLS_179 = __VLS_178({
            ...{ class: "tab-info-icon" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_178));
        __VLS_180.slots.default;
        const __VLS_181 = {}.InfoFilled;
        /** @type {[typeof __VLS_components.InfoFilled, ]} */ ;
        // @ts-ignore
        const __VLS_182 = __VLS_asFunctionalComponent(__VLS_181, new __VLS_181({}));
        const __VLS_183 = __VLS_182({}, ...__VLS_functionalComponentArgsRest(__VLS_182));
        var __VLS_180;
        var __VLS_176;
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "pane-note" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "reshape-box" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "reshape-line" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "reshape-label" },
    });
    const __VLS_185 = {}.ElSwitch;
    /** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
    // @ts-ignore
    const __VLS_186 = __VLS_asFunctionalComponent(__VLS_185, new __VLS_185({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: ((__VLS_ctx.transpose.column_to_row || __VLS_ctx.defaultColumnToRow()).enabled),
        activeText: "列转行",
        inactiveText: "关闭",
    }));
    const __VLS_187 = __VLS_186({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: ((__VLS_ctx.transpose.column_to_row || __VLS_ctx.defaultColumnToRow()).enabled),
        activeText: "列转行",
        inactiveText: "关闭",
    }, ...__VLS_functionalComponentArgsRest(__VLS_186));
    let __VLS_189;
    let __VLS_190;
    let __VLS_191;
    const __VLS_192 = {
        'onUpdate:modelValue': ((v) => __VLS_ctx.patchColumnToRow({ enabled: v }))
    };
    var __VLS_188;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "reshape-line align-top" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "reshape-label" },
    });
    const __VLS_193 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_194 = __VLS_asFunctionalComponent(__VLS_193, new __VLS_193({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: ((__VLS_ctx.transpose.column_to_row || __VLS_ctx.defaultColumnToRow()).source_cols),
        multiple: true,
        filterable: true,
        disabled: (!__VLS_ctx.columnToRowEnabled),
        placeholder: "选择要转成行的字段",
        ...{ style: {} },
    }));
    const __VLS_195 = __VLS_194({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: ((__VLS_ctx.transpose.column_to_row || __VLS_ctx.defaultColumnToRow()).source_cols),
        multiple: true,
        filterable: true,
        disabled: (!__VLS_ctx.columnToRowEnabled),
        placeholder: "选择要转成行的字段",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_194));
    let __VLS_197;
    let __VLS_198;
    let __VLS_199;
    const __VLS_200 = {
        'onUpdate:modelValue': ((v) => __VLS_ctx.patchColumnToRow({ source_cols: v }))
    };
    __VLS_196.slots.default;
    for (const [c] of __VLS_getVForSourceType((__VLS_ctx.allSelectedColumns))) {
        const __VLS_201 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_202 = __VLS_asFunctionalComponent(__VLS_201, new __VLS_201({
            key: (__VLS_ctx.instanceIdOf(c)),
            label: (__VLS_ctx.columnLabel(c)),
            value: (__VLS_ctx.instanceIdOf(c)),
        }));
        const __VLS_203 = __VLS_202({
            key: (__VLS_ctx.instanceIdOf(c)),
            label: (__VLS_ctx.columnLabel(c)),
            value: (__VLS_ctx.instanceIdOf(c)),
        }, ...__VLS_functionalComponentArgsRest(__VLS_202));
    }
    var __VLS_196;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "reshape-line align-top" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "reshape-label" },
    });
    const __VLS_205 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_206 = __VLS_asFunctionalComponent(__VLS_205, new __VLS_205({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: ((__VLS_ctx.transpose.column_to_row || __VLS_ctx.defaultColumnToRow()).group_by),
        multiple: true,
        filterable: true,
        clearable: true,
        disabled: (!__VLS_ctx.columnToRowEnabled),
        placeholder: "发生冲突时按这些维度合并；保留明细时可不选",
        ...{ style: {} },
    }));
    const __VLS_207 = __VLS_206({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: ((__VLS_ctx.transpose.column_to_row || __VLS_ctx.defaultColumnToRow()).group_by),
        multiple: true,
        filterable: true,
        clearable: true,
        disabled: (!__VLS_ctx.columnToRowEnabled),
        placeholder: "发生冲突时按这些维度合并；保留明细时可不选",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_206));
    let __VLS_209;
    let __VLS_210;
    let __VLS_211;
    const __VLS_212 = {
        'onUpdate:modelValue': ((v) => __VLS_ctx.patchColumnToRow({ group_by: v }))
    };
    __VLS_208.slots.default;
    for (const [c] of __VLS_getVForSourceType((__VLS_ctx.selectedDimensions))) {
        const __VLS_213 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_214 = __VLS_asFunctionalComponent(__VLS_213, new __VLS_213({
            key: (__VLS_ctx.instanceIdOf(c)),
            label: (__VLS_ctx.columnLabel(c)),
            value: (__VLS_ctx.instanceIdOf(c)),
        }));
        const __VLS_215 = __VLS_214({
            key: (__VLS_ctx.instanceIdOf(c)),
            label: (__VLS_ctx.columnLabel(c)),
            value: (__VLS_ctx.instanceIdOf(c)),
        }, ...__VLS_functionalComponentArgsRest(__VLS_214));
    }
    var __VLS_208;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "reshape-line" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "reshape-label" },
    });
    const __VLS_217 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_218 = __VLS_asFunctionalComponent(__VLS_217, new __VLS_217({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: ((__VLS_ctx.transpose.column_to_row || __VLS_ctx.defaultColumnToRow()).item_label),
        disabled: (!__VLS_ctx.columnToRowEnabled),
        placeholder: "项目列显示名",
        ...{ style: {} },
    }));
    const __VLS_219 = __VLS_218({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: ((__VLS_ctx.transpose.column_to_row || __VLS_ctx.defaultColumnToRow()).item_label),
        disabled: (!__VLS_ctx.columnToRowEnabled),
        placeholder: "项目列显示名",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_218));
    let __VLS_221;
    let __VLS_222;
    let __VLS_223;
    const __VLS_224 = {
        'onUpdate:modelValue': ((v) => __VLS_ctx.patchColumnToRow({ item_label: v }))
    };
    var __VLS_220;
    const __VLS_225 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_226 = __VLS_asFunctionalComponent(__VLS_225, new __VLS_225({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: ((__VLS_ctx.transpose.column_to_row || __VLS_ctx.defaultColumnToRow()).value_label),
        disabled: (!__VLS_ctx.columnToRowEnabled),
        placeholder: "值列显示名",
        ...{ style: {} },
    }));
    const __VLS_227 = __VLS_226({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: ((__VLS_ctx.transpose.column_to_row || __VLS_ctx.defaultColumnToRow()).value_label),
        disabled: (!__VLS_ctx.columnToRowEnabled),
        placeholder: "值列显示名",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_226));
    let __VLS_229;
    let __VLS_230;
    let __VLS_231;
    const __VLS_232 = {
        'onUpdate:modelValue': ((v) => __VLS_ctx.patchColumnToRow({ value_label: v }))
    };
    var __VLS_228;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "reshape-line" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "reshape-label" },
    });
    const __VLS_233 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_234 = __VLS_asFunctionalComponent(__VLS_233, new __VLS_233({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: ((__VLS_ctx.transpose.column_to_row || __VLS_ctx.defaultColumnToRow()).conflict_strategy),
        disabled: (!__VLS_ctx.columnToRowEnabled),
        ...{ style: {} },
    }));
    const __VLS_235 = __VLS_234({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: ((__VLS_ctx.transpose.column_to_row || __VLS_ctx.defaultColumnToRow()).conflict_strategy),
        disabled: (!__VLS_ctx.columnToRowEnabled),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_234));
    let __VLS_237;
    let __VLS_238;
    let __VLS_239;
    const __VLS_240 = {
        'onUpdate:modelValue': ((v) => __VLS_ctx.patchColumnToRow({ conflict_strategy: v }))
    };
    __VLS_236.slots.default;
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.columnToRowConflictOptions))) {
        const __VLS_241 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_242 = __VLS_asFunctionalComponent(__VLS_241, new __VLS_241({
            key: (item.value),
            label: (item.label),
            value: (item.value),
        }));
        const __VLS_243 = __VLS_242({
            key: (item.value),
            label: (item.label),
            value: (item.value),
        }, ...__VLS_functionalComponentArgsRest(__VLS_242));
    }
    var __VLS_236;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "field-hint" },
    });
    var __VLS_172;
    const __VLS_245 = {}.ElTabPane;
    /** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
    // @ts-ignore
    const __VLS_246 = __VLS_asFunctionalComponent(__VLS_245, new __VLS_245({
        name: "row-to-column",
    }));
    const __VLS_247 = __VLS_246({
        name: "row-to-column",
    }, ...__VLS_functionalComponentArgsRest(__VLS_246));
    __VLS_248.slots.default;
    {
        const { label: __VLS_thisSlot } = __VLS_248.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "tab-label" },
        });
        const __VLS_249 = {}.ElTooltip;
        /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
        // @ts-ignore
        const __VLS_250 = __VLS_asFunctionalComponent(__VLS_249, new __VLS_249({
            placement: "top",
            width: (380),
        }));
        const __VLS_251 = __VLS_250({
            placement: "top",
            width: (380),
        }, ...__VLS_functionalComponentArgsRest(__VLS_250));
        __VLS_252.slots.default;
        {
            const { content: __VLS_thisSlot } = __VLS_252.slots;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "tip-block" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        }
        const __VLS_253 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_254 = __VLS_asFunctionalComponent(__VLS_253, new __VLS_253({
            ...{ class: "tab-info-icon" },
        }));
        const __VLS_255 = __VLS_254({
            ...{ class: "tab-info-icon" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_254));
        __VLS_256.slots.default;
        const __VLS_257 = {}.InfoFilled;
        /** @type {[typeof __VLS_components.InfoFilled, ]} */ ;
        // @ts-ignore
        const __VLS_258 = __VLS_asFunctionalComponent(__VLS_257, new __VLS_257({}));
        const __VLS_259 = __VLS_258({}, ...__VLS_functionalComponentArgsRest(__VLS_258));
        var __VLS_256;
        var __VLS_252;
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "pane-note" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "reshape-box" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "reshape-line" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "reshape-label" },
    });
    const __VLS_261 = {}.ElSwitch;
    /** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
    // @ts-ignore
    const __VLS_262 = __VLS_asFunctionalComponent(__VLS_261, new __VLS_261({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: ((__VLS_ctx.transpose.row_to_column || __VLS_ctx.defaultRowToColumn()).enabled),
        activeText: "行转列",
        inactiveText: "关闭",
    }));
    const __VLS_263 = __VLS_262({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: ((__VLS_ctx.transpose.row_to_column || __VLS_ctx.defaultRowToColumn()).enabled),
        activeText: "行转列",
        inactiveText: "关闭",
    }, ...__VLS_functionalComponentArgsRest(__VLS_262));
    let __VLS_265;
    let __VLS_266;
    let __VLS_267;
    const __VLS_268 = {
        'onUpdate:modelValue': ((v) => __VLS_ctx.patchRowToColumn({ enabled: v }))
    };
    var __VLS_264;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "reshape-line align-top" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "reshape-label" },
    });
    const __VLS_269 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_270 = __VLS_asFunctionalComponent(__VLS_269, new __VLS_269({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: ((__VLS_ctx.transpose.row_to_column || __VLS_ctx.defaultRowToColumn()).group_by),
        multiple: true,
        filterable: true,
        disabled: (!__VLS_ctx.rowToColumnEnabled),
        placeholder: "选择保留为行的维度",
        ...{ style: {} },
    }));
    const __VLS_271 = __VLS_270({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: ((__VLS_ctx.transpose.row_to_column || __VLS_ctx.defaultRowToColumn()).group_by),
        multiple: true,
        filterable: true,
        disabled: (!__VLS_ctx.rowToColumnEnabled),
        placeholder: "选择保留为行的维度",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_270));
    let __VLS_273;
    let __VLS_274;
    let __VLS_275;
    const __VLS_276 = {
        'onUpdate:modelValue': ((v) => __VLS_ctx.patchRowToColumn({ group_by: v }))
    };
    __VLS_272.slots.default;
    for (const [c] of __VLS_getVForSourceType((__VLS_ctx.selectedDimensions))) {
        const __VLS_277 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_278 = __VLS_asFunctionalComponent(__VLS_277, new __VLS_277({
            key: (__VLS_ctx.instanceIdOf(c)),
            label: (__VLS_ctx.columnLabel(c)),
            value: (__VLS_ctx.instanceIdOf(c)),
        }));
        const __VLS_279 = __VLS_278({
            key: (__VLS_ctx.instanceIdOf(c)),
            label: (__VLS_ctx.columnLabel(c)),
            value: (__VLS_ctx.instanceIdOf(c)),
        }, ...__VLS_functionalComponentArgsRest(__VLS_278));
    }
    var __VLS_272;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "reshape-line" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "reshape-label" },
    });
    const __VLS_281 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_282 = __VLS_asFunctionalComponent(__VLS_281, new __VLS_281({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: ((__VLS_ctx.transpose.row_to_column || __VLS_ctx.defaultRowToColumn()).pivot_col),
        filterable: true,
        disabled: (!__VLS_ctx.rowToColumnEnabled),
        placeholder: "其取值会变成列",
        ...{ style: {} },
    }));
    const __VLS_283 = __VLS_282({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: ((__VLS_ctx.transpose.row_to_column || __VLS_ctx.defaultRowToColumn()).pivot_col),
        filterable: true,
        disabled: (!__VLS_ctx.rowToColumnEnabled),
        placeholder: "其取值会变成列",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_282));
    let __VLS_285;
    let __VLS_286;
    let __VLS_287;
    const __VLS_288 = {
        'onUpdate:modelValue': ((v) => __VLS_ctx.patchRowToColumn({ pivot_col: v }))
    };
    __VLS_284.slots.default;
    for (const [c] of __VLS_getVForSourceType((__VLS_ctx.allSelectedColumns))) {
        const __VLS_289 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_290 = __VLS_asFunctionalComponent(__VLS_289, new __VLS_289({
            key: (__VLS_ctx.instanceIdOf(c)),
            label: (__VLS_ctx.columnLabel(c)),
            value: (__VLS_ctx.instanceIdOf(c)),
        }));
        const __VLS_291 = __VLS_290({
            key: (__VLS_ctx.instanceIdOf(c)),
            label: (__VLS_ctx.columnLabel(c)),
            value: (__VLS_ctx.instanceIdOf(c)),
        }, ...__VLS_functionalComponentArgsRest(__VLS_290));
    }
    var __VLS_284;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "reshape-label compact" },
    });
    const __VLS_293 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_294 = __VLS_asFunctionalComponent(__VLS_293, new __VLS_293({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: ((__VLS_ctx.transpose.row_to_column || __VLS_ctx.defaultRowToColumn()).value_col),
        filterable: true,
        disabled: (!__VLS_ctx.rowToColumnEnabled),
        placeholder: "写入单元格的值",
        ...{ style: {} },
    }));
    const __VLS_295 = __VLS_294({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: ((__VLS_ctx.transpose.row_to_column || __VLS_ctx.defaultRowToColumn()).value_col),
        filterable: true,
        disabled: (!__VLS_ctx.rowToColumnEnabled),
        placeholder: "写入单元格的值",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_294));
    let __VLS_297;
    let __VLS_298;
    let __VLS_299;
    const __VLS_300 = {
        'onUpdate:modelValue': ((v) => __VLS_ctx.patchRowToColumn({ value_col: v }))
    };
    __VLS_296.slots.default;
    for (const [c] of __VLS_getVForSourceType((__VLS_ctx.allSelectedColumns))) {
        const __VLS_301 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_302 = __VLS_asFunctionalComponent(__VLS_301, new __VLS_301({
            key: (__VLS_ctx.instanceIdOf(c)),
            label: (__VLS_ctx.columnLabel(c)),
            value: (__VLS_ctx.instanceIdOf(c)),
        }));
        const __VLS_303 = __VLS_302({
            key: (__VLS_ctx.instanceIdOf(c)),
            label: (__VLS_ctx.columnLabel(c)),
            value: (__VLS_ctx.instanceIdOf(c)),
        }, ...__VLS_functionalComponentArgsRest(__VLS_302));
    }
    var __VLS_296;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "reshape-line" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "reshape-label" },
    });
    const __VLS_305 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_306 = __VLS_asFunctionalComponent(__VLS_305, new __VLS_305({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: ((__VLS_ctx.transpose.row_to_column || __VLS_ctx.defaultRowToColumn()).fill_value),
        disabled: (!__VLS_ctx.rowToColumnEnabled),
        placeholder: "如：--",
        ...{ style: {} },
    }));
    const __VLS_307 = __VLS_306({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: ((__VLS_ctx.transpose.row_to_column || __VLS_ctx.defaultRowToColumn()).fill_value),
        disabled: (!__VLS_ctx.rowToColumnEnabled),
        placeholder: "如：--",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_306));
    let __VLS_309;
    let __VLS_310;
    let __VLS_311;
    const __VLS_312 = {
        'onUpdate:modelValue': ((v) => __VLS_ctx.patchRowToColumn({ fill_value: v }))
    };
    var __VLS_308;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "reshape-label compact" },
    });
    const __VLS_313 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_314 = __VLS_asFunctionalComponent(__VLS_313, new __VLS_313({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: ((__VLS_ctx.transpose.row_to_column || __VLS_ctx.defaultRowToColumn()).conflict_strategy),
        disabled: (!__VLS_ctx.rowToColumnEnabled),
        ...{ style: {} },
    }));
    const __VLS_315 = __VLS_314({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: ((__VLS_ctx.transpose.row_to_column || __VLS_ctx.defaultRowToColumn()).conflict_strategy),
        disabled: (!__VLS_ctx.rowToColumnEnabled),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_314));
    let __VLS_317;
    let __VLS_318;
    let __VLS_319;
    const __VLS_320 = {
        'onUpdate:modelValue': ((v) => __VLS_ctx.patchRowToColumn({ conflict_strategy: v }))
    };
    __VLS_316.slots.default;
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.conflictOptions))) {
        const __VLS_321 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_322 = __VLS_asFunctionalComponent(__VLS_321, new __VLS_321({
            key: (item.value),
            label: (item.label),
            value: (item.value),
        }));
        const __VLS_323 = __VLS_322({
            key: (item.value),
            label: (item.label),
            value: (item.value),
        }, ...__VLS_functionalComponentArgsRest(__VLS_322));
    }
    var __VLS_316;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "reshape-line align-top" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "reshape-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "line-stack" },
    });
    for (const [item, index] of __VLS_getVForSourceType(((__VLS_ctx.transpose.row_to_column || __VLS_ctx.defaultRowToColumn()).pivot_values))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (index),
            ...{ class: "inline-controls" },
        });
        const __VLS_325 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_326 = __VLS_asFunctionalComponent(__VLS_325, new __VLS_325({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (item.value),
            disabled: (!__VLS_ctx.rowToColumnEnabled),
            placeholder: "原始取值，如：第一季度",
            ...{ style: {} },
        }));
        const __VLS_327 = __VLS_326({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (item.value),
            disabled: (!__VLS_ctx.rowToColumnEnabled),
            placeholder: "原始取值，如：第一季度",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_326));
        let __VLS_329;
        let __VLS_330;
        let __VLS_331;
        const __VLS_332 = {
            'onUpdate:modelValue': ((v) => __VLS_ctx.updatePivotValue(index, { value: v }))
        };
        var __VLS_328;
        const __VLS_333 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_334 = __VLS_asFunctionalComponent(__VLS_333, new __VLS_333({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (item.label || ''),
            disabled: (!__VLS_ctx.rowToColumnEnabled),
            placeholder: "显示名，可不填",
            ...{ style: {} },
        }));
        const __VLS_335 = __VLS_334({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (item.label || ''),
            disabled: (!__VLS_ctx.rowToColumnEnabled),
            placeholder: "显示名，可不填",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_334));
        let __VLS_337;
        let __VLS_338;
        let __VLS_339;
        const __VLS_340 = {
            'onUpdate:modelValue': ((v) => __VLS_ctx.updatePivotValue(index, { label: v }))
        };
        var __VLS_336;
        const __VLS_341 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_342 = __VLS_asFunctionalComponent(__VLS_341, new __VLS_341({
            ...{ 'onClick': {} },
            link: true,
            type: "danger",
            disabled: (!__VLS_ctx.rowToColumnEnabled),
        }));
        const __VLS_343 = __VLS_342({
            ...{ 'onClick': {} },
            link: true,
            type: "danger",
            disabled: (!__VLS_ctx.rowToColumnEnabled),
        }, ...__VLS_functionalComponentArgsRest(__VLS_342));
        let __VLS_345;
        let __VLS_346;
        let __VLS_347;
        const __VLS_348 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.transpose.enabled))
                    return;
                __VLS_ctx.removePivotValue(index);
            }
        };
        __VLS_344.slots.default;
        const __VLS_349 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_350 = __VLS_asFunctionalComponent(__VLS_349, new __VLS_349({}));
        const __VLS_351 = __VLS_350({}, ...__VLS_functionalComponentArgsRest(__VLS_350));
        __VLS_352.slots.default;
        const __VLS_353 = {}.Delete;
        /** @type {[typeof __VLS_components.Delete, ]} */ ;
        // @ts-ignore
        const __VLS_354 = __VLS_asFunctionalComponent(__VLS_353, new __VLS_353({}));
        const __VLS_355 = __VLS_354({}, ...__VLS_functionalComponentArgsRest(__VLS_354));
        var __VLS_352;
        var __VLS_344;
    }
    const __VLS_357 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_358 = __VLS_asFunctionalComponent(__VLS_357, new __VLS_357({
        ...{ 'onClick': {} },
        link: true,
        type: "primary",
        size: "small",
        disabled: (!__VLS_ctx.rowToColumnEnabled),
    }));
    const __VLS_359 = __VLS_358({
        ...{ 'onClick': {} },
        link: true,
        type: "primary",
        size: "small",
        disabled: (!__VLS_ctx.rowToColumnEnabled),
    }, ...__VLS_functionalComponentArgsRest(__VLS_358));
    let __VLS_361;
    let __VLS_362;
    let __VLS_363;
    const __VLS_364 = {
        onClick: (__VLS_ctx.addPivotValue)
    };
    __VLS_360.slots.default;
    const __VLS_365 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_366 = __VLS_asFunctionalComponent(__VLS_365, new __VLS_365({
        ...{ style: {} },
    }));
    const __VLS_367 = __VLS_366({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_366));
    __VLS_368.slots.default;
    const __VLS_369 = {}.Plus;
    /** @type {[typeof __VLS_components.Plus, ]} */ ;
    // @ts-ignore
    const __VLS_370 = __VLS_asFunctionalComponent(__VLS_369, new __VLS_369({}));
    const __VLS_371 = __VLS_370({}, ...__VLS_functionalComponentArgsRest(__VLS_370));
    var __VLS_368;
    var __VLS_360;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "field-hint" },
    });
    var __VLS_248;
    var __VLS_23;
    if (!__VLS_ctx.selectedMeasures.length || !__VLS_ctx.selectedDimensions.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "warning-text" },
        });
    }
}
/** @type {__VLS_StyleScopedClasses['reshape-config']} */ ;
/** @type {__VLS_StyleScopedClasses['reshape-head']} */ ;
/** @type {__VLS_StyleScopedClasses['reshape-title']} */ ;
/** @type {__VLS_StyleScopedClasses['tip-block']} */ ;
/** @type {__VLS_StyleScopedClasses['info-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['reshape-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['reshape-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-label']} */ ;
/** @type {__VLS_StyleScopedClasses['tip-block']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-info-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['pane-note']} */ ;
/** @type {__VLS_StyleScopedClasses['switch-line']} */ ;
/** @type {__VLS_StyleScopedClasses['reshape-box']} */ ;
/** @type {__VLS_StyleScopedClasses['reshape-line']} */ ;
/** @type {__VLS_StyleScopedClasses['reshape-label']} */ ;
/** @type {__VLS_StyleScopedClasses['reshape-line']} */ ;
/** @type {__VLS_StyleScopedClasses['align-top']} */ ;
/** @type {__VLS_StyleScopedClasses['reshape-label']} */ ;
/** @type {__VLS_StyleScopedClasses['line-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['inline-controls']} */ ;
/** @type {__VLS_StyleScopedClasses['arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['reshape-line']} */ ;
/** @type {__VLS_StyleScopedClasses['align-top']} */ ;
/** @type {__VLS_StyleScopedClasses['reshape-label']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-label']} */ ;
/** @type {__VLS_StyleScopedClasses['tip-block']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-info-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['pane-note']} */ ;
/** @type {__VLS_StyleScopedClasses['reshape-box']} */ ;
/** @type {__VLS_StyleScopedClasses['reshape-line']} */ ;
/** @type {__VLS_StyleScopedClasses['reshape-label']} */ ;
/** @type {__VLS_StyleScopedClasses['reshape-line']} */ ;
/** @type {__VLS_StyleScopedClasses['align-top']} */ ;
/** @type {__VLS_StyleScopedClasses['reshape-label']} */ ;
/** @type {__VLS_StyleScopedClasses['reshape-line']} */ ;
/** @type {__VLS_StyleScopedClasses['align-top']} */ ;
/** @type {__VLS_StyleScopedClasses['reshape-label']} */ ;
/** @type {__VLS_StyleScopedClasses['reshape-line']} */ ;
/** @type {__VLS_StyleScopedClasses['reshape-label']} */ ;
/** @type {__VLS_StyleScopedClasses['reshape-line']} */ ;
/** @type {__VLS_StyleScopedClasses['reshape-label']} */ ;
/** @type {__VLS_StyleScopedClasses['field-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-label']} */ ;
/** @type {__VLS_StyleScopedClasses['tip-block']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-info-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['pane-note']} */ ;
/** @type {__VLS_StyleScopedClasses['reshape-box']} */ ;
/** @type {__VLS_StyleScopedClasses['reshape-line']} */ ;
/** @type {__VLS_StyleScopedClasses['reshape-label']} */ ;
/** @type {__VLS_StyleScopedClasses['reshape-line']} */ ;
/** @type {__VLS_StyleScopedClasses['align-top']} */ ;
/** @type {__VLS_StyleScopedClasses['reshape-label']} */ ;
/** @type {__VLS_StyleScopedClasses['reshape-line']} */ ;
/** @type {__VLS_StyleScopedClasses['reshape-label']} */ ;
/** @type {__VLS_StyleScopedClasses['reshape-label']} */ ;
/** @type {__VLS_StyleScopedClasses['compact']} */ ;
/** @type {__VLS_StyleScopedClasses['reshape-line']} */ ;
/** @type {__VLS_StyleScopedClasses['reshape-label']} */ ;
/** @type {__VLS_StyleScopedClasses['reshape-label']} */ ;
/** @type {__VLS_StyleScopedClasses['compact']} */ ;
/** @type {__VLS_StyleScopedClasses['reshape-line']} */ ;
/** @type {__VLS_StyleScopedClasses['align-top']} */ ;
/** @type {__VLS_StyleScopedClasses['reshape-label']} */ ;
/** @type {__VLS_StyleScopedClasses['line-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['inline-controls']} */ ;
/** @type {__VLS_StyleScopedClasses['field-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['warning-text']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Delete: Delete,
            InfoFilled: InfoFilled,
            Plus: Plus,
            ccNameOptions: ccNameOptions,
            ccCodeOptions: ccCodeOptions,
            allSelectedColumns: allSelectedColumns,
            instanceIdOf: instanceIdOf,
            columnLabel: columnLabel,
            activeTab: activeTab,
            conflictOptions: conflictOptions,
            columnToRowConflictOptions: columnToRowConflictOptions,
            defaultColumnToRow: defaultColumnToRow,
            defaultRowToColumn: defaultRowToColumn,
            columnToRowEnabled: columnToRowEnabled,
            rowToColumnEnabled: rowToColumnEnabled,
            ensureCcMaster: ensureCcMaster,
            tdimKind: tdimKind,
            onTransposeDimValue: onTransposeDimValue,
            patch: patch,
            patchColumnToRow: patchColumnToRow,
            patchRowToColumn: patchRowToColumn,
            addRule: addRule,
            removeRule: removeRule,
            addDimUpdate: addDimUpdate,
            removeDimUpdate: removeDimUpdate,
            addPivotValue: addPivotValue,
            removePivotValue: removePivotValue,
            updatePivotValue: updatePivotValue,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {
            ...__VLS_exposed,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
