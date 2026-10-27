<template>
  <div class="content-settings-page">
    <aside class="stage-panel" aria-label="按评估流程配置">
      <div class="stage-panel__header">
        <strong>按评估流程配置</strong>
        <button v-if="!isCalibration" class="all-content-button" type="button" aria-label="全部内容" @click="openAllContentDrawer">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" data-icon="ArrangeOutlined" aria-hidden="true">
            <path d="M2.467 11.5a1 1 0 0 1 1.366-.366L12 15.846l8.167-4.712a1 1 0 0 1 1 1.732l-8.534 4.923a1.267 1.267 0 0 1-1.266 0l-8.534-4.923a1 1 0 0 1-.366-1.366Z" fill="currentColor"></path>
            <path d="M2.453 16.193a1 1 0 0 1 1.354-.407L12 20.198l8.192-4.412a1 1 0 1 1 .949 1.761l-8.54 4.599a1.267 1.267 0 0 1-1.202 0l-8.54-4.599a1 1 0 0 1-.406-1.354ZM12 4.267l5.942 3.169L12 11 6.058 7.436 12 4.266Zm.502-2a1.067 1.067 0 0 0-1.004 0L2.83 6.89a.533.533 0 0 0-.023.928l8.643 5.186c.338.203.76.203 1.098 0l8.643-5.186a.533.533 0 0 0-.023-.928l-8.667-4.622Z" fill="currentColor"></path>
          </svg>
          <span>全部内容</span>
        </button>
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
      <div v-if="pageHeadingSelected" class="page-name-settings">
        <label class="page-name-settings__label" for="content-page-name">页面名称<svg class="page-name-settings__required" viewBox="0 0 8 8" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M5.964 5.816L4.378 4.668l.17 1.935H3.456l.171-1.935L2.04 5.816l-.54-.984 1.757-.827L1.5 3.178l.54-.991 1.586 1.175-.17-1.962h1.093l-.171 1.962 1.586-1.175.54.99-1.75.828 1.75.827-.54.984z" /></svg></label>
        <PerformanceTextField v-model="contentPageName" variant="feishu-input" input-id="content-page-name" aria-label="页面名称" :maxlength="100" :disabled="pageNameLocked" :invalid="Boolean(pageNameError)" />
        <span v-if="pageNameError" class="page-name-settings__error" role="alert">{{ pageNameError }}</span>
      </div>
      <div v-else-if="!hasActiveConfiguredSettings" class="text-normal__body"><span>{{ (isReviewer360Fill && reviewer360PreviewSelected) || (isResultReconsiderationFill && resultReconsiderationPreviewSelected) ? '暂无可配置内容' : '暂未选择内容' }}</span></div>
    </aside>

    <ContentSettingsStageRenderer class="content-stage-renderer" :tabs="availableTabs" :active-tab="activeTab" :aria-label="activeTabLabel" @update:active-tab="handleTabChange">
      <PerformanceContentWorkspace v-if="selectedStageData" class="content-pane">
        <template v-if="isResultView || (isReferenceTab && referenceRelations.length)">
          <PerformanceContentRegionList :regions="contentRegions" :disabled="pageNameLocked" :selected-region-id="selectedRegionId" @reorder="reorderContentRegions" @activate="selectContentRegion">
            <template #result>
            <div class="result-view-section__overlay" :class="{ 'is-hovered': resultViewTitleHovered, 'is-selected': selectedRegionId === 'result' }" aria-hidden="true"></div>
            <div class="result-view-section__content result-view-section__title" role="button" tabindex="0" :aria-pressed="selectedRegionId === 'result'" aria-label="选择页面标题" @mouseenter="resultViewTitleHovered = true" @mouseleave="resultViewTitleHovered = false" @focusin="resultViewTitleHovered = true" @focusout="resultViewTitleHovered = false" @click="selectPageHeading" @keydown.enter.prevent="selectPageHeading" @keydown.space.prevent="selectPageHeading">
              <h2>{{ contentPageName }}</h2>
              <div v-if="!configuredContents.length" class="result-view-section__empty">此区域应添加终评环节执行人「{{ finalExecutorLabel }}」填写的内容</div>
            </div>
        <section v-if="configuredContents.length" class="configured-content-section configured-content-panel result-view-section__configured-content" aria-label="配置填写内容">
          <PerformanceSortableList :items="configuredContents" item-key="id" :gap="0" :disabled="isCalibration || pageNameLocked" class="configured-content-sortable-list" @reorder="reorderConfigured">
            <template #default="{ item: content, index, dragging, itemStyle }">
              <PerformanceConfiguredContentBlock
                :horizontal-handle="true"
                :content="content"
                :active="selectedConfiguredId === content.id"
                :expanded="configuredExpandedIds.has(content.id)"
                :dragging="dragging"
                :item-style="itemStyle"
                :index="index"
                :count="configuredContents.length"
                :toolbar-visible="!isCalibration && configuredHoverKey === configuredCardKey(content)"
                :root-settings="rootSettingFor(content.id)"
                :item-settings="itemSettingsForContent(content.id)"
                :root-settings-enabled="activeStageContentRule.rootSettingsEnabled"
                :item-settings-enabled="activeStageContentRule.itemSettingsEnabled"
                :settings-disabled="pageNameLocked"
                :root-settings-variant="activeStageContentRule.rootSettingsVariant"
                :item-settings-variant="activeStageContentRule.itemSettingsVariant"
                @activate="selectConfiguredContent"
                @settings-visibility="visible => { if (selectedConfiguredId === content.id) configuredSettingsVisible = visible }"
                @update:expanded="setConfiguredExpanded(content.id, $event)"
                @update:content="updateConfiguredContent(index, $event)"
                @update:root-settings="setRootSettingsForContent(content.id, $event)"
                @update:item-settings="setItemSettingsForContent(content.id, $event)"
                @hover-change="configuredHoverKey = $event ? configuredCardKey(content) : null"
                @move-up="moveConfigured(index, -1)"
                @move-down="moveConfigured(index, 1)"
                @edit="editConfigured(content)"
                @delete="removeConfigured(index)"
              />
            </template>
          </PerformanceSortableList>
        </section>

              <PerformanceTemplateOperateBar v-if="summaryActions.length" class="result-view-content-footer" :actions="summaryActions" @action="handleContentAction" />
            </template>
            <template #reference="{ group }">
            <h2>{{ group.name }}</h2>
            <div v-if="!referenceGroups.find(item => `reference:${item.id}` === group.id)!.contents.length" class="result-view-section__empty">该环节尚未配置内容</div>
            <div v-for="content in referenceGroups.find(item => `reference:${item.id}` === group.id)!.contents" :key="content.id" class="configured-content-panel result-view-section__configured-content">
              <PerformanceConfiguredContentBlock
                :horizontal-handle="true"
                :content="content"
                :active="selectedConfiguredId === content.id"
                :expanded="configuredExpandedIds.has(content.id)"
                :dragging="false"
                :index="referencePreviewContents.findIndex(item => item.id === content.id)"
                :count="referencePreviewContents.length"
                :structure-editable="false"
                :toolbar-visible="false"
                :root-settings="rootSettingFor(content.id)"
                :item-settings="itemSettingsForContent(content.id)"
                :root-settings-enabled="activeStageContentRule.rootSettingsEnabled"
                :item-settings-enabled="activeStageContentRule.itemSettingsEnabled"
                :settings-disabled="pageNameLocked"
                :root-settings-variant="activeStageContentRule.rootSettingsVariant"
                :item-settings-variant="activeStageContentRule.itemSettingsVariant"
                @activate="selectConfiguredContent"
                @settings-visibility="visible => { if (selectedConfiguredId === content.id) configuredSettingsVisible = visible }"
                @update:expanded="setConfiguredExpanded(content.id, $event)"
                @update:content="updateReferenceContent(content.id, $event)"
                @update:root-settings="setRootSettingsForContent(content.id, $event)"
                @update:item-settings="setItemSettingsForContent(content.id, $event)"
              />
            </div>

            </template>
          </PerformanceContentRegionList>
          <PerformanceReferenceEntryBar :class="{ 'result-view-reference-entry': isResultView }" :label="isResultView ? '添加其他参考内容' : undefined" @select="handleContentAction('add-reference')" />
        </template>
        <PerformanceReviewer360Content v-else-if="isReviewer360Fill" :page-title="contentPageName" :heading-selected="pageHeadingSelected" :root-selected="reviewer360PreviewSelected" :show-actions="!configuredContents.length" :actions="summaryActions" @select-heading="selectPageHeading" @select-root="selectReviewer360Preview" @action="handleContentAction" />
        <template v-else-if="isResultReconsiderationFill">
          <PerformanceTemplateSectionCard :title="activeTab === 'fill' ? contentPageName : selectedStageTitle" :actions="[]" :selectable="activeTab === 'fill'" :selected="pageHeadingSelected" @select="selectPageHeading" />
          <section class="result-reconsideration-section" aria-label="复议理由">
            <PerformanceContentSelectionFrame variant="root" :selected="resultReconsiderationPreviewSelected" class="result-reconsideration-section__frame" role="button" tabindex="0" :aria-pressed="resultReconsiderationPreviewSelected" aria-label="选择复议理由预览" @click="selectResultReconsiderationPreview" @keydown.enter.prevent="selectResultReconsiderationPreview" @keydown.space.prevent="selectResultReconsiderationPreview">
              <div class="result-reconsideration-section__header">
                <PerformanceAssessmentPreviewHeader name="复议理由" />
                <PerformanceExpandButton class="result-reconsideration-section__collapse" :expanded="resultReconsiderationExpanded" :hover-only="true" icon-variant="regular" :label="`${resultReconsiderationExpanded ? '收起' : '展开'}复议理由`" @toggle="resultReconsiderationExpanded = !resultReconsiderationExpanded" @click.stop />
              </div>
              <div v-if="resultReconsiderationExpanded" class="result-reconsideration-section__body">
                <div class="result-reconsideration-section__preview">这里展示被评估人发起复议时填写的内容</div>
              </div>
            </PerformanceContentSelectionFrame>
            <PerformanceTemplateOperateBar v-if="!configuredContents.length" :actions="summaryActions" @action="handleContentAction" />
          </section>
        </template>
        <PerformanceTemplateSectionCard v-else-if="!referenceTabEmpty" :title="isCalibration || activeTab === 'fill' ? contentPageName : selectedStageTitle" :actions="configuredContents.length ? [] : summaryActions" :selectable="activeTab === 'fill' || isCalibration" :selected="pageHeadingSelected" @select="selectPageHeading" @action="handleContentAction" />
        <section v-if="configuredContents.length && !isResultView && !isReferenceTab" class="configured-content-section configured-content-panel" aria-label="配置填写内容">
          <PerformanceSortableList :items="configuredContents" item-key="id" :gap="0" :disabled="isCalibration || pageNameLocked" class="configured-content-sortable-list" @reorder="reorderConfigured">
            <template #default="{ item: content, index, dragging, itemStyle }">
              <PerformanceConfiguredContentBlock
                :horizontal-handle="true"
                :content="content"
                :active="selectedConfiguredId === content.id"
                :expanded="configuredExpandedIds.has(content.id)"
                :dragging="dragging"
                :item-style="itemStyle"
                :index="index"
                :count="configuredContents.length"
                :toolbar-visible="!isCalibration && configuredHoverKey === configuredCardKey(content)"
                :root-settings="rootSettingFor(content.id)"
                :item-settings="itemSettingsForContent(content.id)"
                :root-settings-enabled="activeStageContentRule.rootSettingsEnabled"
                :item-settings-enabled="activeStageContentRule.itemSettingsEnabled"
                :settings-disabled="pageNameLocked"
                :root-settings-variant="activeStageContentRule.rootSettingsVariant"
                :item-settings-variant="activeStageContentRule.itemSettingsVariant"
                @activate="selectConfiguredContent"
                @settings-visibility="visible => { if (selectedConfiguredId === content.id) configuredSettingsVisible = visible }"
                @update:expanded="setConfiguredExpanded(content.id, $event)"
                @update:content="updateConfiguredContent(index, $event)"
                @update:root-settings="setRootSettingsForContent(content.id, $event)"
                @update:item-settings="setItemSettingsForContent(content.id, $event)"
                @hover-change="configuredHoverKey = $event ? configuredCardKey(content) : null"
                @move-up="moveConfigured(index, -1)"
                @move-down="moveConfigured(index, 1)"
                @edit="editConfigured(content)"
                @delete="removeConfigured(index)"
              />
            </template>
          </PerformanceSortableList>
          <PerformanceTemplateOperateBar v-if="summaryActions.length" class="configured-content-footer" :actions="summaryActions" @action="handleContentAction" />
        </section>
      </PerformanceContentWorkspace>
      <PerformanceContentWorkspace v-if="referenceTabEmpty" class="reference-entry-pane">
        <PerformanceReferenceEntryBar @select="handleContentAction('add-reference')" />
      </PerformanceContentWorkspace>
    </ContentSettingsStageRenderer>
    <aside v-if="false" class="configured-content-panel" aria-label="閰嶇疆濉啓鍐呭唴">
      <article v-for="content in configuredContents" :key="content.id" class="configured-content-card">
        <strong>{{ content.name }}</strong>
        <p v-if="content.description">{{ content.description }}</p>
        <ul><li v-for="item in content.items" :key="item.id">{{ item.label }}</li></ul>
      </article>
    </aside>
    <PerformancePromptModal v-model:open="promptModalOpen" :initial-value="editingPrompt?.prompt" @save="handlePromptSave" />
    <PerformanceReferenceContentDrawer v-model:open="referenceDrawerOpen" :node-candidates="referenceNodeCandidates" :more-options="referenceMoreOptions" :selected="referenceSelectedValues" @confirm="handleReferenceConfirm" />
    <PerformanceAssessmentContentLayers :horizontal-handle="true" ref="contentLayerRef" :open="contentDrawerOpen" :title="allContentDrawerOpen ? '全部评估内容' : '选择评估内容'" :initial-contents="allContentDrawerOpen ? [] : assessmentInitialContents" :available-contents="availableContentCandidates" :rating-options="ratingOptions" :tag-options="tagOptions" :allowed-types="allowedContentTypeList" :selectable-content-ids="isResultView ? finalContentIds : undefined" :selection-restriction="isResultView ? finalContentRestriction : ''" @update:open="handleContentDrawerVisibility" @confirm="handleContentConfirm" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { performanceReviewQuestionApi, performanceTagFillQuestionApi, performanceTemplateApi, type PerformancePromptValue, type PerformanceReferenceDisplaySettings, type PerformanceReviewQuestion, type PerformanceTemplateContent, type PerformanceWorkflowNode } from '@/api/performance'
import PerformanceWorkflowStageIcon from './PerformanceWorkflowStageIcon.vue'
import PerformanceTemplateSectionCard from '@/components/performance/PerformanceTemplateSectionCard.vue'
import PerformanceAssessmentPreviewHeader from '@/components/performance/PerformanceAssessmentPreviewHeader.vue'
import PerformanceContentSelectionFrame from '@/components/performance/PerformanceContentSelectionFrame.vue'
import PerformanceExpandButton from '@/components/performance/PerformanceExpandButton.vue'
import PerformancePromptModal from '@/components/performance/PerformancePromptModal.vue'
import PerformanceAssessmentContentLayers, { type AssessmentContentDraft, type AssessmentContentType, type AssessmentOption, type AssessmentTagOption } from '@/components/performance/PerformanceAssessmentContentLayers.vue'
import PerformanceSortableList from '@/components/performance/PerformanceSortableList.vue'
import PerformanceTemplateOperateBar from '@/components/performance/PerformanceTemplateOperateBar.vue'
import PerformanceReviewer360Content from '@/components/performance/PerformanceReviewer360Content.vue'
import PerformanceTextField from '@/components/performance/PerformanceTextField.vue'
import PerformanceConfiguredContentBlock from '@/components/performance/PerformanceConfiguredContentBlock.vue'
import type { WorkSummaryRootSettings } from '@/components/performance/PerformanceWorkSummaryRootSettings.vue'
import type { WorkSummaryItemSettings } from '@/components/performance/PerformanceWorkSummaryItemSettings.vue'
import ContentSettingsStageRenderer from '@/components/performance/ContentSettingsStageRenderer.vue'
import PerformanceContentWorkspace from '@/components/performance/PerformanceContentWorkspace.vue'
import PerformanceContentRegionList from '@/components/performance/PerformanceContentRegionList.vue'
import PerformanceReferenceEntryBar from '@/components/performance/PerformanceReferenceEntryBar.vue'
import PerformanceReferenceContentDrawer, { type ReferenceOption } from '@/components/performance/PerformanceReferenceContentDrawer.vue'
import { getItemSettingsVariant, resolveCalibrationContents, supportsCalibrationItemSettings, getEvaluationExecutorKind, getStageContentRule, getStageContentTabs, supportsEvaluationItemSettings, supportsResultViewSettings, supportsStageItemView } from '@/components/performance/performanceContentSettingsRules'
import { REAL_LINE_MANAGER_LEVEL_OPTIONS } from '@/components/performance/performanceExecutorOptions'

const props = defineProps<{ templateId?: number | null }>()

const selectedStage = ref<string | null>(null)
const activeTab = ref('fill')
const loading = ref(false)
const stages = ref<Array<{ id: string; nodeType: string; icon: string; title: string; executor: string; executorTypes: string[] }>>([])
const workflowNodes = ref<PerformanceWorkflowNode[]>([])
const pageNameLocked = ref(false)
const pageNameError = ref('')
const contentLibrary = ref<PerformanceTemplateContent[]>([])
const ratingOptions = ref<AssessmentOption[]>([])
const tagOptions = ref<AssessmentTagOption[]>([])
const iconByType: Record<string, string> = { reviewer_360_invite: '▤', reviewer_360_confirm: '▥', evaluation: '360', calibration: '⌁', result_communication: '▣', result_view: '⌑', result_reconsideration: '↻' }

function ratingLevelOptions(config: Record<string, unknown>) {
  const levels = config.levels
  if (!Array.isArray(levels)) return []
  return levels.map((level, index) => {
    if (typeof level === 'string') return { id: `level-${index}`, code: undefined, label: level, color: undefined }
    if (!level || typeof level !== 'object') return null
    const record = level as Record<string, unknown>
    const label = String(record.name || record.label || record.code || '')
    if (!label) return null
    return { id: String(record.id || record.code || `level-${index}`), code: record.code ? String(record.code) : undefined, label, color: record.color ? String(record.color) : undefined }
  }).filter((level): level is { id: string; code: string | undefined; label: string; color: string | undefined } => Boolean(level))
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
const selectedWorkflowNode = computed(() => workflowNodes.value.find(node => node.node_id === selectedStage.value))
const contentPageName = computed({
  get: () => selectedWorkflowNode.value?.content_page_name ?? (selectedStageData.value?.nodeType === 'result_view' ? '绩效结果' : selectedStageTitle.value),
  set: (value: string) => {
    if (!selectedWorkflowNode.value || pageNameLocked.value) return
    selectedWorkflowNode.value.content_page_name = value
    pageNameError.value = ''
  },
})
const isResultView = computed(() => selectedStageData.value?.nodeType === 'result_view')
const isReferenceTab = computed(() => activeTab.value === 'reference' && !isResultView.value)
const isCalibration = computed(() => selectedStageData.value?.nodeType === 'calibration')
const isResultReconsiderationFill = computed(() => selectedStageData.value?.nodeType === 'result_reconsideration' && activeTab.value === 'fill')
const isReviewer360Fill = computed(() => ['reviewer_360_invite', 'reviewer_360_confirm'].includes(selectedStageData.value?.nodeType || '') && activeTab.value === 'fill')
const finalNode = computed(() => {
  const nodes = workflowNodes.value.filter(node => node.include_final_result)
  return nodes.length === 1 ? nodes[0] : null
})
const finalExecutorLabel = computed(() => {
  const node = finalNode.value
  if (!node) return '未配置'
  if (node.executor_label === '实线上级') {
    const levels = REAL_LINE_MANAGER_LEVEL_OPTIONS.filter(option => node.executor_types?.includes(option.type))
    if (levels.length) return levels.map(option => option.label).join('、')
  }
  return node.executor_label || '未配置'
})
const finalFillContents = computed(() => {
  const node = finalNode.value
  if (!node) return []
  const contents = new Map<string, PerformanceTemplateContent>()
  ;(node.content || []).filter(content => (content.content_slot || 'fill') === 'fill').forEach(content => contents.set(contentIdentity(content), content))
  ;(node.content_bindings?.fill || []).forEach(id => {
    if (!contents.has(id)) {
      const content = contentLibrary.value.find(item => contentIdentity(item) === id)
      if (content) contents.set(id, content)
    }
  })
  return [...contents.values()].filter(content => content.type !== 'reference' && content.type !== 'prompt' && content.items?.some(item => item.kind !== 'prompt'))
})
const finalContents = computed(() => finalFillContents.value.filter(content => content.items.some(item => item.kind !== 'prompt' && item.settings?.mode !== 'hidden')))
const finalContentIds = computed(() => finalContents.value.map(contentIdentity))
const calibrationContents = computed(() => resolveCalibrationContents(finalFillContents.value, selectedWorkflowNode.value?.calibration_settings))
const finalContentRestriction = computed(() => `仅可选择终评环节执行人「${finalExecutorLabel.value}」填写的内容`)
const summaryActions = computed(() => {
  const type = selectedStageData.value?.nodeType
  if (isCalibration.value) return []
  if (isReferenceTab.value) return [{ key: 'add-reference', label: '选择参考内容' }]
  if (isReviewer360Fill.value) {
    return [{ key: 'add-prompt', label: '添加提示' }]
  }
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
const editingPrompt = ref<(AssessmentContentDraft & { id: string }) | null>(null)
let promptCounter = 0
const contentDrawerOpen = ref(false)
const allContentDrawerOpen = ref(false)
const referenceDrawerOpen = ref(false)
const configuredContents = ref<Array<AssessmentContentDraft & { id: string }>>([])
const resultReferenceContents = ref<Array<AssessmentContentDraft & { id: string }>>([])
const configuredExpandedIds = ref<Set<string>>(new Set())
const selectedConfiguredId = ref<string | null>(null)
const configuredHoverKey = ref<string | null>(null)
const reviewer360PreviewSelected = ref(false)
const resultReconsiderationPreviewSelected = ref(false)
const resultReconsiderationExpanded = ref(true)
const pageHeadingSelected = ref(false)
const selectedRegionId = ref<string | null>(null)
const resultViewTitleHovered = ref(false)
function clearContentSelection() {
  selectedConfiguredId.value = null
  selectedRegionId.value = null
  reviewer360PreviewSelected.value = false
  resultReconsiderationPreviewSelected.value = false
  pageHeadingSelected.value = false
}
function selectPageHeading() {
  clearContentSelection()
  selectedRegionId.value = 'result'
  pageHeadingSelected.value = true
}
function selectContentRegion(regionId: string) {
  clearContentSelection()
  selectedRegionId.value = regionId
  pageHeadingSelected.value = true
}
function selectConfiguredContent(contentId: string) {
  clearContentSelection()
  selectedConfiguredId.value = contentId
}
function selectReviewer360Preview() {
  clearContentSelection()
  reviewer360PreviewSelected.value = true
}
function selectResultReconsiderationPreview() {
  clearContentSelection()
  resultReconsiderationPreviewSelected.value = true
}
watch([selectedStage, activeTab], () => { clearContentSelection(); pageNameError.value = ''; promptModalOpen.value = false; editingPrompt.value = null })
const rootSettings = ref<Record<string, WorkSummaryRootSettings>>({})
const itemSettings = ref<Record<string, WorkSummaryItemSettings>>({})
const referenceContentMeta = ref<Record<string, { relationId: string; sourceContentId: string }>>({})
const contentIdentity = (content: PerformanceTemplateContent) => content.content_id || content.id || `${content.type}-${content.name}`
const cloneContent = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
function normalizeRatingContent<T extends PerformanceTemplateContent>(content: T): T {
  if (content.type !== 'rating') return content
  const ratingItems = content.items.filter(item => item.kind === 'rating' || !item.kind)
  const ratingOptionId = content.ratingOptionId || ratingItems.at(-1)?.id || ''
  const current = ratingOptions.value.find(option => option.id === ratingOptionId)
  const selected = ratingItems.find(item => item.id === ratingOptionId) || ratingItems.at(-1)
  const item = selected
    ? { ...selected, label: selected.label ?? current?.label ?? '', hint: selected.hint ?? '' }
    : current ? { id: current.id, kind: 'rating' as const, label: current.label, hint: '' } : null
  const options = content.options ?? (current?.levelOptions?.length
    ? cloneContent(current.levelOptions)
    : current?.levels?.map((label, index) => ({ id: `${current.id}-${index}`, label })))
  const ratingDisplayMode = content.ratingDisplayMode || current?.displayMode
  const items = content.items.some(value => value.kind)
    ? content.items.map(value => value === selected && item ? item : value)
    : item ? [item] : []
  return { ...content, ratingOptionId, ratingDisplayMode, items, options }
}
const configuredCardKey = (content: PerformanceTemplateContent) => `${selectedStage.value || 'stage'}:${activeTab.value}:${contentIdentity(content)}`
const contentLayerRef = ref<InstanceType<typeof PerformanceAssessmentContentLayers> | null>(null)
const evaluationExecutorKind = computed(() => getEvaluationExecutorKind(selectedStageData.value?.executor, selectedStageData.value?.executorTypes))
const availableTabs = computed(() => getStageContentTabs(selectedStageData.value?.nodeType, evaluationExecutorKind.value))
const activeTabLabel = computed(() => availableTabs.value.find((tab) => tab.key === activeTab.value)?.label || availableTabs.value[0].label)
const referenceTabEmpty = computed(() => isReferenceTab.value && !configuredContents.value.length && !referenceRelations.value.length)
const referenceSourceNodeTypes = new Set(['work_summary', 'evaluation', 'calibration', 'result_communication', 'result_reconsideration'])
const referenceNodeCandidates = computed(() => {
  const currentId = selectedStage.value
  return workflowNodes.value
    .filter((node) => node.node_id !== currentId && !node.system && referenceSourceNodeTypes.has(node.node_type))
    .map((node) => ({ value: node.node_id || '', label: node.name }))
})
const referenceMoreOptions: ReferenceOption[] = [
  { value: 'okr', label: 'OKR', description: '支持展示 OKR 内容、OKR 日志、OKR 异常完成情况等信息' },
  { value: 'more_reference', label: '更多参考', description: '支持展示绩效信息、异动信息、补充信息等其他信息' },
  { value: 'team_stats', label: '团队统计', description: '有对应权限的用户可查看被评估人下级同周期的绩效结果分布（如被评估人无下级，则不展示此参考内容）' },
]
const referenceRelations = computed(() => selectedWorkflowNode.value?.content?.filter(content => (content.content_slot || 'fill') === 'reference') || [])
const referenceSelectedValues = computed(() => referenceRelations.value.map(content => content.reference_value || content.content_id || content.id || content.name))
function referenceRelationId(relation: PerformanceTemplateContent) { return relation.content_id || relation.id || `reference-${relation.reference_value}` }
function referenceDisplaySettings(value: { allowView?: boolean; hideName?: boolean; hideDescription?: boolean; onlyWhenFilling?: boolean } = {}): PerformanceReferenceDisplaySettings {
  return Object.fromEntries(['allowView', 'hideName', 'hideDescription', 'onlyWhenFilling'].filter(key => typeof value[key as keyof typeof value] === 'boolean').map(key => [key, value[key as keyof typeof value]]))
}
function resolveReferenceContents(): PerformanceTemplateContent[] {
  const meta: Record<string, { relationId: string; sourceContentId: string }> = {}
  const resolved: PerformanceTemplateContent[] = []
  for (const relation of referenceRelations.value) {
    if (relation.reference_kind !== 'node' || !relation.reference_value) { resolved.push(cloneContent(relation)); continue }
    const source = workflowNodes.value.find(node => node.node_id === relation.reference_value && !node.system && referenceSourceNodeTypes.has(node.node_type) && node.node_id !== selectedStage.value)
    if (!source) continue
    const relationId = referenceRelationId(relation)
    const settings = relation.reference_settings?.content_settings || {}
    const contents = source.node_type === 'calibration'
      ? resolveCalibrationContents(finalFillContents.value, source.calibration_settings)
      : (source.content || []).filter(content => (content.content_slot || 'fill') === 'fill' && content.type !== 'reference')
    for (const sourceContent of contents) {
      const sourceContentId = contentIdentity(sourceContent)
      const id = `${relation.reference_value}:${sourceContentId}`
      const local = settings[sourceContentId] || {}
      meta[id] = { relationId, sourceContentId }
      resolved.push({ ...cloneContent(sourceContent), id, content_id: id, content_slot: 'reference', reference_source_content_id: sourceContentId,
        settings: { allowMultiple: false, allowUnknown: false, allowView: local.root?.allowView !== false, hideDescription: local.root?.hideDescription === true },
        ...(sourceContent.prompt ? { prompt: { ...sourceContent.prompt, ...local.root } } : {}),
        items: sourceContent.items.map(item => ({ ...cloneContent(item), settings: { mode: 'view', required: false, allowView: local.items?.[item.id]?.allowView !== false, hideName: local.items?.[item.id]?.hideName === true, hideDescription: local.items?.[item.id]?.hideDescription === true }, ...(item.prompt ? { prompt: { ...item.prompt, ...local.items?.[item.id] } } : {}) })) })
    }
  }
  referenceContentMeta.value = meta
  return resolved
}
function serializeReferenceRelations(): PerformanceTemplateContent[] {
  const previews = isResultView.value ? resultReferenceContents.value : configuredContents.value
  return referenceRelations.value.map(relation => {
    if (relation.reference_kind !== 'node') return cloneContent(relation)
    const relationId = referenceRelationId(relation)
    const contentSettings = cloneContent(relation.reference_settings?.content_settings || {})
    previews.forEach(content => {
      const meta = referenceContentMeta.value[content.id]
      if (!meta || meta.relationId !== relationId) return
      const previous = contentSettings[meta.sourceContentId] || {}
      contentSettings[meta.sourceContentId] = { ...previous, root: { ...previous.root, ...(content.type === 'prompt' ? referenceDisplaySettings(content.prompt) : referenceDisplaySettings(rootSettingFor(content.id))) }, items: { ...previous.items, ...Object.fromEntries(content.items.map(item => [item.id, { ...previous.items?.[item.id], ...referenceDisplaySettings(item.kind === 'prompt' ? item.prompt : itemSettingsForContent(content.id)[item.id]) }])) } }
    })
    const source = workflowNodes.value.find(item => item.node_id === relation.reference_value)
    return { ...cloneContent(relation), name: source?.name ?? relation.name, description: source?.description ?? relation.description, items: [], content_slot: 'reference' as const, reference_settings: { ...relation.reference_settings, content_settings: contentSettings } }
  })
}
const referencePreviewContents = computed(() => isResultView.value ? resultReferenceContents.value : configuredContents.value)
const referenceGroups = computed(() => referenceRelations.value.map(relation => {
  const source = workflowNodes.value.find(node => node.node_id === relation.reference_value)
  const contents = referencePreviewContents.value.filter(content => relation.reference_kind === 'node' ? referenceContentMeta.value[content.id]?.relationId === referenceRelationId(relation) : contentIdentity(content) === contentIdentity(relation))
  return { id: referenceRelationId(relation), name: source?.name || relation.name, contents }
}))
const contentRegions = computed(() => {
  const regions = referenceGroups.value.map(group => ({ id: `reference:${group.id}`, kind: 'reference', name: group.name }))
  if (!isResultView.value) return regions
  const all = [{ id: 'result', kind: 'result', name: contentPageName.value }, ...regions]
  const order = selectedWorkflowNode.value?.content_region_order || []
  return [...order.flatMap(id => all.filter(region => region.id === id)), ...all.filter(region => !order.includes(region.id))]
})
function reorderContentRegions(from: number, to: number) {
  const node = selectedWorkflowNode.value
  if (!node || pageNameLocked.value || from === to) return
  syncSelectedStageContents()
  const regions = contentRegions.value.slice()
  const [moved] = regions.splice(from, 1)
  regions.splice(to, 0, moved)
  if (isResultView.value) node.content_region_order = regions.map(region => region.id)
  const relations = serializeReferenceRelations()
  replaceNodeContentSlot(node, 'reference', regions.flatMap(region => relations.filter(relation => `reference:${referenceRelationId(relation)}` === region.id)))
}
const assessmentInitialContents = computed(() => configuredContents.value.filter((content) => content.type !== 'prompt' && (content.type as string) !== 'reference').map(content => {
  const source = isResultView.value ? finalContents.value.find(item => contentIdentity(item) === contentIdentity(content)) : undefined
  return { ...content, ...source, id: content.id, type: (source || content).type as AssessmentContentType }
}) as Array<AssessmentContentDraft & { id: string }>)
const activeStageContentRule = computed(() => {
  if (isReferenceTab.value) return getStageContentRule('result_view')
  const rule = getStageContentRule(selectedStageData.value?.nodeType, evaluationExecutorKind.value)
  return selectedStageData.value?.nodeType === 'evaluation' && activeTab.value !== 'fill' ? { ...rule, itemSettingsEnabled: false } : rule
})
const configuredSettingsVisible = ref(false)
const hasActiveConfiguredSettings = computed(() => Boolean(selectedConfiguredId.value) && configuredSettingsVisible.value)
const allowedContentTypes = computed(() => activeStageContentRule.value.allowedContentTypes)
const allowedContentTypeList = computed(() => [...allowedContentTypes.value])
const availableContentCandidates = computed(() => {
  const pool = new Map(contentLibrary.value.map(content => [contentIdentity(content), content]))
  if (isResultView.value) finalContents.value.forEach(content => pool.set(contentIdentity(content), content))
  return [...pool.values()].filter(content => allowedContentTypes.value.includes(content.type as AssessmentContentType)).map(content => {
    const normalized = normalizeRatingContent(content)
    return { ...normalized, id: contentIdentity(normalized) }
  }) as Array<AssessmentContentDraft & { id: string }>
})
const defaultRootSettings = (allowView = false): WorkSummaryRootSettings => ({ hideDescription: false, allowMultiple: false, ...(allowView ? { allowView: true } : {}) })
const defaultItemSettings = (): WorkSummaryItemSettings => ({ mode: 'fill', required: true, hideName: false })
function normalizeRootSettings(value: unknown, allowView = false): WorkSummaryRootSettings {
  const settings = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return { ...settings, hideDescription: settings.hideDescription === true, allowMultiple: settings.allowMultiple === true, ...(allowView ? { allowView: settings.allowView !== false } : {}) }
}
function normalizeItemSettings(value: unknown, allowView = false): WorkSummaryItemSettings {
  const settings = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const mode = settings.mode === 'hidden' ? 'hidden' : allowView && settings.mode === 'view' ? 'view' : 'fill'
  return { ...settings, mode, required: settings.required !== false, hideName: settings.hideName === true }
}
function isReferenceContent(contentId: string) {
  return isReferenceTab.value || Boolean(referenceContentMeta.value[contentId]) || (isResultView.value && resultReferenceContents.value.some(content => content.id === contentId))
}
function rootSettingFor(contentId: string): WorkSummaryRootSettings {
  if (isReferenceContent(contentId)) return rootSettings.value[contentId] || { ...defaultRootSettings(true), allowView: true }
  const allowView = activeStageContentRule.value.rootSettingsVariant === 'result-view-root'
  return rootSettings.value[contentId] || defaultRootSettings(allowView)
}
function itemSettingsForContent(contentId: string): Record<string, WorkSummaryItemSettings> {
  const reference = isReferenceContent(contentId)
  const contents = isResultView.value ? resultReferenceContents.value : configuredContents.value
  const content = reference ? contents.find(item => item.id === contentId) : configuredContents.value.find(item => item.id === contentId)
  if (reference) return Object.fromEntries((content?.items || []).map(item => [item.id, itemSettings.value[`${contentId}:${item.id}`] || { mode: 'view', required: false, allowView: true, hideName: false, hideDescription: false }]))
  return Object.fromEntries((content?.items || []).map((item) => [item.id, itemSettings.value[`${contentId}:${item.id}`] || defaultItemSettings()]))
}
function setRootSettingsForContent(contentId: string, settings: WorkSummaryRootSettings) {
  rootSettings.value[contentId] = settings
  if (!isCalibration.value || !selectedWorkflowNode.value || pageNameLocked.value) return
  const overrides = selectedWorkflowNode.value.calibration_settings || {}
  selectedWorkflowNode.value.calibration_settings = {
    ...overrides,
    [contentId]: {
      ...overrides[contentId],
      settings: { hideDescription: settings.hideDescription === true },
    },
  }
}
function setItemSettingsForContent(contentId: string, settings: Record<string, WorkSummaryItemSettings>) {
  if (isCalibration.value) {
    const node = selectedWorkflowNode.value
    const content = configuredContents.value.find(content => content.id === contentId)
    if (!node || !content || pageNameLocked.value) return
    const overrides = node.calibration_settings || {}
    const items = { ...overrides[contentId]?.items }
    content.items.filter(item => supportsCalibrationItemSettings(content, item)).forEach(item => {
      const current = itemSettings.value[`${contentId}:${item.id}`] || defaultItemSettings()
      const next = { ...current, ...(settings[item.id] || {}) }
      const allowModify = next.allowModify !== false
      const override = { ...items[item.id], allowModify }
      const variant = getItemSettingsVariant(content, item)
      if (variant === 'custom-text' || variant === 'custom-tag') override.hideName = next.hideName === true
      if (variant === 'custom-tag') override.hideDescription = next.hideDescription === true
      if (variant === 'rating') override.levelRulesEnabled = next.levelRulesEnabled === true
      items[item.id] = override
      itemSettings.value[`${contentId}:${item.id}`] = next
    })
    node.calibration_settings = { ...overrides, [contentId]: { ...overrides[contentId], items } }
    return
  }
  Object.entries(settings).forEach(([itemId, value]) => { itemSettings.value[`${contentId}:${itemId}`] = value })
}
function updateConfiguredContent(index: number, content: AssessmentContentDraft & { id: string }) {
  configuredContents.value = configuredContents.value.map((item, itemIndex) => itemIndex === index ? content : item)
}
function updateReferenceContent(contentId: string, content: AssessmentContentDraft & { id: string }) {
  if (isResultView.value) {
    resultReferenceContents.value = resultReferenceContents.value.map(item => item.id === contentId ? content : item)
    return
  }
  updateConfiguredContent(configuredContents.value.findIndex(item => item.id === contentId), content)
}
function setConfiguredExpanded(contentId: string, expanded: boolean) {
  const next = new Set(configuredExpandedIds.value)
  expanded ? next.add(contentId) : next.delete(contentId)
  configuredExpandedIds.value = next
}
watch(selectedStageData, () => { activeTab.value = availableTabs.value[0].key })
function handleContentDrawerVisibility(open: boolean) {
  contentDrawerOpen.value = open
  if (!open) allContentDrawerOpen.value = false
}
function openAllContentDrawer() {
  syncSelectedStageContents()
  allContentDrawerOpen.value = true
  contentDrawerOpen.value = true
}
function handleContentAction(key: string) {
  syncSelectedStageContents()
  if (key === 'add-prompt') {
    editingPrompt.value = null
    promptModalOpen.value = true
    return
  }
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
  loadSelectedStageContents()
}
function handlePromptSave(value: PerformancePromptValue) {
  if (!selectedStage.value || !value.content.trim()) return
  const id = editingPrompt.value?.id || `prompt-${Date.now()}-${++promptCounter}`
  const prompt: AssessmentContentDraft & { id: string } = { ...editingPrompt.value, id, type: 'prompt', name: value.title.trim() || '提示', description: '', items: [], prompt: cloneContent(value), content_id: id, content_slot: activeTab.value as PerformanceTemplateContent['content_slot'] }
  const contents = serializeConfiguredContents()
  const next = editingPrompt.value ? contents.map(content => contentIdentity(content) === id ? prompt : content) : [...contents, prompt]
  setConfiguredContents(next, isResultView.value)
  mergeContentLibrary([prompt])
  const node = workflowNodes.value.find((item) => item.node_id === selectedStage.value)
  if (node) replaceNodeContentSlot(node, activeTab.value, serializeConfiguredContents())
  promptModalOpen.value = false
}
function normalizeConfiguredContents(contents: PerformanceTemplateContent[]) {
  const unique = new Map<string, AssessmentContentDraft & { id: string }>()
  contents.forEach((rawContent, index) => {
    const content = normalizeRatingContent(cloneContent(rawContent))
    const baseId = content.content_id || content.id || `${content.type}-${content.name}`
    let id = baseId
    let suffix = index + 1
    while (unique.has(id)) id = `${baseId}-${suffix++}`
    unique.set(id, { ...content, id, content_id: id, items: (content.items || []).map(item => ({ ...item })) } as AssessmentContentDraft & { id: string })
  })
  return [...unique.values()]
}
function setConfiguredContents(contents: PerformanceTemplateContent[], preserveReferenceSettings = false) {
  configuredContents.value = normalizeConfiguredContents(contents)
  const allContents = [...configuredContents.value, ...(isResultView.value ? resultReferenceContents.value : [])]
  configuredExpandedIds.value = new Set(allContents.map(content => content.id))
  rootSettings.value = Object.fromEntries(allContents.map(content => [content.id, preserveReferenceSettings && isReferenceContent(content.id) && rootSettings.value[content.id] || normalizeRootSettings(content.settings, isReferenceContent(content.id) || activeStageContentRule.value.rootSettingsVariant === 'result-view-root')]))
  itemSettings.value = Object.fromEntries(allContents.flatMap(content => content.items.map(item => {
    const reference = isReferenceContent(content.id)
    const allowView = reference ? supportsResultViewSettings(content, item) : (activeTab.value === 'fill' || isCalibration.value) && supportsStageItemView(selectedStageData.value?.nodeType, content, item)
    return [`${content.id}:${item.id}`, preserveReferenceSettings && reference && itemSettings.value[`${content.id}:${item.id}`] || (reference ? { ...normalizeItemSettings(item.settings, true), mode: 'view' as const, required: false } : normalizeItemSettings(item.settings, allowView))]
  })))
}
function mergeContentLibrary(contents: PerformanceTemplateContent[]) {
  const next = new Map(contentLibrary.value.map((content) => [content.content_id || content.id || `${content.type}-${content.name}`, content]))
  contents.forEach((rawContent) => {
    const content = normalizeRatingContent(cloneContent(rawContent))
    const contentId = content.content_id || content.id || `${content.type}-${content.name}`
    const { content_slot: _slot, ...libraryContent } = content
    if (!next.has(contentId)) next.set(contentId, { ...libraryContent, content_id: contentId })
  })
  contentLibrary.value = [...next.values()]
}
function serializeConfiguredContents(slot = activeTab.value): PerformanceTemplateContent[] {
  return cloneContent(configuredContents.value.map(({ id, ...content }) => ({
    ...content,
    id,
    content_id: content.content_id || id,
    content_slot: slot as PerformanceTemplateContent['content_slot'],
    settings: content.type !== 'prompt' && activeStageContentRule.value.rootSettingsEnabled ? rootSettingFor(id) : content.settings,
    items: content.items.map(({ settings, ...item }) => ({
      ...item,
      settings: item.kind !== 'prompt' && activeStageContentRule.value.itemSettingsEnabled && (selectedStageData.value?.nodeType !== 'evaluation' || supportsEvaluationItemSettings(content, item))
        && (!isResultView.value || supportsResultViewSettings(content, item))
        ? normalizeItemSettings(itemSettings.value[`${id}:${item.id}`] || settings, slot === 'fill' && supportsStageItemView(selectedStageData.value?.nodeType, content, item))
        : settings,
    })),
  })))
}
function replaceNodeContentSlot(node: PerformanceWorkflowNode, slot: string, contents: PerformanceTemplateContent[]) {
  const retained = (node.content || []).filter((content) => (content.content_slot || 'fill') !== slot)
  node.content = [...retained, ...contents]
  node.content_bindings = { ...(node.content_bindings || {}), [slot]: contents.map((content) => content.content_id || content.id || `${content.type}-${content.name}`) }
}
function syncSelectedStageContents() {
  if (!selectedStage.value || isCalibration.value) return
  const node = workflowNodes.value.find((item) => item.node_id === selectedStage.value)
  if (!node) return
  if (isReferenceTab.value || isResultView.value) {
    replaceNodeContentSlot(node, 'reference', serializeReferenceRelations())
    if (isReferenceTab.value) return
  }
  replaceNodeContentSlot(node, activeTab.value, serializeConfiguredContents())
}
function loadSelectedStageContents() {
  const node = selectedWorkflowNode.value
  if (isReferenceTab.value) {
    resultReferenceContents.value = []
    setConfiguredContents(resolveReferenceContents())
    return
  }
  if (isResultView.value) resultReferenceContents.value = normalizeConfiguredContents(resolveReferenceContents())
  else referenceContentMeta.value = {}
  setConfiguredContents(node?.node_type === 'calibration' ? calibrationContents.value : node?.content?.filter(content => (content.content_slot || 'fill') === activeTab.value) || [])
}
function selectStage(id: string) {
  clearContentSelection()
  syncSelectedStageContents()
  selectedStage.value = id
  const node = workflowNodes.value.find((item) => item.node_id === id)
  activeTab.value = getStageContentTabs(node?.node_type, getEvaluationExecutorKind(node?.executor_label, node?.executor_types))[0]?.key || 'fill'
  loadSelectedStageContents()
  selectedConfiguredId.value = null
  configuredHoverKey.value = null
}
function handleContentConfirm(contents: AssessmentContentDraft[]) {
  if (isReferenceTab.value) return
  if (isResultView.value && contents.some(content => !finalContentIds.value.includes(content.content_id || content.id || `${content.type}-${content.name}`))) return
  const localContents = serializeConfiguredContents()
  const nextContents = isResultView.value ? contents.map(content => {
    const source = finalContents.value.find(item => contentIdentity(item) === contentIdentity(content))!
    const local = localContents.find(item => contentIdentity(item) === contentIdentity(content))
    return { ...source, settings: local?.settings ?? source.settings, items: source.items.map(item => {
      const localItem = local?.items.find(candidate => candidate.id === item.id)
      return { ...item, settings: localItem?.settings ?? item.settings }
    }) }
  }) : contents as PerformanceTemplateContent[]
  const pending = [...nextContents]
  const ordered: PerformanceTemplateContent[] = []
  localContents.forEach(content => {
    if (content.type === 'prompt') ordered.push(content)
    else if (pending.length) ordered.push(pending.shift()!)
  })
  setConfiguredContents([...ordered, ...pending], isResultView.value)
  mergeContentLibrary(configuredContents.value)
  const node = workflowNodes.value.find((item) => item.node_id === selectedStage.value)
  if (node) replaceNodeContentSlot(node, activeTab.value, serializeConfiguredContents())
  selectedConfiguredId.value = null
  configuredHoverKey.value = null
  if (!selectedStage.value) selectedStage.value = stages.value.find((stage) => stage.nodeType === 'evaluation')?.id || null
  contentDrawerOpen.value = false
}
function handleReferenceConfirm(selected: string[]) {
  syncSelectedStageContents()
  const pool = new Map<string, ReferenceOption & { kind: 'node' | 'more' }>()
  referenceNodeCandidates.value.forEach((option) => pool.set(option.value, { ...option, kind: 'node' }))
  referenceMoreOptions.forEach((option) => pool.set(option.value, { ...option, kind: 'more' }))
  const contents: PerformanceTemplateContent[] = selected.flatMap((value) => {
    const option = pool.get(value)
    if (!option) return []
    return [{ type: 'reference', name: option.label, description: option.description || '', content_id: `reference-${value}`, reference_kind: option.kind, reference_value: value, items: [] } as PerformanceTemplateContent]
  })
  const node = workflowNodes.value.find((item) => item.node_id === selectedStage.value)
  const existing = new Map(referenceRelations.value.map(content => [content.reference_value, content]))
  const selectedContents = [...referenceRelations.value.filter(content => selected.includes(content.reference_value || '')), ...contents.filter(content => !existing.has(content.reference_value || ''))]
  const relations = selectedContents.map(content => ({
    ...existing.get(content.reference_value || ''),
    ...content,
    content_slot: 'reference' as const,
    reference_settings: existing.get(content.reference_value || '')?.reference_settings || { content_settings: {} },
  }))
  if (node) {
    replaceNodeContentSlot(node, 'reference', relations)
    if (isResultView.value && node.content_region_order) node.content_region_order = contentRegions.value.map(region => region.id)
  }
  loadSelectedStageContents()
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
  syncSelectedStageContents()
  if (content.type === 'prompt') {
    editingPrompt.value = cloneContent(content)
    promptModalOpen.value = true
    return
  }
  contentDrawerOpen.value = true
  if (isResultView.value) return
  void nextTick(() => contentLayerRef.value?.openEditor(content))
}
function refreshRatingSnapshots() {
  syncSelectedStageContents()
  workflowNodes.value = workflowNodes.value.map(node => ({ ...node, content: node.content?.map(content => normalizeRatingContent(content)) }))
  contentLibrary.value = contentLibrary.value.map(content => normalizeRatingContent(content))
  loadSelectedStageContents()
}
function applyWorkflowNodes(nodes: PerformanceWorkflowNode[], library: PerformanceTemplateContent[] = []) {
  workflowNodes.value = cloneContent(nodes).map(node => {
    const contents = [...(node.content || [])]
    Object.entries(node.content_bindings || {}).forEach(([slot, ids]) => ids.forEach(id => {
      if (!contents.some(content => contentIdentity(content) === id && (content.content_slot || 'fill') === slot)) {
        const content = library.find(item => contentIdentity(item) === id)
        if (content) contents.push({ ...cloneContent(content), content_slot: slot as PerformanceTemplateContent['content_slot'] })
      }
    }))
    return { ...node, content: contents.map(content => normalizeRatingContent({ ...content, items: content.items || [] })) }
  })
  const merged = new Map<string, PerformanceTemplateContent>()
  library.forEach((content) => { const normalized = normalizeRatingContent(cloneContent(content)); merged.set(contentIdentity(normalized), normalized) })
  workflowNodes.value.flatMap((node) => node.content || []).forEach((content) => {
    const contentId = content.content_id || content.id || `${content.type}-${content.name}`
    if (!merged.has(contentId)) merged.set(contentId, { ...cloneContent(content), content_id: contentId })
  })
  contentLibrary.value = [...merged.values()]
  stages.value = nodes.map((node, index) => ({ id: node.node_id || `${node.node_type}-${index}`, nodeType: node.node_type, icon: iconByType[node.node_type] || '▧', title: node.name, executor: node.executor_label, executorTypes: node.executor_types || [] }))
}
async function save() {
  if (!props.templateId) return
  syncSelectedStageContents()
  const invalidPage = workflowNodes.value.find(node => node.content_page_name != null && (!node.content_page_name.trim() || node.content_page_name.trim().length > 100))
  if (invalidPage?.node_id) {
    selectStage(invalidPage.node_id)
    await nextTick()
    selectPageHeading()
    pageNameError.value = '页面名称长度必须为 1-100'
    await nextTick()
    document.getElementById('content-page-name')?.focus()
    throw new Error(pageNameError.value)
  }
  const nodes = cloneContent(workflowNodes.value.map((node) => ({ ...node, ...(node.content_page_name != null ? { content_page_name: node.content_page_name.trim() } : {}), content: node.content ? node.content.map((content) => ({ ...content, items: content.items || [] })) : [] })))
  const response = await performanceTemplateApi.updateWorkflow(props.templateId, { nodes, content_library: cloneContent(contentLibrary.value) })
  applyWorkflowNodes(response.nodes || [], response.content_library || [])
  loadSelectedStageContents()
  pageNameLocked.value = (response.usage_summary?.cycle_count || 0) > 0 || response.editable_scope?.workflow === false
}
defineExpose({ save })
onMounted(async () => {
  if (!props.templateId) return
  void loadRatingOptions()
  void loadTagOptions()
  loading.value = true
  try { const data = await performanceTemplateApi.getWorkflow(props.templateId); applyWorkflowNodes(data.nodes || [], data.content_library || []); pageNameLocked.value = (data.usage_summary?.cycle_count || 0) > 0 || data.editable_scope?.workflow === false } finally { loading.value = false }
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
  gap: 4px;
  height: 26px;
  padding: 2px 4px;
  border: 0;
  border-radius: var(--performance-button-radius);
  background: transparent;
  color: var(--color-text-primary);
  font: var(--performance-button-font-weight) var(--performance-button-font-size)/var(--performance-button-line-height) var(--font-sans);
  cursor: pointer;
  transition: color var(--duration-fast) var(--ease-standard), background-color var(--duration-fast) var(--ease-standard);
}

.all-content-button:hover {
  background: var(--performance-button-text-hover-background);
}

.all-content-button:active {
  background: var(--performance-button-text-active-background);
}

.all-content-button:focus-visible {
  outline: 0;
  box-shadow: var(--performance-button-focus-ring);
}

.all-content-button svg {
  display: block;
  flex: 0 0 14px;
  width: 14px;
  height: 14px;
}

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

.result-reconsideration-section{width:var(--performance-content-width);max-width:100%;border-radius:4px;background:var(--color-bg-card);overflow:hidden}
.result-reconsideration-section__frame{display:block;min-height:120px;padding:8px 0 0;box-sizing:border-box;border-radius:4px;background:var(--color-bg-card);cursor:pointer}
.result-reconsideration-section__header{position:relative;display:flex;align-items:flex-start;min-height:56px;padding:16px 24px;box-sizing:border-box}
.result-reconsideration-section__header :deep(.performance-assessment-preview-header){flex:1;min-width:0;margin:0;padding-left:10px}
.result-reconsideration-section__header :deep(.performance-assessment-preview-header::before){top:5px;width:2px;height:14px}
.result-reconsideration-section__collapse{flex:0 0 24px;margin-left:auto}
.result-reconsideration-section__body{height:102px;padding:12px 24px;box-sizing:border-box}
.result-reconsideration-section__preview{width:284px;height:54px;padding:16px;box-sizing:border-box;border-radius:6px;background:#f5f6f7;color:#1f2329;font:400 14px/22px var(--font-sans);white-space:pre-wrap;overflow-wrap:anywhere}
.result-view-section{position:relative;width:800px;max-width:100%;overflow:visible;border-radius:4px;background:var(--color-bg-card)}
.result-view-section__overlay{position:absolute;inset:0;z-index:30;box-sizing:border-box;border:1px dashed transparent;border-radius:4px;opacity:0;pointer-events:none}
.result-view-section__overlay.is-hovered{border-color:#3370ff;opacity:1}
.result-view-section__overlay.is-selected{border:2px solid #3370ff;opacity:1}
.result-view-section__content{position:relative;z-index:1}
.result-view-section__title{cursor:pointer}
.result-view-section__configured-content{position:relative;z-index:1;width:100%;max-width:none}
.result-view-content-footer{margin-top:var(--spacing-3)}
.result-view-section h2{margin:0;padding:var(--spacing-4) var(--spacing-6);color:var(--color-text-primary);font:600 18px/26px var(--font-sans)}
.result-view-section__empty{padding:var(--spacing-8) var(--spacing-6);border-top:1px solid var(--performance-popover-border);color:var(--color-text-placeholder);font:400 var(--font-size-md)/22px var(--font-sans);text-align:center;overflow-wrap:anywhere}
.result-view-reference-entry{margin-top:var(--spacing-3);border-radius:var(--radius-sm)}
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
  position: relative;
  z-index: 31;
  pointer-events: none;
  width: 100%;
  height: var(--hairline);
  margin: 0 0 20px;
  flex-shrink: 0;
  background: rgba(31, 35, 41, 0.15);
}

.page-name-settings{padding:4px 24px 0;color:#1f2329;font:400 14px/22px var(--font-sans)}
.page-name-settings__label{display:block;min-width:0;margin-bottom:8px;font-weight:600;line-height:22px}
.page-name-settings__required{display:inline;width:8px;height:8px;margin:4px 0 4px 2px;vertical-align:text-bottom;fill:var(--color-text-danger-strong)}
.page-name-settings :deep(.native-input){font:400 14px/22px var(--font-sans)}
.page-name-settings :deep(.feishu-input-wrap:has(.error)){border-color:var(--performance-field-border-invalid)}
.page-name-settings__error{display:block;margin-top:4px;color:var(--performance-field-error-color);font-size:14px;line-height:22px}
.text-normal__body { margin-top: 212px; color: #8f959e; font-size: 14px; line-height: 22px; text-align: center; }
.configured-content-section { width: var(--performance-content-width); max-width: 100%; margin: 0; padding: 0; border: 0; border-radius: 4px; background: #fff; overflow: visible; }
.configured-content-sortable-list { width: 100%; }
.configured-content-sortable-list :deep(.performance-sortable-list__placeholder) { border: 0; background: transparent; }
.configured-content-footer { position: sticky; z-index: 20; bottom: 0; width: 100%; margin-top: 0; border-radius: 0 0 4px 4px; }
</style>
