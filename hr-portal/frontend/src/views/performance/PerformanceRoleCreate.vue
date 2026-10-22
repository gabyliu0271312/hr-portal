<template>
  <div class="role-create-workspace">
    <PageHeader :title="isEdit ? '编辑角色' : '新建角色'" @back="goBack">
      <template #actions>
        <PermissionButton
          menu="performance.admin"
          :op="isEdit ? 'U' : 'C'"
          type="primary"
          aria-label="保存角色"
          :disabled="saving || loading"
          @click="save"
        >
          保存
        </PermissionButton>
      </template>
    </PageHeader>

    <main class="role-create-content">
      <section class="role-form-card" aria-labelledby="role-create-title">
        <div class="role-form-item" :class="{ 'is-invalid': nameError }">
          <div class="role-form-label">
            <span>角色名称</span><span v-if="!isEdit" class="required-mark">*</span>
          </div>
          <div class="role-form-control">
            <div class="role-control-line">
              <PerformanceTextField
                v-model="roleName"
                variant="feishu-input"
                input-id="performance-role-name"
                :invalid="Boolean(nameError)"
                aria-label="角色名称"
                :disabled="isSystemRole"
                width="100%"
              >
                <template #suffix><span class="language-tag">中文</span></template>
              </PerformanceTextField>
              <PerformanceTextButton v-if="!isSystemRole" aria-label="添加角色名称语言" @click="notifyLanguageUnavailable">
                <template #icon><AddOutlinedIcon /></template>
              </PerformanceTextButton>
            </div>
            <span v-if="nameError" class="field-error" role="alert">{{ nameError }}</span>
          </div>
        </div>

        <div class="role-form-item">
          <div class="role-form-label"><span>描述</span></div>
          <div class="role-form-control">
            <div class="role-control-line role-description-line">
              <div class="role-textarea-wrap">
                <PerformanceTextField
                  v-model="description"
                  type="textarea"
                  :maxlength="2000"
                  show-count
                  input-id="performance-role-description"
                  aria-label="角色描述"
                  width="100%"
                />
                <span class="language-tag role-description-language">中文</span>
              </div>
              <PerformanceTextButton aria-label="添加角色描述语言" @click="notifyLanguageUnavailable">
                <template #icon><AddOutlinedIcon /></template>
              </PerformanceTextButton>
            </div>
          </div>
        </div>
      </section>

      <PerformanceFunctionPermissionTree v-model="functionPermissionKeys" :disabled-keys="disabledPermissionKeys" />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { performanceRoleApi, type PerformanceRoleListItem } from '@/api/performance'
import AddOutlinedIcon from '@/components/performance/AddOutlinedIcon.vue'
import PageHeader from '@/components/performance/PageHeader.vue'
import PerformanceFunctionPermissionTree from '@/components/performance/PerformanceFunctionPermissionTree.vue'
import PerformanceTextButton from '@/components/performance/PerformanceTextButton.vue'
import PerformanceTextField from '@/components/performance/PerformanceTextField.vue'
import PermissionButton from '@/components/PermissionButton.vue'

const router = useRouter()
const route = useRoute()
const roleId = computed(() => Number(route.params.roleId))
const isEdit = computed(() => Number.isInteger(roleId.value) && roleId.value > 0)
const roleName = ref('')
const description = ref('')
const functionPermissionKeys = ref<string[]>([])
const disabledPermissionKeys = ref<string[]>([])
const isSystemRole = ref(false)
const nameError = ref('')
const saving = ref(false)
const loading = ref(false)

const BACKEND_KEYS = [
  'performance.backend.cycles-projects',
  'performance.backend.people-groups.cycle',
  'performance.backend.people-groups.project',
  'performance.backend.metrics',
  'performance.backend.metric-templates',
  'performance.backend.templates',
  'performance.backend.evaluation-questions',
  'performance.backend.permissions',
  'performance.backend.subject-visibility',
  'performance.backend.system',
]
const FRONTEND_KEYS = [
  'performance.frontend.progress',
  'performance.frontend.result-open',
  'performance.frontend.data-view',
  'performance.frontend.export-members',
  'performance.frontend.export-details',
  'performance.frontend.manage-evaluatees',
  'performance.frontend.manage-reviewers-360',
]
const ALL_KEYS = [...BACKEND_KEYS, ...FRONTEND_KEYS]
const reviewer360Key = 'performance.frontend.manage-reviewers-360'

function rolePermissionPolicy(role: PerformanceRoleListItem) {
  if (!role.is_system) return { selected: role.function_permission_keys || [], disabled: [] }
  if (role.code === 'performance.hrbp') return { selected: FRONTEND_KEYS.filter(key => key !== reviewer360Key), disabled: BACKEND_KEYS }
  if (role.code === 'performance.project_admin') return {
    selected: ['performance.backend.cycles-projects', ...FRONTEND_KEYS.filter(key => key !== reviewer360Key)],
    disabled: BACKEND_KEYS.filter(key => key !== 'performance.backend.people-groups.project'),
  }
  return { selected: role.code === 'performance.admin' ? ALL_KEYS : (role.function_permission_keys || []), disabled: ALL_KEYS }
}

async function loadRole() {
  if (!isEdit.value) return
  loading.value = true
  try {
    const role = await performanceRoleApi.get(roleId.value)
    roleName.value = role.name
    description.value = role.description || ''
    isSystemRole.value = role.is_system
    const policy = rolePermissionPolicy(role)
    functionPermissionKeys.value = policy.selected
    disabledPermissionKeys.value = policy.disabled
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.detail || '角色加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => { void loadRole() })

function goBack() {
  void router.push({ name: 'PerformancePermissionRoles' })
}

function notifyLanguageUnavailable() {
  ElMessage.info('多语言配置将在后续任务接入')
}

async function save() {
  const name = roleName.value.trim()
  if (!name) {
    nameError.value = '角色名称不能为空'
    return
  }

  nameError.value = ''
  saving.value = true
  try {
    const payload = {
      name,
      description: description.value.trim() || null,
      function_permission_keys: functionPermissionKeys.value,
    }
    if (isEdit.value) {
      await performanceRoleApi.update(roleId.value, payload)
      ElMessage.success('角色更新成功')
    } else {
      await performanceRoleApi.create(payload)
      ElMessage.success('角色创建成功')
    }
    await router.push({ name: 'PerformancePermissionRoles' })
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.detail || (isEdit.value ? '角色更新失败' : '角色创建失败'))
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.role-create-workspace { position: fixed; z-index: 100; inset: 0; display: flex; min-width: 0; flex-direction: column; overflow: auto; background: #f5f6f7; color: #1f2329; font-family: var(--font-sans); }
.role-create-workspace :deep(.full-screen-modal-header) { position: sticky; flex: 0 0 var(--layout-topbar-height); }
.role-create-content { display: flex; min-height: 0; align-items: center; justify-content: flex-start; padding: 32px 24px; flex-direction: column; flex: 1 1 auto; }
.role-form-card { box-sizing: border-box; width: min(100%, 800px); margin-bottom: 16px; padding: 20px; border: 1px solid transparent; border-radius: 8px; background: #fff; box-shadow: rgba(31, 35, 41, .02) 0 1px 2px -2px, rgba(31, 35, 41, .02) 0 2px 4px, rgba(31, 35, 41, .02) 0 2px 8px 2px; }
.role-form-item { display: flex; min-width: 0; flex-direction: column; gap: 8px; margin-bottom: 20px; color: #1f2329; font-size: 14px; line-height: 22px; }
.role-form-item:last-child { margin-bottom: 0; }
.role-form-label { display: flex; align-items: baseline; min-height: 22px; font-weight: 600; }
.required-mark { margin-left: 2px; color: #f54a45; font-family: SimSun, sans-serif; font-weight: 400; }
.role-form-control { display: flex; min-width: 0; flex-direction: column; }
.role-control-line { display: flex; min-width: 0; align-items: center; gap: 4px; }
.role-control-line :deep(.performance-text-field) { flex: 1 1 auto; }
.role-description-line { align-items: flex-start; }
.role-textarea-wrap { position: relative; min-width: 0; flex: 1 1 auto; }
.role-textarea-wrap :deep(.performance-text-field) { width: 100%; }
.role-textarea-wrap :deep(.native-textarea) { height: 116px; min-height: 116px; }
.language-tag { display: inline-flex; align-items: center; min-height: 22px; padding: 0 6px; box-sizing: border-box; border-radius: 4px; background: rgba(31, 35, 41, .1); color: #646a73; font-size: 12px; font-weight: 400; line-height: 20px; white-space: nowrap; }
.role-description-language { position: absolute; right: 54px; bottom: 8px; background: #eff0f1; pointer-events: none; }
.field-error { margin-top: 2px; color: #f54a45; font-size: 14px; line-height: 22px; }
@media (max-width: 640px) { .role-create-content { padding: 16px; }.role-form-card { padding: 20px 16px 28px; } }
</style>
