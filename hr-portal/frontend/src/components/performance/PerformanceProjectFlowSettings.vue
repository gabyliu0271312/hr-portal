<template>
  <div class="project-flow-settings" aria-label="流程设置">
    <div v-if="loading" class="flow-state" role="status">正在加载流程设置...</div>
    <div v-else-if="error" class="flow-state flow-state--error" role="alert">{{ error }}</div>
    <div v-else-if="!nodes.length" class="flow-state">当前绩效模板暂无流程环节</div>
    <article v-for="node in nodes" v-else :key="node.node_id || `${node.node_type}-${node.order}`" class="flow-node-card">
      <header class="flow-node-header">
        <span class="flow-node-icon" aria-hidden="true"><PerformanceWorkflowStageIcon :type="node.node_type" /></span>
        <div class="flow-node-heading">
          <h2>{{ node.name }}</h2>
          <p v-if="descriptionFor(node)">{{ descriptionFor(node) }}</p>
        </div>
      </header>

      <section v-if="node.node_type === 'reviewer_360_invite'" class="node-settings invite-settings" aria-label="360°评估人设置">
        <div class="settings-heading">
          <div><h3>360°评估人设置</h3><p>该配置对所有 360° 相关环节生效</p></div>
          <button class="outline-button" type="button" @click="inviteEdit[nodeKey(node)] = !inviteEdit[nodeKey(node)]">{{ inviteEdit[nodeKey(node)] ? '完成' : '设置' }}</button>
        </div>
        <div class="invite-grid">
          <div class="invite-column">
            <label class="field-label" for="default-invite">默认邀请</label>
            <template v-if="inviteEdit[nodeKey(node)]">
              <select id="default-invite" :value="inviteSettings(node).default_invite" class="field-control" @change="setInviteDefault(node, $event)">
                <option value="DIRECT_SUBORDINATES">直属下级</option>
                <option value="NONE">暂不配置</option>
              </select>
            </template>
            <strong v-else>{{ inviteLabel(inviteSettings(node).default_invite) }}</strong>
            <label class="field-label invite-count-label" :for="`invite-count-${nodeKey(node)}`">邀请人数设置</label>
            <div v-if="inviteEdit[nodeKey(node)]" class="number-field"><span>最少邀请人数：</span><input :id="`invite-count-${nodeKey(node)}`" :value="inviteSettings(node).minimum_invited_count" type="number" min="0" max="100" @input="setMinimumInviteCount(node, $event)" /></div>
            <p v-else class="setting-value">最少邀请人数：{{ inviteSettings(node).minimum_invited_count }}</p>
            <label v-if="inviteEdit[nodeKey(node)]" class="check-line"><PerformanceCheckbox :model-value="inviteSettings(node).exclude_default_invite_from_limit" label="“直属下级”不计入邀请人数限制" @update:model-value="inviteSettings(node).exclude_default_invite_from_limit = $event" /></label>
            <p v-else class="setting-value">{{ inviteSettings(node).exclude_default_invite_from_limit ? '“直属下级”不计入邀请人数限制' : '“直属下级”计入邀请人数限制' }}</p>
          </div>
          <div class="invite-column">
            <label class="field-label">推荐邀请</label>
            <PerformanceMultiSelect v-if="inviteEdit[nodeKey(node)]" :model-value="inviteSettings(node).recommended_invite" :options="peopleOptions" placeholder="暂未配置" @update:model-value="inviteSettings(node).recommended_invite = $event" />
            <strong v-else>{{ inviteSettings(node).recommended_invite.length ? inviteSettings(node).recommended_invite.join('、') : '暂未配置' }}</strong>
            <label class="field-label invite-count-label">允许自愿评估</label>
            <PerformanceSwitch v-if="inviteEdit[nodeKey(node)]" :model-value="inviteSettings(node).allow_voluntary_evaluation" aria-label="允许自愿评估" @update:model-value="inviteSettings(node).allow_voluntary_evaluation = $event" />
            <p v-else class="setting-value">{{ inviteSettings(node).allow_voluntary_evaluation ? '允许' : '不允许' }}</p>
          </div>
        </div>
      </section>

      <section v-else-if="node.node_type === 'calibration'" class="node-settings calibration-settings" aria-label="校准规则设置">
        <div class="calibration-switch-row"><div><strong>绩效结果强制 / 建议分布</strong><p>开启后，可以选择一个评估项，针对评估项的等级设置强制分布和建议分布规则</p></div><PerformanceSwitch :model-value="calibrationSettings(node).force_distribution_enabled" aria-label="绩效结果强制建议分布" @update:model-value="calibrationSettings(node).force_distribution_enabled = $event" /></div>
        <div class="settings-heading calibration-heading"><div><h3>校准规则设置 <span class="required-mark">*</span><span class="info-mark" aria-label="校准规则说明">i</span></h3></div></div>
        <div class="calibration-summary"><span class="info-circle">i</span><span>当前共 {{ evaluatedCount }} 个被评估人，{{ assignedCount(node) }} 人已分配校准，{{ Math.max(0, evaluatedCount - assignedCount(node)) }} 人未分配校准人。</span><button type="button" class="link-button">查看校准详情</button></div>
        <div v-for="(phase, phaseIndex) in calibrationSettings(node).phases" :key="phaseIndex" class="calibration-phase">
          <div class="phase-heading"><div class="phase-title">第 {{ phaseIndex + 1 }} 阶段</div><PerformanceIconButton icon="DeleteTrashOutlined" :label="`删除第 ${phaseIndex + 1} 阶段`" :disabled="calibrationSettings(node).phases.length <= 1" @click="removePhase(node, phaseIndex)" /></div>
          <div class="rule-table">
            <div class="rule-table-header"><span>校准人</span><span>校准范围</span><span>是否允许授权他人</span><span>操作</span></div>
            <div v-for="(rule, ruleIndex) in phase.rules" :key="ruleIndex" class="rule-row">
              <template v-if="isEditingRule(node, phaseIndex, ruleIndex)">
                <select v-model="rule.subject_type" aria-label="校准人类型"><option value="PERSON">人员</option></select>
                <div class="scope-editor"><select v-model="rule.operator" aria-label="校准范围操作"><option value="INCLUDE">包含</option><option value="EXCLUDE">不包含</option></select><select v-model="rule.scope" aria-label="校准范围"><option value="PROJECT_ALL">项目全员</option></select></div>
              </template>
              <template v-else>
                <span class="rule-person"><span class="rule-tag">{{ subjectLabel(rule.subject_type) }}</span><span>{{ rule.operator === 'INCLUDE' ? '包含...' : '不包含...' }}</span></span>
                <span class="rule-scope-tag">{{ scopeLabel(rule.scope) }}</span>
              </template>
              <PerformanceCheckbox :model-value="rule.allow_authorize" label="" @update:model-value="rule.allow_authorize = $event" />
              <span class="rule-actions"><button type="button" class="text-button" @click="toggleRuleEdit(node, phaseIndex, ruleIndex)">编辑</button><button type="button" class="text-button" @click="removeRule(node, phaseIndex, ruleIndex)">删除</button></span>
            </div>
            <button type="button" class="link-button add-rule" @click="addRule(node, phaseIndex)">＋ 添加校准规则</button>
          </div>
        </div>
        <button type="button" class="link-button add-phase" @click="addPhase(node)">＋ 添加校准阶段</button>
      </section>

      <section v-else-if="node.node_type === 'result_view'" class="node-settings result-view-settings" aria-label="绩效结果查看设置">
        <h3>结果开通方式 <span class="required-mark">*</span></h3>
        <PerformanceCheckbox :model-value="resultViewSettings(node).opening_mode === 'AUTOMATIC'" label="按流程自动开通" @update:model-value="setOpeningMode(node, 'AUTOMATIC', $event)" />
        <PerformanceCheckbox :model-value="resultViewSettings(node).opening_mode === 'MANUAL'" label="手动开通" @update:model-value="setOpeningMode(node, 'MANUAL', $event)" />
        <p class="setting-help">指定角色可以手动为被评估人开通绩效结果，不论被评估人的评估流程是否结束。有开通权限的角色以权限管理模块配置为准</p>
      </section>

      <section v-else-if="node.node_type === 'result_reconsideration'" class="node-settings reconsideration-settings" aria-label="结果复议处理设置">
        <h3>无法找到复议处理人时，由以下人员处理</h3>
        <select :value="reconsiderationSettings(node).handler" class="field-control" aria-label="结果复议处理人" @change="setReconsiderationHandler(node, $event)">
          <option :value="null">请选择</option>
          <option v-for="option in handlerOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </section>
    </article>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PerformanceProjectFlowSettings, PerformanceWorkflowNode } from '@/api/performance'
import PerformanceCheckbox from '@/components/performance/PerformanceCheckbox.vue'
import PerformanceIconButton from '@/components/performance/PerformanceIconButton.vue'
import PerformanceMultiSelect from '@/components/performance/PerformanceMultiSelect.vue'
import PerformanceSwitch from '@/components/performance/PerformanceSwitch.vue'
import PerformanceWorkflowStageIcon from '@/views/performance/PerformanceWorkflowStageIcon.vue'

type PeopleOption = { value: string; label: string }

const props = withDefaults(defineProps<{
  nodes: PerformanceWorkflowNode[]
  modelValue?: PerformanceProjectFlowSettings
  peopleOptions?: PeopleOption[]
  evaluatedCount?: number
  loading?: boolean
  error?: string
}>(), { modelValue: () => ({ node_settings: {}, node_times: {} }), peopleOptions: () => [], evaluatedCount: 0, loading: false, error: '' })
const emit = defineEmits<{ 'update:modelValue': [value: PerformanceProjectFlowSettings] }>()

const draft = ref<PerformanceProjectFlowSettings>(cloneSettings(props.modelValue))
const lastEmitted = ref(JSON.stringify(draft.value))
const editingRules = ref<Record<string, boolean>>({})
const inviteEdit = ref<Record<string, boolean>>({})
const descriptions: Record<string, string> = {
  reviewer_360_invite: '「360°评估人设置」在首个 360° 环节设置，对所有 360° 环节生效',
  reviewer_360_confirm: '「360°评估人设置」在首个 360° 环节设置，对所有 360° 环节生效',
  evaluation: '「360°评估人设置」在首个 360° 环节设置，对所有 360° 环节生效',
  calibration: '校准人可按校准范围查看和修改最终绩效结果（不受汇报线限制）',
}
const handlerOptions = computed(() => [{ value: 'HRBP', label: 'HRBP' }, ...props.peopleOptions])
const peopleOptions = computed(() => props.peopleOptions)

function cloneSettings(value?: PerformanceProjectFlowSettings): PerformanceProjectFlowSettings {
  return JSON.parse(JSON.stringify(value || { node_settings: {}, node_times: {} }))
}
function nodeKey(node: PerformanceWorkflowNode) { return node.node_id || `${node.node_type}-${node.order}` }
function defaultFor(node: PerformanceWorkflowNode) {
  if (node.node_type === 'reviewer_360_invite') return { invite: { default_invite: 'DIRECT_SUBORDINATES' as const, minimum_invited_count: 5, exclude_default_invite_from_limit: true, recommended_invite: [], allow_voluntary_evaluation: false } }
  if (node.node_type === 'calibration') return { calibration: { force_distribution_enabled: false, phases: [{ rules: [{ subject_type: 'PERSON' as const, operator: 'INCLUDE' as const, scope: 'PROJECT_ALL' as const, allow_authorize: false }] }] } }
  if (node.node_type === 'result_view') return { result_view: { opening_mode: 'MANUAL' as const } }
  if (node.node_type === 'result_reconsideration') return { result_reconsideration: { handler: null } }
  return {}
}
function ensureNode(node: PerformanceWorkflowNode) {
  const key = nodeKey(node)
  const defaults = defaultFor(node) as typeof draft.value.node_settings[string]
  if (!draft.value.node_settings[key]) draft.value.node_settings[key] = defaults
  const settings = draft.value.node_settings[key]
  if (node.node_type === 'reviewer_360_invite' && !settings.invite) settings.invite = defaults.invite
  if (node.node_type === 'result_view' && !settings.result_view) settings.result_view = defaults.result_view
  if (node.node_type === 'result_reconsideration' && !settings.result_reconsideration) settings.result_reconsideration = defaults.result_reconsideration
  if (node.node_type === 'calibration') {
    const calibration = settings.calibration || defaults.calibration!
    if (!settings.calibration) settings.calibration = calibration
    if (!calibration.phases?.length) calibration.phases = defaults.calibration!.phases
    calibration.phases.forEach(phase => { if (!phase.rules?.length) phase.rules = [{ subject_type: 'PERSON', operator: 'INCLUDE', scope: 'PROJECT_ALL', allow_authorize: false }] })
  }
}
function ensureAllNodes() { props.nodes.forEach(ensureNode) }
function inviteSettings(node: PerformanceWorkflowNode) { ensureNode(node); return draft.value.node_settings[nodeKey(node)].invite! }
function calibrationSettings(node: PerformanceWorkflowNode) { ensureNode(node); return draft.value.node_settings[nodeKey(node)].calibration! }
function resultViewSettings(node: PerformanceWorkflowNode) { ensureNode(node); return draft.value.node_settings[nodeKey(node)].result_view! }
function reconsiderationSettings(node: PerformanceWorkflowNode) { ensureNode(node); return draft.value.node_settings[nodeKey(node)].result_reconsideration! }
function descriptionFor(node: PerformanceWorkflowNode) { return node.description || descriptions[node.node_type] || '' }
function inviteLabel(value: string) { return value === 'DIRECT_SUBORDINATES' ? '直属下级' : '暂未配置' }
function subjectLabel(value: string) { return value === 'PERSON' ? '人员' : value }
function scopeLabel(value: string) { return value === 'PROJECT_ALL' ? '项目全员' : value }
function ruleKey(node: PerformanceWorkflowNode, phaseIndex: number, ruleIndex: number) { return `${nodeKey(node)}:${phaseIndex}:${ruleIndex}` }
function isEditingRule(node: PerformanceWorkflowNode, phaseIndex: number, ruleIndex: number) { return editingRules.value[ruleKey(node, phaseIndex, ruleIndex)] === true }
function toggleRuleEdit(node: PerformanceWorkflowNode, phaseIndex: number, ruleIndex: number) { const key = ruleKey(node, phaseIndex, ruleIndex); editingRules.value[key] = !editingRules.value[key] }
function setInviteDefault(node: PerformanceWorkflowNode, event: Event) { inviteSettings(node).default_invite = (event.target as HTMLSelectElement).value as 'DIRECT_SUBORDINATES' | 'NONE' }
function setMinimumInviteCount(node: PerformanceWorkflowNode, event: Event) { inviteSettings(node).minimum_invited_count = Number((event.target as HTMLInputElement).value) }
function assignedCount(node: PerformanceWorkflowNode) { return calibrationSettings(node).phases.reduce((sum, phase) => sum + phase.rules.length, 0) ? props.evaluatedCount : 0 }
function addRule(node: PerformanceWorkflowNode, phaseIndex: number) { calibrationSettings(node).phases[phaseIndex].rules.push({ subject_type: 'PERSON', operator: 'INCLUDE', scope: 'PROJECT_ALL', allow_authorize: false }) }
function removeRule(node: PerformanceWorkflowNode, phaseIndex: number, ruleIndex: number) { const rules = calibrationSettings(node).phases[phaseIndex].rules; if (rules.length > 1) rules.splice(ruleIndex, 1) }
function removePhase(node: PerformanceWorkflowNode, phaseIndex: number) { const phases = calibrationSettings(node).phases; if (phases.length > 1) phases.splice(phaseIndex, 1) }
function addPhase(node: PerformanceWorkflowNode) { calibrationSettings(node).phases.push({ rules: [{ subject_type: 'PERSON', operator: 'INCLUDE', scope: 'PROJECT_ALL', allow_authorize: false }] }) }
function setReconsiderationHandler(node: PerformanceWorkflowNode, event: Event) { reconsiderationSettings(node).handler = (event.target as HTMLSelectElement).value || null }
function setOpeningMode(node: PerformanceWorkflowNode, mode: 'AUTOMATIC' | 'MANUAL', enabled: boolean) { if (enabled) resultViewSettings(node).opening_mode = mode }
watch(() => props.modelValue, value => { const next = JSON.stringify(value || { node_settings: {}, node_times: {} }); if (next !== lastEmitted.value) { draft.value = cloneSettings(value); ensureAllNodes(); lastEmitted.value = JSON.stringify(draft.value) } }, { deep: true })
watch(() => props.nodes, ensureAllNodes, { deep: true, immediate: true })
watch(draft, value => { const next = JSON.stringify(value); if (next === lastEmitted.value) return; lastEmitted.value = next; emit('update:modelValue', cloneSettings(value)) }, { deep: true })
</script>

<style scoped>
.project-flow-settings{display:grid;width:100%;gap:16px}.flow-state{padding:32px;color:#646a73;text-align:center}.flow-state--error{color:#f04438}.flow-node-card{width:100%;box-sizing:border-box;padding:24px 32px;border-radius:8px;background:#fff;box-shadow:0 1px 4px rgba(31,35,41,.05)}.flow-node-header{display:flex;align-items:flex-start;gap:12px}.flow-node-icon{display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:8px;background:#f5f6f7;color:#3370ff}.flow-node-icon :deep(.stage-icon){width:24px;height:24px}.flow-node-heading{min-width:0;padding-top:3px}.flow-node-heading h2{margin:0;color:#1f2329;font-size:16px;line-height:24px}.flow-node-heading p{margin:4px 0 0;color:#646a73;font-size:14px;line-height:22px}.node-settings{margin:20px 0 0 52px}.settings-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}.settings-heading h3,.node-settings h3{margin:0;color:#1f2329;font-size:14px;line-height:22px}.settings-heading p,.calibration-switch-row p,.setting-help{margin:4px 0 0;color:#646a73;font-size:14px;line-height:22px}.outline-button{height:32px;padding:4px 20px;border:1px solid #d0d3d6;border-radius:6px;background:#fff;color:#1f2329;font:inherit;cursor:pointer}.invite-grid{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:16px;padding:16px;border-radius:8px;background:#f5f6f7}.invite-column{min-width:0}.field-label{display:block;margin:0 0 8px;color:#646a73;font-size:14px;line-height:22px}.invite-count-label{margin-top:18px}.field-control{width:100%;height:32px;padding:4px 10px;border:1px solid #d0d3d6;border-radius:6px;background:#fff;color:#1f2329;font:inherit}.setting-value{margin:0;color:#1f2329;font-size:14px;line-height:22px}.number-field{display:flex;align-items:center;gap:8px;color:#646a73;font-size:14px;line-height:32px}.number-field input{width:72px;height:32px;padding:4px 8px;box-sizing:border-box;border:1px solid #d0d3d6;border-radius:6px;background:#fff;font:inherit}.check-line{display:block;margin-top:8px}.calibration-switch-row{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}.calibration-switch-row strong{font-size:14px;line-height:22px}.calibration-heading{margin-top:20px}.required-mark{color:#f04438}.info-mark,.info-circle{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:#3370ff;color:#fff;font-size:11px;font-style:normal}.info-mark{margin-left:4px}.calibration-summary{display:flex;align-items:center;gap:8px;margin-top:12px;padding:12px 16px;border-radius:6px;background:#f0f4ff;color:#1f2329;font-size:14px;line-height:22px}.calibration-summary .link-button{margin-left:auto}.link-button,.text-button{padding:0;border:0;background:transparent;color:#3370ff;font:inherit;cursor:pointer}.calibration-phase{margin-top:20px}.phase-heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}.phase-heading :deep(.performance-icon-button){--performance-icon-button-size:24px;width:24px;height:24px}.phase-title{color:#1f2329;font-size:14px;line-height:22px}.rule-table{padding:0 16px;border-radius:8px;background:#f5f6f7}.rule-table-header{display:grid;grid-template-columns:140px minmax(180px,1fr) 140px 72px;align-items:center;gap:8px;min-height:47px;border-bottom:1px solid #dee0e3;color:#646a73;font-size:14px;line-height:22px}.rule-row{display:grid;grid-template-columns:140px minmax(180px,1fr) 140px 72px;align-items:center;gap:8px;min-height:52px;border-bottom:1px solid #dee0e3}.rule-row select{height:32px;padding:4px 8px;border:1px solid #d0d3d6;border-radius:6px;background:#fff;font:inherit}.scope-editor{display:grid;grid-template-columns:120px minmax(120px,1fr);gap:8px}.rule-person{display:flex;align-items:center;gap:8px;min-width:0}.rule-tag,.rule-scope-tag{display:inline-flex;align-items:center;min-height:24px;padding:1px 6px;border-radius:4px;background:#e5e6e8;color:#1f2329;white-space:nowrap}.rule-person>span:last-child{overflow:hidden;color:#1f2329;text-overflow:ellipsis;white-space:nowrap}.rule-scope-tag{width:max-content}.rule-actions{display:flex;gap:8px;white-space:nowrap}.text-button{padding:0;border:0;background:transparent;color:#3370ff;font:inherit;cursor:pointer}.add-rule{display:block;margin-top:12px}.add-phase{margin-top:12px}.result-view-settings h3{margin-bottom:12px}.result-view-settings :deep(.performance-checkbox){margin:8px 0}.setting-help{max-width:720px}.reconsideration-settings{max-width:520px}.reconsideration-settings h3{margin-bottom:12px}
@media (max-width:800px){.flow-node-card{padding:20px}.node-settings{margin-left:0}.invite-grid{grid-template-columns:1fr}.rule-row{grid-template-columns:1fr 1fr;}.rule-delegation{display:none}}
</style>
