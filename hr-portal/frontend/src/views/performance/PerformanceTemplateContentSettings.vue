<template>
  <div class="content-settings-page">
    <aside class="stage-panel" aria-label="按评估流程配置">
      <div class="stage-panel__header">
        <strong>按评估流程配置</strong>
        <button class="all-content-button" type="button" aria-label="全部内容"><span aria-hidden="true">▱</span>全部内容</button>
      </div>
      <div class="stage-list" aria-live="polite">
        <div v-if="loading" class="stage-loading">加载流程节点中…</div>
        <button v-for="stage in stages" :key="stage.id" type="button" class="stage-card" :class="{ selected: selectedStage === stage.id }" @click="selectedStage = stage.id">
          <span class="stage-card__icon" aria-hidden="true"><PerformanceWorkflowStageIcon :type="stage.nodeType" /></span>
          <span class="stage-card__copy"><span class="stage-card__title">{{ stage.title }}</span><span class="stage-card__executor">执行人：{{ stage.executor }}</span></span>
        </button>
      </div>
    </aside>

    <section class="content-canvas" :aria-label="activeTabLabel">
      <div class="content-tabs" role="tablist">
        <button v-for="tab in availableTabs" :key="tab.key" class="content-tab" :class="{ 'content-tab--active': activeTab === tab.key }" role="tab" :aria-selected="activeTab === tab.key" type="button" @click="activeTab = tab.key">{{ tab.label }}</button>
        <div class="content-tabs__divider" aria-hidden="true"></div>
      </div>
      <div v-if="selectedStageData" class="content-pane">
        <PerformanceTemplateSectionCard :title="selectedStageTitle" :actions="summaryActions" @action="handleContentAction" />
      </div>
      <div v-else class="content-card content-card--result">
        <div class="content-card__head"><strong>绩效结果查看</strong><span class="drag-dots" aria-hidden="true">⠿</span></div>
        <div class="content-card__body">此区域应添加终评环节执行人「直属上级」填写的内容</div>
        <div class="content-card__actions"><button type="button">＋ 添加终评内容</button><i aria-hidden="true"></i><button type="button">＋ 添加提示</button></div>
      </div>
      <div class="content-card content-card--reference"><button type="button">▣ 添加其他参考内容</button></div>
    </section>

    <aside class="text-normal" aria-label="内容设置">
      <div class="text-normal__title">内容设置</div>
      <div class="text-normal__divider" aria-hidden="true"></div>
      <div class="text-normal__body"><span v-if="selectedStage === null">暂未选择内容</span><span v-else>暂未选择内容</span></div>
    </aside>
    <PerformancePromptModal v-model:open="promptModalOpen" @save="handlePromptSave" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { performanceTemplateApi, type PerformanceWorkflowNode } from '@/api/performance'
import PerformanceWorkflowStageIcon from './PerformanceWorkflowStageIcon.vue'
import PerformanceTemplateSectionCard from '@/components/performance/PerformanceTemplateSectionCard.vue'
import PerformancePromptModal from '@/components/performance/PerformancePromptModal.vue'

const props = defineProps<{ templateId?: number | null }>()

const selectedStage = ref<string | null>(null)
const activeTab = ref('fill')
const loading = ref(false)
const stages = ref([
  { id: 'summary', nodeType: 'work_summary', icon: '▧', title: '工作总结环节', executor: '被评估人' },
  { id: 'invite', nodeType: 'reviewer_360_invite', icon: '▤', title: '360°邀请环节', executor: '被评估人' },
  { id: 'confirm', nodeType: 'reviewer_360_confirm', icon: '▥', title: '360°确认环节', executor: '直属上级' },
  { id: 'evaluation', nodeType: 'evaluation', icon: '360', title: '评估型环节', executor: '360°评估人' },
  { id: 'calibration', nodeType: 'calibration', icon: '⌁', title: '校准环节', executor: '在项目配置时指定' },
  { id: 'communication', nodeType: 'result_communication', icon: '▣', title: '结果沟通', executor: '直属上级' },
  { id: 'evaluation-manager', nodeType: 'evaluation', icon: '⌘', title: '评估型环节', executor: '直属上级' },
])
const iconByType: Record<string, string> = { reviewer_360_invite: '▤', reviewer_360_confirm: '▥', evaluation: '360', calibration: '⌁', result_communication: '▣', result_view: '⌑', result_reconsideration: '↻' }
const selectedStageData = computed(() => stages.value.find((stage) => stage.id === selectedStage.value) || null)
const selectedStageTitle = computed(() => selectedStageData.value?.title || '')
const summaryActions = [{ key: 'add-content', label: '添加内容' }, { key: 'add-prompt', label: '添加提示' }]
const promptModalOpen = ref(false)
const availableTabs = computed(() => {
  const type = selectedStageData.value?.nodeType
  if (type === 'work_summary') return [{ key: 'fill', label: '配置填写内容' }]
  if (type === 'result_view') return [{ key: 'view', label: '配置查看内容' }]
  return [{ key: 'fill', label: '配置填写内容' }, { key: 'reference', label: '配置参考内容' }]
})
const activeTabLabel = computed(() => availableTabs.value.find((tab) => tab.key === activeTab.value)?.label || availableTabs.value[0].label)
watch(selectedStageData, () => { activeTab.value = availableTabs.value[0].key })
function handleContentAction(key: string) {
  if (key === 'add-prompt') promptModalOpen.value = true
}
function handlePromptSave() {
  promptModalOpen.value = false
}
function applyWorkflowNodes(nodes: PerformanceWorkflowNode[]) {
  stages.value = nodes.map((node, index) => ({ id: node.node_id || `${node.node_type}-${index}`, nodeType: node.node_type, icon: iconByType[node.node_type] || '▧', title: node.name, executor: node.executor_label }))
}
onMounted(async () => {
  if (!props.templateId) return
  loading.value = true
  try { const data = await performanceTemplateApi.getWorkflow(props.templateId); applyWorkflowNodes(data.nodes || []) } finally { loading.value = false }
})
</script>

<style scoped>
.content-settings-page {
  --header-text-top: 20px;
  --hairline: 0.666667px;
  display: grid;
  grid-template-columns: 320px 640px 320px;
  min-width: 1280px;
  flex: 1;
  min-height: 0;
  background: #f5f6f7;
  color: #1f2329;
  font: 400 14px/21px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif;
}

.stage-panel {
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
  height: 46px;
  margin-top: 8px;
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

.content-card { margin-top: 20px; border-radius: 8px; background: #fff; }
.content-card--result { overflow: hidden; }
.content-card__head { position: relative; display: flex; align-items: center; justify-content: center; height: 88px; border-bottom: 1px solid #dee0e3; }
.content-card__head strong { font-size: 24px; font-weight: 600; }
.drag-dots { position: absolute; top: 8px; color: #646a73; font-size: 24px; letter-spacing: -5px; }
.content-card__body { display: flex; align-items: center; justify-content: center; height: 153px; color: #8f959e; font-size: 18px; }
.content-card__actions { display: flex; align-items: center; justify-content: center; height: 82px; gap: 32px; }
.content-card__actions button,
.content-card--reference button { border: 0; background: transparent; color: #3370ff; font-size: 18px; cursor: pointer; }
.content-card__actions i { width: 1px; height: 24px; background: #bbbfc4; }
.content-card--reference { display: flex; align-items: center; justify-content: center; height: 82px; }

.text-normal {
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
</style>
