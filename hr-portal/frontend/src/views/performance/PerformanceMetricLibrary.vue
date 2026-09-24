<template>
  <PerformanceListPage title="指标库" class="performance-metric-library">
    <template #title-actions>
      <div class="metric-library-heading-actions" aria-label="指标库辅助入口">
        <PerformanceButton
          aria-label="字段管理"
          @click="notifyUnavailable('字段管理')"
        >
          <el-icon><DataAnalysis /></el-icon>
        </PerformanceButton>
        <PerformanceButton
          aria-label="公式管理"
          @click="notifyUnavailable('公式管理')"
        >
          <el-icon><Tickets /></el-icon>
        </PerformanceButton>
      </div>
    </template>

    <div class="metric-library-content" aria-label="指标库内容">
      <div class="list-toolbar">
        <PerformanceCreateButton
          variant="text"
          label="新建指标"
          @click="notifyUnavailable('新建指标')"
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
  </PerformanceListPage>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { DataAnalysis, EditPen, Tickets } from '@element-plus/icons-vue'
import PerformanceButton from '@/components/performance/PerformanceButton.vue'
import PerformanceCreateButton from '@/components/performance/PerformanceCreateButton.vue'
import PerformanceColumnVisibilityIcon from '@/components/performance/PerformanceColumnVisibilityIcon.vue'
import PerformanceFilterButton from '@/components/performance/PerformanceFilterButton.vue'
import PerformanceListPage from '@/components/performance/PerformanceListPage.vue'
import PerformanceSearchInput from '@/components/performance/PerformanceSearchInput.vue'
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
  width: var(--performance-control-height);
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
