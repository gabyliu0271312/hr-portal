<template>
  <div class="project-settings-page">
    <PageHeader :title="projectName || '新建项目'" @back="goBack">
      <template #subtitle><span v-if="savedView" class="project-status-badge">待完成配置</span></template>
      <template #actions>
        <PerformanceStepFlow :steps="steps" :current-step="currentStep" aria-label="项目设置步骤" />
        <PerformanceButton v-if="currentStep > 0" variant="secondary" @click="currentStep--">上一步</PerformanceButton>
        <PerformanceButton variant="primary" :disabled="saving" @click="nextStep">{{ currentStep === steps.length - 1 ? '完成' : '下一步' }}</PerformanceButton>
      </template>
    </PageHeader>

    <main class="project-settings-content">
      <PerformanceContentSurface class="settings-surface">
      <section v-if="currentStep === 0" class="settings-card" aria-labelledby="project-info-title">
        <div class="card-heading"><h1 id="project-info-title">基本信息</h1><PerformanceIconButton v-if="savedView" icon="EditOutlined" label="编辑基本信息" text="编辑" variant="outlined" @click="openBasicEditor" /></div>
        <div class="basic-grid">
          <div class="basic-field"><span class="basic-label">项目名称</span><div v-if="savedView" class="basic-value project-name" :title="form.name">{{ form.name }}</div><input v-else v-model.trim="form.name" aria-label="项目名称" maxlength="128" /></div>
          <div class="basic-field"><span class="basic-label">谁可管理人员绩效数据</span><div v-if="savedView" class="basic-value administrator-tags"><PerformanceSelectTag v-for="manager in dataManagerTags" :key="manager.value" :label="manager.label" :closable="false" /></div><input v-else v-model="administratorsText" aria-label="谁可管理人员绩效数据" placeholder="例如：HRBP" /></div>
        </div>
      </section>

      <PerformanceProjectTemplateField
        v-if="currentStep === 0"
        :model-value="form.template_id"
        :templates="templates"
        :loading="templateLoading"
        :error="templateError"
        :disabled="saving || projectStatus === 'STARTED'"
        @update:model-value="selectTemplate"
        @retry="loadTemplates"
      />

      <section v-if="currentStep === 0 && form.template_id" class="settings-card" aria-labelledby="people-title">
        <h2 id="people-title">被评估人<span class="required">*</span></h2>
        <p class="hint">可圈定被评估人范围。同一评估周期中，每名被评估人只能参与 1 次「绩效评估」。</p>
        <div class="audience-summary">
          <h3>符合条件的员工，共计 {{ previewSummary.matched_count }}人</h3>
          <p><button type="button" :disabled="previewLoading" @click="openAudiencePreview('task')">{{ previewSummary.task_generation_count }}</button>名人员生成评估任务，并纳入报表统计<span v-if="previewSummary.report_only_count">；<button type="button" :disabled="previewLoading" @click="openAudiencePreview('report_only')">{{ previewSummary.report_only_count }}</button>名离职人员不生成评估任务，仅纳入报表统计</span></p>
        </div>
        <PerformanceAudienceRuleEditor
          v-model="form.evaluator_rules.groups"
          :allowed-fields="[...REVIEWEE_CONDITION_FIELDS]"
          :snapshot-options="evaluatorOptions"
          :organization-tree="evaluatorOptions.organization_tree"
          :person-options="evaluatorOptions.people"
          :employee-type-options="evaluatorOptions.employee_types"
          :hire-date-range="evaluatorOptions.hire_date_range"
          :group-counts="previewSummary.group_counts"
          :disabled="saving"
          @open-options="loadEvaluatorOptions"
          @open-preview="openAudiencePreview('matched', $event)"
        />
      </section>
      <p v-if="currentStep === 0 && validationError" class="error" role="alert">{{ validationError }}</p>

      <section v-if="currentStep === 1" class="settings-card flow-card" aria-labelledby="flow-title">
        <h1 id="flow-title">流程设置</h1>
        <p class="hint">流程环节根据第一步选择的绩效模板加载，可在本项目内调整并保存。</p>
        <PerformanceProjectFlowSettings
          v-if="form.template_id"
          v-model="form.flow_settings"
          :nodes="workflowNodes"
          :project-id="projectId"
          :project-payload="payload()"
          :distribution-assessment-options="distributionAssessmentOptions"
          :people-options="evaluatorOptions.people"
          :organization-tree="evaluatorOptions.organization_tree"
          :hire-date-range="evaluatorOptions.hire_date_range"
          @open-options="loadEvaluatorOptions"
          :evaluated-count="evaluatedCount"
          :loading="flowLoading"
          :error="flowError"
          :show-opening-error="openingError"
          :manual-result-opening-enabled="manualResultOpeningEnabled"
          :manual-opening-setting-loaded="manualOpeningSettingLoaded"
        />
        <div v-if="manualOpeningError" class="flow-setting-error" role="alert">
          <span>{{ manualOpeningError }}</span>
          <PerformanceButton variant="secondary" size="small" @click="loadManualOpeningSetting">重新加载</PerformanceButton>
        </div>
        <p v-if="!form.template_id" class="flow-summary">请先返回基本信息选择绩效模板</p>
        <p v-if="validationError" class="error" role="alert">{{ validationError }}</p>
      </section>

      <section v-if="currentStep === 2" class="settings-card time-card" aria-labelledby="date-title">
        <h1 id="date-title">设置各环节起止时间</h1>
        <p class="hint">针对每个环节，可以自定义设置各环节内任务开展与完成的起止时间</p>
        <PerformanceProjectTimeSettings
          v-model="form.flow_settings.node_times"
          :node-settings="form.flow_settings.node_settings"
          :nodes="workflowNodes"
          :loading="flowLoading"
          :error="flowError"
        />
        <p v-if="nodeTimeError" class="error" role="alert">{{ nodeTimeError }}</p>
      </section>
    </PerformanceContentSurface>
    </main>
    <p v-if="notice" class="page-notice" role="alert">{{ notice }}</p>
    <PerformanceTaskOverlay v-model="audiencePreviewOpen" :title="audiencePreviewTitle" :description="audiencePreviewDescription" @close="audiencePreviewOpen = false">
      <PerformanceReminderPanel v-if="audiencePreviewOpen" :context="audiencePreviewContext" :provider="audiencePreviewProvider" mode="preview" @loaded="audiencePreviewTotal = $event" />
    </PerformanceTaskOverlay>
    <PerformanceProjectDialog
      v-model="basicDialogOpen"
      mode="edit"
      :project="basicDialogProject"
      :evaluator-options="evaluatorOptions"
      :can-submit="Boolean(projectId)"
      :saving="basicDialogSaving"
      @open-options="loadEvaluatorOptions"
      @submit="saveBasicInfo"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/performance/PageHeader.vue'
import PerformanceButton from '@/components/performance/PerformanceButton.vue'
import PerformanceIconButton from '@/components/performance/PerformanceIconButton.vue'
import PerformanceSelectTag from '@/components/performance/PerformanceSelectTag.vue'
import PerformanceStepFlow from '@/components/performance/PerformanceStepFlow.vue'
import PerformanceProjectDialog from '@/components/performance/PerformanceProjectDialog.vue'
import PerformanceContentSurface from '@/components/performance/PerformanceContentSurface.vue'
import PerformanceAudienceRuleEditor from '@/components/performance/PerformanceAudienceRuleEditor.vue'
import PerformanceProjectTemplateField from '@/components/performance/PerformanceProjectTemplateField.vue'
import { REVIEWEE_CONDITION_FIELDS, isDateConditionField, validHireDateCondition } from '@/components/performance/performanceConditionFields'
import PerformanceTaskOverlay from '@/components/performance/PerformanceTaskOverlay.vue'
import PerformanceReminderPanel from '@/components/performance/PerformanceReminderPanel.vue'
import type { ReminderProvider } from '@/components/performance/performanceReminder'
import { performanceOtherSettingsApi, performanceProjectApi, type PerformanceCycleProjectShell, type PerformanceDistributionAssessmentOption, type PerformanceProjectFlowSettings as ProjectFlowSettings, type PerformanceProjectPayload, type PerformanceProjectTemplate, type PerformanceWorkflowNode, type PerformanceEvaluatorOptions, type PerformanceEvaluatorPreviewPayload, type PerformanceEvaluatorPreviewSummary } from '@/api/performance'
import PerformanceProjectFlowSettings from '@/components/performance/PerformanceProjectFlowSettings.vue'
import PerformanceProjectTimeSettings from '@/components/performance/PerformanceProjectTimeSettings.vue'
import { initializeCalibrationNodes, ensureCalibrationPhaseIds, syncCalibrationPhaseTimes, projectNodeTimeError } from '@/components/performance/performanceProjectCalibration'
import PerformanceDateTimeField from '@/components/performance/PerformanceDateTimeField.vue'

const route = useRoute(); const router = useRouter()
const projectId = computed(() => Number(route.params.id || 0) || null)
const cycleId = computed(() => Number(route.params.cycleId || 0) || null)
const evaluatorOptions = ref<PerformanceEvaluatorOptions>({ organization_tree: [], people: [], employee_types: [] })
const evaluatorOptionsLoaded = ref(false)
const evaluatorOptionsLoading = ref(false)
const previewLoading = ref(false)
const previewSummary = ref<PerformanceEvaluatorPreviewSummary>({ matched_count: 0, task_generation_count: 0, report_count: 0, report_only_count: 0, group_counts: [] })
const audiencePreviewOpen = ref(false)
const audiencePreviewKind = ref<'matched' | 'task' | 'report_only'>('matched')
const audiencePreviewGroup = ref<number | null>(null)
const audiencePreviewTotal = ref(0)
const savedView = ref(false); const currentStep = ref(0); const saving = ref(false); const notice = ref(''); const validationError = ref(''); const templateLoading = ref(false); const templates = ref<PerformanceProjectTemplate[]>([]); const basicDialogOpen = ref(false); const basicDialogSaving = ref(false); const basicDialogProject = ref<PerformanceCycleProjectShell | null>(null)
const templateError = ref('')
const workflowNodes = ref<PerformanceWorkflowNode[]>([]); const distributionAssessmentOptions = ref<PerformanceDistributionAssessmentOption[]>([]); const flowLoading = ref(false); const flowError = ref(''); const openingError = ref(false); const evaluatedCount = ref(0); const projectStatus = ref('DRAFT'); const savedNodeTimeKeys = ref(new Set<string>()); const manualResultOpeningEnabled = ref(true); const manualOpeningSettingLoaded = ref(false); const manualOpeningError = ref('')
const steps = [{ key: 'info', label: '项目信息' }, { key: 'flow', label: '流程设置' }, { key: 'time', label: '起止时间' }]
const form = reactive<{ name: string; description: string; administrators: string[]; template_id: number | null; start_at: string; end_at: string; evaluator_rules: NonNullable<PerformanceProjectPayload['evaluator_rules']>; flow_settings: ProjectFlowSettings }>({ name: '', description: '', administrators: [], template_id: null, start_at: '', end_at: '', evaluator_rules: { groups: [{ conditions: [{ field: '', operator: 'include', values: [] }] }] }, flow_settings: { node_settings: {}, node_times: {} } })
const administratorsText = computed({ get: () => form.administrators.join('、'), set: value => { form.administrators = value.split(/[、,，]/).map(item => item.trim()).filter(Boolean) } })
const dataManagerTags = computed(() => (basicDialogProject.value?.data_managers ?? []).map(value => ({ value, label: value === 'PROJECT_ADMIN' ? '项目管理员' : 'HRBP' })))
const projectName = computed(() => form.name)
const audiencePreviewTitle = computed(() => audiencePreviewGroup.value == null ? '符合条件的员工' : `范围 ${audiencePreviewGroup.value + 1} 符合条件的员工`)
const audiencePreviewDescription = computed(() => `${audiencePreviewKind.value === 'task' ? '生成评估任务并纳入报表统计' : audiencePreviewKind.value === 'report_only' ? '不生成评估任务，仅纳入报表统计' : '符合当前筛选条件'}，共计 ${audiencePreviewTotal.value} 人`)
const audiencePreviewContext = computed(() => ({ projectId: projectId.value || 0, cycleId: cycleId.value || 0, nodeId: 'evaluator-preview', nodeType: 'preview', reviewType: 'evaluator_preview', title: audiencePreviewTitle.value, sectionTitle: audiencePreviewTitle.value }))
const dateError = computed(() => Boolean(form.start_at && form.end_at && form.end_at <= form.start_at))
function workflowNodeKey(node: PerformanceWorkflowNode) { return node.node_id || `${node.node_type}-${node.order}` }
watch(() => form.flow_settings, settings => { ensureCalibrationPhaseIds(settings.node_settings); syncCalibrationPhaseTimes(settings.node_settings, settings.node_times) }, { deep: true })
let previewTimer: ReturnType<typeof setTimeout> | undefined
watch(() => form.evaluator_rules, () => { if (previewTimer) clearTimeout(previewTimer); previewTimer = setTimeout(() => { void loadAudiencePreview() }, 200) }, { deep: true })
const nodeTimeError = computed(() => projectNodeTimeError(workflowNodes.value, form.flow_settings))
function openBasicEditor() { if (!projectId.value) return; basicDialogProject.value = { ...basicDialogProject.value, id: projectId.value, project_ref: basicDialogProject.value?.project_ref || '', name: form.name, description: form.description || null, administrators: [...form.administrators], status: projectStatus.value, evaluated_count: evaluatedCount.value }; basicDialogOpen.value = true }
async function saveBasicInfo(payload: PerformanceProjectPayload) { if (!projectId.value) return; basicDialogSaving.value = true; try { await performanceProjectApi.update(projectId.value, payload); basicDialogOpen.value = false; await loadProject() } catch (error: any) { notice.value = error?.response?.data?.detail || '基本信息保存失败' } finally { basicDialogSaving.value = false } }
function toInputTime(value: string | null) { return value ? value.slice(0, 16) : '' }
function validate() { validationError.value = ''; if (!form.name.trim()) validationError.value = '项目名称不能为空'; else if (!form.template_id) validationError.value = '请选择绩效模板'; else if (!form.evaluator_rules.groups.length || form.evaluator_rules.groups.some(group => !group.conditions.length || group.conditions.some(condition => !condition.field || !condition.values.length || (isDateConditionField(condition.field) && !validHireDateCondition(condition.operator, condition.values))))) validationError.value = '请完善被评估人筛选条件'; else if (dateError.value) validationError.value = '项目截止时间必须晚于开始时间'; return !validationError.value }
function payload(): PerformanceProjectPayload { return { name: form.name.trim(), description: form.description.trim() || null, administrators: form.administrators, template_id: form.template_id, start_at: form.start_at ? new Date(form.start_at).toISOString() : null, end_at: form.end_at ? new Date(form.end_at).toISOString() : null, evaluator_rules: { groups: form.evaluator_rules.groups.map(group => ({ conditions: group.conditions.map(condition => { const values = Array.isArray(condition.values) ? condition.values : String(condition.values).split(/[、,，]/).map(value => value.trim()).filter(Boolean); return { ...condition, values } }) })) }, flow_settings: form.flow_settings } }
function previewPayload(kind: 'matched' | 'task' | 'report_only' = 'matched', groupIndex: number | null = null): PerformanceEvaluatorPreviewPayload {
  return {
    project_id: projectId.value,
    evaluator_rules: payload().evaluator_rules || { groups: [] },
    scope_rules: basicDialogProject.value?.scope_rules || { groups: [] },
    group_index: groupIndex,
    list_kind: kind,
  }
}
function previewRulesValid() {
  return Boolean(cycleId.value && form.evaluator_rules.groups.length && form.evaluator_rules.groups.every(group => group.conditions.length && group.conditions.every(condition => condition.field && condition.values.length && (!isDateConditionField(condition.field) || validHireDateCondition(condition.operator, condition.values)))))
}
async function loadAudiencePreview() {
  if (!cycleId.value || !previewRulesValid()) { previewSummary.value = { matched_count: 0, task_generation_count: 0, report_count: 0, report_only_count: 0, group_counts: [] }; return }
  previewLoading.value = true
  try { previewSummary.value = await performanceProjectApi.previewEvaluators(cycleId.value, previewPayload()) }
  catch (error: any) { notice.value = error?.response?.data?.detail || '被评估人人数加载失败，请稍后重试' }
  finally { previewLoading.value = false }
}
function openAudiencePreview(kind: 'matched' | 'task' | 'report_only', groupIndex: number | null = null) {
  audiencePreviewKind.value = kind
  audiencePreviewGroup.value = groupIndex
  audiencePreviewTotal.value = groupIndex != null ? previewSummary.value.group_counts[groupIndex] ?? 0 : kind === 'task' ? previewSummary.value.task_generation_count : kind === 'report_only' ? previewSummary.value.report_only_count : previewSummary.value.matched_count
  audiencePreviewOpen.value = true
}
const audiencePreviewProvider: ReminderProvider = async query => {
  if (!cycleId.value) return { items: [], total: 0, columns: [], capabilities: { canRemind: false, canAuthorize: false, canTransfer: false, canExport: false } }
  const result = await performanceProjectApi.previewEvaluatorPeople(cycleId.value, previewPayload(audiencePreviewKind.value, audiencePreviewGroup.value), query.keyword.trim(), query.page, query.pageSize)
  return {
    items: result.items.map(person => ({ ...person, task_id: person.employee_no, job_sequence: null, position_level: null, hire_date: null, department: person.department, employee_type: null, employment_status: person.live_employment_status ?? person.employment_status ?? null, due_at: null, selectable: false })),
    total: result.total,
    columns: [
      { key: 'display_name', label: '姓名', locked: true, visibleByDefault: true, minWidth: 160 },
      { key: 'employment_status', label: '当前在职状态', visibleByDefault: true, minWidth: 140 },
      { key: 'direct_supervisor', label: '直属上级', visibleByDefault: true, minWidth: 160 },
      { key: 'company_org', label: '公司级组织', visibleByDefault: true, minWidth: 160 },
      { key: 'department', label: '一级部门', visibleByDefault: true, minWidth: 160 },
      { key: 'department_2', label: '二级部门', visibleByDefault: true, minWidth: 160 },
      { key: 'department_3', label: '三级部门', visibleByDefault: true, minWidth: 160 },
      { key: 'job_family', label: '职位族', visibleByDefault: true, minWidth: 140 },
      { key: 'job_category', label: '职位类', visibleByDefault: true, minWidth: 140 },
      { key: 'standard_position', label: '标准职位', visibleByDefault: true, minWidth: 180 },
    ],
    capabilities: { canRemind: false, canAuthorize: false, canTransfer: false, canExport: true },
  }
}
async function loadManualOpeningSetting() {
  manualOpeningSettingLoaded.value = false
  manualOpeningError.value = ''
  try {
    manualResultOpeningEnabled.value = (await performanceOtherSettingsApi.get()).manual_result_opening_enabled
    manualOpeningSettingLoaded.value = true
  } catch {
    manualOpeningError.value = '组织设置加载失败，暂时无法选择手动开通'
  }
}
async function loadTemplates() { templateLoading.value = true; templateError.value = ''; try { templates.value = cycleId.value ? await performanceProjectApi.listTemplates(cycleId.value) : [] } catch { templateError.value = '绩效模板加载失败，请稍后重试' } finally { templateLoading.value = false } }
function selectTemplate(templateId: number) { if (form.template_id === templateId) return; if (validationError.value === '请选择绩效模板') validationError.value = ''; form.template_id = templateId; form.flow_settings = { node_settings: {}, node_times: {} }; savedNodeTimeKeys.value = new Set(); void loadTemplateWorkflow() }
async function loadTemplateWorkflow() {
  const requestedTemplateId = form.template_id
  if (!form.template_id || !cycleId.value) { workflowNodes.value = []; distributionAssessmentOptions.value = []; flowError.value = ''; openingError.value = false; return }
  flowLoading.value = true; flowError.value = ''; openingError.value = false
  try {
    const workflow = await performanceProjectApi.getTemplateWorkflow(cycleId.value, form.template_id)
    if (requestedTemplateId !== form.template_id) return
    workflowNodes.value = workflow.nodes
    distributionAssessmentOptions.value = workflow.distribution_assessment_options || []
    initializeCalibrationNodes(workflowNodes.value, form.flow_settings)
  } catch (error: any) {
    if (requestedTemplateId !== form.template_id) return
    workflowNodes.value = []
    distributionAssessmentOptions.value = []
    flowError.value = error?.response?.data?.detail?.message || '绩效模板流程加载失败，请稍后重试'
  } finally { if (requestedTemplateId === form.template_id) flowLoading.value = false }
}
async function loadEvaluatorOptions() { if (!cycleId.value || evaluatorOptionsLoaded.value || evaluatorOptionsLoading.value) return; evaluatorOptionsLoading.value = true; try { evaluatorOptions.value = await performanceProjectApi.listEvaluatorOptions(cycleId.value); evaluatorOptionsLoaded.value = true; notice.value = '' } catch (error: any) { notice.value = error?.response?.data?.detail || '被评估人名单加载失败，请稍后重试' } finally { evaluatorOptionsLoading.value = false } }
async function loadProject() { if (!projectId.value) return; try { const project = await performanceProjectApi.get(projectId.value); basicDialogProject.value = { ...project, data_managers: project.data_managers ?? ['HRBP'] }; form.name = project.name; form.description = project.description || ''; form.administrators = [...project.administrators]; form.template_id = project.template_id; form.start_at = toInputTime(project.start_at); form.end_at = toInputTime(project.end_at); evaluatedCount.value = project.evaluated_count; const savedFlowSettings = project.flow_settings || { node_settings: {}, node_times: {} }; form.flow_settings = { node_settings: savedFlowSettings.node_settings || {}, node_times: savedFlowSettings.node_times || {} }; savedNodeTimeKeys.value = new Set(Object.keys(form.flow_settings.node_times)); projectStatus.value = project.status; if (project.evaluator_rules?.groups?.length) form.evaluator_rules = JSON.parse(JSON.stringify(project.evaluator_rules)); savedView.value = true; await loadAudiencePreview() } catch (error: any) { notice.value = error?.response?.data?.detail || '项目加载失败' } }
async function saveDraft() { if (!projectId.value) return true; saving.value = true; try { await performanceProjectApi.update(projectId.value, payload()); return true } catch (error: any) { notice.value = error?.response?.data?.detail || '当前步骤保存失败'; return false } finally { saving.value = false } }
async function nextStep() {
  if (currentStep.value === 0 && !validate()) return
  if (currentStep.value === 1) {
    validationError.value = ''
    openingError.value = workflowNodes.value.some(node => node.node_type === 'result_view'
      && !form.flow_settings.node_settings[workflowNodeKey(node)]?.result_view?.automatic_enabled
      && !form.flow_settings.node_settings[workflowNodeKey(node)]?.result_view?.manual_enabled)
    if (openingError.value) return
    if (flowLoading.value || flowError.value || !workflowNodes.value.some(node => node.node_type === 'result_view')) {
      validationError.value = flowError.value || '请先加载绩效结果查看环节'
      return
    }
  }
  if (currentStep.value < steps.length - 1) {
    if (await saveDraft()) currentStep.value += 1
    return
  }
  if (nodeTimeError.value) { validationError.value = nodeTimeError.value; return }
  if (!validate() || saving.value) return
  if (await saveDraft()) { savedView.value = true; notice.value = '项目设置已保存' }
}
function goBack() { void router.push({ name: 'PerformanceCycles' }) }
onMounted(async () => { document.body.style.overflow = 'hidden'; await Promise.all([loadManualOpeningSetting(), loadTemplates()]); await loadProject(); await loadTemplateWorkflow() })
onBeforeUnmount(() => { if (previewTimer) clearTimeout(previewTimer); document.body.style.overflow = '' })
</script>

<style scoped>
.project-settings-page { position: fixed; inset: 0; z-index: 100; min-width: 1200px; min-height: 0; padding-top: 0; box-sizing: border-box; overflow: auto; background: var(--color-bg-page); color: var(--color-text-primary); }
.project-settings-page :deep(.full-screen-modal-header) { position: sticky; top: 0; }
.project-status-badge { padding: 4px 8px; border-radius: 4px; background: var(--color-bg-card)1e8; color: #ff7d00; font-size: 14px; }
.project-settings-content { display: block; width: var(--performance-form-surface-width); max-width: calc(100% - 2 * var(--performance-form-surface-page-gap)); margin: var(--performance-form-surface-page-gap) auto; padding: 0; box-sizing: border-box; }.project-settings-content :deep(.settings-surface) { display: grid; gap: 16px; padding: 0; background: transparent; box-shadow: none; }.settings-card { width: 100%; box-sizing: border-box; padding: 24px 32px; border-radius: 8px; background: var(--color-bg-card); box-shadow: 0 1px 4px rgba(31,35,41,.05); }.settings-card.flow-card,.settings-card.time-card { padding: 0; background: transparent; box-shadow: none; }.card-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }.card-heading h1 { margin: 0; }.rule-group-heading :deep(.performance-icon-button),.rule-row :deep(.performance-icon-button) { --performance-icon-button-size: 24px; width: 24px; height: 24px; }.settings-card h1,.settings-card h2 { margin: 0 0 10px; font-size: 20px; line-height: 28px; }.settings-card h2 { font-size: 18px; }.hint,.muted { margin: 0 0 18px; color: var(--color-text-secondary); font-size: 14px; line-height: 22px; }
.audience-summary { margin: 0 0 var(--spacing-2); }
.audience-summary h3 { margin: 0; color: var(--color-text-primary); font: 600 var(--font-size-lg)/24px var(--font-sans); }
.audience-summary p { margin: var(--spacing-1) 0 0; color: var(--performance-settings-text-secondary); font: 400 var(--font-size-md)/22px var(--font-sans); }
.audience-summary button { padding: 0; border: 0; background: transparent; color: var(--performance-button-text-color); cursor: pointer; font: inherit; }
.audience-summary button:disabled { color: var(--performance-button-link-disabled-color); cursor: default; }.basic-grid,.date-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px 48px; }.basic-grid .basic-field,.date-grid label { display: grid; gap: 8px; color: var(--color-text-secondary); font-size: 14px; }.basic-grid .basic-label,.date-grid label span { color: var(--color-text-secondary); }.basic-field { min-width: 0; }.basic-value { min-width: 0; color: var(--color-text-primary); font: 400 var(--font-size-md)/22px var(--font-sans); }.project-name { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }.administrator-tags { display: flex; flex-wrap: wrap; gap: 6px; }.administrator-tags :deep(.performance-select-shell__tag) { margin: 0; --performance-select-tag-content-max-width: 100%; }.basic-grid input,.basic-grid textarea,.date-grid input { box-sizing: border-box; width: 100%; padding: 7px 10px; border: 1px solid var(--color-line-control); border-radius: 6px; color: var(--color-text-primary); background: var(--color-bg-card); font: inherit; }.basic-grid textarea { min-height: 66px; field-sizing: content; resize: none; overflow-y: hidden; }.rule-group { margin-top: 16px; padding: 16px; border-radius: 8px; background: var(--color-bg-page); }.rule-group-heading { display: flex; justify-content: space-between; margin-bottom: 12px; font-weight: 600; }.rule-group-heading button,.rule-row button { border: 0; background: transparent; color: var(--color-text-secondary); cursor: pointer; }.rule-row { display: grid; grid-template-columns: 140px 120px 1fr 32px; gap: 8px; margin-top: 8px; }.rule-row select,.rule-row input { min-width: 0; height: 32px; box-sizing: border-box; padding: 4px 8px; border: 1px solid var(--color-line-control); border-radius: 6px; background: var(--color-bg-card); font: inherit; }.rule-row .condition-values { height: 32px; }.or-divider { margin: 16px -16px 0; padding-top: 12px; border-top: 1px solid #dee0e3; color: var(--color-text-secondary); }.add-group { margin-top: 16px; }.required { color: var(--color-danger); }.error { margin: 12px 0 0; color: var(--color-danger); }.flow-summary { display: grid; gap: 8px; padding: 20px; border: 1px solid #e5e6eb; border-radius: 8px; }.flow-summary span { color: var(--color-text-secondary); }.flow-setting-error { display: flex; align-items: center; gap: var(--spacing-3); margin: 12px 0 0 52px; color: var(--color-danger); font-size: var(--font-size-md); }.page-notice { position: fixed; right: 24px; bottom: 24px; z-index: 10; padding: 12px 16px; border: 1px solid #ffccc7; border-radius: 6px; background: var(--color-bg-card)2f0; color: #f54a45; }
</style>
