<script setup lang="ts">
/**
 * 绩效模板编辑向导 · 第 4 步「模板预览」
 * 按 REA 飞书绩效「模板预览」页像素规格还原（rea-extract/replica/index.html）：
 * 左栏评估流程 + 中栏配置参考内容 + 右栏配置填写内容（只读渲染，切换环节零请求）。
 * 数据源：GET /performance/templates/{id}/workflow（nodes + content_library）。
 */
import { computed, onMounted, ref } from 'vue'
import { performanceTemplateApi, type PerformanceTemplateContent, type PerformanceWorkflowNode } from '@/api/performance'
import PerformanceWorkflowStageIcon from '@/views/performance/PerformanceWorkflowStageIcon.vue'
import PerformanceAssessmentPreviewHeader from './PerformanceAssessmentPreviewHeader.vue'
import PerformanceContentRenderer from './PerformanceContentRenderer.vue'
import PerformanceReferenceSkeleton from './PerformanceReferenceSkeleton.vue'

const props = defineProps<{ templateId?: number | null }>()

const loading = ref(false)
const loadError = ref('')
const nodes = ref<PerformanceWorkflowNode[]>([])
const selectedId = ref<string | null>(null)
const activeReferenceTab = ref(0)

onMounted(load)

async function load() {
  if (!props.templateId) return
  loading.value = true
  loadError.value = ''
  try {
    const data = await performanceTemplateApi.getWorkflow(props.templateId)
    nodes.value = data.nodes || []
    selectedId.value = nodes.value[0]?.node_id || null
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '加载模板数据失败'
  } finally {
    loading.value = false
  }
}

/* ---------- 环节（左栏） ---------- */
const selectedNode = computed(() => nodes.value.find(node => node.node_id === selectedId.value) || null)
const isResultView = computed(() => selectedNode.value?.node_type === 'result_view')
const isCalibration = computed(() => selectedNode.value?.node_type === 'calibration')
const isInvite = computed(() => selectedNode.value?.node_type === 'reviewer_360_invite')

function slotContents(node: PerformanceWorkflowNode | null, slot: 'fill' | 'reference' | 'adjustment' | 'view') {
  if (!node) return []
  return (node.content || []).filter(content => (content.content_slot || 'fill') === slot && content.type !== 'reference')
}
/** 填写内容：prompt 保留，其余需至少一个未隐藏条目（与内容设置口径一致） */
function visibleFillContents(node: PerformanceWorkflowNode | null) {
  return slotContents(node, 'fill').filter(content =>
    content.type === 'prompt' || (content.items || []).some(item => item.kind !== 'prompt' && item.settings?.mode !== 'hidden'),
  )
}

/* ---------- 参考内容（中栏） ---------- */
interface ReferenceGroup {
  id: string
  label: string
  /** node=引用其他环节内容；more=内容设置「更多参考内容」里的内置引用（OKR / 更多参考 / 团队统计） */
  kind: 'node' | 'more'
  /** kind='more' 时的引用值：okr / more_reference / team_stats */
  value: string
  description: string
  contents: PerformanceTemplateContent[]
}
const referenceGroups = computed<ReferenceGroup[]>(() => {
  const node = selectedNode.value
  if (!node) return []
  const relations = (node.content || []).filter(content => (content.content_slot || 'fill') === 'reference' || content.type === 'reference')
  return relations.map((relation, index) => {
    const id = relation.content_id || relation.id || `reference-${index}`
    if (relation.reference_kind === 'node' && relation.reference_value) {
      const source = nodes.value.find(item => item.node_id === relation.reference_value && item.node_id !== node.node_id)
      const contents = source ? visibleFillContents(source) : []
      return {
        id, kind: 'node' as const, value: relation.reference_value,
        label: relation.reference_settings?.page_name || source?.name || relation.name || '参考内容',
        description: '', contents,
      }
    }
    return {
      id, kind: 'more' as const, value: relation.reference_value || '',
      label: relation.name || '更多参考', description: relation.description || '', contents: [],
    }
  })
})
const showReferencePanel = computed(() => !isResultView.value && !isInvite.value && referenceGroups.value.length > 0)
const activeReferenceGroup = computed(() => referenceGroups.value[activeReferenceTab.value] || null)

function selectStage(id: string) {
  selectedId.value = id
  activeReferenceTab.value = 0
}
function selectReferenceTab(index: number) { activeReferenceTab.value = index }

/* ---------- 右栏填写内容 ---------- */
const finalNode = computed(() => {
  const list = nodes.value.filter(node => node.include_final_result)
  return list.length === 1 ? list[0] : null
})
const rightContents = computed<PerformanceTemplateContent[]>(() => {
  const node = selectedNode.value
  if (!node) return []
  if (isCalibration.value) {
    const adjustment = slotContents(node, 'adjustment')
    if (adjustment.length) return adjustment
    return visibleFillContents(finalNode.value)
  }
  if (isResultView.value) {
    const view = slotContents(node, 'view')
    return view.length ? view : visibleFillContents(node)
  }
  return visibleFillContents(node)
})
const rightTabLabel = computed(() => {
  if (isResultView.value) return '配置查看内容'
  if (isCalibration.value) return '配置供调整内容'
  return '配置填写内容'
})
const rightTitle = computed(() => selectedNode.value?.content_page_name || selectedNode.value?.name || '')
const showFooter = computed(() => !isResultView.value)
const isSinglePanel = computed(() => !showReferencePanel.value)

/* ---------- 渲染辅助 ----------
 * 内容块复用内容设置的渲染链路（PerformanceAssessmentPreviewHeader + PerformanceContentRenderer），
 * 与 REA「预览 = 内容设置的只读镜像」架构一致；条目 mode/required/hideName 等设置直接透传。 */
type PreviewItemSettings = Record<string, { mode: 'fill' | 'hidden' | 'view'; required: boolean; hideName?: boolean; allowView?: boolean }>
function itemSettingsFor(content: PerformanceTemplateContent, forceView = false): PreviewItemSettings {
  const result: PreviewItemSettings = {}
  for (const item of content.items || []) {
    if (item.kind === 'prompt') continue
    const settings = item.settings || {}
    result[item.id] = {
      mode: forceView ? 'view' : (settings.mode === 'hidden' || settings.mode === 'view' ? settings.mode : 'fill'),
      required: settings.required === true,
      hideName: settings.hideName || undefined,
      allowView: settings.allowView,
    }
  }
  return result
}
function contentDescription(content: PerformanceTemplateContent) {
  return content.settings?.hideDescription ? '' : content.description
}
</script>

<template>
  <div class="ptp" aria-label="模板预览">
    <div v-if="loading" class="ptp-loading">加载模板数据中…</div>
    <div v-else-if="loadError" class="ptp-loading ptp-loading--error">{{ loadError }}</div>
    <div v-else-if="!nodes.length" class="ptp-loading">暂无流程节点，请先完成流程设置。</div>

    <div v-else class="ptp-layout">
      <!-- 左栏 评估流程 -->
      <aside class="ptp-left">
        <div class="ptp-left__head">
          <span class="ptp-left__title">评估流程</span>
          <span class="ptp-left__all">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M4 2L1.5 4.5 4 7M1.5 4.5H8M8 5l2.5 2.5L8 10m2.5-2.5H4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            全部内容
          </span>
        </div>
        <div class="ptp-stage-list" role="listbox" aria-label="评估流程环节">
          <button
            v-for="node in nodes" :key="node.node_id || node.name"
            type="button" role="option" :aria-selected="node.node_id === selectedId"
            class="ptp-stage-card" :class="{ 'ptp-stage-card--active': node.node_id === selectedId }"
            @click="selectStage(node.node_id || node.name)"
          >
            <span class="ptp-stage-card__top">
              <span class="ptp-stage-card__icon" aria-hidden="true"><PerformanceWorkflowStageIcon :type="node.node_type" /></span>
              <span class="ptp-stage-card__name">{{ node.name }}</span>
            </span>
            <span class="ptp-stage-card__executor">执行人：{{ node.executor_label || '未配置' }}</span>
          </button>
        </div>
      </aside>

      <!-- 中栏 配置参考内容 -->
      <section v-if="showReferencePanel" class="ptp-panel" aria-label="配置参考内容">
        <div class="ptp-tab">配置参考内容</div>
        <div class="ptp-body">
          <div class="ptp-user">
            <span class="ptp-user__avatar" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="6" r="3" fill="#fff"/><path d="M3 15.5c.9-3 3.2-4.5 6-4.5s5.1 1.5 6 4.5" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>
            </span>
            <span class="ptp-user__name">被评估人</span>
          </div>
          <div class="ptp-ref-tabs">
            <button
              v-for="(group, index) in referenceGroups" :key="group.id"
              type="button" class="ptp-ref-tab" :class="{ 'ptp-ref-tab--active': index === activeReferenceTab }"
              @click="selectReferenceTab(index)"
            >{{ group.label }}</button>
          </div>
          <template v-if="activeReferenceGroup">
            <!-- 内置引用（OKR / 更多参考 / 团队统计）：无内容条目，渲染内置骨架 -->
            <PerformanceReferenceSkeleton
              v-if="activeReferenceGroup.kind === 'more'"
              :kind="activeReferenceGroup.value"
              :label="activeReferenceGroup.label"
              :description="activeReferenceGroup.description"
            />
            <div v-for="content in activeReferenceGroup.contents" v-else :key="content.content_id || content.id || content.name" class="ptp-content">
              <PerformanceAssessmentPreviewHeader
                v-if="content.type !== 'prompt'"
                :name="content.name"
                :description="contentDescription(content)"
                description-class="ptp-sec-desc"
              />
              <PerformanceContentRenderer
                :content="content"
                variant="configured-card"
                :item-settings="itemSettingsFor(content)"
              />
            </div>
          </template>
        </div>
      </section>

      <!-- 右栏 配置填写内容 / 查看内容 / 调整内容 -->
      <section class="ptp-panel" :class="{ 'ptp-panel--single': isSinglePanel }" :aria-label="rightTabLabel">
        <div class="ptp-tab">{{ rightTabLabel }}</div>
        <div class="ptp-body">
          <!-- 360°邀请环节：邀请表单 -->
          <template v-if="isInvite">
            <div class="ptp-sec-title">{{ rightTitle }}</div>
            <div class="ptp-invite-lead">通过<span class="ptp-invite-lead__em">「搜索」</span>添加 360° 评估人</div>
            <div class="ptp-sec-desc">已邀请 0 人，除系统默认邀请外，仍需邀请至少 5 人。上级和 HRBP 也可以给员工邀请 360° 评估人。</div>
            <div class="ptp-search">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><circle cx="5" cy="5" r="3.5" stroke="#8f959e" stroke-width="1.2"/><path d="M8 8l2.5 2.5" stroke="#8f959e" stroke-width="1.2" stroke-linecap="round"/></svg>
              搜索成员
            </div>
            <div class="ptp-invite-count">已邀请列表：当前共 0 人</div>
            <div class="ptp-invite-tabs">
              <span class="ptp-invite-tab ptp-invite-tab--active">按关系</span>
              <span class="ptp-invite-tab">按邀请人</span>
            </div>
            <div class="ptp-invite-list">
              <div v-for="relation in ['相同上级同事', '不同上级同事', '虚线上级', '直属下级']" :key="relation" class="ptp-invite-row">
                <span class="ptp-invite-row__label">{{ relation }}</span>
              </div>
            </div>
          </template>

          <!-- 查看结果 / 校准 / 通用填写 -->
          <template v-else>
            <div v-if="rightTitle && !isResultView" class="ptp-sec-title ptp-sec-title--lead">{{ rightTitle }}</div>
            <div v-if="isResultView" class="ptp-sec-title ptp-sec-title--lead">绩效结果</div>

            <div v-if="!rightContents.length" class="ptp-empty">暂未配置供参考内容</div>

            <div v-for="content in rightContents" :key="content.content_id || content.id || content.name" class="ptp-content">
              <PerformanceAssessmentPreviewHeader
                v-if="content.type !== 'prompt'"
                :name="content.name"
                :description="contentDescription(content)"
                description-class="ptp-sec-desc"
              />
              <PerformanceContentRenderer
                :content="content"
                variant="configured-card"
                :item-settings="itemSettingsFor(content, isResultView)"
              />
            </div>
          </template>
        </div>
        <div v-if="showFooter" class="ptp-footer">
          <button type="button" class="ptp-btn ptp-btn--disabled" disabled>提交</button>
          <button type="button" class="ptp-btn ptp-btn--cancel" disabled>取消</button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.ptp { height: 100%; min-height: 0; display: flex; flex-direction: column; }
.ptp-loading { padding: 48px 0; text-align: center; color: #646a73; font-size: 14px; }
.ptp-loading--error { color: #f54a45; }

.ptp-layout { flex: 1; min-height: 0; display: flex; }

/* 左栏：宽 320 / 内边距 20 / 环节卡（实测 REA 规格） */
.ptp-left { width: 320px; flex: none; padding: 20px; border-right: 1px solid #dee0e3; display: flex; flex-direction: column; overflow: hidden; }
.ptp-left__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; flex: none; }
.ptp-left__title { font-size: 14px; font-weight: 600; color: #1f2329; }
.ptp-left__all { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: #3370ff; }
.ptp-stage-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-bottom: 20px; }
.ptp-stage-card { display: block; width: 100%; text-align: left; background: #fff; border: 1px solid #dee0e3; border-radius: 8px; padding: 10px 12px; cursor: pointer; flex: none; transition: background-color 0.15s; }
.ptp-stage-card:hover { background: #f5f6f7; }
.ptp-stage-card--active { border: 1.5px solid #3370ff; padding: 9.5px 11.5px; }
.ptp-stage-card__top { display: flex; align-items: center; gap: 8px; color: #646a73; }
.ptp-stage-card--active .ptp-stage-card__top { color: #3370ff; }
.ptp-stage-card__icon { display: inline-flex; flex: none; }
.ptp-stage-card__name { font-size: 14px; line-height: 21px; color: #1f2329; }
.ptp-stage-card--active .ptp-stage-card__name { color: #3370ff; font-weight: 600; }
.ptp-stage-card__executor { display: block; font-size: 12px; line-height: 18px; color: #646a73; margin-top: 2px; padding-left: 26px; }

/* 面板 */
.ptp-panels { flex: 1; display: flex; min-width: 0; }
.ptp-panel { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
.ptp-panel + .ptp-panel { border-left: 1px solid #dee0e3; }
.ptp-panel--single { flex: 1.6; }
.ptp-tab { flex: none; align-self: flex-start; display: inline-flex; align-items: center; height: 30px; padding: 0 16px; background: #eff0f1; font-size: 14px; color: #1f2329; border-radius: 0 6px 0 0; }
.ptp-body { flex: 1; overflow-y: auto; padding: 24px 20px 20px; }
.ptp-footer { flex: none; height: 56px; display: flex; align-items: center; justify-content: center; gap: 12px; }
.ptp-btn { width: 80px; height: 32px; border-radius: 6px; font-size: 14px; display: inline-flex; align-items: center; justify-content: center; border: none; cursor: default; }
.ptp-btn--disabled { background: #bbbfc4; color: #fff; }
.ptp-btn--cancel { background: #fff; border: 1px solid #dee0e3; color: #1f2329; }

/* 中栏 */
.ptp-user { display: flex; align-items: center; gap: 10px; background: #f5f6f7; border-radius: 8px; padding: 9px 12px; margin-bottom: 20px; }
.ptp-user__avatar { width: 32px; height: 32px; border-radius: 50%; background: #3370ff; display: inline-flex; align-items: center; justify-content: center; flex: none; }
.ptp-user__name { font-size: 14px; font-weight: 500; color: #1f2329; }
.ptp-ref-tabs { display: flex; gap: 24px; border-bottom: 1px solid #eff0f1; margin-bottom: 20px; }
.ptp-ref-tab { border: none; background: none; padding: 8px 2px; font-size: 14px; color: #646a73; cursor: pointer; position: relative; white-space: nowrap; }
.ptp-ref-tab--active { color: #3370ff; font-weight: 500; }
.ptp-ref-tab--active::after { content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; background: #3370ff; border-radius: 1px; }

/* 内容块（块内渲染复用 PerformanceContentRenderer / PerformanceAssessmentPreviewHeader） */
.ptp-content { margin-bottom: 8px; }
.ptp-sec-title { font-size: 16px; font-weight: 600; color: #1f2329; line-height: 24px; margin-top: 24px; }
.ptp-sec-title--lead { margin-top: 0; }
.ptp-sec-desc { font-size: 14px; color: #646a73; line-height: 22px; margin-top: 4px; }

/* 邀请表单 */
.ptp-invite-lead { font-size: 14px; font-weight: 600; color: #1f2329; margin-top: 16px; }
.ptp-invite-lead__em { color: #3370ff; }
.ptp-search { margin-top: 12px; height: 32px; border: 1px solid #dee0e3; border-radius: 6px; display: flex; align-items: center; padding: 0 12px; color: #8f959e; font-size: 14px; gap: 6px; }
.ptp-invite-count { font-size: 14px; font-weight: 600; color: #1f2329; margin-top: 16px; }
.ptp-invite-tabs { display: flex; gap: 8px; margin-top: 8px; }
.ptp-invite-tab { height: 24px; padding: 0 10px; font-size: 12px; border-radius: 4px; color: #646a73; background: #f5f6f7; display: inline-flex; align-items: center; }
.ptp-invite-tab--active { color: #3370ff; background: #e1eaff; }
.ptp-invite-list { border: 1px solid #dee0e3; border-radius: 6px; margin-top: 12px; overflow: hidden; }
.ptp-invite-row { height: 34px; display: flex; align-items: center; font-size: 12px; color: #646a73; border-bottom: 1px solid #eff0f1; }
.ptp-invite-row:last-child { border-bottom: none; }
.ptp-invite-row__label { width: 110px; flex: none; padding: 0 12px; border-right: 1px solid #eff0f1; height: 100%; display: flex; align-items: center; background: #fafbfc; }

.ptp-empty { font-size: 14px; color: #646a73; text-align: center; padding: 60px 0; }
</style>
