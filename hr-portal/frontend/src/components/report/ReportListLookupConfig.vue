<script setup lang="ts">
import { computed } from 'vue'
import { Delete, Plus } from '@element-plus/icons-vue'
import type { ColumnInfo } from '@/api/data'
import type { FilterLogic, ListLookupConfig, ListLookupSource } from '@/api/reports'
import ReportFilterList from './ReportFilterList.vue'

const props = defineProps<{
  listLookup: ListLookupConfig
  allColumns: ColumnInfo[]
  currentDatasetTables?: { table_name: string; alias: string; table_label?: string | null }[]
}>()

const emit = defineEmits<{
  'update:listLookup': [v: ListLookupConfig]
}>()

const textColumns = computed(() =>
  props.allColumns.filter((item) => item.data_type !== 'number')
)

function patch(patchValue: Partial<ListLookupConfig>) {
  emit('update:listLookup', { ...props.listLookup, ...patchValue })
}

function patchLookup(targetField: string) {
  patch({ lookup: { ...(props.listLookup.lookup || {}), target_field: targetField } })
}

function patchSource(index: number, patchValue: Partial<ListLookupSource>) {
  const sources = [...(props.listLookup.sources || [])]
  sources[index] = { ...sources[index], ...patchValue }
  patch({ sources })
}

function patchResolver(index: number, patchValue: NonNullable<ListLookupSource['resolver']>) {
  const source = props.listLookup.sources[index]
  patchSource(index, { resolver: { ...(source.resolver || {}), ...patchValue } })
}

function patchSourceFilters(index: number, filters: any[]) {
  patchSource(index, { filters })
}

function patchSourceFilterLogic(index: number, filterLogic: FilterLogic | null) {
  patchSource(index, { filter_logic: filterLogic })
}

function addSource(type: ListLookupSource['type'] = 'filtered_rows') {
  const next: ListLookupSource = type === 'field_values'
    ? {
        type,
        name: '字段名单',
        source_field: '',
        resolver: { enabled: true, match_field: '', return_field: '' },
        filters: [],
        filter_logic: null,
      }
    : {
        type,
        name: '筛选名单',
        return_field: '',
        filters: [],
        filter_logic: null,
      }
  patch({ sources: [...(props.listLookup.sources || []), next] })
}

function removeSource(index: number) {
  const sources = [...(props.listLookup.sources || [])]
  sources.splice(index, 1)
  patch({ sources })
}

function sourceTitle(source: ListLookupSource, index: number) {
  return source.name || (source.type === 'field_values' ? `字段名单 ${index + 1}` : `筛选名单 ${index + 1}`)
}
</script>

<template>
  <div class="list-lookup-config">
    <div class="lookup-toolbar">
      <el-switch
        :model-value="listLookup.enabled"
        active-text="启用名单回查"
        inactive-text="关闭"
        @update:model-value="(v: boolean) => patch({ enabled: v })"
      />
      <el-select
        :model-value="listLookup.operator || 'union'"
        :disabled="!listLookup.enabled"
        style="width: 150px"
        @update:model-value="(v: string) => patch({ operator: v as ListLookupConfig['operator'] })"
      >
        <el-option label="并集 union" value="union" />
        <el-option label="交集 intersect" value="intersect" />
        <el-option label="差集 except" value="except" />
      </el-select>
      <el-select
        :model-value="listLookup.lookup?.target_field || ''"
        :disabled="!listLookup.enabled"
        filterable
        clearable
        placeholder="回查目标字段"
        style="min-width: 220px"
        @update:model-value="(v: string) => patchLookup(v)"
      >
        <el-option v-for="col in allColumns" :key="col.code" :label="col.label" :value="col.code" />
      </el-select>
    </div>

    <template v-if="listLookup.enabled">
      <div class="source-actions">
        <el-button size="small" plain @click="addSource('field_values')">
          <el-icon><Plus /></el-icon>
          字段名单
        </el-button>
        <el-button size="small" plain @click="addSource('filtered_rows')">
          <el-icon><Plus /></el-icon>
          筛选名单
        </el-button>
      </div>

      <section
        v-for="(source, index) in listLookup.sources"
        :key="index"
        class="lookup-source"
      >
        <div class="source-head">
          <strong>{{ sourceTitle(source, index) }}</strong>
          <el-button link type="danger" @click="removeSource(index)">
            <el-icon><Delete /></el-icon>
          </el-button>
        </div>
        <div class="source-grid">
          <el-input
            :model-value="source.name || ''"
            placeholder="来源名称"
            @update:model-value="(v: string) => patchSource(index, { name: v })"
          />
          <el-select
            :model-value="source.type"
            @update:model-value="(v: string) => patchSource(index, { type: v as ListLookupSource['type'] })"
          >
            <el-option label="字段名单" value="field_values" />
            <el-option label="筛选名单" value="filtered_rows" />
          </el-select>

          <el-select
            v-if="source.type === 'field_values'"
            :model-value="source.source_field || ''"
            filterable
            clearable
            placeholder="抽取字段"
            @update:model-value="(v: string) => patchSource(index, { source_field: v })"
          >
            <el-option v-for="col in textColumns" :key="col.code" :label="col.label" :value="col.code" />
          </el-select>
          <el-select
            v-else
            :model-value="source.return_field || ''"
            filterable
            clearable
            placeholder="返回字段"
            @update:model-value="(v: string) => patchSource(index, { return_field: v })"
          >
            <el-option v-for="col in allColumns" :key="col.code" :label="col.label" :value="col.code" />
          </el-select>
        </div>

        <div v-if="source.type === 'field_values'" class="resolver-grid">
          <el-switch
            :model-value="source.resolver?.enabled !== false"
            active-text="解析为回查键"
            inactive-text="直接使用字段值"
            @update:model-value="(v: boolean) => patchResolver(index, { enabled: v })"
          />
          <template v-if="source.resolver?.enabled !== false">
            <el-select
              :model-value="source.resolver?.match_field || ''"
              filterable
              clearable
              placeholder="匹配字段"
              @update:model-value="(v: string) => patchResolver(index, { match_field: v })"
            >
              <el-option v-for="col in textColumns" :key="col.code" :label="col.label" :value="col.code" />
            </el-select>
            <el-select
              :model-value="source.resolver?.return_field || ''"
              filterable
              clearable
              placeholder="解析返回字段"
              @update:model-value="(v: string) => patchResolver(index, { return_field: v })"
            >
              <el-option v-for="col in allColumns" :key="col.code" :label="col.label" :value="col.code" />
            </el-select>
          </template>
        </div>

        <div class="source-filters">
          <div class="mini-title">来源筛选</div>
          <ReportFilterList
            :filters="source.filters || []"
            :filter-logic="source.filter_logic || null"
            :all-columns="allColumns"
            :current-dataset-tables="currentDatasetTables"
            :show-view-controls="false"
            @update:filters="(v) => patchSourceFilters(index, v)"
            @update:filter-logic="(v) => patchSourceFilterLogic(index, v)"
          />
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.list-lookup-config {
  display: grid;
  gap: 12px;
}

.lookup-toolbar,
.source-actions,
.source-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.lookup-source {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--color-border-light);
  border-radius: 6px;
  background: #fff;
}

.source-head {
  justify-content: space-between;
  color: var(--color-text-primary);
}

.source-grid,
.resolver-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.resolver-grid {
  align-items: center;
}

.source-filters {
  display: grid;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--color-border-light);
}

.mini-title {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 700;
}

@media (max-width: 900px) {
  .source-grid,
  .resolver-grid {
    grid-template-columns: 1fr;
  }
}
</style>
