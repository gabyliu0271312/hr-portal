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
interface ReferenceGroup { id: string; label: string; contents: PerformanceTemplateContent[]; moreLabels: string[] }
const referenceGroups = computed<ReferenceGroup[]>(() => {
  const node = selectedNode.value
  if (!node) return []
  const relations = (node.content || []).filter(content => (content.content_slot || 'fill') === 'reference' || content.type === 'reference')
  return relations.map((relation, index) => {
    const id = relation.content_id || relation.id || `reference-${index}`
    if (relation.reference_kind === 'node' && relation.reference_value) {
      const source = nodes.value.find(item => item.node_id === relation.reference_value && item.node_id !== node.node_id)
      const contents = source ? visibleFillContents(source) : []
      return { id, label: relation.reference_settings?.page_name || source?.name || relation.name || '参考内容', contents, moreLabels: [] }
    }
    const moreLabels = (relation.items || []).map(item => item.label).filter(Boolean)
    return { id, label: relation.name || '更多参考', contents: [], moreLabels }
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

/* ---------- 渲染辅助 ---------- */
function ratingOptions(content: PerformanceTemplateContent) {
  return (content.options || []).map(option => option.label || option.name || option.code || '').filter(Boolean)
}
function visibleItems(content: PerformanceTemplateContent) {
  return (content.items || []).filter(item => item.kind !== 'prompt' && item.settings?.mode !== 'hidden')
}
function promptBannerStyle(content: PerformanceTemplateContent) {
  const color = content.prompt?.color
  return color ? { backgroundColor: color } : undefined
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
            <div v-if="activeReferenceGroup.moreLabels.length" class="ptp-more">
              <span v-for="label in activeReferenceGroup.moreLabels" :key="label" class="ptp-chip">{{ label }}</span>
            </div>
            <div v-for="content in activeReferenceGroup.contents" :key="content.content_id || content.id || content.name" class="ptp-content">
              <div v-if="content.type === 'prompt'" class="ptp-prompt" :style="promptBannerStyle(content)">
                <span class="ptp-prompt__icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" fill="#3370ff"/><path d="M7 6.2v3.6" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/><circle cx="7" cy="4.2" r=".9" fill="#fff"/></svg></span>
                <div>
                  <div class="ptp-prompt__title">{{ content.prompt?.title || content.name }}</div>
                  <div v-if="content.prompt?.content" class="ptp-prompt__desc">{{ content.prompt.content }}</div>
                </div>
              </div>
              <template v-else>
                <div class="ptp-sec-title">{{ content.name }}</div>
                <div v-if="content.description && content.settings?.hideDescription !== true" class="ptp-sec-desc">{{ content.description }}</div>
                <template v-for="item in visibleItems(content)" :key="item.id">
                  <div v-if="content.type === 'rating'" class="ptp-rating-view">
                    <span class="ptp-chip">{{ item.label }}</span>
                  </div>
                  <template v-else>
                    <div class="ptp-block-label">{{ item.label }}</div>
                    <div v-if="item.hint" class="ptp-sec-desc">{{ item.hint }}</div>
                    <div class="ptp-static-box">这里展示用户填写的内容</div>
                  </template>
                </template>
              </template>
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
              <div v-if="content.type === 'prompt'" class="ptp-prompt" :style="promptBannerStyle(content)">
                <span class="ptp-prompt__icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" fill="#3370ff"/><path d="M7 6.2v3.6" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/><circle cx="7" cy="4.2" r=".9" fill="#fff"/></svg></span>
                <div>
                  <div class="ptp-prompt__title">{{ content.prompt?.title || content.name }}</div>
                  <div v-if="content.prompt?.content" class="ptp-prompt__desc">{{ content.prompt.content }}</div>
                </div>
              </div>
              <template v-else>
                <div class="ptp-sec-title">{{ content.name }}</div>
                <div v-if="content.description && content.settings?.hideDescription !== true" class="ptp-sec-desc">{{ content.description }}</div>
                <template v-for="item in visibleItems(content)" :key="item.id">
                  <!-- 评级题：等级胶囊 -->
                  <template v-if="content.type === 'rating' || item.kind === 'rating'">
                    <div class="ptp-block-label" :class="{ 'ptp-block-label--req': item.settings?.required }">{{ item.label }}</div>
                    <div v-if="item.hint" class="ptp-sec-desc">{{ item.hint }}</div>
                    <div v-if="ratingOptions(content).length" class="ptp-pills">
                      <template v-for="(option, index) in ratingOptions(content)" :key="`${item.id}-${index}`">
                        <button type="button" class="ptp-pill">{{ option }}</button>
                        <span v-if="index < ratingOptions(content).length - 1" class="ptp-pill__line" aria-hidden="true"></span>
                      </template>
                    </div>
                    <div v-if="content.type === 'rating'" class="ptp-rating-tip">手动调整的等级不符合计算规则&nbsp;&nbsp;<span class="ptp-rating-tip__link">按规则重新计算</span></div>
                  </template>
                  <!-- 填写题：查看结果为展示灰盒，其余为富文本样例框 -->
                  <template v-else-if="isResultView">
                    <div class="ptp-block-label">{{ item.label }}</div>
                    <div v-if="item.hint" class="ptp-sec-desc">{{ item.hint }}</div>
                    <div class="ptp-static-box">这里展示用户填写的内容</div>
                  </template>
                  <template v-else>
                    <div class="ptp-block-label" :class="{ 'ptp-block-label--req': item.settings?.required }">{{ item.label }}</div>
                    <div v-if="item.hint" class="ptp-sec-desc">{{ item.hint }}</div>
                    <div class="ptp-toolbar" aria-hidden="true"><span class="ptp-toolbar__b">B</span><span class="ptp-toolbar__i">I</span><span class="ptp-toolbar__u">U</span><span class="ptp-toolbar__s">S</span><span>≡</span><span>☰</span><span>🔗</span></div>
                    <div v-if="item.richText" class="ptp-editor ptp-editor--sample">{{ item.richText }}</div>
                    <div v-else class="ptp-editor"><br></div>
                    <div v-if="item.settings?.allowMultiple" class="ptp-add">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M6 1.5v9M1.5 6h9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
                      添加
                    </div>
                  </template>
                </template>
              </template>
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
.ptp-more { margin-bottom: 12px; }
.ptp-chip { display: inline-flex; align-items: center; background: #e1eaff; color: #3370ff; font-size: 12px; font-weight: 500; border-radius: 10px; padding: 2px 10px; line-height: 18px; margin: 0 8px 8px 0; }

/* 内容块 */
.ptp-content { margin-bottom: 8px; }
.ptp-sec-title { font-size: 16px; font-weight: 600; color: #1f2329; line-height: 24px; margin-top: 24px; }
.ptp-sec-title--lead { margin-top: 0; }
.ptp-sec-desc { font-size: 14px; color: #646a73; line-height: 22px; margin-top: 4px; }
.ptp-block-label { font-size: 14px; font-weight: 600; color: #1f2329; line-height: 22px; margin-top: 16px; }
.ptp-block-label--req::after { content: '*'; color: #f54a45; margin-left: 2px; }
.ptp-static-box { background: #f5f6f7; border-radius: 8px; padding: 12px; margin-top: 8px; font-size: 14px; color: #646a73; line-height: 22px; }
.ptp-rating-view { margin-top: 8px; }

/* 提示条 */
.ptp-prompt { background: #e8f3ff; border-radius: 8px; padding: 12px 16px; margin: 16px 0 20px; display: flex; gap: 8px; align-items: flex-start; }
.ptp-prompt__icon { flex: none; margin-top: 2px; display: inline-flex; }
.ptp-prompt__title { font-size: 14px; font-weight: 600; color: #1f2329; line-height: 22px; }
.ptp-prompt__desc { font-size: 12px; color: #646a73; line-height: 20px; margin-top: 2px; }

/* 评级胶囊 */
.ptp-pills { display: flex; align-items: center; margin-top: 12px; flex-wrap: wrap; }
.ptp-pill { width: 52px; height: 28px; border: 1px solid #dee0e3; border-radius: 14px; background: #fff; font-size: 12px; color: #1f2329; display: inline-flex; align-items: center; justify-content: center; flex: none; cursor: pointer; padding: 0; }
.ptp-pill:hover { border-color: #3370ff; color: #3370ff; }
.ptp-pill__line { width: 26px; height: 1px; background: #dee0e3; flex: none; }
.ptp-rating-tip { font-size: 12px; color: #646a73; margin-top: 12px; }
.ptp-rating-tip__link { color: #3370ff; cursor: pointer; }

/* 富文本样例 */
.ptp-toolbar { display: flex; align-items: center; gap: 14px; border: 1px solid #dee0e3; border-bottom: none; border-radius: 6px 6px 0 0; padding: 6px 12px; color: #646a73; margin-top: 8px; }
.ptp-toolbar span { font-size: 13px; line-height: 1; cursor: default; }
.ptp-toolbar__b { font-weight: 700; }
.ptp-toolbar__i { font-style: italic; font-family: Georgia, serif; }
.ptp-toolbar__u { text-decoration: underline; }
.ptp-toolbar__s { text-decoration: line-through; }
.ptp-editor { border: 1px solid #dee0e3; border-radius: 0 0 6px 6px; min-height: 100px; padding: 8px 12px; font-size: 14px; line-height: 22px; color: #8f959e; }
.ptp-editor--sample { color: #1f2329; }
.ptp-add { display: inline-flex; align-items: center; gap: 4px; color: #3370ff; font-size: 14px; margin-top: 12px; cursor: default; }

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
