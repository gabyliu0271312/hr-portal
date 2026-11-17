<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import PageTitle from '@/components/common/PageTitle.vue'
import UiSurface from '@/components/ui/UiSurface.vue'
import UiSortableTable, { type UiSortableColumn } from '@/components/ui/UiSortableTable.vue'
import PerformanceLineTabs from '@/components/performance/PerformanceLineTabs.vue'
import UiDialogShell from '@/components/ui/UiDialogShell.vue'
import SearchInput from '@/components/common/SearchInput.vue'
import { standardFieldsApi, type PeopleField } from '@/api/standardFields'
import { useUserStore } from '@/stores/user'

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

const tableColumns = computed<UiSortableColumn[]>(() => [
  { key: 'field_code', label: '字段编码', minWidth: 160 },
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
  } catch (cause) {
    if (current === request) addError.value = message(cause)
  } finally {
    if (current === request) addLoading.value = false
  }
}

function openAdd() {
  addKeyword.value = ''
  addOpen.value = true
  void loadCandidates()
}

async function addField(fieldId: number) {
  if (!canEdit.value) return
  try {
    await standardFieldsApi.addFormField(activeForm.value, fieldId)
    addOpen.value = false
    await load()
  } catch (cause) {
    error.value = message(cause)
  }
}

async function removeField(fieldId: number) {
  if (!canEdit.value) return
  try {
    await standardFieldsApi.removeFormField(activeForm.value, fieldId)
    await load()
  } catch (cause) {
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

function switchForm(key: string) {
  activeForm.value = key
  pageReset()
  void load()
}
function pageReset() { /* 表单切换无需分页重置 */ }

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
            <button
              v-if="canEdit"
              type="button"
              class="org-table__action form-config__add"
              @click="openAdd"
            >添加字段</button>
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
                <span v-else>{{ cellValue(row, column) }}</span>
              </template>
            </UiSortableTable>
          </div>
        </template>
      </template>
    </UiSurface>

    <!-- 添加字段弹窗 -->
    <UiDialogShell v-model="addOpen" title="添加字段" width="640px">
      <div class="form-config__add-body">
        <SearchInput v-model="addKeyword" placeholder="搜索字段编码或名称" @keyup.enter="loadCandidates" />
        <el-alert v-if="addError" :title="addError" type="error" :closable="false" />
        <div v-loading="addLoading" class="form-config__candidates">
          <button
            v-for="field in addCandidates"
            :key="field.id"
            type="button"
            class="form-config__candidate"
            @click="addField(field.id)"
          >
            <span class="form-config__candidate-code">{{ field.field_code }}</span>
            <span class="form-config__candidate-name">{{ field.field_name }}</span>
            <span class="form-config__candidate-group">{{ field.group_name || '未分组' }}</span>
          </button>
          <p v-if="!addCandidates.length && !addLoading" class="form-config__candidates-empty">
            {{ addKeyword ? '无匹配字段' : '标准字段目录中暂无未绑定字段' }}
          </p>
        </div>
      </div>
      <template #footer>
        <button type="button" class="form-config__dialog-close" @click="addOpen = false">关闭</button>
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
.form-config__add { height: 26px; padding: 2px 12px; border-radius: 6px; background: transparent; color: #1456f0; cursor: pointer; font: 500 14px/22px var(--font-sans); }
.form-config__table { display: flex; flex-direction: column; min-width: 0; }
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
.form-config__candidate-code { min-width: 120px; color: var(--color-text-secondary); font-family: var(--font-mono, monospace); }
.form-config__candidate-name { flex: 1; }
.form-config__candidate-group { color: var(--color-text-placeholder); font-size: 12px; }
.form-config__candidates-empty { margin: 0; padding: 16px; color: var(--color-text-secondary); text-align: center; }
.form-config__dialog-close {
  height: 32px;
  padding: 0 16px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-regular);
  cursor: pointer;
  font: 400 14px/32px var(--font-sans);
}
</style>
