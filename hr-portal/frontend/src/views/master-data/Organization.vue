<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import PerformanceSearchInput from '@/components/performance/PerformanceSearchInput.vue'
import OrganizationTree from '@/components/master-data/OrganizationTree.vue'
import { treesApi, type TreeNode } from '@/api/data'
import { useUserStore } from '@/stores/user'

const store = useUserStore()
const canView = computed(() => store.menus.some(m => m.code === 'people.organization'))
const tab = ref<'people' | 'org'>('org')
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
    <div class="organization__tabs">
      <button class="organization__tab" :class="{ 'is-active': tab === 'people' }" type="button" @click="tab = 'people'">人员</button>
      <button class="organization__tab" :class="{ 'is-active': tab === 'org' }" type="button" @click="tab = 'org'">组织</button>
    </div>

    <div class="organization__card">
      <el-alert v-if="!canView" title="需要组织查看权限。" type="info" :closable="false" />

      <template v-else-if="tab === 'people'">
        <el-empty description="人员页建设中，后续版本提供。" />
      </template>

      <template v-else>
        <el-alert v-if="error" :title="error" type="error" :closable="false" />
        <div v-else class="organization__toolbar">
          <div class="organization__search">
            <PerformanceSearchInput v-model="keyword" placeholder="搜索" />
          </div>
          <el-checkbox v-model="includeInactive" :disabled="loading">含停用组织</el-checkbox>
        </div>
        <div v-loading="loading" class="organization__tree">
          <OrganizationTree v-if="visibleTrees.length" :nodes="visibleTrees" :searching="searching" />
          <el-empty v-else-if="!loading" description="暂无组织。组织由后端同步后显示在此。" />
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.organization { display: flex; flex-direction: column; height: 100%; }
.organization__tabs { display: flex; align-items: center; height: 56px; padding: 0 4px 0 20px; background: #fff; }
.organization__tab { display: flex; align-items: center; box-sizing: border-box; height: 100%; padding: 0 16px; border: 0; background: transparent; color: #1f2329; cursor: pointer; font: 400 16px/56px var(--font-sans); }
.organization__tab.is-active { color: #3370ff; font-weight: 500; box-shadow: inset 0 -2px 0 #3370ff; }
.organization__card { display: flex; flex-direction: column; flex: 1 1; min-height: 0; padding: 20px; box-sizing: border-box; background: #fff; border-radius: 8px 8px 0 0; }
.organization__card > :not(:first-child) { margin-top: 16px; }
.organization__toolbar { display: flex; align-items: center; gap: 12px; }
.organization__search { width: 310px; }
.organization__tree { flex: 1 1; min-height: 0; overflow-x: auto; }
</style>
