<template>
  <FullScreenModal v-if="modelValue" title="评分公式管理" :show-footer="false" @back="close">
    <PerformanceContentSurface variant="table" class="formula-management-surface" aria-label="评分公式管理内容">
      <div class="formula-management-toolbar">
        <PerformanceCreateButton variant="text" label="新建评分公式" @click="openCreateDialog" />
        <div class="formula-management-toolbar-spacer" />
        <PerformanceSearchInput
          v-model="keyword"
          placeholder="搜索"
          aria-label="搜索评分公式"
          width="222px"
          @search="emit('search', keyword)"
        />
        <PerformanceFilterButton label="筛选" aria-label="筛选评分公式" @click="emit('filter')" />
      </div>

      <PerformanceManagementTable
        :rows="filteredRows"
        :loading="false"
        loading-text="正在加载评分公式"
        empty-text="暂无数据"
        table-aria-label="评分公式列表"
        pagination-aria-label="评分公式分页"
        :show-pagination="false"
      >
        <el-table-column prop="name" label="名称" width="300" />
        <el-table-column prop="metrics" label="使用此公式的指标库指标" width="300" />
        <el-table-column prop="updatedBy" label="更新人" width="250" />
        <el-table-column prop="updatedAt" label="最近更新时间" width="446" />
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <PerformanceButton variant="text" size="small" @click="emit('edit', row)">编辑</PerformanceButton>
          </template>
        </el-table-column>

        <template #empty>
          <div class="formula-management-empty" role="status">
            <MetricTemplateEmptyIllustration />
            <div>暂无数据</div>
          </div>
        </template>
      </PerformanceManagementTable>
    </PerformanceContentSurface>

    <PerformanceMetricFormulaCreateDialog
      v-model="createDialogOpen"
      @confirm="emit('confirm', $event)"
      @cancel="emit('cancel-create')"
      @help="emit('help')"
      @insert="emit('insert', $event)"
    />
  </FullScreenModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import FullScreenModal from './FullScreenModal.vue'
import MetricTemplateEmptyIllustration from './MetricTemplateEmptyIllustration.vue'
import PerformanceButton from './PerformanceButton.vue'
import PerformanceContentSurface from './PerformanceContentSurface.vue'
import PerformanceCreateButton from './PerformanceCreateButton.vue'
import PerformanceFilterButton from './PerformanceFilterButton.vue'
import PerformanceManagementTable from './PerformanceManagementTable.vue'
import PerformanceMetricFormulaCreateDialog, { type PerformanceFormulaDraft } from './PerformanceMetricFormulaCreateDialog.vue'
import PerformanceSearchInput from './PerformanceSearchInput.vue'
import type { PerformanceFormulaResource } from './PerformanceFormulaEditor.vue'

export interface PerformanceFormulaRow {
  id: number | string
  name: string
  metrics?: string
  updatedBy?: string
  updatedAt?: string
}

const props = withDefaults(defineProps<{
  modelValue: boolean
  rows?: PerformanceFormulaRow[]
}>(), {
  rows: () => [],
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  back: []
  create: []
  confirm: [value: PerformanceFormulaDraft]
  'cancel-create': []
  help: []
  insert: [resource: PerformanceFormulaResource]
  filter: []
  search: [keyword: string]
  edit: [row: PerformanceFormulaRow]
}>()

const keyword = ref('')
const createDialogOpen = ref(false)
const filteredRows = computed(() => {
  const normalizedKeyword = keyword.value.trim().toLowerCase()
  if (!normalizedKeyword) return props.rows
  return props.rows.filter(row => `${row.name} ${row.metrics ?? ''}`.toLowerCase().includes(normalizedKeyword))
})

function openCreateDialog() {
  createDialogOpen.value = true
  emit('create')
}

function close() {
  createDialogOpen.value = false
  emit('back')
  emit('update:modelValue', false)
}

watch(() => props.modelValue, value => {
  if (!value) createDialogOpen.value = false
})
</script>

<style scoped>
.formula-management-surface { display: flex; min-height: 100%; flex: 1; flex-direction: column; }
.formula-management-toolbar { display: flex; align-items: center; min-height: var(--performance-control-height); margin-bottom: var(--spacing-4); }
.formula-management-toolbar-spacer { flex: 1; }
.formula-management-toolbar :deep(.performance-create-button) { min-width: var(--performance-formula-create-button-width); }
.formula-management-toolbar :deep(.performance-search-input) { flex: 0 0 222px; }
.formula-management-toolbar :deep(.filter-button) { margin-left: var(--spacing-3); }
.formula-management-empty { display: flex; min-height: 420px; flex-direction: column; align-items: center; justify-content: center; color: var(--color-text-primary); font-size: var(--font-size-md); line-height: 22px; text-align: center; }
.formula-management-empty :deep(.metric-template-empty-illustration) { display: block; width: 250px; height: 125px; margin-bottom: var(--spacing-4); }
@media (max-width: 720px) {
  .formula-management-surface { padding: var(--spacing-4); }
  .formula-management-toolbar { flex-wrap: wrap; gap: var(--spacing-2); }
  .formula-management-toolbar-spacer { display: none; }
  .formula-management-toolbar :deep(.performance-search-input) { flex: 1 1 180px; }
  .formula-management-toolbar :deep(.filter-button) { margin-left: 0; }
}
</style>
