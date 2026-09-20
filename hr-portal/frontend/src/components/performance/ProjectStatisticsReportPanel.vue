<template>
  <section ref="root" class="project-report-root" aria-label="统计报表" :aria-busy="loading">
    <PerformanceSurfaceCard class="report-surface">
      <div class="report-wrapper" :class="{ 'directory-collapsed': collapsed }">
        <div class="report-top-spacer" aria-hidden="true" />
        <div class="report-filter-overlay">
          <div class="report-sticky-filter">
            <button type="button" class="report-filter-button" @click="requestAction('filter')"><FilterOutlinedIcon />筛选</button>
            <p v-if="feedback" class="report-feedback" role="status">{{ feedback }}</p>
          </div>
        </div>
        <div class="report-layout">
          <div class="report-contents">
            <template v-for="(group, groupIndex) in reportGroups" :key="group.key">
              <h2 class="report-primary-heading"><span>{{ group.label }}</span></h2>
              <section v-for="(section, sectionIndex) in group.sections" :key="section.key" :data-report-section="section.key" class="report-section" :aria-label="section.label">
                <h3 class="report-secondary-heading">{{ section.label }}</h3>
                <template v-if="groupIndex === 0 && sectionIndex === 0">
                  <p v-if="data?.source === 'mock'" class="report-source-notice" role="note"><strong>模拟数据</strong> · 仅供布局预览，不代表{{ cycleName || '当前周期' }}的真实绩效结果。</p>
                  <p v-else-if="data?.source === 'api'" class="report-source-notice">数据来源：统计 API</p>
                </template>
                <div v-if="section.key === 'overview'">
                  <p v-if="loading" class="report-state" role="status">正在加载统计报表…</p>
                  <div v-else-if="error" class="report-state" role="alert"><p>{{ error }}</p><button type="button" @click="load">重新加载</button></div>
                  <ProjectReportDistribution v-else-if="data" :report="data" @compare="requestAction('compare')" />
                </div>
                <ProjectReportMatrix v-else-if="section.key === 'department' && data" :report="data" />
                <p v-else-if="section.key === 'department'" class="report-placeholder">{{ loading ? '正在加载部门统计…' : '统计数据尚未加载' }}</p>
                <div v-else class="report-placeholder"><span>{{ section.label }}报表内容预留</span><small>当前仅搭建章节框架，具体统计内容待后续接入。</small></div>
              </section>
            </template>
          </div>
          <ProjectReportNavigation v-model:collapsed="collapsed" :active-key="activeKey" :menu-height="menuHeight" @select="select" />
        </div>
      </div>
    </PerformanceSurfaceCard>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import PerformanceSurfaceCard from './PerformanceSurfaceCard.vue'
import FilterOutlinedIcon from './FilterOutlinedIcon.vue'
import ProjectReportNavigation from './ProjectReportNavigation.vue'
import ProjectReportDistribution from './ProjectReportDistribution.vue'
import ProjectReportMatrix from './ProjectReportMatrix.vue'
import { mockProjectReportProvider, reportGroups, type ProjectReportProvider, type ProjectStatisticsReport } from './projectStatisticsReport'
import { useProjectReportNavigation } from './useProjectReportNavigation'

const props = defineProps<{ cycleId: number; cycleName?: string; provider?: ProjectReportProvider }>()
const emit = defineEmits<{ filter: []; compare: [] }>()
const root = ref<HTMLElement | null>(null)
const collapsed = ref(false)
const data = ref<ProjectStatisticsReport | null>(null)
const loading = ref(false)
const error = ref('')
const feedback = ref('')
const { activeKey, menuHeight, select, refresh } = useProjectReportNavigation(root)
let requestId = 0

async function load() {
  const id = ++requestId
  loading.value = true
  error.value = ''
  data.value = null
  try {
    const report = await (props.provider ?? mockProjectReportProvider)({ cycleId: props.cycleId })
    if (id === requestId) data.value = report
  } catch {
    if (id === requestId) error.value = '统计报表加载失败，请稍后重试'
  } finally {
    if (id === requestId) {
      loading.value = false
      void refresh()
    }
  }
}

function requestAction(action: 'filter' | 'compare') {
  feedback.value = action === 'filter' ? '筛选入口已预留，筛选条件尚未接入。' : '添加对比入口已预留，对比条件与计算尚未接入。'
  if (action === 'filter') emit('filter')
  else emit('compare')
}

watch(() => [props.cycleId, props.provider], () => {
  feedback.value = ''
  collapsed.value = false
  activeKey.value = 'overview'
  void load()
}, { immediate: true })
watch(collapsed, () => void refresh())
onBeforeUnmount(() => { requestId++ })
</script>

<style scoped>
.project-report-root { --report-sticky-offset: 68px; --report-sticky-top: calc(var(--report-sticky-offset) - var(--report-scroll-padding, 0px)); min-width: 0; margin-bottom: 20px; }
.report-surface { padding: 0 20px 20px; }
.report-wrapper { position: relative; min-width: 0; }
.report-top-spacer { position: sticky; top: calc(56px - var(--report-scroll-padding, 0px)); z-index: 10; height: 20px; background: #fff; }
.report-layout { display: flex; align-items: flex-start; min-width: 0; }
.report-contents { display: flex; flex: 1 1 0%; min-width: 0; flex-direction: column; margin-right: 36px; }
.directory-collapsed .report-contents { margin-right: 0; }
.report-primary-heading { position: sticky; top: var(--report-sticky-top); z-index: 10; box-sizing: border-box; height: 48px; flex: 0 0 48px; margin: 0; padding: 0 0 16px; background: #fff; font-size: 18px; font-weight: 600; line-height: 32px; }
.report-primary-heading span { display: block; max-width: calc(100% - 120px); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.report-secondary-heading { display: flex; align-items: flex-start; height: 40px; margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }
.report-section { margin-bottom: 40px; min-width: 0; }
.report-section:last-child { margin-bottom: 0; }
.report-filter-overlay { position: absolute; inset: 20px 235px 0 120px; z-index: 19; padding-right: 1px; pointer-events: none; }
.directory-collapsed .report-filter-overlay { right: 20px; }
.report-sticky-filter { position: sticky; top: var(--report-sticky-top); display: flex; justify-content: flex-end; height: 32px; pointer-events: none; }
.report-filter-button { display: inline-flex; align-items: center; justify-content: center; gap: 4px; flex: 0 0 80px; width: 80px; height: 32px; box-sizing: border-box; padding: 4px 11px; border: 1px solid #d0d3d6; border-radius: 6px; background: #fff; color: #1f2329; font: inherit; line-height: 22px; cursor: pointer; pointer-events: auto; }
.report-filter-button :deep(svg), .report-filter-button :deep(.filter-outlined-icon) { width: 14px; height: 14px; }
.report-filter-button:hover { background: #eff0f1; }
.report-filter-button:focus-visible { outline: 2px solid #3370ff; outline-offset: 2px; }
.report-source-notice { margin: 0 0 20px; color: #646a73; font-size: 12px; }
.report-source-notice strong { padding: 2px 6px; border-radius: 4px; background: #eff3ff; color: #1456f0; font-weight: 500; }
.report-feedback { position: absolute; top: 36px; right: 0; width: max-content; max-width: 100%; box-sizing: border-box; padding: 10px 12px; margin: 0; background: #f5f7fa; border: 1px solid #dee0e3; border-radius: 6px; color: #646a73; font-size: 13px; }
.report-state { padding: 24px 0; color: #646a73; text-align: center; }
.report-state button { padding: 6px 12px; border: 1px solid #d0d3d6; border-radius: 6px; background: #fff; color: #1456f0; cursor: pointer; }
.report-placeholder { display: flex; flex-direction: column; justify-content: center; gap: 8px; margin: 0; padding: 32px 20px; background: #f8f9fa; border-radius: 6px; color: #646a73; font-size: 14px; }
.report-placeholder small { font-size: 12px; color: #8f959e; }
</style>
