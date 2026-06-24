<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Plus, Delete } from '@element-plus/icons-vue'
import { rolesApi, type RoleListItem } from '@/api/roles'
import { usersApi, type UserListItem } from '@/api/users'

export interface AclRow {
  id?: number
  role_id: number | null
  user_id: number | null
}

export interface AclRoleOption {
  id: number
  name: string
}

export interface AclUserOption {
  id: number
  login_name: string
  display_name: string
}

export interface AclOptions {
  roles: AclRoleOption[]
  users: AclUserOption[]
}

const props = defineProps<{
  modelValue: AclRow[]
  ownerName?: string | null
  loadOptions?: () => Promise<AclOptions>
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: AclRow[]): void }>()

const roles = ref<AclRoleOption[]>([])
const users = ref<AclUserOption[]>([])

const rows = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

function addRole() {
  rows.value = [...rows.value, { role_id: null, user_id: null }]
}
function addUser() {
  rows.value = [...rows.value, { role_id: null, user_id: null }]
}
function remove(i: number) {
  const next = [...rows.value]
  next.splice(i, 1)
  rows.value = next
}
function setRole(i: number, val: number | null) {
  const next = [...rows.value]
  next[i] = { ...next[i], role_id: val, user_id: null }
  rows.value = next
}
function setUser(i: number, val: number | null) {
  const next = [...rows.value]
  next[i] = { ...next[i], user_id: val, role_id: null }
  rows.value = next
}

onMounted(async () => {
  try {
    if (props.loadOptions) {
      const options = await props.loadOptions()
      roles.value = options.roles || []
      users.value = options.users || []
      return
    }
    const [r, u] = await Promise.all([
      rolesApi.list(),
      usersApi.list({ page_size: 100 } as any),
    ])
    roles.value = (r.items || []).map((item: RoleListItem) => ({ id: item.id, name: item.name }))
    users.value = ((u as any).items || []).map((item: UserListItem) => ({
      id: item.id,
      login_name: item.login_name,
      display_name: item.display_name,
    }))
  } catch {
    /* 列表加载失败不阻塞 */
  }
})
</script>

<template>
  <div>
    <el-alert
      type="info"
      :closable="false"
      show-icon
      style="margin-bottom: 12px"
    >
      <p style="margin: 0; line-height: 1.6; font-size: 13px">
        未添加任何授权时，仅创建者{{ ownerName ? `（${ownerName}）` : '' }}与超级管理员可访问。
        添加角色/用户后，命中者可访问；行级数据仍受其数据范围限制。
      </p>
    </el-alert>

    <div v-for="(row, i) in rows" :key="i" class="acl-row">
      <el-select
        :model-value="row.role_id ?? undefined"
        placeholder="选择角色"
        clearable
        filterable
        style="width: 220px"
        @change="(v: number | null) => setRole(i, v ?? null)"
      >
        <el-option v-for="r in roles" :key="r.id" :label="r.name" :value="r.id" />
      </el-select>
      <span class="acl-or">或</span>
      <el-select
        :model-value="row.user_id ?? undefined"
        placeholder="指定用户"
        clearable
        filterable
        style="width: 220px"
        @change="(v: number | null) => setUser(i, v ?? null)"
      >
        <el-option
          v-for="u in users"
          :key="u.id"
          :label="`${u.display_name}（${u.login_name}）`"
          :value="u.id"
        />
      </el-select>
      <el-button link type="danger" @click="remove(i)">
        <el-icon><Delete /></el-icon>
      </el-button>
    </div>

    <el-button size="small" @click="addRole">
      <el-icon style="margin-right: 4px"><Plus /></el-icon>添加授权
    </el-button>
  </div>
</template>

<style scoped>
.acl-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.acl-or {
  color: var(--color-text-placeholder);
  font-size: 12px;
}
</style>
