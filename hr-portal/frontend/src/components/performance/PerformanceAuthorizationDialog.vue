<template>
  <PerformanceAuthRuleDialog v-if="mode === 'rules'" :model-value="modelValue" :rule="rule" @update:model-value="emit('update:modelValue', $event)" @saved="emit('saved')" />
  <PerformanceDialogShell v-else :model-value="modelValue" :title="authorization ? '编辑授权' : '添加授权'" width="var(--performance-dialog-wide-width)" :loading="saving" dialog-class="performance-authorization-dialog" @update:model-value="close">
    <p class="authorization-intro">为指定用户配置绩效管理角色</p>
    <p v-if="error" class="authorization-error" role="alert">{{ error }} <UiButton v-if="loadFailed" variant="text" @click="loadOptions">重试</UiButton></p>
    <PerformanceFormItem label="选择用户" required>
      <PerformanceSearchSelect v-model="userId" :options="options.users" aria-label="选择用户" placeholder="请选择用户" :disabled="loading || saving || Boolean(authorization)" />
    </PerformanceFormItem>
    <PerformanceFormItem label="授权角色" required>
      <PerformanceSearchSelect v-model="roleIds" :options="roles" aria-label="授权角色" placeholder="请选择授权角色" multiple :disabled="loading || saving" />
      <span class="authorization-hint">仅显示已启用的自定义管理角色；不会授予应用入口或系统管理员权限</span>
    </PerformanceFormItem>
    <template #footer><div class="authorization-actions">
      <UiButton variant="secondary" :disabled="saving" @click="close(false)">取消</UiButton>
      <UiButton variant="primary" :disabled="loading || saving || loadFailed" @click="save">{{ saving ? '保存中' : '保存' }}</UiButton>
    </div></template>
  </PerformanceDialogShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { performanceUserAuthorizationApi, type PerformanceAuthRule, type PerformanceUserAuthorization, type PerformanceUserAuthorizationOptions } from '@/api/performance'
import PerformanceAuthRuleDialog from './PerformanceAuthRuleDialog.vue'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformanceFormItem from './PerformanceFormItem.vue'
import PerformanceSearchSelect from './PerformanceSearchSelect.vue'
import UiButton from '../ui/UiButton.vue'

const props = defineProps<{ modelValue: boolean; mode: 'users' | 'rules'; authorization?: PerformanceUserAuthorization | null; rule?: PerformanceAuthRule | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; saved: [] }>()
const userId = ref<string | string[] | null>(null)
const roleIds = ref<string | string[] | null>([])
const options = ref<PerformanceUserAuthorizationOptions>({ users: [], roles: [] })
const loading = ref(false)
const saving = ref(false)
const loadFailed = ref(false)
const error = ref('')
let version = 0
const roles = computed(() => {
  const available = options.value.roles.map(role => ({ value: String(role.id), label: role.name }))
  for (const role of props.authorization?.roles || []) {
    if (!available.some(option => option.value === String(role.id))) available.push({ value: String(role.id), label: `${role.name}（已停用或不可用，请移除）` })
  }
  return available
})
async function loadOptions() {
  const current = ++version
  loading.value = true
  loadFailed.value = false
  error.value = ''
  try {
    const result = await performanceUserAuthorizationApi.options()
    if (current === version && props.modelValue) options.value = result
  } catch (e: any) {
    if (current === version) { error.value = e?.response?.data?.detail || e?.message || '授权选项加载失败'; loadFailed.value = true }
  } finally {
    if (current === version) loading.value = false
  }
}
async function save() {
  if (saving.value || loading.value || loadFailed.value) return
  if (typeof userId.value !== 'string' || !Array.isArray(roleIds.value) || !roleIds.value.length) { error.value = '请选择用户和至少一个授权角色'; return }
  if (roleIds.value.some(id => !options.value.roles.some(role => String(role.id) === id))) { error.value = '请移除已停用或不可用的角色'; return }
  saving.value = true
  error.value = ''
  try {
    await performanceUserAuthorizationApi.save(Number(userId.value), roleIds.value.map(Number), Boolean(props.authorization))
    emit('saved')
    emit('update:modelValue', false)
  } catch (e: any) {
    error.value = e?.response?.data?.detail || e?.message || '授权保存失败'
  } finally {
    saving.value = false
  }
}
function close(value: boolean) { if (!saving.value) emit('update:modelValue', value) }
watch(() => [props.modelValue, props.mode, props.authorization] as const, () => {
  ++version
  error.value = ''
  options.value = { users: [], roles: [] }
  userId.value = props.authorization ? String(props.authorization.user_id) : null
  roleIds.value = props.authorization ? props.authorization.role_ids.map(String) : []
  if (props.modelValue && props.mode === 'users') void loadOptions()
}, { immediate: true })
onBeforeUnmount(() => { ++version })
</script>

<style scoped>
.authorization-intro { margin: 0 0 var(--spacing-6); color: var(--color-text-secondary); font-size: var(--font-size-md); line-height: var(--performance-input-line-height); }
.authorization-error { color: var(--performance-field-error-color); }
.authorization-hint { display: block; margin-top: var(--performance-field-error-gap); color: var(--performance-field-help-color); font-size: var(--font-size-sm); line-height: var(--performance-field-error-line-height); }
.authorization-actions { display: flex; justify-content: flex-end; gap: var(--performance-dialog-footer-gap); }
</style>
