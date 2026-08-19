/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router';
import { formatDateTime, shanghaiLocalToUtcIso, utcToShanghaiLocal } from '@/utils/datetime';
import { performanceApi, performanceCycleApi } from '@/api/performance';
const route = useRoute();
const router = useRouter();
const cycles = ref([]);
const selected = ref(null);
const loading = ref(false);
const saving = ref(false);
const deleting = ref(false);
const editing = ref(false);
const formMode = ref('create');
const keyword = ref('');
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const formError = ref('');
const saveSuccess = ref(false);
const accessContext = ref(null);
const people = ref([]);
const peopleLoading = ref(false);
const showPeople = ref(false);
const peopleReason = ref('');
const deleteConfirm = ref(false);
const initialForm = ref('');
const dialogRef = ref(null);
const cancelDeleteRef = ref(null);
const confirmDeleteRef = ref(null);
const previousFocus = ref(null);
const requestVersion = ref(0);
const anchorObserver = ref(null);
const canManageCycles = computed(() => accessContext.value?.permission_codes.includes('performance.cycles.manage') ?? false);
const canManagePeople = canManageCycles;
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));
const dateError = computed(() => Boolean(form.start_at && form.end_at && form.end_at <= form.start_at));
const leaverDateError = computed(() => Boolean(form.leaver_enabled && form.leaver_start_date && form.leaver_end_date && form.leaver_end_date < form.leaver_start_date));
const lockError = computed(() => form.lock_rule === 'SCHEDULED' && form.lock_at && (shanghaiLocalToUtcIso(form.lock_at) || '') < new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString());
const hasStartedProject = computed(() => selected.value?.projects.some(project => ['STARTED', '进行中', '已启动'].includes(project.status)) ?? false);
const yearPickerOpen = ref(false);
const periodTypePickerOpen = ref(false);
const yearPanelStyle = ref({});
const periodPanelStyle = ref({});
const periodTypes = [{ value: 'YEAR', label: '全年' }, { value: 'HALF_YEAR', label: '半年度' }, { value: 'QUARTER', label: '季度' }, { value: 'BIMONTH', label: '双月' }, { value: 'MONTH', label: '月度' }, { value: 'CUSTOM', label: '自定义' }];
const periodTypeGroups = [{ label: '年/半年度', options: [{ value: 'YEAR', type: 'YEAR', subtype: null, label: '全年' }, { value: 'H1', type: 'HALF_YEAR', subtype: 'H1', label: '上半年' }, { value: 'H2', type: 'HALF_YEAR', subtype: 'H2', label: '下半年' }] }, { label: '季度', options: [1, 2, 3, 4].map(index => ({ value: `Q${index}`, type: 'QUARTER', subtype: `Q${index}`, label: `第 ${index} 季度` })) }, { label: '双月', options: [1, 2, 3, 4, 5, 6].map(index => ({ value: `B${index}`, type: 'BIMONTH', subtype: `B${index}`, label: `${index * 2 - 1}-${index * 2} 双月` })) }, { label: '月度', options: Array.from({ length: 12 }, (_, index) => ({ value: `M${index + 1}`, type: 'MONTH', subtype: `M${index + 1}`, label: `${index + 1} 月份` })) }, { label: '非标准周期', options: [{ value: 'CUSTOM', type: 'CUSTOM', subtype: 'CUSTOM', label: '自定义' }] }];
const selectedPeriodOption = computed(() => periodTypeGroups.flatMap(group => group.options).find(option => option.type === form.period_type && option.subtype === (form.period_subtype || null)) || periodTypeGroups.flatMap(group => group.options).find(option => option.type === form.period_type));
const activeAnchor = ref('cycle-info');
const anchorItems = [{ id: 'cycle-info', label: '周期信息' }, { id: 'people-settings', label: '人员和部门信息设置' }, { id: 'evaluation-settings', label: '评估设置' }, { id: 'leaver-settings', label: '离职人员参评设置' }];
const yearPageSize = 20;
const getDefaultYearPageStart = () => Math.floor(new Date().getFullYear() / yearPageSize) * yearPageSize;
const yearPageStart = ref(Math.floor(new Date().getFullYear() / yearPageSize) * yearPageSize);
const yearOptions = computed(() => Array.from({ length: yearPageSize }, (_, index) => yearPageStart.value + index).filter(year => year >= 1900 && year <= 2200));
const form = reactive({ name: '', period_year: null, period_type: '', period_subtype: null, start_at: '', end_at: '', lock_rule: 'IMMEDIATE', lock_at: '', pre_lock_sync_mode: 'MANUAL', leaver_enabled: false, leaver_start_date: '', leaver_end_date: '', leaver_participation_mode: 'CREATE_TASK', evaluation_template: '' });
const isDirty = computed(() => editing.value && JSON.stringify(form) !== initialForm.value);
function snapshotForm() { initialForm.value = JSON.stringify(form); }
;
function resetForm() { Object.assign(form, { name: '', period_year: null, period_type: '', period_subtype: null, start_at: '', end_at: '', lock_rule: 'IMMEDIATE', lock_at: '', pre_lock_sync_mode: 'MANUAL', leaver_enabled: false, leaver_start_date: '', leaver_end_date: '', leaver_participation_mode: 'CREATE_TASK', evaluation_template: '' }); yearPageStart.value = getDefaultYearPageStart(); yearPickerOpen.value = false; periodTypePickerOpen.value = false; yearPanelStyle.value = {}; periodPanelStyle.value = {}; snapshotForm(); }
;
function changeYearPage(direction) { yearPageStart.value = Math.min(2200 - yearPageSize + 1, Math.max(1900, yearPageStart.value + direction * yearPageSize)); }
;
function positionPanel(trigger, width, height) { if (!trigger)
    return { position: 'fixed', top: '0px', left: '0px' }; const rect = trigger.getBoundingClientRect(); const gap = 6; const margin = 16; const below = rect.bottom + gap; const top = below + height <= window.innerHeight - margin ? below : Math.max(margin, rect.top - height - gap); const left = Math.min(Math.max(margin, rect.left), Math.max(margin, window.innerWidth - width - margin)); return { position: 'fixed', top: top + 'px', left: left + 'px' }; }
;
function updatePanelPosition(type) { void nextTick(() => { const trigger = document.getElementById(type === 'year' ? 'cycle-year' : 'cycle-type'); const style = positionPanel(trigger, type === 'year' ? 279 : 385, type === 'year' ? 311 : 364); if (type === 'year')
    yearPanelStyle.value = style;
else
    periodPanelStyle.value = style; }); }
;
function toggleYearPicker() { periodTypePickerOpen.value = false; yearPickerOpen.value = !yearPickerOpen.value; yearPanelStyle.value = {}; if (yearPickerOpen.value)
    updatePanelPosition('year'); }
;
function togglePeriodTypePicker() { yearPickerOpen.value = false; periodTypePickerOpen.value = !periodTypePickerOpen.value; periodPanelStyle.value = {}; if (periodTypePickerOpen.value)
    updatePanelPosition('period'); }
;
function closePickers() { yearPickerOpen.value = false; periodTypePickerOpen.value = false; yearPanelStyle.value = {}; periodPanelStyle.value = {}; }
;
function handlePickerOutsidePointerDown(event) { if (!yearPickerOpen.value && !periodTypePickerOpen.value)
    return; const target = event.target; if (!(target instanceof Node))
    return; const yearRoot = document.querySelector('.year-picker'); const periodRoot = document.querySelector('.period-type-picker'); if (yearPickerOpen.value && !yearRoot?.contains(target))
    closePickers(); if (periodTypePickerOpen.value && !periodRoot?.contains(target))
    closePickers(); }
;
function selectYear(year) { form.period_year = year; applyPeriodDates(); }
;
function selectPeriodOption(option) { form.period_type = option.type; form.period_subtype = option.subtype; periodTypePickerOpen.value = false; applyPeriodDates(); }
;
function daysInMonth(year, month) { return new Date(year, month, 0).getDate(); }
;
function applyPeriodDates() { const year = form.period_year; const subtype = form.period_subtype; if (!year || form.period_type === 'CUSTOM')
    return; let startMonth = 1; let endMonth = 12; if (form.period_type === 'HALF_YEAR') {
    startMonth = subtype === 'H2' ? 7 : 1;
    endMonth = subtype === 'H2' ? 12 : 6;
}
else if (form.period_type === 'QUARTER') {
    const quarter = Number(subtype?.slice(1) || 1);
    startMonth = (quarter - 1) * 3 + 1;
    endMonth = startMonth + 2;
}
else if (form.period_type === 'BIMONTH') {
    const bimonth = Number(subtype?.slice(1) || 1);
    startMonth = (bimonth - 1) * 2 + 1;
    endMonth = startMonth + 1;
}
else if (form.period_type === 'MONTH') {
    startMonth = Number(subtype?.slice(1) || 1);
    endMonth = startMonth;
} form.start_at = `${year}-${String(startMonth).padStart(2, '0')}-01T00:00`; form.end_at = `${year}-${String(endMonth).padStart(2, '0')}-${daysInMonth(year, endMonth)}T23:59`; }
;
function toLocal(value) { return utcToShanghaiLocal(value) || ''; }
;
function formatRange(start, end) { return `${formatDateTime(start)} - ${formatDateTime(end)}`; }
;
function toIso(value) { return shanghaiLocalToUtcIso(value) || ''; }
function toPayload() { const base = { name: form.name, language: 'zh-CN', period_year: form.period_year, period_type: form.period_type, period_subtype: form.period_subtype, start_at: toIso(form.start_at), end_at: toIso(form.end_at), leaver_enabled: form.leaver_enabled, leaver_start_date: form.leaver_enabled ? form.leaver_start_date : null, leaver_end_date: form.leaver_enabled ? form.leaver_end_date : null, leaver_participation_mode: form.leaver_participation_mode }; return formMode.value === 'create' ? { ...base, lock_rule: form.lock_rule, lock_at: form.lock_rule === 'SCHEDULED' ? toIso(form.lock_at) : null, pre_lock_sync_mode: form.pre_lock_sync_mode } : base; }
async function loadCycles() { const version = ++requestVersion.value; loading.value = true; formError.value = ''; try {
    const result = await performanceCycleApi.list(keyword.value, page.value, pageSize.value);
    if (version !== requestVersion.value)
        return;
    cycles.value = result.items;
    total.value = result.total;
    if (page.value > totalPages.value) {
        page.value = totalPages.value;
        return loadCycles();
    }
    ;
    if (!selected.value || !cycles.value.some(item => item.id === selected.value?.id))
        selected.value = cycles.value[0] || null;
}
catch (error) {
    formError.value = error?.response?.data?.detail || '周期加载失败';
}
finally {
    if (version === requestVersion.value)
        loading.value = false;
} }
async function searchCycles() { page.value = 1; await loadCycles(); }
;
function clearSearch() { keyword.value = ''; void searchCycles(); }
;
async function changePage(nextPage) { page.value = Math.min(Math.max(1, nextPage), totalPages.value); await loadCycles(); }
;
async function selectCycle(cycle) { selected.value = cycle; if (showPeople.value)
    await loadPeople(); }
function startCreate() { resetForm(); formMode.value = 'create'; formError.value = ''; saveSuccess.value = false; editing.value = true; if (route.name !== 'PerformanceCycleCreate')
    void router.push({ name: 'PerformanceCycleCreate' }); }
;
async function startEdit() { if (!selected.value)
    return; await enterEdit(selected.value.id); if (route.name !== 'PerformanceCycleEdit')
    void router.push({ name: 'PerformanceCycleEdit', params: { id: selected.value.id } }); }
;
async function enterEdit(id) { const cycle = await performanceCycleApi.get(id); selected.value = cycle; Object.assign(form, { name: cycle.name, period_year: cycle.period_year, period_type: cycle.period_type, start_at: toLocal(cycle.start_at), end_at: toLocal(cycle.end_at), lock_rule: cycle.lock_rule, lock_at: toLocal(cycle.lock_at), pre_lock_sync_mode: cycle.pre_lock_sync_mode, leaver_enabled: cycle.leaver_enabled, leaver_start_date: cycle.leaver_start_date || '', leaver_end_date: cycle.leaver_end_date || '', leaver_participation_mode: cycle.leaver_participation_mode }); snapshotForm(); formMode.value = 'edit'; editing.value = true; }
function confirmDiscard() { return !isDirty.value || window.confirm('当前内容尚未保存，确定离开吗？'); }
;
function discardEdit() { editing.value = false; formError.value = ''; }
;
function cancelEdit() { if (!confirmDiscard())
    return; discardEdit(); void router.replace({ name: 'PerformanceCycles' }); }
async function submitForm() { formError.value = ''; saveSuccess.value = false; if (!form.period_year) {
    formError.value = '请选择年份';
    return;
} ; if (dateError.value) {
    formError.value = '需晚于开始时间';
    return;
} ; if (leaverDateError.value) {
    formError.value = '离职人员参评日期范围不合法';
    return;
} ; if (lockError.value) {
    formError.value = '定时锁定需晚于当前时间至少 6 小时';
    return;
} ; saving.value = true; try {
    const cycle = formMode.value === 'create' ? await performanceCycleApi.create(toPayload()) : await performanceCycleApi.update(selected.value.id, toPayload());
    snapshotForm();
    discardEdit();
    saveSuccess.value = true;
    await loadCycles();
    selected.value = cycle;
    await router.replace({ name: 'PerformanceCycles' });
}
catch (error) {
    formError.value = error?.response?.data?.detail || error?.response?.data?.message || '保存失败';
}
finally {
    saving.value = false;
} }
async function loadPeople() { if (!selected.value)
    return; peopleLoading.value = true; try {
    people.value = await performanceCycleApi.listPeople(selected.value.id);
}
catch (error) {
    formError.value = error?.response?.data?.detail || '人员快照加载失败';
}
finally {
    peopleLoading.value = false;
} }
;
async function togglePeople() { showPeople.value = !showPeople.value; if (showPeople.value)
    await loadPeople(); }
;
async function refreshPeople() { if (!selected.value || !peopleReason.value)
    return; try {
    await performanceCycleApi.refreshPeople(selected.value.id, peopleReason.value);
    await loadPeople();
}
catch (error) {
    formError.value = error?.response?.data?.detail || '名单刷新失败';
} }
;
async function savePerson(person) { if (!selected.value || !peopleReason.value)
    return; try {
    await performanceCycleApi.updatePerson(selected.value.id, person, peopleReason.value);
    await loadPeople();
}
catch (error) {
    formError.value = error?.response?.data?.detail || '人员维护失败';
} }
function restoreDeleteFocus() { void nextTick(() => previousFocus.value?.isConnected && previousFocus.value.focus()); }
;
function closeDeleteDialog() { deleteConfirm.value = false; restoreDeleteFocus(); }
;
function handleDialogKeydown(event) { if (event.key === 'Escape') {
    event.preventDefault();
    closeDeleteDialog();
    return;
} ; if (event.key !== 'Tab')
    return; const focusable = [cancelDeleteRef.value, confirmDeleteRef.value].filter((item) => Boolean(item && !item.disabled)); if (!focusable.length)
    return; const first = focusable[0]; const last = focusable[focusable.length - 1]; if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
}
else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
} }
;
function removeSelected() { if (!selected.value || hasStartedProject.value)
    return; previousFocus.value = document.activeElement; deleteConfirm.value = true; void nextTick(() => cancelDeleteRef.value?.focus()); }
;
async function confirmDelete() { if (!selected.value)
    return; deleting.value = true; try {
    await performanceCycleApi.remove(selected.value.id);
    deleteConfirm.value = false;
    selected.value = null;
    await loadCycles();
    restoreDeleteFocus();
}
catch (error) {
    formError.value = error?.response?.data?.detail || '删除失败';
}
finally {
    deleting.value = false;
} }
async function syncRoute() { if (route.name === 'PerformanceCycleCreate') {
    if (!editing.value)
        startCreate();
    return;
} ; if (route.name === 'PerformanceCycleEdit' && route.params.id) {
    if (selected.value?.id !== Number(route.params.id) || !editing.value)
        await enterEdit(Number(route.params.id));
    return;
} ; if (!editing.value && !cycles.value.length)
    await loadCycles(); }
function observeAnchors() { anchorObserver.value?.disconnect(); if (typeof IntersectionObserver === 'undefined')
    return; anchorObserver.value = new IntersectionObserver((entries) => { const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]; if (visible)
    activeAnchor.value = visible.target.id; }, { threshold: [0.25, 0.5, 0.75], rootMargin: '-10% 0px -65% 0px' }); anchorItems.forEach(item => { const section = document.getElementById(item.id); if (section)
    anchorObserver.value?.observe(section); }); }
watch(() => [route.name, route.params.id], () => { void syncRoute(); });
watch(editing, value => { if (value)
    void nextTick(observeAnchors);
else
    anchorObserver.value?.disconnect(); });
onBeforeRouteLeave(() => confirmDiscard());
onBeforeRouteUpdate(() => { if (!confirmDiscard())
    return false; if (isDirty.value)
    discardEdit(); return true; });
onMounted(async () => { document.addEventListener('pointerdown', handlePickerOutsidePointerDown); try {
    accessContext.value = await performanceApi.getAccessContext();
    if (route.name === 'PerformanceCycleEdit')
        await syncRoute();
    else {
        await loadCycles();
        await syncRoute();
    }
}
catch (error) {
    formError.value = error?.response?.data?.detail || '权限加载失败';
} });
onUnmounted(() => { anchorObserver.value?.disconnect(); document.removeEventListener('pointerdown', handlePickerOutsidePointerDown); });
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['form-top']} */ ;
/** @type {__VLS_StyleScopedClasses['form-top']} */ ;
/** @type {__VLS_StyleScopedClasses['back-button']} */ ;
/** @type {__VLS_StyleScopedClasses['form-top']} */ ;
/** @type {__VLS_StyleScopedClasses['form-anchor']} */ ;
/** @type {__VLS_StyleScopedClasses['form-anchor']} */ ;
/** @type {__VLS_StyleScopedClasses['form-anchor']} */ ;
/** @type {__VLS_StyleScopedClasses['form-anchor']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['form-anchor']} */ ;
/** @type {__VLS_StyleScopedClasses['form-card']} */ ;
/** @type {__VLS_StyleScopedClasses['field-group']} */ ;
/** @type {__VLS_StyleScopedClasses['form-card']} */ ;
/** @type {__VLS_StyleScopedClasses['field-group']} */ ;
/** @type {__VLS_StyleScopedClasses['field-group']} */ ;
/** @type {__VLS_StyleScopedClasses['field-group']} */ ;
/** @type {__VLS_StyleScopedClasses['form-card']} */ ;
/** @type {__VLS_StyleScopedClasses['form-card']} */ ;
/** @type {__VLS_StyleScopedClasses['form-card']} */ ;
/** @type {__VLS_StyleScopedClasses['form-card']} */ ;
/** @type {__VLS_StyleScopedClasses['form-card']} */ ;
/** @type {__VLS_StyleScopedClasses['form-card']} */ ;
/** @type {__VLS_StyleScopedClasses['selector-control']} */ ;
/** @type {__VLS_StyleScopedClasses['form-card']} */ ;
/** @type {__VLS_StyleScopedClasses['two-col']} */ ;
/** @type {__VLS_StyleScopedClasses['field-group']} */ ;
/** @type {__VLS_StyleScopedClasses['two-col']} */ ;
/** @type {__VLS_StyleScopedClasses['cycle-info-period-row']} */ ;
/** @type {__VLS_StyleScopedClasses['field-group']} */ ;
/** @type {__VLS_StyleScopedClasses['radio-row']} */ ;
/** @type {__VLS_StyleScopedClasses['radio-row']} */ ;
/** @type {__VLS_StyleScopedClasses['radio-row']} */ ;
/** @type {__VLS_StyleScopedClasses['selector-control']} */ ;
/** @type {__VLS_StyleScopedClasses['calendar-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['arrow-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['arrow-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['picker-panel-header']} */ ;
/** @type {__VLS_StyleScopedClasses['year-options']} */ ;
/** @type {__VLS_StyleScopedClasses['year-options']} */ ;
/** @type {__VLS_StyleScopedClasses['year-options']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['period-group']} */ ;
/** @type {__VLS_StyleScopedClasses['period-group-options']} */ ;
/** @type {__VLS_StyleScopedClasses['period-group-options']} */ ;
/** @type {__VLS_StyleScopedClasses['period-group-options']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['switch-field']} */ ;
/** @type {__VLS_StyleScopedClasses['switch-field']} */ ;
/** @type {__VLS_StyleScopedClasses['switch-field']} */ ;
/** @type {__VLS_StyleScopedClasses['switch-field']} */ ;
/** @type {__VLS_StyleScopedClasses['switch-field']} */ ;
/** @type {__VLS_StyleScopedClasses['switch-field']} */ ;
/** @type {__VLS_StyleScopedClasses['form-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['form-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['cycle-form']} */ ;
/** @type {__VLS_StyleScopedClasses['form-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['form-anchor']} */ ;
/** @type {__VLS_StyleScopedClasses['anchor-track']} */ ;
/** @type {__VLS_StyleScopedClasses['form-anchor']} */ ;
/** @type {__VLS_StyleScopedClasses['form-anchor']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['form-anchor']} */ ;
/** @type {__VLS_StyleScopedClasses['form-content']} */ ;
/** @type {__VLS_StyleScopedClasses['form-card']} */ ;
/** @type {__VLS_StyleScopedClasses['two-col']} */ ;
/** @type {__VLS_StyleScopedClasses['two-col']} */ ;
/** @type {__VLS_StyleScopedClasses['field-group']} */ ;
/** @type {__VLS_StyleScopedClasses['two-col']} */ ;
/** @type {__VLS_StyleScopedClasses['form-footer']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "cycle-page" },
});
if (!__VLS_ctx.editing) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "cycle-page-content" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({
        id: "cycle-list-title",
        ...{ class: "cycle-page-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "cycle-workspace-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "cycle-workspace" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
        ...{ class: "cycle-list-panel" },
        'aria-labelledby': "cycle-list-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "info" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "cycle-search-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        ...{ onKeyup: (__VLS_ctx.searchCycles) },
        'aria-label': "搜索周期",
        placeholder: "⌕ 搜索周期",
    });
    (__VLS_ctx.keyword);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.searchCycles) },
        ...{ class: "outline-button filter-button" },
        type: "button",
    });
    if (__VLS_ctx.canManageCycles) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.startCreate) },
            ...{ class: "icon-button" },
            type: "button",
            'aria-label': "新建周期",
        });
    }
    if (__VLS_ctx.loading) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "cycle-loading" },
            role: "status",
            'aria-label': "正在加载周期",
        });
        for (const [line] of __VLS_getVForSourceType((5))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
                key: (line),
                ...{ class: "skeleton-line" },
                'aria-hidden': "true",
            });
        }
    }
    else if (!__VLS_ctx.cycles.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "empty-state" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx.keyword ? '没有找到匹配周期' : '暂无周期');
        if (__VLS_ctx.keyword) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (__VLS_ctx.clearSearch) },
                ...{ class: "outline-button" },
                type: "button",
            });
        }
        else if (__VLS_ctx.canManageCycles) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (__VLS_ctx.startCreate) },
                ...{ class: "primary-button" },
                type: "button",
            });
        }
    }
    for (const [cycle] of __VLS_getVForSourceType((__VLS_ctx.cycles))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(!__VLS_ctx.editing))
                        return;
                    __VLS_ctx.selectCycle(cycle);
                } },
            key: (cycle.id),
            ...{ class: "cycle-item" },
            ...{ class: ({ active: __VLS_ctx.selected?.id === cycle.id }) },
            type: "button",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "truncate" },
        });
        (cycle.name);
        if (__VLS_ctx.selected?.id === cycle.id) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "cycle-more" },
            });
        }
    }
    if (__VLS_ctx.total > __VLS_ctx.pageSize) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "cycle-pagination" },
            'aria-label': "周期分页",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(!__VLS_ctx.editing))
                        return;
                    if (!(__VLS_ctx.total > __VLS_ctx.pageSize))
                        return;
                    __VLS_ctx.changePage(__VLS_ctx.page - 1);
                } },
            disabled: (__VLS_ctx.page === 1),
            'aria-label': "上一页",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.page);
        (__VLS_ctx.totalPages);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(!__VLS_ctx.editing))
                        return;
                    if (!(__VLS_ctx.total > __VLS_ctx.pageSize))
                        return;
                    __VLS_ctx.changePage(__VLS_ctx.page + 1);
                } },
            disabled: (__VLS_ctx.page >= __VLS_ctx.totalPages),
            'aria-label': "下一页",
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
        ...{ class: "cycle-detail-panel" },
    });
    if (__VLS_ctx.saveSuccess) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "success state-success" },
            role: "status",
        });
    }
    if (__VLS_ctx.formError) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "error state-error" },
            role: "alert",
        });
        (__VLS_ctx.formError);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.loadCycles) },
            ...{ class: "outline-button" },
            type: "button",
        });
    }
    if (__VLS_ctx.selected) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "detail-content" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
            ...{ class: "detail-heading" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
            ...{ class: "truncate" },
        });
        (__VLS_ctx.selected.name);
        if (__VLS_ctx.canManageCycles) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "detail-actions" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (__VLS_ctx.startEdit) },
                ...{ class: "outline-button" },
                type: "button",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (__VLS_ctx.removeSelected) },
                ...{ class: "danger-button" },
                type: "button",
                disabled: (__VLS_ctx.hasStartedProject),
            });
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "metrics" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx.selected.people_count);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx.selected.department_count);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.formatRange(__VLS_ctx.selected.start_at, __VLS_ctx.selected.end_at));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.selected.status === 'LOCKED' ? '已锁定' : '待锁定');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.selected.leaver_enabled ? '是' : '否');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "project-heading" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "project-tools" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ class: "primary-button large" },
            type: "button",
            disabled: true,
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            'aria-label': "通过项目名称搜索",
            placeholder: "⌕ 通过项目名称搜索",
            disabled: true,
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ class: "outline-button" },
            type: "button",
            disabled: true,
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "project-table-wrap" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.table, __VLS_intrinsicElements.table)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.thead, __VLS_intrinsicElements.thead)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
            ...{ class: "fixed-operation" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.tbody, __VLS_intrinsicElements.tbody)({});
        for (const [project] of __VLS_getVForSourceType((__VLS_ctx.selected.projects))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({
                key: (project.id),
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
            (project.name);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
            (project.description || '--');
            __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
            (project.administrators.join('、') || '--');
            __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
            (project.status);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
            (project.evaluated_count);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
                ...{ class: "fixed-operation" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                type: "button",
                disabled: true,
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                type: "button",
                disabled: true,
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.details, __VLS_intrinsicElements.details)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.summary, __VLS_intrinsicElements.summary)({
                'aria-label': "更多项目操作（后续开放）",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                type: "button",
                disabled: true,
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                type: "button",
                disabled: true,
            });
        }
        if (!__VLS_ctx.selected.projects.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
                colspan: "6",
                ...{ class: "empty-project" },
            });
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "project-footer" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.selected.project_count);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            disabled: true,
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ class: "current" },
            disabled: true,
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            disabled: true,
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
            'aria-label': "项目每页条数",
            disabled: true,
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({});
        if (__VLS_ctx.canManagePeople) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
                ...{ class: "people-card" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "people-heading" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (__VLS_ctx.togglePeople) },
                ...{ class: "outline-button" },
                type: "button",
            });
            (__VLS_ctx.showPeople ? '收起' : '维护名单');
            if (__VLS_ctx.showPeople) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "people-content" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "description" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "people-actions" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
                    'aria-label': "人员维护原因",
                    placeholder: "请输入维护原因",
                });
                (__VLS_ctx.peopleReason);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (__VLS_ctx.refreshPeople) },
                    ...{ class: "outline-button" },
                    type: "button",
                    disabled: (__VLS_ctx.peopleLoading || !__VLS_ctx.peopleReason),
                });
                if (__VLS_ctx.peopleLoading) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "state" },
                        role: "status",
                    });
                }
                else {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "people-table-wrap" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.table, __VLS_intrinsicElements.table)({});
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.thead, __VLS_intrinsicElements.thead)({});
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.tbody, __VLS_intrinsicElements.tbody)({});
                    for (const [person] of __VLS_getVForSourceType((__VLS_ctx.people))) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({
                            key: (person.employee_no),
                        });
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
                        (person.employee_no);
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
                            'aria-label': (`${person.employee_no}姓名`),
                        });
                        (person.display_name);
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
                            'aria-label': (`${person.employee_no}组织`),
                        });
                        (person.organization_ref);
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
                            'aria-label': (`${person.employee_no}直属上级`),
                        });
                        (person.direct_manager_employee_no);
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
                            'aria-label': (`${person.employee_no}HRBP`),
                        });
                        (person.hrbp_employee_no);
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
                        (person.employment_status || '--');
                        if (person.is_manually_maintained) {
                            __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
                        }
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                            ...{ onClick: (...[$event]) => {
                                    if (!(!__VLS_ctx.editing))
                                        return;
                                    if (!(__VLS_ctx.selected))
                                        return;
                                    if (!(__VLS_ctx.canManagePeople))
                                        return;
                                    if (!(__VLS_ctx.showPeople))
                                        return;
                                    if (!!(__VLS_ctx.peopleLoading))
                                        return;
                                    __VLS_ctx.savePerson(person);
                                } },
                            type: "button",
                            disabled: (!__VLS_ctx.peopleReason),
                        });
                    }
                    if (!__VLS_ctx.people.length) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
                            colspan: "7",
                            ...{ class: "empty-project" },
                        });
                    }
                }
            }
        }
    }
    else if (!__VLS_ctx.loading) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "state detail-empty" },
        });
    }
}
if (__VLS_ctx.deleteConfirm) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (__VLS_ctx.closeDeleteDialog) },
        ...{ class: "modal-mask" },
        role: "presentation",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onKeydown: (__VLS_ctx.handleDialogKeydown) },
        ref: "dialogRef",
        ...{ class: "confirm-dialog" },
        role: "dialog",
        'aria-modal': "true",
        'aria-labelledby': "delete-title",
        'aria-describedby': "delete-description",
        tabindex: "-1",
    });
    /** @type {typeof __VLS_ctx.dialogRef} */ ;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
        id: "delete-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        id: "delete-description",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.closeDeleteDialog) },
        ref: "cancelDeleteRef",
        ...{ class: "outline-button" },
        type: "button",
    });
    /** @type {typeof __VLS_ctx.cancelDeleteRef} */ ;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.confirmDelete) },
        ref: "confirmDeleteRef",
        ...{ class: "danger-button" },
        type: "button",
        disabled: (__VLS_ctx.deleting),
    });
    /** @type {typeof __VLS_ctx.confirmDeleteRef} */ ;
    (__VLS_ctx.deleting ? '删除中...' : '删除');
}
if (__VLS_ctx.editing) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "cycle-modal" },
        role: "presentation",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.form, __VLS_intrinsicElements.form)({
        ...{ onSubmit: (__VLS_ctx.submitForm) },
        ...{ class: "cycle-form" },
        role: "dialog",
        'aria-modal': "true",
        'aria-label': (__VLS_ctx.formMode === 'create' ? '新建周期' : '编辑周期'),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
        ...{ class: "form-top" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.cancelEdit) },
        type: "button",
        ...{ class: "back-button" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "header-divider" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.formMode === 'create' ? '新建周期' : '编辑周期');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "form-layout" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.nav, __VLS_intrinsicElements.nav)({
        ...{ class: "form-anchor" },
        'aria-label': "周期表单导航",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "anchor-track" },
        'aria-hidden': "true",
    });
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.anchorItems))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.a, __VLS_intrinsicElements.a)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.editing))
                        return;
                    __VLS_ctx.activeAnchor = item.id;
                } },
            key: (item.id),
            href: (`#${item.id}`),
            'aria-current': (__VLS_ctx.activeAnchor === item.id ? 'location' : undefined),
        });
        (item.label);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "form-content" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        id: "cycle-info",
        ...{ class: "form-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "notice" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "field-group language-group" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "radio-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        id: "cycle-language",
        type: "radio",
        checked: true,
        disabled: true,
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "field-group" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        for: "cycle-name",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        id: "cycle-name",
        required: true,
        maxlength: "128",
        ...{ class: "wide-input" },
    });
    (__VLS_ctx.form.name);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "two-col field-row cycle-info-period-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "field-group" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        for: "cycle-year",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "year-picker" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.toggleYearPicker) },
        id: "cycle-year",
        type: "button",
        ...{ class: "selector-control" },
        'aria-label': "选择年份",
        'aria-expanded': (__VLS_ctx.yearPickerOpen),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: ({ 'selector-placeholder': !__VLS_ctx.form.period_year }) },
    });
    (__VLS_ctx.form.period_year || '请选择年份');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "selector-icon calendar-icon" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        viewBox: "0 0 24 24",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M7 2a1 1 0 0 1 1 1h8a1 1 0 1 1 2 0h2a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2a1 1 0 0 1 1 1Zm9 3H8a1 1 0 0 1-2 0H4v15h16V5h-2a1 1 0 0 1-2 0Zm-7 10a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1Zm1.5-5a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1Zm3 5a1 1 0 0 0-1-1h-1a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1Zm1.5 0a1 1 0 0 1 1 1h1a1 1 0 0 1 1-1v-1a1 1 0 0 0-1-1h-1a1 1 0 0 0-1 1Z",
        fill: "currentColor",
    });
    if (__VLS_ctx.yearPickerOpen) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "picker-panel year-panel" },
            role: "dialog",
            'aria-label': "年份选择器",
            ...{ style: (__VLS_ctx.yearPanelStyle) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "picker-panel-header" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx.yearPageStart);
        (__VLS_ctx.yearPageStart + __VLS_ctx.yearPageSize - 1);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.editing))
                        return;
                    if (!(__VLS_ctx.yearPickerOpen))
                        return;
                    __VLS_ctx.changeYearPage(-1);
                } },
            type: "button",
            'aria-label': "上一组年份",
            disabled: (__VLS_ctx.yearPageStart <= 1900),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.editing))
                        return;
                    if (!(__VLS_ctx.yearPickerOpen))
                        return;
                    __VLS_ctx.changeYearPage(1);
                } },
            type: "button",
            'aria-label': "下一组年份",
            disabled: (__VLS_ctx.yearPageStart + __VLS_ctx.yearPageSize > 2200),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "year-options" },
            role: "group",
            'aria-label': "选择年份",
        });
        for (const [year] of __VLS_getVForSourceType((__VLS_ctx.yearOptions))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.editing))
                            return;
                        if (!(__VLS_ctx.yearPickerOpen))
                            return;
                        __VLS_ctx.selectYear(year);
                        __VLS_ctx.yearPickerOpen = false;
                    } },
                key: (year),
                type: "button",
                ...{ class: ({ active: __VLS_ctx.form.period_year === year }) },
                'aria-pressed': (__VLS_ctx.form.period_year === year),
            });
            (year);
        }
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "field-group" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        for: "cycle-type",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "period-type-picker" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.togglePeriodTypePicker) },
        id: "cycle-type",
        type: "button",
        ...{ class: "selector-control" },
        'aria-label': "选择周期类型",
        'aria-expanded': (__VLS_ctx.periodTypePickerOpen),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: ({ 'selector-placeholder': !__VLS_ctx.selectedPeriodOption }) },
    });
    (__VLS_ctx.selectedPeriodOption?.label || '请选择');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "selector-icon arrow-icon" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        viewBox: "0 0 24 24",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "m3.414 7.086-.707.707a1 1 0 0 0 0 1.414l7.778 7.778a2 2 0 0 0 2.829 0l7.778-7.778a1 1 0 0 0-1.414-1.414l-7.071 7.071-7.071-7.071a1 1 0 0 0-1.414 0Z",
        fill: "currentColor",
    });
    if (__VLS_ctx.periodTypePickerOpen) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "picker-panel period-panel" },
            role: "listbox",
            'aria-label': "周期类型选择器",
            ...{ style: (__VLS_ctx.periodPanelStyle) },
        });
        for (const [group] of __VLS_getVForSourceType((__VLS_ctx.periodTypeGroups))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (group.label),
                ...{ class: "period-group" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "period-group-label" },
            });
            (group.label);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "period-group-options" },
            });
            for (const [option] of __VLS_getVForSourceType((group.options))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!(__VLS_ctx.editing))
                                return;
                            if (!(__VLS_ctx.periodTypePickerOpen))
                                return;
                            __VLS_ctx.selectPeriodOption(option);
                        } },
                    key: (option.value),
                    type: "button",
                    role: "option",
                    'aria-selected': (__VLS_ctx.selectedPeriodOption?.value === option.value),
                    ...{ class: ({ active: __VLS_ctx.selectedPeriodOption?.value === option.value }) },
                });
                (option.label);
            }
        }
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "field-group range-group" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "field-description" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "two-col field-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "field-group" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        for: "cycle-start",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        id: "cycle-start",
        type: "datetime-local",
        required: true,
        'aria-invalid': (__VLS_ctx.dateError || undefined),
        'aria-describedby': (__VLS_ctx.dateError ? 'cycle-date-error' : undefined),
    });
    (__VLS_ctx.form.start_at);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "field-group" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        for: "cycle-end",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        id: "cycle-end",
        type: "datetime-local",
        required: true,
        'aria-invalid': (__VLS_ctx.dateError || undefined),
        'aria-describedby': (__VLS_ctx.dateError ? 'cycle-date-error' : undefined),
    });
    (__VLS_ctx.form.end_at);
    if (__VLS_ctx.dateError) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({
            id: "cycle-date-error",
            ...{ class: "error" },
            role: "alert",
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        id: "people-settings",
        ...{ class: "form-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "field-group" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "field-description" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "radio-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        value: "IMMEDIATE",
        type: "radio",
        disabled: (__VLS_ctx.formMode === 'edit'),
    });
    (__VLS_ctx.form.lock_rule);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        value: "SCHEDULED",
        type: "radio",
        disabled: (__VLS_ctx.formMode === 'edit'),
    });
    (__VLS_ctx.form.lock_rule);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    if (__VLS_ctx.form.lock_rule === 'SCHEDULED') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "sub-card" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "field-group" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            for: "lock-at",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            id: "lock-at",
            type: "datetime-local",
            disabled: (__VLS_ctx.formMode === 'edit'),
            required: true,
            'aria-invalid': (__VLS_ctx.lockError || undefined),
            'aria-describedby': (__VLS_ctx.lockError ? 'lock-at-error' : undefined),
        });
        (__VLS_ctx.form.lock_at);
        if (__VLS_ctx.lockError) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({
                id: "lock-at-error",
                ...{ class: "error" },
                role: "alert",
            });
        }
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "sub-card sync-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "field-group" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "field-description" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "radio-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        value: "MANUAL",
        type: "radio",
        disabled: (__VLS_ctx.formMode === 'edit'),
    });
    (__VLS_ctx.form.pre_lock_sync_mode);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        value: "AUTO_DAILY",
        type: "radio",
        disabled: (__VLS_ctx.formMode === 'edit'),
    });
    (__VLS_ctx.form.pre_lock_sync_mode);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        id: "evaluation-settings",
        ...{ class: "form-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "field-group" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        for: "evaluation-template",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
        id: "evaluation-template",
        value: (__VLS_ctx.form.evaluation_template),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        id: "leaver-settings",
        ...{ class: "form-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "switch-field" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        for: "leaver-enabled",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        id: "leaver-enabled",
        type: "checkbox",
        role: "switch",
    });
    (__VLS_ctx.form.leaver_enabled);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "field-description" },
    });
    if (__VLS_ctx.form.leaver_enabled) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "sub-card" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "field-group" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "two-col field-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            id: "leaver-start",
            type: "date",
            required: true,
            'aria-invalid': (__VLS_ctx.leaverDateError || undefined),
            'aria-describedby': (__VLS_ctx.leaverDateError ? 'leaver-date-error' : undefined),
        });
        (__VLS_ctx.form.leaver_start_date);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            id: "leaver-end",
            type: "date",
            required: true,
            'aria-invalid': (__VLS_ctx.leaverDateError || undefined),
            'aria-describedby': (__VLS_ctx.leaverDateError ? 'leaver-date-error' : undefined),
        });
        (__VLS_ctx.form.leaver_end_date);
        if (__VLS_ctx.leaverDateError) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({
                id: "leaver-date-error",
                ...{ class: "error" },
                role: "alert",
            });
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "field-group" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "radio-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            value: "CREATE_TASK",
            type: "radio",
        });
        (__VLS_ctx.form.leaver_participation_mode);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            value: "REPORT_ONLY",
            type: "radio",
        });
        (__VLS_ctx.form.leaver_participation_mode);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.footer, __VLS_intrinsicElements.footer)({
        ...{ class: "form-footer" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ class: "primary-button" },
        type: "submit",
        disabled: (__VLS_ctx.saving),
    });
    (__VLS_ctx.saving ? '保存中...' : '保存');
    if (__VLS_ctx.formError) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "error" },
            role: "alert",
        });
        (__VLS_ctx.formError);
    }
}
/** @type {__VLS_StyleScopedClasses['cycle-page']} */ ;
/** @type {__VLS_StyleScopedClasses['cycle-page-content']} */ ;
/** @type {__VLS_StyleScopedClasses['cycle-page-title']} */ ;
/** @type {__VLS_StyleScopedClasses['cycle-workspace-card']} */ ;
/** @type {__VLS_StyleScopedClasses['cycle-workspace']} */ ;
/** @type {__VLS_StyleScopedClasses['cycle-list-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['info']} */ ;
/** @type {__VLS_StyleScopedClasses['cycle-search-row']} */ ;
/** @type {__VLS_StyleScopedClasses['outline-button']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-button']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-button']} */ ;
/** @type {__VLS_StyleScopedClasses['cycle-loading']} */ ;
/** @type {__VLS_StyleScopedClasses['skeleton-line']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['outline-button']} */ ;
/** @type {__VLS_StyleScopedClasses['primary-button']} */ ;
/** @type {__VLS_StyleScopedClasses['cycle-item']} */ ;
/** @type {__VLS_StyleScopedClasses['truncate']} */ ;
/** @type {__VLS_StyleScopedClasses['cycle-more']} */ ;
/** @type {__VLS_StyleScopedClasses['cycle-pagination']} */ ;
/** @type {__VLS_StyleScopedClasses['cycle-detail-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['success']} */ ;
/** @type {__VLS_StyleScopedClasses['state-success']} */ ;
/** @type {__VLS_StyleScopedClasses['error']} */ ;
/** @type {__VLS_StyleScopedClasses['state-error']} */ ;
/** @type {__VLS_StyleScopedClasses['outline-button']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-content']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['truncate']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['outline-button']} */ ;
/** @type {__VLS_StyleScopedClasses['danger-button']} */ ;
/** @type {__VLS_StyleScopedClasses['metrics']} */ ;
/** @type {__VLS_StyleScopedClasses['project-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['project-tools']} */ ;
/** @type {__VLS_StyleScopedClasses['primary-button']} */ ;
/** @type {__VLS_StyleScopedClasses['large']} */ ;
/** @type {__VLS_StyleScopedClasses['outline-button']} */ ;
/** @type {__VLS_StyleScopedClasses['project-table-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['fixed-operation']} */ ;
/** @type {__VLS_StyleScopedClasses['fixed-operation']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-project']} */ ;
/** @type {__VLS_StyleScopedClasses['project-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['current']} */ ;
/** @type {__VLS_StyleScopedClasses['people-card']} */ ;
/** @type {__VLS_StyleScopedClasses['people-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['outline-button']} */ ;
/** @type {__VLS_StyleScopedClasses['people-content']} */ ;
/** @type {__VLS_StyleScopedClasses['description']} */ ;
/** @type {__VLS_StyleScopedClasses['people-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['outline-button']} */ ;
/** @type {__VLS_StyleScopedClasses['state']} */ ;
/** @type {__VLS_StyleScopedClasses['people-table-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-project']} */ ;
/** @type {__VLS_StyleScopedClasses['state']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-mask']} */ ;
/** @type {__VLS_StyleScopedClasses['confirm-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['outline-button']} */ ;
/** @type {__VLS_StyleScopedClasses['danger-button']} */ ;
/** @type {__VLS_StyleScopedClasses['cycle-modal']} */ ;
/** @type {__VLS_StyleScopedClasses['cycle-form']} */ ;
/** @type {__VLS_StyleScopedClasses['form-top']} */ ;
/** @type {__VLS_StyleScopedClasses['back-button']} */ ;
/** @type {__VLS_StyleScopedClasses['header-divider']} */ ;
/** @type {__VLS_StyleScopedClasses['form-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['form-anchor']} */ ;
/** @type {__VLS_StyleScopedClasses['anchor-track']} */ ;
/** @type {__VLS_StyleScopedClasses['form-content']} */ ;
/** @type {__VLS_StyleScopedClasses['form-card']} */ ;
/** @type {__VLS_StyleScopedClasses['notice']} */ ;
/** @type {__VLS_StyleScopedClasses['field-group']} */ ;
/** @type {__VLS_StyleScopedClasses['language-group']} */ ;
/** @type {__VLS_StyleScopedClasses['radio-row']} */ ;
/** @type {__VLS_StyleScopedClasses['field-group']} */ ;
/** @type {__VLS_StyleScopedClasses['wide-input']} */ ;
/** @type {__VLS_StyleScopedClasses['two-col']} */ ;
/** @type {__VLS_StyleScopedClasses['field-row']} */ ;
/** @type {__VLS_StyleScopedClasses['cycle-info-period-row']} */ ;
/** @type {__VLS_StyleScopedClasses['field-group']} */ ;
/** @type {__VLS_StyleScopedClasses['year-picker']} */ ;
/** @type {__VLS_StyleScopedClasses['selector-control']} */ ;
/** @type {__VLS_StyleScopedClasses['selector-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['calendar-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['picker-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['year-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['picker-panel-header']} */ ;
/** @type {__VLS_StyleScopedClasses['year-options']} */ ;
/** @type {__VLS_StyleScopedClasses['field-group']} */ ;
/** @type {__VLS_StyleScopedClasses['period-type-picker']} */ ;
/** @type {__VLS_StyleScopedClasses['selector-control']} */ ;
/** @type {__VLS_StyleScopedClasses['selector-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['arrow-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['picker-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['period-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['period-group']} */ ;
/** @type {__VLS_StyleScopedClasses['period-group-label']} */ ;
/** @type {__VLS_StyleScopedClasses['period-group-options']} */ ;
/** @type {__VLS_StyleScopedClasses['field-group']} */ ;
/** @type {__VLS_StyleScopedClasses['range-group']} */ ;
/** @type {__VLS_StyleScopedClasses['field-description']} */ ;
/** @type {__VLS_StyleScopedClasses['two-col']} */ ;
/** @type {__VLS_StyleScopedClasses['field-row']} */ ;
/** @type {__VLS_StyleScopedClasses['field-group']} */ ;
/** @type {__VLS_StyleScopedClasses['field-group']} */ ;
/** @type {__VLS_StyleScopedClasses['error']} */ ;
/** @type {__VLS_StyleScopedClasses['form-card']} */ ;
/** @type {__VLS_StyleScopedClasses['field-group']} */ ;
/** @type {__VLS_StyleScopedClasses['field-description']} */ ;
/** @type {__VLS_StyleScopedClasses['radio-row']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-card']} */ ;
/** @type {__VLS_StyleScopedClasses['field-group']} */ ;
/** @type {__VLS_StyleScopedClasses['error']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-card']} */ ;
/** @type {__VLS_StyleScopedClasses['sync-card']} */ ;
/** @type {__VLS_StyleScopedClasses['field-group']} */ ;
/** @type {__VLS_StyleScopedClasses['field-description']} */ ;
/** @type {__VLS_StyleScopedClasses['radio-row']} */ ;
/** @type {__VLS_StyleScopedClasses['form-card']} */ ;
/** @type {__VLS_StyleScopedClasses['field-group']} */ ;
/** @type {__VLS_StyleScopedClasses['form-card']} */ ;
/** @type {__VLS_StyleScopedClasses['switch-field']} */ ;
/** @type {__VLS_StyleScopedClasses['field-description']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-card']} */ ;
/** @type {__VLS_StyleScopedClasses['field-group']} */ ;
/** @type {__VLS_StyleScopedClasses['two-col']} */ ;
/** @type {__VLS_StyleScopedClasses['field-row']} */ ;
/** @type {__VLS_StyleScopedClasses['error']} */ ;
/** @type {__VLS_StyleScopedClasses['field-group']} */ ;
/** @type {__VLS_StyleScopedClasses['radio-row']} */ ;
/** @type {__VLS_StyleScopedClasses['form-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['primary-button']} */ ;
/** @type {__VLS_StyleScopedClasses['error']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            cycles: cycles,
            selected: selected,
            loading: loading,
            saving: saving,
            deleting: deleting,
            editing: editing,
            formMode: formMode,
            keyword: keyword,
            page: page,
            pageSize: pageSize,
            total: total,
            formError: formError,
            saveSuccess: saveSuccess,
            people: people,
            peopleLoading: peopleLoading,
            showPeople: showPeople,
            peopleReason: peopleReason,
            deleteConfirm: deleteConfirm,
            dialogRef: dialogRef,
            cancelDeleteRef: cancelDeleteRef,
            confirmDeleteRef: confirmDeleteRef,
            canManageCycles: canManageCycles,
            canManagePeople: canManagePeople,
            totalPages: totalPages,
            dateError: dateError,
            leaverDateError: leaverDateError,
            lockError: lockError,
            hasStartedProject: hasStartedProject,
            yearPickerOpen: yearPickerOpen,
            periodTypePickerOpen: periodTypePickerOpen,
            yearPanelStyle: yearPanelStyle,
            periodPanelStyle: periodPanelStyle,
            periodTypeGroups: periodTypeGroups,
            selectedPeriodOption: selectedPeriodOption,
            activeAnchor: activeAnchor,
            anchorItems: anchorItems,
            yearPageSize: yearPageSize,
            yearPageStart: yearPageStart,
            yearOptions: yearOptions,
            form: form,
            changeYearPage: changeYearPage,
            toggleYearPicker: toggleYearPicker,
            togglePeriodTypePicker: togglePeriodTypePicker,
            selectYear: selectYear,
            selectPeriodOption: selectPeriodOption,
            formatRange: formatRange,
            loadCycles: loadCycles,
            searchCycles: searchCycles,
            clearSearch: clearSearch,
            changePage: changePage,
            selectCycle: selectCycle,
            startCreate: startCreate,
            startEdit: startEdit,
            cancelEdit: cancelEdit,
            submitForm: submitForm,
            togglePeople: togglePeople,
            refreshPeople: refreshPeople,
            savePerson: savePerson,
            closeDeleteDialog: closeDeleteDialog,
            handleDialogKeydown: handleDialogKeydown,
            removeSelected: removeSelected,
            confirmDelete: confirmDelete,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
