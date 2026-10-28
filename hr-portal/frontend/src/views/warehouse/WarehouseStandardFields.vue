<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useUserStore } from '@/stores/user'
import { useRoute } from 'vue-router'
import { masterDataApi, type EntityDefinition } from '@/api/masterData'
import PermissionButton from '@/components/PermissionButton.vue'
import { standardFieldsApi, type StandardFieldSummary } from '@/api/standardFields'
import StandardFieldDrawer from '@/components/warehouse/StandardFieldDrawer.vue'

const userStore = useUserStore()
const route = useRoute()
const entities = ref<EntityDefinition[]>([])
const entityId = ref<number | undefined>()
const canEntityView = computed(() => userStore.menus.some(m => m.code === 'system.master_entities'))
const canView = computed(() => userStore.menus.some(menu => menu.code === 'warehouse.standard_fields.catalog'))
const rows = ref<StandardFieldSummary[]>([])
const total = ref(0)
const keyword = ref('')
const status = ref<boolean | ''>('')
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const error = ref('')
const drawerOpen = ref(false)
const selectedId = ref<number | null>(null)
const types: Record<string, string> = { string: '字符串', number: '数值', date: '日期', datetime: '日期时间', bool: '布尔', enum: '枚举' }
let requestId = 0
let entityRequestId = 0

async function load() {
  const current = ++requestId
  if (!canView.value) { rows.value = []; total.value = 0; return }
  loading.value = true
  error.value = ''
  try {
    const response = await standardFieldsApi.list({
      entity_id: entityId.value,
      keyword: keyword.value.trim() || undefined,
      is_active: status.value === '' ? undefined : status.value,
      offset: (page.value - 1) * pageSize.value,
      limit: pageSize.value,
    })
    if (current === requestId) { rows.value = response.items; total.value = response.total }
  } catch (cause: any) {
    if (current === requestId) {
      let detail = cause?.response?.data?.detail
      if (typeof detail === 'string') { try { detail = JSON.parse(detail) } catch { detail = { message: detail } } }
      error.value = detail?.message || (cause?.response?.status === 404 && entityId.value ? '所选实体不存在或无权访问。' : '加载标准字段失败，请重试。')
    }
  } finally {
    if (current === requestId) loading.value = false
  }
}
function search() { page.value = 1; void load() }
function openCreate() { if (entityId.value && (!canEntityView.value || !userStore.hasOp('system.master_entities', 'C'))) return; selectedId.value = null; drawerOpen.value = true }
function openDetail(id: number) { selectedId.value = id; drawerOpen.value = true }
function updated() { void load() }
watch(() => [canView.value, canEntityView.value, userStore.user?.id], async () => {
  const current = ++entityRequestId
  entities.value = []; drawerOpen.value = false; page.value = 1; void load()
  if (canView.value && canEntityView.value) {
    try { const result = await masterDataApi.list({ limit: 100 }); if (current === entityRequestId) entities.value = result.items }
    catch { if (current === entityRequestId) entities.value = [] }
  }
}, { immediate: true, flush: 'sync' })
watch(() => route.query.entity_id, value => { const id = Number(value); entityId.value = Number.isSafeInteger(id) && id > 0 ? id : undefined; page.value = 1; void load() }, { immediate: true })
watch([page, pageSize], () => { void load() })
onBeforeUnmount(() => { ++requestId; ++entityRequestId })

</script>

<template>
  <div style="padding: 24px">
    <el-card shadow="never">
      <template #header>
        <div class="standard-fields-heading">
          <div><strong>标准字段目录</strong><p>统一标准字段定义和敏感分类；不创建物理列、不自动开放报表。</p></div>
          <PermissionButton v-if="!entityId || (canEntityView && userStore.hasOp('system.master_entities', 'C'))" menu="warehouse.standard_fields.catalog" op="C" type="primary" @click="openCreate">新建标准字段</PermissionButton>
        </div>
      </template>
      <p v-if="!canView" role="alert">无权限查看标准字段目录。</p>
      <template v-else>
        <el-form inline @submit.prevent="search">
          <el-form-item v-if="canEntityView" label="归属实体"><el-select v-model="entityId" clearable placeholder="全部可访问字段" style="width: 180px" @change="search"><el-option v-for="entity in entities" :key="entity.id" :value="entity.id" :label="entity.name" /></el-select></el-form-item>
          <el-form-item label="搜索"><el-input v-model="keyword" clearable placeholder="编码、名称或业务定义" @keyup.enter="search" /></el-form-item>
          <el-form-item label="状态">
            <el-select v-model="status" clearable placeholder="全部状态" style="width: 140px" @change="search">
              <el-option v-for="state in [true, false]" :key="String(state)" :label="state ? '有效' : '停用'" :value="state" />
            </el-select>
          </el-form-item>
          <el-form-item><el-button type="primary" @click="search">查询</el-button><el-button @click="keyword = ''; status = ''; search()">重置</el-button></el-form-item>
        </el-form>
        <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon style="margin-bottom: 16px" />
        <div style="overflow-x: auto">
          <el-table v-loading="loading" :data="rows" stripe style="width: 100%" max-height="600" empty-text="暂无标准字段，可新建字段定义">
            <el-table-column prop="field_code" label="字段编码" min-width="160" />
            <el-table-column prop="field_name" label="字段名称" min-width="170" />
            <el-table-column prop="entity_name" label="归属实体" min-width="130"><template #default="{ row }">{{ row.entity_name || '未归属' }}</template></el-table-column>
            <el-table-column label="数据类型" min-width="105"><template #default="{ row }">{{ types[row.data_type] || row.data_type }}</template></el-table-column>
            <el-table-column prop="business_definition" label="业务定义" min-width="260" show-overflow-tooltip />
            <el-table-column label="敏感分类" min-width="110"><template #default="{ row }">{{ row.category_ids?.length ? `${row.category_ids.length} 个` : '未分类' }}</template></el-table-column>
            <el-table-column label="操作" width="160" fixed="right"><template #default="{ row }"><PermissionButton v-if="!row.entity_id || (canEntityView && userStore.hasOp('system.master_entities', 'U'))" menu="warehouse.standard_fields.catalog" op="U" size="small" @click="openDetail(row.id)">编辑</PermissionButton></template></el-table-column>
          </el-table>
        </div>
        <div class="standard-fields-pagination"><el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" :page-sizes="[20, 50, 100]" layout="total, sizes, prev, pager, next" /></div>
      </template>
    </el-card>
    <StandardFieldDrawer v-model="drawerOpen" :field-id="selectedId" :entity-id="entityId" @changed="updated" />
  </div>
</template>

<style scoped>
.standard-fields-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.standard-fields-heading strong { font-size: 16px; }
.standard-fields-heading p { margin: 6px 0 0; color: var(--color-text-secondary); font-size: 13px; }
.standard-fields-pagination { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>
