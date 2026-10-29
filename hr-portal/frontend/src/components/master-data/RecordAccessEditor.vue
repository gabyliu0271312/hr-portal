<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import PermissionButton from '@/components/PermissionButton.vue'
import { masterDataApi, type EntityDefinition } from '@/api/masterData'
import { useUserStore } from '@/stores/user'

const props = defineProps<{ userId: number; enabled: boolean }>()
const store = useUserStore()
const canEdit = computed(() => props.enabled && store.menus.some(m => m.code === 'system.master_entities') && store.hasOp('system.users', 'U'))
const entities = ref<EntityDefinition[]>([])
const selectedId = ref<number | null>(null)
const allowed = ref<boolean | null>(null)
const loading = ref(false)
const saving = ref(false)
const error = ref('')
let context = 0
let request = 0
function message(cause: any) {
  let detail = cause?.response?.data?.detail
  if (typeof detail === 'string') { try { detail = JSON.parse(detail) } catch { return detail } }
  return detail?.message || '记录授权操作失败，请核对权限后重试。'
}
async function load() {
  const current = ++context; ++request
  entities.value = []; selectedId.value = null; allowed.value = null; error.value = ''; loading.value = false; saving.value = false
  if (!canEdit.value) return
  loading.value = true
  try {
    let offset = 0, total = 0
    do {
      const list = await masterDataApi.list({ offset, limit: 100 })
      if (current !== context) return
      entities.value.push(...list.items); total = list.total; offset += list.items.length
      if (!list.items.length) break
    } while (offset < total)
    selectedId.value = entities.value[0]?.id ?? null
  } catch (cause) { if (current === context) { entities.value = []; error.value = message(cause) } }
  finally { if (current === context) loading.value = false }
}
async function loadAccess() {
  const entityId = selectedId.value
  const current = ++request
  allowed.value = null; error.value = ''
  if (!canEdit.value || entityId === null) return
  loading.value = true
  try {
    const access = await masterDataApi.recordAccess(entityId)
    if (current === request) allowed.value = access.user_ids.includes(props.userId)
  } catch (cause) { if (current === request) error.value = message(cause) }
  finally { if (current === request) loading.value = false }
}
async function toggle() {
  if (!canEdit.value || selectedId.value === null || allowed.value === null || loading.value || saving.value) return
  const current = context, entityId = selectedId.value, userId = props.userId, next = !allowed.value
  saving.value = true; error.value = ''
  try {
    await masterDataApi.setUserRecordAccess(entityId, userId, next)
    if (current === context) allowed.value = next
  } catch (cause) { if (current === context) { allowed.value = null; error.value = message(cause) } }
  finally { if (current === context) saving.value = false }
}
watch(() => [canEdit.value, props.userId, store.user?.id, JSON.stringify(store.menus)], load, { immediate: true, flush: 'sync' })
watch(selectedId, loadAccess)
onBeforeUnmount(() => { ++context; ++request })
</script>

<template>
  <section v-if="canEdit" class="record-access">
    <strong>业务记录访问</strong>
    <p>与用户信息分开保存，仅变更当前用户的直接授权，不覆盖其他用户或角色。角色授权不在此撤销；记录仍受人员范围与字段权限保护。</p>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <PermissionButton v-if="error" menu="system.users" op="U" @click="load">重新加载授权</PermissionButton>
    <el-form label-position="top"><el-form-item label="配置者拥有的实体"><el-select v-model="selectedId" :disabled="saving || loading" placeholder="选择实体" style="width: 100%"><el-option v-for="entity in entities" :key="entity.id" :label="`${entity.name}（${entity.entity_code}）`" :value="entity.id" /></el-select></el-form-item></el-form>
    <p v-if="!loading && !entities.length && !error">暂无当前配置者拥有的实体定义。</p>
    <div v-if="allowed !== null" class="record-access__state"><span>{{ allowed ? '已直接授权该实体记录访问' : '未直接授权（可能从角色继承）' }}</span><PermissionButton menu="system.users" op="U" size="small" :disabled="loading || saving" :loading="saving" @click="toggle">{{ allowed ? '撤销直接授权' : '授予直接授权' }}</PermissionButton></div>
  </section>
</template>

<style scoped>
.record-access { margin-top: 20px; border-top: 1px solid var(--color-border); padding-top: 16px; }
p { color: var(--color-text-secondary); font-size: 12px; line-height: 1.6; margin: 8px 0 12px; }
.record-access__state { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: 13px; }
</style>
