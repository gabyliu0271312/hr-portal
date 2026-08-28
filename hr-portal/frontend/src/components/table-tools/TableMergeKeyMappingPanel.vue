<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Delete, Edit, Plus, Refresh } from '@element-plus/icons-vue'
import PermissionButton from '@/components/PermissionButton.vue'
import type { KeyMapping } from '@/api/tableTools'

const PAGE_SIZE = 20

const props = withDefaults(defineProps<{
  mergeKeys: string[]
  mappings: KeyMapping[]
  draft: KeyMapping | null
  loading?: boolean
  error?: string
  saveError?: string
  saving?: boolean
  togglingIds?: number[]
  canUpdate?: boolean
}>(), {
  loading: false,
  error: '',
  saveError: '',
  saving: false,
  togglingIds: () => [],
  canUpdate: true,
})

const emit = defineEmits<{
  'update:draft': [value: KeyMapping]
  create: []
  edit: [item: KeyMapping]
  cancel: []
  save: []
  delete: [item: KeyMapping]
  toggle: [item: KeyMapping, enabled: boolean]
  retry: []
}>()

const keyword = ref('')
const status = ref<'all' | 'enabled' | 'disabled'>('all')
const currentPage = ref(1)
const validationVisible = ref(false)

const filteredMappings = computed(() => {
  const normalizedKeyword = keyword.value.trim().toLocaleLowerCase()
  return props.mappings.filter((item) => {
    const matchesStatus = status.value === 'all'
      || (status.value === 'enabled' ? item.enabled : !item.enabled)
    if (!matchesStatus) return false
    if (!normalizedKeyword) return true
    return props.mergeKeys.some((field) =>
      String(item.source_key[field] ?? '').toLocaleLowerCase().includes(normalizedKeyword)
      || String(item.canonical_merge_key[field] ?? '').toLocaleLowerCase().includes(normalizedKeyword),
    )
  })
})

const pagedMappings = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return filteredMappings.value.slice(start, start + PAGE_SIZE)
})

const draftMissingFields = computed(() => {
  if (!props.draft) return []
  return props.mergeKeys.filter((field) =>
    !String(props.draft?.source_key[field] ?? '').trim()
    || !String(props.draft?.canonical_merge_key[field] ?? '').trim(),
  )
})

watch([keyword, status], () => { currentPage.value = 1 })
watch(() => props.mappings.length, () => {
  const lastPage = Math.max(1, Math.ceil(filteredMappings.value.length / PAGE_SIZE))
  if (currentPage.value > lastPage) currentPage.value = lastPage
})
watch(() => props.draft, () => { validationVisible.value = false })

function updateDraftSide(side: 'source_key' | 'canonical_merge_key', field: string, value: string) {
  if (!props.draft) return
  emit('update:draft', {
    ...props.draft,
    [side]: { ...props.draft[side], [field]: value },
  })
}

function updateDraftEnabled(enabled: boolean) {
  if (!props.draft) return
  emit('update:draft', { ...props.draft, enabled })
}

function submitDraft() {
  validationVisible.value = true
  if (draftMissingFields.value.length) return
  emit('save')
}

function displayValue(item: KeyMapping, side: 'source_key' | 'canonical_merge_key', field: string) {
  return `${field}：${String(item[side][field] ?? '')}`
}
</script>

<template>
  <section class="key-mapping-panel" aria-label="主键映射配置">

    <div v-if="draft" class="mapping-editor">
      <div class="editor-heading">
        <div>
          <strong>{{ draft.id ? '编辑映射' : '新增映射' }}</strong>
          <p>联合主键两侧字段均需完整填写。</p>
        </div>
        <el-switch
          :model-value="draft.enabled"
          :width="52"
          inline-prompt
          active-text="启用"
          inactive-text="停用"
          @update:model-value="updateDraftEnabled"
        />
      </div>

      <div class="editor-grid">
        <div class="editor-column">
          <h4>原始主键</h4>
          <label v-for="field in mergeKeys" :key="`source-${field}`" class="field-row">
            <span>{{ field }}</span>
            <el-input
              :model-value="String(draft.source_key[field] ?? '')"
              placeholder="请输入原始值"
              @update:model-value="updateDraftSide('source_key', field, $event)"
            />
          </label>
        </div>
        <div class="editor-column">
          <h4>归集主键</h4>
          <label v-for="field in mergeKeys" :key="`canonical-${field}`" class="field-row">
            <span>{{ field }}</span>
            <el-input
              :model-value="String(draft.canonical_merge_key[field] ?? '')"
              placeholder="请输入归集值"
              @update:model-value="updateDraftSide('canonical_merge_key', field, $event)"
            />
          </label>
        </div>
      </div>

      <p v-if="validationVisible && draftMissingFields.length" class="inline-error" role="alert">
        请完整填写：{{ draftMissingFields.join('、') }}
      </p>
      <p v-else-if="saveError" class="inline-error" role="alert">{{ saveError }}</p>

      <div class="editor-actions">
        <el-button size="small" @click="emit('cancel')">取消</el-button>
        <PermissionButton
          menu="table_tools"
          op="U"
          type="primary"
          size="small"
          :loading="saving"
          @click="submitDraft"
        >
          保存
        </PermissionButton>
      </div>
    </div>

    <div class="list-toolbar">
      <div class="filters">
        <el-input v-model="keyword" clearable placeholder="搜索主键值" class="keyword-input" />
        <el-select v-model="status" aria-label="状态筛选" class="status-select">
          <el-option label="全部状态" value="all" />
          <el-option label="已启用" value="enabled" />
          <el-option label="已停用" value="disabled" />
        </el-select>
      </div>
      <PermissionButton menu="table_tools" op="U" type="primary" @click="emit('create')">
        <el-icon><Plus /></el-icon>
        新增映射
      </PermissionButton>
    </div>

    <div v-if="loading" class="panel-state" aria-live="polite">
      <el-skeleton :rows="4" animated />
    </div>
    <div v-else-if="error" class="panel-state error-state" role="alert">
      <p>{{ error }}</p>
      <el-button size="small" :icon="Refresh" @click="emit('retry')">重新加载</el-button>
    </div>
    <div v-else-if="!mappings.length" class="panel-state empty-state">
      <el-empty description="暂无主键值映射，未配置时将沿用原始主键归集" />
    </div>
    <div v-else-if="!filteredMappings.length" class="panel-state empty-state">
      <el-empty description="没有符合当前筛选条件的主键值映射" />
    </div>
    <div v-else class="mapping-table-wrap">
      <table class="mapping-table">
        <thead>
          <tr>
            <th>原始主键</th>
            <th>归集主键</th>
            <th class="status-column">状态</th>
            <th class="operation-column">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in pagedMappings" :key="item.id" :class="{ disabled: !item.enabled }">
            <td>
              <div class="key-values">
                <el-tooltip
                  v-for="field in mergeKeys"
                  :key="field"
                  :content="displayValue(item, 'source_key', field)"
                  placement="top"
                >
                  <span class="key-value">{{ displayValue(item, 'source_key', field) }}</span>
                </el-tooltip>
              </div>
            </td>
            <td>
              <div class="key-values">
                <el-tooltip
                  v-for="field in mergeKeys"
                  :key="field"
                  :content="displayValue(item, 'canonical_merge_key', field)"
                  placement="top"
                >
                  <span class="key-value">{{ displayValue(item, 'canonical_merge_key', field) }}</span>
                </el-tooltip>
              </div>
            </td>
            <td class="status-column">
              <div class="status-cell">
                <el-switch
                  class="status-switch"
                  :model-value="item.enabled"
                  :width="52"
                  :disabled="!canUpdate || togglingIds.includes(item.id)"
                  :loading="togglingIds.includes(item.id)"
                  inline-prompt
                  active-text="启用"
                  inactive-text="停用"
                  :title="canUpdate ? undefined : '无权限'"
                  @update:model-value="emit('toggle', item, $event)"
                />
              </div>
            </td>
            <td class="operation-column">
              <div class="operation-cell">
                <el-tooltip content="编辑" placement="top">
                  <PermissionButton menu="table_tools" op="U" link size="small" @click="emit('edit', item)">
                    <el-icon><Edit /></el-icon>
                    <span class="sr-only">编辑</span>
                  </PermissionButton>
                </el-tooltip>
                <el-tooltip content="删除" placement="top">
                  <PermissionButton menu="table_tools" op="D" link type="danger" size="small" @click="emit('delete', item)">
                    <el-icon><Delete /></el-icon>
                    <span class="sr-only">删除</span>
                  </PermissionButton>
                </el-tooltip>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="pagination-row">
        <el-pagination
          v-model:current-page="currentPage"
          background
          layout="total, prev, pager, next"
          :page-size="PAGE_SIZE"
          :total="filteredMappings.length"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.key-mapping-panel { min-width: 0; }
.editor-heading, .list-toolbar, .filters, .editor-actions, .status-cell, .operation-cell {
  display: flex;
  align-items: center;
}
.mapping-editor { margin-bottom: 20px; padding: 20px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-bg-page); }
.editor-heading { justify-content: space-between; gap: 16px; margin-bottom: 18px; }
.editor-heading p { margin: 4px 0 0; color: var(--color-text-secondary); font-size: 13px; }
.editor-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 32px; }
.editor-column h4 { margin: 0 0 12px; font-size: 14px; letter-spacing: 0; }
.field-row { display: grid; grid-template-columns: minmax(90px, 120px) minmax(0, 1fr); gap: 12px; align-items: center; }
.field-row + .field-row { margin-top: 10px; }
.field-row > span { color: var(--color-text-secondary); font-size: 13px; overflow-wrap: anywhere; }
.inline-error { margin: 12px 0 0; color: var(--el-color-danger); font-size: 13px; }
.editor-actions { justify-content: flex-end; gap: 8px; margin-top: 18px; }
.list-toolbar { justify-content: space-between; gap: 16px; margin-bottom: 12px; }
.filters { flex: 1; gap: 10px; }
.keyword-input { width: min(320px, 55%); }
.status-select { width: 132px; }
.panel-state { min-height: 220px; display: flex; flex-direction: column; justify-content: center; }
.error-state { align-items: center; gap: 12px; color: var(--el-color-danger); }
.error-state p { margin: 0; }
.mapping-table-wrap { overflow-x: auto; }
.mapping-table { width: 100%; table-layout: fixed; border-collapse: collapse; }
.mapping-table th { padding: 12px 14px; color: var(--color-text-secondary); background: var(--color-bg-page); font-size: 13px; font-weight: 600; text-align: left; }
.mapping-table td { padding: 14px; border-bottom: 1px solid var(--color-border); vertical-align: middle; }
.mapping-table tbody tr.disabled { color: var(--color-text-secondary); background: color-mix(in srgb, var(--color-bg-page) 55%, transparent); }
.key-values { display: grid; gap: 5px; min-width: 0; }
.key-value { display: block; overflow: hidden; color: inherit; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.status-column { width: 110px; text-align: center !important; }
.operation-column { width: 92px; text-align: right !important; white-space: nowrap; }
.status-cell { justify-content: center; min-height: 32px; }
.operation-cell { justify-content: flex-end; gap: 2px; min-height: 32px; }
.pagination-row { display: flex; justify-content: flex-end; padding-top: 16px; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }

@media (max-width: 760px) {
  .editor-grid { grid-template-columns: 1fr; gap: 20px; }
  .list-toolbar, .filters { align-items: stretch; }
  .list-toolbar { flex-direction: column; }
  .keyword-input { width: 100%; }
  .mapping-table { min-width: 720px; }
}
</style>
