/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { dataApi } from '@/api/data';
import { datasetsApi } from '@/api/datasets';
import { useUserStore } from '@/stores/user';
import FormulaFieldEditor from './FormulaFieldEditor.vue';
const props = defineProps();
const emit = defineEmits();
const userStore = useUserStore();
const columns = ref([]);
const calcFields = ref([]);
const currentDataset = ref(null);
const loading = ref(false);
const formulaEditorOpen = ref(false);
const editingField = ref(null);
const canCreateField = computed(() => userStore.hasOp('datasource.datasets', 'C'));
function datasetTableName(table) {
    return table.table_label || props.tables.find((t) => t.value === table.table_name)?.label || table.table_name;
}
const sourceGroups = computed(() => {
    const groups = (currentDataset.value?.tables || []).map((item) => ({
        key: item.alias,
        label: datasetTableName(item),
    }));
    groups.push({ key: 'calc', label: '计算字段' });
    return groups;
});
const formulaEditorFields = computed(() => columns.value.filter((item) => !item.code.startsWith('calc.')));
function calcColumn(field) {
    return {
        code: `calc.${field.code}`,
        label: field.label,
        data_type: field.data_type,
        is_pk_part: false,
        is_sensitive: field.is_sensitive,
        is_visible: field.is_active,
        display_order: 999,
        auto_discovered: false,
        enum_options: null,
        agg_role: field.agg_role,
        is_computed: true,
    };
}
async function refresh() {
    loading.value = true;
    try {
        if (!props.datasetId) {
            currentDataset.value = null;
            columns.value = [];
            emit('datasetChange', null);
            emit('columnsChange', []);
            return;
        }
        const ds = await datasetsApi.get(props.datasetId);
        currentDataset.value = ds;
        emit('datasetChange', ds);
        const nextColumns = [];
        const failedTables = [];
        for (const table of ds.tables) {
            const tableName = datasetTableName(table);
            try {
                const tableColumns = await dataApi.columns(table.table_name);
                for (const col of tableColumns) {
                    nextColumns.push({
                        ...col,
                        code: `${table.alias}.${col.code}`,
                        // label 只保留字段名；来源表/数据集名由 sourceGroups 负责展示。
                        // 避免字段选择器右侧把“花名册”等表名误当成字段名展示。
                        label: col.label,
                    });
                }
            }
            catch {
                failedTables.push(tableName);
            }
        }
        if (failedTables.length) {
            ElMessage.warning(`以下数据表字段加载失败,已跳过:${failedTables.join('、')}`);
        }
        const fetched = await datasetsApi.calculatedFields(props.datasetId);
        calcFields.value = fetched;
        nextColumns.push(...fetched.map(calcColumn));
        columns.value = nextColumns;
        emit('columnsChange', nextColumns);
    }
    catch {
        currentDataset.value = null;
        columns.value = [];
        emit('datasetChange', null);
        emit('columnsChange', []);
    }
    finally {
        loading.value = false;
    }
}
function openEditor(fieldOrCol) {
    if (!canCreateField.value)
        return;
    if (!props.datasetId) {
        ElMessage.warning('请先选择数据集');
        return;
    }
    if (fieldOrCol && 'code' in fieldOrCol && fieldOrCol.code?.startsWith('calc.')) {
        const code = fieldOrCol.code.slice('calc.'.length);
        editingField.value = calcFields.value.find((f) => f.code === code) ?? null;
    }
    else {
        editingField.value = fieldOrCol ?? null;
    }
    formulaEditorOpen.value = true;
}
async function onSaved(field) {
    await refresh();
    emit('saved', field);
}
watch(() => [props.datasetId, props.datasets.length], () => { refresh(); }, { immediate: true });
const __VLS_exposed = { refresh, openEditor };
defineExpose(__VLS_exposed);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
var __VLS_0 = {
    columns: (__VLS_ctx.columns),
    loading: (__VLS_ctx.loading),
    sourceGroups: (__VLS_ctx.sourceGroups),
    currentDataset: (__VLS_ctx.currentDataset),
    canCreateField: (__VLS_ctx.canCreateField),
    createField: (__VLS_ctx.openEditor),
    editField: (__VLS_ctx.openEditor),
    refresh: (__VLS_ctx.refresh),
};
/** @type {[typeof FormulaFieldEditor, ]} */ ;
// @ts-ignore
const __VLS_2 = __VLS_asFunctionalComponent(FormulaFieldEditor, new FormulaFieldEditor({
    ...{ 'onSaved': {} },
    visible: (__VLS_ctx.formulaEditorOpen),
    datasetId: (__VLS_ctx.datasetId),
    fields: (__VLS_ctx.formulaEditorFields),
    sourceGroups: (__VLS_ctx.sourceGroups),
    editField: (__VLS_ctx.editingField),
}));
const __VLS_3 = __VLS_2({
    ...{ 'onSaved': {} },
    visible: (__VLS_ctx.formulaEditorOpen),
    datasetId: (__VLS_ctx.datasetId),
    fields: (__VLS_ctx.formulaEditorFields),
    sourceGroups: (__VLS_ctx.sourceGroups),
    editField: (__VLS_ctx.editingField),
}, ...__VLS_functionalComponentArgsRest(__VLS_2));
let __VLS_5;
let __VLS_6;
let __VLS_7;
const __VLS_8 = {
    onSaved: (__VLS_ctx.onSaved)
};
var __VLS_4;
// @ts-ignore
var __VLS_1 = __VLS_0;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            FormulaFieldEditor: FormulaFieldEditor,
            columns: columns,
            currentDataset: currentDataset,
            loading: loading,
            formulaEditorOpen: formulaEditorOpen,
            editingField: editingField,
            canCreateField: canCreateField,
            sourceGroups: sourceGroups,
            formulaEditorFields: formulaEditorFields,
            refresh: refresh,
            openEditor: openEditor,
            onSaved: onSaved,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
const __VLS_component = (await import('vue')).defineComponent({
    setup() {
        return {
            ...__VLS_exposed,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
export default {};
; /* PartiallyEnd: #4569/main.vue */
