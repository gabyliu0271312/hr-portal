<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import PageTitle from '@/components/common/PageTitle.vue'
import UiSurface from '@/components/ui/UiSurface.vue'
import UiSortableTable, { type UiSortableColumn } from '@/components/ui/UiSortableTable.vue'
import PerformanceLineTabs from '@/components/performance/PerformanceLineTabs.vue'
import UiDialogShell from '@/components/ui/UiDialogShell.vue'
import UiButton from '@/components/ui/UiButton.vue'
import SearchInput from '@/components/common/SearchInput.vue'
import { standardFieldsApi, type PeopleField } from '@/api/standardFields'
import { useUserStore } from '@/stores/user'
import { Plus } from '@element-plus/icons-vue'

const store = useUserStore()
const canView = computed(() => store.menus.some(m => m.code === 'people.admin.form_config'))
const canEdit = computed(() => store.hasOp('people.admin.form_config', 'U'))

// 表单选项（form_key → 名称）
const FORMS: { key: string; label: string }[] = [
  { key: 'people_roster', label: '人员信息' },
  { key: 'allocation_result', label: '分摊结果' },
]
const activeForm = ref('people_roster')

const fields = ref<PeopleField[]>([])
const loading = ref(false)
const error = ref('')
const reordering = ref(false)
const addOpen = ref(false)
const addKeyword = ref('')
const addCandidates = ref<PeopleField[]>([])
const addLoading = ref(false)
const addError = ref('')
const selectedIds = ref<number[]>([])

const tableColumns = computed<UiSortableColumn[]>(() => [
  { key: 'field_code', label: '字段编码', minWidth: 200 },
  { key: 'field_name', label: '字段名称', minWidth: 170 },
  { key: 'entity_name', label: '归属实体', minWidth: 130 },
  { key: 'group_name', label: '业务分组', minWidth: 120 },
  { key: 'data_type', label: '数据类型', minWidth: 105 },
  { key: 'action', label: '操作', width: 80 },
])

function cellValue(row: PeopleField, column: UiSortableColumn) {
  if (column.key === 'entity_name') return row.entity_name || '未归属'
  if (column.key === 'group_name') return row.group_name || '未分组'
  return (row as any)[column.key] ?? '--'
}

function message(cause: any) {
  const value = cause?.response?.data?.detail
  return (typeof value === 'string' ? value : value?.message) || '操作失败，请重试。'
}

let request = 0
async function load() {
  const current = ++request
  if (!canView.value) return
  loading.value = true
  error.value = ''
  try {
    const result = await standardFieldsApi.formFields(activeForm.value)
    if (current !== request) return
    fields.value = result.items
  } catch (cause) {
    if (current === request) error.value = message(cause)
  } finally {
    if (current === request) loading.value = false
  }
}

async function loadCandidates() {
  const current = ++request
  addLoading.value = true
  addError.value = ''
  try {
    const result = await standardFieldsApi.list({
      keyword: addKeyword.value.trim() || undefined,
      is_active: true,
      limit: 100,
    })
    if (current !== request) return
    const bound = new Set(fields.value.map(f => f.id))
    addCandidates.value = result.items.filter(f => !bound.has(f.id))
    // 保留仍在候选中的已选（避免移除已绑字段后残留）
    selectedIds.value = selectedIds.value.filter(id => addCandidates.value.some(f => f.id === id))
  } catch (cause) {
    if (current === request) addError.value = message(cause)
  } finally {
    if (current === request) addLoading.value = false
  }
}

function openAdd() {
  addKeyword.value = ''
  selectedIds.value = []
  addOpen.value = true
  void loadCandidates()
}

function toggleSelect(id: number) {
  const idx = selectedIds.value.indexOf(id)
  if (idx >= 0) selectedIds.value.splice(idx, 1)
  else selectedIds.value.push(id)
}

/** 多选添加：确定后批量加入表单，本地乐观更新避免闪屏 */
async function confirmAdd() {
  if (!canEdit.value || !selectedIds.value.length) return
  const ids = selectedIds.value.slice()
  const selected = addCandidates.value.filter(f => ids.includes(f.id))
  const previous = fields.value
  // 乐观添加（追加到末尾，display_order 递增）
  fields.value = [...fields.value, ...selected]
  addOpen.value = false
  try {
    for (const id of ids) {
      await standardFieldsApi.addFormField(activeForm.value, id)
    }
    await load()
  } catch (cause) {
    fields.value = previous
    error.value = message(cause)
  }
}

/** 移除字段：本地乐观移除避免闪屏，失败回滚 */
async function removeField(fieldId: number) {
  if (!canEdit.value) return
  const previous = fields.value
  fields.value = fields.value.filter(f => f.id !== fieldId)
  try {
    await standardFieldsApi.removeFormField(activeForm.value, fieldId)
  } catch (cause) {
    fields.value = previous
    error.value = message(cause)
  }
}

async function reorderFields(from: number, to: number) {
  if (from === to || reordering.value) return
  const next = fields.value.slice()
  const [moved] = next.splice(from, 1)
  if (!moved) return
  next.splice(to, 0, moved)
  const previous = fields.value
  fields.value = next
  reordering.value = true
  try {
    await standardFieldsApi.reorderFormFields(activeForm.value, next.map(f => f.id))
  } catch {
    fields.value = previous
    error.value = '排序保存失败，请重试。'
  } finally {
    reordering.value = false
  }
}

watch(() => [canView.value, canEdit.value, store.user?.id], load, { immediate: true, flush: 'sync' })
watch(activeForm, () => { void load() })
onBeforeUnmount(() => { ++request })
</script>

<template>
  <div class="form-config">
    <PageTitle title="表单配置" description="表单列引用标准字段，加/删表单字段不影响标准字段本身；取值来源由数据连接配置。" />
    <UiSurface class="form-config__card">
      <el-alert v-if="!canView" title="需要表单配置查看权限。" type="info" :closable="false" />
      <template v-else>
        <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
        <template v-else>
          <PerformanceLineTabs
            v-model="activeForm"
            :tabs="FORMS.map(f => ({ key: f.key, label: f.label }))"
            class="form-config__tabs"
          />
          <div class="form-config__toolbar">
            <!-- 添加字段：UiButton 实心主按钮（17:1096 组件，padding 固定 4/11、高32、圆角6） -->
            <UiButton v-if="canEdit" variant="primary" @click="openAdd">
              <el-icon class="form-config__add-icon"><Plus /></el-icon>添加字段
            </UiButton>
          </div>
          <div v-loading="loading" class="form-config__table">
            <UiSortableTable
              :columns="tableColumns"
              :rows="fields"
              :row-key="row => String(row.id)"
              :loading="loading"
              :empty-text="'该表单暂无字段，点击「添加字段」配置。'"
              aria-label="表单字段配置"
              @reorder="reorderFields"
            >
              <template #cell="{ row, column }">
                <template v-if="column.key === 'action'">
                  <button v-if="canEdit" type="button" class="org-table__action" :aria-label="`移除${row.field_name}`" @click="removeField(row.id)">移除</button>
                </template>
                <template v-else-if="column.key === 'field_code'">
                  <el-tooltip :content="row.field_code" placement="top" :show-after="300">
                    <span class="form-config__code">{{ row.field_code }}</span>
                  </el-tooltip>
                </template>
                <template v-else-if="column.key === 'field_name'">
                  <el-tooltip :content="row.field_name" placement="top" :show-after="300">
                    <span class="form-config__name">{{ row.field_name }}</span>
                  </el-tooltip>
                </template>
                <span v-else>{{ cellValue(row, column) }}</span>
              </template>
            </UiSortableTable>
          </div>
        </template>
      </template>
    </UiSurface>

    <!-- 添加字段弹窗：多选 + 确定/取消右下角（13:60 设计 token） -->
    <UiDialogShell v-model="addOpen" title="添加字段" width="640px">
      <div class="form-config__add-body">
        <SearchInput v-model="addKeyword" placeholder="搜索字段编码或名称" @keyup.enter="loadCandidates" />
        <el-alert v-if="addError" :title="addError" type="error" :closable="false" />
        <div v-loading="addLoading" class="form-config__candidates" role="listbox" aria-label="可选字段">
          <label
            v-for="field in addCandidates"
            :key="field.id"
            class="form-config__candidate"
            :class="{ 'is-selected': selectedIds.includes(field.id) }"
          >
            <input
              type="checkbox"
              class="form-config__candidate-check"
              :checked="selectedIds.includes(field.id)"
              :aria-label="`选择${field.field_name}`"
              @change="toggleSelect(field.id)"
            >
            <el-tooltip :content="field.field_code" placement="top" :show-after="300">
              <span class="form-config__candidate-code">{{ field.field_code }}</span>
            </el-tooltip>
            <el-tooltip :content="field.field_name" placement="top" :show-after="300">
              <span class="form-config__candidate-name">{{ field.field_name }}</span>
            </el-tooltip>
            <span class="form-config__candidate-group">{{ field.group_name || '未分组' }}</span>
          </label>
          <p v-if="!addCandidates.length && !addLoading" class="form-config__candidates-empty">
            {{ addKeyword ? '无匹配字段' : '标准字段目录中暂无未绑定字段' }}
          </p>
        </div>
      </div>
      <template #footer>
        <div class="form-config__footer">
          <UiButton variant="outline-primary" @click="addOpen = false">取消</UiButton>
          <UiButton variant="primary" :disabled="!selectedIds.length" @click="confirmAdd">确定</UiButton>
        </div>
      </template>
    </UiDialogShell>
  </div>
</template>

<style scoped>
.form-config {
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
.form-config__card { display: flex; flex-direction: column; flex: 0 0 auto; min-width: 0; }
.form-config__card > .el-alert { margin-top: var(--spacing-4); }
.form-config__tabs { margin-bottom: var(--page-gap-toolbar-table); }
.form-config__toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--page-gap-toolbar-items); margin-bottom: var(--page-gap-toolbar-table); }
.form-config__add-icon { width: 16px; height: 16px; margin-right: 4px; }
.form-config__table { display: flex; flex-direction: column; min-width: 0; }
/* 表格编码/名称列：左对齐、留足空间、超长省略 + hover 完整显示 */
.form-config__code, .form-config__name { display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: bottom; }
/* 操作列文字按钮：设计稿 17:1042 主要文字按钮·无图标 */
.org-table__actions { display: inline-flex; align-items: center; gap: 4px; }
.org-table__action {
  height: 26px;
  padding: 2px 4px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #1456f0;
  cursor: pointer;
  font: 500 14px/22px var(--font-sans);
  white-space: nowrap;
}
.org-table__action:hover { background: rgba(20, 86, 240, 0.1); }
.org-table__action:active { background: rgba(20, 86, 240, 0.2); }
.org-table__action:focus-visible { outline: 2px solid var(--performance-button-focus-ring); outline-offset: 2px; }
/* 添加字段弹窗 body */
.form-config__add-body { display: flex; flex-direction: column; gap: var(--spacing-3); padding: var(--spacing-4) 0; }
.form-config__candidates { display: flex; flex-direction: column; max-height: 320px; overflow-y: auto; gap: 2px; }
.form-config__candidate {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-primary);
  cursor: pointer;
  font: inherit;
  text-align: left;
}
.form-config__candidate:hover { background: var(--color-bg-hover); }
.form-config__candidate.is-selected { background: var(--color-primary-light); }
.form-config__candidate-check { width: 16px; height: 16px; flex: 0 0 16px; margin: 0; accent-color: var(--color-primary); }
.form-config__candidate-code {
  min-width: 160px;
  flex: 0 0 160px;
  color: var(--color-text-secondary);
  font-family: var(--font-mono, monospace);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}
.form-config__candidate-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; }
.form-config__candidate-group { flex: 0 0 90px; color: var(--color-text-placeholder); font-size: 12px; text-align: left; }
.form-config__candidates-empty { margin: 0; padding: 16px; color: var(--color-text-secondary); text-align: center; }
/* 弹窗 footer：UiButton（13:60 设计 token，确定实心/取消描边，右下角） */
.form-config__footer { display: flex; justify-content: flex-end; gap: var(--ui-dialog-footer-gap, 12px); }
</style>
