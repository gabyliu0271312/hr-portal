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
        <div class="card-heading"><h1 id="project-info-title">基本信息</h1><PerformanceButton v-if="savedView" variant="secondary" size="small" @click="openBasicEditor">编辑</PerformanceButton></div>
        <div class="basic-grid">
          <label><span>项目名称</span><input v-model.trim="form.name" maxlength="128" :disabled="savedView" /></label>
          <label><span>谁可管理人员绩效数据</span><input v-model="administratorsText" placeholder="例如：HRBP" :disabled="savedView" /></label>
          <label class="wide"><span>描述</span><PerformanceTextField v-model="form.description" type="textarea" :maxlength="500" show-count :disabled="savedView" /></label>
        </div>
      </section>

      <section v-if="currentStep === 0" class="settings-card" aria-labelledby="template-title">
        <h2 id="template-title">绩效模板</h2>
        <p class="hint">先选择绩效模板，再根据模板中的评估内容为该项目圈选合适的被评估人</p>
        <select v-model="form.template_id" :disabled="saving" class="template-select" @change="loadTemplateWorkflow">
          <option :value="null">请选择绩效模板</option>
          <option v-for="template in templates" :key="template.template_id" :value="template.template_id">{{ template.name }}</option>
        </select>
        <p v-if="templateLoading" class="muted">正在加载绩效模板...</p>
        <p v-else-if="!templates.length" class="muted">暂无已启用绩效模板，请先在绩效模板模块完成配置。</p>
      </section>

      <section v-if="currentStep === 0" class="settings-card" aria-labelledby="people-title">
        <h2 id="people-title">被评估人<span class="required">*</span></h2>
        <p class="hint">可圈定被评估人范围。同一评估周期中，每名被评估人只能参与 1 次「绩效评估」。</p>
        <div v-for="(group, groupIndex) in form.evaluator_rules.groups" :key="groupIndex" class="rule-group">
          <div class="rule-group-heading"><span>范围 {{ groupIndex + 1 }}</span><PerformanceIconButton icon="DeleteTrashOutlined" :label="`删除范围 ${groupIndex + 1}`" @click="removeGroup(groupIndex)" /></div>
          <div v-for="(condition, conditionIndex) in group.conditions" :key="conditionIndex" class="rule-row">
            <select v-model="condition.field" @change="condition.values = []"><option value="department">部门</option><option value="employee_type">人员类型</option><option value="employee">员工</option></select>
            <select v-model="condition.operator"><option value="include">包含</option><option value="exclude">不包含</option></select>
            <PerformanceMultiSelect v-model="condition.values" :options="optionsFor(condition.field)" :placeholder="condition.field === 'department' ? '请选择部门' : condition.field === 'employee_type' ? '请选择人员类型' : '请选择员工'" />
            <PerformanceIconButton icon="DeleteTrashOutlined" :label="`删除范围 ${groupIndex + 1} 条件 ${conditionIndex + 1}`" @click="removeCondition(groupIndex, conditionIndex)" />
          </div>
          <PerformanceTextButton label="＋ 添加条件" @click="addCondition(groupIndex)" />
          <div v-if="groupIndex < form.evaluator_rules.groups.length - 1" class="or-divider">或</div>
        </div>
        <PerformanceTextButton label="＋ 添加人员范围" @click="addGroup" />
        <p v-if="validationError" class="error" role="alert">{{ validationError }}</p>
      </section>

      <section v-if="currentStep === 1" class="settings-card flow-card" aria-labelledby="flow-title">
        <h1 id="flow-title">流程设置</h1>
        <p class="hint">流程环节根据第一步选择的绩效模板加载，可在本项目内调整并保存。</p>
        <PerformanceProjectFlowSettings
          v-if="form.template_id"
          v-model="form.flow_settings"
          :nodes="workflowNodes"
          :people-options="evaluatorOptions.employees"
          :evaluated-count="evaluatedCount"
          :loading="flowLoading"
          :error="flowError"
        />
        <p v-else class="flow-summary">请先返回基本信息选择绩效模板</p>
      </section>

      <section v-if="currentStep === 2" class="settings-card time-card" aria-labelledby="date-title">
        <h1 id="date-title">设置各环节起止时间</h1>
        <p class="hint">针对每个环节，可以自定义设置各环节内任务开展与完成的起止时间</p>
        <PerformanceProjectTimeSettings
          v-model="form.flow_settings.node_times"
          :nodes="workflowNodes"
          :loading="flowLoading"
          :error="flowError"
        />
        <p v-if="nodeTimeError" class="error" role="alert">{{ nodeTimeError }}</p>
      </section>
    </PerformanceContentSurface>
    </main>
    <p v-if="notice" class="page-notice" role="alert">{{ notice }}</p>
    <PerformanceProjectDialog
      v-model="basicDialogOpen"
      mode="edit"
      :project="basicDialogProject"
      :can-submit="Boolean(projectId)"
      :saving="basicDialogSaving"
      @submit="saveBasicInfo"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/performance/PageHeader.vue'
import PerformanceButton from '@/components/performance/PerformanceButton.vue'
import PerformanceTextButton from '@/components/performance/PerformanceTextButton.vue'
import PerformanceStepFlow from '@/components/performance/PerformanceStepFlow.vue'
import PerformanceProjectDialog from '@/components/performance/PerformanceProjectDialog.vue'
import PerformanceMultiSelect from '@/components/performance/PerformanceMultiSelect.vue'
import PerformanceIconButton from '@/components/performance/PerformanceIconButton.vue'
import PerformanceContentSurface from '@/components/performance/PerformanceContentSurface.vue'
import { performanceProjectApi, performanceTemplateApi, type PerformanceCycleProjectShell, type PerformanceProjectFlowSettings as ProjectFlowSettings, type PerformanceProjectPayload, type PerformanceTemplateListItem, type PerformanceWorkflowNode } from '@/api/performance'
import PerformanceProjectFlowSettings from '@/components/performance/PerformanceProjectFlowSettings.vue'
import PerformanceProjectTimeSettings from '@/components/performance/PerformanceProjectTimeSettings.vue'
import PerformanceDateTimeField from '@/components/performance/PerformanceDateTimeField.vue'
import PerformanceTextField from '@/components/performance/PerformanceTextField.vue'

const route = useRoute(); const router = useRouter()
const projectId = computed(() => Number(route.params.id || 0) || null)
const cycleId = computed(() => Number(route.params.cycleId || 0) || null)
const evaluatorOptions = ref<{ departments: Array<{ value: string; label: string }>; employee_types: Array<{ value: string; label: string }>; employees: Array<{ value: string; label: string }> }>({ departments: [], employee_types: [], employees: [] })
const savedView = ref(false); const currentStep = ref(0); const saving = ref(false); const notice = ref(''); const validationError = ref(''); const templateLoading = ref(false); const templates = ref<PerformanceTemplateListItem[]>([]); const basicDialogOpen = ref(false); const basicDialogSaving = ref(false); const basicDialogProject = ref<PerformanceCycleProjectShell | null>(null)
const workflowNodes = ref<PerformanceWorkflowNode[]>([]); const flowLoading = ref(false); const flowError = ref(''); const evaluatedCount = ref(0); const projectStatus = ref('DRAFT'); const savedNodeTimeKeys = ref(new Set<string>())
const steps = [{ key: 'info', label: '项目信息' }, { key: 'flow', label: '流程设置' }, { key: 'time', label: '起止时间' }]
const form = reactive<{ name: string; description: string; administrators: string[]; template_id: number | null; start_at: string; end_at: string; evaluator_rules: NonNullable<PerformanceProjectPayload['evaluator_rules']>; flow_settings: ProjectFlowSettings }>({ name: '', description: '', administrators: [], template_id: null, start_at: '', end_at: '', evaluator_rules: { groups: [{ conditions: [{ field: 'department', operator: 'include', values: [] }] }] }, flow_settings: { node_settings: {}, node_times: {} } })
const administratorsText = computed({ get: () => form.administrators.join('、'), set: value => { form.administrators = value.split(/[、,，]/).map(item => item.trim()).filter(Boolean) } })
const selectedTemplate = computed(() => templates.value.find(template => template.template_id === form.template_id))
const projectName = computed(() => form.name)
const dateError = computed(() => Boolean(form.start_at && form.end_at && form.end_at <= form.start_at))
function workflowNodeKey(node: PerformanceWorkflowNode) { return node.node_id || `${node.node_type}-${node.order}` }
const nodeTimeError = computed(() => {
  for (const node of workflowNodes.value) {
    const time = form.flow_settings.node_times?.[workflowNodeKey(node)]
    if (node.node_type === 'result_view') {
      if (!time?.start_at || !time.appeal_deadline) return `${node.name}的开始时间和发起复议截止时间不能为空`
      if (time.appeal_deadline <= time.start_at) return `${node.name}的发起复议截止时间必须晚于开始时间`
    } else if (node.node_type === 'result_reconsideration') {
      if (!time?.end_at) return `${node.name}的处理复议截止时间不能为空`
    } else {
      if (!time?.start_at || !time.end_at) return `${node.name}的开始时间和截止时间不能为空`
      if (time.end_at <= time.start_at) return `${node.name}的截止时间必须晚于开始时间`
    }
  }
  return ''
})
function addGroup() { form.evaluator_rules.groups.push({ conditions: [{ field: 'department', operator: 'include', values: [] }] }) }
function removeGroup(index: number) { if (form.evaluator_rules.groups.length > 1) form.evaluator_rules.groups.splice(index, 1) }
function addCondition(index: number) { form.evaluator_rules.groups[index].conditions.push({ field: 'department', operator: 'include', values: [] }) }
function removeCondition(groupIndex: number, conditionIndex: number) { const conditions = form.evaluator_rules.groups[groupIndex].conditions; if (conditions.length > 1) conditions.splice(conditionIndex, 1) }
function optionsFor(field: 'department' | 'employee_type' | 'employee') { return field === 'department' ? evaluatorOptions.value.departments : field === 'employee_type' ? evaluatorOptions.value.employee_types : evaluatorOptions.value.employees }
function openBasicEditor() { if (!projectId.value) return; basicDialogProject.value = { id: projectId.value, project_ref: '', name: form.name, description: form.description || null, administrators: [...form.administrators], status: 'DRAFT', evaluated_count: 0 }; basicDialogOpen.value = true }
async function saveBasicInfo(payload: PerformanceProjectPayload) { if (!projectId.value) return; basicDialogSaving.value = true; try { await performanceProjectApi.update(projectId.value, payload); basicDialogOpen.value = false; await loadProject() } catch (error: any) { notice.value = error?.response?.data?.detail || '基本信息保存失败' } finally { basicDialogSaving.value = false } }
function toInputTime(value: string | null) { return value ? value.slice(0, 16) : '' }
function validate() { validationError.value = ''; if (!form.name.trim()) validationError.value = '项目名称不能为空'; else if (!form.template_id) validationError.value = '请选择绩效模板'; else if (!form.evaluator_rules.groups.some(group => group.conditions.some(condition => condition.values.length))) validationError.value = '请至少配置一个被评估人筛选条件'; else if (dateError.value) validationError.value = '项目截止时间必须晚于开始时间'; return !validationError.value }
function payload(): PerformanceProjectPayload { return { name: form.name.trim(), description: form.description.trim() || null, administrators: form.administrators, template_id: form.template_id, start_at: form.start_at ? new Date(form.start_at).toISOString() : null, end_at: form.end_at ? new Date(form.end_at).toISOString() : null, evaluator_rules: { groups: form.evaluator_rules.groups.map(group => ({ conditions: group.conditions.map(condition => { const values = Array.isArray(condition.values) ? condition.values : String(condition.values).split(/[、,，]/).map(value => value.trim()).filter(Boolean); return { ...condition, values } }) })) }, flow_settings: form.flow_settings } }
async function loadTemplates() { templateLoading.value = true; try { templates.value = (await performanceTemplateApi.list()).filter(template => template.status === 'active') } catch { notice.value = '绩效模板加载失败，请稍后重试' } finally { templateLoading.value = false } }
async function loadTemplateWorkflow() {
  if (!form.template_id) { workflowNodes.value = []; flowError.value = ''; return }
  flowLoading.value = true; flowError.value = ''
  try {
    const workflow = await performanceTemplateApi.getWorkflow(form.template_id)
    workflowNodes.value = workflow.nodes
  } catch (error: any) {
    workflowNodes.value = []
    flowError.value = error?.response?.data?.detail?.message || '绩效模板流程加载失败，请稍后重试'
  } finally { flowLoading.value = false }
}
async function loadEvaluatorOptions() { if (!cycleId.value) return; try { evaluatorOptions.value = await performanceProjectApi.listEvaluatorOptions(cycleId.value) } catch { notice.value = '被评估人名单加载失败，请稍后重试' } }
async function loadProject() { if (!projectId.value) return; try { const project = await performanceProjectApi.get(projectId.value); form.name = project.name; form.description = project.description || ''; form.administrators = [...project.administrators]; form.template_id = project.template_id; form.start_at = toInputTime(project.start_at); form.end_at = toInputTime(project.end_at); evaluatedCount.value = project.evaluated_count; const savedFlowSettings = project.flow_settings || { node_settings: {}, node_times: {} }; form.flow_settings = { node_settings: savedFlowSettings.node_settings || {}, node_times: savedFlowSettings.node_times || {} }; savedNodeTimeKeys.value = new Set(Object.keys(form.flow_settings.node_times)); projectStatus.value = project.status; if (project.evaluator_rules?.groups?.length) form.evaluator_rules = JSON.parse(JSON.stringify(project.evaluator_rules)); savedView.value = true } catch (error: any) { notice.value = error?.response?.data?.detail || '项目加载失败' } }
async function saveDraft() { if (!projectId.value) return true; saving.value = true; try { await performanceProjectApi.update(projectId.value, payload()); return true } catch (error: any) { notice.value = error?.response?.data?.detail || '当前步骤保存失败'; return false } finally { saving.value = false } }
async function nextStep() { if (currentStep.value === 0 && !validate()) return; if (currentStep.value < steps.length - 1) { if (await saveDraft()) currentStep.value += 1; return } if (nodeTimeError.value) { validationError.value = nodeTimeError.value; return } if (!validate() || saving.value) return; if (await saveDraft()) { savedView.value = true; notice.value = '项目设置已保存' } }
function goBack() { void router.push({ name: 'PerformanceCycles' }) }
onMounted(async () => { document.body.style.overflow = 'hidden'; await loadTemplates(); await loadEvaluatorOptions(); await loadProject(); await loadTemplateWorkflow() })
onBeforeUnmount(() => { document.body.style.overflow = '' })
</script>

<style scoped>
.project-settings-page { position: fixed; inset: 0; z-index: 100; min-width: 1200px; min-height: 0; padding-top: 0; box-sizing: border-box; overflow: auto; background: var(--color-bg-page); color: var(--color-text-primary); }
.project-settings-page :deep(.full-screen-modal-header) { position: sticky; top: 0; }
.project-status-badge { padding: 4px 8px; border-radius: 4px; background: var(--color-bg-card)1e8; color: #ff7d00; font-size: 14px; }
.project-settings-content { display: block; width: var(--performance-form-surface-width); max-width: calc(100% - 2 * var(--performance-form-surface-page-gap)); margin: var(--performance-form-surface-page-gap) auto; padding: 0; box-sizing: border-box; }.project-settings-content :deep(.settings-surface) { display: grid; gap: 16px; padding: 0; background: transparent; box-shadow: none; }.settings-card { width: 100%; box-sizing: border-box; padding: 24px 32px; border-radius: 8px; background: var(--color-bg-card); box-shadow: 0 1px 4px rgba(31,35,41,.05); }.settings-card.flow-card,.settings-card.time-card { padding: 0; background: transparent; box-shadow: none; }.card-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }.card-heading h1 { margin: 0; }.rule-group-heading :deep(.performance-icon-button),.rule-row :deep(.performance-icon-button) { --performance-icon-button-size: 24px; width: 24px; height: 24px; }.settings-card h1,.settings-card h2 { margin: 0 0 10px; font-size: 20px; line-height: 28px; }.settings-card h2 { font-size: 18px; }.hint,.muted { margin: 0 0 18px; color: var(--color-text-secondary); font-size: 14px; line-height: 22px; }.basic-grid,.date-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px 48px; }.basic-grid label,.date-grid label { display: grid; gap: 8px; color: var(--color-text-secondary); font-size: 14px; }.basic-grid label span,.date-grid label span { color: var(--color-text-secondary); }.basic-grid .wide { grid-column: 1 / -1; }.basic-grid input,.basic-grid textarea,.date-grid input,.template-select { box-sizing: border-box; width: 100%; padding: 7px 10px; border: 1px solid var(--color-line-control); border-radius: 6px; color: var(--color-text-primary); background: var(--color-bg-card); font: inherit; }.basic-grid textarea { min-height: 66px; field-sizing: content; resize: none; overflow-y: hidden; }.template-select { height: 36px; }.rule-group { margin-top: 16px; padding: 16px; border-radius: 8px; background: var(--color-bg-page); }.rule-group-heading { display: flex; justify-content: space-between; margin-bottom: 12px; font-weight: 600; }.rule-group-heading button,.rule-row button { border: 0; background: transparent; color: var(--color-text-secondary); cursor: pointer; }.rule-row { display: grid; grid-template-columns: 140px 120px 1fr 32px; gap: 8px; margin-top: 8px; }.rule-row select,.rule-row input { min-width: 0; height: 32px; box-sizing: border-box; padding: 4px 8px; border: 1px solid var(--color-line-control); border-radius: 6px; background: var(--color-bg-card); font: inherit; }.rule-row .condition-values { height: 32px; }.or-divider { margin: 16px -16px 0; padding-top: 12px; border-top: 1px solid #dee0e3; color: var(--color-text-secondary); }.add-group { margin-top: 16px; }.required { color: var(--color-danger); }.error { margin: 12px 0 0; color: var(--color-danger); }.flow-summary { display: grid; gap: 8px; padding: 20px; border: 1px solid #e5e6eb; border-radius: 8px; }.flow-summary span { color: var(--color-text-secondary); }.page-notice { position: fixed; right: 24px; bottom: 24px; z-index: 10; padding: 12px 16px; border: 1px solid #ffccc7; border-radius: 6px; background: var(--color-bg-card)2f0; color: #f54a45; }
</style>
