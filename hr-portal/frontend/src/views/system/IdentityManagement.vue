<template>
  <div class="identity-management">
    <el-card v-loading="loading">
      <template #header><h2>身份管理</h2></template>
      <template v-if="control">
        <el-alert type="info" :closable="false" title="仅内置 admin 可管理。停用将清空其他角色的切换授权并使其会话失效；再次启用不恢复。admin 始终保留切换资格。" />
        <div class="table-scroll">
          <el-table :data="[control]" stripe style="width:100%" max-height="600">
            <el-table-column label="系统名称" prop="system_name" min-width="150" />
            <el-table-column label="描述" prop="description" min-width="340" />
            <el-table-column label="状态" width="120"><template #default="{ row }"><el-tag :type="row.others_enabled ? 'success' : 'info'">{{ row.others_enabled ? '已启用' : '已停用' }}</el-tag></template></el-table-column>
            <el-table-column label="操作" width="120"><template #default="{ row }"><PermissionButton menu="system.identity_management" op="U" link :type="row.others_enabled ? 'danger' : 'primary'" :disabled="saving" @click="toggleSystem">{{ row.others_enabled ? '停用' : '启用' }}</PermissionButton></template></el-table-column>
          </el-table>
        </div>
        <section class="notification-settings">
          <h3>消息测试设置 · 绩效系统</h3>
          <p>默认仅记录；开放受控投递后，每次一条独立结果汇总，样式验证另发一条样例。</p>
          <el-alert type="warning" :closable="false" title="始终禁止投递给原业务接收人和业务群。测试接收方冲突、配置缺失或发送失败时，不回退原名单。" />
          <el-form label-position="top" class="settings-form">
            <el-form-item label="允许受控测试投递"><el-switch v-model="testDelivery" :disabled="saving" /></el-form-item>
            <el-form-item label="测试接收人（必须启用且已绑定飞书）">
              <el-select v-model="receiverId" filterable remote clearable :remote-method="findReceivers" :loading="receiverLoading" placeholder="搜索专用测试接收人" style="width: min(100%, 420px)">
                <el-option v-for="person in receivers" :key="person.id" :value="person.id" :label="`${person.display_name} · ${person.login_name}`" />
              </el-select>
              <p v-if="control.test_receiver_user_id" class="hint">当前配置的用户 ID：{{ control.test_receiver_user_id }}。投递前仍会核验是否与本批原名单重合。</p>
            </el-form-item>
            <PermissionButton menu="system.identity_management" op="U" type="primary" :loading="saving" @click="saveNotifications">保存消息测试设置</PermissionButton>
          </el-form>
        </section>
      </template>
      <el-result v-else-if="!loading" icon="warning" title="无法访问身份管理" :sub-title="error || '仅内置 admin 可以访问此页面'" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PermissionButton from '@/components/PermissionButton.vue'
import { identitySwitchApi, switchRequestId, type SwitchControl } from '@/api/identitySwitch'
import { usersApi, type UserListItem } from '@/api/users'

const control = ref<SwitchControl | null>(null)
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const testDelivery = ref(false)
const receiverId = ref<number | undefined>()
const receivers = ref<UserListItem[]>([])
const receiverLoading = ref(false)

async function load() {
  loading.value = true
  try {
    control.value = await identitySwitchApi.control()
    testDelivery.value = control.value.test_delivery_enabled
    receiverId.value = control.value.test_receiver_user_id ?? undefined
  } catch (e: any) {
    error.value = e?.response?.data?.detail || '读取身份管理失败'
    control.value = null
  } finally { loading.value = false }
}
async function findReceivers(q: string) {
  receiverLoading.value = true
  try { receivers.value = (await usersApi.list({ q, is_active: true, page_size: 100 })).items.filter(person => person.feishu_user_id) }
  finally { receiverLoading.value = false }
}
async function toggleSystem() {
  if (!control.value || saving.value) return
  const disabling = control.value.others_enabled
  if (disabling) {
    try { await ElMessageBox.confirm('将清空所有角色的身份切换授权，并使非 admin 已有会话失效。再次启用需重新配置；admin 不受影响。不删除员工或其他权限，不撤销已完成操作。', '停用并清空切换授权？', { type: 'warning', confirmButtonText: '停用并清空', cancelButtonText: '取消' }) }
    catch { return }
  }
  saving.value = true
  try {
    control.value = await identitySwitchApi.updateControl({ others_enabled: !disabling, confirm_clear: disabling, expected_revision: control.value.revision, request_id: switchRequestId() })
    ElMessage.success(disabling ? '已停用并清空授权，admin 不受影响' : '已启用，请到角色配置显式授予切换使用权')
  } catch { await load() }
  finally { saving.value = false }
}
async function saveNotifications() {
  if (!control.value) return
  saving.value = true
  try {
    control.value = await identitySwitchApi.updateControl({ test_delivery_enabled: testDelivery.value, test_receiver_user_id: receiverId.value ?? null, expected_revision: control.value.revision, request_id: switchRequestId() })
    ElMessage.success('消息测试设置已保存，原业务接收方仍始终禁投')
  } catch { await load() }
  finally { saving.value = false }
}
onMounted(load)
</script>

<style scoped>
.identity-management { padding: 24px; }
h2 { margin: 0; font-size: 18px; }
h3 { margin: 0 0 8px; font-size: 16px; }
.table-scroll { overflow-x: auto; margin-top: 16px; }
.notification-settings { margin-top: 24px; border-top: 1px solid var(--color-border); padding-top: 24px; }
.notification-settings > p, .hint { color: var(--color-text-secondary); font-size: 13px; }
.settings-form { margin-top: 20px; }
.hint { width: 100%; }
</style>
