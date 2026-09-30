<template>
  <PerformanceListPage title="指标库" class="performance-metric-library">
    <template #title-actions>
      <div class="metric-library-heading-actions" aria-label="指标库辅助入口">
        <PerformanceButton
          class="metric-fields-button"
          aria-label="字段管理"
          @click="fieldManagementOpen = true"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" data-icon="StyleOutlined" aria-hidden="true">
            <path d="M8.437 4.898 5.447 13h6.063L8.437 4.898Zm6.025 15.881L12.269 15h-7.56l-2.131 5.78a1 1 0 1 1-1.873-.703L7.02 2.982c.491-1.31 2.344-1.31 2.835 0l6.48 17.095a1 1 0 1 1-1.872.702ZM15.056 5a1 1 0 1 0 0 2H23a1 1 0 1 0 0-2h-7.944Zm1.055 7a1 1 0 0 1 1-1H23a1 1 0 1 1 0 2h-5.89a1 1 0 1 1-1-2Zm3.056 5a1 1 0 1 0 0 2H23a1 1 0 0 0 0-2-0h-3.833Z" fill="currentColor" />
          </svg>
          <span>字段管理</span>
        </PerformanceButton>
        <PerformanceButton
          class="metric-formula-button"
          aria-label="公式管理"
          @click="formulaManagementOpen = true"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" data-icon="FormulaOutlined" aria-hidden="true">
            <path d="M11 6.5C11 4.011 13.028 2 15.51 2 17.98 2 20 4.002 20 6.48v.02a1 1 0 1 1-2 0v-.02A2.489 2.489 0 0 0 15.51 4 2.508 2.508 0 0 0 13 6.5V10h4a1 1 0 1 1 0 2h-4v5.5c0 2.489-2.028 4.5-4.51 4.5A4.489 4.489 0 0 1 4 17.52v-.02a1 1 0 1 1 2 0v.02A2.489 2.489 0 0 0 8.49 20 2.508 2.508 0 0 0 11 17.5V12H8a1 1 0 1 1 0-2h3V6.5Z" fill="currentColor" />
          </svg>
          <span>公式管理</span>
        </PerformanceButton>
      </div>
    </template>

    <div class="metric-library-content" aria-label="指标库内容">
      <div class="list-toolbar">
        <PerformanceCreateButton
          variant="text"
          label="新建指标"
          @click="openMetricDrawer"
        />
        <div class="toolbar-spacer"></div>
        <PerformanceSearchInput
          v-model="keyword"
          placeholder="通过名称搜索"
          aria-label="通过名称搜索指标"
          width="160px"
        />
        <PerformanceFilterButton label="筛选" @click="notifyUnavailable('筛选')" />
        <PerformanceButton
          class="metric-column-button"
          aria-label="自定义列"
          @click="columnDrawerOpen = true"
        >
          <PerformanceColumnVisibilityIcon class="metric-column-icon" />
          <span>自定义列</span>
        </PerformanceButton>
        <PerformanceButton
          class="metric-icon-button"
          aria-label="使用多维表格编辑"
          @click="notifyUnavailable('使用多维表格编辑')"
        >
          <el-icon><EditPen /></el-icon>
        </PerformanceButton>
      </div>

      <div class="metric-library-empty" role="status">
        <div class="metric-library-empty-illustration" aria-hidden="true">
          <span class="metric-library-empty-sheet"></span>
          <span class="metric-library-empty-line metric-library-empty-line--one"></span>
          <span class="metric-library-empty-line metric-library-empty-line--two"></span>
          <span class="metric-library-empty-mark"></span>
        </div>
        <strong>暂无内容</strong>
        <p>指标库中的指标可以由管理员和被评估人在添加指标时选用</p>
      </div>
    </div>

    <ProjectMemberColumnDrawer
      v-model="columnDrawerOpen"
      :columns="metricColumns"
      :selected-keys="selectedColumnKeys"
      @confirm="selectedColumnKeys = $event"
    />
    <PerformanceMetricCreateDrawer
      v-model="metricDrawerOpen"
      @confirm="handleMetricConfirm"
      @continue="handleMetricContinue"
    />
    <PerformanceMetricFieldManagementModal v-model="fieldManagementOpen" :type-api-enabled="true" />
    <PerformanceMetricFormulaManagementModal
      v-model="formulaManagementOpen"
      @confirm="handleFormulaConfirm"
      @help="notifyUnavailable('公式编辑器帮助')"
      @filter="notifyUnavailable('筛选')"
      @edit="notifyUnavailable('编辑评分公式')"
    />
  </PerformanceListPage>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { EditPen } from '@element-plus/icons-vue'
import PerformanceButton from '@/components/performance/PerformanceButton.vue'
import PerformanceCreateButton from '@/components/performance/PerformanceCreateButton.vue'
import PerformanceColumnVisibilityIcon from '@/components/performance/PerformanceColumnVisibilityIcon.vue'
import PerformanceFilterButton from '@/components/performance/PerformanceFilterButton.vue'
import PerformanceListPage from '@/components/performance/PerformanceListPage.vue'
import PerformanceSearchInput from '@/components/performance/PerformanceSearchInput.vue'
import PerformanceMetricCreateDrawer, { type PerformanceMetricDraft } from '@/components/performance/PerformanceMetricCreateDrawer.vue'
import PerformanceMetricFieldManagementModal from '@/components/performance/PerformanceMetricFieldManagementModal.vue'
import PerformanceMetricFormulaManagementModal from '@/components/performance/PerformanceMetricFormulaManagementModal.vue'
import ProjectMemberColumnDrawer, { type MemberColumnOption } from '@/components/performance/ProjectMemberColumnDrawer.vue'

const keyword = ref('')
const columnDrawerOpen = ref(false)
const metricColumns: MemberColumnOption[] = [
  { key: 'metric_name', label: '指标名称', locked: true },
  { key: 'business_definition', label: '业务定义' },
  { key: 'metric_type', label: '指标类型' },
  { key: 'owner', label: '负责人' },
  { key: 'status', label: '状态' },
]
const selectedColumnKeys = ref(metricColumns.map(column => column.key))
const metricDrawerOpen = ref(false)
const fieldManagementOpen = ref(false)
const formulaManagementOpen = ref(false)

function openMetricDrawer() { metricDrawerOpen.value = true }
function handleMetricConfirm(value: PerformanceMetricDraft) {
  void value
  ElMessage.info('指标表单已提交，保存接口待接入')
}
function handleMetricContinue(value: PerformanceMetricDraft) {
  void value
  ElMessage.info('当前指标配置已提交，保存接口待接入，可继续添加')
}

function handleFormulaConfirm(value: { name: string; formula: string }) {
  void value
  notifyUnavailable('评分公式保存')
}

function notifyUnavailable(action: string) {
  ElMessage.info(`${action}功能将在后续任务接入`)
}
</script>

<style scoped>
.metric-library-heading-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
}

.metric-library-heading-actions :deep(.performance-button) {
  min-width: var(--performance-control-height);
  height: var(--performance-control-height);
}

.metric-library-heading-actions :deep(.metric-fields-button) {
  width: var(--performance-metric-field-button-width);
  min-width: var(--performance-metric-field-button-width);
  padding-inline: var(--performance-input-padding-x);
  gap: var(--performance-metric-field-button-gap);
  border-color: var(--color-line-control);
  background: var(--color-surface-disabled);
  color: var(--color-text-primary);
}

.metric-library-heading-actions :deep(.metric-fields-button svg) {
  width: 14px;
  height: 14px;
  flex: 0 0 14px;
}

.metric-library-heading-actions :deep(.metric-formula-button) {
  width: var(--performance-metric-formula-button-width);
  min-width: var(--performance-metric-formula-button-width);
  padding-inline: var(--performance-input-padding-x);
  gap: var(--performance-metric-formula-button-gap);
  border-color: var(--color-line-control);
  background: var(--color-surface-disabled);
  color: var(--color-text-primary);
}

.metric-library-heading-actions :deep(.metric-formula-button svg) {
  width: 14px;
  height: 14px;
  flex: 0 0 14px;
}

.metric-library-heading-actions :deep(.metric-icon-button) {
  width: var(--performance-control-height);
  min-width: var(--performance-control-height);
  padding-inline: 0;
}

.metric-library-heading-actions :deep(.el-icon),
.metric-library-content :deep(.el-icon) {
  font-size: var(--performance-icon-size);
}

.metric-library-content {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.metric-library-content :deep(.list-toolbar) {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  min-height: var(--performance-control-height);
  margin-bottom: var(--spacing-4);
  white-space: nowrap;
}

.metric-library-content :deep(.list-toolbar > .performance-create-button),
.metric-library-content :deep(.list-toolbar > .performance-search-input),
.metric-library-content :deep(.list-toolbar > .performance-button) {
  flex: 0 0 auto;
  align-self: center;
}

.metric-library-content :deep(.list-toolbar > .performance-create-button),
.metric-library-content :deep(.list-toolbar > .performance-button) {
  height: var(--performance-control-height);
}

.metric-library-content :deep(.toolbar-spacer) {
  flex: 1;
}

.metric-library-content :deep(.metric-icon-button) {
  min-width: var(--performance-control-height);
  width: var(--performance-control-height);
  padding-inline: 0;
}

.metric-column-icon {
  width: var(--performance-icon-size);
  height: var(--performance-icon-size);
  margin-right: var(--spacing-1);
}

.metric-library-empty {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  color: var(--color-text-primary);
  font-size: var(--font-size-md);
  line-height: 22px;
  text-align: center;
}

.metric-library-empty-illustration {
  position: relative;
  width: 128px;
  height: 96px;
  margin-bottom: var(--spacing-4);
  color: var(--color-border-strong);
}

.metric-library-empty-sheet {
  position: absolute;
  top: 15px;
  left: 35px;
  width: 58px;
  height: 62px;
  transform: rotate(-8deg);
  border-radius: var(--radius-sm);
  background: var(--color-border-light);
  box-shadow: inset 0 0 0 2px var(--color-border-strong);
}

.metric-library-empty-sheet::before {
  position: absolute;
  top: 15px;
  left: 12px;
  width: 32px;
  height: 5px;
  border-radius: var(--radius-xs);
  background: var(--color-border-strong);
  content: '';
}

.metric-library-empty-line {
  position: absolute;
  left: 48px;
  width: 34px;
  height: 4px;
  border-radius: var(--radius-xs);
  background: var(--color-border-strong);
}

.metric-library-empty-line--one { top: 45px; }
.metric-library-empty-line--two { top: 57px; width: 24px; }

.metric-library-empty-mark {
  position: absolute;
  right: 18px;
  bottom: 13px;
  width: 22px;
  height: 22px;
  border: 5px solid var(--color-primary-light);
  border-radius: 50%;
  box-shadow: 0 0 0 2px var(--color-primary);
}

.metric-library-empty-mark::after {
  position: absolute;
  right: -11px;
  bottom: -7px;
  width: 12px;
  height: 5px;
  transform: rotate(45deg);
  border-radius: var(--radius-xs);
  background: var(--color-primary);
  content: '';
}

.metric-library-empty strong {
  font-weight: 700;
}

.metric-library-empty p {
  margin: var(--spacing-2) 0 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-md);
}

@media (max-width: 720px) {
  .metric-library-heading-actions { gap: var(--spacing-2); }
  .metric-library-content :deep(.list-toolbar) { flex-wrap: wrap; }
}
</style>
