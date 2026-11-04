<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import SearchInput from '@/components/common/SearchInput.vue'
import OrganizationTree from '@/components/master-data/OrganizationTree.vue'
import PageTitle from '@/components/common/PageTitle.vue'
import UiSurface from '@/components/ui/UiSurface.vue'
import { treesApi, type TreeNode } from '@/api/data'
import { useUserStore } from '@/stores/user'

const store = useUserStore()
const canView = computed(() => store.menus.some(m => m.code === 'people.organization'))
const includeInactive = ref(false)
const keyword = ref('')
const trees = ref<TreeNode[]>([])
const loading = ref(false)
const error = ref('')
let request = 0

function message(cause: any) {
  const value = cause?.response?.data?.detail
  return (typeof value === 'string' ? value : value?.message) || '读取失败，请核对当前权限后重试。'
}
async function load() {
  const current = ++request
  trees.value = []; error.value = ''; loading.value = false
  if (!canView.value) return
  loading.value = true
  try {
    const response = await treesApi.orgDirectory(includeInactive.value)
    if (current === request) trees.value = response
  } catch (cause) { if (current === request) error.value = message(cause) }
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
      const children = walk(node.children)
      if (nameMatch || children.length) {
        const copy: TreeNode & { __searchMatch?: boolean; __hasSearchDescendant?: boolean } = { ...node, children }
        copy.__searchMatch = nameMatch
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
  <div class="organization">
    <PageTitle title="组织架构" description="展示所有组织相关的信息" />
    <UiSurface class="organization__card">
      <el-alert v-if="!canView" title="需要组织查看权限。" type="info" :closable="false" />

      <template v-else>
        <el-alert v-if="error" :title="error" type="error" :closable="false" />
        <template v-else>
          <div class="organization__toolbar">
            <SearchInput v-model="keyword" placeholder="搜索" />
            <el-checkbox v-model="includeInactive" :disabled="loading">含停用组织</el-checkbox>
          </div>
          <div v-loading="loading" class="organization__tree">
            <OrganizationTree v-if="visibleTrees.length" :nodes="visibleTrees" :searching="searching" />
            <el-empty v-else-if="!loading" description="暂无组织。组织由后端同步后显示在此。" />
          </div>
        </template>
      </template>
    </UiSurface>
  </div>
</template>

<style scoped>
/* REA 滚动模型：本页不设高度约束、自身不滚，内容自然生长，
   纵向/横向滚动都交给布局层 .people-main（唯一滚动容器，对应 REA #smb-content-container）。
   表头高度对齐 REA 部门页实测 51px（序列页为 46，故在页级覆盖而非改全局 token）。 */
.organization {
  --ui-table-header-height: 51px;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  min-height: 100%;
  min-width: 0;
  padding: var(--ui-page-padding);
  background: var(--ui-page-background);
}
.organization__card {
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
  min-width: 0;
}
.organization__card > .el-alert { margin-top: var(--spacing-4); }
.organization__toolbar { display: flex; flex-wrap: wrap; align-items: center; flex: 0 0 auto; gap: var(--page-gap-toolbar-items); margin-bottom: var(--page-gap-toolbar-table); }
.organization__tree { display: flex; flex-direction: column; min-width: 0; }

</style>
