<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import SearchInput from '@/components/common/SearchInput.vue'
import OrganizationTree from '@/components/master-data/OrganizationTree.vue'
import PageTitle from '@/components/common/PageTitle.vue'
import UiSurface from '@/components/ui/UiSurface.vue'
import { treesApi, type TreeNode, type TreeHealthWarning } from '@/api/data'
import { useUserStore } from '@/stores/user'

const store = useUserStore()
const canView = computed(() => store.menus.some(m => m.code === 'people.cost_center'))
const includeInactive = ref(false)
const keyword = ref('')
const trees = ref<TreeNode[]>([])
const loading = ref(false)
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
        <div class="cost-center__toolbar">
          <SearchInput v-model="keyword" placeholder="搜索" />
          <el-checkbox v-model="includeInactive" :disabled="loading">含停用成本中心</el-checkbox>
        </div>
        <div v-loading="loading" class="cost-center__tree">
          <OrganizationTree v-if="visibleTrees.length || error" :nodes="visibleTrees" :searching="searching" mode="cc" />
          <el-empty v-else-if="!loading" description="暂无成本中心。成本中心由后端同步后显示在此。" />
        </div>
      </template>
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
.cost-center__issues { margin: 4px 0 0; padding-left: 18px; color: var(--color-text-secondary); font-size: 13px; line-height: 20px; }
.cost-center__issues code { margin-right: 6px; color: var(--color-danger, #f53f3f); font-size: 12px; }
.cost-center__toolbar { display: flex; flex-wrap: wrap; align-items: center; flex: 0 0 auto; gap: var(--page-gap-toolbar-items); margin-bottom: var(--page-gap-toolbar-table); }
.cost-center__tree { display: flex; flex-direction: column; min-width: 0; }
</style>
