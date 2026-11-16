<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useUserStore } from '@/stores/user'
import { useRoute } from 'vue-router'
import { masterDataApi, type EntityDefinition } from '@/api/masterData'
import PermissionButton from '@/components/PermissionButton.vue'
import { standardFieldsApi, type StandardFieldSummary, type FieldGroup } from '@/api/standardFields'
import StandardFieldDrawer from '@/components/warehouse/StandardFieldDrawer.vue'
import PageTitle from '@/components/common/PageTitle.vue'
import UiSurface from '@/components/ui/UiSurface.vue'
import UiListToolbar from '@/components/ui/UiListToolbar.vue'
import UiSortableList from '@/components/ui/UiSortableList.vue'
import UiDragHandle from '@/components/ui/UiDragHandle.vue'
import UiPagination from '@/components/ui/UiPagination.vue'
import UiDialogShell from '@/components/ui/UiDialogShell.vue'
import PerformanceFilterButton from '@/components/performance/PerformanceFilterButton.vue'
import PerformanceSearchInput from '@/components/performance/PerformanceSearchInput.vue'
import PerformanceLineTabs from '@/components/performance/PerformanceLineTabs.vue'
import UiButton from '@/components/ui/UiButton.vue'

const userStore = useUserStore()
const route = useRoute()
const entities = ref<EntityDefinition[]>([])
const entityId = ref<number | undefined>()
const groups = ref<FieldGroup[]>([])
const groupId = ref<string>('')
const canEntityView = computed(() => userStore.menus.some(m => m.code === 'system.master_entities'))
const canView = computed(() => userStore.menus.some(menu => menu.code === 'warehouse.standard_fields.catalog'))
const rows = ref<StandardFieldSummary[]>([])
const total = ref(0)
const keyword = ref('')
const status = ref<boolean | undefined>()
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const error = ref('')
const drawerOpen = ref(false)
const selectedId = ref<number | null>(null)
const filterOpen = ref(false)
const filterEntityId = ref<number | undefined>()
const filterStatus = ref<boolean | undefined>()
const types: Record<string, string> = { string: '字符串', number: '数值', date: '日期', datetime: '日期时间', bool: '布尔', enum: '枚举' }
let requestId = 0
let entityRequestId = 0

async function loadGroups() {
  if (!canView.value) { groups.value = []; return }
  try {
    const response = await standardFieldsApi.groups()
    groups.value = response.items.filter(g => g.is_active)
  } catch {
    groups.value = []
  }
}

async function load() {
  const current = ++requestId
  if (!canView.value) { rows.value = []; total.value = 0; return }
  loading.value = true
  error.value = ''
  try {
    const response = await standardFieldsApi.list({
      entity_id: entityId.value,
      group_id: groupId.value === '' ? undefined : Number(groupId.value),
      keyword: keyword.value.trim() || undefined,
      is_active: status.value,
      offset: (page.value - 1) * pageSize.value,
      limit: pageSize.value,
    })
    if (current === requestId) { rows.value = response.items; total.value = response.total }
  } catch (cause: any) {
    if (current === requestId) {
      let detail = cause?.response?.data?.detail
      if (typeof detail === 'string') { try { detail = JSON.parse(detail) } catch { detail = { message: detail } } }
      error.value = detail?.message || (cause?.response?.status === 404 && entityId.value ? '所选实体不存在或无权访问。' : '加载标准字段失败，请重试。')
    }
  } finally {
    if (current === requestId) loading.value = false
  }
}
function search() { page.value = 1; void load() }
function openCreate() {
  if (entityId.value && (!canEntityView.value || !userStore.hasOp('system.master_entities', 'C'))) return
  selectedId.value = null; drawerOpen.value = true
}
function openDetail(id: number) { selectedId.value = id; drawerOpen.value = true }
function updated() { void loadGroups(); void load() }
/** 打开筛选弹窗：回显当前筛选值 */
function openFilter() {
  filterEntityId.value = entityId.value
  filterStatus.value = status.value
  filterOpen.value = true
}
/** 应用筛选弹窗：同步到页面筛选并重新加载 */
function applyFilter() {
  entityId.value = filterEntityId.value
  status.value = filterStatus.value
  filterOpen.value = false
  search()
}
/** 重置筛选 */
function resetFilter() {
  filterEntityId.value = undefined
  filterStatus.value = undefined
  entityId.value = undefined
  status.value = undefined
  filterOpen.value = false
  search()
}

watch(() => [canView.value, canEntityView.value, userStore.user?.id], async () => {
  const current = ++entityRequestId
  entities.value = []; drawerOpen.value = false; page.value = 1; void loadGroups(); void load()
  if (canView.value && canEntityView.value) {
    try { const result = await masterDataApi.list({ limit: 100 }); if (current === entityRequestId) entities.value = result.items }
    catch { if (current === entityRequestId) entities.value = [] }
  }
}, { immediate: true, flush: 'sync' })
watch(() => route.query.entity_id, value => { const id = Number(value); entityId.value = Number.isSafeInteger(id) && id > 0 ? id : undefined; page.value = 1; void load() }, { immediate: true })
watch([page, pageSize], () => { void load() })
watch(groupId, () => { page.value = 1; void load() })
onBeforeUnmount(() => { ++requestId; ++entityRequestId })

const groupTabs = computed(() => [
  { key: '', label: '全部' },
  ...groups.value.map(group => ({ key: String(group.id), label: `${group.name} (${group.field_count})` })),
])

const tableColumns = [
  { key: 'field_code', label: '字段编码', width: 160 },
  { key: 'field_name', label: '字段名称', width: 170 },
  { key: 'entity_name', label: '归属实体', width: 130 },
  { key: 'group_name', label: '业务分组', width: 120 },
  { key: 'data_type', label: '数据类型', width: 105 },
  { key: 'business_definition', label: '业务定义', width: 260 },
  { key: 'category', label: '敏感分类', width: 110 },
]
function cellValue(row: StandardFieldSummary, key: string) {
  if (key === 'data_type') return types[row.data_type] || row.data_type
  if (key === 'category') return row.category_ids?.length ? `${row.category_ids.length} 个` : '未分类'
  if (key === 'entity_name') return row.entity_name || '未归属'
  if (key === 'group_name') return row.group_name || '未分组'
  return (row as any)[key] ?? '--'
}
const reordering = ref(false)
async function reorderFields(from: number, to: number) {
  if (from === to || reordering.value) return
  const next = rows.value.slice()
  const [moved] = next.splice(from, 1)
  if (!moved) return
  next.splice(to, 0, moved)
  const previous = rows.value
  rows.value = next
  reordering.value = true
  try {
    await standardFieldsApi.reorder(next.map(row => row.id))
  } catch {
    rows.value = previous
    error.value = '排序保存失败，请重试。'
  } finally {
    reordering.value = false
  }
}
</script>

<template>
  <div class="standard-fields">
    <PageTitle title="标准字段目录" description="统一标准字段定义和敏感分类；不创建物理列、不自动开放报表。" />
    <UiSurface class="standard-fields__card">
      <el-alert v-if="!canView" title="需要标准字段目录查看权限。" type="info" :closable="false" />
      <template v-else>
        <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
        <template v-else>
          <PerformanceLineTabs v-if="groupTabs.length > 1" v-model="groupId" :tabs="groupTabs" class="standard-fields__tabs" />
          <UiListToolbar v-model:keyword="keyword" search-placeholder="搜索编码、名称或业务定义" search-aria-label="搜索标准字段" search-fill wrap gap="var(--ui-toolbar-gap)">
            <template #filters>
              <PerformanceFilterButton label="筛选" :disabled="loading" @click="openFilter" />
            </template>
            <template #actions>
              <PermissionButton menu="warehouse.standard_fields.catalog" op="C" type="primary" class="standard-fields__create" @click="openCreate">
                <svg class="standard-fields__add-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
                新建字段
              </PermissionButton>
            </template>
          </UiListToolbar>
          <div v-loading="loading" class="standard-fields__table">
            <div v-if="rows.length" class="standard-fields__header" aria-hidden="true">
              <div class="standard-fields__drag-slot"></div>
              <div v-for="column in tableColumns" :key="column.key" class="standard-fields__header-cell" :style="{ width: `${column.width}px` }">{{ column.label }}</div>
              <div class="standard-fields__header-cell standard-fields__header-cell--action" style="width: 80px">操作</div>
            </div>
            <UiSortableList v-if="rows.length" :items="rows" item-key="id" class="standard-fields__sortable" :gap="0" :disabled="reordering" @reorder="reorderFields">
              <template #default="{ item: row, index, dragging, itemStyle }">
                <div class="standard-fields__row" :class="{ 'is-dragging': dragging }" :style="itemStyle" :data-sortable-index="index">
                  <UiDragHandle :label="`拖拽第${index + 1}个字段`" :dragging="dragging" />
                  <div v-for="column in tableColumns" :key="column.key" class="standard-fields__cell" :style="{ width: `${column.width}px` }">
                    <span v-if="column.key === 'business_definition'" class="standard-fields__ellipsis" :title="cellValue(row, column.key)">{{ cellValue(row, column.key) }}</span>
                    <span v-else>{{ cellValue(row, column.key) }}</span>
                  </div>
                  <div class="standard-fields__cell standard-fields__cell--action" style="width: 80px">
                    <button v-if="!row.entity_id || (canEntityView && userStore.hasOp('system.master_entities', 'U'))" class="standard-fields__action" type="button" @click="openDetail(row.id)">编辑</button>
                  </div>
                </div>
              </template>
            </UiSortableList>
            <div v-else-if="!loading" class="standard-fields__empty">暂无字段，可新建字段定义。</div>
          </div>
          <UiPagination class="standard-fields__pagination" :page="page" :page-size="pageSize" :total="total" @page-change="page = $event" @page-size-change="pageSize = $event; page = 1" />
        </template>
      </template>
    </UiSurface>

    <UiDialogShell v-model="filterOpen" title="筛选" width="var(--performance-dialog-width)">
      <div class="standard-fields__filter">
        <div class="standard-fields__filter-item">
          <label class="standard-fields__filter-label" for="filter-entity">归属实体</label>
          <el-select v-model="filterEntityId" id="filter-entity" class="standard-fields__filter-control" placeholder="全部实体" clearable>
            <el-option v-for="entity in entities" :key="entity.id" :value="entity.id" :label="entity.name" />
          </el-select>
        </div>
        <div class="standard-fields__filter-item">
          <label class="standard-fields__filter-label" for="filter-status">状态</label>
          <el-select v-model="filterStatus" id="filter-status" class="standard-fields__filter-control" placeholder="全部状态" clearable>
            <el-option :value="true" label="有效" />
            <el-option :value="false" label="停用" />
          </el-select>
        </div>
      </div>
      <template #footer>
        <UiButton variant="secondary" @click="resetFilter">重置</UiButton>
        <UiButton variant="primary" @click="applyFilter">确定</UiButton>
      </template>
    </UiDialogShell>

    <StandardFieldDrawer v-model="drawerOpen" :field-id="selectedId" :entity-id="entityId" :group-id="groupId === '' ? undefined : Number(groupId)" @changed="updated" />
  </div>
</template>

<style scoped>
.standard-fields {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  min-height: 100%;
  width: 100%;
  flex: 1 0 auto;
  min-width: 0;
  padding: var(--ui-page-padding);
  background: var(--ui-page-background);
}
.standard-fields__card { display: flex; flex-direction: column; flex: 0 0 auto; min-width: 0; }
.standard-fields__card > .el-alert { margin-top: var(--spacing-4); }
.standard-fields__tabs { margin-bottom: var(--page-gap-toolbar-table); }
.standard-fields__create { height: var(--ui-toolbar-control-height); border-radius: var(--button-radius); font-size: var(--font-size-md); }
.standard-fields__add-icon { width: var(--icon-size); height: var(--icon-size); margin-right: var(--spacing-1); }
.standard-fields__table { display: flex; flex-direction: column; min-width: 0; }
.standard-fields__header, .standard-fields__row {
  display: flex;
  align-items: center;
  min-width: 0;
  box-sizing: border-box;
  border-bottom: 1px solid var(--ui-table-border-color);
}
.standard-fields__header { height: var(--ui-table-header-height); background: var(--ui-table-header-background); color: var(--ui-table-header-color); }
.standard-fields__row { height: var(--ui-table-row-height); color: var(--ui-table-text-color); }
.standard-fields__row:hover { background: var(--ui-table-row-hover-background); }
.standard-fields__row.is-dragging { opacity: .72; }
.standard-fields__drag-slot { flex: 0 0 16px; }
.standard-fields__row > .performance-drag-handle { flex: 0 0 16px; }
.standard-fields__header-cell, .standard-fields__cell { flex: 0 0 auto; padding: 0 var(--ui-table-cell-padding-inline); box-sizing: border-box; overflow: hidden; white-space: nowrap; }
.standard-fields__header-cell { font-weight: var(--ui-form-label-weight); }
.standard-fields__header-cell--action, .standard-fields__cell--action { text-align: left; }
.standard-fields__ellipsis { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.standard-fields__empty { padding: 32px 0; color: var(--color-text-placeholder); text-align: center; }
.standard-fields__pagination { margin-top: var(--page-gap-toolbar-table); }
.standard-fields__action {
  height: var(--ui-tree-action-height);
  padding: 0 var(--ui-tree-action-padding-x);
  box-sizing: border-box;
  border: 0;
  border-radius: var(--ui-tree-action-radius);
  background: transparent;
  color: var(--ui-tree-action-color);
  font: inherit;
  line-height: var(--ui-tree-action-height);
  white-space: nowrap;
  cursor: pointer;
}
.standard-fields__action:hover { background: var(--ui-tree-action-hover-background); }
.standard-fields__filter { display: grid; gap: var(--ui-form-item-gap); }
.standard-fields__filter-item { display: grid; grid-template-columns: var(--ui-form-label-height) minmax(0, 1fr); gap: var(--ui-form-label-gap); align-items: center; }
.standard-fields__filter-label { color: var(--color-text-primary); font-weight: var(--ui-form-label-weight); line-height: var(--ui-form-label-line-height); }
.standard-fields__filter-control { width: 100%; }
</style>
