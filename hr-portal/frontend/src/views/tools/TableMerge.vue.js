/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { onMounted, ref, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Delete, Upload, Download, MagicStick, Edit, ArrowLeft, CircleCheck, Warning, Document, Grid } from '@element-plus/icons-vue';
import PermissionButton from '@/components/PermissionButton.vue';
import { tableToolsApi } from '@/api/tableTools';
import { useUserStore } from '@/stores/user';
const userStore = useUserStore();
/** 改/删门禁:仅模板创建者本人或超级管理员(与后端一致) */
function canModify(t) {
    return userStore.isSuperAdmin || t.created_by === userStore.user?.id;
}
// ── 视图状态 ─────────────────────────────────────────────────────────────────
// mode: list | build | merge
const mode = ref('list');
// ── 模板列表 ─────────────────────────────────────────────────────────────────
const templates = ref([]);
const listLoading = ref(false);
async function loadTemplates() {
    listLoading.value = true;
    try {
        templates.value = await tableToolsApi.listTemplates();
    }
    catch {
        ElMessage.error('加载模板列表失败');
    }
    finally {
        listLoading.value = false;
    }
}
onMounted(loadTemplates);
// ── 建/编辑模板（build 模式） ─────────────────────────────────────────────────
const editingId = ref(null);
const buildStep = ref('upload');
// 文件 + AI
const tplFiles = ref([]);
const aiContext = ref('');
const aiLoading = ref(false);
const draft = ref(null);
// 表单数据
const form = ref({
    name: '',
    description: '',
    merge_keys: ['姓名', '证件号码'],
    std_fields: [],
    aggregate: 'sum',
    mappings: [],
});
const stdFieldInput = ref('');
const draggingStdField = ref('');
const savingTpl = ref(false);
// 当前展开的 mapping 索引
const expandedMapping = ref(null);
// 当前正在编辑的 mapping 副本
const editingMapping = ref(null);
function openNew() {
    editingId.value = null;
    tplFiles.value = [];
    aiContext.value = '';
    draft.value = null;
    expandedMapping.value = null;
    editingMapping.value = null;
    resetForm();
    buildStep.value = 'upload';
    mode.value = 'build';
}
async function openEdit(id) {
    editingId.value = id;
    try {
        const detail = await tableToolsApi.getTemplate(id);
        form.value = {
            name: detail.name,
            description: detail.description || '',
            merge_keys: [...detail.merge_keys],
            std_fields: [...detail.std_fields],
            aggregate: detail.aggregate,
            mappings: detail.mappings.map((m) => ({ ...m })),
        };
        expandedMapping.value = null;
        editingMapping.value = null;
        buildStep.value = 'form';
        mode.value = 'build';
        return true;
    }
    catch {
        ElMessage.error('加载模板详情失败');
        return false;
    }
}
const mappingWizardTemplate = ref(null);
const mappingWizardStep = ref('upload');
const mappingWizardFiles = ref([]);
const mappingWizardContext = ref('');
const mappingWizardDrafts = ref([]);
const mappingWizardSaving = ref(false);
function resetMappingWizard() {
    mappingWizardStep.value = 'upload';
    mappingWizardFiles.value = [];
    mappingWizardContext.value = '';
    mappingWizardDrafts.value = [];
}
async function openAddMapping(id) {
    try {
        mappingWizardTemplate.value = await tableToolsApi.getTemplate(id);
        resetMappingWizard();
        mode.value = 'mapping';
    }
    catch {
        ElMessage.error('加载模板详情失败');
    }
}
function removeMappingWizardFile(index) {
    mappingWizardFiles.value.splice(index, 1);
}
function handleMappingWizardFile(uploadFile) {
    const file = uploadFile.raw;
    if (!mappingWizardFiles.value.some((item) => item.name === file.name && item.size === file.size)) {
        mappingWizardFiles.value.push(file);
    }
}
function uniqueWizardMappingName(proposedName, usedNames) {
    const baseName = proposedName.trim() || '新映射';
    if (!usedNames.has(baseName)) {
        usedNames.add(baseName);
        return baseName;
    }
    let sequence = 2;
    while (usedNames.has(`${baseName}-${sequence}`))
        sequence += 1;
    const name = `${baseName}-${sequence}`;
    usedNames.add(name);
    return name;
}
async function runMappingDrafts() {
    if (!mappingWizardTemplate.value || !mappingWizardFiles.value.length) {
        ElMessage.warning('请先拖拽或选择至少一个样表文件');
        return;
    }
    mappingWizardStep.value = 'ai';
    try {
        const result = await tableToolsApi.mappingDrafts(mappingWizardTemplate.value.id, mappingWizardFiles.value, mappingWizardContext.value);
        const usedNames = new Set(mappingWizardTemplate.value.mappings.map((mapping) => mapping.name));
        mappingWizardDrafts.value = result.mappings.map((mapping) => ({
            ...mapping,
            name: uniqueWizardMappingName(mapping.name, usedNames),
        }));
        mappingWizardStep.value = 'confirm';
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '样表识别失败，请重试');
        mappingWizardStep.value = 'upload';
    }
}
function removeMappingWizardDraft(index) {
    mappingWizardDrafts.value.splice(index, 1);
}
async function saveMappingDrafts() {
    if (!mappingWizardTemplate.value || !mappingWizardDrafts.value.length) {
        ElMessage.warning('请保留至少一条待保存映射');
        return;
    }
    mappingWizardSaving.value = true;
    try {
        await tableToolsApi.createMappings(mappingWizardTemplate.value.id, mappingWizardDrafts.value.map((mapping) => ({
            name: mapping.name,
            match_signature: mapping.match_signature || [],
            sheet_kw: mapping.sheet_kw || null,
            header_start: mapping.header_start || 1,
            header_end: mapping.header_end || 1,
            key_map: mapping.key_map || {},
            column_map: mapping.column_map || {},
            derived_fields: mapping.derived_fields || [],
            derive_check: mapping.derive_check || null,
            skip_tokens: mapping.skip_tokens || ['合计', '小计', '总计'],
        })));
        await loadTemplates();
        mode.value = 'list';
        ElMessage.success(`已新增 ${mappingWizardDrafts.value.length} 条源映射`);
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '批量保存映射失败');
    }
    finally {
        mappingWizardSaving.value = false;
    }
}
function resetForm() {
    form.value = { name: '', description: '', merge_keys: ['姓名', '证件号码'], std_fields: [], aggregate: 'sum', mappings: [] };
}
// 文件选择（去重）
function handleTplFileChange(uploadFile) {
    const file = uploadFile.raw;
    if (!tplFiles.value.find((f) => f.name === file.name && f.size === file.size)) {
        tplFiles.value.push(file);
    }
}
function removeTplFile(index) { tplFiles.value.splice(index, 1); }
// AI 识别
async function runAiDraft() {
    if (!tplFiles.value.length) {
        ElMessage.warning('请先上传文件');
        return;
    }
    buildStep.value = 'ai';
    try {
        draft.value = await tableToolsApi.aiDraft(tplFiles.value, aiContext.value);
        form.value = {
            name: draft.value.name || '',
            description: draft.value.description || '',
            merge_keys: [...draft.value.merge_keys],
            std_fields: [...draft.value.std_fields],
            aggregate: draft.value.aggregate,
            mappings: draft.value.mappings.map((m) => ({ ...m })),
        };
        buildStep.value = 'form';
        expandedMapping.value = null;
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || 'AI 识别失败，请重试');
        buildStep.value = 'upload';
    }
}
function skipToManual() {
    draft.value = null;
    resetForm();
    buildStep.value = 'form';
}
// mapping 编辑
function startEditMapping(idx) {
    expandedMapping.value = idx;
    editingMapping.value = JSON.parse(JSON.stringify(form.value.mappings[idx]));
}
function cancelEditMapping() {
    expandedMapping.value = null;
    editingMapping.value = null;
}
async function saveEditMapping() {
    if (expandedMapping.value === null || !editingMapping.value)
        return;
    const index = expandedMapping.value;
    const payload = { ...editingMapping.value };
    try {
        if (editingId.value) {
            const saved = payload.id
                ? await tableToolsApi.updateMapping(editingId.value, payload.id, payload)
                : await tableToolsApi.createMapping(editingId.value, payload);
            form.value.mappings[index] = saved;
        }
        else {
            form.value.mappings[index] = payload;
        }
        expandedMapping.value = null;
        editingMapping.value = null;
        ElMessage.success('源映射已保存');
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '源映射保存失败');
    }
}
const mappingDraftLoading = ref(false);
const mappingDraftFile = ref(null);
const mappingDraftSheets = ref([]);
const mappingDraftSheet = ref("");
const mappingDraftWarnings = ref([]);
const mappingDraftLowConfidence = ref(null);
async function handleMappingSample(uploadFile) {
    if (!editingId.value || !editingMapping.value)
        return;
    mappingDraftLoading.value = true;
    try {
        const sampleFile = uploadFile.raw;
        mappingDraftFile.value = sampleFile;
        const result = await tableToolsApi.mappingDraft(editingId.value, sampleFile, mappingDraftSheet.value || undefined);
        mappingDraftSheets.value = result.available_sheets;
        mappingDraftSheet.value = result.mapping.sheet_kw || "";
        mappingDraftWarnings.value = result.warnings;
        mappingDraftLowConfidence.value = result.low_confidence[0] || null;
        editingMapping.value = { ...editingMapping.value, ...result.mapping };
        ElMessage.success('已根据样表表头回填映射草稿，请确认后保存');
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '样表解析失败');
    }
    finally {
        mappingDraftLoading.value = false;
    }
}
async function reloadMappingDraft() {
    if (mappingDraftFile.value)
        await handleMappingSample({ raw: mappingDraftFile.value });
}
async function removeMapping(idx) {
    const mapping = form.value.mappings[idx];
    try {
        await ElMessageBox.confirm(`确认删除映射「${mapping.name}」？`, '确认删除', { type: 'warning' });
        if (editingId.value && mapping.id)
            await tableToolsApi.deleteMapping(editingId.value, mapping.id);
        form.value.mappings.splice(idx, 1);
        cancelEditMapping();
        ElMessage.success('源映射已删除');
    }
    catch (e) {
        if (e !== 'cancel' && e !== 'close')
            ElMessage.error(e?.response?.data?.detail || '删除映射失败');
    }
}
// key_map / column_map 编辑辅助
function addKeyMapEntry() {
    if (!editingMapping.value)
        return;
    if (!editingMapping.value.key_map)
        editingMapping.value.key_map = {};
    editingMapping.value.key_map[''] = '';
    editingMapping.value._keyMapEntries = objToEntries(editingMapping.value.key_map);
}
function addColumnMapEntry() {
    if (!editingMapping.value)
        return;
    if (!editingMapping.value.column_map)
        editingMapping.value.column_map = {};
    editingMapping.value.column_map[''] = '';
    editingMapping.value._colMapEntries = objToEntries(editingMapping.value.column_map);
}
function objToEntries(obj) {
    return Object.entries(obj).map(([k, v]) => ({ key: k, val: v }));
}
function entriesToObj(entries) {
    const obj = {};
    for (const e of entries) {
        if (e.key)
            obj[e.key] = e.val;
    }
    return obj;
}
// derived_fields 编辑
function addDerivedField() {
    if (!editingMapping.value)
        return;
    if (!editingMapping.value.derived_fields)
        editingMapping.value.derived_fields = [];
    editingMapping.value.derived_fields.push({ target: '', expr: '', round: 2 });
}
function removeDerivedField(idx) {
    editingMapping.value?.derived_fields?.splice(idx, 1);
}
// 把 key_map/column_map 对象同步到 editingMapping
function syncKeyMap(entries) {
    if (editingMapping.value)
        editingMapping.value.key_map = entriesToObj(entries);
}
function syncColumnMap(entries) {
    if (editingMapping.value)
        editingMapping.value.column_map = entriesToObj(entries);
}
// 标准字段
function addStdField() {
    const v = stdFieldInput.value.trim();
    if (v && !form.value.std_fields.includes(v))
        form.value.std_fields.push(v);
    stdFieldInput.value = '';
}
function removeStdField(f) {
    form.value.std_fields = form.value.std_fields.filter((x) => x !== f);
}
// 拖拽排序：决定归集输出表的列顺序
function reorderStdField(code, targetCode) {
    if (!code || !targetCode || code === targetCode)
        return;
    const next = [...form.value.std_fields];
    const from = next.indexOf(code);
    const to = next.indexOf(targetCode);
    if (from < 0 || to < 0)
        return;
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    form.value.std_fields = next;
}
// 低置信度
function aiLowConfidence(mappingName) {
    return draft.value?._meta?.low_confidence?.find((l) => l.sheet === mappingName);
}
// 保存模板
async function saveTemplate() {
    if (!form.value.name.trim()) {
        ElMessage.warning('请填写模板名称');
        return;
    }
    if (!form.value.std_fields.length) {
        ElMessage.warning('标准字段不能为空');
        return;
    }
    savingTpl.value = true;
    try {
        const payload = {
            name: form.value.name,
            description: form.value.description || null,
            merge_keys: form.value.merge_keys,
            std_fields: form.value.std_fields,
            aggregate: form.value.aggregate,
            mappings: form.value.mappings.map((m) => ({
                id: m.id || null,
                name: m.name,
                match_signature: m.match_signature || [],
                sheet_kw: m.sheet_kw || null,
                header_start: m.header_start || 1,
                header_end: m.header_end || 1,
                key_map: m.key_map || {},
                column_map: m.column_map || {},
                derived_fields: m.derived_fields || [],
                derive_check: m.derive_check || null,
                skip_tokens: m.skip_tokens || ['合计', '小计', '总计'],
            })),
        };
        if (editingId.value) {
            await tableToolsApi.updateTemplate(editingId.value, payload);
            ElMessage.success('模板已更新');
        }
        else {
            await tableToolsApi.createTemplate(payload);
            ElMessage.success('模板已保存');
        }
        await loadTemplates();
        mode.value = 'list';
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '保存失败');
    }
    finally {
        savingTpl.value = false;
    }
}
async function deleteTemplate(t) {
    await ElMessageBox.confirm(`确认删除模板「${t.name}」？`, '确认删除', {
        type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消',
    });
    try {
        await tableToolsApi.deleteTemplate(t.id);
        ElMessage.success('已删除');
        await loadTemplates();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '删除失败');
    }
}
// ── 月度合并（merge 模式） ────────────────────────────────────────────────────
const mergeTemplate = ref(null);
const mergeFiles = ref([]);
const merging = ref(false);
const downloading = ref(false);
const mergeResult = ref(null);
function openMerge(t) {
    mergeTemplate.value = t;
    mergeFiles.value = [];
    mergeResult.value = null;
    mode.value = 'merge';
}
function handleMergeFileChange(uploadFile) {
    const file = uploadFile.raw;
    if (!mergeFiles.value.find((f) => f.name === file.name && f.size === file.size)) {
        mergeFiles.value.push(file);
    }
}
function removeMergeFile(index) { mergeFiles.value.splice(index, 1); }
async function runMerge() {
    if (!mergeTemplate.value || !mergeFiles.value.length)
        return;
    merging.value = true;
    mergeResult.value = null;
    try {
        mergeResult.value = await tableToolsApi.runMerge(mergeTemplate.value.id, mergeFiles.value);
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '合并失败');
    }
    finally {
        merging.value = false;
    }
}
async function downloadResult() {
    if (!mergeTemplate.value || !mergeFiles.value.length)
        return;
    downloading.value = true;
    try {
        await tableToolsApi.downloadMerge(mergeTemplate.value.id, mergeFiles.value);
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '下载失败');
    }
    finally {
        downloading.value = false;
    }
}
// ── 计算属性 ─────────────────────────────────────────────────────────────────
const mergeResultCols = computed(() => mergeResult.value?.columns || []);
// key_map / column_map entries（用于 v-model 绑定）
const editingKeyMapEntries = computed({
    get: () => editingMapping.value ? objToEntries(editingMapping.value.key_map || {}) : [],
    set: (v) => syncKeyMap(v),
});
const editingColMapEntries = computed({
    get: () => editingMapping.value ? objToEntries(editingMapping.value.column_map || {}) : [],
    set: (v) => syncColumnMap(v),
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['tpl-card']} */ ;
/** @type {__VLS_StyleScopedClasses['back-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-dragger']} */ ;
/** @type {__VLS_StyleScopedClasses['el-upload-dragger']} */ ;
/** @type {__VLS_StyleScopedClasses['el-upload-dragger']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-text']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-remove']} */ ;
/** @type {__VLS_StyleScopedClasses['field-group']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['std-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-item']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-header']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-chevron']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['add-row-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['del-row-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-confirm-intro']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-confirm-intro']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-confirm-card-head']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-confirm-card-head']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-confirm-intro']} */ ;
/** @type {__VLS_StyleScopedClasses['log-title']} */ ;
/** @type {__VLS_StyleScopedClasses['log-score']} */ ;
/** @type {__VLS_StyleScopedClasses['log-score']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['danger']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['highlight']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-val']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['danger']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-val']} */ ;
/** @type {__VLS_StyleScopedClasses['build-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['merge-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['merge-left']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-cards']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "tt-root" },
});
if (__VLS_ctx.mode === 'list') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "page-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({
        ...{ class: "page-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "page-desc" },
    });
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_0 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: "table_tools",
        op: "C",
        type: "primary",
        icon: (__VLS_ctx.Plus),
    }));
    const __VLS_1 = __VLS_0({
        ...{ 'onClick': {} },
        menu: "table_tools",
        op: "C",
        type: "primary",
        icon: (__VLS_ctx.Plus),
    }, ...__VLS_functionalComponentArgsRest(__VLS_0));
    let __VLS_3;
    let __VLS_4;
    let __VLS_5;
    const __VLS_6 = {
        onClick: (__VLS_ctx.openNew)
    };
    __VLS_2.slots.default;
    var __VLS_2;
    if (__VLS_ctx.listLoading) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "list-loading" },
        });
        for (const [i] of __VLS_getVForSourceType((3))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
                ...{ class: "skeleton" },
                key: (i),
            });
        }
    }
    else if (!__VLS_ctx.templates.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "empty-state" },
        });
        const __VLS_7 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_8 = __VLS_asFunctionalComponent(__VLS_7, new __VLS_7({
            ...{ class: "empty-icon" },
        }));
        const __VLS_9 = __VLS_8({
            ...{ class: "empty-icon" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_8));
        __VLS_10.slots.default;
        const __VLS_11 = {}.Grid;
        /** @type {[typeof __VLS_components.Grid, ]} */ ;
        // @ts-ignore
        const __VLS_12 = __VLS_asFunctionalComponent(__VLS_11, new __VLS_11({}));
        const __VLS_13 = __VLS_12({}, ...__VLS_functionalComponentArgsRest(__VLS_12));
        var __VLS_10;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
        // @ts-ignore
        const __VLS_15 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
            ...{ 'onClick': {} },
            menu: "table_tools",
            op: "C",
            type: "primary",
            icon: (__VLS_ctx.Plus),
        }));
        const __VLS_16 = __VLS_15({
            ...{ 'onClick': {} },
            menu: "table_tools",
            op: "C",
            type: "primary",
            icon: (__VLS_ctx.Plus),
        }, ...__VLS_functionalComponentArgsRest(__VLS_15));
        let __VLS_18;
        let __VLS_19;
        let __VLS_20;
        const __VLS_21 = {
            onClick: (__VLS_ctx.openNew)
        };
        __VLS_17.slots.default;
        var __VLS_17;
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "tpl-grid" },
        });
        for (const [t] of __VLS_getVForSourceType((__VLS_ctx.templates))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "tpl-card" },
                key: (t.id),
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "tpl-card-body" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "tpl-card-icon" },
            });
            const __VLS_22 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_23 = __VLS_asFunctionalComponent(__VLS_22, new __VLS_22({}));
            const __VLS_24 = __VLS_23({}, ...__VLS_functionalComponentArgsRest(__VLS_23));
            __VLS_25.slots.default;
            const __VLS_26 = {}.Document;
            /** @type {[typeof __VLS_components.Document, ]} */ ;
            // @ts-ignore
            const __VLS_27 = __VLS_asFunctionalComponent(__VLS_26, new __VLS_26({}));
            const __VLS_28 = __VLS_27({}, ...__VLS_functionalComponentArgsRest(__VLS_27));
            var __VLS_25;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "tpl-card-info" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "tpl-name" },
            });
            (t.name);
            if (t.description) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "tpl-desc" },
                });
                (t.description);
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "tpl-meta" },
            });
            for (const [k] of __VLS_getVForSourceType((t.merge_keys))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "meta-tag" },
                    key: (k),
                });
                (k);
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "meta-dot" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "meta-count" },
            });
            (t.mapping_count);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "tpl-card-actions" },
            });
            const __VLS_30 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_31 = __VLS_asFunctionalComponent(__VLS_30, new __VLS_30({
                ...{ 'onClick': {} },
                type: "primary",
                size: "small",
                icon: (__VLS_ctx.Upload),
            }));
            const __VLS_32 = __VLS_31({
                ...{ 'onClick': {} },
                type: "primary",
                size: "small",
                icon: (__VLS_ctx.Upload),
            }, ...__VLS_functionalComponentArgsRest(__VLS_31));
            let __VLS_34;
            let __VLS_35;
            let __VLS_36;
            const __VLS_37 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.mode === 'list'))
                        return;
                    if (!!(__VLS_ctx.listLoading))
                        return;
                    if (!!(!__VLS_ctx.templates.length))
                        return;
                    __VLS_ctx.openMerge(t);
                }
            };
            __VLS_33.slots.default;
            var __VLS_33;
            if (__VLS_ctx.canModify(t)) {
                /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
                // @ts-ignore
                const __VLS_38 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
                    ...{ 'onClick': {} },
                    menu: "table_tools",
                    op: "U",
                    size: "small",
                    icon: (__VLS_ctx.Plus),
                }));
                const __VLS_39 = __VLS_38({
                    ...{ 'onClick': {} },
                    menu: "table_tools",
                    op: "U",
                    size: "small",
                    icon: (__VLS_ctx.Plus),
                }, ...__VLS_functionalComponentArgsRest(__VLS_38));
                let __VLS_41;
                let __VLS_42;
                let __VLS_43;
                const __VLS_44 = {
                    onClick: (...[$event]) => {
                        if (!(__VLS_ctx.mode === 'list'))
                            return;
                        if (!!(__VLS_ctx.listLoading))
                            return;
                        if (!!(!__VLS_ctx.templates.length))
                            return;
                        if (!(__VLS_ctx.canModify(t)))
                            return;
                        __VLS_ctx.openAddMapping(t.id);
                    }
                };
                __VLS_40.slots.default;
                var __VLS_40;
            }
            if (__VLS_ctx.canModify(t)) {
                /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
                // @ts-ignore
                const __VLS_45 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
                    ...{ 'onClick': {} },
                    menu: "table_tools",
                    op: "U",
                    size: "small",
                    icon: (__VLS_ctx.Edit),
                }));
                const __VLS_46 = __VLS_45({
                    ...{ 'onClick': {} },
                    menu: "table_tools",
                    op: "U",
                    size: "small",
                    icon: (__VLS_ctx.Edit),
                }, ...__VLS_functionalComponentArgsRest(__VLS_45));
                let __VLS_48;
                let __VLS_49;
                let __VLS_50;
                const __VLS_51 = {
                    onClick: (...[$event]) => {
                        if (!(__VLS_ctx.mode === 'list'))
                            return;
                        if (!!(__VLS_ctx.listLoading))
                            return;
                        if (!!(!__VLS_ctx.templates.length))
                            return;
                        if (!(__VLS_ctx.canModify(t)))
                            return;
                        __VLS_ctx.openEdit(t.id);
                    }
                };
                __VLS_47.slots.default;
                var __VLS_47;
            }
            if (__VLS_ctx.canModify(t)) {
                /** @type {[typeof PermissionButton, ]} */ ;
                // @ts-ignore
                const __VLS_52 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
                    ...{ 'onClick': {} },
                    menu: "table_tools",
                    op: "D",
                    size: "small",
                    type: "danger",
                    icon: (__VLS_ctx.Delete),
                }));
                const __VLS_53 = __VLS_52({
                    ...{ 'onClick': {} },
                    menu: "table_tools",
                    op: "D",
                    size: "small",
                    type: "danger",
                    icon: (__VLS_ctx.Delete),
                }, ...__VLS_functionalComponentArgsRest(__VLS_52));
                let __VLS_55;
                let __VLS_56;
                let __VLS_57;
                const __VLS_58 = {
                    onClick: (...[$event]) => {
                        if (!(__VLS_ctx.mode === 'list'))
                            return;
                        if (!!(__VLS_ctx.listLoading))
                            return;
                        if (!!(!__VLS_ctx.templates.length))
                            return;
                        if (!(__VLS_ctx.canModify(t)))
                            return;
                        __VLS_ctx.deleteTemplate(t);
                    }
                };
                var __VLS_54;
            }
        }
    }
}
else if (__VLS_ctx.mode === 'build') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "build-topbar" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.mode === 'list'))
                    return;
                if (!(__VLS_ctx.mode === 'build'))
                    return;
                __VLS_ctx.mode = 'list';
            } },
        ...{ class: "back-btn" },
    });
    const __VLS_59 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_60 = __VLS_asFunctionalComponent(__VLS_59, new __VLS_59({}));
    const __VLS_61 = __VLS_60({}, ...__VLS_functionalComponentArgsRest(__VLS_60));
    __VLS_62.slots.default;
    const __VLS_63 = {}.ArrowLeft;
    /** @type {[typeof __VLS_components.ArrowLeft, ]} */ ;
    // @ts-ignore
    const __VLS_64 = __VLS_asFunctionalComponent(__VLS_63, new __VLS_63({}));
    const __VLS_65 = __VLS_64({}, ...__VLS_functionalComponentArgsRest(__VLS_64));
    var __VLS_62;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
        ...{ class: "build-title" },
    });
    (__VLS_ctx.editingId ? '编辑模板' : '新建归集模板');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "build-topbar-actions" },
    });
    const __VLS_67 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_68 = __VLS_asFunctionalComponent(__VLS_67, new __VLS_67({
        ...{ 'onClick': {} },
    }));
    const __VLS_69 = __VLS_68({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_68));
    let __VLS_71;
    let __VLS_72;
    let __VLS_73;
    const __VLS_74 = {
        onClick: (...[$event]) => {
            if (!!(__VLS_ctx.mode === 'list'))
                return;
            if (!(__VLS_ctx.mode === 'build'))
                return;
            __VLS_ctx.mode = 'list';
        }
    };
    __VLS_70.slots.default;
    var __VLS_70;
    const __VLS_75 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_76 = __VLS_asFunctionalComponent(__VLS_75, new __VLS_75({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.savingTpl),
        disabled: (__VLS_ctx.buildStep !== 'form'),
    }));
    const __VLS_77 = __VLS_76({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.savingTpl),
        disabled: (__VLS_ctx.buildStep !== 'form'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_76));
    let __VLS_79;
    let __VLS_80;
    let __VLS_81;
    const __VLS_82 = {
        onClick: (__VLS_ctx.saveTemplate)
    };
    __VLS_78.slots.default;
    var __VLS_78;
    if (__VLS_ctx.buildStep === 'upload') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "build-upload-wrap" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "upload-panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
            ...{ class: "upload-heading" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "upload-sub" },
        });
        const __VLS_83 = {}.ElUpload;
        /** @type {[typeof __VLS_components.ElUpload, typeof __VLS_components.elUpload, typeof __VLS_components.ElUpload, typeof __VLS_components.elUpload, ]} */ ;
        // @ts-ignore
        const __VLS_84 = __VLS_asFunctionalComponent(__VLS_83, new __VLS_83({
            drag: true,
            multiple: true,
            autoUpload: (false),
            showFileList: (false),
            accept: ".xlsx",
            onChange: (__VLS_ctx.handleTplFileChange),
            ...{ class: "upload-dragger" },
        }));
        const __VLS_85 = __VLS_84({
            drag: true,
            multiple: true,
            autoUpload: (false),
            showFileList: (false),
            accept: ".xlsx",
            onChange: (__VLS_ctx.handleTplFileChange),
            ...{ class: "upload-dragger" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_84));
        __VLS_86.slots.default;
        const __VLS_87 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_88 = __VLS_asFunctionalComponent(__VLS_87, new __VLS_87({
            ...{ class: "upload-icon" },
        }));
        const __VLS_89 = __VLS_88({
            ...{ class: "upload-icon" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_88));
        __VLS_90.slots.default;
        const __VLS_91 = {}.Upload;
        /** @type {[typeof __VLS_components.Upload, ]} */ ;
        // @ts-ignore
        const __VLS_92 = __VLS_asFunctionalComponent(__VLS_91, new __VLS_91({}));
        const __VLS_93 = __VLS_92({}, ...__VLS_functionalComponentArgsRest(__VLS_92));
        var __VLS_90;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "upload-text" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.em, __VLS_intrinsicElements.em)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "upload-hint" },
        });
        var __VLS_86;
        if (__VLS_ctx.tplFiles.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "file-chips" },
            });
            for (const [f, i] of __VLS_getVForSourceType((__VLS_ctx.tplFiles))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "file-chip" },
                    key: (i),
                });
                const __VLS_95 = {}.ElIcon;
                /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
                // @ts-ignore
                const __VLS_96 = __VLS_asFunctionalComponent(__VLS_95, new __VLS_95({}));
                const __VLS_97 = __VLS_96({}, ...__VLS_functionalComponentArgsRest(__VLS_96));
                __VLS_98.slots.default;
                const __VLS_99 = {}.Document;
                /** @type {[typeof __VLS_components.Document, ]} */ ;
                // @ts-ignore
                const __VLS_100 = __VLS_asFunctionalComponent(__VLS_99, new __VLS_99({}));
                const __VLS_101 = __VLS_100({}, ...__VLS_functionalComponentArgsRest(__VLS_100));
                var __VLS_98;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (f.name);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!!(__VLS_ctx.mode === 'list'))
                                return;
                            if (!(__VLS_ctx.mode === 'build'))
                                return;
                            if (!(__VLS_ctx.buildStep === 'upload'))
                                return;
                            if (!(__VLS_ctx.tplFiles.length))
                                return;
                            __VLS_ctx.removeTplFile(i);
                        } },
                    ...{ class: "chip-remove" },
                });
            }
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "context-wrap" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            ...{ class: "context-label" },
        });
        const __VLS_103 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_104 = __VLS_asFunctionalComponent(__VLS_103, new __VLS_103({
            modelValue: (__VLS_ctx.aiContext),
            type: "textarea",
            rows: (3),
            placeholder: "描述本次归集的场景与你想要的标准字段，AI 会据此决定字段清单和合并粒度。可包含：&#10;· 归集场景（如：月度社保公积金、考勤汇总、报销明细）&#10;· 想要哪些标准字段、合并到什么粗细（如：每类只保留个人/单位两项，忽略基数与比例）&#10;· 哪些列要忽略、用什么作归集主键&#10;描述越具体，AI 生成的模板越贴近预期，需要手工调整的越少。",
        }));
        const __VLS_105 = __VLS_104({
            modelValue: (__VLS_ctx.aiContext),
            type: "textarea",
            rows: (3),
            placeholder: "描述本次归集的场景与你想要的标准字段，AI 会据此决定字段清单和合并粒度。可包含：&#10;· 归集场景（如：月度社保公积金、考勤汇总、报销明细）&#10;· 想要哪些标准字段、合并到什么粗细（如：每类只保留个人/单位两项，忽略基数与比例）&#10;· 哪些列要忽略、用什么作归集主键&#10;描述越具体，AI 生成的模板越贴近预期，需要手工调整的越少。",
        }, ...__VLS_functionalComponentArgsRest(__VLS_104));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "upload-actions" },
        });
        const __VLS_107 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_108 = __VLS_asFunctionalComponent(__VLS_107, new __VLS_107({
            ...{ 'onClick': {} },
        }));
        const __VLS_109 = __VLS_108({
            ...{ 'onClick': {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_108));
        let __VLS_111;
        let __VLS_112;
        let __VLS_113;
        const __VLS_114 = {
            onClick: (__VLS_ctx.skipToManual)
        };
        __VLS_110.slots.default;
        var __VLS_110;
        const __VLS_115 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_116 = __VLS_asFunctionalComponent(__VLS_115, new __VLS_115({
            ...{ 'onClick': {} },
            type: "primary",
            icon: (__VLS_ctx.MagicStick),
            disabled: (!__VLS_ctx.tplFiles.length),
        }));
        const __VLS_117 = __VLS_116({
            ...{ 'onClick': {} },
            type: "primary",
            icon: (__VLS_ctx.MagicStick),
            disabled: (!__VLS_ctx.tplFiles.length),
        }, ...__VLS_functionalComponentArgsRest(__VLS_116));
        let __VLS_119;
        let __VLS_120;
        let __VLS_121;
        const __VLS_122 = {
            onClick: (__VLS_ctx.runAiDraft)
        };
        __VLS_118.slots.default;
        var __VLS_118;
    }
    else if (__VLS_ctx.buildStep === 'ai') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "ai-loading-wrap" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "ai-spinner" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
            ...{ class: "spinner-ring" },
        });
        const __VLS_123 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_124 = __VLS_asFunctionalComponent(__VLS_123, new __VLS_123({
            ...{ class: "spinner-icon" },
        }));
        const __VLS_125 = __VLS_124({
            ...{ class: "spinner-icon" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_124));
        __VLS_126.slots.default;
        const __VLS_127 = {}.MagicStick;
        /** @type {[typeof __VLS_components.MagicStick, ]} */ ;
        // @ts-ignore
        const __VLS_128 = __VLS_asFunctionalComponent(__VLS_127, new __VLS_127({}));
        const __VLS_129 = __VLS_128({}, ...__VLS_functionalComponentArgsRest(__VLS_128));
        var __VLS_126;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
            ...{ class: "ai-loading-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "ai-loading-sub" },
        });
        (__VLS_ctx.tplFiles.length);
    }
    else {
        if (__VLS_ctx.draft?._meta?.low_confidence?.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "confidence-alert" },
            });
            const __VLS_131 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_132 = __VLS_asFunctionalComponent(__VLS_131, new __VLS_131({}));
            const __VLS_133 = __VLS_132({}, ...__VLS_functionalComponentArgsRest(__VLS_132));
            __VLS_134.slots.default;
            const __VLS_135 = {}.Warning;
            /** @type {[typeof __VLS_components.Warning, ]} */ ;
            // @ts-ignore
            const __VLS_136 = __VLS_asFunctionalComponent(__VLS_135, new __VLS_135({}));
            const __VLS_137 = __VLS_136({}, ...__VLS_functionalComponentArgsRest(__VLS_136));
            var __VLS_134;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            for (const [lc] of __VLS_getVForSourceType((__VLS_ctx.draft._meta.low_confidence))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({
                    key: (lc.sheet),
                    ...{ style: {} },
                });
                (lc.sheet);
                (Math.round(lc.confidence * 100));
            }
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "build-layout" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "build-left" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "form-section" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
            ...{ class: "section-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "field-group" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            ...{ class: "field-label required" },
        });
        const __VLS_139 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_140 = __VLS_asFunctionalComponent(__VLS_139, new __VLS_139({
            modelValue: (__VLS_ctx.form.name),
            placeholder: "如：社保月度归集",
        }));
        const __VLS_141 = __VLS_140({
            modelValue: (__VLS_ctx.form.name),
            placeholder: "如：社保月度归集",
        }, ...__VLS_functionalComponentArgsRest(__VLS_140));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "field-group" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            ...{ class: "field-label" },
        });
        const __VLS_143 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_144 = __VLS_asFunctionalComponent(__VLS_143, new __VLS_143({
            modelValue: (__VLS_ctx.form.description),
            placeholder: "可选",
        }));
        const __VLS_145 = __VLS_144({
            modelValue: (__VLS_ctx.form.description),
            placeholder: "可选",
        }, ...__VLS_functionalComponentArgsRest(__VLS_144));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "form-section" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
            ...{ class: "section-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "section-desc" },
        });
        const __VLS_147 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_148 = __VLS_asFunctionalComponent(__VLS_147, new __VLS_147({
            modelValue: (__VLS_ctx.form.merge_keys),
            multiple: true,
            allowCreate: true,
            filterable: true,
            placeholder: "输入后回车",
            ...{ style: {} },
        }));
        const __VLS_149 = __VLS_148({
            modelValue: (__VLS_ctx.form.merge_keys),
            multiple: true,
            allowCreate: true,
            filterable: true,
            placeholder: "输入后回车",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_148));
        __VLS_150.slots.default;
        for (const [k] of __VLS_getVForSourceType((__VLS_ctx.form.merge_keys))) {
            const __VLS_151 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_152 = __VLS_asFunctionalComponent(__VLS_151, new __VLS_151({
                key: (k),
                label: (k),
                value: (k),
            }));
            const __VLS_153 = __VLS_152({
                key: (k),
                label: (k),
                value: (k),
            }, ...__VLS_functionalComponentArgsRest(__VLS_152));
        }
        var __VLS_150;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "form-section" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
            ...{ class: "section-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "required-mark" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "section-desc" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "std-tags" },
        });
        for (const [f] of __VLS_getVForSourceType((__VLS_ctx.form.std_fields))) {
            const __VLS_155 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_156 = __VLS_asFunctionalComponent(__VLS_155, new __VLS_155({
                ...{ 'onClose': {} },
                ...{ 'onDragstart': {} },
                ...{ 'onDragend': {} },
                ...{ 'onDragover': {} },
                ...{ 'onDrop': {} },
                key: (f),
                closable: true,
                ...{ class: "std-tag" },
                draggable: "true",
            }));
            const __VLS_157 = __VLS_156({
                ...{ 'onClose': {} },
                ...{ 'onDragstart': {} },
                ...{ 'onDragend': {} },
                ...{ 'onDragover': {} },
                ...{ 'onDrop': {} },
                key: (f),
                closable: true,
                ...{ class: "std-tag" },
                draggable: "true",
            }, ...__VLS_functionalComponentArgsRest(__VLS_156));
            let __VLS_159;
            let __VLS_160;
            let __VLS_161;
            const __VLS_162 = {
                onClose: (...[$event]) => {
                    if (!!(__VLS_ctx.mode === 'list'))
                        return;
                    if (!(__VLS_ctx.mode === 'build'))
                        return;
                    if (!!(__VLS_ctx.buildStep === 'upload'))
                        return;
                    if (!!(__VLS_ctx.buildStep === 'ai'))
                        return;
                    __VLS_ctx.removeStdField(f);
                }
            };
            const __VLS_163 = {
                onDragstart: (...[$event]) => {
                    if (!!(__VLS_ctx.mode === 'list'))
                        return;
                    if (!(__VLS_ctx.mode === 'build'))
                        return;
                    if (!!(__VLS_ctx.buildStep === 'upload'))
                        return;
                    if (!!(__VLS_ctx.buildStep === 'ai'))
                        return;
                    __VLS_ctx.draggingStdField = f;
                }
            };
            const __VLS_164 = {
                onDragend: (...[$event]) => {
                    if (!!(__VLS_ctx.mode === 'list'))
                        return;
                    if (!(__VLS_ctx.mode === 'build'))
                        return;
                    if (!!(__VLS_ctx.buildStep === 'upload'))
                        return;
                    if (!!(__VLS_ctx.buildStep === 'ai'))
                        return;
                    __VLS_ctx.draggingStdField = '';
                }
            };
            const __VLS_165 = {
                onDragover: () => { }
            };
            const __VLS_166 = {
                onDrop: (...[$event]) => {
                    if (!!(__VLS_ctx.mode === 'list'))
                        return;
                    if (!(__VLS_ctx.mode === 'build'))
                        return;
                    if (!!(__VLS_ctx.buildStep === 'upload'))
                        return;
                    if (!!(__VLS_ctx.buildStep === 'ai'))
                        return;
                    __VLS_ctx.reorderStdField(__VLS_ctx.draggingStdField, f);
                    __VLS_ctx.draggingStdField = '';
                }
            };
            __VLS_158.slots.default;
            (f);
            var __VLS_158;
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "std-add" },
        });
        const __VLS_167 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_168 = __VLS_asFunctionalComponent(__VLS_167, new __VLS_167({
            ...{ 'onKeyup': {} },
            modelValue: (__VLS_ctx.stdFieldInput),
            placeholder: "输入字段名后添加",
            size: "small",
        }));
        const __VLS_169 = __VLS_168({
            ...{ 'onKeyup': {} },
            modelValue: (__VLS_ctx.stdFieldInput),
            placeholder: "输入字段名后添加",
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_168));
        let __VLS_171;
        let __VLS_172;
        let __VLS_173;
        const __VLS_174 = {
            onKeyup: (__VLS_ctx.addStdField)
        };
        var __VLS_170;
        const __VLS_175 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_176 = __VLS_asFunctionalComponent(__VLS_175, new __VLS_175({
            ...{ 'onClick': {} },
            size: "small",
        }));
        const __VLS_177 = __VLS_176({
            ...{ 'onClick': {} },
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_176));
        let __VLS_179;
        let __VLS_180;
        let __VLS_181;
        const __VLS_182 = {
            onClick: (__VLS_ctx.addStdField)
        };
        __VLS_178.slots.default;
        var __VLS_178;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "build-right" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "mappings-header" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
            ...{ class: "section-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "mappings-count" },
        });
        (__VLS_ctx.form.mappings.length);
        if (__VLS_ctx.editingId) {
            const __VLS_183 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_184 = __VLS_asFunctionalComponent(__VLS_183, new __VLS_183({
                ...{ 'onClick': {} },
                size: "small",
                type: "primary",
                plain: true,
                icon: (__VLS_ctx.Plus),
            }));
            const __VLS_185 = __VLS_184({
                ...{ 'onClick': {} },
                size: "small",
                type: "primary",
                plain: true,
                icon: (__VLS_ctx.Plus),
            }, ...__VLS_functionalComponentArgsRest(__VLS_184));
            let __VLS_187;
            let __VLS_188;
            let __VLS_189;
            const __VLS_190 = {
                onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.mode === 'list'))
                        return;
                    if (!(__VLS_ctx.mode === 'build'))
                        return;
                    if (!!(__VLS_ctx.buildStep === 'upload'))
                        return;
                    if (!!(__VLS_ctx.buildStep === 'ai'))
                        return;
                    if (!(__VLS_ctx.editingId))
                        return;
                    __VLS_ctx.openAddMapping(__VLS_ctx.editingId);
                }
            };
            __VLS_186.slots.default;
            var __VLS_186;
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "section-desc" },
            ...{ style: {} },
        });
        if (!__VLS_ctx.form.mappings.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "mappings-empty" },
            });
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "mapping-list" },
        });
        for (const [m, idx] of __VLS_getVForSourceType((__VLS_ctx.form.mappings))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (idx),
                ...{ class: "mapping-item" },
                ...{ class: ({ expanded: __VLS_ctx.expandedMapping === idx }) },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.mode === 'list'))
                            return;
                        if (!(__VLS_ctx.mode === 'build'))
                            return;
                        if (!!(__VLS_ctx.buildStep === 'upload'))
                            return;
                        if (!!(__VLS_ctx.buildStep === 'ai'))
                            return;
                        __VLS_ctx.expandedMapping === idx ? __VLS_ctx.cancelEditMapping() : __VLS_ctx.startEditMapping(idx);
                    } },
                ...{ class: "mapping-header" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "mapping-header-left" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "mapping-chevron" },
                ...{ class: ({ rotated: __VLS_ctx.expandedMapping === idx }) },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "mapping-name" },
            });
            (m.name);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "mapping-meta" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (m.header_start);
            (m.header_end);
            if (m.sheet_kw) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (m.sheet_kw);
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (Object.keys(m.column_map || {}).length);
            if (__VLS_ctx.aiLowConfidence(m.name)) {
                const __VLS_191 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_192 = __VLS_asFunctionalComponent(__VLS_191, new __VLS_191({
                    type: "warning",
                    size: "small",
                }));
                const __VLS_193 = __VLS_192({
                    type: "warning",
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_192));
                __VLS_194.slots.default;
                (Math.round((__VLS_ctx.aiLowConfidence(m.name)?.confidence || 0) * 100));
                var __VLS_194;
            }
            if (__VLS_ctx.expandedMapping === idx && __VLS_ctx.editingMapping) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "mapping-editor" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "editor-row" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "editor-field" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                    ...{ class: "editor-label" },
                });
                const __VLS_195 = {}.ElInput;
                /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                // @ts-ignore
                const __VLS_196 = __VLS_asFunctionalComponent(__VLS_195, new __VLS_195({
                    modelValue: (__VLS_ctx.editingMapping.name),
                    size: "small",
                    placeholder: "例如：北京-公积金导出表",
                }));
                const __VLS_197 = __VLS_196({
                    modelValue: (__VLS_ctx.editingMapping.name),
                    size: "small",
                    placeholder: "例如：北京-公积金导出表",
                }, ...__VLS_functionalComponentArgsRest(__VLS_196));
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "editor-field" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                    ...{ class: "editor-label" },
                });
                const __VLS_199 = {}.ElInput;
                /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                // @ts-ignore
                const __VLS_200 = __VLS_asFunctionalComponent(__VLS_199, new __VLS_199({
                    ...{ 'onUpdate:modelValue': {} },
                    modelValue: ((__VLS_ctx.editingMapping.match_signature || []).join(',')),
                    size: "small",
                    placeholder: "姓名,证件号码,缴存基数",
                }));
                const __VLS_201 = __VLS_200({
                    ...{ 'onUpdate:modelValue': {} },
                    modelValue: ((__VLS_ctx.editingMapping.match_signature || []).join(',')),
                    size: "small",
                    placeholder: "姓名,证件号码,缴存基数",
                }, ...__VLS_functionalComponentArgsRest(__VLS_200));
                let __VLS_203;
                let __VLS_204;
                let __VLS_205;
                const __VLS_206 = {
                    'onUpdate:modelValue': (...[$event]) => {
                        if (!!(__VLS_ctx.mode === 'list'))
                            return;
                        if (!(__VLS_ctx.mode === 'build'))
                            return;
                        if (!!(__VLS_ctx.buildStep === 'upload'))
                            return;
                        if (!!(__VLS_ctx.buildStep === 'ai'))
                            return;
                        if (!(__VLS_ctx.expandedMapping === idx && __VLS_ctx.editingMapping))
                            return;
                        __VLS_ctx.editingMapping.match_signature = $event.split(',').map((v) => v.trim()).filter(Boolean);
                    }
                };
                var __VLS_202;
                if (__VLS_ctx.editingId) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "editor-row" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "editor-field" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                        ...{ class: "editor-label" },
                    });
                    const __VLS_207 = {}.ElUpload;
                    /** @type {[typeof __VLS_components.ElUpload, typeof __VLS_components.elUpload, typeof __VLS_components.ElUpload, typeof __VLS_components.elUpload, ]} */ ;
                    // @ts-ignore
                    const __VLS_208 = __VLS_asFunctionalComponent(__VLS_207, new __VLS_207({
                        autoUpload: (false),
                        showFileList: (false),
                        accept: ".xlsx",
                        disabled: (__VLS_ctx.mappingDraftLoading),
                        onChange: (__VLS_ctx.handleMappingSample),
                    }));
                    const __VLS_209 = __VLS_208({
                        autoUpload: (false),
                        showFileList: (false),
                        accept: ".xlsx",
                        disabled: (__VLS_ctx.mappingDraftLoading),
                        onChange: (__VLS_ctx.handleMappingSample),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_208));
                    __VLS_210.slots.default;
                    const __VLS_211 = {}.ElButton;
                    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                    // @ts-ignore
                    const __VLS_212 = __VLS_asFunctionalComponent(__VLS_211, new __VLS_211({
                        size: "small",
                        loading: (__VLS_ctx.mappingDraftLoading),
                        icon: (__VLS_ctx.Upload),
                    }));
                    const __VLS_213 = __VLS_212({
                        size: "small",
                        loading: (__VLS_ctx.mappingDraftLoading),
                        icon: (__VLS_ctx.Upload),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_212));
                    __VLS_214.slots.default;
                    var __VLS_214;
                    var __VLS_210;
                    if (__VLS_ctx.mappingDraftSheets.length > 1) {
                        const __VLS_215 = {}.ElSelect;
                        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                        // @ts-ignore
                        const __VLS_216 = __VLS_asFunctionalComponent(__VLS_215, new __VLS_215({
                            ...{ 'onChange': {} },
                            modelValue: (__VLS_ctx.mappingDraftSheet),
                            size: "small",
                            placeholder: "选择要解析的 Sheet",
                            ...{ style: {} },
                        }));
                        const __VLS_217 = __VLS_216({
                            ...{ 'onChange': {} },
                            modelValue: (__VLS_ctx.mappingDraftSheet),
                            size: "small",
                            placeholder: "选择要解析的 Sheet",
                            ...{ style: {} },
                        }, ...__VLS_functionalComponentArgsRest(__VLS_216));
                        let __VLS_219;
                        let __VLS_220;
                        let __VLS_221;
                        const __VLS_222 = {
                            onChange: (__VLS_ctx.reloadMappingDraft)
                        };
                        __VLS_218.slots.default;
                        for (const [sheet] of __VLS_getVForSourceType((__VLS_ctx.mappingDraftSheets))) {
                            const __VLS_223 = {}.ElOption;
                            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                            // @ts-ignore
                            const __VLS_224 = __VLS_asFunctionalComponent(__VLS_223, new __VLS_223({
                                key: (sheet),
                                label: (sheet),
                                value: (sheet),
                            }));
                            const __VLS_225 = __VLS_224({
                                key: (sheet),
                                label: (sheet),
                                value: (sheet),
                            }, ...__VLS_functionalComponentArgsRest(__VLS_224));
                        }
                        var __VLS_218;
                    }
                    if (__VLS_ctx.mappingDraftLowConfidence) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                            ...{ class: "ai-notes" },
                        });
                        (Math.round(__VLS_ctx.mappingDraftLowConfidence.confidence * 100));
                        (__VLS_ctx.mappingDraftLowConfidence.notes);
                    }
                    for (const [warning] of __VLS_getVForSourceType((__VLS_ctx.mappingDraftWarnings))) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                            key: (warning),
                            ...{ class: "ai-notes" },
                        });
                        (warning);
                    }
                }
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "editor-row" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "editor-field" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                    ...{ class: "editor-label" },
                });
                const __VLS_227 = {}.ElInput;
                /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                // @ts-ignore
                const __VLS_228 = __VLS_asFunctionalComponent(__VLS_227, new __VLS_227({
                    modelValue: (__VLS_ctx.editingMapping.sheet_kw),
                    size: "small",
                    placeholder: "留空匹配全部 sheet",
                }));
                const __VLS_229 = __VLS_228({
                    modelValue: (__VLS_ctx.editingMapping.sheet_kw),
                    size: "small",
                    placeholder: "留空匹配全部 sheet",
                }, ...__VLS_functionalComponentArgsRest(__VLS_228));
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "editor-field" },
                    ...{ style: {} },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                    ...{ class: "editor-label" },
                });
                const __VLS_231 = {}.ElInputNumber;
                /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
                // @ts-ignore
                const __VLS_232 = __VLS_asFunctionalComponent(__VLS_231, new __VLS_231({
                    modelValue: (__VLS_ctx.editingMapping.header_start),
                    min: (1),
                    max: (10),
                    size: "small",
                }));
                const __VLS_233 = __VLS_232({
                    modelValue: (__VLS_ctx.editingMapping.header_start),
                    min: (1),
                    max: (10),
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_232));
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "editor-field" },
                    ...{ style: {} },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                    ...{ class: "editor-label" },
                });
                const __VLS_235 = {}.ElInputNumber;
                /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
                // @ts-ignore
                const __VLS_236 = __VLS_asFunctionalComponent(__VLS_235, new __VLS_235({
                    modelValue: (__VLS_ctx.editingMapping.header_end),
                    min: (1),
                    max: (10),
                    size: "small",
                }));
                const __VLS_237 = __VLS_236({
                    modelValue: (__VLS_ctx.editingMapping.header_end),
                    min: (1),
                    max: (10),
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_236));
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "editor-section" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "editor-section-header" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (__VLS_ctx.addKeyMapEntry) },
                    ...{ class: "add-row-btn" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "map-table" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "map-row map-row-head" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                for (const [entry, ei] of __VLS_getVForSourceType((__VLS_ctx.editingKeyMapEntries))) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "map-row" },
                        key: (ei),
                    });
                    const __VLS_239 = {}.ElInput;
                    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                    // @ts-ignore
                    const __VLS_240 = __VLS_asFunctionalComponent(__VLS_239, new __VLS_239({
                        ...{ 'onChange': {} },
                        modelValue: (entry.key),
                        size: "small",
                        placeholder: "源列名",
                    }));
                    const __VLS_241 = __VLS_240({
                        ...{ 'onChange': {} },
                        modelValue: (entry.key),
                        size: "small",
                        placeholder: "源列名",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_240));
                    let __VLS_243;
                    let __VLS_244;
                    let __VLS_245;
                    const __VLS_246 = {
                        onChange: (...[$event]) => {
                            if (!!(__VLS_ctx.mode === 'list'))
                                return;
                            if (!(__VLS_ctx.mode === 'build'))
                                return;
                            if (!!(__VLS_ctx.buildStep === 'upload'))
                                return;
                            if (!!(__VLS_ctx.buildStep === 'ai'))
                                return;
                            if (!(__VLS_ctx.expandedMapping === idx && __VLS_ctx.editingMapping))
                                return;
                            __VLS_ctx.syncKeyMap(__VLS_ctx.editingKeyMapEntries);
                        }
                    };
                    var __VLS_242;
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "map-arrow" },
                    });
                    const __VLS_247 = {}.ElSelect;
                    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                    // @ts-ignore
                    const __VLS_248 = __VLS_asFunctionalComponent(__VLS_247, new __VLS_247({
                        ...{ 'onChange': {} },
                        modelValue: (entry.val),
                        size: "small",
                        allowCreate: true,
                        filterable: true,
                    }));
                    const __VLS_249 = __VLS_248({
                        ...{ 'onChange': {} },
                        modelValue: (entry.val),
                        size: "small",
                        allowCreate: true,
                        filterable: true,
                    }, ...__VLS_functionalComponentArgsRest(__VLS_248));
                    let __VLS_251;
                    let __VLS_252;
                    let __VLS_253;
                    const __VLS_254 = {
                        onChange: (...[$event]) => {
                            if (!!(__VLS_ctx.mode === 'list'))
                                return;
                            if (!(__VLS_ctx.mode === 'build'))
                                return;
                            if (!!(__VLS_ctx.buildStep === 'upload'))
                                return;
                            if (!!(__VLS_ctx.buildStep === 'ai'))
                                return;
                            if (!(__VLS_ctx.expandedMapping === idx && __VLS_ctx.editingMapping))
                                return;
                            __VLS_ctx.syncKeyMap(__VLS_ctx.editingKeyMapEntries);
                        }
                    };
                    __VLS_250.slots.default;
                    for (const [k] of __VLS_getVForSourceType((__VLS_ctx.form.merge_keys))) {
                        const __VLS_255 = {}.ElOption;
                        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                        // @ts-ignore
                        const __VLS_256 = __VLS_asFunctionalComponent(__VLS_255, new __VLS_255({
                            key: (k),
                            label: (k),
                            value: (k),
                        }));
                        const __VLS_257 = __VLS_256({
                            key: (k),
                            label: (k),
                            value: (k),
                        }, ...__VLS_functionalComponentArgsRest(__VLS_256));
                    }
                    var __VLS_250;
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                        ...{ onClick: (() => { __VLS_ctx.editingKeyMapEntries.splice(ei, 1); __VLS_ctx.syncKeyMap(__VLS_ctx.editingKeyMapEntries); }) },
                        ...{ class: "del-row-btn" },
                    });
                }
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "editor-section" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "editor-section-header" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (__VLS_ctx.addColumnMapEntry) },
                    ...{ class: "add-row-btn" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "map-table" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "map-row map-row-head" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                for (const [entry, ei] of __VLS_getVForSourceType((__VLS_ctx.editingColMapEntries))) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "map-row" },
                        key: (ei),
                    });
                    const __VLS_259 = {}.ElInput;
                    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                    // @ts-ignore
                    const __VLS_260 = __VLS_asFunctionalComponent(__VLS_259, new __VLS_259({
                        ...{ 'onChange': {} },
                        modelValue: (entry.key),
                        size: "small",
                        placeholder: "源列名",
                    }));
                    const __VLS_261 = __VLS_260({
                        ...{ 'onChange': {} },
                        modelValue: (entry.key),
                        size: "small",
                        placeholder: "源列名",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_260));
                    let __VLS_263;
                    let __VLS_264;
                    let __VLS_265;
                    const __VLS_266 = {
                        onChange: (...[$event]) => {
                            if (!!(__VLS_ctx.mode === 'list'))
                                return;
                            if (!(__VLS_ctx.mode === 'build'))
                                return;
                            if (!!(__VLS_ctx.buildStep === 'upload'))
                                return;
                            if (!!(__VLS_ctx.buildStep === 'ai'))
                                return;
                            if (!(__VLS_ctx.expandedMapping === idx && __VLS_ctx.editingMapping))
                                return;
                            __VLS_ctx.syncColumnMap(__VLS_ctx.editingColMapEntries);
                        }
                    };
                    var __VLS_262;
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "map-arrow" },
                    });
                    const __VLS_267 = {}.ElSelect;
                    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                    // @ts-ignore
                    const __VLS_268 = __VLS_asFunctionalComponent(__VLS_267, new __VLS_267({
                        ...{ 'onChange': {} },
                        modelValue: (entry.val),
                        size: "small",
                        allowCreate: true,
                        filterable: true,
                    }));
                    const __VLS_269 = __VLS_268({
                        ...{ 'onChange': {} },
                        modelValue: (entry.val),
                        size: "small",
                        allowCreate: true,
                        filterable: true,
                    }, ...__VLS_functionalComponentArgsRest(__VLS_268));
                    let __VLS_271;
                    let __VLS_272;
                    let __VLS_273;
                    const __VLS_274 = {
                        onChange: (...[$event]) => {
                            if (!!(__VLS_ctx.mode === 'list'))
                                return;
                            if (!(__VLS_ctx.mode === 'build'))
                                return;
                            if (!!(__VLS_ctx.buildStep === 'upload'))
                                return;
                            if (!!(__VLS_ctx.buildStep === 'ai'))
                                return;
                            if (!(__VLS_ctx.expandedMapping === idx && __VLS_ctx.editingMapping))
                                return;
                            __VLS_ctx.syncColumnMap(__VLS_ctx.editingColMapEntries);
                        }
                    };
                    __VLS_270.slots.default;
                    for (const [f] of __VLS_getVForSourceType((__VLS_ctx.form.std_fields))) {
                        const __VLS_275 = {}.ElOption;
                        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                        // @ts-ignore
                        const __VLS_276 = __VLS_asFunctionalComponent(__VLS_275, new __VLS_275({
                            key: (f),
                            label: (f),
                            value: (f),
                        }));
                        const __VLS_277 = __VLS_276({
                            key: (f),
                            label: (f),
                            value: (f),
                        }, ...__VLS_functionalComponentArgsRest(__VLS_276));
                    }
                    var __VLS_270;
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                        ...{ onClick: (() => { __VLS_ctx.editingColMapEntries.splice(ei, 1); __VLS_ctx.syncColumnMap(__VLS_ctx.editingColMapEntries); }) },
                        ...{ class: "del-row-btn" },
                    });
                }
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "editor-section" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "editor-section-header" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (__VLS_ctx.addDerivedField) },
                    ...{ class: "add-row-btn" },
                });
                if (!__VLS_ctx.editingMapping.derived_fields?.length) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "derived-empty" },
                    });
                }
                for (const [df, di] of __VLS_getVForSourceType((__VLS_ctx.editingMapping.derived_fields))) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "derived-row" },
                        key: (di),
                    });
                    const __VLS_279 = {}.ElSelect;
                    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                    // @ts-ignore
                    const __VLS_280 = __VLS_asFunctionalComponent(__VLS_279, new __VLS_279({
                        modelValue: (df.target),
                        size: "small",
                        allowCreate: true,
                        filterable: true,
                        placeholder: "目标标准字段",
                        ...{ style: {} },
                    }));
                    const __VLS_281 = __VLS_280({
                        modelValue: (df.target),
                        size: "small",
                        allowCreate: true,
                        filterable: true,
                        placeholder: "目标标准字段",
                        ...{ style: {} },
                    }, ...__VLS_functionalComponentArgsRest(__VLS_280));
                    __VLS_282.slots.default;
                    for (const [f] of __VLS_getVForSourceType((__VLS_ctx.form.std_fields))) {
                        const __VLS_283 = {}.ElOption;
                        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                        // @ts-ignore
                        const __VLS_284 = __VLS_asFunctionalComponent(__VLS_283, new __VLS_283({
                            key: (f),
                            label: (f),
                            value: (f),
                        }));
                        const __VLS_285 = __VLS_284({
                            key: (f),
                            label: (f),
                            value: (f),
                        }, ...__VLS_functionalComponentArgsRest(__VLS_284));
                    }
                    var __VLS_282;
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "map-arrow" },
                    });
                    const __VLS_287 = {}.ElInput;
                    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                    // @ts-ignore
                    const __VLS_288 = __VLS_asFunctionalComponent(__VLS_287, new __VLS_287({
                        modelValue: (df.expr),
                        size: "small",
                        placeholder: "{列名A}+{列名B}",
                        ...{ style: {} },
                    }));
                    const __VLS_289 = __VLS_288({
                        modelValue: (df.expr),
                        size: "small",
                        placeholder: "{列名A}+{列名B}",
                        ...{ style: {} },
                    }, ...__VLS_functionalComponentArgsRest(__VLS_288));
                    const __VLS_291 = {}.ElInputNumber;
                    /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
                    // @ts-ignore
                    const __VLS_292 = __VLS_asFunctionalComponent(__VLS_291, new __VLS_291({
                        modelValue: (df.round),
                        min: (0),
                        max: (6),
                        size: "small",
                        ...{ style: {} },
                        controls: (false),
                        placeholder: "小数位",
                    }));
                    const __VLS_293 = __VLS_292({
                        modelValue: (df.round),
                        min: (0),
                        max: (6),
                        size: "small",
                        ...{ style: {} },
                        controls: (false),
                        placeholder: "小数位",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_292));
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                        ...{ onClick: (...[$event]) => {
                                if (!!(__VLS_ctx.mode === 'list'))
                                    return;
                                if (!(__VLS_ctx.mode === 'build'))
                                    return;
                                if (!!(__VLS_ctx.buildStep === 'upload'))
                                    return;
                                if (!!(__VLS_ctx.buildStep === 'ai'))
                                    return;
                                if (!(__VLS_ctx.expandedMapping === idx && __VLS_ctx.editingMapping))
                                    return;
                                __VLS_ctx.removeDerivedField(di);
                            } },
                        ...{ class: "del-row-btn" },
                    });
                }
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "editor-actions" },
                });
                /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
                // @ts-ignore
                const __VLS_295 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
                    ...{ 'onClick': {} },
                    menu: "table_tools",
                    op: "D",
                    size: "small",
                    type: "danger",
                }));
                const __VLS_296 = __VLS_295({
                    ...{ 'onClick': {} },
                    menu: "table_tools",
                    op: "D",
                    size: "small",
                    type: "danger",
                }, ...__VLS_functionalComponentArgsRest(__VLS_295));
                let __VLS_298;
                let __VLS_299;
                let __VLS_300;
                const __VLS_301 = {
                    onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.mode === 'list'))
                            return;
                        if (!(__VLS_ctx.mode === 'build'))
                            return;
                        if (!!(__VLS_ctx.buildStep === 'upload'))
                            return;
                        if (!!(__VLS_ctx.buildStep === 'ai'))
                            return;
                        if (!(__VLS_ctx.expandedMapping === idx && __VLS_ctx.editingMapping))
                            return;
                        __VLS_ctx.removeMapping(idx);
                    }
                };
                __VLS_297.slots.default;
                var __VLS_297;
                const __VLS_302 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_303 = __VLS_asFunctionalComponent(__VLS_302, new __VLS_302({
                    ...{ 'onClick': {} },
                    size: "small",
                }));
                const __VLS_304 = __VLS_303({
                    ...{ 'onClick': {} },
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_303));
                let __VLS_306;
                let __VLS_307;
                let __VLS_308;
                const __VLS_309 = {
                    onClick: (__VLS_ctx.cancelEditMapping)
                };
                __VLS_305.slots.default;
                var __VLS_305;
                const __VLS_310 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_311 = __VLS_asFunctionalComponent(__VLS_310, new __VLS_310({
                    ...{ 'onClick': {} },
                    size: "small",
                    type: "primary",
                    icon: (__VLS_ctx.CircleCheck),
                }));
                const __VLS_312 = __VLS_311({
                    ...{ 'onClick': {} },
                    size: "small",
                    type: "primary",
                    icon: (__VLS_ctx.CircleCheck),
                }, ...__VLS_functionalComponentArgsRest(__VLS_311));
                let __VLS_314;
                let __VLS_315;
                let __VLS_316;
                const __VLS_317 = {
                    onClick: (__VLS_ctx.saveEditMapping)
                };
                __VLS_313.slots.default;
                var __VLS_313;
                if (__VLS_ctx.aiLowConfidence(m.name)?.notes) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "ai-notes" },
                    });
                    (__VLS_ctx.aiLowConfidence(m.name)?.notes);
                }
            }
        }
    }
}
else if (__VLS_ctx.mode === 'mapping') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "build-topbar" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.mode === 'list'))
                    return;
                if (!!(__VLS_ctx.mode === 'build'))
                    return;
                if (!(__VLS_ctx.mode === 'mapping'))
                    return;
                __VLS_ctx.mode = 'list';
            } },
        ...{ class: "back-btn" },
    });
    const __VLS_318 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_319 = __VLS_asFunctionalComponent(__VLS_318, new __VLS_318({}));
    const __VLS_320 = __VLS_319({}, ...__VLS_functionalComponentArgsRest(__VLS_319));
    __VLS_321.slots.default;
    const __VLS_322 = {}.ArrowLeft;
    /** @type {[typeof __VLS_components.ArrowLeft, ]} */ ;
    // @ts-ignore
    const __VLS_323 = __VLS_asFunctionalComponent(__VLS_322, new __VLS_322({}));
    const __VLS_324 = __VLS_323({}, ...__VLS_functionalComponentArgsRest(__VLS_323));
    var __VLS_321;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
        ...{ class: "build-title" },
    });
    (__VLS_ctx.mappingWizardTemplate?.name);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "build-topbar-actions" },
    });
    const __VLS_326 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_327 = __VLS_asFunctionalComponent(__VLS_326, new __VLS_326({
        ...{ 'onClick': {} },
    }));
    const __VLS_328 = __VLS_327({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_327));
    let __VLS_330;
    let __VLS_331;
    let __VLS_332;
    const __VLS_333 = {
        onClick: (...[$event]) => {
            if (!!(__VLS_ctx.mode === 'list'))
                return;
            if (!!(__VLS_ctx.mode === 'build'))
                return;
            if (!(__VLS_ctx.mode === 'mapping'))
                return;
            __VLS_ctx.mode = 'list';
        }
    };
    __VLS_329.slots.default;
    var __VLS_329;
    if (__VLS_ctx.mappingWizardStep === 'confirm') {
        const __VLS_334 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_335 = __VLS_asFunctionalComponent(__VLS_334, new __VLS_334({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.mappingWizardSaving),
        }));
        const __VLS_336 = __VLS_335({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.mappingWizardSaving),
        }, ...__VLS_functionalComponentArgsRest(__VLS_335));
        let __VLS_338;
        let __VLS_339;
        let __VLS_340;
        const __VLS_341 = {
            onClick: (__VLS_ctx.saveMappingDrafts)
        };
        __VLS_337.slots.default;
        (__VLS_ctx.mappingWizardDrafts.length);
        var __VLS_337;
    }
    if (__VLS_ctx.mappingWizardStep === 'upload') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "build-upload-wrap" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "upload-panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
            ...{ class: "upload-heading" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "upload-sub" },
        });
        const __VLS_342 = {}.ElUpload;
        /** @type {[typeof __VLS_components.ElUpload, typeof __VLS_components.elUpload, typeof __VLS_components.ElUpload, typeof __VLS_components.elUpload, ]} */ ;
        // @ts-ignore
        const __VLS_343 = __VLS_asFunctionalComponent(__VLS_342, new __VLS_342({
            drag: true,
            multiple: true,
            autoUpload: (false),
            showFileList: (false),
            accept: ".xlsx",
            onChange: (__VLS_ctx.handleMappingWizardFile),
            ...{ class: "upload-dragger" },
        }));
        const __VLS_344 = __VLS_343({
            drag: true,
            multiple: true,
            autoUpload: (false),
            showFileList: (false),
            accept: ".xlsx",
            onChange: (__VLS_ctx.handleMappingWizardFile),
            ...{ class: "upload-dragger" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_343));
        __VLS_345.slots.default;
        const __VLS_346 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_347 = __VLS_asFunctionalComponent(__VLS_346, new __VLS_346({
            ...{ class: "upload-icon" },
        }));
        const __VLS_348 = __VLS_347({
            ...{ class: "upload-icon" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_347));
        __VLS_349.slots.default;
        const __VLS_350 = {}.Upload;
        /** @type {[typeof __VLS_components.Upload, ]} */ ;
        // @ts-ignore
        const __VLS_351 = __VLS_asFunctionalComponent(__VLS_350, new __VLS_350({}));
        const __VLS_352 = __VLS_351({}, ...__VLS_functionalComponentArgsRest(__VLS_351));
        var __VLS_349;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "upload-text" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.em, __VLS_intrinsicElements.em)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "upload-hint" },
        });
        var __VLS_345;
        if (__VLS_ctx.mappingWizardFiles.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "file-chips" },
            });
            for (const [file, index] of __VLS_getVForSourceType((__VLS_ctx.mappingWizardFiles))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    key: (`${file.name}-${file.size}`),
                    ...{ class: "file-chip" },
                });
                const __VLS_354 = {}.ElIcon;
                /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
                // @ts-ignore
                const __VLS_355 = __VLS_asFunctionalComponent(__VLS_354, new __VLS_354({}));
                const __VLS_356 = __VLS_355({}, ...__VLS_functionalComponentArgsRest(__VLS_355));
                __VLS_357.slots.default;
                const __VLS_358 = {}.Document;
                /** @type {[typeof __VLS_components.Document, ]} */ ;
                // @ts-ignore
                const __VLS_359 = __VLS_asFunctionalComponent(__VLS_358, new __VLS_358({}));
                const __VLS_360 = __VLS_359({}, ...__VLS_functionalComponentArgsRest(__VLS_359));
                var __VLS_357;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (file.name);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!!(__VLS_ctx.mode === 'list'))
                                return;
                            if (!!(__VLS_ctx.mode === 'build'))
                                return;
                            if (!(__VLS_ctx.mode === 'mapping'))
                                return;
                            if (!(__VLS_ctx.mappingWizardStep === 'upload'))
                                return;
                            if (!(__VLS_ctx.mappingWizardFiles.length))
                                return;
                            __VLS_ctx.removeMappingWizardFile(index);
                        } },
                    ...{ class: "chip-remove" },
                });
            }
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "context-wrap" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            ...{ class: "context-label" },
        });
        const __VLS_362 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_363 = __VLS_asFunctionalComponent(__VLS_362, new __VLS_362({
            modelValue: (__VLS_ctx.mappingWizardContext),
            type: "textarea",
            rows: (3),
            placeholder: "例如：本批样表为各城市社保、公积金明细；请优先识别员工标识与缴费字段。",
        }));
        const __VLS_364 = __VLS_363({
            modelValue: (__VLS_ctx.mappingWizardContext),
            type: "textarea",
            rows: (3),
            placeholder: "例如：本批样表为各城市社保、公积金明细；请优先识别员工标识与缴费字段。",
        }, ...__VLS_functionalComponentArgsRest(__VLS_363));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "upload-actions" },
        });
        const __VLS_366 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_367 = __VLS_asFunctionalComponent(__VLS_366, new __VLS_366({
            ...{ 'onClick': {} },
        }));
        const __VLS_368 = __VLS_367({
            ...{ 'onClick': {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_367));
        let __VLS_370;
        let __VLS_371;
        let __VLS_372;
        const __VLS_373 = {
            onClick: (...[$event]) => {
                if (!!(__VLS_ctx.mode === 'list'))
                    return;
                if (!!(__VLS_ctx.mode === 'build'))
                    return;
                if (!(__VLS_ctx.mode === 'mapping'))
                    return;
                if (!(__VLS_ctx.mappingWizardStep === 'upload'))
                    return;
                __VLS_ctx.mode = 'list';
            }
        };
        __VLS_369.slots.default;
        var __VLS_369;
        const __VLS_374 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_375 = __VLS_asFunctionalComponent(__VLS_374, new __VLS_374({
            ...{ 'onClick': {} },
            type: "primary",
            icon: (__VLS_ctx.MagicStick),
            disabled: (!__VLS_ctx.mappingWizardFiles.length),
        }));
        const __VLS_376 = __VLS_375({
            ...{ 'onClick': {} },
            type: "primary",
            icon: (__VLS_ctx.MagicStick),
            disabled: (!__VLS_ctx.mappingWizardFiles.length),
        }, ...__VLS_functionalComponentArgsRest(__VLS_375));
        let __VLS_378;
        let __VLS_379;
        let __VLS_380;
        const __VLS_381 = {
            onClick: (__VLS_ctx.runMappingDrafts)
        };
        __VLS_377.slots.default;
        (__VLS_ctx.mappingWizardFiles.length);
        var __VLS_377;
    }
    else if (__VLS_ctx.mappingWizardStep === 'ai') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "ai-loading-wrap" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "ai-spinner" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
            ...{ class: "spinner-ring" },
        });
        const __VLS_382 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_383 = __VLS_asFunctionalComponent(__VLS_382, new __VLS_382({
            ...{ class: "spinner-icon" },
        }));
        const __VLS_384 = __VLS_383({
            ...{ class: "spinner-icon" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_383));
        __VLS_385.slots.default;
        const __VLS_386 = {}.MagicStick;
        /** @type {[typeof __VLS_components.MagicStick, ]} */ ;
        // @ts-ignore
        const __VLS_387 = __VLS_asFunctionalComponent(__VLS_386, new __VLS_386({}));
        const __VLS_388 = __VLS_387({}, ...__VLS_functionalComponentArgsRest(__VLS_387));
        var __VLS_385;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
            ...{ class: "ai-loading-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "ai-loading-sub" },
        });
        (__VLS_ctx.mappingWizardFiles.length);
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "mapping-confirm-wrap" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "mapping-confirm-intro" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        const __VLS_390 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_391 = __VLS_asFunctionalComponent(__VLS_390, new __VLS_390({
            ...{ 'onClick': {} },
        }));
        const __VLS_392 = __VLS_391({
            ...{ 'onClick': {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_391));
        let __VLS_394;
        let __VLS_395;
        let __VLS_396;
        const __VLS_397 = {
            onClick: (...[$event]) => {
                if (!!(__VLS_ctx.mode === 'list'))
                    return;
                if (!!(__VLS_ctx.mode === 'build'))
                    return;
                if (!(__VLS_ctx.mode === 'mapping'))
                    return;
                if (!!(__VLS_ctx.mappingWizardStep === 'upload'))
                    return;
                if (!!(__VLS_ctx.mappingWizardStep === 'ai'))
                    return;
                __VLS_ctx.mappingWizardStep = 'upload';
            }
        };
        __VLS_393.slots.default;
        var __VLS_393;
        const __VLS_398 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_399 = __VLS_asFunctionalComponent(__VLS_398, new __VLS_398({
            title: "请确认映射名称和表头识别特征；带有低置信度提示的映射建议重点检查。",
            type: "warning",
            closable: (false),
            showIcon: true,
        }));
        const __VLS_400 = __VLS_399({
            title: "请确认映射名称和表头识别特征；带有低置信度提示的映射建议重点检查。",
            type: "warning",
            closable: (false),
            showIcon: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_399));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "mapping-confirm-list" },
        });
        for (const [mapping, index] of __VLS_getVForSourceType((__VLS_ctx.mappingWizardDrafts))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (`${mapping.name}-${index}`),
                ...{ class: "mapping-confirm-card" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "mapping-confirm-card-head" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (index + 1);
            if (mapping.sheet_kw) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (mapping.sheet_kw);
            }
            const __VLS_402 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_403 = __VLS_asFunctionalComponent(__VLS_402, new __VLS_402({
                ...{ 'onClick': {} },
                text: true,
                type: "danger",
                icon: (__VLS_ctx.Delete),
            }));
            const __VLS_404 = __VLS_403({
                ...{ 'onClick': {} },
                text: true,
                type: "danger",
                icon: (__VLS_ctx.Delete),
            }, ...__VLS_functionalComponentArgsRest(__VLS_403));
            let __VLS_406;
            let __VLS_407;
            let __VLS_408;
            const __VLS_409 = {
                onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.mode === 'list'))
                        return;
                    if (!!(__VLS_ctx.mode === 'build'))
                        return;
                    if (!(__VLS_ctx.mode === 'mapping'))
                        return;
                    if (!!(__VLS_ctx.mappingWizardStep === 'upload'))
                        return;
                    if (!!(__VLS_ctx.mappingWizardStep === 'ai'))
                        return;
                    __VLS_ctx.removeMappingWizardDraft(index);
                }
            };
            __VLS_405.slots.default;
            var __VLS_405;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "editor-row" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "editor-field" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                ...{ class: "editor-label" },
            });
            const __VLS_410 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_411 = __VLS_asFunctionalComponent(__VLS_410, new __VLS_410({
                modelValue: (mapping.name),
            }));
            const __VLS_412 = __VLS_411({
                modelValue: (mapping.name),
            }, ...__VLS_functionalComponentArgsRest(__VLS_411));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "editor-field" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                ...{ class: "editor-label" },
            });
            const __VLS_414 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_415 = __VLS_asFunctionalComponent(__VLS_414, new __VLS_414({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: ((mapping.match_signature || []).join(',')),
            }));
            const __VLS_416 = __VLS_415({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: ((mapping.match_signature || []).join(',')),
            }, ...__VLS_functionalComponentArgsRest(__VLS_415));
            let __VLS_418;
            let __VLS_419;
            let __VLS_420;
            const __VLS_421 = {
                'onUpdate:modelValue': (...[$event]) => {
                    if (!!(__VLS_ctx.mode === 'list'))
                        return;
                    if (!!(__VLS_ctx.mode === 'build'))
                        return;
                    if (!(__VLS_ctx.mode === 'mapping'))
                        return;
                    if (!!(__VLS_ctx.mappingWizardStep === 'upload'))
                        return;
                    if (!!(__VLS_ctx.mappingWizardStep === 'ai'))
                        return;
                    mapping.match_signature = $event.split(',').map((value) => value.trim()).filter(Boolean);
                }
            };
            var __VLS_417;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "mapping-confirm-meta" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (mapping.header_start);
            (mapping.header_end);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (Object.keys(mapping.key_map || {}).length);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (Object.keys(mapping.column_map || {}).length);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (mapping.derived_fields?.length || 0);
            if (Number(mapping._confidence || 0) < 0.85) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "ai-notes" },
                });
                (Math.round(Number(mapping._confidence || 0) * 100));
                (mapping._notes || '请人工确认该映射。');
            }
        }
    }
}
else if (__VLS_ctx.mode === 'merge') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "build-topbar" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.mode === 'list'))
                    return;
                if (!!(__VLS_ctx.mode === 'build'))
                    return;
                if (!!(__VLS_ctx.mode === 'mapping'))
                    return;
                if (!(__VLS_ctx.mode === 'merge'))
                    return;
                __VLS_ctx.mode = 'list';
            } },
        ...{ class: "back-btn" },
    });
    const __VLS_422 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_423 = __VLS_asFunctionalComponent(__VLS_422, new __VLS_422({}));
    const __VLS_424 = __VLS_423({}, ...__VLS_functionalComponentArgsRest(__VLS_423));
    __VLS_425.slots.default;
    const __VLS_426 = {}.ArrowLeft;
    /** @type {[typeof __VLS_components.ArrowLeft, ]} */ ;
    // @ts-ignore
    const __VLS_427 = __VLS_asFunctionalComponent(__VLS_426, new __VLS_426({}));
    const __VLS_428 = __VLS_427({}, ...__VLS_functionalComponentArgsRest(__VLS_427));
    var __VLS_425;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
        ...{ class: "build-title" },
    });
    (__VLS_ctx.mergeTemplate?.name);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "build-topbar-actions" },
    });
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_430 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: "table_tools",
        op: "E",
        icon: (__VLS_ctx.Download),
        loading: (__VLS_ctx.downloading),
        disabled: (!__VLS_ctx.mergeFiles.length),
    }));
    const __VLS_431 = __VLS_430({
        ...{ 'onClick': {} },
        menu: "table_tools",
        op: "E",
        icon: (__VLS_ctx.Download),
        loading: (__VLS_ctx.downloading),
        disabled: (!__VLS_ctx.mergeFiles.length),
    }, ...__VLS_functionalComponentArgsRest(__VLS_430));
    let __VLS_433;
    let __VLS_434;
    let __VLS_435;
    const __VLS_436 = {
        onClick: (__VLS_ctx.downloadResult)
    };
    __VLS_432.slots.default;
    var __VLS_432;
    const __VLS_437 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_438 = __VLS_asFunctionalComponent(__VLS_437, new __VLS_437({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.merging),
        disabled: (!__VLS_ctx.mergeFiles.length),
    }));
    const __VLS_439 = __VLS_438({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.merging),
        disabled: (!__VLS_ctx.mergeFiles.length),
    }, ...__VLS_functionalComponentArgsRest(__VLS_438));
    let __VLS_441;
    let __VLS_442;
    let __VLS_443;
    const __VLS_444 = {
        onClick: (__VLS_ctx.runMerge)
    };
    __VLS_440.slots.default;
    var __VLS_440;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "merge-layout" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "merge-left" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
        ...{ class: "section-title" },
    });
    const __VLS_445 = {}.ElUpload;
    /** @type {[typeof __VLS_components.ElUpload, typeof __VLS_components.elUpload, typeof __VLS_components.ElUpload, typeof __VLS_components.elUpload, ]} */ ;
    // @ts-ignore
    const __VLS_446 = __VLS_asFunctionalComponent(__VLS_445, new __VLS_445({
        drag: true,
        multiple: true,
        autoUpload: (false),
        showFileList: (false),
        accept: ".xlsx",
        onChange: (__VLS_ctx.handleMergeFileChange),
        ...{ class: "upload-dragger upload-dragger--sm" },
    }));
    const __VLS_447 = __VLS_446({
        drag: true,
        multiple: true,
        autoUpload: (false),
        showFileList: (false),
        accept: ".xlsx",
        onChange: (__VLS_ctx.handleMergeFileChange),
        ...{ class: "upload-dragger upload-dragger--sm" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_446));
    __VLS_448.slots.default;
    const __VLS_449 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_450 = __VLS_asFunctionalComponent(__VLS_449, new __VLS_449({
        ...{ class: "upload-icon" },
        ...{ style: {} },
    }));
    const __VLS_451 = __VLS_450({
        ...{ class: "upload-icon" },
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_450));
    __VLS_452.slots.default;
    const __VLS_453 = {}.Upload;
    /** @type {[typeof __VLS_components.Upload, ]} */ ;
    // @ts-ignore
    const __VLS_454 = __VLS_asFunctionalComponent(__VLS_453, new __VLS_453({}));
    const __VLS_455 = __VLS_454({}, ...__VLS_functionalComponentArgsRest(__VLS_454));
    var __VLS_452;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "upload-text" },
        ...{ style: {} },
    });
    var __VLS_448;
    if (__VLS_ctx.mergeFiles.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "file-chips" },
            ...{ style: {} },
        });
        for (const [f, i] of __VLS_getVForSourceType((__VLS_ctx.mergeFiles))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "file-chip" },
                key: (i),
            });
            const __VLS_457 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_458 = __VLS_asFunctionalComponent(__VLS_457, new __VLS_457({}));
            const __VLS_459 = __VLS_458({}, ...__VLS_functionalComponentArgsRest(__VLS_458));
            __VLS_460.slots.default;
            const __VLS_461 = {}.Document;
            /** @type {[typeof __VLS_components.Document, ]} */ ;
            // @ts-ignore
            const __VLS_462 = __VLS_asFunctionalComponent(__VLS_461, new __VLS_461({}));
            const __VLS_463 = __VLS_462({}, ...__VLS_functionalComponentArgsRest(__VLS_462));
            var __VLS_460;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (f.name);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.mode === 'list'))
                            return;
                        if (!!(__VLS_ctx.mode === 'build'))
                            return;
                        if (!!(__VLS_ctx.mode === 'mapping'))
                            return;
                        if (!(__VLS_ctx.mode === 'merge'))
                            return;
                        if (!(__VLS_ctx.mergeFiles.length))
                            return;
                        __VLS_ctx.removeMergeFile(i);
                    } },
                ...{ class: "chip-remove" },
            });
        }
    }
    if (__VLS_ctx.mergeResult?.recognize_log?.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "log-panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({
            ...{ class: "log-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "log-count" },
        });
        (__VLS_ctx.mergeResult.recognize_log.length);
        for (const [l, i] of __VLS_getVForSourceType((__VLS_ctx.mergeResult.recognize_log))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "log-row" },
                key: (i),
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "log-score" },
                ...{ class: (l.score >= 0.9 ? 'good' : 'warn') },
            });
            (Math.round(l.score * 100));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "log-file" },
            });
            (l.file);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "log-sheet" },
            });
            (l.sheet);
        }
    }
    if (__VLS_ctx.mergeResult?.anomalies?.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "anomaly-panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({
            ...{ class: "log-title danger" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "log-count" },
        });
        (__VLS_ctx.mergeResult.anomalies.length);
        for (const [a, i] of __VLS_getVForSourceType((__VLS_ctx.mergeResult.anomalies))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "anomaly-row" },
                key: (i),
            });
            const __VLS_465 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_466 = __VLS_asFunctionalComponent(__VLS_465, new __VLS_465({
                type: "danger",
                size: "small",
            }));
            const __VLS_467 = __VLS_466({
                type: "danger",
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_466));
            __VLS_468.slots.default;
            (a.type);
            var __VLS_468;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "anomaly-detail" },
            });
            (a.detail);
        }
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "merge-right" },
    });
    if (__VLS_ctx.mergeResult) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-cards" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-card" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-val" },
        });
        (__VLS_ctx.mergeResult.stats.files);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-card" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-val" },
        });
        (__VLS_ctx.mergeResult.stats.records);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-card highlight" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-val" },
        });
        (__VLS_ctx.mergeResult.stats.persons);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-card" },
            ...{ class: (__VLS_ctx.mergeResult.stats.anomalies ? 'danger' : '') },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-val" },
        });
        (__VLS_ctx.mergeResult.stats.anomalies);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-label" },
        });
    }
    if (__VLS_ctx.mergeResult?.rows?.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "preview-wrap" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "preview-header" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.mergeResult.rows.length);
        (__VLS_ctx.mergeResult.total_rows);
        const __VLS_469 = {}.ElTable;
        /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
        // @ts-ignore
        const __VLS_470 = __VLS_asFunctionalComponent(__VLS_469, new __VLS_469({
            data: (__VLS_ctx.mergeResult.rows),
            size: "small",
            border: true,
            maxHeight: "600",
            ...{ style: {} },
        }));
        const __VLS_471 = __VLS_470({
            data: (__VLS_ctx.mergeResult.rows),
            size: "small",
            border: true,
            maxHeight: "600",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_470));
        __VLS_472.slots.default;
        for (const [col] of __VLS_getVForSourceType((__VLS_ctx.mergeResultCols))) {
            const __VLS_473 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_474 = __VLS_asFunctionalComponent(__VLS_473, new __VLS_473({
                key: (col),
                prop: (col),
                label: (col),
                minWidth: "110",
                showOverflowTooltip: true,
            }));
            const __VLS_475 = __VLS_474({
                key: (col),
                prop: (col),
                label: (col),
                minWidth: "110",
                showOverflowTooltip: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_474));
        }
        var __VLS_472;
    }
    else if (!__VLS_ctx.merging) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "merge-empty" },
        });
        const __VLS_477 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_478 = __VLS_asFunctionalComponent(__VLS_477, new __VLS_477({
            ...{ style: {} },
        }));
        const __VLS_479 = __VLS_478({
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_478));
        __VLS_480.slots.default;
        const __VLS_481 = {}.Upload;
        /** @type {[typeof __VLS_components.Upload, ]} */ ;
        // @ts-ignore
        const __VLS_482 = __VLS_asFunctionalComponent(__VLS_481, new __VLS_481({}));
        const __VLS_483 = __VLS_482({}, ...__VLS_functionalComponentArgsRest(__VLS_482));
        var __VLS_480;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    }
    if (__VLS_ctx.merging) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "merge-loading" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
            ...{ class: "spinner-ring" },
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
}
/** @type {__VLS_StyleScopedClasses['tt-root']} */ ;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['page-title']} */ ;
/** @type {__VLS_StyleScopedClasses['page-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['list-loading']} */ ;
/** @type {__VLS_StyleScopedClasses['skeleton']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['tpl-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['tpl-card']} */ ;
/** @type {__VLS_StyleScopedClasses['tpl-card-body']} */ ;
/** @type {__VLS_StyleScopedClasses['tpl-card-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['tpl-card-info']} */ ;
/** @type {__VLS_StyleScopedClasses['tpl-name']} */ ;
/** @type {__VLS_StyleScopedClasses['tpl-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['tpl-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['meta-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['meta-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['meta-count']} */ ;
/** @type {__VLS_StyleScopedClasses['tpl-card-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['build-topbar']} */ ;
/** @type {__VLS_StyleScopedClasses['back-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['build-title']} */ ;
/** @type {__VLS_StyleScopedClasses['build-topbar-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['build-upload-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-sub']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-dragger']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-text']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['file-chips']} */ ;
/** @type {__VLS_StyleScopedClasses['file-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-remove']} */ ;
/** @type {__VLS_StyleScopedClasses['context-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['context-label']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-loading-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-spinner']} */ ;
/** @type {__VLS_StyleScopedClasses['spinner-ring']} */ ;
/** @type {__VLS_StyleScopedClasses['spinner-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-loading-title']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-loading-sub']} */ ;
/** @type {__VLS_StyleScopedClasses['confidence-alert']} */ ;
/** @type {__VLS_StyleScopedClasses['build-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['build-left']} */ ;
/** @type {__VLS_StyleScopedClasses['form-section']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['field-group']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['required']} */ ;
/** @type {__VLS_StyleScopedClasses['field-group']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['form-section']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['section-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['form-section']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['required-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['section-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['std-tags']} */ ;
/** @type {__VLS_StyleScopedClasses['std-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['std-add']} */ ;
/** @type {__VLS_StyleScopedClasses['build-right']} */ ;
/** @type {__VLS_StyleScopedClasses['mappings-header']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['mappings-count']} */ ;
/** @type {__VLS_StyleScopedClasses['section-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['mappings-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-list']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-item']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-header']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-header-left']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-chevron']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-name']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-row']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-field']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-label']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-field']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-label']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-row']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-field']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-label']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-notes']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-notes']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-row']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-field']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-label']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-field']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-label']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-field']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-label']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-section']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-section-header']} */ ;
/** @type {__VLS_StyleScopedClasses['add-row-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['map-table']} */ ;
/** @type {__VLS_StyleScopedClasses['map-row']} */ ;
/** @type {__VLS_StyleScopedClasses['map-row-head']} */ ;
/** @type {__VLS_StyleScopedClasses['map-row']} */ ;
/** @type {__VLS_StyleScopedClasses['map-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['del-row-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-section']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-section-header']} */ ;
/** @type {__VLS_StyleScopedClasses['add-row-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['map-table']} */ ;
/** @type {__VLS_StyleScopedClasses['map-row']} */ ;
/** @type {__VLS_StyleScopedClasses['map-row-head']} */ ;
/** @type {__VLS_StyleScopedClasses['map-row']} */ ;
/** @type {__VLS_StyleScopedClasses['map-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['del-row-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-section']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-section-header']} */ ;
/** @type {__VLS_StyleScopedClasses['add-row-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['derived-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['derived-row']} */ ;
/** @type {__VLS_StyleScopedClasses['map-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['del-row-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-notes']} */ ;
/** @type {__VLS_StyleScopedClasses['build-topbar']} */ ;
/** @type {__VLS_StyleScopedClasses['back-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['build-title']} */ ;
/** @type {__VLS_StyleScopedClasses['build-topbar-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['build-upload-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-sub']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-dragger']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-text']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['file-chips']} */ ;
/** @type {__VLS_StyleScopedClasses['file-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-remove']} */ ;
/** @type {__VLS_StyleScopedClasses['context-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['context-label']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-loading-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-spinner']} */ ;
/** @type {__VLS_StyleScopedClasses['spinner-ring']} */ ;
/** @type {__VLS_StyleScopedClasses['spinner-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-loading-title']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-loading-sub']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-confirm-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-confirm-intro']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-confirm-list']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-confirm-card']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-confirm-card-head']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-row']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-field']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-label']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-field']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-label']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-confirm-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-notes']} */ ;
/** @type {__VLS_StyleScopedClasses['build-topbar']} */ ;
/** @type {__VLS_StyleScopedClasses['back-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['build-title']} */ ;
/** @type {__VLS_StyleScopedClasses['build-topbar-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['merge-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['merge-left']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-dragger']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-dragger--sm']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-text']} */ ;
/** @type {__VLS_StyleScopedClasses['file-chips']} */ ;
/** @type {__VLS_StyleScopedClasses['file-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-remove']} */ ;
/** @type {__VLS_StyleScopedClasses['log-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['log-title']} */ ;
/** @type {__VLS_StyleScopedClasses['log-count']} */ ;
/** @type {__VLS_StyleScopedClasses['log-row']} */ ;
/** @type {__VLS_StyleScopedClasses['log-score']} */ ;
/** @type {__VLS_StyleScopedClasses['log-file']} */ ;
/** @type {__VLS_StyleScopedClasses['log-sheet']} */ ;
/** @type {__VLS_StyleScopedClasses['anomaly-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['log-title']} */ ;
/** @type {__VLS_StyleScopedClasses['danger']} */ ;
/** @type {__VLS_StyleScopedClasses['log-count']} */ ;
/** @type {__VLS_StyleScopedClasses['anomaly-row']} */ ;
/** @type {__VLS_StyleScopedClasses['anomaly-detail']} */ ;
/** @type {__VLS_StyleScopedClasses['merge-right']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-cards']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-val']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-val']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['highlight']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-val']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-val']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-header']} */ ;
/** @type {__VLS_StyleScopedClasses['merge-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['merge-loading']} */ ;
/** @type {__VLS_StyleScopedClasses['spinner-ring']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Plus: Plus,
            Delete: Delete,
            Upload: Upload,
            Download: Download,
            MagicStick: MagicStick,
            Edit: Edit,
            ArrowLeft: ArrowLeft,
            CircleCheck: CircleCheck,
            Warning: Warning,
            Document: Document,
            Grid: Grid,
            PermissionButton: PermissionButton,
            canModify: canModify,
            mode: mode,
            templates: templates,
            listLoading: listLoading,
            editingId: editingId,
            buildStep: buildStep,
            tplFiles: tplFiles,
            aiContext: aiContext,
            draft: draft,
            form: form,
            stdFieldInput: stdFieldInput,
            draggingStdField: draggingStdField,
            savingTpl: savingTpl,
            expandedMapping: expandedMapping,
            editingMapping: editingMapping,
            openNew: openNew,
            openEdit: openEdit,
            mappingWizardTemplate: mappingWizardTemplate,
            mappingWizardStep: mappingWizardStep,
            mappingWizardFiles: mappingWizardFiles,
            mappingWizardContext: mappingWizardContext,
            mappingWizardDrafts: mappingWizardDrafts,
            mappingWizardSaving: mappingWizardSaving,
            openAddMapping: openAddMapping,
            removeMappingWizardFile: removeMappingWizardFile,
            handleMappingWizardFile: handleMappingWizardFile,
            runMappingDrafts: runMappingDrafts,
            removeMappingWizardDraft: removeMappingWizardDraft,
            saveMappingDrafts: saveMappingDrafts,
            handleTplFileChange: handleTplFileChange,
            removeTplFile: removeTplFile,
            runAiDraft: runAiDraft,
            skipToManual: skipToManual,
            startEditMapping: startEditMapping,
            cancelEditMapping: cancelEditMapping,
            saveEditMapping: saveEditMapping,
            mappingDraftLoading: mappingDraftLoading,
            mappingDraftSheets: mappingDraftSheets,
            mappingDraftSheet: mappingDraftSheet,
            mappingDraftWarnings: mappingDraftWarnings,
            mappingDraftLowConfidence: mappingDraftLowConfidence,
            handleMappingSample: handleMappingSample,
            reloadMappingDraft: reloadMappingDraft,
            removeMapping: removeMapping,
            addKeyMapEntry: addKeyMapEntry,
            addColumnMapEntry: addColumnMapEntry,
            addDerivedField: addDerivedField,
            removeDerivedField: removeDerivedField,
            syncKeyMap: syncKeyMap,
            syncColumnMap: syncColumnMap,
            addStdField: addStdField,
            removeStdField: removeStdField,
            reorderStdField: reorderStdField,
            aiLowConfidence: aiLowConfidence,
            saveTemplate: saveTemplate,
            deleteTemplate: deleteTemplate,
            mergeTemplate: mergeTemplate,
            mergeFiles: mergeFiles,
            merging: merging,
            downloading: downloading,
            mergeResult: mergeResult,
            openMerge: openMerge,
            handleMergeFileChange: handleMergeFileChange,
            removeMergeFile: removeMergeFile,
            runMerge: runMerge,
            downloadResult: downloadResult,
            mergeResultCols: mergeResultCols,
            editingKeyMapEntries: editingKeyMapEntries,
            editingColMapEntries: editingColMapEntries,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
