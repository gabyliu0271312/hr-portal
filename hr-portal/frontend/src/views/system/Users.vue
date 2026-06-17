<template>
  <div style="padding: 24px">
    <el-card>
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <span style="font-size: 16px; font-weight: 600">用户管理（共 {{ total }} 人）</span>
          <PermissionButton menu="system.users" op="C" type="primary" @click="openCreate">
            <el-icon style="margin-right: 4px"><Plus /></el-icon>新建用户
          </PermissionButton>
        </div>
      </template>

      <!-- 搜索栏 -->
      <el-form inline style="margin-bottom: 16px">
        <el-form-item>
          <el-input
            v-model="query.q"
            placeholder="登录名/姓名/邮箱"
            clearable
            style="width: 220px"
            @change="onSearch"
            @keyup.enter="onSearch"
          />
        </el-form-item>
        <el-form-item>
          <el-select v-model="query.role_id" placeholder="角色" clearable style="width: 160px" @change="onSearch">
            <el-option v-for="r in roles" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-select v-model="query.is_active" placeholder="状态" clearable style="width: 100px" @change="onSearch">
            <el-option label="启用" value="true" />
            <el-option label="禁用" value="false" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button @click="onSearch">查询</el-button>
          <el-button link @click="resetFilter">重置</el-button>
        </el-form-item>
      </el-form>

      <!-- 表格 -->
      <div style="overflow-x: auto">
        <el-table
          v-loading="loading"
          :data="list"
          stripe
          style="width: 100%"
          max-height="600"
        >
          <el-table-column prop="login_name" label="登录名" min-width="120" />
          <el-table-column prop="display_name" label="姓名" min-width="100" />
          <el-table-column prop="email" label="邮箱" min-width="180">
            <template #default="{ row }">{{ row.email || '—' }}</template>
          </el-table-column>
          <el-table-column label="角色" min-width="160">
            <template #default="{ row }">
              <el-tag v-for="rn in row.role_names" :key="rn" size="small" style="margin-right: 4px">
                {{ rn }}
              </el-tag>
              <span v-if="!row.role_names.length" style="color: var(--color-text-placeholder); font-size: 12px">未分配</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag v-if="!row.is_active" type="danger" size="small">已禁用</el-tag>
              <el-tag v-else-if="lockedHint(row)" type="warning" size="small" :title="lockedHint(row)">锁定中</el-tag>
              <el-tag v-else type="success" size="small">在用</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="上次登录" min-width="150">
            <template #default="{ row }">
              {{ row.last_login_at ? formatDateTime(row.last_login_at) : '—' }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="360" fixed="right">
            <template #default="{ row }">
              <PermissionButton menu="system.users" op="U" size="small" @click="openEdit(row.id)">
                编辑
              </PermissionButton>
              <PermissionButton menu="system.users" op="U" size="small" @click="openTags(row)">
                标签
              </PermissionButton>
              <PermissionButton menu="system.users" op="U" size="small" type="info" @click="onResetPassword(row)">
                重置密码
              </PermissionButton>
              <PermissionButton
                menu="system.users"
                op="U"
                size="small"
                :type="row.is_active ? 'warning' : 'success'"
                @click="onToggleActive(row)"
              >
                {{ row.is_active ? '禁用' : '启用' }}
              </PermissionButton>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <el-pagination
        style="margin-top: 16px; justify-content: flex-end"
        v-model:current-page="query.page"
        v-model:page-size="query.page_size"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        @current-change="load"
        @size-change="load"
      />
    </el-card>

    <!-- 新建/编辑抽屉 -->
    <el-drawer
      v-model="drawerOpen"
      :title="drawerMode === 'create' ? '新建用户' : `编辑用户 · ${editing?.display_name}`"
      direction="rtl"
      size="480px"
    >
      <el-form label-position="top">
        <el-form-item label="登录名" required>
          <el-input
            v-model="form.login_name"
            :disabled="drawerMode === 'edit'"
            placeholder="3-64 位，字母/数字/. _ -"
          />
        </el-form-item>
        <el-form-item label="姓名" required>
          <el-input v-model="form.display_name" placeholder="显示在系统中的名字" />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input v-model="form.email" placeholder="可选" />
        </el-form-item>
        <el-form-item v-if="drawerMode === 'create'" label="初始密码" required>
          <el-input
            v-model="form.password"
            type="password"
            show-password
            placeholder="≥ 8 位 + 含字母 + 含数字"
          />
        </el-form-item>
        <el-form-item label="角色">
          <el-checkbox-group v-model="form.role_ids" style="display: flex; flex-direction: column; gap: 8px">
            <el-checkbox v-for="r in roles" :key="r.id" :value="r.id" :disabled="!r.is_active">
              {{ r.name }}
              <span v-if="!r.is_active" style="color: var(--color-text-placeholder); font-size: 12px">（已停用）</span>
            </el-checkbox>
          </el-checkbox-group>
        </el-form-item>
      </el-form>

      <template #footer>
        <div style="text-align: right">
          <el-button @click="drawerOpen = false">取消</el-button>
          <el-button type="primary" :loading="saving" @click="onSave">
            {{ drawerMode === 'create' ? '创建' : '保存' }}
          </el-button>
        </div>
      </template>
    </el-drawer>

    <!-- 标签分配抽屉 -->
    <el-drawer
      v-model="tagsDrawerOpen"
      :title="`标签分配 · ${tagsTarget?.display_name || ''}`"
      direction="rtl"
      size="500px"
    >
      <div v-if="tagsTarget">
        <el-alert type="info" :closable="false" show-icon style="margin-bottom: 16px">
          为该用户分配数据范围标签。单标签内组织 AND 人员，多标签之间取并集；标签编辑请去
          <strong>系统设置 → 权限管理 → 管理单元</strong>。
        </el-alert>
        <div v-for="grp in groupedTags" :key="grp.label" style="margin-bottom: 16px">
          <div class="tag-group-title">{{ grp.label }}</div>
          <el-checkbox-group v-model="selectedTagIds">
            <el-checkbox
              v-for="t in grp.items"
              :key="t.id"
              :value="t.id"
              style="display: flex; align-items: center; padding: 4px 0"
            >
              {{ t.name }}
              <span style="color: var(--color-text-placeholder); font-size: 12px; margin-left: 6px">
                {{ tagSummary(t) }}
              </span>
            </el-checkbox>
          </el-checkbox-group>
          <div v-if="!grp.items.length" style="color: var(--color-text-placeholder); font-size: 12px">无标签</div>
        </div>

        <!-- ===== 额外可见字段分类（叠加在角色之上）===== -->
        <el-divider />
        <div class="tag-group-title">
          额外可见字段分类（叠加在角色默认之上）
        </div>
        <div style="color: var(--color-text-placeholder); font-size: 12px; margin-bottom: 8px">
          仅勾选给该用户额外授权的敏感分类。该用户最终可见 = 角色默认可见 ∪ 此处勾选。
        </div>
        <el-checkbox-group v-if="allCategories.length" v-model="selectedCategoryIds">
          <el-checkbox
            v-for="c in allCategories"
            :key="c.id"
            :value="c.id"
            style="margin-right: 16px; margin-bottom: 8px"
          >
            {{ c.name }}
            <el-tag v-if="c.is_sensitive" size="small" type="danger" effect="plain" style="margin-left: 4px">
              敏感
            </el-tag>
          </el-checkbox>
        </el-checkbox-group>
        <div v-else style="color: var(--color-text-placeholder); font-size: 12px">
          暂无字段分类
        </div>
      </div>

      <template #footer>
        <div style="text-align: right">
          <el-button @click="tagsDrawerOpen = false">取消</el-button>
          <el-button type="primary" :loading="tagsSaving" @click="saveTags">保存</el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import PermissionButton from '@/components/PermissionButton.vue'
import { usersApi, type UserDetail, type UserListItem } from '@/api/users'
import { scopesApi, type ScopeTagItem } from '@/api/scopes'
import { fieldCategoriesApi, type FieldCategory } from '@/api/field_categories'
import { formatDateTime } from '@/utils/datetime'
import { rolesApi, type RoleListItem } from '@/api/roles'

interface Query {
  q: string
  is_active: '' | 'true' | 'false'
  role_id: number | ''
  page: number
  page_size: number
}

const query = reactive<Query>({
  q: '',
  is_active: '',
  role_id: '',
  page: 1,
  page_size: 20,
})

const loading = ref(false)
const list = ref<UserListItem[]>([])
const total = ref(0)
const roles = ref<RoleListItem[]>([])

async function loadRoles() {
  try {
    const resp = await rolesApi.list()
    roles.value = resp.items
  } catch {
    /* 角色列表载入失败不阻塞 */
  }
}

async function load() {
  loading.value = true
  try {
    const params: Record<string, unknown> = {
      page: query.page,
      page_size: query.page_size,
    }
    if (query.q) params.q = query.q
    if (query.is_active !== '') params.is_active = query.is_active === 'true'
    if (query.role_id !== '') params.role_id = query.role_id
    const resp = await usersApi.list(params)
    list.value = resp.items
    total.value = resp.total
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '加载失败')
  } finally {
    loading.value = false
  }
}

function onSearch() {
  query.page = 1
  load()
}
function resetFilter() {
  query.q = ''
  query.is_active = ''
  query.role_id = ''
  onSearch()
}

const drawerOpen = ref(false)
const drawerMode = ref<'create' | 'edit'>('create')
const editing = ref<UserDetail | null>(null)
const form = reactive({
  login_name: '',
  display_name: '',
  email: '',
  password: '',
  role_ids: [] as number[],
})
const saving = ref(false)

function openCreate() {
  drawerMode.value = 'create'
  editing.value = null
  Object.assign(form, {
    login_name: '',
    display_name: '',
    email: '',
    password: '',
    role_ids: [],
  })
  drawerOpen.value = true
}

async function openEdit(id: number) {
  drawerMode.value = 'edit'
  try {
    const detail = await usersApi.get(id)
    editing.value = detail
    Object.assign(form, {
      login_name: detail.login_name,
      display_name: detail.display_name,
      email: detail.email || '',
      password: '',
      role_ids: [...detail.role_ids],
    })
    drawerOpen.value = true
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '加载失败')
  }
}

async function onSave() {
  // 创建模式的前置校验
  if (drawerMode.value === 'create') {
    if (!form.login_name || !form.display_name || !form.password) {
      ElMessage.warning('登录名、姓名、密码为必填')
      return
    }
    if (!/^[a-zA-Z0-9_.\-]{3,64}$/.test(form.login_name)) {
      ElMessage.warning('登录名只能含字母/数字/._-，长度 3~64')
      return
    }
    if (form.password.length < 8) {
      ElMessage.warning('密码至少 8 位')
      return
    }
  }
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    ElMessage.warning('邮箱格式不正确')
    return
  }
  saving.value = true
  try {
    if (drawerMode.value === 'create') {
      await usersApi.create({
        login_name: form.login_name,
        display_name: form.display_name,
        email: form.email || null,
        password: form.password,
        role_ids: form.role_ids,
      })
      ElMessage.success('用户已创建')
    } else if (editing.value) {
      await usersApi.update(editing.value.id, {
        display_name: form.display_name,
        email: form.email || null,
      })
      await usersApi.setRoles(editing.value.id, form.role_ids)
      ElMessage.success('用户信息已更新')
    }
    drawerOpen.value = false
    load()
  } catch (e: any) {
    const detail = e?.response?.data?.detail
    ElMessage.error(typeof detail === 'string' ? detail : '保存失败')
  } finally {
    saving.value = false
  }
}

async function onToggleActive(row: UserListItem) {
  const action = row.is_active ? '禁用' : '启用'
  try {
    await ElMessageBox.confirm(`确定${action}用户 "${row.display_name}"？`, '提示', {
      type: 'warning',
      confirmButtonText: action,
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    if (row.is_active) await usersApi.deactivate(row.id)
    else await usersApi.activate(row.id)
    ElMessage.success(`已${action}`)
    load()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || `${action}失败`)
  }
}

async function onResetPassword(row: UserListItem) {
  try {
    const { value } = await ElMessageBox.prompt(
      `重置 "${row.display_name}" 的密码（≥ 8 位 + 含字母 + 含数字）`,
      '重置密码',
      { inputType: 'password', confirmButtonText: '重置' }
    )
    await usersApi.resetPassword(row.id, value)
    ElMessage.success('密码已重置')
  } catch (e: any) {
    if (e === 'cancel') return
    ElMessage.error(e?.response?.data?.detail || '重置失败')
  }
}

const lockedHint = (row: UserListItem) => {
  if (!row.locked_until) return ''
  const until = new Date(row.locked_until)
  if (until <= new Date()) return ''
  return `锁定至 ${formatDateTime(row.locked_until)}`
}

onMounted(() => {
  loadRoles()
  loadAllTags()
  load()
})

// ===== 标签分配 =====
const allTags = ref<ScopeTagItem[]>([])
const tagsDrawerOpen = ref(false)
const tagsTarget = ref<UserListItem | null>(null)
const selectedTagIds = ref<number[]>([])
const tagsSaving = ref(false)
const allCategories = ref<FieldCategory[]>([])
const selectedCategoryIds = ref<number[]>([])

const groupedTags = computed(() => {
  const groups: { label: string; items: ScopeTagItem[] }[] = [
    { label: '成本中心维度', items: [] },
    { label: '组织维度', items: [] },
  ]
  for (const t of allTags.value) {
    if (t.dimension === 'cost_center') groups[0].items.push(t)
    else if (t.dimension === 'org') groups[1].items.push(t)
  }
  return groups
})

function tagSummary(t: ScopeTagItem): string {
  const parts: string[] = []
  if (t.org_scope_enabled) {
    parts.push(t.org_scope_unlimited ? '组织不限' : `组织 ${t.selections.length} 节点`)
  }
  if (t.person_scope_enabled) {
    parts.push(`人员 ${t.filters.length} 条筛选`)
  }
  return parts.length ? `（${parts.join(' / ')}）` : ''
}

async function loadAllTags() {
  try {
    allTags.value = await scopesApi.list()
  } catch {
    allTags.value = []
  }
}

async function openTags(row: UserListItem) {
  tagsTarget.value = row
  tagsDrawerOpen.value = true
  try {
    const tags = await scopesApi.userTags(row.id)
    selectedTagIds.value = tags.map((t) => t.id)
  } catch {
    selectedTagIds.value = []
  }
  try {
    allCategories.value = await fieldCategoriesApi.list()
    selectedCategoryIds.value = await fieldCategoriesApi.getUserVisible(row.id)
  } catch {
    allCategories.value = []
    selectedCategoryIds.value = []
  }
}

async function saveTags() {
  if (!tagsTarget.value) return
  tagsSaving.value = true
  try {
    await scopesApi.assignUserTags(tagsTarget.value.id, selectedTagIds.value)
    await fieldCategoriesApi
      .setUserVisible(tagsTarget.value.id, selectedCategoryIds.value)
      .catch(() => {})
    ElMessage.success('已保存')
    tagsDrawerOpen.value = false
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
  } finally {
    tagsSaving.value = false
  }
}
</script>

<style scoped>
.tag-group-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--color-border-light);
}
</style>
