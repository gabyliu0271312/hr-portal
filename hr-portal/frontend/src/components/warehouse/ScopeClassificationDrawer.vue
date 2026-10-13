<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { approveScopeClassification, getScopeClassification, type ScopeApprovalDraft, type ScopeClassificationRecord } from '@/api/scopeGovernance'
import PermissionButton from '@/components/PermissionButton.vue'
import ScopeClassificationForm from './ScopeClassificationForm.vue'
import { useUserStore } from '@/stores/user'

const props = defineProps<{ modelValue: boolean; tableName: string }>()
const emit = defineEmits<{ 'update:modelValue': [open: boolean]; approved: [tableName: string] }>()
const userStore = useUserStore()
const canView = computed(() => userStore.menus.some(menu => menu.code === 'warehouse.governance'))
const canEdit = computed(() => canView.value && userStore.hasOp('warehouse.governance', 'U'))
const record = ref<ScopeClassificationRecord | null>(null)
const draft = ref<ScopeApprovalDraft>({ security_classification: 'controlled_fact', reason: '' })
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const conflict = ref(false)
let epoch = 0
const canSave = computed(() => canEdit.value && record.value && !loading.value && !saving.value && !conflict.value && draft.value.reason.trim().length > 0 && record.value.runtime_filter_exemption === false)

async function load() {
  const request = ++epoch
  record.value = null
  error.value = ''
  conflict.value = false
  saving.value = false
  loading.value = false
  if (!props.modelValue || !props.tableName || !canView.value) return
  loading.value = true
  try {
    const response = await getScopeClassification(props.tableName)
    if (request !== epoch) return
    record.value = response
    draft.value = { security_classification: response.security_classification, reason: response.reason || '' }
  } catch (cause) {
    if (request !== epoch) return
    const status = (cause as { response?: { status?: number } })?.response?.status
    error.value = status === 403 ? '无权限查看安全分类。' : status === 404 ? '接口或资产不存在，请核对后端版本与迁移状态。' : '读取分类失败，请重试。'
  } finally {
    if (request === epoch) loading.value = false
  }
}

async function approve() {
  if (!canSave.value || !record.value) return
  const request = epoch
  const table = props.tableName
  saving.value = true
  error.value = ''
  try {
    const response = await approveScopeClassification(table, { ...draft.value }, record.value.version)
    if (request !== epoch || !canView.value) return
    record.value = response
    emit('approved', table)
    emit('update:modelValue', false)
  } catch (cause) {
    if (request !== epoch) return
    const status = (cause as { response?: { status?: number } })?.response?.status
    conflict.value = status === 409
    error.value = status === 409 ? '版本已变更。请重新加载最新批准记录、核对内容后再提交；系统不会自动覆盖。' : status === 403 ? '无权限批准分类。' : status === 422 ? '分类或批准原因不符合要求，请检查后重新提交。' : '批准失败，未更新本地记录，请重试。'
  } finally {
    if (request === epoch) saving.value = false
  }
}

watch([() => props.modelValue, () => props.tableName, canView], load, { immediate: true })
onBeforeUnmount(() => { epoch++ })
</script>

<template>
  <el-drawer :model-value="modelValue" :title="`安全分类 · ${tableName}`" size="min(560px, 100vw)" @update:model-value="emit('update:modelValue', $event)">
    <div v-loading="loading" :aria-busy="loading || saving">
      <el-alert title="分类仅登记治理判断，不豁免当前范围过滤，也不替代字段或数据集授权。" type="info" :closable="false" />
      <p v-if="!canView" role="alert">无权限查看治理元数据。</p>
      <el-alert v-else-if="error" :title="error" :type="conflict ? 'warning' : 'error'" :closable="false" class="scope-feedback" />
      <p v-if="loading" role="status">正在读取批准记录…</p>
      <ScopeClassificationForm v-if="record && canView" v-model="draft" :record="record" :readonly="!canEdit" :busy="saving || loading || conflict" class="scope-feedback" />
    </div>
    <template #footer>
      <div class="scope-footer">
        <PermissionButton menu="warehouse.governance" op="V" :disabled="loading || saving" @click="load">重新加载</PermissionButton>
        <PermissionButton menu="warehouse.governance" op="V" :disabled="saving" @click="emit('update:modelValue', false)">关闭</PermissionButton>
        <PermissionButton menu="warehouse.governance" op="U" type="primary" :disabled="!canSave" :loading="saving" @click="approve">保存批准记录</PermissionButton>
      </div>
    </template>
  </el-drawer>
</template>

<style scoped>
.scope-feedback { margin-top: var(--spacing-md, 16px); }
.scope-footer { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.scope-footer :deep(.el-button + .el-button) { margin-left: 0; }
</style>
