<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import PermissionButton from '@/components/PermissionButton.vue'
import { masterDataApi, type RecordEntity, type EntityRecordPage } from '@/api/masterData'
import { useUserStore } from '@/stores/user'
import { formatDisplayDateTime } from '@/utils/datetime'

const store = useUserStore()
const canView = computed(() => store.menus.some(m => m.code === 'system.master_entities'))
const entities = ref<RecordEntity[]>([])
const selectedId = ref<number | null>(null)
const result = ref<EntityRecordPage>({ total: 0, fields: [], items: [] })
const page = ref(1)
const loading = ref(false)
const error = ref('')
const detail = ref<EntityRecordPage | null>(null)
const detailLoading = ref(false)
const detailError = ref('')
let entityRequest = 0
let request = 0
let detailRequest = 0
function message(cause: any) {
  let value = cause?.response?.data?.detail
  if (typeof value === 'string') { try { value = JSON.parse(value) } catch { return value } }
  return value?.message || '记录读取失败，请核对当前权限后重试。'
}
function clearRecords() {
  ++request; ++detailRequest
  result.value = { total: 0, fields: [], items: [] }; detail.value = null
  loading.value = false; detailLoading.value = false; detailError.value = ''; error.value = ''
}
async function loadEntities() {
  const current = ++entityRequest
  entities.value = []; selectedId.value = null; clearRecords(); page.value = 1
  if (!canView.value) return
  loading.value = true
  try {
    const response = await masterDataApi.recordEntities()
    if (current !== entityRequest) return
    entities.value = response.items
    selectedId.value = response.items[0]?.id ?? null
  } catch (cause) { if (current === entityRequest) error.value = message(cause) }
  finally { if (current === entityRequest) loading.value = false }
}
async function loadRecords() {
  const entityId = selectedId.value
  clearRecords()
  const current = request
  if (!canView.value || entityId === null) return
  loading.value = true
  try {
    const response = await masterDataApi.records(entityId, { offset: (page.value - 1) * 20, limit: 20 })
    if (current === request) result.value = response
  } catch (cause) { if (current === request) error.value = message(cause) }
  finally { if (current === request) loading.value = false }
}
async function showDetail(recordId: number) {
  const entityId = selectedId.value
  const current = ++detailRequest
  detail.value = null; detailError.value = ''
  if (!canView.value || entityId === null) return
  detailLoading.value = true
  try {
    const response = await masterDataApi.record(entityId, recordId)
    if (current === detailRequest) detail.value = response
  } catch (cause) { if (current === detailRequest) { detailError.value = message(cause); result.value = { total: 0, fields: [], items: [] } } }
  finally { if (current === detailRequest) detailLoading.value = false }
}
watch(() => [canView.value, store.user?.id, JSON.stringify(store.menus)], loadEntities, { immediate: true, flush: 'sync' })
watch(selectedId, () => { if (selectedId.value !== null) { if (page.value !== 1) page.value = 1; else void loadRecords() } })
watch(page, () => { if (selectedId.value !== null) void loadRecords() })
onBeforeUnmount(() => { ++entityRequest; ++request; ++detailRequest })
</script>

<template>
  <section class="record-area">
    <div class="record-area__heading"><div><strong>业务记录</strong><p>只展示当前用户已获授权的已发布实体；Person记录由受控服务写入。</p></div><PermissionButton menu="system.master_entities" op="V" :disabled="loading" @click="loadEntities">刷新授权实体</PermissionButton></div>
    <el-alert v-if="!canView" title="需要主数据定义查看权限才能读取业务记录。" type="info" :closable="false" />
    <template v-else>
      <el-alert v-if="error" :title="error" type="error" :closable="false" />
      <PermissionButton v-if="error && selectedId" menu="system.master_entities" op="V" @click="loadRecords">重试记录查询</PermissionButton>
      <el-form v-if="entities.length" inline style="margin: 12px 0 16px"><el-form-item label="授权实体"><el-select v-model="selectedId" style="width: 260px"><el-option v-for="entity in entities" :key="entity.id" :label="`${entity.name}（${entity.entity_code}）`" :value="entity.id" /></el-select></el-form-item></el-form>
      <el-empty v-else-if="!loading && !error" description="暂无已授权的业务记录实体。" />
      <div v-if="entities.length" style="overflow-x: auto"><el-table v-loading="loading" :data="result.items" stripe style="width: 100%" max-height="600" empty-text="该实体暂无可见记录。">
        <el-table-column prop="id" label="记录ID" min-width="100" />
        <el-table-column v-for="field in result.fields" :key="field.id" :label="field.name" min-width="160"><template #default="{ row }">{{ row.values[String(field.id)] ?? '—' }}</template></el-table-column>
        <el-table-column label="版本" prop="revision" min-width="90" /><el-table-column label="创建时间" min-width="180"><template #default="{ row }">{{ formatDisplayDateTime(row.created_at) }}</template></el-table-column>
        <el-table-column label="操作" width="280" fixed="right"><template #default="{ row }"><PermissionButton menu="system.master_entities" op="V" link type="primary" :disabled="detailLoading" @click="showDetail(row.id)">查看记录详情</PermissionButton></template></el-table-column>
      </el-table></div>
      <el-pagination v-if="entities.length" v-model:current-page="page" :total="result.total" :page-size="20" layout="total, prev, pager, next" />
      <el-alert v-if="detailError" :title="detailError" type="error" :closable="false" />
      <section v-if="detail?.items[0]" class="record-detail"><div class="record-area__heading"><strong>记录详情 · {{ detail.items[0].id }}</strong><PermissionButton menu="system.master_entities" op="V" link @click="detail = null">收起详情</PermissionButton></div><el-descriptions :column="2" border><el-descriptions-item v-for="field in detail.fields" :key="field.id" :label="field.name">{{ detail.items[0].values[String(field.id)] ?? '—' }}</el-descriptions-item></el-descriptions></section>
    </template>
  </section>
</template>

<style scoped>
.record-area { margin-top: 24px; border-top: 1px solid var(--color-border); padding-top: 20px; }
.record-area__heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.record-area__heading p { margin: 6px 0 0; color: var(--color-text-secondary); font-size: 13px; }
.record-detail { margin-top: 20px; }
.el-pagination { margin-top: 16px; justify-content: flex-end; }
</style>
