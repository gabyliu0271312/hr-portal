<template>
  <PerformanceDialogShell
    :model-value="modelValue"
    :title="mode === 'rules' ? '添加规则' : authorization ? '编辑授权' : '添加授权'"
    width="var(--performance-dialog-wide-width)"
    :loading="saving"
    dialog-class="performance-authorization-dialog"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="authorization-dialog-content">
      <p class="authorization-dialog-intro">{{ mode === 'users' ? '为指定用户配置绩效管理角色' : '按用户范围配置绩效管理角色' }}</p>
      <p v-if="error" class="authorization-dialog-error" role="alert">{{ error }} <UiButton v-if="loadFailed" variant="text" @click="loadOptions">重试</UiButton></p>
      <PerformanceFormItem :label="mode === 'users' ? '选择用户' : '用户范围'" required>
        <PerformanceSearchSelect v-model="userId" :options="users" :aria-label="mode === 'users' ? '选择用户' : '用户范围'" placeholder="请选择用户" :disabled="mode === 'rules' || loading || saving || Boolean(authorization)" />
      </PerformanceFormItem>
      <PerformanceFormItem label="授权角色" required>
        <PerformanceSearchSelect v-model="roleIds" :options="roles" aria-label="授权角色" placeholder="请选择授权角色" multiple :disabled="mode === 'rules' || loading || saving" />
        <span class="authorization-dialog-hint">{{ mode === 'rules' ? '按规则授权尚未接入' : '仅显示已启用的自定义管理角色；不会授予应用入口或系统管理员权限' }}</span>
      </PerformanceFormItem>
    </div>
    <template #footer>
      <div class="authorization-dialog-actions">
        <UiButton variant="secondary" :disabled="saving" @click="emit('update:modelValue', false)">取消</UiButton>
        <UiButton variant="primary" :disabled="mode === 'rules' || loading || saving || loadFailed" @click="save">{{ saving ? '保存中' : '保存' }}</UiButton>
      </div>
    </template>
  </PerformanceDialogShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { performanceUserAuthorizationApi, type PerformanceUserAuthorization, type PerformanceUserAuthorizationOptions } from '@/api/performance'
import UiButton from '../ui/UiButton.vue'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformanceFormItem from './PerformanceFormItem.vue'
import PerformanceSearchSelect from './PerformanceSearchSelect.vue'

const props = defineProps<{ modelValue: boolean; mode: 'users' | 'rules'; authorization?: PerformanceUserAuthorization | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; saved: [] }>()
const userId = ref<string | string[] | null>(null)
const roleIds = ref<string | string[] | null>([])
const options = ref<PerformanceUserAuthorizationOptions>({ users: [], roles: [] })
const loading = ref(false)
const saving = ref(false)
const loadFailed = ref(false)
const error = ref('')
let sequence = 0
const users = computed(() => options.value.users)
const roles = computed(() => {
  const available = options.value.roles.map(role => ({ value: String(role.id), label: role.name }))
  for (const role of props.authorization?.roles || []) {
    if (!available.some(option => option.value === String(role.id))) available.push({ value: String(role.id), label: `${role.name}（已停用或不可用，请移除）` })
  }
  return available
})

async function loadOptions() {
  const current = ++sequence
  loading.value = true
  loadFailed.value = false
  error.value = ''
  try {
    const result = await performanceUserAuthorizationApi.options()
    if (current === sequence && props.modelValue) options.value = result
  } catch (e: any) {
    if (current === sequence) { error.value = e?.response?.data?.detail || e?.message || '授权选项加载失败'; loadFailed.value = true }
  } finally {
    if (current === sequence) loading.value = false
  }
}

watch(() => [props.modelValue, props.mode, props.authorization] as const, () => {
  ++sequence
  error.value = ''
  options.value = { users: [], roles: [] }
  userId.value = props.authorization ? String(props.authorization.user_id) : null
  roleIds.value = props.authorization ? props.authorization.role_ids.map(String) : []
  if (props.modelValue && props.mode === 'users') void loadOptions()
}, { immediate: true })

async function save() {
  if (saving.value || loading.value || loadFailed.value || props.mode !== 'users') return
  if (typeof userId.value !== 'string' || !Array.isArray(roleIds.value) || !roleIds.value.length) {
    error.value = '请选择用户和至少一个授权角色'
    return
  }
  if (roleIds.value.some(id => !options.value.roles.some(role => String(role.id) === id))) {
    error.value = '请移除已停用或不可用的角色'
    return
  }
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
</script>

<style scoped>
.authorization-dialog-content { min-width: 0; }
.authorization-dialog-intro { margin: 0 0 var(--spacing-6); color: var(--color-text-secondary); font-size: var(--font-size-md); line-height: var(--performance-input-line-height); }
.authorization-dialog-hint { display: block; margin-top: var(--performance-field-error-gap); color: var(--performance-field-help-color); font-size: var(--font-size-sm); line-height: var(--performance-field-error-line-height); }
.authorization-dialog-error { color: var(--color-danger); }
.authorization-dialog-actions { display: flex; justify-content: flex-end; gap: var(--performance-dialog-footer-gap); }
</style>
