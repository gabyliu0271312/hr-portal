<template>
  <div class="content-settings-page">
    <aside class="stage-panel" aria-label="按评估流程配置">
      <div class="stage-panel__header">
        <strong>按评估流程配置</strong>
        <button class="all-content-button" type="button" aria-label="全部内容"><span aria-hidden="true">▱</span>全部内容</button>
      </div>
      <div class="stage-list" aria-live="polite">
        <div v-if="loading" class="stage-loading">加载流程节点中…</div>
        <button v-for="stage in stages" :key="stage.id" type="button" class="stage-card" :class="{ selected: selectedStage === stage.id }" @click="selectStage(stage.id)">
          <span class="stage-card__icon" aria-hidden="true"><PerformanceWorkflowStageIcon :type="stage.nodeType" /></span>
          <span class="stage-card__copy"><span class="stage-card__title">{{ stage.title }}</span><span class="stage-card__executor">执行人：{{ stage.executor }}</span></span>
        </button>
      </div>
    </aside>

    <aside class="text-normal" aria-label="内容设置">
      <div class="text-normal__title">内容设置</div>
      <div class="text-normal__divider" aria-hidden="true"></div>
      <div v-if="!hasActiveConfiguredSettings" class="text-normal__body"><span>暂未选择内容</span></div>
    </aside>

    <ContentSettingsStageRenderer class="content-stage-renderer" :tabs="availableTabs" :active-tab="activeTab" :aria-label="activeTabLabel" @update:active-tab="handleTabChange">
      <div v-if="selectedStageData" class="content-pane">
        <PerformanceTemplateSectionCard v-if="!referenceTabEmpty" :title="selectedStageTitle" :actions="configuredContents.length ? [] : summaryActions" @action="handleContentAction" />
        <section v-if="configuredContents.length" class="configured-content-section configured-content-panel" aria-label="配置填写内容">
          <PerformanceSortableList :items="configuredContents" item-key="id" :gap="0" class="configured-content-sortable-list" @reorder="reorderConfigured">
            <template #default="{ item: content, index, dragging, itemStyle }">
              <PerformanceConfiguredContentBlock
                :content="content"
                :active="selectedConfiguredId === content.id"
                :expanded="configuredExpandedIds.has(content.id)"
                :dragging="dragging"
                :item-style="itemStyle"
                :index="index"
                :count="configuredContents.length"
                :toolbar-visible="configuredHoverKey === configuredCardKey(content)"
                :root-settings="rootSettingFor(content.id)"
                :item-settings="itemSettingsForContent(content.id)"
                :root-settings-variant="activeStageContentRule.rootSettingsVariant"
                :item-settings-variant="activeStageContentRule.itemSettingsVariant"
                @activate="selectedConfiguredId = $event"
                @update:expanded="setConfiguredExpanded(content.id, $event)"
                @update:root-settings="rootSettings[content.id] = $event"
                @update:item-settings="setItemSettingsForContent(content.id, $event)"
                @hover-change="configuredHoverKey = $event ? configuredCardKey(content) : null"
                @move-up="moveConfigured(index, -1)"
                @move-down="moveConfigured(index, 1)"
                @edit="editConfigured(content)"
                @delete="removeConfigured(index)"
              />
            </template>
          </PerformanceSortableList>
          <PerformanceTemplateOperateBar class="configured-content-footer" :actions="summaryActions" @action="handleContentAction" />
        </section>
      </div>
      <div v-if="referenceTabEmpty" class="reference-entry-pane">
        <PerformanceReferenceEntryBar @select="handleContentAction('add-reference')" />
      </div>
      <div v-else-if="!selectedStageData" class="content-card content-card--result">
        <div class="content-card__head"><strong>绩效结果查看</strong><span class="drag-dots" aria-hidden="true">⠿</span></div>
        <div class="content-card__body">此区域应添加终评环节执行人「直属上级」填写的内容</div>
        <div class="content-card__actions"><button type="button">＋ 添加终评内容</button><i aria-hidden="true"></i><button type="button">＋ 添加提示</button></div>
      </div>
    </ContentSettingsStageRenderer>
    <aside v-if="false" class="configured-content-panel" aria-label="閰嶇疆濉啓鍐呭唴">
      <article v-for="content in configuredContents" :key="content.id" class="configured-content-card">
        <strong>{{ content.name }}</strong>
        <p v-if="content.description">{{ content.description }}</p>
        <ul><li v-for="item in content.items" :key="item.id">{{ item.label }}</li></ul>
      </article>
    </aside>
    <PerformancePromptModal v-model:open="promptModalOpen" @save="handlePromptSave" />
    <PerformanceReferenceContentDrawer v-model:open="referenceDrawerOpen" :node-candidates="referenceNodeCandidates" :more-options="referenceMoreOptions" :selected="referenceSelectedValues" @confirm="handleReferenceConfirm" />
    <PerformanceAssessmentContentLayers ref="contentLayerRef" v-model:open="contentDrawerOpen" :initial-contents="assessmentInitialContents" :available-contents="availableContentCandidates" :rating-options="ratingOptions" :tag-options="tagOptions" :allowed-types="allowedContentTypeList" @confirm="handleContentConfirm" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { performanceReviewQuestionApi, performanceTagFillQuestionApi, performanceTemplateApi, type PerformanceReviewQuestion, type PerformanceTemplateContent, type PerformanceWorkflowNode } from '@/api/performance'
import PerformanceWorkflowStageIcon from './PerformanceWorkflowStageIcon.vue'
import PerformanceTemplateSectionCard from '@/components/performance/PerformanceTemplateSectionCard.vue'
import PerformancePromptModal from '@/components/performance/PerformancePromptModal.vue'
import PerformanceAssessmentContentLayers, { type AssessmentContentDraft, type AssessmentContentType, type AssessmentOption, type AssessmentTagOption } from '@/components/performance/PerformanceAssessmentContentLayers.vue'
import PerformanceSortableList from '@/components/performance/PerformanceSortableList.vue'
import PerformanceTemplateOperateBar from '@/components/performance/PerformanceTemplateOperateBar.vue'
import PerformanceConfiguredContentBlock from '@/components/performance/PerformanceConfiguredContentBlock.vue'
import type { WorkSummaryRootSettings } from '@/components/performance/PerformanceWorkSummaryRootSettings.vue'
import type { WorkSummaryItemSettings } from '@/components/performance/PerformanceWorkSummaryItemSettings.vue'
import ContentSettingsStageRenderer from '@/components/performance/ContentSettingsStageRenderer.vue'
import PerformanceReferenceEntryBar from '@/components/performance/PerformanceReferenceEntryBar.vue'
import PerformanceReferenceContentDrawer, { type ReferenceOption } from '@/components/performance/PerformanceReferenceContentDrawer.vue'
import { getStageContentRule, getStageContentTabs } from '@/components/performance/performanceContentSettingsRules'

const props = defineProps<{ templateId?: number | null }>()

const selectedStage = ref<string | null>(null)
const activeTab = ref('fill')
const loading = ref(false)
const stages = ref<Array<{ id: string; nodeType: string; icon: string; title: string; executor: string }>>([])
const workflowNodes = ref<PerformanceWorkflowNode[]>([])
const contentLibrary = ref<PerformanceTemplateContent[]>([])
const ratingOptions = ref<AssessmentOption[]>([])
const tagOptions = ref<AssessmentTagOption[]>([])
const iconByType: Record<string, string> = { reviewer_360_invite: '▤', reviewer_360_confirm: '▥', evaluation: '360', calibration: '⌁', result_communication: '▣', result_view: '⌑', result_reconsideration: '↻' }

function ratingLevelOptions(config: Record<string, unknown>) {
  const levels = config.levels
  if (!Array.isArray(levels)) return []
  return levels.map((level, index) => {
    if (typeof level === 'string') return { id: `level-${index}`, label: level }
    if (!level || typeof level !== 'object') return null
    const record = level as Record<string, unknown>
    const label = String(record.name || record.label || record.code || '')
    if (!label) return null
    return { id: String(record.id || record.code || `level-${index}`), label, color: record.color ? String(record.color) : undefined }
  }).filter((level): level is { id: string; label: string; color: string | undefined } => Boolean(level))
}

function toRatingOption(question: PerformanceReviewQuestion): AssessmentOption {
  const displayMode = question.display_mode ?? question.rule.config.displayMode ?? question.rule.config.display_mode
  const levelOptions = ratingLevelOptions(question.rule.config)
  return {
    id: String(question.id),
    label: question.name,
    description: question.rule.name,
    levels: levelOptions.map(level => level.label),
    levelOptions,
    displayMode: displayMode === '下拉样式' ? '下拉样式' : '标签样式',
  }
}

async function loadRatingOptions() {
  try {
    const questions = await performanceReviewQuestionApi.list('评级')
    ratingOptions.value = questions
      .filter((question) => question.rule.status === 'active' && question.rule.review_type === '评级')
      .map(toRatingOption)
    refreshRatingSnapshots()
  } catch {
    ratingOptions.value = []
  }
}
async function loadTagOptions() {
  try {
    const questions = await performanceTagFillQuestionApi.options()
    tagOptions.value = questions.map((question) => ({
      id: question.id,
      label: question.name,
      description: question.description,
      defaultFields: question.tags.map((tag) => ({ label: tag.name, content: tag.prompt })),
    }))
  } catch {
    tagOptions.value = []
  }
}
const selectedStageData = computed(() => stages.value.find((stage) => stage.id === selectedStage.value) || null)
const selectedStageTitle = computed(() => selectedStageData.value?.title || '')
const summaryActions = computed(() => {
  const type = selectedStageData.value?.nodeType
  if (type === 'result_view') {
    return [
      { key: 'add-final-content', label: '添加终评内容' },
      { key: 'add-prompt', label: '添加提示' },
    ]
  }
  return [
    { key: 'add-content', label: '添加内容' },
    { key: 'add-prompt', label: '添加提示' },
  ]
})
const promptModalOpen = ref(false)
const contentDrawerOpen = ref(false)
const referenceDrawerOpen = ref(false)
const configuredContents = ref<Array<AssessmentContentDraft & { id: string }>>([])
const configuredExpandedIds = ref<Set<string>>(new Set())
const selectedConfiguredId = ref<string | null>(null)
const configuredHoverKey = ref<string | null>(null)
const rootSettings = ref<Record<string, WorkSummaryRootSettings>>({})
const itemSettings = ref<Record<string, WorkSummaryItemSettings>>({})
const contentIdentity = (content: PerformanceTemplateContent) => content.content_id || content.id || `${content.type}-${content.name}`
function normalizeRatingContent<T extends PerformanceTemplateContent>(content: T): T {
  if (content.type !== 'rating') return content
  const ratingOptionId = content.ratingOptionId || content.items.at(-1)?.id || ''
  const current = ratingOptions.value.find(option => option.id === ratingOptionId)
  const selected = content.items.find(item => item.id === ratingOptionId) || content.items.at(-1)
  const item = current ? { id: current.id, label: current.label, hint: '' } : selected ? { ...selected } : null
  const options = current?.levelOptions?.length
    ? current.levelOptions.map(option => ({ ...option }))
    : current?.levels?.length
      ? current.levels.map((label, index) => ({ id: `${current.id}-${index}`, label }))
      : content.options
  const ratingDisplayMode = current?.displayMode || content.ratingDisplayMode || '标签样式'
  return { ...content, ratingOptionId, ratingDisplayMode, items: item ? [item] : [], options }
}
const configuredCardKey = (content: PerformanceTemplateContent) => `${selectedStage.value || 'stage'}:${activeTab.value}:${contentIdentity(content)}`
const contentLayerRef = ref<InstanceType<typeof PerformanceAssessmentContentLayers> | null>(null)
const availableTabs = computed(() => getStageContentTabs(selectedStageData.value?.nodeType))
const activeTabLabel = computed(() => availableTabs.value.find((tab) => tab.key === activeTab.value)?.label || availableTabs.value[0].label)
const referenceTabEmpty = computed(() => activeTab.value === 'reference' && !configuredContents.value.length)
const referenceNodeCandidates = computed(() => {
  const currentId = selectedStage.value
  return workflowNodes.value
    .filter((node) => node.node_id !== currentId && !node.system)
    .map((node) => ({ value: node.node_id || '', label: node.name }))
})
const referenceMoreOptions: ReferenceOption[] = [
  { value: 'okr', label: 'OKR', description: '支持展示 OKR 内容、OKR 日志、OKR 异常完成情况等信息' },
  { value: 'more_reference', label: '更多参考', description: '支持展示绩效信息、异动信息、补充信息等其他信息' },
  { value: 'team_stats', label: '团队统计', description: '有对应权限的用户可查看被评估人下级同周期的绩效结果分布（如被评估人无下级，则不展示此参考内容）' },
]
const referenceSelectedValues = computed(() => configuredContents.value.map((content) => content.content_id || content.id || content.name))
const assessmentInitialContents = computed(() => configuredContents.value.filter((content) => (content.type as string) !== 'reference').map((content) => ({ ...content, type: content.type as AssessmentContentType })) as Array<AssessmentContentDraft & { id: string }>)
const activeStageContentRule = computed(() => getStageContentRule(selectedStageData.value?.nodeType))
const configuredContentRulesEnabled = computed(() => activeStageContentRule.value.rootSettingsVariant === 'work-summary-root' && activeStageContentRule.value.itemSettingsVariant === 'work-summary-item')
const hasActiveConfiguredSettings = computed(() => Boolean(selectedConfiguredId.value) && configuredContentRulesEnabled.value)
const allowedContentTypes = computed(() => activeStageContentRule.value.allowedContentTypes)
const allowedContentTypeList = computed(() => [...allowedContentTypes.value])
const availableContentCandidates = computed(() => contentLibrary.value.filter((content) => allowedContentTypes.value.includes(content.type as AssessmentContentType)).map((content) => { const normalized = normalizeRatingContent(content); return { ...normalized, id: normalized.content_id || normalized.id || `${normalized.type}-${normalized.name}` } }) as Array<AssessmentContentDraft & { id: string }>)
const defaultRootSettings = (): WorkSummaryRootSettings => ({ hideDescription: false, allowMultiple: false })
const defaultItemSettings = (): WorkSummaryItemSettings => ({ mode: 'fill', required: true })
function normalizeRootSettings(value: unknown): WorkSummaryRootSettings {
  const settings = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return { hideDescription: settings.hideDescription === true, allowMultiple: settings.allowMultiple === true }
}
function normalizeItemSettings(value: unknown): WorkSummaryItemSettings {
  const settings = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return { mode: settings.mode === 'hidden' ? 'hidden' : 'fill', required: settings.required !== false }
}
function rootSettingFor(contentId: string): WorkSummaryRootSettings {
  return rootSettings.value[contentId] || defaultRootSettings()
}
function itemSettingsForContent(contentId: string): Record<string, WorkSummaryItemSettings> {
  const content = configuredContents.value.find((item) => item.id === contentId)
  return Object.fromEntries((content?.items || []).map((item) => [item.id, itemSettings.value[`${contentId}:${item.id}`] || defaultItemSettings()]))
}
function setItemSettingsForContent(contentId: string, settings: Record<string, WorkSummaryItemSettings>) {
  Object.entries(settings).forEach(([itemId, value]) => { itemSettings.value[`${contentId}:${itemId}`] = value })
}
function updateConfiguredContent(index: number, content: AssessmentContentDraft & { id: string }) {
  configuredContents.value = configuredContents.value.map((item, itemIndex) => itemIndex === index ? content : item)
}
function setConfiguredExpanded(contentId: string, expanded: boolean) {
  const next = new Set(configuredExpandedIds.value)
  expanded ? next.add(contentId) : next.delete(contentId)
  configuredExpandedIds.value = next
}
watch(selectedStageData, () => { activeTab.value = availableTabs.value[0].key })
function handleContentAction(key: string) {
  if (key === 'add-prompt') promptModalOpen.value = true
  if (key === 'add-reference') { referenceDrawerOpen.value = true; return }
  const contentSlot = key === 'add-final-content' ? 'view' : key === 'add-content' ? activeTab.value : null
  if (contentSlot && availableTabs.value.some((tab) => tab.key === contentSlot)) {
    activeTab.value = contentSlot
    contentDrawerOpen.value = true
  }
}
function handleTabChange(tab: string) {
  syncSelectedStageContents()
  activeTab.value = tab
  const node = workflowNodes.value.find((item) => item.node_id === selectedStage.value)
  setConfiguredContents(node?.content?.filter((content) => (content.content_slot || 'fill') === tab) || [])
}
function handlePromptSave() {
  promptModalOpen.value = false
}
function setConfiguredContents(contents: PerformanceTemplateContent[]) {
  const unique = new Map<string, AssessmentContentDraft & { id: string }>()
  contents.forEach((rawContent, index) => {
    const content = normalizeRatingContent(rawContent)
    const baseId = content.content_id || content.id || `${content.type}-${content.name}`
    let id = baseId
    let suffix = index + 1
    while (unique.has(id)) id = `${baseId}-${suffix++}`
    unique.set(id, {
      ...content,
      id,
      content_id: id,
      items: (content.items || []).map((item) => ({ ...item })),
    } as AssessmentContentDraft & { id: string })
  })
  configuredContents.value = [...unique.values()] as Array<AssessmentContentDraft & { id: string }>
  configuredExpandedIds.value = new Set(configuredContents.value.map((item) => item.id))
  rootSettings.value = Object.fromEntries(configuredContents.value.map((content) => [content.id, normalizeRootSettings(content.settings)]))
  itemSettings.value = Object.fromEntries(configuredContents.value.flatMap((content) => content.items.map((item) => [`${content.id}:${item.id}`, normalizeItemSettings(item.settings)])))
}
function mergeContentLibrary(contents: PerformanceTemplateContent[]) {
  const next = new Map(contentLibrary.value.map((content) => [content.content_id || content.id || `${content.type}-${content.name}`, content]))
  contents.forEach((rawContent) => {
    const content = normalizeRatingContent(rawContent)
    const contentId = content.content_id || content.id || `${content.type}-${content.name}`
    const { content_slot: _slot, ...libraryContent } = content
    next.set(contentId, { ...libraryContent, content_id: contentId })
  })
  contentLibrary.value = [...next.values()]
}
function serializeConfiguredContents(slot = activeTab.value): PerformanceTemplateContent[] {
  return configuredContents.value.map(({ id, ...content }) => ({
    ...content,
    id,
    content_id: content.content_id || id,
    content_slot: slot as PerformanceTemplateContent['content_slot'],
    settings: configuredContentRulesEnabled.value ? rootSettingFor(id) : content.settings,
    items: content.items.map(({ settings, ...item }) => ({
      ...item,
      settings: configuredContentRulesEnabled.value
        ? itemSettings.value[`${id}:${item.id}`] || normalizeItemSettings(settings)
        : settings,
    })),
  }))
}
function replaceNodeContentSlot(node: PerformanceWorkflowNode, slot: string, contents: PerformanceTemplateContent[]) {
  const retained = (node.content || []).filter((content) => (content.content_slot || 'fill') !== slot)
  node.content = [...retained, ...contents]
  node.content_bindings = { ...(node.content_bindings || {}), [slot]: contents.map((content) => content.content_id || content.id || `${content.type}-${content.name}`) }
}
function syncSelectedStageContents() {
  if (!selectedStage.value) return
  const node = workflowNodes.value.find((item) => item.node_id === selectedStage.value)
  if (node) replaceNodeContentSlot(node, activeTab.value, serializeConfiguredContents())
}
function selectStage(id: string) {
  syncSelectedStageContents()
  selectedStage.value = id
  const node = workflowNodes.value.find((item) => item.node_id === id)
  activeTab.value = getStageContentTabs(node?.node_type)[0]?.key || 'fill'
  setConfiguredContents(node?.content?.filter((content) => (content.content_slot || 'fill') === activeTab.value) || [])
  selectedConfiguredId.value = null
  configuredHoverKey.value = null
}
function handleContentConfirm(contents: AssessmentContentDraft[]) {
  setConfiguredContents(contents as PerformanceTemplateContent[])
  mergeContentLibrary(configuredContents.value)
  const node = workflowNodes.value.find((item) => item.node_id === selectedStage.value)
  if (node) replaceNodeContentSlot(node, activeTab.value, serializeConfiguredContents())
  selectedConfiguredId.value = null
  configuredHoverKey.value = null
  if (!selectedStage.value) selectedStage.value = stages.value.find((stage) => stage.nodeType === 'evaluation')?.id || null
  contentDrawerOpen.value = false
}
function handleReferenceConfirm(selected: string[]) {
  const pool = new Map<string, ReferenceOption & { kind: 'node' | 'more' }>()
  referenceNodeCandidates.value.forEach((option) => pool.set(option.value, { ...option, kind: 'node' }))
  referenceMoreOptions.forEach((option) => pool.set(option.value, { ...option, kind: 'more' }))
  const contents: PerformanceTemplateContent[] = selected.flatMap((value) => {
    const option = pool.get(value)
    if (!option) return []
    return [{ type: 'reference', name: option.label, description: option.description || '', content_id: `reference-${value}`, reference_kind: option.kind, reference_value: value, items: [] } as PerformanceTemplateContent]
  })
  setConfiguredContents(contents)
  const node = workflowNodes.value.find((item) => item.node_id === selectedStage.value)
  if (node) replaceNodeContentSlot(node, 'reference', serializeConfiguredContents('reference'))
  selectedConfiguredId.value = null
  configuredHoverKey.value = null
  referenceDrawerOpen.value = false
}
function reorderConfigured(from: number, to: number) {
  if (from === to) return
  const next = configuredContents.value.slice()
  const [moved] = next.splice(from, 1)
  if (!moved) return
  next.splice(to, 0, moved)
  configuredContents.value = next
}
function moveConfigured(index: number, delta: -1 | 1) {
  reorderConfigured(index, index + delta)
}
function removeConfigured(index: number) {
  const removed = configuredContents.value[index]
  if (!removed) return
  configuredContents.value = configuredContents.value.filter((_, itemIndex) => itemIndex !== index)
  const next = new Set(configuredExpandedIds.value)
  next.delete(removed.id)
  configuredExpandedIds.value = next
  delete rootSettings.value[removed.id]
  Object.keys(itemSettings.value).forEach((key) => { if (key.startsWith(`${removed.id}:`)) delete itemSettings.value[key] })
  if (selectedConfiguredId.value === removed.id) selectedConfiguredId.value = null
  configuredHoverKey.value = null
}
function editConfigured(content: AssessmentContentDraft & { id: string }) {
  contentDrawerOpen.value = true
  void nextTick(() => contentLayerRef.value?.openEditor(content))
}
function refreshRatingSnapshots() {
  workflowNodes.value = workflowNodes.value.map(node => ({ ...node, content: node.content?.map(content => normalizeRatingContent(content)) }))
  contentLibrary.value = contentLibrary.value.map(content => normalizeRatingContent(content))
  const node = workflowNodes.value.find(item => item.node_id === selectedStage.value)
  if (node) setConfiguredContents(node.content?.filter(content => (content.content_slot || 'fill') === activeTab.value) || [])
}
function applyWorkflowNodes(nodes: PerformanceWorkflowNode[], library: PerformanceTemplateContent[] = []) {
  workflowNodes.value = nodes.map((node) => ({ ...node, content: node.content?.map((content) => normalizeRatingContent({ ...content, items: content.items || [] })) }))
  const merged = new Map<string, PerformanceTemplateContent>()
  library.forEach((content) => { const normalized = normalizeRatingContent(content); merged.set(contentIdentity(normalized), normalized) })
  workflowNodes.value.flatMap((node) => node.content || []).forEach((content) => {
    const contentId = content.content_id || content.id || `${content.type}-${content.name}`
    if (!merged.has(contentId)) merged.set(contentId, { ...content, content_id: contentId })
  })
  contentLibrary.value = [...merged.values()]
  stages.value = nodes.map((node, index) => ({ id: node.node_id || `${node.node_type}-${index}`, nodeType: node.node_type, icon: iconByType[node.node_type] || '▧', title: node.name, executor: node.executor_label }))
}
async function save() {
  if (!props.templateId) return
  syncSelectedStageContents()
  workflowNodes.value.flatMap((node) => node.content || []).forEach((content) => mergeContentLibrary([content]))
  const nodes = workflowNodes.value.map((node) => ({ ...node, content: node.content ? node.content.map((content) => ({ ...content, items: content.items || [] })) : [] }))
  const response = await performanceTemplateApi.updateWorkflow(props.templateId, { nodes, content_library: contentLibrary.value })
  applyWorkflowNodes(response.nodes || [], response.content_library || [])
}
defineExpose({ save })
onMounted(async () => {
  if (!props.templateId) return
  void loadRatingOptions()
  void loadTagOptions()
  loading.value = true
  try { const data = await performanceTemplateApi.getWorkflow(props.templateId); applyWorkflowNodes(data.nodes || [], data.content_library || []) } finally { loading.value = false }
})
</script>

<style scoped>
.content-settings-page {
  position: relative;
  --header-text-top: 20px;
  --hairline: 0.666667px;
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr) 320px;
  min-width: 1280px;
  flex: 1;
  min-height: 0;
  background: #f5f6f7;
  color: #1f2329;
  font: 400 14px/21px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif;
}

.stage-panel {
  grid-column: 1;
  grid-row: 1;
  min-height: 0;
  overflow: auto;
  padding: var(--header-text-top) 20px 20px;
  box-sizing: border-box;
  border-right: var(--hairline) solid #dee0e3;
  background: #fff;
}

.stage-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 22px;
  margin-bottom: 12px;
}

.stage-panel__header strong {
  font-size: 14px;
  font-weight: 600;
  line-height: 22px;
}

.all-content-button {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 22px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #1f2329;
  font: inherit;
  cursor: pointer;
}

.all-content-button span { font-size: 22px; }
.stage-list { display: flex; flex-direction: column; gap: 12px; }
.stage-loading { color: #646a73; font-size: 12px; }

.stage-card {
  display: flex;
  align-items: flex-start;
  width: 280px;
  height: 64px;
  min-height: 64px;
  padding: 12px 16px;
  box-sizing: border-box;
  border: var(--hairline) solid #dee0e3;
  border-radius: 8px;
  background: #fff;
  color: #1f2329;
  text-align: left;
  cursor: pointer;
}

.stage-card:hover,
.stage-card.selected { border-color: #3370ff; color: #3370ff; }
.stage-card__icon { display: flex; align-items: center; justify-content: center; width: 18px; height: 18px; margin-right: 8px; font-size: 14px; line-height: 18px; }
.stage-card__icon :deep(.stage-icon) { display: block; width: 18px; height: 18px; fill: currentColor; }
.stage-card__copy { display: flex; flex-direction: column; min-width: 0; }
.stage-card__title { font-size: 14px; line-height: 21px; }
.stage-card__executor { color: #646a73; font-size: 12px; line-height: 18px; }
.stage-card:hover .stage-card__executor,
.stage-card.selected .stage-card__executor { color: #646a73; }

.content-canvas {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 0 20px 20px;
  box-sizing: border-box;
  background: #f5f6f7;
}

.content-tabs {
  position: relative;
  display: flex;
  align-items: stretch;
  max-width: 800px;
  height: 46px;
  margin: 8px auto 0;
}

.content-tabs__divider {
  position: absolute;
  right: 0;
  top: 46px;
  left: 0;
  z-index: 0;
  height: var(--hairline);
  background: rgba(31, 35, 41, 0.15);
}

.content-pane { width: 100%; max-width: 800px; margin: 12px auto 0; }

.reference-entry-pane { width: 100%; max-width: 800px; margin: 12px auto 0; }

.content-tab {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  max-width: 240px;
  height: 46px;
  margin-right: 28px;
  padding: 12px 0;
  box-sizing: border-box;
  border: 0;
  background: transparent;
  color: #1f2329;
  font: 400 14px/22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif;
  transition: color 0.1s linear;
  cursor: pointer;
}

.content-tab:last-of-type { margin-right: 0; }
.content-tab--active { color: #1456f0; font-weight: 500; }
.content-tab--active::after {
  position: absolute;
  right: 0;
  bottom: 1px;
  left: 0;
  z-index: 2;
  height: 3px;
  background: #1456f0;
  content: '';
  transition: width 0.3s cubic-bezier(.34, .69, .1, 1), left 0.3s cubic-bezier(.34, .69, .1, 1);
}

.content-card { max-width: 800px; margin: 20px auto 0; border-radius: 8px; background: #fff; }
.content-card--result { overflow: hidden; }
.content-card__head { position: relative; display: flex; align-items: center; justify-content: center; height: 88px; border-bottom: 1px solid #dee0e3; }
.content-card__head strong { font-size: 24px; font-weight: 600; }
.drag-dots { position: absolute; top: 8px; color: #646a73; font-size: 24px; letter-spacing: -5px; }
.content-card__body { display: flex; align-items: center; justify-content: center; height: 153px; color: #8f959e; font-size: 18px; }
.content-card__actions { display: flex; align-items: center; justify-content: center; height: 82px; gap: 32px; }
.content-card__actions button { border: 0; background: transparent; color: #3370ff; font-size: 18px; cursor: pointer; }
.content-card__actions i { width: 1px; height: 24px; background: #bbbfc4; }

.content-stage-renderer{grid-column:2;grid-row:1}
.text-normal {
  grid-column: 3;
  grid-row: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: auto;
  padding: var(--header-text-top) 0 24px;
  box-sizing: border-box;
  background: #fff;
  color: rgba(0, 0, 0, 0.65);
}

.text-normal__title {
  height: 22px;
  margin: 0 0 12px;
  padding: 0 24px;
  box-sizing: border-box;
  color: #1f2329;
  font-size: 14px;
  font-weight: 600;
  line-height: 22px;
}

.text-normal__divider {
  width: 100%;
  height: var(--hairline);
  margin: 0 0 20px;
  flex-shrink: 0;
  background: rgba(31, 35, 41, 0.15);
}

.text-normal__body { margin-top: 212px; color: #8f959e; font-size: 14px; line-height: 22px; text-align: center; }
.configured-content-section { width: 792px; max-width: 100%; margin: 0; padding: 0; border: 0; border-radius: 4px; background: #fff; overflow: visible; }
.configured-content-sortable-list { width: 100%; }
.configured-content-sortable-list :deep(.performance-sortable-list__placeholder) { border: 0; background: transparent; }
.configured-content-footer { position: sticky; z-index: 20; bottom: 0; width: 100%; margin-top: 0; border-radius: 0 0 4px 4px; }
</style>
