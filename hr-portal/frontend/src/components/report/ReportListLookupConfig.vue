<script setup lang="ts">
import { computed } from 'vue'
import { Delete } from '@element-plus/icons-vue'
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

const operatorOptions: {
  value: ListLookupConfig['operator']
  label: string
  symbol: string
  description: string
}[] = [
  { value: 'union', label: '并集 union', symbol: 'A ∪ B', description: '保留任意来源中出现过的名单' },
  { value: 'intersect', label: '交集 intersect', symbol: 'A ∩ B', description: '只保留所有来源都命中的名单' },
  { value: 'except', label: '差集 except', symbol: 'A - B', description: '用第一个来源减去后续来源' },
]

const textColumns = computed(() => props.allColumns.filter((item) => item.data_type !== 'number'))
const sourceCount = computed(() => props.listLookup.sources?.length || 0)
const operatorMeta = computed(() =>
  operatorOptions.find((item) => item.value === (props.listLookup.operator || 'union')) || operatorOptions[0]
)
const targetLabel = computed(() => fieldLabel(props.listLookup.lookup?.target_field))
const readySourceCount = computed(() => (props.listLookup.sources || []).filter(sourceReady).length)
const lookupReady = computed(() =>
  props.listLookup.enabled
  && !!props.listLookup.lookup?.target_field
  && sourceCount.value > 0
  && readySourceCount.value === sourceCount.value
)
const flowSummary = computed(() => {
  if (!props.listLookup.enabled) return '开启后，从一个或多个来源生成名单，再回查完整记录。'
  if (!sourceCount.value) return '先添加一个名单来源，再选择集合运算和回查目标字段。'
  const target = targetLabel.value || '未选择回查目标'
  return `${sourceCount.value} 个来源 · ${operatorMeta.value.label} · 回查 ${target}`
})

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
  if (!source) return
  patchSource(index, { resolver: { ...(source.resolver || {}), ...patchValue } })
}

function patchSourceFilters(index: number, filters: any[]) {
  patchSource(index, { filters })
}

function patchSourceFilterLogic(index: number, filterLogic: FilterLogic | null) {
  patchSource(index, { filter_logic: filterLogic })
}

function sourceName(type: ListLookupSource['type']) {
  const sameTypeCount = (props.listLookup.sources || []).filter((item) => item.type === type).length + 1
  return type === 'field_values' ? `字段值名单 ${sameTypeCount}` : `条件筛选名单 ${sameTypeCount}`
}

function isDefaultSourceName(name?: string) {
  return !name || /^字段值名单 \d+$/.test(name) || /^条件筛选名单 \d+$/.test(name)
}

function createSource(type: ListLookupSource['type']): ListLookupSource {
  return type === 'field_values'
    ? {
        type,
        name: sourceName(type),
        source_field: '',
        resolver: { enabled: false, match_field: '', return_field: '' },
        filters: [],
        filter_logic: null,
      }
    : {
        type,
        name: sourceName(type),
        return_field: '',
        filters: [],
        filter_logic: null,
      }
}

function addSource(type: ListLookupSource['type'] = 'filtered_rows') {
  emit('update:listLookup', {
    ...props.listLookup,
    enabled: true,
    sources: [...(props.listLookup.sources || []), createSource(type)],
  })
}

function removeSource(index: number) {
  const sources = [...(props.listLookup.sources || [])]
  sources.splice(index, 1)
  patch({ sources })
}

function changeSourceType(index: number, type: ListLookupSource['type']) {
  const current = props.listLookup.sources[index]
  if (!current || current.type === type) return
  patchSource(index, {
    ...createSource(type),
    name: isDefaultSourceName(current.name) ? sourceName(type) : current.name,
    filters: current.filters || [],
    filter_logic: current.filter_logic || null,
  })
}

function sourceTitle(source: ListLookupSource, index: number) {
  return source.name || (source.type === 'field_values' ? `字段值名单 ${index + 1}` : `条件筛选名单 ${index + 1}`)
}

function fieldLabel(code?: string) {
  if (!code) return ''
  const col = props.allColumns.find((item) => item.code === code)
  return col?.label || code
}

function sourceReady(source: ListLookupSource) {
  if (source.type === 'field_values') {
    if (!source.source_field) return false
    if (source.resolver?.enabled !== true) return true
    return !!source.resolver?.match_field && !!source.resolver?.return_field
  }
  return !!source.return_field
}

function filterSummary(source: ListLookupSource) {
  const count = source.filters?.filter((item) => item.column).length || 0
  return count ? `${count} 个来源筛选` : '未设置来源筛选'
}

function sourceSummary(source: ListLookupSource) {
  if (source.type === 'field_values') {
    if (!source.source_field) return '选择一个字段，系统会抽取该字段的去重值作为名单。'
    if (source.resolver?.enabled !== true) {
      return `抽取「${fieldLabel(source.source_field)}」的去重值，直接作为回查键。`
    }
    const match = fieldLabel(source.resolver?.match_field) || '待选择匹配字段'
    const returns = fieldLabel(source.resolver?.return_field) || '待选择返回字段'
    return `抽取「${fieldLabel(source.source_field)}」，匹配「${match}」后返回「${returns}」。`
  }
  const returns = fieldLabel(source.return_field) || '待选择返回字段'
  return `先按条件筛选数据行，再返回「${returns}」作为名单。`
}
</script>

<template>
  <div class="list-lookup-config">
    <section class="lookup-hero" :class="{ 'is-enabled': listLookup.enabled, 'is-ready': lookupReady }">
      <div class="hero-copy">
        <span class="eyebrow">名单回查</span>
        <h3>先生成名单，再回查完整记录</h3>
        <p>{{ flowSummary }}</p>
      </div>
      <div class="hero-state">
        <el-switch
          :model-value="listLookup.enabled"
          active-text="启用"
          inactive-text="关闭"
          @update:model-value="(v: boolean) => patch({ enabled: v })"
        />
        <el-tag v-if="listLookup.enabled" :type="lookupReady ? 'success' : 'warning'" effect="plain">
          {{ lookupReady ? '配置完整' : '待完善' }}
        </el-tag>
      </div>
    </section>

    <template v-if="listLookup.enabled">
      <section class="flow-board">
        <div class="flow-card sources-card">
          <span class="step-index">1</span>
          <div>
            <strong>名单来源</strong>
            <p>{{ readySourceCount }} / {{ sourceCount }} 个来源已配置</p>
          </div>
          <div class="source-template-grid">
            <button class="template-card" type="button" @click="addSource('field_values')">
              <span>字段值名单</span>
              <small>从某个字段抽取去重值，可选解析成另一个回查键</small>
            </button>
            <button class="template-card" type="button" @click="addSource('filtered_rows')">
              <span>条件筛选名单</span>
              <small>先筛选符合条件的行，再返回指定字段</small>
            </button>
          </div>
        </div>

        <div class="flow-card operator-card">
          <span class="step-index">2</span>
          <div>
            <strong>集合运算</strong>
            <p>{{ operatorMeta.description }}</p>
          </div>
          <el-radio-group
            :model-value="listLookup.operator || 'union'"
            size="small"
            @update:model-value="(v: string | number | boolean) => patch({ operator: v as ListLookupConfig['operator'] })"
          >
            <el-radio-button v-for="item in operatorOptions" :key="item.value" :label="item.value">
              {{ item.symbol }}
            </el-radio-button>
          </el-radio-group>
        </div>

        <div class="flow-card target-card">
          <span class="step-index">3</span>
          <div>
            <strong>回查目标</strong>
            <p>最终名单会用于过滤这个字段，通常选择唯一键或人员编号。</p>
          </div>
          <el-select
            :model-value="listLookup.lookup?.target_field || ''"
            filterable
            clearable
            placeholder="选择回查目标字段"
            @update:model-value="(v: string) => patchLookup(v)"
          >
            <el-option v-for="col in allColumns" :key="col.code" :label="col.label" :value="col.code" />
          </el-select>
        </div>
      </section>

      <div v-if="!sourceCount" class="empty-guide">
        <strong>从上面的两种通用来源开始</strong>
        <span>字段值名单适合“某列里已经是一批人/编号”；条件筛选名单适合“满足某些条件的人/记录”。</span>
      </div>

      <section
        v-for="(source, index) in listLookup.sources"
        :key="index"
        class="lookup-source"
        :class="{ 'is-ready': sourceReady(source) }"
      >
        <div class="source-head">
          <div class="source-title-wrap">
            <span class="source-number">{{ index + 1 }}</span>
            <div>
              <strong>{{ sourceTitle(source, index) }}</strong>
              <p>{{ sourceSummary(source) }}</p>
            </div>
          </div>
          <div class="source-actions">
            <el-tag :type="sourceReady(source) ? 'success' : 'warning'" effect="plain">
              {{ sourceReady(source) ? '已配置' : '待完善' }}
            </el-tag>
            <el-button link type="danger" @click="removeSource(index)">
              <el-icon><Delete /></el-icon>
              删除
            </el-button>
          </div>
        </div>

        <div class="source-form-grid">
          <label class="field-block">
            <span>来源名称</span>
            <el-input
              :model-value="source.name || ''"
              placeholder="便于识别这个名单来源"
              @update:model-value="(v: string) => patchSource(index, { name: v })"
            />
          </label>
          <label class="field-block">
            <span>来源类型</span>
            <el-select
              :model-value="source.type"
              @update:model-value="(v: string) => changeSourceType(index, v as ListLookupSource['type'])"
            >
              <el-option label="字段值名单" value="field_values" />
              <el-option label="条件筛选名单" value="filtered_rows" />
            </el-select>
          </label>
          <label v-if="source.type === 'field_values'" class="field-block field-block-wide">
            <span>抽取字段</span>
            <el-select
              :model-value="source.source_field || ''"
              filterable
              clearable
              placeholder="选择要抽取去重值的字段"
              @update:model-value="(v: string) => patchSource(index, { source_field: v })"
            >
              <el-option v-for="col in textColumns" :key="col.code" :label="col.label" :value="col.code" />
            </el-select>
          </label>
          <label v-else class="field-block field-block-wide">
            <span>返回字段</span>
            <el-select
              :model-value="source.return_field || ''"
              filterable
              clearable
              placeholder="筛选命中后返回哪个字段作为名单"
              @update:model-value="(v: string) => patchSource(index, { return_field: v })"
            >
              <el-option v-for="col in allColumns" :key="col.code" :label="col.label" :value="col.code" />
            </el-select>
          </label>
        </div>

        <div v-if="source.type === 'field_values'" class="resolver-panel">
          <div class="resolver-head">
            <div>
              <strong>字段值需要解析成回查键</strong>
              <p>当抽取出来的值不是回查目标字段的同一种键时开启，例如名称要先匹配到编号。</p>
            </div>
            <el-switch
              :model-value="source.resolver?.enabled === true"
              active-text="需要解析"
              inactive-text="直接使用"
              @update:model-value="(v: boolean) => patchResolver(index, { enabled: v })"
            />
          </div>
          <div v-if="source.resolver?.enabled === true" class="resolver-grid">
            <label class="field-block">
              <span>匹配字段</span>
              <el-select
                :model-value="source.resolver?.match_field || ''"
                filterable
                clearable
                placeholder="用抽取值匹配哪个字段"
                @update:model-value="(v: string) => patchResolver(index, { match_field: v })"
              >
                <el-option v-for="col in textColumns" :key="col.code" :label="col.label" :value="col.code" />
              </el-select>
            </label>
            <label class="field-block">
              <span>返回字段</span>
              <el-select
                :model-value="source.resolver?.return_field || ''"
                filterable
                clearable
                placeholder="匹配成功后返回哪个字段"
                @update:model-value="(v: string) => patchResolver(index, { return_field: v })"
              >
                <el-option v-for="col in allColumns" :key="col.code" :label="col.label" :value="col.code" />
              </el-select>
            </label>
          </div>
        </div>

        <div class="source-filters">
          <div class="filter-title">
            <div>
              <span>来源筛选</span>
              <small>{{ source.type === 'filtered_rows' ? '用于定义哪些行进入名单' : '可选，只从符合条件的行中抽取字段值' }}</small>
            </div>
            <el-tag size="small" effect="plain">{{ filterSummary(source) }}</el-tag>
          </div>
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
  gap: 14px;
}

.lookup-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 18px;
  border: 1px solid var(--color-border-light);
  border-radius: 14px;
  background:
    radial-gradient(circle at top left, rgba(20, 86, 240, 0.12), transparent 34%),
    linear-gradient(135deg, #ffffff 0%, var(--color-bg-soft) 100%);
}

.lookup-hero.is-enabled {
  border-color: rgba(20, 86, 240, 0.28);
}

.lookup-hero.is-ready {
  border-color: rgba(15, 138, 114, 0.34);
}

.hero-copy {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.eyebrow {
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.hero-copy h3 {
  margin: 0;
  color: var(--color-text-primary);
  font-size: 18px;
  line-height: 1.25;
}

.hero-copy p,
.flow-card p,
.source-title-wrap p,
.resolver-head p,
.empty-guide span,
.filter-title small {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.hero-state {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
  flex: none;
}

.flow-board {
  display: grid;
  grid-template-columns: minmax(320px, 1.35fr) minmax(240px, 0.9fr) minmax(260px, 1fr);
  gap: 12px;
}

.flow-card {
  position: relative;
  display: grid;
  align-content: start;
  gap: 12px;
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--color-border-light);
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.04);
}

.flow-card strong,
.source-title-wrap strong,
.resolver-head strong {
  color: var(--color-text-primary);
  font-size: 14px;
}

.step-index,
.source-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  background: var(--color-primary-light);
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 800;
}

.source-template-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.template-card {
  display: grid;
  gap: 5px;
  min-height: 86px;
  padding: 12px;
  border: 1px solid var(--color-border-light);
  border-radius: 10px;
  background: var(--color-bg-page);
  color: var(--color-text-regular);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
}

.template-card:hover {
  border-color: var(--color-primary);
  box-shadow: 0 10px 24px rgba(20, 86, 240, 0.1);
  transform: translateY(-1px);
}

.template-card span {
  color: var(--color-text-primary);
  font-size: 13px;
  font-weight: 800;
}

.template-card small {
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.55;
}

.empty-guide {
  display: grid;
  gap: 6px;
  padding: 16px;
  border: 1px dashed var(--color-border-light);
  border-radius: 12px;
  background: var(--color-bg-soft);
}

.empty-guide strong {
  color: var(--color-text-primary);
  font-size: 14px;
}

.lookup-source {
  display: grid;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--color-border-light);
  border-radius: 14px;
  background: #fff;
}

.lookup-source.is-ready {
  border-color: rgba(15, 138, 114, 0.28);
}

.source-head,
.source-title-wrap,
.source-actions,
.resolver-head,
.filter-title {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.source-head,
.resolver-head,
.filter-title {
  justify-content: space-between;
}

.source-title-wrap {
  min-width: 0;
}

.source-title-wrap > div,
.filter-title > div {
  display: grid;
  gap: 4px;
}

.source-actions {
  align-items: center;
  flex: none;
}

.source-form-grid,
.resolver-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.field-block {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.field-block > span,
.filter-title span {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 800;
}

.field-block-wide {
  grid-column: span 2;
}

.resolver-panel,
.source-filters {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--color-border-light);
  border-radius: 12px;
  background: var(--color-bg-page);
}

.resolver-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.source-filters :deep(.rule-row) {
  flex-wrap: wrap;
}

.source-filters :deep(.logic-row) {
  padding-left: 0;
}

@media (max-width: 1080px) {
  .flow-board {
    grid-template-columns: 1fr;
  }

  .source-form-grid,
  .resolver-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .lookup-hero,
  .source-head,
  .resolver-head,
  .filter-title {
    flex-direction: column;
  }

  .hero-state,
  .source-actions {
    justify-content: flex-start;
  }

  .source-template-grid,
  .source-form-grid,
  .resolver-grid {
    grid-template-columns: 1fr;
  }

  .field-block-wide {
    grid-column: span 1;
  }
}
</style>
