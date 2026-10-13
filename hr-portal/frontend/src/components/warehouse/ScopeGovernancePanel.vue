<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { listScopeHealth, type ScopeHealth } from '@/api/scopeGovernance'
import { useUserStore } from '@/stores/user'
import PermissionButton from '@/components/PermissionButton.vue'
import ScopeHealthTable from './ScopeHealthTable.vue'
import ScopeClassificationDrawer from './ScopeClassificationDrawer.vue'

const userStore = useUserStore()
const router = useRouter()
const canView = computed(() => userStore.menus.some(menu => menu.code === 'warehouse.governance'))
const rows = ref<ScopeHealth[]>([])
const loading = ref(false)
const error = ref('')
const search = ref('')
const issueFilter = ref('all')
const selectedTable = ref('')
const drawerOpen = ref(false)
const message = ref('')
let epoch = 0
const visibleRows = computed(() => rows.value.filter(row => row.table_name.toLowerCase().includes(search.value.trim().toLowerCase()) && (issueFilter.value === 'all' || row.issues.some(issue => issue.severity === issueFilter.value))))

async function load() {
  const request = ++epoch
  rows.value = []
  error.value = ''
  loading.value = false
  if (!canView.value) { drawerOpen.value = false; return }
  loading.value = true
  try {
    const response = await listScopeHealth()
    if (request === epoch) rows.value = response
  } catch (cause) {
    if (request !== epoch) return
    const status = (cause as { response?: { status?: number } })?.response?.status
    error.value = status === 403 ? '无权限读取范围治理信息。' : status === 404 ? '范围治理接口尚未可用，请核对后端版本与迁移状态。' : '范围健康扫描失败，请重试。'
  } finally {
    if (request === epoch) loading.value = false
  }
}

function review(tableName: string) {
  selectedTable.value = tableName
  drawerOpen.value = true
  message.value = ''
}
function repair(tableName: string) {
  router.push(`/warehouse/assets/${encodeURIComponent(tableName)}/columns`)
}
function approved(tableName: string) {
  message.value = `${tableName} 的批准记录已保存；当前查询授权未改变。`
}
watch(canView, load, { immediate: true })
onBeforeUnmount(() => { epoch++ })
</script>

<template>
  <el-card shadow="never" class="scope-governance">
    <template #header>
      <div class="scope-heading">
        <div><strong>范围健康与安全分类</strong><p>检查当前配置缺口；分类批准只记录治理判断，不更改查询权限。</p></div>
        <PermissionButton menu="warehouse.governance" op="V" :disabled="loading" :loading="loading" @click="load">刷新扫描</PermissionButton>
      </div>
    </template>
    <p v-if="!canView" role="alert">无权限查看治理元数据。</p>
    <template v-else>
      <div class="scope-toolbar">
        <el-input v-model="search" clearable placeholder="搜索数据表" aria-label="搜索数据表" />
        <el-select v-model="issueFilter" aria-label="诊断状态">
          <el-option label="全部状态" value="all" /><el-option label="需修复" value="error" /><el-option label="待核对" value="warning" />
        </el-select>
      </div>
      <el-alert v-if="error" :title="error" type="error" :closable="false" class="scope-feedback" />
      <el-alert v-if="message" :title="message" type="success" :closable="false" class="scope-feedback" />
      <div v-loading="loading" :aria-busy="loading" class="scope-feedback">
        <p v-if="loading" role="status">正在扫描范围配置…</p>
        <el-empty v-else-if="!error && !rows.length" description="暂无注册资产。请先在数据资产中登记来源。" />
        <el-empty v-else-if="!error && !visibleRows.length" description="没有匹配的数据表，请调整搜索或诊断状态。" />
        <ScopeHealthTable v-else-if="!error" :rows="visibleRows" @review="review" @repair="repair" />
      </div>
      <p class="scope-note">扫描仅核对范围配置，不代表字段敏感性、完整业务金额或新授权合同已验收。</p>
      <ScopeClassificationDrawer v-model="drawerOpen" :table-name="selectedTable" @approved="approved" />
    </template>
  </el-card>
</template>

<style scoped>
.scope-governance { margin-bottom: var(--spacing-md, 16px); }
.scope-heading, .scope-toolbar { display: flex; align-items: center; gap: 12px; }
.scope-heading { justify-content: space-between; }
.scope-heading p, .scope-note { color: var(--color-text-secondary); font-size: 13px; line-height: 1.6; margin: 6px 0 0; }
.scope-toolbar .el-input { max-width: 300px; }
.scope-toolbar .el-select { width: 160px; }
.scope-feedback { margin-top: 16px; }
@media (max-width: 640px) {
  .scope-heading, .scope-toolbar { align-items: flex-start; flex-wrap: wrap; }
  .scope-toolbar .el-input, .scope-toolbar .el-select { width: 100%; max-width: none; }
}
</style>
