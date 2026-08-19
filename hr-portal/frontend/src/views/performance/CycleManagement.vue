<template>
  <section class="cycle-page">
    <div v-if="!editing" class="cycle-page-content">
      <h1 id="cycle-list-title" class="cycle-page-title">周期与项目</h1>
      <div class="cycle-workspace-card">
        <div class="cycle-workspace">
          <aside class="cycle-list-panel" aria-labelledby="cycle-list-title">
            <h2>周期 <span class="info" aria-hidden="true">ⓘ</span></h2>
            <div class="cycle-search-row">
          <input v-model="keyword" aria-label="搜索周期" placeholder="⌕ 搜索周期" @keyup.enter="searchCycles" />
          <button class="outline-button filter-button" type="button" @click="searchCycles">筛选</button>
          <button v-if="canManageCycles" class="icon-button" type="button" aria-label="新建周期" @click="startCreate">＋</button>
        </div>
        <div v-if="loading" class="cycle-loading" role="status" aria-label="正在加载周期">
          <span v-for="line in 5" :key="line" class="skeleton-line" aria-hidden="true" />
        </div>
        <div v-else-if="!cycles.length" class="empty-state">
          <strong>{{ keyword ? '没有找到匹配周期' : '暂无周期' }}</strong>
          <button v-if="keyword" class="outline-button" type="button" @click="clearSearch">清除筛选</button>
          <button v-else-if="canManageCycles" class="primary-button" type="button" @click="startCreate">新建周期</button>
        </div>
        <button v-for="cycle in cycles" :key="cycle.id" class="cycle-item" :class="{ active: selected?.id === cycle.id }" type="button" @click="selectCycle(cycle)">
          <span class="truncate">{{ cycle.name }}</span><span v-if="selected?.id === cycle.id" class="cycle-more">•••</span>
        </button>
        <div v-if="total > pageSize" class="cycle-pagination" aria-label="周期分页">
          <button :disabled="page === 1" aria-label="上一页" @click="changePage(page - 1)">‹</button>
          <span>{{ page }} / {{ totalPages }}</span>
          <button :disabled="page >= totalPages" aria-label="下一页" @click="changePage(page + 1)">›</button>
        </div>
          </aside>

          <main class="cycle-detail-panel">
        <p v-if="saveSuccess" class="success state-success" role="status">周期已保存</p>
        <p v-if="formError" class="error state-error" role="alert">{{ formError }} <button class="outline-button" type="button" @click="loadCycles">重试</button></p>
        <div v-if="selected" class="detail-content">
          <header class="detail-heading"><h2 class="truncate">{{ selected.name }}</h2><div v-if="canManageCycles" class="detail-actions"><button class="outline-button" type="button" @click="startEdit">⚙ 设置</button><button class="danger-button" type="button" :disabled="hasStartedProject" @click="removeSelected">删除</button></div></header>
          <h3>基本信息</h3>
          <div class="metrics"><div><label>人员</label><strong>{{ selected.people_count }}</strong></div><div><label>部门</label><strong>{{ selected.department_count }}</strong></div><div><label>周期起止时间</label><span>{{ formatRange(selected.start_at, selected.end_at) }}</span></div><div><label>锁定状态</label><span>{{ selected.status === 'LOCKED' ? '已锁定' : '待锁定' }}</span></div><div><label>离职人员参评</label><span>{{ selected.leaver_enabled ? '是' : '否' }}</span></div></div>
          <div class="project-heading"><h3>项目设置</h3><div class="project-tools"><button class="primary-button large" type="button" disabled>＋ 新建</button><input aria-label="通过项目名称搜索" placeholder="⌕ 通过项目名称搜索" disabled /><button class="outline-button" type="button" disabled>⚙ 筛选</button></div></div>
          <div class="project-table-wrap"><table><thead><tr><th>项目名称</th><th>描述</th><th>项目管理员</th><th>状态</th><th>评估人数</th><th class="fixed-operation">操作</th></tr></thead><tbody><tr v-for="project in selected.projects" :key="project.id"><td>{{ project.name }}</td><td>{{ project.description || '--' }}</td><td>{{ project.administrators.join('、') || '--' }}</td><td>{{ project.status }}</td><td>{{ project.evaluated_count }}</td><td class="fixed-operation"><button type="button" disabled>编辑</button><button type="button" disabled>启动</button><details><summary aria-label="更多项目操作（后续开放）">•••</summary><button type="button" disabled>复制</button><button type="button" disabled>删除</button></details></td></tr><tr v-if="!selected.projects.length"><td colspan="6" class="empty-project">项目配置将在下一项功能中开放</td></tr></tbody></table></div>
          <div class="project-footer"><span>共 {{ selected.project_count }} 条</span><button disabled>‹</button><button class="current" disabled>1</button><button disabled>›</button><select aria-label="项目每页条数" disabled><option>10 条/页</option></select></div>
          <section v-if="canManagePeople" class="people-card"><div class="people-heading"><h3>人员与部门信息</h3><button class="outline-button" type="button" @click="togglePeople">{{ showPeople ? '收起' : '维护名单' }}</button></div><div v-if="showPeople" class="people-content"><p class="description">锁定后、绩效开始前可刷新名单或手工维护组织关系、汇报线；保存必须填写原因。</p><div class="people-actions"><input v-model.trim="peopleReason" aria-label="人员维护原因" placeholder="请输入维护原因" /><button class="outline-button" type="button" :disabled="peopleLoading || !peopleReason" @click="refreshPeople">刷新未手工维护名单</button></div><div v-if="peopleLoading" class="state" role="status">正在加载人员...</div><div v-else class="people-table-wrap"><table><thead><tr><th>工号</th><th>姓名</th><th>组织</th><th>直属上级</th><th>HRBP</th><th>状态</th><th>操作</th></tr></thead><tbody><tr v-for="person in people" :key="person.employee_no"><td>{{ person.employee_no }}</td><td><input v-model.trim="person.display_name" :aria-label="`${person.employee_no}姓名`" /></td><td><input v-model.trim="person.organization_ref" :aria-label="`${person.employee_no}组织`" /></td><td><input v-model.trim="person.direct_manager_employee_no" :aria-label="`${person.employee_no}直属上级`" /></td><td><input v-model.trim="person.hrbp_employee_no" :aria-label="`${person.employee_no}HRBP`" /></td><td>{{ person.employment_status || '--' }}<small v-if="person.is_manually_maintained">（已手工维护）</small></td><td><button type="button" :disabled="!peopleReason" @click="savePerson(person)">保存</button></td></tr><tr v-if="!people.length"><td colspan="7" class="empty-project">暂无周期人员快照</td></tr></tbody></table></div></div></section>
        </div>
        <div v-else-if="!loading" class="state detail-empty">请选择一个周期</div>
          </main>
        </div>
      </div>
    </div>

    <div v-if="deleteConfirm" class="modal-mask" role="presentation" @click.self="closeDeleteDialog">
      <div ref="dialogRef" class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-description" tabindex="-1" @keydown="handleDialogKeydown">
        <h3 id="delete-title">确定要删除周期吗？</h3><p id="delete-description">删除后，周期内的所有项目将同步删除，请谨慎操作。</p>
        <div><button ref="cancelDeleteRef" class="outline-button" type="button" @click="closeDeleteDialog">保留</button><button ref="confirmDeleteRef" class="danger-button" type="button" :disabled="deleting" @click="confirmDelete">{{ deleting ? '删除中...' : '删除' }}</button></div>
      </div>
    </div>

    <div v-if="editing" class="cycle-modal" role="presentation">
      <form class="cycle-form" role="dialog" aria-modal="true" :aria-label="formMode === 'create' ? '新建周期' : '编辑周期'" @submit.prevent="submitForm">
        <header class="form-top">
          <button type="button" class="back-button" @click="cancelEdit"><span aria-hidden="true">←</span><span>返回</span></button>
          <span class="header-divider" aria-hidden="true"></span>
          <strong>{{ formMode === 'create' ? '新建周期' : '编辑周期' }}</strong>
        </header>
        <div class="form-layout">
          <nav class="form-anchor" aria-label="周期表单导航">
            <div class="anchor-track" aria-hidden="true"></div>
            <a v-for="item in anchorItems" :key="item.id" :href="`#${item.id}`" :aria-current="activeAnchor === item.id ? 'location' : undefined" @click="activeAnchor = item.id">{{ item.label }}</a>
          </nav>
          <div class="form-content">
            <section id="cycle-info" class="form-card">
              <h2>周期信息</h2>
              <p class="notice">创建成功后，可以继续修改周期名称、绩效表现起止时间，改动将对该周期内所有项目生效。</p>
              <div class="field-group language-group">
                <label>语言<span>*</span></label>
                <div class="radio-row">
                  <label><input id="cycle-language" type="radio" checked disabled /> <span>中文</span></label>
                </div>
              </div>
              <div class="field-group">
                <label for="cycle-name">周期名称<span>*</span></label>
                <input id="cycle-name" v-model.trim="form.name" required maxlength="128" class="wide-input" />
              </div>
              <div class="two-col field-row cycle-info-period-row">
                <div class="field-group">
                  <label for="cycle-year">年份<span>*</span></label>
                  <div class="year-picker">
                    <button id="cycle-year" type="button" class="selector-control" aria-label="选择年份" :aria-expanded="yearPickerOpen" @click="toggleYearPicker"><span :class="{ 'selector-placeholder': !form.period_year }">{{ form.period_year || '请选择年份' }}</span><span class="selector-icon calendar-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 2a1 1 0 0 1 1 1h8a1 1 0 1 1 2 0h2a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2a1 1 0 0 1 1 1Zm9 3H8a1 1 0 0 1-2 0H4v15h16V5h-2a1 1 0 0 1-2 0Zm-7 10a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1Zm1.5-5a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1Zm3 5a1 1 0 0 0-1-1h-1a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1Zm1.5 0a1 1 0 0 1 1 1h1a1 1 0 0 1 1-1v-1a1 1 0 0 0-1-1h-1a1 1 0 0 0-1 1Z" fill="currentColor" /></svg></span></button>
                    <div v-if="yearPickerOpen" class="picker-panel year-panel" role="dialog" aria-label="年份选择器" :style="yearPanelStyle">
                      <div class="picker-panel-header"><strong>{{ yearPageStart }} - {{ yearPageStart + yearPageSize - 1 }}</strong><div><button type="button" aria-label="上一组年份" :disabled="yearPageStart <= 1900" @click="changeYearPage(-1)">‹</button><button type="button" aria-label="下一组年份" :disabled="yearPageStart + yearPageSize > 2200" @click="changeYearPage(1)">›</button></div></div>
                      <div class="year-options" role="group" aria-label="选择年份"><button v-for="year in yearOptions" :key="year" type="button" :class="{ active: form.period_year === year }" :aria-pressed="form.period_year === year" @click="selectYear(year); yearPickerOpen = false">{{ year }}</button></div>
                    </div>
                  </div>
                </div>
                <div class="field-group">
                  <label for="cycle-type">周期类型<span>*</span></label>
                  <div class="period-type-picker">
                    <button id="cycle-type" type="button" class="selector-control" aria-label="选择周期类型" :aria-expanded="periodTypePickerOpen" @click="togglePeriodTypePicker"><span :class="{ 'selector-placeholder': !selectedPeriodOption }">{{ selectedPeriodOption?.label || '请选择' }}</span><span class="selector-icon arrow-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m3.414 7.086-.707.707a1 1 0 0 0 0 1.414l7.778 7.778a2 2 0 0 0 2.829 0l7.778-7.778a1 1 0 0 0-1.414-1.414l-7.071 7.071-7.071-7.071a1 1 0 0 0-1.414 0Z" fill="currentColor" /></svg></span></button>
                    <div v-if="periodTypePickerOpen" class="picker-panel period-panel" role="listbox" aria-label="周期类型选择器" :style="periodPanelStyle">
                      <div v-for="group in periodTypeGroups" :key="group.label" class="period-group"><div class="period-group-label">{{ group.label }}</div><div class="period-group-options"><button v-for="option in group.options" :key="option.value" type="button" role="option" :aria-selected="selectedPeriodOption?.value === option.value" :class="{ active: selectedPeriodOption?.value === option.value }" @click="selectPeriodOption(option)">{{ option.label }}</button></div></div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="field-group range-group">
                <label>周期起止时间</label>
                <p class="field-description">评估这段时间内的绩效表现</p>
                <div class="two-col field-row">
                  <div class="field-group"><label for="cycle-start">开始时间<span>*</span></label><input id="cycle-start" v-model="form.start_at" type="datetime-local" required :aria-invalid="dateError || undefined" :aria-describedby="dateError ? 'cycle-date-error' : undefined" /></div>
                  <div class="field-group"><label for="cycle-end">截止时间<span>*</span></label><input id="cycle-end" v-model="form.end_at" type="datetime-local" required :aria-invalid="dateError || undefined" :aria-describedby="dateError ? 'cycle-date-error' : undefined" /><small v-if="dateError" id="cycle-date-error" class="error" role="alert">需晚于开始时间</small></div>
                </div>
              </div>
            </section>
            <section id="people-settings" class="form-card">
              <h2>人员和部门信息设置</h2>
              <div class="field-group"><label>锁定规则<span>*</span></label><p class="field-description">配置锁定规则和时间后，各项目人员汇报线和组织关系信息将以锁定时的信息为准。在绩效环节开始前，管理员仍可更新锁定的人员和部门信息。</p><div class="radio-row"><label><input v-model="form.lock_rule" value="IMMEDIATE" type="radio" :disabled="formMode === 'edit'" /> <span>新建周期时，立即锁定</span></label><label><input v-model="form.lock_rule" value="SCHEDULED" type="radio" :disabled="formMode === 'edit'" /> <span>新建周期并到达指定时间后，再锁定</span></label></div></div>
              <div v-if="form.lock_rule === 'SCHEDULED'" class="sub-card"><div class="field-group"><label for="lock-at">锁定时间<span>*</span></label><input id="lock-at" v-model="form.lock_at" type="datetime-local" :disabled="formMode === 'edit'" required :aria-invalid="lockError || undefined" :aria-describedby="lockError ? 'lock-at-error' : undefined" /><small v-if="lockError" id="lock-at-error" class="error" role="alert">定时锁定需晚于当前时间至少 6 小时</small></div></div>
              <div class="sub-card sync-card"><div class="field-group"><label>锁定前名单同步</label><p class="field-description">周期级规则：可选择手动调整，或在指定时间前由系统每日自动调整；系统不覆盖已手动维护的周期名单。</p><div class="radio-row"><label><input v-model="form.pre_lock_sync_mode" value="MANUAL" type="radio" :disabled="formMode === 'edit'" /> <span>不自动变化，由管理员手动调整</span></label><label><input v-model="form.pre_lock_sync_mode" value="AUTO_DAILY" type="radio" :disabled="formMode === 'edit'" /> <span>指定时间前，系统每天定时自动调整</span></label></div></div></div>
            </section>
            <section id="evaluation-settings" class="form-card">
              <h2>评估设置</h2>
              <div class="field-group"><label for="evaluation-template">绩效模板<span>*</span></label><select id="evaluation-template" v-model="form.evaluation_template"><option value="">请选择绩效模板</option></select></div>
            </section>
            <section id="leaver-settings" class="form-card">
              <h2>离职人员参评设置</h2>
              <div class="switch-field"><label for="leaver-enabled">离职人员可在本周期成为被评估人</label><input id="leaver-enabled" v-model="form.leaver_enabled" type="checkbox" role="switch" /></div>
              <p class="field-description">开启后，离职人员也可在本周期项目中被圈选为被评估人。</p>
              <div v-if="form.leaver_enabled" class="sub-card"><div class="field-group"><label>离职日期范围<span>*</span></label><div class="two-col field-row"><input id="leaver-start" v-model="form.leaver_start_date" type="date" required :aria-invalid="leaverDateError || undefined" :aria-describedby="leaverDateError ? 'leaver-date-error' : undefined" /><input id="leaver-end" v-model="form.leaver_end_date" type="date" required :aria-invalid="leaverDateError || undefined" :aria-describedby="leaverDateError ? 'leaver-date-error' : undefined" /></div><small v-if="leaverDateError" id="leaver-date-error" class="error" role="alert">离职人员参评日期范围不合法</small></div><div class="field-group"><label>离职人员参评方式</label><div class="radio-row"><label><input v-model="form.leaver_participation_mode" value="CREATE_TASK" type="radio" /> <span>生成评估任务，并纳入报表统计</span></label><label><input v-model="form.leaver_participation_mode" value="REPORT_ONLY" type="radio" /> <span>不生成评估任务，仅纳入报表统计</span></label></div></div></div>
            </section>
          </div>
        </div>
        <footer class="form-footer"><button class="primary-button" type="submit" :disabled="saving">{{ saving ? '保存中...' : '保存' }}</button><p v-if="formError" class="error" role="alert">{{ formError }}</p></footer>
      </form>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, type CSSProperties, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { formatDateTime, shanghaiLocalToUtcIso, utcToShanghaiLocal } from '@/utils/datetime'
import { performanceApi, performanceCycleApi, type PerformanceAccessContext, type PerformanceCycle, type PerformanceCyclePayload, type PerformanceCyclePerson, type PerformanceCyclePeriodSubtype, type PerformanceCyclePeriodType } from '@/api/performance'

const route = useRoute(); const router = useRouter(); const cycles = ref<PerformanceCycle[]>([]); const selected = ref<PerformanceCycle | null>(null); const loading = ref(false); const saving = ref(false); const deleting = ref(false); const editing = ref(false); const formMode = ref<'create' | 'edit'>('create'); const keyword = ref(''); const page = ref(1); const pageSize = ref(20); const total = ref(0); const formError = ref(''); const saveSuccess = ref(false); const accessContext = ref<PerformanceAccessContext | null>(null); const people = ref<PerformanceCyclePerson[]>([]); const peopleLoading = ref(false); const showPeople = ref(false); const peopleReason = ref(''); const deleteConfirm = ref(false); const initialForm = ref(''); const dialogRef = ref<HTMLElement | null>(null); const cancelDeleteRef = ref<HTMLButtonElement | null>(null); const confirmDeleteRef = ref<HTMLButtonElement | null>(null); const previousFocus = ref<HTMLElement | null>(null); const requestVersion = ref(0); const anchorObserver = ref<IntersectionObserver | null>(null)
const canManageCycles = computed(() => accessContext.value?.permission_codes.includes('performance.cycles.manage') ?? false); const canManagePeople = canManageCycles; const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value))); const dateError = computed(() => Boolean(form.start_at && form.end_at && form.end_at <= form.start_at)); const leaverDateError = computed(() => Boolean(form.leaver_enabled && form.leaver_start_date && form.leaver_end_date && form.leaver_end_date < form.leaver_start_date)); const lockError = computed(() => form.lock_rule === 'SCHEDULED' && form.lock_at && (shanghaiLocalToUtcIso(form.lock_at) || '') < new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()); const hasStartedProject = computed(() => selected.value?.projects.some(project => ['STARTED', '进行中', '已启动'].includes(project.status)) ?? false)
const yearPickerOpen = ref(false); const periodTypePickerOpen = ref(false); const yearPanelStyle = ref<CSSProperties>({}); const periodPanelStyle = ref<CSSProperties>({}); const periodTypes: { value: PerformanceCyclePeriodType; label: string }[] = [{ value: 'YEAR', label: '全年' }, { value: 'HALF_YEAR', label: '半年度' }, { value: 'QUARTER', label: '季度' }, { value: 'BIMONTH', label: '双月' }, { value: 'MONTH', label: '月度' }, { value: 'CUSTOM', label: '自定义' }];
type PeriodTypeOption = { value: string; type: PerformanceCyclePeriodType; subtype: string | null; label: string }; const periodTypeGroups: { label: string; options: PeriodTypeOption[] }[] = [{ label: '年/半年度', options: [{ value: 'YEAR', type: 'YEAR', subtype: null, label: '全年' }, { value: 'H1', type: 'HALF_YEAR', subtype: 'H1', label: '上半年' }, { value: 'H2', type: 'HALF_YEAR', subtype: 'H2', label: '下半年' }] }, { label: '季度', options: [1, 2, 3, 4].map(index => ({ value: `Q${index}`, type: 'QUARTER', subtype: `Q${index}`, label: `第 ${index} 季度` })) }, { label: '双月', options: [1, 2, 3, 4, 5, 6].map(index => ({ value: `B${index}`, type: 'BIMONTH', subtype: `B${index}`, label: `${index * 2 - 1}-${index * 2} 双月` })) }, { label: '月度', options: Array.from({ length: 12 }, (_, index) => ({ value: `M${index + 1}`, type: 'MONTH', subtype: `M${index + 1}`, label: `${index + 1} 月份` })) }, { label: '非标准周期', options: [{ value: 'CUSTOM', type: 'CUSTOM', subtype: 'CUSTOM', label: '自定义' }] }];
const selectedPeriodOption = computed(() => periodTypeGroups.flatMap(group => group.options).find(option => option.type === form.period_type && option.subtype === (form.period_subtype || null)) || periodTypeGroups.flatMap(group => group.options).find(option => option.type === form.period_type));
const activeAnchor = ref('cycle-info'); const anchorItems = [{ id: 'cycle-info', label: '周期信息' }, { id: 'people-settings', label: '人员和部门信息设置' }, { id: 'evaluation-settings', label: '评估设置' }, { id: 'leaver-settings', label: '离职人员参评设置' }]; const yearPageSize = 20; const getDefaultYearPageStart = () => Math.floor(new Date().getFullYear() / yearPageSize) * yearPageSize; const yearPageStart = ref(Math.floor(new Date().getFullYear() / yearPageSize) * yearPageSize); const yearOptions = computed(() => Array.from({ length: yearPageSize }, (_, index) => yearPageStart.value + index).filter(year => year >= 1900 && year <= 2200)); const form = reactive<any>({ name: '', period_year: null, period_type: '', period_subtype: null, start_at: '', end_at: '', lock_rule: 'IMMEDIATE', lock_at: '', pre_lock_sync_mode: 'MANUAL', leaver_enabled: false, leaver_start_date: '', leaver_end_date: '', leaver_participation_mode: 'CREATE_TASK', evaluation_template: '' }); const isDirty = computed(() => editing.value && JSON.stringify(form) !== initialForm.value)
function snapshotForm() { initialForm.value = JSON.stringify(form) }; function resetForm() { Object.assign(form, { name: '', period_year: null, period_type: '', period_subtype: null, start_at: '', end_at: '', lock_rule: 'IMMEDIATE', lock_at: '', pre_lock_sync_mode: 'MANUAL', leaver_enabled: false, leaver_start_date: '', leaver_end_date: '', leaver_participation_mode: 'CREATE_TASK', evaluation_template: '' }); yearPageStart.value = getDefaultYearPageStart(); yearPickerOpen.value = false; periodTypePickerOpen.value = false; yearPanelStyle.value = {}; periodPanelStyle.value = {}; snapshotForm() }; function changeYearPage(direction: number) { yearPageStart.value = Math.min(2200 - yearPageSize + 1, Math.max(1900, yearPageStart.value + direction * yearPageSize)) }; function positionPanel(trigger: HTMLElement | null, width: number, height: number): CSSProperties { if (!trigger) return { position: 'fixed', top: '0px', left: '0px' }; const rect = trigger.getBoundingClientRect(); const gap = 6; const margin = 16; const below = rect.bottom + gap; const top = below + height <= window.innerHeight - margin ? below : Math.max(margin, rect.top - height - gap); const left = Math.min(Math.max(margin, rect.left), Math.max(margin, window.innerWidth - width - margin)); return { position: 'fixed', top: top + 'px', left: left + 'px' } }; function updatePanelPosition(type: 'year' | 'period') { void nextTick(() => { const trigger = document.getElementById(type === 'year' ? 'cycle-year' : 'cycle-type'); const style = positionPanel(trigger, type === 'year' ? 279 : 385, type === 'year' ? 311 : 364); if (type === 'year') yearPanelStyle.value = style; else periodPanelStyle.value = style }) }; function toggleYearPicker() { periodTypePickerOpen.value = false; yearPickerOpen.value = !yearPickerOpen.value; yearPanelStyle.value = {}; if (yearPickerOpen.value) updatePanelPosition('year') }; function togglePeriodTypePicker() { yearPickerOpen.value = false; periodTypePickerOpen.value = !periodTypePickerOpen.value; periodPanelStyle.value = {}; if (periodTypePickerOpen.value) updatePanelPosition('period') }; function closePickers() { yearPickerOpen.value = false; periodTypePickerOpen.value = false; yearPanelStyle.value = {}; periodPanelStyle.value = {} }; function handlePickerOutsidePointerDown(event: PointerEvent) { if (!yearPickerOpen.value && !periodTypePickerOpen.value) return; const target = event.target; if (!(target instanceof Node)) return; const yearRoot = document.querySelector('.year-picker'); const periodRoot = document.querySelector('.period-type-picker'); if (yearPickerOpen.value && !yearRoot?.contains(target)) closePickers(); if (periodTypePickerOpen.value && !periodRoot?.contains(target)) closePickers() }; function selectYear(year: number) { form.period_year = year; applyPeriodDates() }; function selectPeriodOption(option: PeriodTypeOption) { form.period_type = option.type; form.period_subtype = option.subtype; periodTypePickerOpen.value = false; applyPeriodDates() }; function daysInMonth(year: number, month: number) { return new Date(year, month, 0).getDate() }; function applyPeriodDates() { const year = form.period_year; const subtype = form.period_subtype as string | null; if (!year || form.period_type === 'CUSTOM') return; let startMonth = 1; let endMonth = 12; if (form.period_type === 'HALF_YEAR') { startMonth = subtype === 'H2' ? 7 : 1; endMonth = subtype === 'H2' ? 12 : 6 } else if (form.period_type === 'QUARTER') { const quarter = Number(subtype?.slice(1) || 1); startMonth = (quarter - 1) * 3 + 1; endMonth = startMonth + 2 } else if (form.period_type === 'BIMONTH') { const bimonth = Number(subtype?.slice(1) || 1); startMonth = (bimonth - 1) * 2 + 1; endMonth = startMonth + 1 } else if (form.period_type === 'MONTH') { startMonth = Number(subtype?.slice(1) || 1); endMonth = startMonth } form.start_at = `${year}-${String(startMonth).padStart(2, '0')}-01T00:00`; form.end_at = `${year}-${String(endMonth).padStart(2, '0')}-${daysInMonth(year, endMonth)}T23:59` }; function toLocal(value: string | null) { return utcToShanghaiLocal(value) || '' }; function formatRange(start: string, end: string) { return `${formatDateTime(start)} - ${formatDateTime(end)}` }; function toIso(value: string) { return shanghaiLocalToUtcIso(value) || '' }
function toPayload(): PerformanceCyclePayload | Partial<PerformanceCyclePayload> { const base = { name: form.name, language: 'zh-CN' as const, period_year: form.period_year, period_type: form.period_type, period_subtype: form.period_subtype, start_at: toIso(form.start_at), end_at: toIso(form.end_at), leaver_enabled: form.leaver_enabled, leaver_start_date: form.leaver_enabled ? form.leaver_start_date : null, leaver_end_date: form.leaver_enabled ? form.leaver_end_date : null, leaver_participation_mode: form.leaver_participation_mode }; return formMode.value === 'create' ? { ...base, lock_rule: form.lock_rule, lock_at: form.lock_rule === 'SCHEDULED' ? toIso(form.lock_at) : null, pre_lock_sync_mode: form.pre_lock_sync_mode } : base }
async function loadCycles() { const version = ++requestVersion.value; loading.value = true; formError.value = ''; try { const result = await performanceCycleApi.list(keyword.value, page.value, pageSize.value); if (version !== requestVersion.value) return; cycles.value = result.items; total.value = result.total; if (page.value > totalPages.value) { page.value = totalPages.value; return loadCycles() }; if (!selected.value || !cycles.value.some(item => item.id === selected.value?.id)) selected.value = cycles.value[0] || null } catch (error: any) { formError.value = error?.response?.data?.detail || '周期加载失败' } finally { if (version === requestVersion.value) loading.value = false } }
async function searchCycles() { page.value = 1; await loadCycles() }; function clearSearch() { keyword.value = ''; void searchCycles() }; async function changePage(nextPage: number) { page.value = Math.min(Math.max(1, nextPage), totalPages.value); await loadCycles() }; async function selectCycle(cycle: PerformanceCycle) { selected.value = cycle; if (showPeople.value) await loadPeople() }
function startCreate() { resetForm(); formMode.value = 'create'; formError.value = ''; saveSuccess.value = false; editing.value = true; if (route.name !== 'PerformanceCycleCreate') void router.push({ name: 'PerformanceCycleCreate' }) }; async function startEdit() { if (!selected.value) return; await enterEdit(selected.value.id); if (route.name !== 'PerformanceCycleEdit') void router.push({ name: 'PerformanceCycleEdit', params: { id: selected.value.id } }) }; async function enterEdit(id: number) { const cycle = await performanceCycleApi.get(id); selected.value = cycle; Object.assign(form, { name: cycle.name, period_year: cycle.period_year, period_type: cycle.period_type, start_at: toLocal(cycle.start_at), end_at: toLocal(cycle.end_at), lock_rule: cycle.lock_rule, lock_at: toLocal(cycle.lock_at), pre_lock_sync_mode: cycle.pre_lock_sync_mode, leaver_enabled: cycle.leaver_enabled, leaver_start_date: cycle.leaver_start_date || '', leaver_end_date: cycle.leaver_end_date || '', leaver_participation_mode: cycle.leaver_participation_mode }); snapshotForm(); formMode.value = 'edit'; editing.value = true }
function confirmDiscard() { return !isDirty.value || window.confirm('当前内容尚未保存，确定离开吗？') }; function discardEdit() { editing.value = false; formError.value = '' }; function cancelEdit() { if (!confirmDiscard()) return; discardEdit(); void router.replace({ name: 'PerformanceCycles' }) }
async function submitForm() { formError.value = ''; saveSuccess.value = false; if (!form.period_year) { formError.value = '请选择年份'; return }; if (dateError.value) { formError.value = '需晚于开始时间'; return }; if (leaverDateError.value) { formError.value = '离职人员参评日期范围不合法'; return }; if (lockError.value) { formError.value = '定时锁定需晚于当前时间至少 6 小时'; return }; saving.value = true; try { const cycle = formMode.value === 'create' ? await performanceCycleApi.create(toPayload() as PerformanceCyclePayload) : await performanceCycleApi.update(selected.value!.id, toPayload()); snapshotForm(); discardEdit(); saveSuccess.value = true; await loadCycles(); selected.value = cycle; await router.replace({ name: 'PerformanceCycles' }) } catch (error: any) { formError.value = error?.response?.data?.detail || error?.response?.data?.message || '保存失败' } finally { saving.value = false } }
async function loadPeople() { if (!selected.value) return; peopleLoading.value = true; try { people.value = await performanceCycleApi.listPeople(selected.value.id) } catch (error: any) { formError.value = error?.response?.data?.detail || '人员快照加载失败' } finally { peopleLoading.value = false } }; async function togglePeople() { showPeople.value = !showPeople.value; if (showPeople.value) await loadPeople() }; async function refreshPeople() { if (!selected.value || !peopleReason.value) return; try { await performanceCycleApi.refreshPeople(selected.value.id, peopleReason.value); await loadPeople() } catch (error: any) { formError.value = error?.response?.data?.detail || '名单刷新失败' } }; async function savePerson(person: PerformanceCyclePerson) { if (!selected.value || !peopleReason.value) return; try { await performanceCycleApi.updatePerson(selected.value.id, person, peopleReason.value); await loadPeople() } catch (error: any) { formError.value = error?.response?.data?.detail || '人员维护失败' } }
function restoreDeleteFocus() { void nextTick(() => previousFocus.value?.isConnected && previousFocus.value.focus()) }; function closeDeleteDialog() { deleteConfirm.value = false; restoreDeleteFocus() }; function handleDialogKeydown(event: KeyboardEvent) { if (event.key === 'Escape') { event.preventDefault(); closeDeleteDialog(); return }; if (event.key !== 'Tab') return; const focusable = [cancelDeleteRef.value, confirmDeleteRef.value].filter((item): item is HTMLButtonElement => Boolean(item && !item.disabled)); if (!focusable.length) return; const first = focusable[0]; const last = focusable[focusable.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() } }; function removeSelected() { if (!selected.value || hasStartedProject.value) return; previousFocus.value = document.activeElement as HTMLElement; deleteConfirm.value = true; void nextTick(() => cancelDeleteRef.value?.focus()) }; async function confirmDelete() { if (!selected.value) return; deleting.value = true; try { await performanceCycleApi.remove(selected.value.id); deleteConfirm.value = false; selected.value = null; await loadCycles(); restoreDeleteFocus() } catch (error: any) { formError.value = error?.response?.data?.detail || '删除失败' } finally { deleting.value = false } }
async function syncRoute() { if (route.name === 'PerformanceCycleCreate') { if (!editing.value) startCreate(); return }; if (route.name === 'PerformanceCycleEdit' && route.params.id) { if (selected.value?.id !== Number(route.params.id) || !editing.value) await enterEdit(Number(route.params.id)); return }; if (!editing.value && !cycles.value.length) await loadCycles() }
function observeAnchors() { anchorObserver.value?.disconnect(); if (typeof IntersectionObserver === 'undefined') return; anchorObserver.value = new IntersectionObserver((entries) => { const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]; if (visible) activeAnchor.value = (visible.target as HTMLElement).id }, { threshold: [0.25, 0.5, 0.75], rootMargin: '-10% 0px -65% 0px' }); anchorItems.forEach(item => { const section = document.getElementById(item.id); if (section) anchorObserver.value?.observe(section) }) }
watch(() => [route.name, route.params.id], () => { void syncRoute() }); watch(editing, value => { if (value) void nextTick(observeAnchors); else anchorObserver.value?.disconnect() }); onBeforeRouteLeave(() => confirmDiscard()); onBeforeRouteUpdate(() => { if (!confirmDiscard()) return false; if (isDirty.value) discardEdit(); return true }); onMounted(async () => { document.addEventListener('pointerdown', handlePickerOutsidePointerDown);  try { accessContext.value = await performanceApi.getAccessContext(); if (route.name === 'PerformanceCycleEdit') await syncRoute(); else { await loadCycles(); await syncRoute() } } catch (error: any) { formError.value = error?.response?.data?.detail || '权限加载失败' } }); onUnmounted(() => { anchorObserver.value?.disconnect(); document.removeEventListener('pointerdown', handlePickerOutsidePointerDown) })
</script>

<style scoped>
.cycle-modal {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  min-width: 0;
  min-height: 0;
  background: #f2f3f5;
}

.cycle-form {
  display: grid;
  grid-template-rows: 56px minmax(0, 1fr) 64px;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #f2f3f5;
}

.form-top {
  display: flex;
  align-items: center;
  height: 56px;
  padding: 0 20px;
  background: #fff;
  border-bottom: 1px solid rgba(187, 191, 196, 0.5);
}

.form-top .back-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0;
  color: #1f2329;
  background: transparent;
  border: 0;
  font-size: 14px;
  line-height: 22px;
  cursor: pointer;
}

.form-top .back-button span:first-child {
  font-size: 20px;
  line-height: 20px;
}

.header-divider {
  width: 1px;
  height: 24px;
  margin: 0 12px;
  background: rgba(31, 35, 41, 0.15);
}

.form-top strong {
  color: #1f2329;
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
}

.form-layout {
  display: grid;
  grid-template-columns: 200px minmax(0, 800px) 1fr;
  column-gap: 40px;
  min-height: 0;
  padding: 0 20px;
  overflow: hidden;
  background: #f2f3f5;
}

.form-anchor {
  position: relative;
  width: 200px;
  min-height: 0;
  padding: 21px 0 24px 20px;
  overflow-y: auto;
  box-sizing: border-box;
}

.anchor-track {
  position: absolute;
  top: 21px;
  bottom: 24px;
  left: 0;
  width: 4px;
  background: #eff0f1;
  border-radius: 2px;
}

.form-anchor a {
  position: relative;
  display: block;
  width: max-content;
  max-width: 180px;
  margin: 0 0 16px;
  color: #1f3f68;
  font-size: 14px;
  line-height: 22px;
  text-decoration: none;
}

.form-anchor a.active,
.form-anchor a[aria-current='location'] {
  color: #3370ff;
  font-weight: 600;
}

.form-anchor a.active::before,
.form-anchor a[aria-current='location']::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: -20px;
  width: 4px;
  background: #3370ff;
  border-radius: 2px;
}

.form-content {
  width: 800px;
  max-width: 100%;
  min-width: 0;
  padding: 20px 0 32px;
  overflow-y: auto;
  box-sizing: border-box;
  scrollbar-width: thin;
}

.form-card {
  width: 800px;
  max-width: 100%;
  margin: 0 0 20px;
  padding: 20px;
  box-sizing: border-box;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 6px rgba(31, 35, 41, 0.12);
}

.form-card h2 {
  margin: 0 0 16px;
  color: #1f2329;
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
}

.field-group {
  position: relative;
  min-width: 0;
  margin-top: 16px;
}

.field-group:first-child,
.form-card > .field-group:first-of-type {
  margin-top: 0;
}

.field-group > label,
.switch-field > label {
  display: block;
  margin-bottom: 8px;
  color: #1f2329;
  font-size: 14px;
  font-weight: 600;
  line-height: 22px;
}

.field-group > label span,
.form-card label span {
  color: #f04438;
}

.field-description,
.form-card .description {
  margin: 0 0 12px;
  color: #646a73;
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
}

.notice {
  display: flex;
  min-height: 40px;
  align-items: center;
  margin: 0 0 16px;
  padding: 9px 12px;
  color: #2454a6;
  background: #edf3ff;
  border-radius: 6px;
  font-size: 14px;
  line-height: 22px;
}

.form-card input:not([type='radio']):not([type='checkbox']),
.form-card select,
.selector-control {
  width: 100%;
  height: 32px;
  box-sizing: border-box;
  padding: 0 12px;
  color: #1f2329;
  background: #fff;
  border: 1px solid #d0d3d6;
  border-radius: 6px;
  font: inherit;
  line-height: 22px;
}

#cycle-name {
  height: 30px;
  padding: 4px 8px 4px 11px;
}

.form-card input:not([type='radio']):not([type='checkbox']):focus,
.form-card select:focus,
.selector-control:focus {
  outline: 2px solid rgba(51, 112, 255, 0.25);
  border-color: #3370ff;
}

.form-card input::placeholder {
  color: #8f959e;
}

.two-col {
  display: flex;
  gap: 20px;
}

.two-col > .field-group,
.two-col > input {
  flex: 1 1 0;
  min-width: 0;
}

.field-row {
  margin-top: 0;
}

.cycle-info-period-row {
  margin-top: 20px;
}

.cycle-info-period-row > .field-group {
  margin-top: 0;
}

.language-group .radio-row {
  margin-top: 0;
}

.radio-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 20px;
}

.radio-row label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin: 0;
  color: #1f2329;
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
}

.radio-row input[type='radio'] {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: #3370ff;
}

.year-picker {
  position: relative;
}

.selector-control {
  display: flex;
  align-items: center;
  justify-content: space-between;
  text-align: left;
  cursor: pointer;
}

.selector-icon {
  color: #8f959e;
  font-size: 14px;
}

.selector-placeholder {
  color: #8f959e;
}

.calendar-icon,
.arrow-icon {
  display: inline-flex;
  width: 12px;
  height: 12px;
  align-items: center;
  justify-content: center;
  flex: 0 0 16px;
}

.calendar-icon svg,
.arrow-icon svg {
  width: 16px;
  height: 16px;
}

.arrow-icon svg {
  width: 12px;
  height: 12px;
}

.picker-panel {
  position: fixed;
  z-index: 100;
  box-sizing: border-box;
  background: #fff;
  border: 1px solid #d0d3d6;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(31, 35, 41, 0.16);
}

.picker-panel-header {
  display: flex;
  width: 248px;
  height: 32px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0;
  color: #1f2329;
  font-size: 14px;
  line-height: 32px;
}

.picker-panel-header button {
  width: 24px;
  height: 24px;
  padding: 0;
  color: #646a73;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.year-panel {
  width: 279px;
  height: 311px;
  padding: 15px;
}

.year-options {
  display: grid;
  width: 248px;
  grid-template-columns: repeat(4, 1fr);
  grid-auto-rows: 32px;
  row-gap: 22px;
  column-gap: 0;
}

.year-options button {
  width: 62px;
  height: 32px;
  padding: 0;
  color: #1f2329;
  background: #fff;
  border: 1px solid transparent;
  border-radius: 4px;
  font: inherit;
  line-height: 30px;
  cursor: pointer;
}

.year-options button:hover,
.year-options button.active {
  color: #1456f0;
  background: #f0f5ff;
  border-color: #1456f0;
}

.period-panel {
  width: 385px;
  min-height: 364px;
  padding: 0;
}

.period-group {
  display: flex;
  width: 384px;
  min-height: 36px;
  align-items: flex-start;
  margin-top: 4px;
  padding: 0 0 4px;
  box-sizing: border-box;
  border-bottom: 1px solid #dee0e3;
}

.period-group:last-child {
  border-bottom: 0;
}

.period-group-label {
  flex: 0 0 96px;
  width: 96px;
  height: 32px;
  padding-left: 12px;
  box-sizing: border-box;
  color: #8f959e;
  font-size: 14px;
  line-height: 32px;
  white-space: nowrap;
}

.period-group-options {
  display: flex;
  flex: 0 0 288px;
  width: 288px;
  flex-wrap: wrap;
}

.period-group-options button {
  flex: 0 0 96px;
  width: 96px;
  height: 32px;
  min-height: 32px;
  padding: 0 16px;
  box-sizing: border-box;
  color: #1f2329;
  background: transparent;
  border: 0;
  border-radius: 999px;
  font: inherit;
  line-height: 32px;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}

.period-group-options button:hover,
.period-group-options button.active {
  color: #1456f0;
  background: #edf3ff;
}

.range-group {
  margin-top: 16px;
}

.sub-card {
  margin-top: 16px;
  padding: 16px;
  background: #f7f8fa;
  border-radius: 6px;
}

.sync-card {
  margin-top: 16px;
}

.switch-field {
  display: flex;
  align-items: center;
  gap: 12px;
}

.switch-field > label {
  margin: 0;
}

.switch-field input[type='checkbox'] {
  position: relative;
  width: 36px;
  height: 20px;
  margin: 0;
  appearance: none;
  background: #d0d3d6;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
}

.switch-field input[type='checkbox']::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: #fff;
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(31, 35, 41, 0.18);
  transition: transform 0.15s ease;
}

.switch-field input[type='checkbox']:checked {
  background: #3370ff;
}

.switch-field input[type='checkbox']:checked::after {
  transform: translateX(16px);
}

.error {
  display: block;
  margin-top: 7px;
  color: #f04438;
  font-size: 13px;
  line-height: 20px;
}

.form-footer {
  position: relative;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 16px;
  height: 64px;
  padding: 16px 20px 16px 260px;
  box-sizing: border-box;
  background: #fff;
  border-top: 1px solid rgba(187, 191, 196, 0.5);
}

.form-footer .primary-button {
  min-width: 80px;
  height: 32px;
  padding: 4px 11px;
  border: 1px solid #3370ff;
  border-radius: 6px;
  font-size: 14px;
  line-height: 22px;
}

@media (max-width: 1100px) {
  .form-layout {
    grid-template-columns: 200px minmax(0, 800px);
    column-gap: 24px;
  }
}

@media (max-width: 768px) {
  .cycle-form {
    grid-template-rows: 56px minmax(0, 1fr) 64px;
  }

  .form-layout {
    display: block;
    padding: 0 16px;
    overflow-y: auto;
  }

  .form-anchor {
    display: flex;
    width: auto;
    gap: 20px;
    padding: 16px 0;
    overflow-x: auto;
  }

  .anchor-track {
    display: none;
  }

  .form-anchor a {
    flex: 0 0 auto;
    max-width: none;
    margin: 0;
    white-space: nowrap;
  }

  .form-anchor a.active::before,
  .form-anchor a[aria-current='location']::before {
    top: auto;
    right: 0;
    bottom: -8px;
    left: 0;
    width: auto;
    height: 3px;
  }

  .form-content {
    width: auto;
    max-width: none;
    padding: 0 0 24px;
    overflow: visible;
  }

  .form-card {
    width: auto;
  }

  .two-col {
    display: block;
  }

  .two-col > .field-group,
  .two-col > input {
    margin-bottom: 16px;
  }

  .form-footer {
    padding: 16px;
  }
}
</style>










