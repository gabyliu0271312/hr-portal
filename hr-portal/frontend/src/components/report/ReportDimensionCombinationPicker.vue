<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Refresh, Search } from '@element-plus/icons-vue'
import type { ScopeStrategy } from '@/constants/scopeStrategy'
import type { ColumnInfo } from '@/api/data'
import {
  reportsApi,
  type DimensionCombinationItem,
  type DimensionMergeTuple,
  type DimensionMergeValue,
  type ReportConfig,
} from '@/api/reports'

type DimensionColumn = ColumnInfo & { _instance_id?: string }

const props = defineProps<{
  reportId?: number | null
  datasetId: number
  scopeStrategy?: ScopeStrategy | null
  config: ReportConfig
  dimensions: DimensionColumn[]
  modelValue: DimensionMergeTuple[]
  currentRuleName?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: DimensionMergeTuple[]]
}>()

const loading = ref(false)
const error = ref('')
const items = ref<DimensionCombinationItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(50)
const filters = reactive<Record<string, DimensionMergeValue>>({})
let requestId = 0

function idOf(column: DimensionColumn) {
  return column._instance_id || column.code
}

const signature = computed(() => props.dimensions.map(idOf))

function valueKey(value: DimensionMergeValue) {
  return `${value === null ? 'null' : typeof value}:${String(value)}`
}

function tupleKey(values: Record<string, DimensionMergeValue>) {
  return signature.value.map((field) => `${field}=${valueKey(values[field] ?? null)}`).join('|')
}

const selectedKeys = computed(() => new Set(props.modelValue.map((item) => tupleKey(item.values))))

function valueLabel(value: DimensionMergeValue) {
  if (value === null) return '（NULL）'
  if (value === '') return '（空字符串）'
  if (typeof value === 'string' && value.trim() === '') return '（空白文本）'
  if (typeof value === 'string' && value === '0') return '"0"'
  return String(value)
}

async function load() {
  if (!props.datasetId || !signature.value.length) return
  const current = ++requestId
  loading.value = true
  error.value = ''
  try {
    const result = await reportsApi.searchDimensionCombinations({
      report_id: props.reportId,
      dataset_id: props.datasetId,
      scope_strategy: props.scopeStrategy,
      config: props.config,
      dimension_signature: signature.value,
      dimension_filters: Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== '')),
      page: page.value,
      page_size: pageSize.value,
    })
    if (current !== requestId) return
    items.value = result.items
    total.value = result.total
  } catch (e: any) {
    if (current !== requestId) return
    items.value = []
    total.value = 0
    error.value = e?.response?.data?.detail?.message || e?.response?.data?.detail || e?.message || '加载完整维度组合失败'
  } finally {
    if (current === requestId) loading.value = false
  }
}

function toggle(item: DimensionCombinationItem) {
  const key = tupleKey(item.values)
  if (selectedKeys.value.has(key)) {
    emit('update:modelValue', props.modelValue.filter((source) => tupleKey(source.values) !== key))
  } else if (!item.occupied_by || item.occupied_by === props.currentRuleName) {
    emit('update:modelValue', [...props.modelValue, { values: { ...item.values } }])
  }
}

function reset() {
  for (const key of Object.keys(filters)) delete filters[key]
  page.value = 1
  void load()
}

watch(() => [props.datasetId, signature.value.join('|')], () => {
  page.value = 1
  void load()
})

onMounted(load)
defineExpose({ reload: load })
</script>

<template>
  <section class="combination-picker">
    <div class="picker-head">
      <div>
        <strong>来源完整组合</strong>
        <span>已选择 {{ modelValue.length }} 个</span>
      </div>
      <el-button :icon="Refresh" :loading="loading" @click="load">刷新</el-button>
    </div>

    <div class="filter-bar">
      <el-input
        v-for="column in dimensions"
        :key="idOf(column)"
        v-model="filters[idOf(column)]"
        clearable
        :placeholder="column.label || column.code"
        @keyup.enter="page = 1; load()"
      />
      <el-button type="primary" :icon="Search" @click="page = 1; load()">查询</el-button>
      <el-button @click="reset">重置</el-button>
    </div>

    <el-alert v-if="error" type="error" :closable="false" show-icon>
      <template #title>{{ error }}</template>
      <el-button link type="primary" @click="load">重试</el-button>
    </el-alert>

    <div style="overflow-x: auto">
      <el-table v-loading="loading" :data="items" stripe style="width: 100%" max-height="600">
        <el-table-column
          v-for="column in dimensions"
          :key="idOf(column)"
          :label="column.label || column.code"
          min-width="140"
        >
          <template #default="{ row }">{{ valueLabel(row.display_values[idOf(column)]) }}</template>
        </el-table-column>
        <el-table-column label="状态" min-width="160">
          <template #default="{ row }">
            <el-tag v-if="row.occupied_by && row.occupied_by !== currentRuleName" type="warning" effect="plain">
              已属于 {{ row.occupied_by }}
            </el-tag>
            <el-tag v-else-if="selectedKeys.has(tupleKey(row.values))" type="primary" effect="plain">已选择</el-tag>
            <span v-else>可选择</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button
              link
              :type="selectedKeys.has(tupleKey(row.values)) ? 'danger' : 'primary'"
              :disabled="!!row.occupied_by && row.occupied_by !== currentRuleName"
              @click="toggle(row)"
            >
              {{ selectedKeys.has(tupleKey(row.values)) ? '移除' : '选择' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-pagination
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :total="total"
      :page-sizes="[20, 50, 100]"
      layout="total, sizes, prev, pager, next"
      @current-change="load"
      @size-change="page = 1; load()"
    />
  </section>
</template>

<style scoped>
.combination-picker { box-sizing: border-box; width: 100%; min-width: 0; max-width: 100%; padding: 14px; border: 1px solid var(--color-border-light); border-radius: 6px; background: #fff; overflow: hidden; }
.picker-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.picker-head > div { display: flex; align-items: baseline; gap: 10px; }
.picker-head span { color: var(--color-text-secondary); font-size: 12px; }
.filter-bar { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin-bottom: 12px; }
.el-pagination { justify-content: flex-end; margin-top: 12px; }
</style>
