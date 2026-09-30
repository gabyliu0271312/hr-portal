<template>
  <FullScreenModal v-if="modelValue" :title="title" :show-footer="false" @back="close">
    <div class="metric-field-management" aria-label="指标字段管理">
      <div class="metric-field-management__tabs" role="tablist" aria-label="指标管理分类">
        <button
          v-for="tab in tabs"
          :key="tab.value"
          class="metric-field-management__tab"
          :class="{ 'is-active': activeTab === tab.value }"
          type="button"
          role="tab"
          :aria-selected="activeTab === tab.value"
          :disabled="busy"
          @click="activeTab = tab.value"
        >
          {{ tab.label }}
        </button>
      </div>

      <PerformanceContentSurface v-if="activeTab === 'types'" variant="table" class="metric-field-management__surface">
        <PerformanceCreateButton variant="wide-icon" label="新建指标类型" :disabled="typeLoading" @click="typeApiEnabled ? typeApi.openCreate() : emit('create-type')" />
        <p v-if="typeLoadError" class="metric-field-management__error" role="alert">
          {{ typeLoadError }}
          <PerformanceButton variant="text" @click="typeApi.load()">重试</PerformanceButton>
        </p>
        <PerformanceMetricTypesTable
          class="metric-field-management__table"
          :rows="typeRows"
          :loading="typeLoading"
          :total="typeTotal"
          :page="typePage"
          :page-size="typePageSize"
          @edit="handleTypeEdit"
          @remove="emit('remove-type', $event)"
          @page-change="handleTypePageChange"
          @page-size-change="handleTypePageSizeChange"
        />
      </PerformanceContentSurface>

      <PerformanceContentSurface v-else variant="table" class="metric-field-management__surface">
        <PerformanceListToolbar
          v-model:keyword="keyword"
          search-placeholder="通过名称搜索"
          search-aria-label="通过名称搜索指标字段"
          search-width="222px"
          search-variant="compact"
          @filter="emit('filter')"
        >
          <template #left>
            <PerformanceCreateButton variant="wide-icon" label="新建字段" :disabled="!canCreate || busy" @click="openCreate(); emit('create')" />
          </template>
        </PerformanceListToolbar>
        <div v-if="loadError" class="metric-field-management__error" role="alert">
          <span>{{ loadError }}</span>
          <PerformanceButton variant="text" @click="load()">重试</PerformanceButton>
        </div>
        <p v-if="actionError" class="metric-field-management__error" role="alert">{{ actionError }}</p>
        <PerformanceMetricFieldsTable
          class="metric-field-management__table"
          :rows="rows"
          :loading="loading"
          :total="total"
          :page="page"
          :page-size="pageSize"
          :actions-disabled="actionsDisabled || !canCreate || busy"
          @page-change="page = $event; emit('page-change', $event)"
          @page-size-change="pageSize = $event; emit('page-size-change', $event)"
          @edit="!actionsDisabled && openEdit($event.id)"
          @remove="!actionsDisabled && openRemove($event.id)"
        />
      </PerformanceContentSurface>
    </div>
    <PerformanceMetricTypeCreateDialog
      ref="typeDialogRef"
      v-if="typeApiEnabled"
      v-model="typeApi.createOpen.value"
      :mode="typeApi.editing.value ? 'edit' : 'create'"
      :initial-value="typeApi.editing.value"
      :field-options="typeApi.fieldOptions.value"
      :saving="typeApi.saving.value"
      :error-message="typeApi.saveError.value"
      @confirm="typeApi.save"
      @create-field="openFieldCreateFromType"
    />
    <PerformanceMetricFieldCreateDialog v-model="createOpen" :mode="editing ? 'edit' : 'create'" :initial-value="editing" :type-locked="editing?.in_use" :saving="saving" :error-message="saveError" @confirm="handleFieldSave" />
    <PerformanceConfirmDialog v-if="deleteOpen" v-model="deleteOpen" :message="`确定删除字段“${removing?.name || ''}”吗？`" description="删除后无法恢复，已分配的业务编号不会复用。" :loading="deleting" :error-message="deleteError" :confirm-disabled="deleteBlocked" @confirm="remove" />
  </FullScreenModal>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { usePerformanceMetricFields } from '@/composables/usePerformanceMetricFields'
import { usePerformanceMetricTypes } from '@/composables/usePerformanceMetricTypes'
import PerformanceMetricFieldCreateDialog from './PerformanceMetricFieldCreateDialog.vue'
import PerformanceMetricTypeCreateDialog from './PerformanceMetricTypeCreateDialog.vue'
import PerformanceButton from './PerformanceButton.vue'
import PerformanceConfirmDialog from './PerformanceConfirmDialog.vue'
import FullScreenModal from './FullScreenModal.vue'
import PerformanceContentSurface from './PerformanceContentSurface.vue'
import PerformanceCreateButton from './PerformanceCreateButton.vue'
import PerformanceListToolbar from './PerformanceListToolbar.vue'
import PerformanceMetricFieldsTable, { type PerformanceMetricFieldRow } from './PerformanceMetricFieldsTable.vue'
import PerformanceMetricTypesTable, { type PerformanceMetricTypeRow } from './PerformanceMetricTypesTable.vue'

const props = withDefaults(defineProps<{
  modelValue: boolean
  title?: string
  typeRows?: PerformanceMetricTypeRow[]
  typeApiEnabled?: boolean
  actionsDisabled?: boolean
}>(), {
  title: '字段管理',
  typeRows: () => [{ id: 1, name: '定性指标', fields: '指标、权重、完成说明' }],
  typeApiEnabled: false,
  actionsDisabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  back: []
  create: []
  'create-type': []
  'retry-types': []
  'type-page-change': [page: number]
  'type-page-size-change': [pageSize: number]
  filter: []
  edit: [row: PerformanceMetricFieldRow]
  remove: [row: PerformanceMetricFieldRow]
  'edit-type': [row: PerformanceMetricTypeRow]
  'remove-type': [row: PerformanceMetricTypeRow]
  'page-change': [page: number]
  'page-size-change': [pageSize: number]
}>()

const activeTab = ref<'types' | 'fields'>('types')
const typeDialogRef = ref<InstanceType<typeof PerformanceMetricTypeCreateDialog> | null>(null)
const creatingFieldFromType = ref(false)
const typesEnabled = computed(() => props.modelValue && props.typeApiEnabled && activeTab.value === 'types')
const fieldsEnabled = computed(() => props.modelValue && (activeTab.value === 'fields' || typeApi.createOpen.value))
const typeApi = usePerformanceMetricTypes(typesEnabled)
const { rows, keyword, page, pageSize, total, loading, loadError, canCreate, createOpen, saving, saveError, load, openCreate, save,
  editing, busy, actionError, removing, deleteOpen, deleting, deleteError, deleteBlocked, openEdit, openRemove, remove } = usePerformanceMetricFields(fieldsEnabled)
const typeRows = computed(() => props.typeApiEnabled ? typeApi.rows.value : props.typeRows)
const typeLoading = computed(() => props.typeApiEnabled ? typeApi.loading.value : false)
const typeLoadError = computed(() => props.typeApiEnabled ? typeApi.loadError.value : '')
const typeTotal = computed(() => props.typeApiEnabled ? typeApi.total.value : props.typeRows.length)
const typePage = computed(() => props.typeApiEnabled ? typeApi.page.value : 1)
const typePageSize = computed(() => props.typeApiEnabled ? typeApi.pageSize.value : 10)
const tabs = [{ value: 'types' as const, label: '指标类型' }, { value: 'fields' as const, label: '指标字段' }]

function handleTypeEdit(row: PerformanceMetricTypeRow) {
  if (props.typeApiEnabled) typeApi.openEdit(row)
  else emit('edit-type', row)
}

function handleTypePageChange(value: number) {
  if (props.typeApiEnabled) typeApi.page.value = value
  else emit('type-page-change', value)
}

function handleTypePageSizeChange(value: number) {
  if (props.typeApiEnabled) typeApi.pageSize.value = value
  else emit('type-page-size-change', value)
}

async function openFieldCreateFromType() {
  creatingFieldFromType.value = true
  emit('create')
  if (!canCreate.value) await load()
  openCreate()
}

async function handleFieldSave(value: Parameters<typeof save>[0]) {
  await save(value)
  if (!createOpen.value && props.typeApiEnabled && typeApi.createOpen.value) {
    const attachToType = creatingFieldFromType.value
    creatingFieldFromType.value = false
    await typeApi.load()
    if (attachToType) {
      const created = typeApi.fieldOptions.value.find(field => field.name === value.name.trim() && field.field_type === value.field_type)
      if (created) typeDialogRef.value?.addFieldFromApi(created.id)
    }
  }
}

function close() {
  if (busy.value) return
  emit('back')
  emit('update:modelValue', false)
}
</script>

<style scoped>
.metric-field-management__error { display: flex; align-items: center; gap: var(--spacing-3); color: var(--performance-field-error-color); }
.metric-field-management { display: flex; min-width: 0; min-height: 100%; flex: 1; flex-direction: column; padding: var(--spacing-5); box-sizing: border-box; background: var(--color-surface-page); color: var(--color-text-primary); font: 400 var(--font-size-md)/var(--line-height-base) var(--font-sans); }
.metric-field-management__tabs { display: flex; position: relative; flex: 0 0 46px; align-items: stretch; border-bottom: 1px solid var(--color-line-divider); }
.metric-field-management__tab { position: relative; height: 46px; padding: 0 var(--spacing-4); border: 0; background: transparent; color: var(--color-text-secondary); font: 400 var(--font-size-md)/22px var(--font-sans); cursor: pointer; }
.metric-field-management__tab:first-child { padding-left: 0; }
.metric-field-management__tab.is-active { color: var(--color-text-primary); font-weight: 600; }
.metric-field-management__tab.is-active::after { position: absolute; right: var(--spacing-4); bottom: -1px; left: var(--spacing-4); height: 3px; border-radius: var(--radius-xs) var(--radius-xs) 0 0; background: var(--color-primary); content: ''; }
.metric-field-management__tab:first-child.is-active::after { left: 0; }
.metric-field-management__surface { display: flex; min-width: 0; min-height: 0; flex: 1; flex-direction: column; margin-top: var(--spacing-5); }
.metric-field-management__surface > :deep(.performance-create-button) { flex: 0 0 auto; align-self: flex-start; }
.metric-field-management__surface :deep(.list-toolbar) { margin-bottom: var(--spacing-4); }
.metric-field-management__table { min-height: 0; flex: 1; margin-top: var(--spacing-4); }
.metric-field-management__surface :deep(.performance-management-table) { min-height: 0; }
@media (max-width: 720px) { .metric-field-management { padding: var(--spacing-4); } }
</style>
