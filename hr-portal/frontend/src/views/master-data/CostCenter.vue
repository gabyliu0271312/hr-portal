<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import UiListToolbar from '@/components/ui/UiListToolbar.vue'
import UiCheckbox from '@/components/ui/UiCheckbox.vue'
import PermissionButton from '@/components/PermissionButton.vue'
import CostCenterCreateDialog from '@/components/master-data/CostCenterCreateDialog.vue'
import OrganizationTree from '@/components/master-data/OrganizationTree.vue'
import PerformanceConfirmDialog from '@/components/performance/PerformanceConfirmDialog.vue'
import PageTitle from '@/components/common/PageTitle.vue'
import UiSurface from '@/components/ui/UiSurface.vue'
import { treesApi, type TreeNode, type TreeHealthWarning } from '@/api/data'
import { useUserStore } from '@/stores/user'

const store = useUserStore()
const canView = computed(() => store.menus.some(m => m.code === 'people.cost_center'))
const canEdit = computed(() => store.hasOp('people.cost_center', 'U'))
const canAddChild = computed(() => store.hasOp('people.cost_center', 'C'))
const canDelete = computed(() => store.hasOp('people.cost_center', 'D'))
const includeInactive = ref(false)
const keyword = ref('')
const trees = ref<TreeNode[]>([])
const loading = ref(false)
const creating = ref(false)
const editing = ref(false)
const addingChild = ref(false)
const deleting = ref(false)
const removeFailed = ref(false)
const target = ref<TreeNode | null>(null)
function created() {
  keyword.value = ''
  load()
}
function edited() {
  load()
}
function confirmDelete() {
  deleting.value = false
  if (!target.value) return
  treesApi.deleteCostCenter(target.value.id)
    .then(() => {
      target.value = null
      load()
    })
    .catch(() => { target.value = null; removeFailed.value = true })
}
function onEdit(row: TreeNode) { target.value = row; editing.value = true }
function onAddChild(row: TreeNode) { target.value = row; addingChild.value = true }
function onDelete(row: TreeNode) {
  // 有子成本中心：不允许删除，直接弹单按钮「删除失败」提示（对齐 UI 17:1703）
  if (row.children?.length) {
    removeFailed.value = true
    return
  }
  target.value = row
  deleting.value = true
}
const error = ref('')
const issues = ref<HealthIssue[]>([])
const warnings = ref<TreeHealthWarning[]>([])
let request = 0

interface HealthIssue {
  code: string
  message: string
  node_code?: string | null
  node_id?: number | null
}

function parseError(cause: any): { text: string; issues: HealthIssue[] } {
  const detail = cause?.response?.data?.detail
  const text = (typeof detail === 'string' ? detail : detail?.message) || '读取失败，请核对当前权限后重试。'
  const list = Array.isArray(detail?.issues) ? detail.issues : []
  return { text, issues: list }
}
async function load() {
  const current = ++request
  trees.value = []; error.value = ''; issues.value = []; warnings.value = []; loading.value = false
  if (!canView.value) return
  loading.value = true
  try {
    const response = await treesApi.costCenterDirectory(includeInactive.value)
    if (current === request) {
      trees.value = response.tree
      warnings.value = response.warnings ?? []
    }
  } catch (cause) {
    if (current === request) {
      const parsed = parseError(cause)
      error.value = parsed.text
      issues.value = parsed.issues
    }
  }
  finally { if (current === request) loading.value = false }
}
watch(() => [canView.value, includeInactive.value, store.user?.id, JSON.stringify(store.menus)], load, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => { ++request })

const searching = computed(() => Boolean(keyword.value.trim()))

function filterTree(nodes: TreeNode[], kw: string): TreeNode[] {
  const lower = kw.toLowerCase()
  const walk = (list: TreeNode[]): TreeNode[] => {
    const out: TreeNode[] = []
    for (const node of list) {
      const nameMatch = node.name.toLowerCase().includes(lower)
      const codeMatch = node.code.toLowerCase().includes(lower)
      const children = walk(node.children)
      if (nameMatch || codeMatch || children.length) {
        const copy: TreeNode & { __searchMatch?: boolean; __hasSearchDescendant?: boolean } = { ...node, children }
        copy.__searchMatch = nameMatch || codeMatch
        copy.__hasSearchDescendant = children.length > 0
        out.push(copy)
      }
    }
    return out
  }
  return walk(nodes)
}

const visibleTrees = computed(() => searching.value ? filterTree(trees.value, keyword.value.trim()) : trees.value)
</script>

<template>
  <div class="cost-center">
    <PageTitle title="成本中心" description="展示所有成本中心相关的信息" />
    <UiSurface class="cost-center__card">
      <el-alert v-if="!canView" title="需要成本中心查看权限。" type="info" :closable="false" />

      <template v-else>
        <el-alert v-if="error" :title="error" type="error" :closable="false">
          <ul v-if="issues.length" class="cost-center__issues">
            <li v-for="issue in issues" :key="`${issue.code}-${issue.node_code ?? ''}-${issue.node_id ?? ''}`">
              <code>{{ issue.code }}</code> — {{ issue.message }}<span v-if="issue.node_code">（{{ issue.node_code }}）</span>
            </li>
          </ul>
        </el-alert>
        <el-alert v-else-if="warnings.length" title="成本中心树存在数据规范提示，已按当前形态展示。" type="warning" :closable="false">
          <ul class="cost-center__issues">
            <li v-for="warning in warnings" :key="`${warning.code}-${warning.node_code ?? ''}-${warning.node_id ?? ''}`">
              <code>{{ warning.code }}</code> — {{ warning.message }}<span v-if="warning.node_code">（{{ warning.node_code }}）</span>
            </li>
          </ul>
        </el-alert>
        <UiListToolbar v-model:keyword="keyword" search-placeholder="通过名称、编码搜索" search-aria-label="搜索成本中心" search-fill wrap gap="var(--ui-toolbar-gap)">
          <template #actions>
            <UiCheckbox v-model="includeInactive" :disabled="loading">含停用成本中心</UiCheckbox>
            <PermissionButton menu="people.cost_center" op="C" type="primary" class="cost-center__create" @click="creating = true">
              <svg class="cost-center__add-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
              新建成本中心
            </PermissionButton>
          </template>
        </UiListToolbar>
        <div v-loading="loading" class="cost-center__tree">
          <OrganizationTree v-if="visibleTrees.length || error" :nodes="visibleTrees" :searching="searching" mode="cc" :can-edit="canEdit" :can-add-child="canAddChild" :can-delete="canDelete" @edit="onEdit" @add-child="onAddChild" @delete="onDelete" />
          <el-empty v-else-if="!loading" description="暂无成本中心" />
        </div>
      </template>
      <CostCenterCreateDialog v-model="creating" mode="create" @created="created" />
      <CostCenterCreateDialog v-if="target" v-model="editing" mode="edit" :initial="target" @updated="edited" />
      <CostCenterCreateDialog v-if="target" v-model="addingChild" mode="addChild" :initial="target" @created="created" />
      <PerformanceConfirmDialog
        v-if="target"
        v-model="deleting"
        :message="`确定删除成本中心「${target.name}」吗？`"
        description="成本中心删除后不可恢复，且将在创梦各相关应用生效，请谨慎操作。"
        cancel-text="保留"
        confirm-text="删除"
        @confirm="confirmDelete"
      />
      <PerformanceConfirmDialog
        v-model="removeFailed"
        :message="'删除失败'"
        description="该成本中心包含下级成本中心，不允许删除。"
        :show-cancel="false"
        confirm-text="确定"
        confirm-variant="primary"
        @confirm="removeFailed = false"
      />
    </UiSurface>
  </div>
</template>

<style scoped>
.cost-center {
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
.cost-center__card {
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
  min-width: 0;
}
.cost-center__card > .el-alert { margin-top: var(--spacing-4); }
.cost-center__issues { margin: var(--spacing-1) 0 0; padding-left: var(--ui-feedback-list-indent); color: var(--color-text-secondary); font-size: var(--font-size-sm); line-height: var(--input-line-height); }
.cost-center__issues code { margin-right: var(--spacing-1); color: var(--color-text-danger-strong); font-size: var(--font-size-sm); }
.cost-center__create { height: var(--ui-toolbar-control-height); border-radius: var(--button-radius); font-size: var(--font-size-md); }
.cost-center__add-icon { width: var(--icon-size); height: var(--icon-size); margin-right: var(--spacing-1); }
.cost-center__tree { display: flex; flex-direction: column; min-width: 0; }
</style>
