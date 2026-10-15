<template>
  <section class="cycle-page">
    <PerformanceListPage v-if="!editing" title="周期与项目" class="cycle-list-page">
      <div class="cycle-page-content">
        <div class="cycle-workspace">
          <aside class="cycle-list-panel" aria-labelledby="cycle-list-title">
            <h2>周期 <span class="info" aria-hidden="true">ⓘ</span></h2>
            <div class="cycle-search-row">
          <PerformanceSearchInput
            v-model="keyword"
            placeholder="搜索周期"
            aria-label="搜索周期"
            width="167px"
            @search="searchCycles"
            @clear="clearSearch"
          />
          <button class="outline-button filter-button" type="button" @click="searchCycles">筛选</button>
          <button v-if="canManageCycles" class="icon-button" type="button" aria-label="新建周期" @click="startCreate">＋</button>
        </div>
        <div v-if="loading" class="cycle-loading" role="status" aria-label="正在加载周期">
          <span v-for="line in 5" :key="line" class="skeleton-line" aria-hidden="true" />
        </div>
        <div v-else-if="!cycles.length" class="empty-state">
          <strong>{{ keyword ? '没有找到匹配周期' : '暂无周期' }}</strong>
          <button v-if="keyword" class="outline-button" type="button" @click="clearSearch">清除筛选</button>
        </div>
        <div
          v-for="cycle in cycles"
          :key="cycle.id"
          class="cycle-item"
          :class="{ active: selected?.id === cycle.id }"
          role="button"
          tabindex="0"
          @click="selectCycle(cycle)"
          @keydown.enter.prevent="selectCycle(cycle)"
          @keydown.space.prevent="selectCycle(cycle)"
          @mouseenter="cancelCycleMenuClose"
          @mouseleave="scheduleCycleMenuClose(cycle.id)"
        >
          <span class="truncate">{{ cycle.name }}</span>
          <button
            v-if="canManageCycles"
            :ref="element => setCycleMoreButton(cycle.id, element)"
            class="cycle-more"
            :class="{ 'is-open': activeCycleMenuId === cycle.id }"
            type="button"
            aria-label="更多操作"
            aria-haspopup="menu"
            :aria-expanded="activeCycleMenuId === cycle.id"
            @click.stop="toggleCycleMenu(cycle.id)"
            @mouseenter.stop="openCycleMenu(cycle.id)"
            @focus="openCycleMenu(cycle.id)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5.5 11.75a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 0 1 3.5 0Zm8.225 0a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 1 1 3.5 0Zm8.275 0a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 1 1-3.5 0Z" fill="currentColor" /></svg>
          </button>
          <Teleport to="body">
            <ul
              v-if="canManageCycles && activeCycleMenuId === cycle.id"
              ref="cycleMenuRef"
              class="cycle-action-menu"
              role="menu"
              aria-label="周期操作"
              :style="cycleMenuStyle"
              @mouseenter="cancelCycleMenuClose"
              @mouseleave="scheduleCycleMenuClose(cycle.id)"
              @keydown.esc.prevent="closeCycleMenu(true)"
            >
              <li role="none"><div class="cycle-action-menu__item" role="menuitem" tabindex="0" @click="editCycleFromMenu(cycle)" @keydown.enter.prevent="editCycleFromMenu(cycle)" @keydown.space.prevent="editCycleFromMenu(cycle)"><PerformanceIconButton class="cycle-action-menu__icon" icon="EditOutlined" label="编辑" static /><span>编辑</span></div></li>
              <li role="none"><div class="cycle-action-menu__item" :class="{ 'is-disabled': hasStartedProjectFor(cycle) }" role="menuitem" :aria-disabled="hasStartedProjectFor(cycle)" :tabindex="hasStartedProjectFor(cycle) ? -1 : 0" @click="!hasStartedProjectFor(cycle) && removeCycleFromMenu(cycle)" @keydown.enter.prevent="!hasStartedProjectFor(cycle) && removeCycleFromMenu(cycle)" @keydown.space.prevent="!hasStartedProjectFor(cycle) && removeCycleFromMenu(cycle)"><PerformanceIconButton class="cycle-action-menu__icon" icon="DeleteTrashOutlined" label="删除" static :disabled="hasStartedProjectFor(cycle)" /><span>删除</span></div></li>
            </ul>
          </Teleport>
        </div>
        <div v-if="total > pageSize" class="cycle-pagination" aria-label="周期分页">
          <button :disabled="page === 1" aria-label="上一页" @click="changePage(page - 1)">‹</button>
          <span>{{ page }} / {{ totalPages }}</span>
          <button :disabled="page >= totalPages" aria-label="下一页" @click="changePage(page + 1)">›</button>
        </div>
          </aside>

          <main class="cycle-detail-panel">
        <p v-if="saveSuccess" class="success state-success" role="status">周期已保存</p>
        <p v-if="projectActionSuccess" class="success state-success" role="status">{{ projectActionSuccess }}</p>
        <p v-if="formError" class="error state-error" role="alert">{{ formError }} <button class="outline-button" type="button" @click="loadCycles">重试</button></p>
        <div class="detail-content">
          <header class="detail-heading"><h2 class="truncate">{{ selected?.name || '周期详情' }}</h2><div v-if="canManageCycles" class="detail-actions"><PerformanceCycleSettingsMenu @select="openCycleSettings" /><button v-if="selected" class="danger-button" type="button" :disabled="hasStartedProject" @click="removeSelected">删除</button></div></header>
          <h3>基本信息</h3>
          <div class="metrics"><div><label>人员</label><strong>{{ selected?.people_count ?? '--' }}</strong></div><div><label>部门</label><strong>{{ selected?.department_count ?? '--' }}</strong></div><div><label>周期起止时间</label><span>{{ selected ? formatRange(selected.start_at, selected.end_at) : '--' }}</span></div><div><label>锁定状态</label><span>{{ selected ? (selected.status === 'LOCKED' ? '已锁定' : '待锁定') : '--' }}</span></div><div><label>离职人员参评</label><span>{{ selected ? (selected.leaver_enabled ? '是' : '否') : '--' }}</span></div></div>
          <PerformanceProjectSettings
            :projects="selected?.projects || []"
            :project-count="selected?.project_count || 0"
            :can-create="canManageCycles && Boolean(selected)"
            :managed-project-refs="managedProjectRefs"
            @create="openProjectCreate"
            @edit="openProjectEdit"
            @start="startProject"
            @copy="copyProject"
            @remove="removeProject"
          />
          <PerformanceProjectDialog
            v-model="projectDialogOpen"
            :mode="projectDialogMode"
            :project="projectDialogProject"
            :can-submit="canManageProjectDialog"
            :saving="projectSaving"
            :evaluator-options="projectEvaluatorOptions"
            @submit="saveProject"
          />
          <PerformanceConfirmDialog
            v-model="projectRemoveOpen"
            :message="`确定要删除“${projectRemoveTarget?.name || ''}”吗？`"
            :description="projectRemoveTarget?.status === 'STARTED' ? '项目已启动，删除后，项目中的评估数据将全部被删除且不可恢复，请谨慎操作。' : '删除后将无法恢复'"
            :require-confirm="projectRemoveTarget?.status === 'STARTED'"
            :loading="projectRemoving"
            @confirm="confirmRemoveProject"
          />

        </div>
          </main>
        </div>
      </div>
    </PerformanceListPage>

        <PerformanceConfirmDialog
          v-model="leaveConfirmOpen"
          message="离开后，已填写的信息将会丢失。确定离开此页面吗？"
          cancel-text="取消"
          confirm-text="确定"
          @confirm="confirmLeaveEdit"
        />

      <PerformanceConfirmDialog
        v-model="deleteConfirm"
        message="确定要删除周期吗？"
        description="删除后，周期内的所有项目将同步删除，请谨慎操作。"
        cancel-text="保留"
        confirm-text="删除"
        :loading="deleting"
        @confirm="confirmDelete"
      />

    <div v-if="editing" class="cycle-modal" role="presentation">
      <form ref="cycleFormRef" class="cycle-form" role="dialog" aria-modal="true" novalidate :aria-label="formMode === 'create' ? '新建周期' : '编辑周期'" @input="updateInputValidity" @submit.prevent="submitForm">
        <PageHeader class="cycle-form-header" :title="formMode === 'create' ? '新建周期' : '编辑周期'" @back="cancelEdit" />
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
                <label><PerformanceRequiredLabel label="语言" /></label>
                <div class="language-options">
                  <label><input id="cycle-language-zh" type="checkbox" checked disabled /> <span>中文</span></label>
                  <label><input id="cycle-language-en" type="checkbox" disabled /> <span>英文</span></label>
                </div>
              </div>
              <div class="field-group">
                <label for="cycle-name"><PerformanceRequiredLabel label="周期名称" /></label>
                <input id="cycle-name" v-model.trim="form.name" required maxlength="128" class="wide-input" :aria-invalid="Boolean(fieldErrors['cycle-name']) || undefined" :aria-describedby="fieldErrors['cycle-name'] ? 'cycle-name-error' : undefined" />
                <small v-if="fieldErrors['cycle-name']" id="cycle-name-error" class="error" role="alert">{{ fieldErrors['cycle-name'] }}</small>
              </div>
              <div class="two-col field-row cycle-info-period-row">
                <div class="field-group">
                  <label for="cycle-year"><PerformanceRequiredLabel label="年份" /></label>
                  <div class="year-picker">
                    <button id="cycle-year" type="button" class="selector-control" aria-label="选择年份" aria-required="true" :aria-invalid="Boolean(fieldErrors['cycle-year']) || undefined" :aria-describedby="fieldErrors['cycle-year'] ? 'cycle-year-error' : undefined" :aria-expanded="yearPickerOpen" @click="toggleYearPicker"><span :class="{ 'selector-placeholder': !form.period_year }">{{ form.period_year || '请选择年份' }}</span><span class="selector-icon calendar-icon" aria-hidden="true"><svg viewBox="0 0 16 16"><rect x="2.25" y="3.25" width="11.5" height="10.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.25" /><path d="M5 2.25v2M11 2.25v2M2.75 6h10.5" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" /><path d="M5 8.5h1.25M8 8.5h1.25M11 8.5h.01M5 11h1.25M8 11h1.25" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" /></svg></span></button>
                    <small v-if="fieldErrors['cycle-year']" id="cycle-year-error" class="error" role="alert">{{ fieldErrors['cycle-year'] }}</small>
                    <div v-if="yearPickerOpen" class="picker-panel year-panel" role="dialog" aria-label="年份选择器" :style="yearPanelStyle">
                      <div class="picker-panel-header"><strong>{{ yearPageStart }} - {{ yearPageStart + yearPageSize - 1 }}</strong><div><button type="button" aria-label="上一组年份" :disabled="yearPageStart <= 1900" @click="changeYearPage(-1)">‹</button><button type="button" aria-label="下一组年份" :disabled="yearPageStart + yearPageSize > 2200" @click="changeYearPage(1)">›</button></div></div>
                      <div class="year-options" role="group" aria-label="选择年份"><button v-for="year in yearOptions" :key="year" type="button" :class="{ active: form.period_year === year }" :aria-pressed="form.period_year === year" @click="selectYear(year); yearPickerOpen = false">{{ year }}</button></div>
                    </div>
                  </div>
                </div>
                <div class="field-group">
                  <label for="cycle-type"><PerformanceRequiredLabel label="周期类型" /></label>
                  <div class="period-type-picker">
                    <button id="cycle-type" type="button" class="selector-control" aria-label="选择周期类型" aria-required="true" :aria-invalid="Boolean(fieldErrors['cycle-type']) || undefined" :aria-describedby="fieldErrors['cycle-type'] ? 'cycle-type-error' : undefined" :aria-expanded="periodTypePickerOpen" @click="togglePeriodTypePicker"><span :class="{ 'selector-placeholder': !selectedPeriodOption }">{{ selectedPeriodOption?.label || '请选择' }}</span><span class="selector-icon arrow-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m3.414 7.086-.707.707a1 1 0 0 0 0 1.414l7.778 7.778a2 2 0 0 0 2.829 0l7.778-7.778a1 1 0 0 0-1.414-1.414l-7.071 7.071-7.071-7.071a1 1 0 0 0-1.414 0Z" fill="currentColor" /></svg></span></button>
                    <small v-if="fieldErrors['cycle-type']" id="cycle-type-error" class="error" role="alert">{{ fieldErrors['cycle-type'] }}</small>
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
                  <div class="field-group"><label for="cycle-start"><PerformanceRequiredLabel label="开始时间" /></label><PerformanceDateTimeField v-model="form.start_at" input-id="cycle-start" aria-label="周期开始时间" required :invalid="Boolean(fieldErrors['cycle-start']) || dateError" :described-by="fieldErrors['cycle-start'] ? 'cycle-start-error' : dateError ? 'cycle-date-error' : ''" /><small v-if="fieldErrors['cycle-start']" id="cycle-start-error" class="error" role="alert">{{ fieldErrors['cycle-start'] }}</small></div>
                  <div class="field-group"><label for="cycle-end"><PerformanceRequiredLabel label="截止时间" /></label><PerformanceDateTimeField v-model="form.end_at" input-id="cycle-end" aria-label="周期截止时间" required :invalid="Boolean(fieldErrors['cycle-end']) || dateError" :described-by="fieldErrors['cycle-end'] ? 'cycle-end-error' : dateError ? 'cycle-date-error' : ''" /><small v-if="fieldErrors['cycle-end']" id="cycle-end-error" class="error" role="alert">{{ fieldErrors['cycle-end'] }}</small><small v-if="dateError" id="cycle-date-error" class="error" role="alert">需晚于开始时间</small></div>
                </div>
              </div>
            </section>
            <section id="people-settings" class="form-card">
              <h2>人员和部门信息设置</h2>
              <div class="field-group lock-rule-group"><label><PerformanceRequiredLabel label="锁定规则" /></label><p class="field-description">配置锁定规则和时间后，各项目人员汇报线和组织关系信息将以锁定时的信息为准。在绩效环节开始前，管理员仍可更新锁定的人员和部门信息。</p><div class="lock-rule-options"><label><input v-model="form.lock_rule" value="IMMEDIATE" type="radio" :disabled="formMode === 'edit'" /> <span>新建周期时，立即锁定</span></label><label><input v-model="form.lock_rule" value="SCHEDULED" type="radio" :disabled="formMode === 'edit'" /> <span>新建周期并到达指定时间后，再锁定</span></label></div></div>
              <div v-if="form.lock_rule === 'SCHEDULED'" class="sub-card lock-settings-card"><div class="field-group"><label for="lock-at"><PerformanceRequiredLabel label="锁定时间" /></label><PerformanceDateTimeField v-model="form.lock_at" input-id="lock-at" aria-label="周期锁定时间" :disabled="formMode === 'edit'" required :invalid="Boolean(fieldErrors['lock-at']) || Boolean(lockError)" :described-by="fieldErrors['lock-at'] ? 'lock-at-error' : lockError ? 'lock-at-rule-error' : ''" /><small v-if="fieldErrors['lock-at']" id="lock-at-error" class="error" role="alert">{{ fieldErrors['lock-at'] }}</small><small v-if="lockError" id="lock-at-rule-error" class="error" role="alert">定时锁定需晚于当前时间至少 6 小时</small></div><div class="field-group sync-field"><label>锁定前名单同步</label><p class="field-description">周期级规则：可选择手动调整，或在指定时间前由系统每日自动调整；系统不覆盖已手动维护的周期名单。</p><div class="radio-row"><label><input v-model="form.pre_lock_sync_mode" value="MANUAL" type="radio" :disabled="formMode === 'edit'" /> <span>不自动变化，由管理员手动调整</span></label><label><input v-model="form.pre_lock_sync_mode" value="AUTO_DAILY" type="radio" :disabled="formMode === 'edit'" /> <span>指定时间前，系统每天定时自动调整</span></label></div></div></div>
            </section>
            <section id="evaluation-settings" class="form-card">
              <h2>评估设置</h2>
              <div class="field-group"><label for="evaluation-template"><span>绩效模板</span></label><select id="evaluation-template" v-model="form.evaluation_template" disabled aria-disabled="true"><option value="">绩效模板（暂未接入）</option></select></div>
              <div class="evaluation-result-rules">
                <div class="evaluation-result-rules__title">评估结果校验提示规则</div>
                <div class="evaluation-result-rule-card">
                  <div class="evaluation-result-rule-card__title">不同评估环节的评估结果差异提示</div>
                  <p>可设置当不同环节中相同评估项的评估结果有一定差异时，会触发差异提示。</p>
                  <button class="evaluation-result-rule-add" type="button" aria-label="添加需对比的环节" @click="comparisonRuleDrawerOpen = true">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a1 1 0 0 0-1 1v8H3a1 1 0 1 0 0 2h8v8a1 1 0 0 0 2 0v-8h8a1 1 0 0 0 0-2h-8V3a1 1 0 0 0-1-1Z" fill="currentColor" /></svg>
                    <span>添加需对比的环节</span>
                  </button>
                </div>
              </div>
              <PerformanceComparisonRuleDrawer v-model="comparisonRuleDrawerOpen" :initial-value="comparisonRuleDraft" @submit="saveComparisonRule" />
            </section>
            <section id="leaver-settings" class="form-card">
              <h2>离职人员参评设置</h2>
              <div class="switch-field"><label for="leaver-enabled">离职人员可在本周期成为被评估人</label><input id="leaver-enabled" v-model="form.leaver_enabled" type="checkbox" role="switch" /></div>
              <p class="field-description">开启后，离职人员也可在本周期项目中被圈选为被评估人。</p>
              <div v-if="form.leaver_enabled" class="sub-card"><div class="field-group"><label><PerformanceRequiredLabel label="离职日期范围" /></label><div class="two-col field-row"><input id="leaver-start" v-model="form.leaver_start_date" type="date" required :aria-invalid="Boolean(fieldErrors['leaver-start']) || leaverDateError || undefined" :aria-describedby="fieldErrors['leaver-start'] ? 'leaver-start-error' : leaverDateError ? 'leaver-date-error' : undefined" /><input id="leaver-end" v-model="form.leaver_end_date" type="date" required :aria-invalid="Boolean(fieldErrors['leaver-end']) || leaverDateError || undefined" :aria-describedby="fieldErrors['leaver-end'] ? 'leaver-end-error' : leaverDateError ? 'leaver-date-error' : undefined" /></div><small v-if="fieldErrors['leaver-start']" id="leaver-start-error" class="error" role="alert">{{ fieldErrors['leaver-start'] }}</small><small v-if="fieldErrors['leaver-end']" id="leaver-end-error" class="error" role="alert">{{ fieldErrors['leaver-end'] }}</small><small v-if="leaverDateError" id="leaver-date-error" class="error" role="alert">离职人员参评日期范围不合法</small></div><div class="field-group"><label>离职人员参评方式</label><div class="radio-row"><label><input v-model="form.leaver_participation_mode" value="CREATE_TASK" type="radio" /> <span>生成评估任务，并纳入报表统计</span></label><label><input v-model="form.leaver_participation_mode" value="REPORT_ONLY" type="radio" /> <span>不生成评估任务，仅纳入报表统计</span></label></div></div></div>
            </section>
          </div>
        </div>
        <footer class="form-footer"><button class="primary-button cycle-save-button" type="submit" :disabled="saving">{{ saving ? '保存中...' : '保存' }}</button><p v-if="formError" class="error" role="alert">{{ formError }}</p></footer>
      </form>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, type CSSProperties, type ComponentPublicInstance, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { formatDateTime, shanghaiLocalToUtcIso, utcToShanghaiLocal } from '@/utils/datetime'
import PerformanceProjectSettings from '@/components/performance/PerformanceProjectSettings.vue'
import PerformanceListPage from '@/components/performance/PerformanceListPage.vue'
import PerformanceProjectDialog from '@/components/performance/PerformanceProjectDialog.vue'
import PerformanceComparisonRuleDrawer, { type PerformanceComparisonConfig } from '@/components/performance/PerformanceComparisonRuleDrawer.vue'
import PerformanceConfirmDialog from '@/components/performance/PerformanceConfirmDialog.vue'
import PerformanceDateTimeField from '@/components/performance/PerformanceDateTimeField.vue'
import PerformanceRequiredLabel from '@/components/performance/PerformanceRequiredLabel.vue'
import PerformanceSearchInput from '@/components/performance/PerformanceSearchInput.vue'
import PerformanceIconButton from '@/components/performance/PerformanceIconButton.vue'
import PerformanceCycleSettingsMenu from '@/components/performance/PerformanceCycleSettingsMenu.vue'
import PageHeader from '@/components/performance/PageHeader.vue'
import { performanceApi, performanceCycleApi, performanceProjectApi, type PerformanceAccessContext, type PerformanceCycle, type PerformanceCyclePayload, type PerformanceCyclePerson, type PerformanceCycleProjectShell, type PerformanceProjectPayload, type PerformanceCyclePeriodSubtype, type PerformanceCyclePeriodType } from '@/api/performance'

const organizationFields = [{ key: 'company_org', label: '公司级组织' }, { key: 'department', label: '一级部门' }, { key: 'department_2', label: '二级部门' }, { key: 'department_3', label: '三级部门' }, { key: 'department_4', label: '四级部门' }, { key: 'department_5', label: '五级部门' }] as const
const route = useRoute(); const router = useRouter(); const cycles = ref<PerformanceCycle[]>([]); const selected = ref<PerformanceCycle | null>(null); const loading = ref(false); const saving = ref(false); const deleting = ref(false); const editing = ref(false); const formMode = ref<'create' | 'edit'>('create'); const keyword = ref(''); const page = ref(1); const pageSize = ref(20); const total = ref(0); const formError = ref(''); const saveSuccess = ref(false); const accessContext = ref<PerformanceAccessContext | null>(null); const people = ref<PerformanceCyclePerson[]>([]); const peopleLoading = ref(false); const showPeople = ref(false); const peopleReason = ref(''); const deleteConfirm = ref(false); const initialForm = ref(''); const requestVersion = ref(0); const anchorObserver = ref<IntersectionObserver | null>(null)
const projectDialogOpen = ref(false); const projectDialogMode = ref<'create' | 'edit'>('create'); const projectDialogProject = ref<PerformanceCycleProjectShell | null>(null); const projectSaving = ref(false); const projectActionSuccess = ref(''); const projectRemoveTarget = ref<PerformanceCycleProjectShell | null>(null); const projectRemoveOpen = ref(false); const projectRemoving = ref(false)
const projectEvaluatorOptions = ref<{ employees: Array<{ value: string; label: string }> }>({ employees: [] })
const leaveConfirmOpen = ref(false)
const comparisonRuleDrawerOpen = ref(false)
const comparisonRuleDraft = ref<PerformanceComparisonConfig | null>(null)
const activeCycleMenuId = ref<number | null>(null); const cycleMenuStyle = ref<CSSProperties>({}); const cycleMenuRef = ref<HTMLElement | null>(null); const cycleMoreButtons = new Map<number, HTMLButtonElement>(); let cycleMenuCloseTimer: number | undefined
const canManageCycles = computed(() => accessContext.value?.permission_codes.includes('performance.cycles.manage') ?? false); const canManagePeople = canManageCycles; const canManageProjects = computed(() => canManageCycles.value || accessContext.value?.permission_codes.includes('performance.projects.manage') || false); const managedProjectRefs = computed(() => accessContext.value?.role_grants?.filter(grant => grant.scope_type === 'PROJECT').map(grant => grant.scope_ref) || []); const canManageProjectDialog = computed(() => Boolean(selected.value && (canManageCycles.value || (projectDialogProject.value && managedProjectRefs.value.includes(projectDialogProject.value.project_ref))))); const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value))); const dateError = computed(() => Boolean(form.start_at && form.end_at && form.end_at <= form.start_at)); const leaverDateError = computed(() => Boolean(form.leaver_enabled && form.leaver_start_date && form.leaver_end_date && form.leaver_end_date < form.leaver_start_date)); const lockError = computed(() => form.lock_rule === 'SCHEDULED' && form.lock_at && (shanghaiLocalToUtcIso(form.lock_at) || '') < new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()); const hasStartedProject = computed(() => selected.value?.projects.some(project => ['STARTED', '进行中', '已启动'].includes(project.status)) ?? false)
const yearPickerOpen = ref(false); const periodTypePickerOpen = ref(false); const yearPanelStyle = ref<CSSProperties>({}); const periodPanelStyle = ref<CSSProperties>({}); const periodTypes: { value: PerformanceCyclePeriodType; label: string }[] = [{ value: 'YEAR', label: '全年' }, { value: 'HALF_YEAR', label: '半年度' }, { value: 'QUARTER', label: '季度' }, { value: 'BIMONTH', label: '双月' }, { value: 'MONTH', label: '月度' }, { value: 'CUSTOM', label: '自定义' }];
type PeriodTypeOption = { value: string; type: PerformanceCyclePeriodType; subtype: string | null; label: string }; const periodTypeGroups: { label: string; options: PeriodTypeOption[] }[] = [{ label: '年/半年度', options: [{ value: 'YEAR', type: 'YEAR', subtype: null, label: '全年' }, { value: 'H1', type: 'HALF_YEAR', subtype: 'H1', label: '上半年' }, { value: 'H2', type: 'HALF_YEAR', subtype: 'H2', label: '下半年' }] }, { label: '季度', options: [1, 2, 3, 4].map(index => ({ value: `Q${index}`, type: 'QUARTER', subtype: `Q${index}`, label: `第 ${index} 季度` })) }, { label: '双月', options: [1, 2, 3, 4, 5, 6].map(index => ({ value: `B${index}`, type: 'BIMONTH', subtype: `B${index}`, label: `${index * 2 - 1}-${index * 2} 双月` })) }, { label: '月度', options: Array.from({ length: 12 }, (_, index) => ({ value: `M${index + 1}`, type: 'MONTH', subtype: `M${index + 1}`, label: `${index + 1} 月份` })) }, { label: '非标准周期', options: [{ value: 'CUSTOM', type: 'CUSTOM', subtype: 'CUSTOM', label: '自定义' }] }];
const selectedPeriodOption = computed(() => periodTypeGroups.flatMap(group => group.options).find(option => option.type === form.period_type && option.subtype === (form.period_subtype || null)) || periodTypeGroups.flatMap(group => group.options).find(option => option.type === form.period_type));
const activeAnchor = ref('cycle-info'); const anchorItems = [{ id: 'cycle-info', label: '周期信息' }, { id: 'people-settings', label: '人员和部门信息设置' }, { id: 'evaluation-settings', label: '评估设置' }, { id: 'leaver-settings', label: '离职人员参评设置' }]; const yearPageSize = 20; const getDefaultYearPageStart = () => Math.floor(new Date().getFullYear() / yearPageSize) * yearPageSize; const yearPageStart = ref(Math.floor(new Date().getFullYear() / yearPageSize) * yearPageSize); const yearOptions = computed(() => Array.from({ length: yearPageSize }, (_, index) => yearPageStart.value + index).filter(year => year >= 1900 && year <= 2200)); const form = reactive<any>({ name: '', period_year: null, period_type: '', period_subtype: null, start_at: '', end_at: '', lock_rule: 'IMMEDIATE', lock_at: '', pre_lock_sync_mode: 'MANUAL', leaver_enabled: false, leaver_start_date: '', leaver_end_date: '', leaver_participation_mode: 'CREATE_TASK', evaluation_template: '', comparison_rule: null }); const formSubmitted = ref(false); const isDirty = computed(() => editing.value && JSON.stringify(form) !== initialForm.value)
const cycleFormRef = ref<HTMLFormElement | null>(null)
const fieldErrors = reactive<Record<string, string>>({})
const requiredFields = computed(() => [
  { id: 'cycle-name', key: 'name', label: '周期名称' },
  { id: 'cycle-year', key: 'period_year', label: '年份' },
  { id: 'cycle-type', key: 'period_type', label: '周期类型' },
  { id: 'cycle-start', key: 'start_at', label: '开始时间' },
  { id: 'cycle-end', key: 'end_at', label: '截止时间' },
  ...(form.lock_rule === 'SCHEDULED' && formMode.value === 'create' ? [{ id: 'lock-at', key: 'lock_at', label: '锁定时间' }] : []),
  ...(form.leaver_enabled ? [
    { id: 'leaver-start', key: 'leaver_start_date', label: '离职开始日期' },
    { id: 'leaver-end', key: 'leaver_end_date', label: '离职截止日期' },
  ] : []),
])
function clearFormErrors() { Object.keys(fieldErrors).forEach(key => delete fieldErrors[key]) }
function validateFields() {
  clearFormErrors()
  for (const field of requiredFields.value) {
    const control = cycleFormRef.value?.querySelector<HTMLInputElement>(`input[id="${field.id}"]`)
    const value = control ? control.value : form[field.key]
    if (!String(value ?? '').trim()) fieldErrors[field.id] = `${field.label}为必填`
    else if (control && !control.validity.valid) fieldErrors[field.id] = `${field.label}格式不正确`
  }
}
function updateInputValidity() {
  if (formSubmitted.value) void nextTick(validateFields)
}
watch(form, updateInputValidity, { flush: 'post' })
function snapshotForm() { initialForm.value = JSON.stringify(form) }; function resetForm() { clearFormErrors(); comparisonRuleDraft.value = null; Object.assign(form, { name: '', period_year: null, period_type: '', period_subtype: null, start_at: '', end_at: '', lock_rule: 'IMMEDIATE', lock_at: '', pre_lock_sync_mode: 'MANUAL', leaver_enabled: false, leaver_start_date: '', leaver_end_date: '', leaver_participation_mode: 'CREATE_TASK', evaluation_template: '', comparison_rule: null }); formSubmitted.value = false; yearPageStart.value = getDefaultYearPageStart(); yearPickerOpen.value = false; periodTypePickerOpen.value = false; yearPanelStyle.value = {}; periodPanelStyle.value = {}; snapshotForm() }; function changeYearPage(direction: number) { yearPageStart.value = Math.min(2200 - yearPageSize + 1, Math.max(1900, yearPageStart.value + direction * yearPageSize)) }; function positionPanel(trigger: HTMLElement | null, width: number, height: number): CSSProperties { if (!trigger) return { position: 'fixed', top: '0px', left: '0px' }; const rect = trigger.getBoundingClientRect(); const gap = 6; const margin = 16; const below = rect.bottom + gap; const top = below + height <= window.innerHeight - margin ? below : Math.max(margin, rect.top - height - gap); const left = Math.min(Math.max(margin, rect.left), Math.max(margin, window.innerWidth - width - margin)); return { position: 'fixed', top: top + 'px', left: left + 'px' } }; function updatePanelPosition(type: 'year' | 'period') { void nextTick(() => { const trigger = document.getElementById(type === 'year' ? 'cycle-year' : 'cycle-type'); const style = positionPanel(trigger, type === 'year' ? 279 : 385, type === 'year' ? 311 : 364); if (type === 'year') yearPanelStyle.value = style; else periodPanelStyle.value = style }) }; function toggleYearPicker() { periodTypePickerOpen.value = false; yearPickerOpen.value = !yearPickerOpen.value; yearPanelStyle.value = {}; if (yearPickerOpen.value) updatePanelPosition('year') }; function togglePeriodTypePicker() { yearPickerOpen.value = false; periodTypePickerOpen.value = !periodTypePickerOpen.value; periodPanelStyle.value = {}; if (periodTypePickerOpen.value) updatePanelPosition('period') }; function closePickers() { yearPickerOpen.value = false; periodTypePickerOpen.value = false; yearPanelStyle.value = {}; periodPanelStyle.value = {} }; function handlePickerOutsidePointerDown(event: PointerEvent) { if (!yearPickerOpen.value && !periodTypePickerOpen.value) return; const target = event.target; if (!(target instanceof Node)) return; const yearRoot = document.querySelector('.year-picker'); const periodRoot = document.querySelector('.period-type-picker'); if (yearPickerOpen.value && !yearRoot?.contains(target)) closePickers(); if (periodTypePickerOpen.value && !periodRoot?.contains(target)) closePickers() }; function selectYear(year: number) { form.period_year = year; applyPeriodDates() }; function selectPeriodOption(option: PeriodTypeOption) { form.period_type = option.type; form.period_subtype = option.subtype; periodTypePickerOpen.value = false; applyPeriodDates() }; function daysInMonth(year: number, month: number) { return new Date(year, month, 0).getDate() }; function applyPeriodDates() { const year = form.period_year; const subtype = form.period_subtype as string | null; if (!year || form.period_type === 'CUSTOM') return; let startMonth = 1; let endMonth = 12; if (form.period_type === 'HALF_YEAR') { startMonth = subtype === 'H2' ? 7 : 1; endMonth = subtype === 'H2' ? 12 : 6 } else if (form.period_type === 'QUARTER') { const quarter = Number(subtype?.slice(1) || 1); startMonth = (quarter - 1) * 3 + 1; endMonth = startMonth + 2 } else if (form.period_type === 'BIMONTH') { const bimonth = Number(subtype?.slice(1) || 1); startMonth = (bimonth - 1) * 2 + 1; endMonth = startMonth + 1 } else if (form.period_type === 'MONTH') { startMonth = Number(subtype?.slice(1) || 1); endMonth = startMonth } form.start_at = `${year}-${String(startMonth).padStart(2, '0')}-01T00:00`; form.end_at = `${year}-${String(endMonth).padStart(2, '0')}-${daysInMonth(year, endMonth)}T23:59` }; function toLocal(value: string | null) { return utcToShanghaiLocal(value) || '' }; function formatRange(start: string, end: string) { return `${formatDateTime(start)} - ${formatDateTime(end)}` }; function toIso(value: string) { return shanghaiLocalToUtcIso(value) || '' }
function toPayload(): PerformanceCyclePayload | Partial<PerformanceCyclePayload> { const base = { name: form.name, language: 'zh-CN' as const, period_year: form.period_year, period_type: form.period_type, period_subtype: form.period_subtype, start_at: toIso(form.start_at), end_at: toIso(form.end_at), leaver_enabled: form.leaver_enabled, leaver_start_date: form.leaver_enabled ? form.leaver_start_date : null, leaver_end_date: form.leaver_enabled ? form.leaver_end_date : null, leaver_participation_mode: form.leaver_participation_mode }; return formMode.value === 'create' ? { ...base, lock_rule: form.lock_rule, lock_at: form.lock_rule === 'SCHEDULED' ? toIso(form.lock_at) : null, pre_lock_sync_mode: form.pre_lock_sync_mode } : base }
async function loadCycles() { const version = ++requestVersion.value; loading.value = true; formError.value = ''; try { const result = await performanceCycleApi.list(keyword.value, page.value, pageSize.value); if (version !== requestVersion.value) return; cycles.value = result.items; total.value = result.total; if (page.value > totalPages.value) { page.value = totalPages.value; return loadCycles() }; if (!selected.value || !cycles.value.some(item => item.id === selected.value?.id)) selected.value = cycles.value[0] || null } catch (error: any) { formError.value = error?.response?.data?.detail || '周期加载失败' } finally { if (version === requestVersion.value) loading.value = false } }
async function searchCycles() { page.value = 1; await loadCycles() }; function clearSearch() { keyword.value = ''; void searchCycles() }; async function changePage(nextPage: number) { page.value = Math.min(Math.max(1, nextPage), totalPages.value); await loadCycles() }; async function selectCycle(cycle: PerformanceCycle) { selected.value = cycle; if (showPeople.value) await loadPeople() }
function openCycleSettings(key: string) {
  if (key !== 'hrbp-permission' || !selected.value) return
  void router.push({ name: 'PerformanceCycleHrbpPermissions', params: { cycleId: selected.value.id }, query: { activeKey: 'auth-list' } })
}
function setCycleMoreButton(id: number, element: Element | ComponentPublicInstance | null) {
  if (element instanceof HTMLButtonElement) cycleMoreButtons.set(id, element)
}
function cancelCycleMenuClose() {
  if (cycleMenuCloseTimer) window.clearTimeout(cycleMenuCloseTimer)
}
function positionCycleMenu() {
  const trigger = activeCycleMenuId.value === null ? null : cycleMoreButtons.get(activeCycleMenuId.value)
  if (!trigger) return
  const rect = trigger.getBoundingClientRect()
  const width = 160
  const height = 80
  const margin = 16
  const left = Math.min(Math.max(margin, rect.right - width), Math.max(margin, window.innerWidth - width - margin))
  const top = rect.bottom + height <= window.innerHeight - margin ? rect.bottom + 4 : Math.max(margin, rect.top - height - 4)
  cycleMenuStyle.value = { position: 'fixed', left: `${left}px`, top: `${top}px` }
}
function openCycleMenu(id: number) {
  cancelCycleMenuClose()
  activeCycleMenuId.value = id
  cycleMenuStyle.value = { visibility: 'hidden' }
  void nextTick(positionCycleMenu)
}
function scheduleCycleMenuClose(id: number) {
  cancelCycleMenuClose()
  cycleMenuCloseTimer = window.setTimeout(() => {
    if (activeCycleMenuId.value === id) closeCycleMenu()
  }, 120)
}
function closeCycleMenu(restoreFocus = false) {
  cancelCycleMenuClose()
  activeCycleMenuId.value = null
  cycleMenuStyle.value = {}
  if (restoreFocus) void nextTick(() => cycleMoreButtons.get(selected.value?.id || 0)?.focus())
}
function handleCycleMenuOutsidePointerDown(event: PointerEvent) {
  if (activeCycleMenuId.value === null) return
  const target = event.target
  if (!(target instanceof Node)) return
  const trigger = cycleMoreButtons.get(activeCycleMenuId.value)
  const menu = cycleMenuRef.value as HTMLElement | HTMLElement[] | null
  const menuElement = Array.isArray(menu) ? menu[0] : menu
  if (!trigger?.contains(target) && !menuElement?.contains(target)) closeCycleMenu()
}
function toggleCycleMenu(id: number) {
  if (activeCycleMenuId.value === id) closeCycleMenu()
  else openCycleMenu(id)
}
function hasStartedProjectFor(cycle: PerformanceCycle) {
  return cycle.projects.some(project => ['STARTED', '进行中', '已启动'].includes(project.status))
}
function editCycleFromMenu(cycle: PerformanceCycle) {
  closeCycleMenu()
  selected.value = cycle
  void startEdit()
}
function removeCycleFromMenu(cycle: PerformanceCycle) {
  closeCycleMenu()
  selected.value = cycle
  removeSelected()
}
function startCreate() { resetForm(); formMode.value = 'create'; formError.value = ''; saveSuccess.value = false; editing.value = true; if (route.name !== 'PerformanceCycleCreate') void router.push({ name: 'PerformanceCycleCreate' }) }; async function startEdit() { if (!selected.value) return; await enterEdit(selected.value.id); if (route.name !== 'PerformanceCycleEdit') void router.push({ name: 'PerformanceCycleEdit', params: { id: selected.value.id } }) }; async function enterEdit(id: number) { const cycle = await performanceCycleApi.get(id); selected.value = cycle; comparisonRuleDraft.value = null; clearFormErrors(); formSubmitted.value = false; Object.assign(form, { name: cycle.name, period_year: cycle.period_year, period_type: cycle.period_type, period_subtype: cycle.period_subtype || null, start_at: toLocal(cycle.start_at), end_at: toLocal(cycle.end_at), lock_rule: cycle.lock_rule, lock_at: toLocal(cycle.lock_at), pre_lock_sync_mode: cycle.pre_lock_sync_mode, leaver_enabled: cycle.leaver_enabled, leaver_start_date: cycle.leaver_start_date || '', leaver_end_date: cycle.leaver_end_date || '', leaver_participation_mode: cycle.leaver_participation_mode, comparison_rule: null }); snapshotForm(); formMode.value = 'edit'; editing.value = true }
function saveComparisonRule(config: PerformanceComparisonConfig) { comparisonRuleDraft.value = config; form.comparison_rule = config }
function discardEdit() { comparisonRuleDrawerOpen.value = false; comparisonRuleDraft.value = null; editing.value = false; formError.value = ''; clearFormErrors(); formSubmitted.value = false }; function cancelEdit() { if (!isDirty.value) { discardEdit(); void router.replace({ name: 'PerformanceCycles' }); return }; leaveConfirmOpen.value = true }
function confirmLeaveEdit() { leaveConfirmOpen.value = false; discardEdit(); void router.replace({ name: 'PerformanceCycles' }) }
async function submitForm() { formError.value = ''; saveSuccess.value = false; formSubmitted.value = true; validateFields(); if (Object.keys(fieldErrors).length) { formError.value = '请完善必填信息'; return }; if (dateError.value) { formError.value = '需晚于开始时间'; return }; if (leaverDateError.value) { formError.value = '离职人员参评日期范围不合法'; return }; if (lockError.value && !(formMode.value === 'edit' && form.lock_rule === 'SCHEDULED')) { formError.value = '定时锁定需晚于当前时间至少 6 小时'; return }; saving.value = true; try { const cycle = formMode.value === 'create' ? await performanceCycleApi.create(toPayload() as PerformanceCyclePayload) : await performanceCycleApi.update(selected.value!.id, toPayload()); snapshotForm(); discardEdit(); saveSuccess.value = true; await loadCycles(); selected.value = cycle; await router.replace({ name: 'PerformanceCycles' }) } catch (error: any) { formError.value = error?.response?.data?.detail || error?.response?.data?.message || '保存失败' } finally { saving.value = false } }
async function loadPeople() { if (!selected.value) return; peopleLoading.value = true; try { people.value = await performanceCycleApi.listPeople(selected.value.id) } catch (error: any) { formError.value = error?.response?.data?.detail || '人员快照加载失败' } finally { peopleLoading.value = false } }; async function togglePeople() { showPeople.value = !showPeople.value; if (showPeople.value) await loadPeople() }; async function refreshPeople() { if (!selected.value || !peopleReason.value) return; try { await performanceCycleApi.refreshPeople(selected.value.id, peopleReason.value); await loadPeople() } catch (error: any) { formError.value = error?.response?.data?.detail || '名单刷新失败' } }; async function savePerson(person: PerformanceCyclePerson) { if (!selected.value || !peopleReason.value) return; try { await performanceCycleApi.updatePerson(selected.value.id, { employee_no: person.employee_no, display_name: person.display_name, ...Object.fromEntries(organizationFields.map(field => [field.key, person[field.key]])), direct_supervisor_employee_no: person.direct_supervisor_employee_no, hrbp_employee_no: person.hrbp_employee_no }, peopleReason.value); await loadPeople() } catch (error: any) { formError.value = error?.response?.data?.detail || '人员维护失败' } }
function removeSelected() { if (!selected.value || hasStartedProject.value) return; deleteConfirm.value = true }; async function confirmDelete() { if (!selected.value) return; deleting.value = true; try { await performanceCycleApi.remove(selected.value.id); deleteConfirm.value = false; selected.value = null; await loadCycles() } catch (error: any) { formError.value = error?.response?.data?.detail || '删除失败' } finally { deleting.value = false } }
async function reloadSelectedCycle() { if (!selected.value) return; selected.value = await performanceCycleApi.get(selected.value.id); cycles.value = cycles.value.map(cycle => cycle.id === selected.value?.id ? selected.value! : cycle) }
async function openProjectCreate() { if (!selected.value || !canManageCycles.value) return; try { const options = await performanceProjectApi.listEvaluatorOptions(selected.value.id); projectEvaluatorOptions.value = { employees: options.employees }; } catch { projectEvaluatorOptions.value = { employees: [] }; formError.value = '周期人员范围加载失败'; return } projectDialogProject.value = null; projectDialogMode.value = 'create'; projectActionSuccess.value = ''; projectDialogOpen.value = true }
function openProjectEdit(project: PerformanceCycleProjectShell) { if (!selected.value) return; void router.push({ name: 'PerformanceProjectEdit', params: { cycleId: selected.value.id, id: project.id } }) }
async function saveProject(payload: PerformanceProjectPayload) { if (!selected.value || !canManageProjectDialog.value) return; projectSaving.value = true; formError.value = ''; try { const project = projectDialogMode.value === 'create' ? await performanceProjectApi.create(selected.value.id, payload) : await performanceProjectApi.update(projectDialogProject.value!.id, payload); projectDialogOpen.value = false; projectActionSuccess.value = projectDialogMode.value === 'create' ? '项目已创建' : '项目已保存'; await router.push({ name: 'PerformanceProjectEdit', params: { cycleId: selected.value.id, id: project.id } }) } catch (error: any) { formError.value = error?.response?.data?.detail || '项目保存失败' } finally { projectSaving.value = false } }
async function startProject(project: PerformanceCycleProjectShell) { if (project.status === 'STARTED') return; formError.value = ''; try { await performanceProjectApi.start(project.id); projectActionSuccess.value = '项目已启动'; await reloadSelectedCycle() } catch (error: any) { formError.value = error?.response?.data?.detail || '项目启动失败' } }
async function copyProject(project: PerformanceCycleProjectShell) { formError.value = ''; try { await performanceProjectApi.copy(project.id); projectActionSuccess.value = '项目已复制'; await reloadSelectedCycle() } catch (error: any) { formError.value = error?.response?.data?.detail || '项目复制失败' } }
async function removeProject(project: PerformanceCycleProjectShell) { projectRemoveTarget.value = project; projectRemoveOpen.value = true; formError.value = '' }
async function confirmRemoveProject() { const project = projectRemoveTarget.value; if (!project) return; projectRemoving.value = true; try { await performanceProjectApi.remove(project.id); projectRemoveOpen.value = false; projectRemoveTarget.value = null; projectActionSuccess.value = '项目已删除'; await reloadSelectedCycle() } catch (error: any) { formError.value = error?.response?.data?.detail || '项目删除失败' } finally { projectRemoving.value = false } }
async function syncRoute() { if (route.name === 'PerformanceCycleCreate') { if (!editing.value) startCreate(); return }; if (route.name === 'PerformanceCycleEdit' && route.params.id) { if (selected.value?.id !== Number(route.params.id) || !editing.value) await enterEdit(Number(route.params.id)); return }; if (!editing.value && !cycles.value.length) await loadCycles() }
function observeAnchors() { anchorObserver.value?.disconnect(); if (typeof IntersectionObserver === 'undefined') return; anchorObserver.value = new IntersectionObserver((entries) => { const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]; if (visible) activeAnchor.value = (visible.target as HTMLElement).id }, { threshold: [0.25, 0.5, 0.75], rootMargin: '-10% 0px -65% 0px' }); anchorItems.forEach(item => { const section = document.getElementById(item.id); if (section) anchorObserver.value?.observe(section) }) }
watch(() => [route.name, route.params.id], () => { void syncRoute() }); watch(editing, value => { if (value) void nextTick(observeAnchors); else anchorObserver.value?.disconnect() }); onBeforeRouteLeave(() => { if (!isDirty.value) return true; leaveConfirmOpen.value = true; return false }); onBeforeRouteUpdate(() => { if (!isDirty.value) return true; leaveConfirmOpen.value = true; return false }); onMounted(async () => { document.addEventListener('pointerdown', handlePickerOutsidePointerDown); document.addEventListener('pointerdown', handleCycleMenuOutsidePointerDown);  try { accessContext.value = await performanceApi.getAccessContext(); if (route.name === 'PerformanceCycleEdit') await syncRoute(); else { await loadCycles(); await syncRoute() } } catch (error: any) { formError.value = error?.response?.data?.detail || '权限加载失败' } }); onUnmounted(() => { anchorObserver.value?.disconnect(); document.removeEventListener('pointerdown', handlePickerOutsidePointerDown); document.removeEventListener('pointerdown', handleCycleMenuOutsidePointerDown); cancelCycleMenuClose(); cycleMoreButtons.clear() })
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
  grid-template-rows: var(--layout-topbar-height) minmax(0, 1fr) 64px;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #f2f3f5;
}

.cycle-form > :deep(.full-screen-modal-header) { position: relative; grid-row: 1; }

.form-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 800px) minmax(0, 1fr);
  grid-template-rows: max-content;
  column-gap: 40px;
  align-items: start;
  min-height: 0;
  padding: 0 20px;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  background: #f2f3f5;
}

.form-anchor {
  position: sticky;
  top: 0;
  align-self: start;
  width: 200px;
  min-height: 0;
  padding: 21px 0 24px 20px;
  overflow: visible;
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
  overflow: visible;
  box-sizing: border-box;
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

.selector-control[aria-invalid='true'],
.form-card input[aria-invalid='true'],
.form-card select[aria-invalid='true'] {
  border-color: var(--performance-field-border-invalid);
}

.two-col {
  display: flex;
  gap: 20px;
}

.two-col > .field-group,
.two-col > input {
  flex: 1 1 0;
  width: 0;
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

.language-options,
.lock-rule-options {
  display: flex;
  align-items: flex-start;
  gap: 24px;
}

.lock-rule-options {
  flex-direction: column;
}

.language-options label,
.lock-rule-options label {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  margin: 0;
  color: var(--color-text-primary);
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
}

.language-options input[type='checkbox'] {
  position: relative;
  width: 16px;
  height: 16px;
  margin: 0;
  appearance: none;
  box-sizing: border-box;
  border: 1px solid var(--color-text-placeholder);
  border-radius: 4px;
  background: var(--color-bg-card);
  cursor: pointer;
}

.language-options input[type='checkbox']:checked,
.language-options input[type='checkbox']:checked:disabled {
  border-color: #1456f0;
  background: #1456f0;
}

.language-options input[type='checkbox']:checked::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 5px;
  width: 4px;
  height: 8px;
  border: solid #fff;
  border-width: 0 1.5px 1.5px 0;
  transform: rotate(45deg);
}

.language-options input[type='checkbox']:disabled {
  cursor: default;
}

.lock-rule-group {
  margin-top: 20px;
}

.lock-rule-options input[type='radio'] {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--color-primary);
}

.sync-field {
  margin-top: 20px;
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
  accent-color: var(--color-primary);
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

.range-group .two-col > .field-group {
  display: flex;
  min-height: 62px;
  margin-top: 0;
  flex-direction: column;
}

.range-group .performance-date-time-field {
  flex: 0 0 32px;
  height: 32px;
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

.evaluation-result-rules {
  margin-top: var(--spacing-6);
}

.evaluation-result-rules__title {
  margin-bottom: var(--spacing-3);
  color: var(--color-text-primary);
  font-size: var(--font-size-md);
  font-weight: 600;
  line-height: var(--performance-button-line-height);
}

.evaluation-result-rule-card {
  min-height: 83px;
  padding: 6px var(--spacing-2);
  box-sizing: border-box;
  border-radius: var(--radius-md);
  background: var(--performance-evaluation-rule-surface);
}

.evaluation-result-rule-card__title {
  color: var(--color-text-primary);
  font-size: var(--font-size-md);
  font-weight: 600;
  line-height: var(--performance-button-line-height);
}

.evaluation-result-rule-card p {
  margin: 0;
  color: var(--performance-count-badge-text);
  font-size: var(--font-size-md);
  font-weight: 400;
  line-height: var(--performance-button-line-height);
}

.evaluation-result-rule-add {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: var(--spacing-1);
  min-height: 22px;
  margin-top: var(--spacing-1);
  padding: 2px var(--spacing-1);
  box-sizing: border-box;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--performance-button-text-color);
  font: 400 var(--font-size-md)/18px var(--font-sans);
  white-space: nowrap;
  cursor: pointer;
}

.evaluation-result-rule-add svg {
  width: 14px;
  height: 14px;
  flex: 0 0 14px;
}

.evaluation-result-rule-add:disabled {
  opacity: 1;
}

.evaluation-result-rule-add:not(:disabled):hover {
  background: var(--performance-button-text-hover-background);
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
  margin-top: var(--performance-field-error-gap);
  color: var(--performance-field-error-color);
  font-size: var(--performance-field-error-font-size);
  line-height: var(--performance-field-error-line-height);
}

.form-footer {
  position: relative;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 16px;
  height: 64px;
  padding: 16px 20px 16px 264px;
  box-sizing: border-box;
  background: #fff;
  border-top: 1px solid rgba(187, 191, 196, 0.5);
}

.form-footer .cycle-save-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 80px;
  height: 32px;
  padding: 4px 11px;
  box-sizing: border-box;
  border: 1px solid #3370ff;
  border-radius: 6px;
  background: #3370ff;
  color: #fff;
  font: 400 14px/22px var(--font-sans);
  white-space: nowrap;
  cursor: pointer;
}

.form-footer .cycle-save-button:hover:not(:disabled) { border-color: #1456f0; background: #1456f0; }
.form-footer .cycle-save-button:active:not(:disabled) { border-color: #0442d2; background: #0442d2; }
.form-footer .cycle-save-button:disabled { opacity: .6; cursor: not-allowed; }

@media (max-width: 1200px) {
  .form-layout {
    grid-template-columns: 200px minmax(0, 800px);
    column-gap: 24px;
  }
}

@media (max-width: 1100px) {
  .form-layout {
    grid-template-columns: 200px minmax(0, 800px);
    column-gap: 24px;
  }
}

@media (max-width: 768px) {
  .cycle-form {
    grid-template-rows: var(--layout-topbar-height) minmax(0, 1fr) 64px;
  }

  .form-layout {
    display: block;
    padding: 0 16px;
    overflow-y: auto;
  }

  .form-anchor {
    position: relative;
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
    width: auto;
    margin-bottom: 16px;
  }

  .form-footer {
    padding: 16px;
  }
}
.cycle-page { min-width: 0; }
.cycle-list-page :deep(.list-page-title) { margin: 0; }
.cycle-page-content { display: flex; flex: 1; min-width: 0; padding: 0; }
.cycle-list-page :deep(.list-page-content) { display: flex; min-height: auto; padding: var(--performance-content-surface-padding); }
.cycle-workspace-card { min-width: 0; padding: 0; border-radius: 0; background: transparent; box-shadow: none; }
.cycle-workspace { display: flex; width: 100%; min-width: 0; align-items: stretch; }
.cycle-list-panel { position: relative; flex: 0 0 228px; width: 228px; min-width: 228px; padding-right: 20px; box-sizing: border-box; }
.cycle-list-panel::after { content: ''; position: absolute; top: -20px; right: -1px; bottom: -20px; left: auto; width: 1px; background: rgba(187, 191, 196, 0.5); }
.cycle-list-panel h2 { margin: 0 0 16px; color: #373c43; font-size: 16px; font-weight: 600; line-height: 24px; }
.cycle-list-panel .info { color: #646a73; font-size: 14px; }
.cycle-search-row { display: flex; align-items: center; width: 208px; height: 32px; margin-bottom: 16px; }
.cycle-search-row :deep(.performance-search-input) { flex: 0 0 167px; width: 167px !important; }
.cycle-search-row :deep(.search-icon) { width: 16px; height: 16px; }
.cycle-search-row .filter-button { display: none; }
.cycle-search-row .icon-button { display: grid; width: 32px; height: 32px; margin-left: 9px; place-items: center; padding: 0; border: 1px solid #d0d3d6; border-radius: 6px; background: #fff; color: #1f2329; font-size: 22px; line-height: 22px; cursor: pointer; }
.cycle-search-row .icon-button:hover { background: #f5f6f7; }
.cycle-item { display: flex; align-items: center; justify-content: space-between; width: 208px; min-height: 41px; box-sizing: border-box; padding: 8px 12px; border: 0; border-radius: 6px; background: transparent; color: #1f2329; font: inherit; font-size: 14px; line-height: 22px; text-align: left; cursor: pointer; }
.cycle-item:hover { background: rgba(31,35,41,.08); }
.cycle-item.active { background: rgba(51,112,255,.08); color: #3370ff; font-weight: 600; }
.cycle-item .truncate { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cycle-more { display: flex; width: 24px; height: 24px; flex: 0 0 24px; align-items: center; justify-content: center; margin-left: 12px; padding: 4px; border: 0; border-radius: 4px; background: transparent; color: inherit; cursor: pointer; opacity: 0; pointer-events: none; }
.cycle-item:hover .cycle-more, .cycle-more:focus-visible, .cycle-more.is-open { opacity: 1; pointer-events: auto; }
.cycle-more:hover { background: rgba(31,35,41,.1); }
.cycle-more:focus-visible { outline: 2px solid rgba(51,112,255,.35); outline-offset: 1px; }
.cycle-more svg { display: block; width: 16px; height: 16px; }
.cycle-action-menu { position: fixed; z-index: 1050; width: 160px; margin: 0; padding: 4px; box-sizing: border-box; border: 1px solid #dee0e3; border-radius: 6px; background: #fff; box-shadow: 0 8px 24px rgba(31,35,41,.12); list-style: none; }
.cycle-action-menu li { margin: 0; padding: 0; }
.cycle-action-menu button { display: block; width: 100%; height: 32px; padding: 5px 8px; border: 0; border-radius: 4px; background: transparent; color: #1f2329; font: inherit; font-size: 14px; line-height: 22px; text-align: left; cursor: pointer; }
.cycle-action-menu button:hover, .cycle-action-menu button:focus-visible { outline: 0; background: rgba(31,35,41,.08); }
.cycle-action-menu__item { display: flex; width: 100%; height: 32px; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 4px; color: #1f2329; font-size: 14px; line-height: 22px; cursor: pointer; }
.cycle-action-menu__item:hover, .cycle-action-menu__item:focus-visible { outline: 0; background: rgba(31,35,41,.08); }
.cycle-action-menu__item.is-disabled { color: #bbbfc4; cursor: not-allowed; }
.cycle-action-menu__icon { flex: 0 0 24px; }
.cycle-action-menu__icon :deep(.performance-icon-button) { color: inherit; }
.cycle-action-menu__icon :deep(.performance-icon-button:hover), .cycle-action-menu__icon :deep(.performance-icon-button:focus-visible) { background: transparent; color: inherit; }
.cycle-action-menu__item.is-disabled .cycle-action-menu__icon { pointer-events: none; }
.cycle-detail-panel { flex: 1 1 0; min-width: 0; }
.detail-content { min-width: 0; padding-left: 20px; color: #1f2329; }
.detail-heading { display: flex; align-items: flex-start; justify-content: space-between; height: 40px; margin-bottom: 0; }
.detail-heading h2 { margin: 0; color: #1f2329; font-size: 20px; font-weight: 600; line-height: 28px; }
.detail-actions { display: flex; align-items: center; gap: 8px; }
.detail-actions .danger-button { display: none; }
.project-settings :deep(.project-tools) { margin-bottom: 16px; }
.project-settings :deep(.project-tools .toolbar-spacer) { display: none; }
.project-settings :deep(.project-tools .search-input) { margin-left: 0; }
.detail-content > h3 { margin: 0 0 14px; font-size: 16px; font-weight: 600; line-height: 24px; }
.metrics { display: flex; align-items: flex-start; gap: 40px; min-width: 0; margin-bottom: 32px; }
.metrics > div { display: flex; min-width: 0; flex-direction: column; gap: 4px; color: #1f2329; font-size: 14px; line-height: 22px; white-space: nowrap; }
.metrics label { color: #646a73; }
.metrics strong { color: #3370ff; font-size: 14px; font-weight: 400; }
.metrics > div:nth-child(3) { min-width: 156px; }.metrics > div:nth-child(4) { min-width: 108px; }.metrics > div:nth-child(5) { min-width: 210px; }
.state-success, .state-error { margin: 0 0 12px; }.state-error { color: #f04438; }
@media (max-width: 1280px) { .metrics { gap: 24px; } }
</style>










