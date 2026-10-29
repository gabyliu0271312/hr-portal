<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import PermissionButton from '@/components/PermissionButton.vue'
import { masterDataApi, type EntityRecordPage, type MasterDataOverviewItem } from '@/api/masterData'
import { useUserStore } from '@/stores/user'
import { formatDisplayDateTime } from '@/utils/datetime'

const store = useUserStore()
const canView = computed(() => store.menus.some(m => m.code === 'master_data.overview'))
const items = ref<MasterDataOverviewItem[]>([])
const loading = ref(false)
const error = ref('')
const detail = ref<{ entity: MasterDataOverviewItem; page: EntityRecordPage | null; error: string; loading: boolean } | null>(null)
let request = 0
let detailRequest = 0

function message(cause: any) {
  const value = cause?.response?.data?.detail
  return (typeof value === 'string' ? value : value?.message) || '读取失败，请核对当前权限后重试。'
}
async function load() {
  const current = ++request
  items.value = []; error.value = ''; detail.value = null; loading.value = false
  if (!canView.value) return
  loading.value = true
  try {
    const response = await masterDataApi.overview()
    if (current === request) items.value = response.items
  } catch (cause) { if (current === request) error.value = message(cause) }
  finally { if (current === request) loading.value = false }
}
async function showRecords(entity: MasterDataOverviewItem) {
  const current = ++detailRequest
  detail.value = { entity, page: null, error: '', loading: true }
  try {
    const page = await masterDataApi.records(entity.id, { offset: 0, limit: 20 })
    if (current === detailRequest && detail.value) { detail.value.page = page; detail.value.loading = false }
  } catch (cause) {
    if (current === detailRequest && detail.value) { detail.value.error = message(cause); detail.value.loading = false }
  }
}
watch(() => [canView.value, store.user?.id, JSON.stringify(store.menus)], load, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => { ++request; ++detailRequest })
</script>

<template>
  <div class="overview">
    <div class="overview__heading">
      <div>
        <h2>主数据概览</h2>
        <p>实体由后端统一建立，本页只读；记录数量按实体汇总，查看记录仍受实体授权、人员范围与字段权限约束。</p>
      </div>
      <PermissionButton menu="master_data.overview" op="V" :disabled="loading" @click="load">刷新</PermissionButton>
    </div>
    <el-alert v-if="!canView" title="需要主数据概览查看权限。" type="info" :closable="false" />
    <template v-else>
      <el-alert v-if="error" :title="error" type="error" :closable="false" />
      <el-table v-loading="loading" :data="items" stripe style="width: 100%" empty-text="暂无主数据实体。实体由后端建立后显示在此。">
        <el-table-column label="实体" min-width="200">
          <template #default="{ row }"><strong>{{ row.name }}</strong><div class="overview__code">{{ row.entity_code }}</div></template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }"><el-tag :type="row.published ? 'success' : 'info'" size="small">{{ row.published ? '已发布' : '草稿' }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="field_count" label="字段数" width="90" />
        <el-table-column prop="source_count" label="来源数" width="90" />
        <el-table-column prop="record_count" label="记录数" width="100" />
        <el-table-column label="最近写入" min-width="180">
          <template #default="{ row }">{{ row.last_record_at ? formatDisplayDateTime(row.last_record_at) : '—' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <PermissionButton menu="master_data.overview" op="V" link type="primary" :disabled="!row.record_count" @click="showRecords(row)">查看记录</PermissionButton>
          </template>
        </el-table-column>
      </el-table>
      <el-drawer v-if="detail" :model-value="true" :title="`记录 · ${detail.entity.name}`" size="50%" @close="detail = null">
        <el-alert v-if="detail.error" :title="detail.error" type="error" :closable="false" />
        <el-table v-if="detail.page" v-loading="detail.loading" :data="detail.page.items" stripe empty-text="该实体暂无可读记录。">
          <el-table-column prop="id" label="记录ID" width="100" />
          <el-table-column v-for="field in detail.page.fields" :key="field.id" :label="field.name" min-width="140">
            <template #default="{ row }">{{ row.values[String(field.id)] ?? '—' }}</template>
          </el-table-column>
          <el-table-column prop="revision" label="版本" width="80" />
        </el-table>
      </el-drawer>
    </template>
  </div>
</template>

<style scoped>
.overview { padding: 20px; }
.overview__heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 16px; }
.overview__heading h2 { margin: 0; font-size: 18px; }
.overview__heading p { margin: 6px 0 0; color: var(--color-text-secondary); font-size: 13px; }
.overview__code { color: var(--color-text-secondary); font-size: 12px; }
</style>
