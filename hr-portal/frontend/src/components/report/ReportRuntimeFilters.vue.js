import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { ArrowDown, Lock, RefreshLeft, Search, Setting } from '@element-plus/icons-vue';
import { dataApi } from '@/api/data';
const props = defineProps();
const emit = defineEmits();
const runtimeValues = reactive({});
const barRef = ref(null);
const availableWidth = ref(0);
const advancedVisible = ref(false);
const distinctCache = ref(new Map());
const distinctLoading = ref(new Set());
const visibleFilters = computed(() => props.filters
    .map((filter, index) => ({ filter, index }))
    .filter(({ filter }) => filter.visible !== false));
const customLogicActive = computed(() => props.filterLogic?.mode === 'custom' && !!props.filterLogic.expression?.trim());
const maxInlineCount = computed(() => {
    if (!availableWidth.value)
        return Math.min(visibleFilters.value.length, 4);
    const reserved = 150;
    const itemWidth = 170;
    return Math.max(1, Math.floor((availableWidth.value - reserved) / itemWidth));
});
const inlineFilters = computed(() => visibleFilters.value.slice(0, maxInlineCount.value));
const overflowFilters = computed(() => visibleFilters.value.slice(maxInlineCount.value));
let observer = null;
function opLabel(op) {
    const labels = {
        eq: '等于', neq: '不等于', contains: '包含', gt: '大于', gte: '大于等于',
        lt: '小于', lte: '小于等于', between: '介于', in: '属于', is_null: '为空', is_not_null: '非空',
    };
    return labels[op] || op;
}
function fieldLabel(column) {
    return props.columnLabels?.[column] || column;
}
function resolveTableColumn(qual) {
    if (!props.currentDatasetTables)
        return null;
    const dot = qual.indexOf('.');
    if (dot < 0)
        return null;
    const alias = qual.slice(0, dot);
    const column = qual.slice(dot + 1);
    const t = props.currentDatasetTables.find((x) => x.alias === alias);
    return t ? { table: t.table_name, column } : null;
}
function useValueDropdown(filter) {
    return ['eq', 'neq', 'in'].includes(filter.op) && !!resolveTableColumn(filter.column);
}
async function ensureOptions(qual) {
    if (!qual || distinctCache.value.has(qual) || distinctLoading.value.has(qual))
        return;
    const rc = resolveTableColumn(qual);
    if (!rc)
        return;
    distinctLoading.value.add(qual);
    try {
        const rows = await dataApi.distinct(rc.table, rc.column);
        distinctCache.value.set(qual, rows.map((r) => ({ value: r.value, label: r.value })));
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
function stringifyValue(value) {
    if (Array.isArray(value))
        return value.join(',');
    return value ?? '';
}
function resetValues() {
    for (const key of Object.keys(runtimeValues))
        delete runtimeValues[Number(key)];
    for (const { filter, index } of visibleFilters.value) {
        runtimeValues[index] = filter.op === 'in' && !Array.isArray(filter.value)
            ? String(filter.value || '').split(',').map((s) => s.trim()).filter(Boolean)
            : stringifyValue(filter.value);
    }
}
function normalizeValue(filter, value) {
    if (filter.op === 'is_null' || filter.op === 'is_not_null')
        return null;
    if (filter.op === 'between' || filter.op === 'in') {
        if (Array.isArray(value))
            return value;
        return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
    }
    return value;
}
function buildOverrides() {
    return visibleFilters.value
        .filter(({ filter }) => !filter.locked)
        .map(({ filter, index }) => ({
        __index: index,
        column: filter.column,
        op: filter.op,
        value: normalizeValue(filter, runtimeValues[index]),
    }));
}
function apply() {
    advancedVisible.value = false;
    emit('apply', buildOverrides());
}
function resetAndApply() {
    resetValues();
    apply();
}
function chipText(filter, index) {
    const raw = runtimeValues[index];
    const value = Array.isArray(raw) ? raw.join(',') : stringifyValue(raw);
    if (filter.op === 'is_null' || filter.op === 'is_not_null')
        return `${fieldLabel(filter.column)}：${opLabel(filter.op)}`;
    return `${fieldLabel(filter.column)}：${value || '全部'}`;
}
watch(() => props.filters, resetValues, { immediate: true, deep: true });
onMounted(() => {
    if (!barRef.value)
        return;
    observer = new ResizeObserver((entries) => {
        availableWidth.value = entries[0]?.contentRect.width || 0;
    });
    observer.observe(barRef.value);
});
onUnmounted(() => {
    observer?.disconnect();
});
const __VLS_exposed = { buildOverrides, resetValues };
defineExpose(__VLS_exposed);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['filter-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['advanced-label']} */ ;
/** @type {__VLS_StyleScopedClasses['runtime-filter-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-strip']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['advanced-row']} */ ;
// CSS variable injection 
// CSS variable injection end 
if (__VLS_ctx.visibleFilters.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ref: "barRef",
        ...{ class: "runtime-filter-bar" },
    });
    /** @type {typeof __VLS_ctx.barRef} */ ;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "filter-strip" },
    });
    for (const [{ filter, index }] of __VLS_getVForSourceType((__VLS_ctx.inlineFilters))) {
        const __VLS_0 = {}.ElPopover;
        /** @type {[typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, ]} */ ;
        // @ts-ignore
        const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
            key: (`${filter.column}-${index}`),
            trigger: "click",
            placement: "bottom-start",
            width: (280),
            disabled: (filter.locked),
        }));
        const __VLS_2 = __VLS_1({
            key: (`${filter.column}-${index}`),
            trigger: "click",
            placement: "bottom-start",
            width: (280),
            disabled: (filter.locked),
        }, ...__VLS_functionalComponentArgsRest(__VLS_1));
        __VLS_3.slots.default;
        {
            const { reference: __VLS_thisSlot } = __VLS_3.slots;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ class: "filter-chip" },
                ...{ class: ({ 'is-locked': filter.locked }) },
                type: "button",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "chip-text" },
            });
            (__VLS_ctx.chipText(filter, index));
            if (filter.locked) {
                const __VLS_4 = {}.ElIcon;
                /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
                // @ts-ignore
                const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({}));
                const __VLS_6 = __VLS_5({}, ...__VLS_functionalComponentArgsRest(__VLS_5));
                __VLS_7.slots.default;
                const __VLS_8 = {}.Lock;
                /** @type {[typeof __VLS_components.Lock, ]} */ ;
                // @ts-ignore
                const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({}));
                const __VLS_10 = __VLS_9({}, ...__VLS_functionalComponentArgsRest(__VLS_9));
                var __VLS_7;
            }
            else {
                const __VLS_12 = {}.ElIcon;
                /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
                // @ts-ignore
                const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({}));
                const __VLS_14 = __VLS_13({}, ...__VLS_functionalComponentArgsRest(__VLS_13));
                __VLS_15.slots.default;
                const __VLS_16 = {}.ArrowDown;
                /** @type {[typeof __VLS_components.ArrowDown, ]} */ ;
                // @ts-ignore
                const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({}));
                const __VLS_18 = __VLS_17({}, ...__VLS_functionalComponentArgsRest(__VLS_17));
                var __VLS_15;
            }
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "filter-popover" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "popover-title" },
        });
        (__VLS_ctx.fieldLabel(filter.column));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "popover-op" },
        });
        (__VLS_ctx.opLabel(filter.op));
        if (__VLS_ctx.useValueDropdown(filter)) {
            const __VLS_20 = {}.ElSelect;
            /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
            // @ts-ignore
            const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
                ...{ 'onVisibleChange': {} },
                ...{ 'onKeyup': {} },
                modelValue: (__VLS_ctx.runtimeValues[index]),
                multiple: (filter.op === 'in'),
                filterable: true,
                allowCreate: true,
                defaultFirstOption: true,
                reserveKeyword: (false),
                loading: (__VLS_ctx.distinctLoading.has(filter.column)),
                placeholder: "选择或输入值",
                size: "small",
                ...{ style: {} },
            }));
            const __VLS_22 = __VLS_21({
                ...{ 'onVisibleChange': {} },
                ...{ 'onKeyup': {} },
                modelValue: (__VLS_ctx.runtimeValues[index]),
                multiple: (filter.op === 'in'),
                filterable: true,
                allowCreate: true,
                defaultFirstOption: true,
                reserveKeyword: (false),
                loading: (__VLS_ctx.distinctLoading.has(filter.column)),
                placeholder: "选择或输入值",
                size: "small",
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_21));
            let __VLS_24;
            let __VLS_25;
            let __VLS_26;
            const __VLS_27 = {
                onVisibleChange: ((v) => v && __VLS_ctx.ensureOptions(filter.column))
            };
            const __VLS_28 = {
                onKeyup: (__VLS_ctx.apply)
            };
            __VLS_23.slots.default;
            for (const [o] of __VLS_getVForSourceType((__VLS_ctx.optionsFor(filter.column)))) {
                const __VLS_29 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_30 = __VLS_asFunctionalComponent(__VLS_29, new __VLS_29({
                    key: (o.value),
                    label: (o.label),
                    value: (o.value),
                }));
                const __VLS_31 = __VLS_30({
                    key: (o.value),
                    label: (o.label),
                    value: (o.value),
                }, ...__VLS_functionalComponentArgsRest(__VLS_30));
            }
            var __VLS_23;
        }
        else {
            const __VLS_33 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_34 = __VLS_asFunctionalComponent(__VLS_33, new __VLS_33({
                ...{ 'onKeyup': {} },
                modelValue: (__VLS_ctx.runtimeValues[index]),
                disabled: (filter.op === 'is_null' || filter.op === 'is_not_null'),
                placeholder: (filter.op === 'between' || filter.op === 'in' ? '多个值用逗号分隔' : '值'),
                size: "small",
            }));
            const __VLS_35 = __VLS_34({
                ...{ 'onKeyup': {} },
                modelValue: (__VLS_ctx.runtimeValues[index]),
                disabled: (filter.op === 'is_null' || filter.op === 'is_not_null'),
                placeholder: (filter.op === 'between' || filter.op === 'in' ? '多个值用逗号分隔' : '值'),
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_34));
            let __VLS_37;
            let __VLS_38;
            let __VLS_39;
            const __VLS_40 = {
                onKeyup: (__VLS_ctx.apply)
            };
            var __VLS_36;
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "popover-actions" },
        });
        const __VLS_41 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_42 = __VLS_asFunctionalComponent(__VLS_41, new __VLS_41({
            ...{ 'onClick': {} },
            size: "small",
            type: "primary",
        }));
        const __VLS_43 = __VLS_42({
            ...{ 'onClick': {} },
            size: "small",
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_42));
        let __VLS_45;
        let __VLS_46;
        let __VLS_47;
        const __VLS_48 = {
            onClick: (__VLS_ctx.apply)
        };
        __VLS_44.slots.default;
        var __VLS_44;
        var __VLS_3;
    }
    if (__VLS_ctx.overflowFilters.length || __VLS_ctx.customLogicActive) {
        const __VLS_49 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_50 = __VLS_asFunctionalComponent(__VLS_49, new __VLS_49({
            ...{ 'onClick': {} },
            link: true,
            type: "primary",
            ...{ class: "advanced-link" },
        }));
        const __VLS_51 = __VLS_50({
            ...{ 'onClick': {} },
            link: true,
            type: "primary",
            ...{ class: "advanced-link" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_50));
        let __VLS_53;
        let __VLS_54;
        let __VLS_55;
        const __VLS_56 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.visibleFilters.length))
                    return;
                if (!(__VLS_ctx.overflowFilters.length || __VLS_ctx.customLogicActive))
                    return;
                __VLS_ctx.advancedVisible = true;
            }
        };
        __VLS_52.slots.default;
        if (__VLS_ctx.overflowFilters.length) {
            const __VLS_57 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_58 = __VLS_asFunctionalComponent(__VLS_57, new __VLS_57({
                size: "small",
                effect: "plain",
            }));
            const __VLS_59 = __VLS_58({
                size: "small",
                effect: "plain",
            }, ...__VLS_functionalComponentArgsRest(__VLS_58));
            __VLS_60.slots.default;
            (__VLS_ctx.overflowFilters.length);
            var __VLS_60;
        }
        if (__VLS_ctx.customLogicActive) {
            const __VLS_61 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_62 = __VLS_asFunctionalComponent(__VLS_61, new __VLS_61({
                size: "small",
                type: "warning",
                effect: "plain",
            }));
            const __VLS_63 = __VLS_62({
                size: "small",
                type: "warning",
                effect: "plain",
            }, ...__VLS_functionalComponentArgsRest(__VLS_62));
            __VLS_64.slots.default;
            var __VLS_64;
        }
        var __VLS_52;
    }
    const __VLS_65 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_66 = __VLS_asFunctionalComponent(__VLS_65, new __VLS_65({
        ...{ 'onClick': {} },
        link: true,
        ...{ class: "reset-link" },
    }));
    const __VLS_67 = __VLS_66({
        ...{ 'onClick': {} },
        link: true,
        ...{ class: "reset-link" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_66));
    let __VLS_69;
    let __VLS_70;
    let __VLS_71;
    const __VLS_72 = {
        onClick: (__VLS_ctx.resetAndApply)
    };
    __VLS_68.slots.default;
    const __VLS_73 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_74 = __VLS_asFunctionalComponent(__VLS_73, new __VLS_73({}));
    const __VLS_75 = __VLS_74({}, ...__VLS_functionalComponentArgsRest(__VLS_74));
    __VLS_76.slots.default;
    const __VLS_77 = {}.RefreshLeft;
    /** @type {[typeof __VLS_components.RefreshLeft, ]} */ ;
    // @ts-ignore
    const __VLS_78 = __VLS_asFunctionalComponent(__VLS_77, new __VLS_77({}));
    const __VLS_79 = __VLS_78({}, ...__VLS_functionalComponentArgsRest(__VLS_78));
    var __VLS_76;
    var __VLS_68;
    const __VLS_81 = {}.ElDialog;
    /** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
    // @ts-ignore
    const __VLS_82 = __VLS_asFunctionalComponent(__VLS_81, new __VLS_81({
        modelValue: (__VLS_ctx.advancedVisible),
        title: "高级筛选",
        width: "680px",
    }));
    const __VLS_83 = __VLS_82({
        modelValue: (__VLS_ctx.advancedVisible),
        title: "高级筛选",
        width: "680px",
    }, ...__VLS_functionalComponentArgsRest(__VLS_82));
    __VLS_84.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "advanced-list" },
    });
    for (const [{ filter, index }] of __VLS_getVForSourceType((__VLS_ctx.visibleFilters))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (`${filter.column}-${index}`),
            ...{ class: "advanced-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "advanced-label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.fieldLabel(filter.column));
        const __VLS_85 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_86 = __VLS_asFunctionalComponent(__VLS_85, new __VLS_85({
            size: "small",
            effect: "plain",
        }));
        const __VLS_87 = __VLS_86({
            size: "small",
            effect: "plain",
        }, ...__VLS_functionalComponentArgsRest(__VLS_86));
        __VLS_88.slots.default;
        (__VLS_ctx.opLabel(filter.op));
        var __VLS_88;
        if (filter.locked) {
            const __VLS_89 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_90 = __VLS_asFunctionalComponent(__VLS_89, new __VLS_89({
                size: "small",
                type: "info",
                effect: "plain",
            }));
            const __VLS_91 = __VLS_90({
                size: "small",
                type: "info",
                effect: "plain",
            }, ...__VLS_functionalComponentArgsRest(__VLS_90));
            __VLS_92.slots.default;
            var __VLS_92;
        }
        if (__VLS_ctx.useValueDropdown(filter)) {
            const __VLS_93 = {}.ElSelect;
            /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
            // @ts-ignore
            const __VLS_94 = __VLS_asFunctionalComponent(__VLS_93, new __VLS_93({
                ...{ 'onVisibleChange': {} },
                modelValue: (__VLS_ctx.runtimeValues[index]),
                multiple: (filter.op === 'in'),
                filterable: true,
                allowCreate: true,
                defaultFirstOption: true,
                reserveKeyword: (false),
                loading: (__VLS_ctx.distinctLoading.has(filter.column)),
                disabled: (filter.locked),
                placeholder: "选择或输入值",
                size: "small",
                ...{ style: {} },
            }));
            const __VLS_95 = __VLS_94({
                ...{ 'onVisibleChange': {} },
                modelValue: (__VLS_ctx.runtimeValues[index]),
                multiple: (filter.op === 'in'),
                filterable: true,
                allowCreate: true,
                defaultFirstOption: true,
                reserveKeyword: (false),
                loading: (__VLS_ctx.distinctLoading.has(filter.column)),
                disabled: (filter.locked),
                placeholder: "选择或输入值",
                size: "small",
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_94));
            let __VLS_97;
            let __VLS_98;
            let __VLS_99;
            const __VLS_100 = {
                onVisibleChange: ((v) => v && __VLS_ctx.ensureOptions(filter.column))
            };
            __VLS_96.slots.default;
            for (const [o] of __VLS_getVForSourceType((__VLS_ctx.optionsFor(filter.column)))) {
                const __VLS_101 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_102 = __VLS_asFunctionalComponent(__VLS_101, new __VLS_101({
                    key: (o.value),
                    label: (o.label),
                    value: (o.value),
                }));
                const __VLS_103 = __VLS_102({
                    key: (o.value),
                    label: (o.label),
                    value: (o.value),
                }, ...__VLS_functionalComponentArgsRest(__VLS_102));
            }
            var __VLS_96;
        }
        else {
            const __VLS_105 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_106 = __VLS_asFunctionalComponent(__VLS_105, new __VLS_105({
                modelValue: (__VLS_ctx.runtimeValues[index]),
                disabled: (filter.locked || filter.op === 'is_null' || filter.op === 'is_not_null'),
                placeholder: (filter.op === 'between' || filter.op === 'in' ? '多个值用逗号分隔' : '值'),
                size: "small",
            }));
            const __VLS_107 = __VLS_106({
                modelValue: (__VLS_ctx.runtimeValues[index]),
                disabled: (filter.locked || filter.op === 'is_null' || filter.op === 'is_not_null'),
                placeholder: (filter.op === 'between' || filter.op === 'in' ? '多个值用逗号分隔' : '值'),
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_106));
        }
    }
    if (__VLS_ctx.customLogicActive) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "logic-note" },
        });
        const __VLS_109 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_110 = __VLS_asFunctionalComponent(__VLS_109, new __VLS_109({}));
        const __VLS_111 = __VLS_110({}, ...__VLS_functionalComponentArgsRest(__VLS_110));
        __VLS_112.slots.default;
        const __VLS_113 = {}.Setting;
        /** @type {[typeof __VLS_components.Setting, ]} */ ;
        // @ts-ignore
        const __VLS_114 = __VLS_asFunctionalComponent(__VLS_113, new __VLS_113({}));
        const __VLS_115 = __VLS_114({}, ...__VLS_functionalComponentArgsRest(__VLS_114));
        var __VLS_112;
        (__VLS_ctx.filterLogic?.expression);
    }
    {
        const { footer: __VLS_thisSlot } = __VLS_84.slots;
        const __VLS_117 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_118 = __VLS_asFunctionalComponent(__VLS_117, new __VLS_117({
            ...{ 'onClick': {} },
        }));
        const __VLS_119 = __VLS_118({
            ...{ 'onClick': {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_118));
        let __VLS_121;
        let __VLS_122;
        let __VLS_123;
        const __VLS_124 = {
            onClick: (__VLS_ctx.resetValues)
        };
        __VLS_120.slots.default;
        var __VLS_120;
        const __VLS_125 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_126 = __VLS_asFunctionalComponent(__VLS_125, new __VLS_125({
            ...{ 'onClick': {} },
            type: "primary",
        }));
        const __VLS_127 = __VLS_126({
            ...{ 'onClick': {} },
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_126));
        let __VLS_129;
        let __VLS_130;
        let __VLS_131;
        const __VLS_132 = {
            onClick: (__VLS_ctx.apply)
        };
        __VLS_128.slots.default;
        const __VLS_133 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_134 = __VLS_asFunctionalComponent(__VLS_133, new __VLS_133({}));
        const __VLS_135 = __VLS_134({}, ...__VLS_functionalComponentArgsRest(__VLS_134));
        __VLS_136.slots.default;
        const __VLS_137 = {}.Search;
        /** @type {[typeof __VLS_components.Search, ]} */ ;
        // @ts-ignore
        const __VLS_138 = __VLS_asFunctionalComponent(__VLS_137, new __VLS_137({}));
        const __VLS_139 = __VLS_138({}, ...__VLS_functionalComponentArgsRest(__VLS_138));
        var __VLS_136;
        var __VLS_128;
    }
    var __VLS_84;
}
/** @type {__VLS_StyleScopedClasses['runtime-filter-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-strip']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-text']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-popover']} */ ;
/** @type {__VLS_StyleScopedClasses['popover-title']} */ ;
/** @type {__VLS_StyleScopedClasses['popover-op']} */ ;
/** @type {__VLS_StyleScopedClasses['popover-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['advanced-link']} */ ;
/** @type {__VLS_StyleScopedClasses['reset-link']} */ ;
/** @type {__VLS_StyleScopedClasses['advanced-list']} */ ;
/** @type {__VLS_StyleScopedClasses['advanced-row']} */ ;
/** @type {__VLS_StyleScopedClasses['advanced-label']} */ ;
/** @type {__VLS_StyleScopedClasses['logic-note']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ArrowDown: ArrowDown,
            Lock: Lock,
            RefreshLeft: RefreshLeft,
            Search: Search,
            Setting: Setting,
            runtimeValues: runtimeValues,
            barRef: barRef,
            advancedVisible: advancedVisible,
            distinctLoading: distinctLoading,
            visibleFilters: visibleFilters,
            customLogicActive: customLogicActive,
            inlineFilters: inlineFilters,
            overflowFilters: overflowFilters,
            opLabel: opLabel,
            fieldLabel: fieldLabel,
            useValueDropdown: useValueDropdown,
            ensureOptions: ensureOptions,
            optionsFor: optionsFor,
            resetValues: resetValues,
            apply: apply,
            resetAndApply: resetAndApply,
            chipText: chipText,
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
