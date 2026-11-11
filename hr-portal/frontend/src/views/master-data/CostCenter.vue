<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import SearchInput from '@/components/common/SearchInput.vue'
import OrganizationTree from '@/components/master-data/OrganizationTree.vue'
import PageTitle from '@/components/common/PageTitle.vue'
import UiSurface from '@/components/ui/UiSurface.vue'
import { treesApi, type TreeNode } from '@/api/data'
import { useUserStore } from '@/stores/user'

const store = useUserStore()
const canView = computed(() => store.menus.some(m => m.code === 'people.cost_center'))
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
    const response = await treesApi.costCenterDirectory(includeInactive.value)
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
        <el-alert v-if="error" :title="error" type="error" :closable="false" />
        <template v-else>
          <div class="cost-center__toolbar">
            <SearchInput v-model="keyword" placeholder="搜索" />
            <el-checkbox v-model="includeInactive" :disabled="loading">含停用成本中心</el-checkbox>
          </div>
          <div v-loading="loading" class="cost-center__tree">
            <OrganizationTree v-if="visibleTrees.length" :nodes="visibleTrees" :searching="searching" mode="cc" />
            <el-empty v-else-if="!loading" description="暂无成本中心。成本中心由后端同步后显示在此。" />
          </div>
        </template>
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
.cost-center__toolbar { display: flex; flex-wrap: wrap; align-items: center; flex: 0 0 auto; gap: var(--page-gap-toolbar-items); margin-bottom: var(--page-gap-toolbar-table); }
.cost-center__tree { display: flex; flex-direction: column; min-width: 0; }
</style>
