/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, ref } from 'vue';
import { Plus, Delete, View, Hide, Lock, Unlock } from '@element-plus/icons-vue';
import { dataApi } from '@/api/data';
const props = withDefaults(defineProps(), {
    // 主报表筛选默认显示“查看页显示/锁定”；指标筛选等场景可显式传 false
    showViewControls: true,
});
const emit = defineEmits();
const FILTER_OPS = [
    { value: 'eq', label: '等于' },
    { value: 'neq', label: '不等于' },
    { value: 'contains', label: '包含' },
    { value: 'gt', label: '大于' },
    { value: 'gte', label: '≥' },
    { value: 'lt', label: '小于' },
    { value: 'lte', label: '≤' },
    { value: 'between', label: '介于' },
    { value: 'in', label: '属于' },
    { value: 'is_null', label: '为空' },
    { value: 'is_not_null', label: '非空' },
];
const NAME_FIELDS = ['dimension_value', 'name'];
const distinctCache = ref(new Map());
const distinctLoading = ref(new Set());
const logicMode = computed(() => props.filterLogic?.mode || 'and');
const logicExpression = computed(() => props.filterLogic?.expression || '');
function filterLabel(index) {
    let n = index;
    const chars = [];
    do {
        chars.unshift(String.fromCharCode(65 + (n % 26)));
        n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return chars.join('');
}
function colInfo(qual) {
    return props.allColumns.find((c) => c.code === qual);
}
function resolveTableColumn(qual) {
    const dot = qual.indexOf('.');
    if (dot < 0 || !props.currentDatasetTables)
        return null;
    const alias = qual.slice(0, dot);
    const column = qual.slice(dot + 1);
    const t = props.currentDatasetTables.find((x) => x.alias === alias);
    return t ? { table: t.table_name, column } : null;
}
function useValueDropdown(f) {
    if (!['eq', 'neq', 'in'].includes(f.op))
        return false;
    const ci = colInfo(f.column);
    return !!ci && ci.agg_role !== 'measure';
}
function tailCode(qual) {
    const i = qual.indexOf('.');
    return i < 0 ? qual : qual.slice(i + 1);
}
async function ensureOptions(qual) {
    if (!qual || distinctCache.value.has(qual) || distinctLoading.value.has(qual))
        return;
    const rc = resolveTableColumn(qual);
    if (!rc)
        return;
    distinctLoading.value.add(qual);
    try {
        const wantExtra = NAME_FIELDS.includes(tailCode(qual));
        const rows = await dataApi.distinct(rc.table, rc.column, wantExtra ? 'code' : undefined);
        const opts = rows.map((r) => ({
            value: r.value,
            label: wantExtra && r.extra ? `${r.value} (${r.extra})` : r.value,
        }));
        distinctCache.value.set(qual, opts);
    }
    catch {
        distinctCache.value.set(qual, []);
    }
    finally {
        distinctLoading.value.delete(qual);
    }
}
function optionsFor(qual) {
    return distinctCache.value.get(qual) || [];
}
function valueRequiresArray(op) {
    return op === 'between' || op === 'in';
}
function valueDisabled(op) {
    return op === 'is_null' || op === 'is_not_null';
}
function patchFilter(index, patch) {
    emit('update:filters', props.filters.map((item, i) => (i === index ? { ...item, ...patch } : item)));
}
function onFilterOpChange(index, op) {
    const current = props.filters[index];
    if (!current)
        return;
    let value = current.value;
    if (valueDisabled(op)) {
        value = null;
    }
    else if (op === 'in') {
        value = Array.isArray(value)
            ? value
            : typeof value === 'string' && value
                ? value.split(',').map((part) => part.trim()).filter(Boolean)
                : [];
    }
    else if (Array.isArray(value)) {
        value = value.join(',');
    }
    else if (value == null) {
        value = '';
    }
    patchFilter(index, { op, value });
}
function onFilterColumnChange(index, column) {
    const current = props.filters[index];
    if (!current)
        return;
    const value = current.op === 'in' ? [] : valueDisabled(current.op) ? null : '';
    patchFilter(index, { column, value });
    ensureOptions(column);
}
function onFilterValueChange(index, value) {
    patchFilter(index, { value });
}
function onFilterVisibleChange(index, visible) {
    patchFilter(index, { visible, locked: visible ? props.filters[index]?.locked ?? false : false });
}
function onFilterLockedChange(index, locked) {
    patchFilter(index, { locked });
}
function addFilter() {
    emit('update:filters', [...props.filters, { column: '', op: 'eq', value: '', visible: true, locked: false }]);
}
function removeFilter(i) {
    const next = [...props.filters];
    next.splice(i, 1);
    emit('update:filters', next);
}
function setLogicMode(mode) {
    emit('update:filterLogic', mode === 'custom' ? { mode, expression: logicExpression.value } : null);
}
function setLogicExpression(expression) {
    emit('update:filterLogic', { mode: 'custom', expression });
}
const __VLS_exposed = { clearCache: () => { distinctCache.value = new Map(); } };
defineExpose(__VLS_exposed);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    // 主报表筛选默认显示“查看页显示/锁定”；指标筛选等场景可显式传 false
    showViewControls: true,
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['lock-toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['lock-toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['el-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-row']} */ ;
/** @type {__VLS_StyleScopedClasses['is-compact']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-label']} */ ;
/** @type {__VLS_StyleScopedClasses['is-compact']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-column-select']} */ ;
/** @type {__VLS_StyleScopedClasses['is-compact']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-op-select']} */ ;
/** @type {__VLS_StyleScopedClasses['is-compact']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-value-control']} */ ;
/** @type {__VLS_StyleScopedClasses['is-compact']} */ ;
/** @type {__VLS_StyleScopedClasses['logic-row']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: ({ 'is-compact': __VLS_ctx.compact }) },
});
for (const [f, i] of __VLS_getVForSourceType((__VLS_ctx.filters))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (i),
        ...{ class: "rule-row" },
    });
    const __VLS_0 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        ...{ class: "rule-label" },
        effect: "plain",
    }));
    const __VLS_2 = __VLS_1({
        ...{ class: "rule-label" },
        effect: "plain",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_3.slots.default;
    (__VLS_ctx.filterLabel(i));
    var __VLS_3;
    const __VLS_4 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (f.column),
        placeholder: "字段",
        ...{ class: "filter-column-select" },
        filterable: true,
    }));
    const __VLS_6 = __VLS_5({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (f.column),
        placeholder: "字段",
        ...{ class: "filter-column-select" },
        filterable: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    let __VLS_8;
    let __VLS_9;
    let __VLS_10;
    const __VLS_11 = {
        'onUpdate:modelValue': ((value) => __VLS_ctx.onFilterColumnChange(i, value))
    };
    __VLS_7.slots.default;
    const __VLS_12 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
        label: "全部",
        value: "",
    }));
    const __VLS_14 = __VLS_13({
        label: "全部",
        value: "",
    }, ...__VLS_functionalComponentArgsRest(__VLS_13));
    for (const [c] of __VLS_getVForSourceType((__VLS_ctx.allColumns))) {
        const __VLS_16 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
            key: (c.code),
            label: (c.label),
            value: (c.code),
        }));
        const __VLS_18 = __VLS_17({
            key: (c.code),
            label: (c.label),
            value: (c.code),
        }, ...__VLS_functionalComponentArgsRest(__VLS_17));
    }
    var __VLS_7;
    const __VLS_20 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (f.op),
        ...{ class: "filter-op-select" },
    }));
    const __VLS_22 = __VLS_21({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (f.op),
        ...{ class: "filter-op-select" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
    let __VLS_24;
    let __VLS_25;
    let __VLS_26;
    const __VLS_27 = {
        'onUpdate:modelValue': ((op) => __VLS_ctx.onFilterOpChange(i, op))
    };
    __VLS_23.slots.default;
    for (const [o] of __VLS_getVForSourceType((__VLS_ctx.FILTER_OPS))) {
        const __VLS_28 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
            key: (o.value),
            label: (o.label),
            value: (o.value),
        }));
        const __VLS_30 = __VLS_29({
            key: (o.value),
            label: (o.label),
            value: (o.value),
        }, ...__VLS_functionalComponentArgsRest(__VLS_29));
    }
    var __VLS_23;
    if (__VLS_ctx.useValueDropdown(f)) {
        const __VLS_32 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
            ...{ 'onUpdate:modelValue': {} },
            ...{ 'onVisibleChange': {} },
            modelValue: (f.value),
            multiple: (f.op === 'in'),
            filterable: true,
            allowCreate: true,
            defaultFirstOption: true,
            reserveKeyword: (false),
            placeholder: "选择或输入值",
            ...{ class: "filter-value-control" },
        }));
        const __VLS_34 = __VLS_33({
            ...{ 'onUpdate:modelValue': {} },
            ...{ 'onVisibleChange': {} },
            modelValue: (f.value),
            multiple: (f.op === 'in'),
            filterable: true,
            allowCreate: true,
            defaultFirstOption: true,
            reserveKeyword: (false),
            placeholder: "选择或输入值",
            ...{ class: "filter-value-control" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_33));
        let __VLS_36;
        let __VLS_37;
        let __VLS_38;
        const __VLS_39 = {
            'onUpdate:modelValue': ((value) => __VLS_ctx.onFilterValueChange(i, value))
        };
        const __VLS_40 = {
            onVisibleChange: ((v) => v && __VLS_ctx.ensureOptions(f.column))
        };
        __VLS_35.slots.default;
        for (const [o] of __VLS_getVForSourceType((__VLS_ctx.optionsFor(f.column)))) {
            const __VLS_41 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_42 = __VLS_asFunctionalComponent(__VLS_41, new __VLS_41({
                key: (o.value),
                label: (o.label),
                value: (o.value),
            }));
            const __VLS_43 = __VLS_42({
                key: (o.value),
                label: (o.label),
                value: (o.value),
            }, ...__VLS_functionalComponentArgsRest(__VLS_42));
        }
        var __VLS_35;
    }
    else {
        const __VLS_45 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_46 = __VLS_asFunctionalComponent(__VLS_45, new __VLS_45({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (f.value),
            placeholder: (__VLS_ctx.valueRequiresArray(f.op) ? '多个值用逗号分隔' : '值'),
            disabled: (__VLS_ctx.valueDisabled(f.op)),
            ...{ class: "filter-value-control" },
        }));
        const __VLS_47 = __VLS_46({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (f.value),
            placeholder: (__VLS_ctx.valueRequiresArray(f.op) ? '多个值用逗号分隔' : '值'),
            disabled: (__VLS_ctx.valueDisabled(f.op)),
            ...{ class: "filter-value-control" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_46));
        let __VLS_49;
        let __VLS_50;
        let __VLS_51;
        const __VLS_52 = {
            'onUpdate:modelValue': ((value) => __VLS_ctx.onFilterValueChange(i, value))
        };
        var __VLS_48;
    }
    const __VLS_53 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_54 = __VLS_asFunctionalComponent(__VLS_53, new __VLS_53({
        ...{ 'onClick': {} },
        link: true,
        type: "danger",
    }));
    const __VLS_55 = __VLS_54({
        ...{ 'onClick': {} },
        link: true,
        type: "danger",
    }, ...__VLS_functionalComponentArgsRest(__VLS_54));
    let __VLS_57;
    let __VLS_58;
    let __VLS_59;
    const __VLS_60 = {
        onClick: (...[$event]) => {
            __VLS_ctx.removeFilter(i);
        }
    };
    __VLS_56.slots.default;
    const __VLS_61 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_62 = __VLS_asFunctionalComponent(__VLS_61, new __VLS_61({}));
    const __VLS_63 = __VLS_62({}, ...__VLS_functionalComponentArgsRest(__VLS_62));
    __VLS_64.slots.default;
    const __VLS_65 = {}.Delete;
    /** @type {[typeof __VLS_components.Delete, ]} */ ;
    // @ts-ignore
    const __VLS_66 = __VLS_asFunctionalComponent(__VLS_65, new __VLS_65({}));
    const __VLS_67 = __VLS_66({}, ...__VLS_functionalComponentArgsRest(__VLS_66));
    var __VLS_64;
    var __VLS_56;
    if (__VLS_ctx.showViewControls !== false) {
        const __VLS_69 = {}.ElTooltip;
        /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
        // @ts-ignore
        const __VLS_70 = __VLS_asFunctionalComponent(__VLS_69, new __VLS_69({
            content: (f.visible === false ? '查看页不显示' : '查看页显示'),
            placement: "top",
        }));
        const __VLS_71 = __VLS_70({
            content: (f.visible === false ? '查看页不显示' : '查看页显示'),
            placement: "top",
        }, ...__VLS_functionalComponentArgsRest(__VLS_70));
        __VLS_72.slots.default;
        const __VLS_73 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_74 = __VLS_asFunctionalComponent(__VLS_73, new __VLS_73({
            ...{ 'onClick': {} },
            link: true,
            type: (f.visible === false ? 'info' : 'primary'),
        }));
        const __VLS_75 = __VLS_74({
            ...{ 'onClick': {} },
            link: true,
            type: (f.visible === false ? 'info' : 'primary'),
        }, ...__VLS_functionalComponentArgsRest(__VLS_74));
        let __VLS_77;
        let __VLS_78;
        let __VLS_79;
        const __VLS_80 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.showViewControls !== false))
                    return;
                __VLS_ctx.onFilterVisibleChange(i, f.visible === false);
            }
        };
        __VLS_76.slots.default;
        const __VLS_81 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_82 = __VLS_asFunctionalComponent(__VLS_81, new __VLS_81({}));
        const __VLS_83 = __VLS_82({}, ...__VLS_functionalComponentArgsRest(__VLS_82));
        __VLS_84.slots.default;
        const __VLS_85 = ((f.visible === false ? __VLS_ctx.Hide : __VLS_ctx.View));
        // @ts-ignore
        const __VLS_86 = __VLS_asFunctionalComponent(__VLS_85, new __VLS_85({}));
        const __VLS_87 = __VLS_86({}, ...__VLS_functionalComponentArgsRest(__VLS_86));
        var __VLS_84;
        var __VLS_76;
        var __VLS_72;
        const __VLS_89 = {}.ElTooltip;
        /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
        // @ts-ignore
        const __VLS_90 = __VLS_asFunctionalComponent(__VLS_89, new __VLS_89({
            content: (f.locked ? '已锁定' : '未锁定'),
            placement: "top",
        }));
        const __VLS_91 = __VLS_90({
            content: (f.locked ? '已锁定' : '未锁定'),
            placement: "top",
        }, ...__VLS_functionalComponentArgsRest(__VLS_90));
        __VLS_92.slots.default;
        const __VLS_93 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_94 = __VLS_asFunctionalComponent(__VLS_93, new __VLS_93({
            ...{ 'onClick': {} },
            link: true,
            ...{ class: "lock-toggle" },
            type: (f.locked ? 'primary' : 'info'),
            disabled: (f.visible === false),
            'aria-label': (f.locked ? '已锁定' : '未锁定'),
        }));
        const __VLS_95 = __VLS_94({
            ...{ 'onClick': {} },
            link: true,
            ...{ class: "lock-toggle" },
            type: (f.locked ? 'primary' : 'info'),
            disabled: (f.visible === false),
            'aria-label': (f.locked ? '已锁定' : '未锁定'),
        }, ...__VLS_functionalComponentArgsRest(__VLS_94));
        let __VLS_97;
        let __VLS_98;
        let __VLS_99;
        const __VLS_100 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.showViewControls !== false))
                    return;
                __VLS_ctx.onFilterLockedChange(i, !(f.locked ?? false));
            }
        };
        __VLS_96.slots.default;
        const __VLS_101 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_102 = __VLS_asFunctionalComponent(__VLS_101, new __VLS_101({
            ...{ class: ({ 'is-locked': f.locked }) },
        }));
        const __VLS_103 = __VLS_102({
            ...{ class: ({ 'is-locked': f.locked }) },
        }, ...__VLS_functionalComponentArgsRest(__VLS_102));
        __VLS_104.slots.default;
        const __VLS_105 = ((f.locked ? __VLS_ctx.Lock : __VLS_ctx.Unlock));
        // @ts-ignore
        const __VLS_106 = __VLS_asFunctionalComponent(__VLS_105, new __VLS_105({}));
        const __VLS_107 = __VLS_106({}, ...__VLS_functionalComponentArgsRest(__VLS_106));
        var __VLS_104;
        var __VLS_96;
        var __VLS_92;
    }
}
if (__VLS_ctx.filters.length > 1) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "logic-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "logic-label" },
    });
    const __VLS_109 = {}.ElRadioGroup;
    /** @type {[typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, ]} */ ;
    // @ts-ignore
    const __VLS_110 = __VLS_asFunctionalComponent(__VLS_109, new __VLS_109({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.logicMode),
    }));
    const __VLS_111 = __VLS_110({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.logicMode),
    }, ...__VLS_functionalComponentArgsRest(__VLS_110));
    let __VLS_113;
    let __VLS_114;
    let __VLS_115;
    const __VLS_116 = {
        'onUpdate:modelValue': ((v) => __VLS_ctx.setLogicMode(v))
    };
    __VLS_112.slots.default;
    const __VLS_117 = {}.ElRadioButton;
    /** @type {[typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, ]} */ ;
    // @ts-ignore
    const __VLS_118 = __VLS_asFunctionalComponent(__VLS_117, new __VLS_117({
        value: "and",
    }));
    const __VLS_119 = __VLS_118({
        value: "and",
    }, ...__VLS_functionalComponentArgsRest(__VLS_118));
    __VLS_120.slots.default;
    var __VLS_120;
    const __VLS_121 = {}.ElRadioButton;
    /** @type {[typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, ]} */ ;
    // @ts-ignore
    const __VLS_122 = __VLS_asFunctionalComponent(__VLS_121, new __VLS_121({
        value: "custom",
    }));
    const __VLS_123 = __VLS_122({
        value: "custom",
    }, ...__VLS_functionalComponentArgsRest(__VLS_122));
    __VLS_124.slots.default;
    var __VLS_124;
    var __VLS_112;
    if (__VLS_ctx.logicMode === 'custom') {
        const __VLS_125 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_126 = __VLS_asFunctionalComponent(__VLS_125, new __VLS_125({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (__VLS_ctx.logicExpression),
            placeholder: "例如：(A AND B) OR C",
            ...{ style: {} },
        }));
        const __VLS_127 = __VLS_126({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (__VLS_ctx.logicExpression),
            placeholder: "例如：(A AND B) OR C",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_126));
        let __VLS_129;
        let __VLS_130;
        let __VLS_131;
        const __VLS_132 = {
            'onUpdate:modelValue': (__VLS_ctx.setLogicExpression)
        };
        var __VLS_128;
    }
}
const __VLS_133 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_134 = __VLS_asFunctionalComponent(__VLS_133, new __VLS_133({
    ...{ 'onClick': {} },
    link: true,
    type: "primary",
}));
const __VLS_135 = __VLS_134({
    ...{ 'onClick': {} },
    link: true,
    type: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_134));
let __VLS_137;
let __VLS_138;
let __VLS_139;
const __VLS_140 = {
    onClick: (__VLS_ctx.addFilter)
};
__VLS_136.slots.default;
const __VLS_141 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_142 = __VLS_asFunctionalComponent(__VLS_141, new __VLS_141({
    ...{ style: {} },
}));
const __VLS_143 = __VLS_142({
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_142));
__VLS_144.slots.default;
const __VLS_145 = {}.Plus;
/** @type {[typeof __VLS_components.Plus, ]} */ ;
// @ts-ignore
const __VLS_146 = __VLS_asFunctionalComponent(__VLS_145, new __VLS_145({}));
const __VLS_147 = __VLS_146({}, ...__VLS_functionalComponentArgsRest(__VLS_146));
var __VLS_144;
var __VLS_136;
/** @type {__VLS_StyleScopedClasses['rule-row']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-label']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-column-select']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-op-select']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-value-control']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-value-control']} */ ;
/** @type {__VLS_StyleScopedClasses['lock-toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['logic-row']} */ ;
/** @type {__VLS_StyleScopedClasses['logic-label']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Plus: Plus,
            Delete: Delete,
            View: View,
            Hide: Hide,
            Lock: Lock,
            Unlock: Unlock,
            FILTER_OPS: FILTER_OPS,
            logicMode: logicMode,
            logicExpression: logicExpression,
            filterLabel: filterLabel,
            useValueDropdown: useValueDropdown,
            ensureOptions: ensureOptions,
            optionsFor: optionsFor,
            valueRequiresArray: valueRequiresArray,
            valueDisabled: valueDisabled,
            onFilterOpChange: onFilterOpChange,
            onFilterColumnChange: onFilterColumnChange,
            onFilterValueChange: onFilterValueChange,
            onFilterVisibleChange: onFilterVisibleChange,
            onFilterLockedChange: onFilterLockedChange,
            addFilter: addFilter,
            removeFilter: removeFilter,
            setLogicMode: setLogicMode,
            setLogicExpression: setLogicExpression,
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
