<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import PermissionButton from '@/components/PermissionButton.vue'
import type { EntityDefinition } from '@/api/masterData'
import { standardFieldsApi, type StandardFieldSummary } from '@/api/standardFields'
import { useUserStore } from '@/stores/user'
const props = defineProps<{ entity: EntityDefinition }>()
const router = useRouter()
const store = useUserStore()
const canRead = computed(() => store.menus.some(m => m.code === 'system.master_entities') && store.menus.some(m => m.code === 'warehouse.standard_fields.catalog'))
const rows = ref<StandardFieldSummary[]>([])
const total = ref(0)
const loading = ref(false)
const error = ref('')
const page = ref(1)
let request = 0
async function load() {
  const current = ++request
  rows.value = []; total.value = 0; error.value = ''; loading.value = false
  if (!canRead.value) return
  loading.value = true
  try {
    const result = await standardFieldsApi.list({ entity_id: props.entity.id, offset: (page.value - 1) * 20, limit: 20 })
    if (current === request) { rows.value = result.items; total.value = result.total }
  } catch { if (current === request) error.value = '字段引用加载失败，请确认权限后重试。' }
  finally { if (current === request) loading.value = false }
}
watch(() => [props.entity.id, canRead.value, store.user?.id], () => { page.value = 1; void load() }, { immediate: true, flush: 'sync' })
watch(page, load)
onBeforeUnmount(() => { ++request })
</script>

<template>
  <section class="entity-fields">
    <div class="entity-fields__heading"><strong>{{ entity.name }} · 字段引用</strong><PermissionButton v-if="canRead" menu="warehouse.standard_fields.catalog" op="V" @click="router.push({ path: '/people/field-settings', query: { entity_id: entity.id } })">前往标准字段目录</PermissionButton></div>
    <p>这里只展示业务归属。工作地枚举及其选项统一在数据仓库 → 标准字段目录维护；本页不新增人员记录。</p>
    <el-alert v-if="!canRead" title="需要主数据定义和标准字段目录查看权限才能读取字段引用。" type="info" :closable="false" />
    <template v-else>
      <el-alert v-if="error" :title="error" type="error" :closable="false" /><PermissionButton v-if="error" menu="warehouse.standard_fields.catalog" op="V" @click="load">重试</PermissionButton>
      <div style="overflow-x: auto"><el-table v-loading="loading" :data="rows" stripe style="width: 100%" max-height="600" empty-text="暂无归属字段。请到标准字段目录创建工作地枚举并选择归属Person。">
        <el-table-column prop="field_code" label="标准字段编码" min-width="170" /><el-table-column prop="field_name" label="字段名称" min-width="140" /><el-table-column prop="data_type" label="逻辑类型" min-width="100" />
      </el-table></div>
      <el-pagination v-model:current-page="page" :total="total" :page-size="20" layout="total, prev, pager, next" />
    </template>
  </section>
</template>

<style scoped>
.entity-fields { margin-top: 24px; border-top: 1px solid var(--color-border); padding-top: 20px; }
.entity-fields__heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
p { color: var(--color-text-secondary); font-size: 13px; }
</style>
