<script setup lang="ts">
/**
 * 绩效模板编辑向导 · 第 4 步「模板预览」
 *
 * 100% 按 REA 飞书绩效「模板预览」DOM 实测参数还原
 * （specs/002-performance-management/rea-extract/out/domspec、probe-okr*.json）：
 *   三栏：左 320px（padding 20）+ 中/右各 flex:1（1680 视口 → 679.3 / 679.3，分割线位置恒定）
 *   面板：tab 绝对定位 108×30（padding 4/12，bg #eff0f1，radius 0），内容区上留 30
 *        中栏 inner padding 54/20/20，右栏 34/20/20，wrap max-width 1000、滚动条占 8px
 *        单面板（自评 / 查看绩效结果）：内容列固定 800px 居中
 *   页脚：高 63，按钮 80×32；双栏贴面板左缘，单栏随 800 内容列（padding 0 24）
 * 数据源：GET /performance/templates/{id}/workflow（nodes + content_library），切换环节零请求。
 */
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { performanceTemplateApi, type PerformanceTemplateContent, type PerformanceTemplateSection, type PerformanceWorkflowNode } from '@/api/performance'
import PerformanceWorkflowStageIcon from '@/views/performance/PerformanceWorkflowStageIcon.vue'
import PerformanceTemplateRenderer from './PerformanceTemplateRenderer.vue'
import PerformanceReferenceSkeleton from './PerformanceReferenceSkeleton.vue'
import PerformanceOkrPanel from './PerformanceOkrPanel.vue'
import PerformanceReviewer360Preview from './PerformanceReviewer360Preview.vue'
import PerformanceResultReviewer360Block from './PerformanceResultReviewer360Block.vue'
import PerformanceSingleSelectControl from './PerformanceSingleSelectControl.vue'
import PerformancePromptDisplay from './PerformancePromptDisplay.vue'
import { ASSESSMENT_ROLE_CODES, performanceExecutorDisplayLabel } from './performanceExecutorOptions'
import { performanceTemplateInitialAnswers } from './performanceTemplateAnswers'
import { performanceContentKey, contentToSections } from './performanceContentToSections'

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
const isResultReconsideration = computed(() => selectedNode.value?.node_type === 'result_reconsideration')
/* REA 实测：复议处理环节的「是否保持复议前结果」默认为「变更结果」（选中态 #1456f0） */
const keepResultOptions = [
  { id: 'keep', label: '保持原结果' },
  { id: 'change', label: '变更结果' },
]
const keepResultValue = 'change'

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
  /** 引用源是 360°反馈环节：渲染 360°评估详情视图（REA 实测与普通引用不同） */
  isReviewer360?: boolean
}
const referenceGroups = computed<ReferenceGroup[]>(() => {
  const node = selectedNode.value
  if (!node) return []
  const relations = (node.content || []).filter(content => (content.content_slot || 'fill') === 'reference' || content.type === 'reference')
  const groups: ReferenceGroup[] = relations.map((relation, index) => {
    const id = relation.content_id || relation.id || `reference-${index}`
    if (relation.reference_kind === 'node' && relation.reference_value) {
      const source = nodes.value.find(item => item.node_id === relation.reference_value && item.node_id !== node.node_id)
      /* 360°反馈环节 = 流程设置里执行人为「360°评估人」的评估环节：
         参考区对该引用渲染「360°评估详情」视图（REA 实测与普通引用不同） */
      const isReviewer360 = Boolean(source && (source.executor_role_code === ASSESSMENT_ROLE_CODES.REVIEWER_360 || source.executor_label === '360°评估人'))
      /* REA 的参考内容只展示被引用环节的填写项，不包含「说明」块 */
      const contents = source ? visibleFillContents(source).filter(content => content.type !== 'prompt') : []
      return {
        id, kind: 'node' as const, value: relation.reference_value,
        label: relation.reference_settings?.page_name || source?.name || relation.name || '参考内容',
        description: '', contents, isReviewer360,
      }
    }
    return {
      id, kind: 'more' as const, value: relation.reference_value || '',
      label: relation.name || '更多参考', description: relation.description || '', contents: [],
    }
  })
  /* 填写工作总结环节固有展示 OKR（REA 实测该环节中栏只有 OKR 一个页签）：
     即使内容设置未配置参考内容，模板预览（与前端一致）也展示 OKR 骨架。 */
  if (node.node_type === 'work_summary' && !groups.some(group => group.kind === 'more' && group.value === 'okr')) {
    groups.unshift({ id: 'builtin-okr', kind: 'more', value: 'okr', label: 'OKR', description: '', contents: [] })
  }
  return groups
})
const showReferencePanel = computed(() => !isResultView.value && referenceGroups.value.length > 0)
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

/* ---------- 查看绩效结果：360°反馈区块（REA 实测：单面板内独立区块） ---------- */
/** result_view 环节的 360°反馈引用（reference 区域，源执行人为 360°评估人） */
const resultReviewer360Groups = computed(() => {
  const node = selectedNode.value
  if (!node || !isResultView.value) return []
  return referenceGroups.value.filter(group => group.isReviewer360)
})

/* ---------- 配置填写内容：作答草稿（纯前端预览动作，不落库） ---------- */
/**
 * 阶段 2 起，右栏不再复刻只读 DOM，而是把内容投影成填写页的 sections，
 * 交给 PerformanceTemplateRenderer(mode="edit") 渲染：
 * 富文本是真编辑器（可聚焦、可输入、工具栏可用），「添加」真实增行并带序号与删除图标。
 * 这与飞书「预览与填写共用渲染器，只禁用提交」的架构一致。
 */
const previewAnswers = reactive<Record<string, Record<string, unknown>>>({})
function contentKeyOf(content: PerformanceTemplateContent) {
  return performanceContentKey(content)
}
/** 仅「配置填写内容」可操作：查看结果 / 校准 / 邀请 / 复议为只读或专用表单 */
function canEditContent(content: PerformanceTemplateContent) {
  return !isResultView.value && !isCalibration.value && !isInvite.value && !isResultReconsideration.value && content.type !== 'prompt'
}
const editableSections = computed<Record<string, PerformanceTemplateSection[]>>(() => {
  const result: Record<string, PerformanceTemplateSection[]> = {}
  for (const content of rightContents.value) {
    if (!canEditContent(content)) continue
    result[contentKeyOf(content)] = contentToSections(selectedNode.value, [content])
  }
  return result
})
function sectionsFor(content: PerformanceTemplateContent) { return editableSections.value[contentKeyOf(content)] || [] }
function answersFor(content: PerformanceTemplateContent) { return previewAnswers[contentKeyOf(content)] || {} }
function setPreviewAnswer(content: PerformanceTemplateContent, fieldId: string, value: unknown) {
  const key = contentKeyOf(content)
  if (!previewAnswers[key]) previewAnswers[key] = {}
  previewAnswers[key][fieldId] = value
}
/** 切换环节时重置草稿：实例数与默认值按该环节自己的内容设置重新开始 */
watch(selectedId, () => {
  Object.keys(previewAnswers).forEach(key => { delete previewAnswers[key] })
  Object.entries(editableSections.value).forEach(([key, sections]) => {
    previewAnswers[key] = performanceTemplateInitialAnswers(sections, {})
  })
})

/* ---------- 只读场景（参考内容 / 查看结果 / 校准）也走统一渲染链路 ---------- */
/** 每个内容块的只读 sections（字段 readonly、无 required），按渲染上下文一次性投影 */
const readonlySections = computed<Record<string, PerformanceTemplateSection[]>>(() => {
  const result: Record<string, PerformanceTemplateSection[]> = {}
  /* 右栏：查看结果 / 校准（供调整内容）按整环节只读投影 */
  for (const content of rightContents.value) {
    if (canEditContent(content)) continue
    result[contentKeyOf(content)] = contentToSections(selectedNode.value, [content], { readonly: true })
  }
  /* 中栏：参考内容（查看态）同样只读投影 */
  for (const group of referenceGroups.value) {
    for (const content of group.contents) {
      const key = contentKeyOf(content)
      if (!(key in result)) result[key] = contentToSections(selectedNode.value, [content], { readonly: true })
    }
  }
  return result
})
function readonlySectionsFor(content: PerformanceTemplateContent) { return readonlySections.value[contentKeyOf(content)] || [] }

/* ---------- 渲染辅助 ---------- */
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
      <!-- 左栏 评估流程：320 / padding 20 / 卡 280×64.3 / 间距 12 -->
      <aside class="ptp-left">
        <div class="ptp-left__head">
          <span class="ptp-left__title">评估流程</span>
          <!-- REA 预览态：该按钮盒子 64×26、文字左内缩 4、颜色 #1f2329，整块 invisible 占位 -->
          <button type="button" class="ptp-left__all" tabindex="-1" aria-hidden="true">全部内容</button>
        </div>
        <div class="ptp-stage-list" role="listbox" aria-label="评估流程环节">
          <div v-for="node in nodes" :key="node.node_id || node.name" class="ptp-stage">
            <!-- REA 侧卡片是 div（不是 button）：点击不取焦点，列表也因此不会因 focus 自动滚动 -->
            <div
              role="option" :aria-selected="node.node_id === selectedId"
              class="ptp-stage-card" :class="{ 'ptp-stage-card--active': node.node_id === selectedId }"
              @click="selectStage(node.node_id || node.name)"
            >
              <span class="ptp-stage-card__top">
                <span class="ptp-stage-card__icon" aria-hidden="true"><PerformanceWorkflowStageIcon :type="node.node_type" /></span>
                <span class="ptp-stage-card__name">{{ node.name }}</span>
              </span>
              <span class="ptp-stage-card__executor">执行人：{{ performanceExecutorDisplayLabel(node) }}</span>
            </div>
          </div>
        </div>
      </aside>
      <div class="ptp-divider" aria-hidden="true"></div>

      <div class="ptp-panels">
        <!-- 中栏 配置参考内容 -->
        <section v-if="showReferencePanel" class="ptp-panel" aria-label="配置参考内容">
          <div class="ptp-tab">配置参考内容</div>
          <div class="ptp-scroll">
            <div class="ptp-scroll__wrap">
              <div class="ptp-body ptp-body--reference">
                <div class="ptp-user">
                  <span class="ptp-user__avatar" aria-hidden="true">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8.4" r="3.9" fill="#fff"/><path d="M4.6 20.4c1.2-4.1 4.1-6.1 7.4-6.1s6.2 2 7.4 6.1" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>
                  </span>
                  <span class="ptp-user__name">被评估人</span>
                </div>

                <div class="ptp-ref-tabs" role="tablist" aria-label="参考内容">
                  <button
                    v-for="(group, index) in referenceGroups" :key="group.id"
                    type="button" role="tab" :aria-selected="index === activeReferenceTab"
                    class="ptp-ref-tab" :class="{ 'ptp-ref-tab--active': index === activeReferenceTab }"
                    @click="selectReferenceTab(index)"
                  >{{ group.label }}</button>
                </div>

                <div class="ptp-pane">
                  <template v-if="activeReferenceGroup">
                    <!-- 360°反馈：引用源执行人为「360°评估人」的评估环节 → 360°评估详情视图（REA 实测） -->
                    <PerformanceReviewer360Preview
                      v-if="activeReferenceGroup.isReviewer360"
                      :relation-label="activeReferenceGroup.label"
                    />
                    <!-- OKR：内置引用，模板预览阶段渲染骨架；数据字段结构与填写页一致 -->
                    <PerformanceOkrPanel
                      v-else-if="activeReferenceGroup.kind === 'more' && activeReferenceGroup.value === 'okr'"
                      placeholder
                    />
                    <!-- 更多参考 / 团队统计：内置骨架 -->
                    <PerformanceReferenceSkeleton
                      v-else-if="activeReferenceGroup.kind === 'more'"
                      :kind="activeReferenceGroup.value"
                      :label="activeReferenceGroup.label"
                      :description="activeReferenceGroup.description"
                    />
                    <div
                      v-for="content in activeReferenceGroup.contents"
                      v-else :key="content.content_id || content.id || content.name"
                      class="ptp-block"
                    >
                      <div v-if="content.type !== 'prompt'" class="ptp-block__header">
                        <div class="ptp-block__title">{{ content.name }}</div>
                        <div v-if="contentDescription(content)" class="ptp-block__desc">{{ contentDescription(content) }}</div>
                      </div>
                      <!-- REA 中栏参考内容为只读结果态：走统一渲染链路（mode=readonly），
                           富文本/评级/标签按只读答案渲染，值与 REA 一样是「这里展示用户填写的内容」 -->
                      <PerformanceTemplateRenderer
                        v-if="content.type !== 'prompt'"
                        mode="readonly"
                        :show-header="false"
                        :sections="readonlySectionsFor(content)"
                        :answers="{ }"
                      />
                      <PerformancePromptDisplay
                        v-else-if="content.prompt"
                        :value="content.prompt"
                        class="content-renderer-prompt"
                      />
                    </div>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- 中/右分割线：REA 是右栏外层 1px border-left，位置恒在 x=1000、撑满整列高度，
             与左栏分割线同为 #dee0e3 实线；用独立元素实现，避免随内容高度/滚动条漂移 -->
        <div v-if="showReferencePanel" class="ptp-divider" aria-hidden="true"></div>

        <!-- 右栏 配置填写内容 / 查看内容 / 调整内容 -->
        <section
          class="ptp-panel"
          :class="{ 'ptp-panel--single': isSinglePanel, 'ptp-panel--result': isResultView, 'ptp-panel--with-footer': showFooter }"
          :aria-label="rightTabLabel"
        >
          <div class="ptp-tab">{{ rightTabLabel }}</div>
          <div class="ptp-scroll">
            <div class="ptp-scroll__wrap">
              <div class="ptp-body" :class="{ 'ptp-body--fill': !isSinglePanel, 'ptp-body--result': isResultView }">
                <!-- 360°邀请环节：邀请表单（REA 实测：标题 58 / 引导 21 / 说明 2 行 / 搜索 32 / 单选 32 / 表格 52×4） -->
                <template v-if="isInvite">
                  <div class="ptp-page-title">{{ rightTitle }}</div>
                  <div class="ptp-invite-lead">通过「搜索」添加 360° 评估人</div>
                  <div class="ptp-invite-desc">已邀请 0 人，除系统默认邀请外，仍需邀请至少 5 人。上级和 HRBP 也可以给员工邀请 360° 评估人。</div>
                  <div class="ptp-search"><span class="ptp-search__placeholder">搜索成员</span></div>
                  <div class="ptp-invite-count">已邀请列表：当前共 0 人</div>
                  <div class="ptp-invite-tabs">
                    <span class="ptp-invite-tab ptp-invite-tab--active">按关系</span>
                    <span class="ptp-invite-tab">按邀请人</span>
                  </div>
                  <div class="ptp-invite-table">
                    <div v-for="relation in ['相同上级同事', '不同上级同事', '虚线上级', '直属下级']" :key="relation" class="ptp-invite-row">
                      <span class="ptp-invite-row__label">{{ relation }}</span>
                      <span class="ptp-invite-row__cell"></span>
                    </div>
                  </div>
                </template>

                <!-- 查看结果 / 校准 / 通用填写 -->
                <template v-else>
                  <!-- REA：内容为空时只渲染空态，不渲染页标题 -->
                  <div v-if="rightContents.length || isResultView" class="ptp-page-title">{{ isResultView ? '绩效结果' : rightTitle }}</div>

                  <!-- 结果复议处理：复议理由（分节标题 + 灰底只读引用）+ 是否保持复议前结果（单选组） -->
                  <div v-if="isResultReconsideration" class="ptp-recon">
                    <div class="ptp-recon__head">复议理由</div>
                    <div class="ptp-recon__value">这里展示被评估人发起复议时填写的内容</div>
                    <div class="ptp-recon__label">是否保持复议前结果</div>
                    <PerformanceSingleSelectControl class="ptp-recon__radios" :model-value="keepResultValue" :options="keepResultOptions" aria-label="是否保持复议前结果" />
                  </div>
                  <div v-if="isResultReconsideration" class="ptp-result-group__title">绩效结果</div>

                  <div v-if="!rightContents.length" class="ptp-empty">
                    <span class="ptp-empty__image" aria-hidden="true">
                      <svg width="120" height="120" viewBox="0 0 120 120" fill="none"><rect x="18" y="26" width="84" height="68" rx="8" fill="#f2f3f5"/><rect x="30" y="42" width="46" height="6" rx="3" fill="#e0e2e6"/><rect x="30" y="56" width="60" height="6" rx="3" fill="#e9ebee"/><rect x="30" y="70" width="36" height="6" rx="3" fill="#e9ebee"/><circle cx="94" cy="94" r="16" fill="#eff0f1"/><path d="M88 94l4 4 8-8" stroke="#c9cdd4" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </span>
                    <div class="ptp-empty__desc">暂未配置供参考内容</div>
                  </div>

                  <div v-else class="ptp-blocks" :class="{ 'ptp-blocks--group': isResultReconsideration }">
                    <div v-for="content in rightContents" :key="content.content_id || content.id || content.name" class="ptp-block">
                      <div v-if="content.type !== 'prompt'" class="ptp-block__header">
                        <div class="ptp-block__title">{{ content.name }}</div>
                        <div v-if="contentDescription(content)" class="ptp-block__desc">{{ contentDescription(content) }}</div>
                      </div>
                      <!-- 配置填写内容：直接复用真实填写页的渲染器——富文本是真编辑器、评级/单选/标签是
                           真实控件、「添加」真实增行（带序号与删除图标）。内容设置里的 mode/required/
                           allowMultiple 已经过解析层投影成 sections 的 readonly/required/allow_multiple。 -->
                      <PerformanceTemplateRenderer
                        v-if="canEditContent(content)"
                        mode="edit"
                        editable
                        :show-header="false"
                        placeholder-fallback=""
                        :sections="sectionsFor(content)"
                        :answers="answersFor(content)"
                        @update-answer="(fieldId, value) => setPreviewAnswer(content, fieldId, value)"
                      />
                      <!-- 查看结果 / 校准（供调整）/ 复议后的绩效结果：同一渲染链路的只读态（mode=readonly） -->
                      <PerformanceTemplateRenderer
                        v-else-if="content.type !== 'prompt'"
                        mode="readonly"
                        :show-header="false"
                        :sections="readonlySectionsFor(content)"
                        :answers="{ }"
                      />
                      <!-- 说明块（prompt）：说明展示，不占填写位 -->
                      <PerformancePromptDisplay
                        v-else-if="content.prompt"
                        :value="content.prompt"
                        class="content-renderer-prompt"
                      />
                    </div>
                  </div>

                  <!-- 查看绩效结果：360°反馈区块（REA 实测：绩效结果内容后独立区块，标题+展开详情+时间戳+展开条目） -->
                  <div v-if="isResultView && resultReviewer360Groups.length" class="ptp-result-360">
                    <PerformanceResultReviewer360Block
                      v-for="group in resultReviewer360Groups"
                      :key="group.id"
                      :title="group.label"
                    />
                  </div>
                </template>
              </div>
            </div>
          </div>

          <div v-if="showFooter" class="ptp-footer">
            <div class="ptp-footer__inner">
              <button type="button" class="ptp-btn ptp-btn--disabled" disabled>提交</button>
              <button type="button" class="ptp-btn ptp-btn--cancel" disabled>取消</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 基础：REA 正文 14/21，主文字 #1f2329；字体栈与数字等宽特性取自 REA 实测
   （font-family: LarkHackSafariFont…；font-feature-settings: "tnum"），
   不继承则所有文本宽度、标签宽度、按钮宽度都会与 REA 产生 3~5px 偏差。 */
.ptp {
  /* 父容器可能是 flex 行（向导第 4 步的 .full-screen-modal-content）：显式占满宽度，
     避免按 max-content 撑出横向滚动条，进而让三栏宽度与 REA 不一致 */
  width: 100%; height: 100%; min-height: 0; display: flex; flex-direction: column; overflow: hidden;
  font-family: LarkHackSafariFont, LarkEmojiFont, LarkChineseQuote, -apple-system, BlinkMacSystemFont,
    'Helvetica Neue', Tahoma, 'PingFang SC', 'Microsoft Yahei', Arial, 'Hiragino Sans GB', sans-serif,
    'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji';
  font-feature-settings: 'tnum';
  font-variant-numeric: tabular-nums;
  font-size: 14px; line-height: 21px; color: #1f2329;
  /* REA 全站边框实测 0.666667px（2/3 设计刻度），用变量统一，保证卡片高度 64.33 而非 65 */
  --ptp-bw: .666667px;
}
.ptp-loading { padding: 48px 0; text-align: center; color: #646a73; font-size: 14px; }
.ptp-loading--error { color: #f54a45; }

.ptp-layout { flex: 1; min-height: 0; display: flex; overflow: hidden; }

/* ---------- 左栏：外框 321 = 内容 280 + padding 20×2 + 右侧 1px 分割线 ---------- */
.ptp-left { width: 320px; flex: none; box-sizing: border-box; padding: 20px; display: flex; flex-direction: column; overflow: hidden; }
.ptp-divider { width: 1px; flex: none; background: #dee0e3; }
.ptp-left__head { display: flex; align-items: center; height: 26px; flex: none; }
.ptp-left__title { flex: 1; min-width: 0; font-size: 14px; font-weight: 600; line-height: 21px; color: #1f2329; }
/* REA 模板预览态该按钮为 invisible（占位不可见）：盒 64×26、文字 x=240（左内缩 4）、色 #1f2329 */
.ptp-left__all { display: inline-flex; align-items: center; justify-content: flex-start; width: 64px; height: 26px; padding: 0 4px; box-sizing: border-box; border: 0; background: none; font-family: inherit; font-size: 14px; line-height: 22px; color: #1f2329; visibility: hidden; }
.ptp-stage-list { flex: 1; min-height: 0; margin-top: 8px; overflow-y: auto; display: flex; flex-direction: column; }
.ptp-stage-list::-webkit-scrollbar { width: 8px; }
.ptp-stage-list::-webkit-scrollbar-thumb { background: #d3d6d9; border-radius: 3px; }
.ptp-stage { flex: none; padding-bottom: 12px; }
.ptp-stage-card { display: block; width: 100%; box-sizing: border-box; padding: 12px 16px; border: var(--ptp-bw) solid #dee0e3; border-radius: 8px; background: #fff; text-align: left; cursor: pointer; transition: background-color .15s; font-family: inherit; }
.ptp-stage-card:hover { background: #f5f6f7; }
.ptp-stage-card--active, .ptp-stage-card--active:hover { border-color: #3370ff; background: #fff; }
.ptp-stage-card__top { display: flex; align-items: center; height: 21px; }
.ptp-stage-card__icon { width: 18px; flex: none; margin-right: 8px; display: flex; align-items: center; justify-content: center; color: #646a73; }
.ptp-stage-card--active .ptp-stage-card__icon { color: #3370ff; }
.ptp-stage-card__name { flex: 1; min-width: 0; font-size: 14px; font-weight: 400; line-height: 21px; color: #1f2329; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; white-space: normal; }
.ptp-stage-card--active .ptp-stage-card__name { color: #3370ff; font-weight: 600; }
.ptp-stage-card__executor { display: flex; align-items: center; font-size: 12px; line-height: 18px; color: #646a73; }
.ptp-stage-card__executor::before { content: ''; width: 26px; flex: none; }

/* ---------- 中/右面板：REA 321 w1359 = 679 + 1（分割线）+ 679，与视口高度无关 ----------
   两栏等分且各占 (1359-1)/2 = 679 整像素；高度由 .ptp-layout 决定，面板不参与撑高，
   因此切换环节 / 切换页签时两条分割线位置与长度都恒定不变。 */
.ptp-panels { flex: 1; min-width: 0; min-height: 0; display: flex; overflow: hidden; background: #fff; }
.ptp-panel { flex: 1 1 0; min-width: 0; min-height: 0; position: relative; display: flex; flex-direction: column; overflow: hidden; background: #fff; }
/* REA 右栏内容列高 886（底部留 8），页脚位于 879~942 */
.ptp-panel--with-footer { padding-bottom: 8px; box-sizing: border-box; }
/* 面板标签：绝对定位 108×30，padding 4/12，无圆角（实测 radius 0） */
.ptp-tab { position: absolute; left: 0; top: 0; z-index: 2; display: inline-flex; align-items: center; height: 30px; padding: 4px 12px; box-sizing: border-box; background: #eff0f1; font-size: 14px; line-height: 22px; color: #1f2329; }

/* 滚动区：上留 30（标签高度）；wrap max-width 1000；滚动条固定占 8px（实测 679.3 → 671.3） */
.ptp-scroll { flex: 1; min-height: 0; padding-top: 30px; overflow-y: auto; scrollbar-gutter: stable; }
.ptp-scroll::-webkit-scrollbar { width: 8px; }
.ptp-scroll::-webkit-scrollbar-thumb { background: #d3d6d9; border-radius: 3px; }
.ptp-scroll__wrap { width: 100%; max-width: 1000px; margin: 0 auto; }
.ptp-body { box-sizing: border-box; }

/* 中栏正文：padding 54/20/20 → 内容起点 y=140 */
.ptp-body--reference { padding: 54px 20px 20px; }
/* 双栏右栏：padding 34/20/20 → 标题起点 y=120 */
.ptp-body--fill { padding: 34px 20px 20px; }
/* 单面板：内容列固定 800 居中，内部 20 padding（实测 inner-scroll 800 / 文案 760） */
.ptp-panel--single .ptp-body { width: 800px; max-width: calc(100% - 40px); margin: 0 auto; padding: 34px 20px 20px; }
/* 查看结果：整栏浅底 + 800 白卡（py-14 px-10） */
.ptp-panel--result, .ptp-panel--result .ptp-scroll { background: #f8f9fa; }
.ptp-panel--result .ptp-body { width: 800px; max-width: calc(100% - 40px); margin: 0 auto; padding: 28px 20px; background: #fff; }

/* 页脚：高 63；双栏按钮贴面板左缘；单栏随 800 内容列（padding 0 24） */
.ptp-footer { flex: none; height: 63px; display: flex; align-items: center; background: #fff; }
.ptp-footer__inner { display: flex; align-items: center; gap: 12px; width: 100%; max-width: 1000px; }
.ptp-panel--single .ptp-footer__inner { width: 800px; max-width: 100%; margin: 0 auto; padding: 0 24px; box-sizing: border-box; }
.ptp-btn { width: 80px; height: 32px; padding: 4px 11px; box-sizing: border-box; border: var(--ptp-bw) solid transparent; border-radius: 6px; font-family: inherit; font-size: 14px; line-height: 22px; display: inline-flex; align-items: center; justify-content: center; cursor: default; }
.ptp-btn--disabled { background: #bbbfc4; border-color: #bbbfc4; color: #fff; }
.ptp-btn--cancel { background: #fff; border-color: #d0d3d4; color: #bbbfc4; }

/* ---------- 被评估人：头像 40（mt 4）、姓名 16/22 600 #1d252f、行高 49.5、下距 20 ---------- */
.ptp-user { display: flex; align-items: flex-start; width: 100%; min-height: 50px; margin-bottom: 20px; overflow: hidden; }
.ptp-user__avatar { width: 40px; height: 40px; margin-top: 4px; flex: none; border-radius: 50%; background: #3370ff; display: inline-flex; align-items: center; justify-content: center; }
.ptp-user__name { margin-left: 12px; margin-right: 4px; max-width: fit-content; font-size: 16px; font-weight: 600; line-height: 22px; color: #1d252f; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ---------- 参考页签：条高 48、文字 16/24、右间距 28、选中 6px 指示条（bottom -3） ---------- */
.ptp-ref-tabs { display: flex; align-items: center; height: 48px; margin: 0 -20px; padding: 0 28px; box-sizing: border-box; background: #fff; overflow-x: auto; overflow-y: hidden; }
.ptp-ref-tabs::-webkit-scrollbar { height: 0; }
.ptp-ref-tab { position: relative; flex: none; margin-right: 28px; padding: 12px 0; border: 0; background: none; font-family: inherit; font-size: 16px; font-weight: 400; line-height: 24px; color: #1f2329; white-space: nowrap; cursor: pointer; }
.ptp-ref-tab:last-child { margin-right: 0; }
.ptp-ref-tab--active { font-weight: 600; color: #3370ff; }
.ptp-ref-tab--active::after { content: ''; position: absolute; left: 0; right: 0; bottom: -3px; height: 6px; border-radius: 3px; background: #3370ff; }
.ptp-pane { padding-top: 20px; }

/* ---------- 内容块：标题 16/24 600 + 描述 14/22 #646a73（无间隙），块间距 32 ---------- */
.ptp-page-title { padding: 16px 0 12px; font-size: 20px; font-weight: 600; line-height: 30px; color: #1f2329; }
.ptp-blocks { margin-top: 16px; }
/* 查看结果：REA 页标题与首个内容块之间无 16 间距（标题文字 y=133、综合评级 y=174） */
.ptp-body--result .ptp-blocks { margin-top: 0; }
/* 结果复议处理：组标题自身带 20 间距（REA mb-10=20），块列表紧随其后 */
.ptp-blocks--group { margin-top: 20px; }

/* ---------- 结果复议处理：复议理由（16/24 600 + 2×16 蓝条）+ 灰底只读引用 + 单选组 ----------
   实测：标题盒 24 高、下方 16 到灰框；灰框 631×53 = padding 16/20 + 21、radius 4、bg #f8f9fa、下距 28；
   单选标签 14/22 600、下距 8；单选行 22 高、选项间距 24。 */
.ptp-recon__head { position: relative; padding-left: 10px; font-size: 16px; font-weight: 600; line-height: 24px; color: #1f2329; }
.ptp-recon__head::before { content: ''; position: absolute; left: 0; top: 4px; width: 2px; height: 16px; background: #3370ff; }
.ptp-recon__value { margin-top: 16px; margin-bottom: 28px; padding: 16px 20px; border-radius: 4px; background: #f8f9fa; font-size: 14px; line-height: 21px; color: #1f2329; white-space: pre-wrap; overflow-wrap: anywhere; }
.ptp-recon__label { margin-bottom: 8px; font-size: 14px; font-weight: 600; line-height: 22px; color: #1f2329; }
.ptp-result-group__title { margin-top: 20px; font-size: 16px; font-weight: 600; line-height: 24px; color: #1f2329; }
.ptp-block { margin-bottom: 32px; }
.ptp-block:last-child { margin-bottom: 0; }
/* 查看绩效结果：360°反馈区块紧随绩效结果内容，间距与内容块一致（REA mb-8=16 距上一块，块间 32） */
.ptp-result-360 { margin-top: 16px; }
.ptp-result-360 :deep(.pr360-block) { margin-bottom: 32px; }
.ptp-result-360 :deep(.pr360-block:last-child) { margin-bottom: 0; }
.ptp-block__add { margin-top: 4px; }
/* 「添加」按 REA 实测：图标 14 与文字间距 4，字形走预览字体栈（默认 --font-sans 会高 2px） */
/* 「添加」按 REA 实测：图标 14 与文字间距 4、左内缩 4；块级化避免行盒多出 1px 基线空隙 */
.ptp :deep(.performance-add-another-button.performance-add-another-button) { display: flex; gap: 4px; padding-left: 4px; font-family: inherit; line-height: 22px; }
.ptp-block__header { margin-bottom: 16px; }
.ptp-block__title { font-size: 16px; font-weight: 600; line-height: 24px; color: #1f2329; }
.ptp-block__desc { font-size: 14px; font-weight: 400; line-height: 22px; color: #646a73; white-space: pre-wrap; overflow-wrap: anywhere; }
/* 预览内真实填写渲染器：取消自身水平 padding（REA 实测块标题/描述/字段左缘完全一致 x=1021），
   左缘统一由 .ptp-body--fill 的 padding 20 提供；垂直间距由 .ptp-block__header margin 与字段 margin 控制 */
.ptp :deep(.performance-template-renderer--edit),
.ptp :deep(.performance-template-renderer--readonly) { padding: 0; border-radius: 0; background: transparent; }
.ptp :deep(.performance-template-renderer--edit) .template-content-prompt { margin: 16px 0; }
/* 字段容器左缘与块标题一致（渲染器无缩进），字段间距 16（REA mb-8） */
.ptp :deep(.performance-template-field) { margin-bottom: 16px; }
.ptp :deep(.performance-template-field:last-child) { margin-bottom: 0; }
/* 预览态内容项无编辑态内边距（REA 只读渲染：字段名与块标题同左缘，不预留拖拽把手位） */
.ptp :deep(.content-renderer-item--configured) { padding: 0; border-width: 0; }
/* 预览是只读预览态：REA 不渲染必填星号 */
.ptp :deep(.performance-assessment-rich-text-field__label i),
.ptp :deep(.performance-item-title em),
.ptp :deep(.content-renderer-rating__header > i) { display: none; }
/* 同一内容块内的多个填写项之间间距 16（REA 字段容器 mb-8=16） */
.ptp :deep(.content-renderer-item + .content-renderer-item) { margin-top: 16px; }
/* 字段名沿用预览字体栈（performance-item-title 默认走 --font-sans，会与 REA 字体度量差 2px） */
.ptp :deep(.performance-item-title) { font-family: inherit; }

/* ---------- 说明（prompt）：REA 预览用 ud__notice 规格 ----------
   容器 631×66 = padding 9/16 + 标题 22 + 4 + 正文 22；radius 6、bg #f0f4ff；
   标题 14/22 600、正文 14/22，均 #1f2329；图标 16 与正文间距 8。 */
.ptp :deep(.performance-prompt-display) { align-items: flex-start; padding: 9px 16px; border-radius: 6px; }
.ptp :deep(.performance-prompt-display__icon) { flex: 0 0 16px; margin: 3px 8px 0 0; }
.ptp :deep(.performance-prompt-display__title) { margin: 0 0 4px; font-family: inherit; font-size: 14px; font-weight: 600; line-height: 22px; color: #1f2329; }
.ptp :deep(.performance-prompt-display__content) { font-family: inherit; font-size: 14px; font-weight: 400; line-height: 22px; color: #1f2329; }

/* ---------- 富文本填写项：REA 预览为真实编辑器外壳（工具栏 36 + 内容 100 + 边框） ----------
   实测：盒 144 高、字段名与盒间距 8、工具栏内缩 4/4 且图标步距 32、内容区 100 高且左内缩 8。 */
.ptp :deep(.performance-assessment-rich-text-field__label) { margin-bottom: 8px; }
.ptp :deep(.performance-rich-text-box) { min-height: var(--content-editor-height, 144px); }
.ptp :deep(.performance-rich-text-box__content) { min-height: calc(var(--content-editor-height, 144px) - 44px); }
.ptp :deep(.next-remix-rich-text-editor-content) { min-height: calc(var(--content-editor-height, 144px) - 44px); }
.ptp :deep(.rich-input) { min-height: calc(var(--content-editor-height, 144px) - 44px); padding: 6px 8px; }
.ptp :deep(.content-renderer-editor__body) { min-height: 0; padding: 6px 8px; color: #1f2329; }
.ptp :deep(.performance-rich-toolbar) { gap: 8px; padding: 4px 4px; }
/* 评级项：REA 字段名行（22）与档位行间距 8（mb-4），默认 12 会多出 4px */
.ptp :deep(.content-renderer-rating__body) { margin-top: 8px; }
/* REA 档位行高 38（胶囊 32 + 上 4 下 2），默认 4/4 会多出 2px 并把后续内容整体下推 */
.ptp :deep(.performance-rating-control__labels) { padding: 4px 0 2px; }

/* ---------- 空态：mt 240，图 120 + 文案 14/22（间距 16） ---------- */
.ptp-empty { margin-top: 240px; display: flex; flex-direction: column; align-items: center; }
.ptp-empty__image { display: block; width: 120px; height: 120px; }
.ptp-empty__desc { margin-top: 16px; font-size: 14px; line-height: 22px; color: #646a73; text-align: center; }

/* ---------- 360° 邀请：按 REA 实测（引导 21 / 说明 21×2 / 搜索 32 / 单选 32 / 表格 52×4） ---------- */
.ptp-invite-lead { margin-top: 16px; font-size: 14px; font-weight: 600; line-height: 21px; color: #1f2329; }
.ptp-invite-desc { font-size: 14px; line-height: 21px; color: #646a73; }
.ptp-search { margin-top: 8px; height: 32px; padding: 0 12px; box-sizing: border-box; border: 1px solid #d0d3d4; border-radius: 6px; display: flex; align-items: center; }
.ptp-search__placeholder { font-size: 14px; line-height: 21px; color: #8f959e; }
.ptp-invite-count { margin-top: 20px; font-size: 14px; font-weight: 600; line-height: 21px; color: #1f2329; }
.ptp-invite-tabs { display: flex; margin-top: 8px; }
.ptp-invite-tab { height: 32px; padding: 0 16px; box-sizing: border-box; border: 1px solid #d0d3d4; background: #fff; display: inline-flex; align-items: center; font-size: 14px; line-height: 22px; font-weight: 400; color: #1f2329; }
.ptp-invite-tab:first-child { border-radius: 6px 0 0 6px; }
.ptp-invite-tab:last-child { border-radius: 0 6px 6px 0; border-left: 0; }
.ptp-invite-tab--active { font-weight: 500; color: #1456f0; }
.ptp-invite-table { margin-top: 12px; border: 1px solid #d0d3d4; border-radius: 6px; overflow: hidden; }
.ptp-invite-row { display: flex; height: 52px; box-sizing: border-box; align-items: stretch; }
.ptp-invite-row + .ptp-invite-row { box-shadow: inset 0 1px 0 #eff0f1; }
.ptp-invite-row__label { width: 109px; flex: none; padding: 0 12px; box-sizing: border-box; background: #f5f6f7; display: flex; align-items: center; font-size: 14px; line-height: 21px; color: #646a73; }
.ptp-invite-row__cell { flex: 1; min-width: 0; }
</style>
