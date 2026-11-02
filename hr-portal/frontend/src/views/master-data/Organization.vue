<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import PermissionButton from '@/components/PermissionButton.vue'
import PerformanceSearchInput from '@/components/performance/PerformanceSearchInput.vue'
import OrganizationTree from '@/components/master-data/OrganizationTree.vue'
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
    <div class="organization__heading">
      <div>
        <h2>组织</h2>
        <p>组织树为只读目录，用于检索、展开并核对组织层级与启停状态；来源同步与维护不在本页。</p>
      </div>
      <PermissionButton menu="people.organization" op="V" :disabled="loading" @click="load">刷新</PermissionButton>
    </div>
    <el-alert v-if="!canView" title="需要组织查看权限。" type="info" :closable="false" />
    <template v-else>
      <el-alert v-if="error" :title="error" type="error" :closable="false" />
      <div v-else class="organization__toolbar">
        <div class="organization__search">
          <PerformanceSearchInput v-model="keyword" placeholder="搜索组织名称" />
        </div>
        <el-checkbox v-model="includeInactive" :disabled="loading">含停用组织</el-checkbox>
      </div>
      <div v-loading="loading" class="organization__tree">
        <OrganizationTree v-if="visibleTrees.length" :nodes="visibleTrees" :searching="searching" />
        <el-empty v-else-if="!loading" description="暂无组织。组织由后端同步后显示在此。" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.organization { padding: 20px; }
.organization__heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 16px; }
.organization__heading h2 { margin: 0; font-size: 18px; }
.organization__heading p { margin: 6px 0 0; color: var(--color-text-secondary); font-size: 13px; }
.organization__toolbar { display: flex; align-items: center; gap: 16px; margin-bottom: 12px; }
.organization__search { width: 280px; }
.organization__tree { border: 1px solid var(--color-border); border-radius: 4px; background: var(--color-bg-card); padding: 8px 0; }
</style>
