/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref, watch, onMounted } from 'vue';
import { api } from '@/api/client';
import { getAsset, listAssets } from '@/api/warehouse';
const props = defineProps();
const emit = defineEmits();
const allowedTypes = props.allowedTypes || ['table'];
const allowedLayers = props.allowedLayers || ['DWD', 'DWS', 'ADS'];
const options = ref([]);
const loading = ref(false);
const selectedType = ref(props.modelValue?.source_type || allowedTypes[0]);
const selectedId = ref(props.modelValue?.source_id || '');
const sourceLabel = ref(props.modelValue?.source_label || '');
const TYPE_OPTIONS = [
    { label: '数据表', value: 'table' },
    { label: '数据集', value: 'dataset' },
    { label: '指标', value: 'metric' },
    { label: '消费资产', value: 'ads' },
    { label: '报表', value: 'report' },
].filter(t => allowedTypes.includes(t.value));
function formatOptionLabel(name, suffix) {
    const cleanSuffix = String(suffix || '').trim();
    return cleanSuffix ? `${name} (${cleanSuffix})` : name;
}
function isPhysicalOrEmptyLabel(label, id) {
    const cleanLabel = String(label || '').trim();
    return !cleanLabel || cleanLabel === id;
}
function syncLabelFromSelectedOption() {
    const opt = options.value.find(o => o.value === selectedId.value);
    if (!opt)
        return false;
    if (isPhysicalOrEmptyLabel(sourceLabel.value, selectedId.value)) {
        sourceLabel.value = opt.displayLabel;
        return true;
    }
    return false;
}
async function ensureSelectedOption() {
    const id = selectedId.value;
    if (!id)
        return;
    const existing = options.value.find(o => o.value === id);
    if (existing) {
        // If the selected row is in the current page but its option label is still
        // the physical name, prefer the backend-resolved source_label. Element Plus
        // renders the selected text from el-option.label, not from modelValue.
        if (!isPhysicalOrEmptyLabel(sourceLabel.value, id) && isPhysicalOrEmptyLabel(existing.displayLabel, id)) {
            existing.displayLabel = sourceLabel.value;
            existing.label = formatOptionLabel(sourceLabel.value, existing.layer);
        }
        return;
    }
    let displayLabel = sourceLabel.value || id;
    let layer = '';
    if (selectedType.value === 'table') {
        try {
            const asset = await getAsset(id);
            displayLabel = asset.table_label || displayLabel;
            layer = asset.warehouse_layer || '';
        }
        catch {
            // Keep the backend-provided source_label fallback when the asset is not in the current page.
        }
    }
    options.value.unshift({
        label: formatOptionLabel(displayLabel, layer),
        value: id,
        layer,
        displayLabel,
    });
}
async function loadOptions() {
    loading.value = true;
    try {
        const st = selectedType.value;
        if (st === 'table') {
            const res = await listAssets({ page_size: 200 });
            options.value = (res.items || [])
                .filter((a) => allowedLayers.includes(a.warehouse_layer))
                .map((a) => ({
                label: `${a.table_label || a.table_name} (${a.warehouse_layer})`,
                value: a.table_name,
                layer: a.warehouse_layer,
                displayLabel: a.table_label || a.table_name,
            }));
        }
        else if (st === 'dataset') {
            const { data } = await api.get('/warehouse/models', { params: { page_size: 200 } });
            options.value = (data.items || []).map((m) => ({
                label: formatOptionLabel(m.name || m.label || `模型 #${m.id}`, m.status),
                value: String(m.id),
                layer: m.status || '',
                displayLabel: m.name || m.label || `模型 #${m.id}`,
            }));
        }
        else if (st === 'metric') {
            const { data } = await api.get('/warehouse/metrics', { params: { page_size: 200 } });
            options.value = (data.items || []).map((m) => ({
                label: formatOptionLabel(m.name || m.metric_name || `指标 #${m.id}`, m.status),
                value: String(m.id),
                layer: m.status || '',
                displayLabel: m.name || m.metric_name || `指标 #${m.id}`,
            }));
        }
        else if (st === 'ads') {
            const { data } = await api.get('/warehouse/ads-definitions', { params: { page_size: 200 } });
            options.value = (Array.isArray(data) ? data : (data.items || [])).map((a) => ({
                label: formatOptionLabel(a.name || `ADS #${a.id}`, a.status),
                value: String(a.id),
                layer: a.status || '',
                displayLabel: a.name || `ADS #${a.id}`,
            }));
        }
        else if (st === 'report') {
            const { data } = await api.get('/reports', { params: { page_size: 200 } });
            const items = Array.isArray(data) ? data : (data.items || []);
            options.value = items.map((r) => ({
                label: formatOptionLabel(r.name || r.title || `报表 #${r.id}`, r.status),
                value: String(r.id),
                layer: r.status || '',
                displayLabel: r.name || r.title || `报表 #${r.id}`,
            }));
        }
        else {
            options.value = [];
        }
        await ensureSelectedOption();
        syncLabelFromSelectedOption();
    }
    catch {
        options.value = [];
        await ensureSelectedOption();
        syncLabelFromSelectedOption();
    }
    finally {
        loading.value = false;
    }
}
function emitChange() {
    emit('update:modelValue', {
        source_type: selectedType.value,
        source_id: selectedId.value,
        source_label: sourceLabel.value,
    });
}
// 弹窗复用场景：父组件 modelValue 变化时同步内部状态
const syncing = ref(false);
watch(() => props.modelValue, async (val) => {
    if (!val)
        return;
    const originalLabel = val.source_label || '';
    syncing.value = true;
    selectedType.value = allowedTypes.includes(val.source_type) ? val.source_type : allowedTypes[0];
    selectedId.value = val.source_id || '';
    sourceLabel.value = originalLabel;
    await loadOptions();
    syncing.value = false;
    if (sourceLabel.value && sourceLabel.value !== originalLabel)
        emitChange();
}, { deep: true });
watch(selectedType, async () => {
    if (syncing.value)
        return; // syncing from parent; keep current selection
    selectedId.value = '';
    sourceLabel.value = '';
    await loadOptions();
    emitChange();
});
watch(selectedId, (val) => {
    if (!val)
        return;
    const opt = options.value.find(o => o.value === val);
    sourceLabel.value = opt?.displayLabel || sourceLabel.value || val;
    emitChange();
});
onMounted(() => loadOptions());
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "source-picker" },
});
const __VLS_0 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    modelValue: (__VLS_ctx.selectedType),
    placeholder: "来源类型",
    ...{ style: {} },
}));
const __VLS_2 = __VLS_1({
    modelValue: (__VLS_ctx.selectedType),
    placeholder: "来源类型",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
for (const [t] of __VLS_getVForSourceType((__VLS_ctx.TYPE_OPTIONS))) {
    const __VLS_4 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        key: (t.value),
        label: (t.label),
        value: (t.value),
    }));
    const __VLS_6 = __VLS_5({
        key: (t.value),
        label: (t.label),
        value: (t.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
}
var __VLS_3;
const __VLS_8 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    modelValue: (__VLS_ctx.selectedId),
    filterable: true,
    placeholder: (`选择${__VLS_ctx.TYPE_OPTIONS.find(t => t.value === __VLS_ctx.selectedType)?.label || '来源'}`),
    loading: (__VLS_ctx.loading),
    ...{ style: {} },
}));
const __VLS_10 = __VLS_9({
    modelValue: (__VLS_ctx.selectedId),
    filterable: true,
    placeholder: (`选择${__VLS_ctx.TYPE_OPTIONS.find(t => t.value === __VLS_ctx.selectedType)?.label || '来源'}`),
    loading: (__VLS_ctx.loading),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
__VLS_11.slots.default;
for (const [o] of __VLS_getVForSourceType((__VLS_ctx.options))) {
    const __VLS_12 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
        key: (o.value),
        label: (o.label),
        value: (o.value),
    }));
    const __VLS_14 = __VLS_13({
        key: (o.value),
        label: (o.label),
        value: (o.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_13));
    __VLS_15.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (o.displayLabel);
    if (o.layer) {
        const __VLS_16 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
            size: "small",
            type: "info",
            ...{ style: {} },
        }));
        const __VLS_18 = __VLS_17({
            size: "small",
            type: "info",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_17));
        __VLS_19.slots.default;
        (o.layer);
        var __VLS_19;
    }
    var __VLS_15;
}
var __VLS_11;
/** @type {__VLS_StyleScopedClasses['source-picker']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            options: options,
            loading: loading,
            selectedType: selectedType,
            selectedId: selectedId,
            TYPE_OPTIONS: TYPE_OPTIONS,
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
