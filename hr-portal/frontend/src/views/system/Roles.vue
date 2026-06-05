<template>
  <div style="padding: 24px">
    <!-- ========== 列表态 ========== -->
    <template v-if="editingId === null">
      <el-card>
        <template #header>
          <div style="display: flex; justify-content: space-between; align-items: center">
            <span style="font-size: 16px; font-weight: 600">角色配置（共 {{ list.length }} 个）</span>
            <PermissionButton menu="system.roles" op="C" type="primary" @click="openCreate">
              <el-icon style="margin-right: 4px"><Plus /></el-icon>新建角色
            </PermissionButton>
          </div>
        </template>

        <div style="overflow-x: auto">
          <el-table v-loading="loading" :data="list" stripe style="width: 100%" max-height="600">
            <el-table-column label="角色名" min-width="160">
              <template #default="{ row }">
                <strong>{{ row.name }}</strong>
                <el-tag v-if="!row.is_active" size="small" style="margin-left: 8px" type="info">
                  已停用
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="description" label="描述" min-width="220" />
            <el-table-column label="绑定用户" width="100">
              <template #default="{ row }">{{ row.user_count }}</template>
            </el-table-column>
            <el-table-column label="菜单数" width="90">
              <template #default="{ row }">{{ row.menu_count }}</template>
            </el-table-column>
            <el-table-column label="操作" width="200" fixed="right">
              <template #default="{ row }">
                <PermissionButton menu="system.roles" op="U" size="small" @click="openEdit(row.id)">
                  编辑
                </PermissionButton>
                <PermissionButton
                  menu="system.roles"
                  op="U"
                  size="small"
                  :type="row.is_active ? 'warning' : 'success'"
                  @click="onToggleActive(row)"
                >
                  {{ row.is_active ? '停用' : '启用' }}
                </PermissionButton>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-card>
    </template>

    <!-- ========== 编辑态 ========== -->
    <template v-else>
      <el-card>
        <template #header>
          <div style="display: flex; justify-content: space-between; align-items: center">
            <span style="font-size: 16px; font-weight: 600">{{ editingTitle }}</span>
            <div>
              <el-button @click="exitEdit">取消</el-button>
              <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
            </div>
          </div>
        </template>

        <el-form label-position="top" inline>
          <el-form-item label="角色名" required>
            <el-input v-model="form.name" style="width: 240px" />
          </el-form-item>
          <el-form-item v-if="editingId !== 'new'" label="状态">
            <el-switch v-model="form.is_active" active-text="启用" inactive-text="停用" />
          </el-form-item>
          <el-form-item label="描述" style="width: 100%">
            <el-input
              v-model="form.description"
              type="textarea"
              :rows="2"
              placeholder="该角色的职责说明"
            />
          </el-form-item>
        </el-form>

        <div style="margin-top: 24px; font-size: 14px; font-weight: 600; color: var(--color-text-primary); margin-bottom: 8px">
          菜单与操作权限矩阵
        </div>

        <div style="overflow-x: auto">
          <el-table :data="form.matrix" stripe style="width: 100%" max-height="600">
            <el-table-column label="菜单" min-width="260">
              <template #default="{ row }">
                <span v-if="!row.is_leaf" :style="`font-weight: 600; padding-left: ${row.depth * 16}px`">
                  <span style="font-family: monospace; font-size: 11px; color: var(--color-text-secondary); margin-right: 8px">{{ row.code }}</span>
                  {{ row.label }}
                </span>
                <span v-else :style="`padding-left: ${row.depth * 16}px`">
                  <span style="color: var(--color-text-placeholder); margin-right: 6px">└</span>
                  {{ row.label }}
                  <span style="margin-left: 8px; font-family: monospace; font-size: 11px; color: var(--color-text-placeholder)">{{ row.code }}</span>
                </span>
              </template>
            </el-table-column>
            <el-table-column label="可访问" width="80" align="center">
              <template #default="{ row }">
                <el-checkbox
                  v-if="row.is_leaf"
                  v-model="row.enabled"
                  @change="() => toggleEnabled(row)"
                />
              </template>
            </el-table-column>
            <el-table-column label="数据范围" width="180">
              <template #default="{ row }">
                <el-select
                  v-if="row.is_leaf"
                  v-model="row.scope_dimension"
                  :disabled="!row.enabled"
                  size="small"
                >
                  <el-option label="不限" value="none" />
                  <el-option label="成本中心" value="cost_center" />
                  <el-option label="组织架构" value="org" />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="增" width="60" align="center">
              <template #default="{ row }">
                <el-checkbox v-if="row.is_leaf" v-model="row.can_create" :disabled="!row.enabled" />
              </template>
            </el-table-column>
            <el-table-column label="改" width="60" align="center">
              <template #default="{ row }">
                <el-checkbox v-if="row.is_leaf" v-model="row.can_update" :disabled="!row.enabled" />
              </template>
            </el-table-column>
            <el-table-column label="删" width="60" align="center">
              <template #default="{ row }">
                <el-checkbox v-if="row.is_leaf" v-model="row.can_delete" :disabled="!row.enabled" />
              </template>
            </el-table-column>
            <el-table-column label="导出" width="60" align="center">
              <template #default="{ row }">
                <el-checkbox v-if="row.is_leaf" v-model="row.can_export" :disabled="!row.enabled" />
              </template>
            </el-table-column>
            <el-table-column label="批量" width="140">
              <template #default="{ row }">
                <template v-if="row.is_leaf">
                  <el-button link size="small" :disabled="!row.enabled" @click="onSelectAllOps(row, true)">
                    全开
                  </el-button>
                  <el-button link size="small" :disabled="!row.enabled" @click="onSelectAllOps(row, false)">
                    全关
                  </el-button>
                </template>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <!-- ===== 可见字段分类（列级权限）===== -->
        <div style="margin-top: 24px; font-size: 14px; font-weight: 600; color: var(--color-text-primary); margin-bottom: 8px">
          可见字段分类
          <el-tooltip placement="top">
            <template #content>
              <div style="max-width: 320px; line-height: 1.6">
                此处勾选该角色可以查看的字段分类。<br />
                若某字段被打上"敏感"分类标签，但角色没勾选该分类 → 该字段在列表/报表中显示为 <code>******</code>。<br />
                非敏感分类不强制勾选。
              </div>
            </template>
            <el-icon style="margin-left: 4px; vertical-align: middle; cursor: help; color: var(--color-text-secondary)">
              <InfoFilled />
            </el-icon>
          </el-tooltip>
        </div>
        <div v-if="allCategories.length === 0" style="color: var(--color-text-placeholder); font-size: 13px">
          暂无字段分类。请到 <strong>系统设置 → 字段分类管理</strong> 创建后回到此页配置。
        </div>
        <el-checkbox-group v-else v-model="selectedCategoryIds">
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
            <span style="color: var(--color-text-placeholder); font-size: 12px; margin-left: 4px">
              ({{ c.field_count }} 字段)
            </span>
          </el-checkbox>
        </el-checkbox-group>
      </el-card>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, InfoFilled } from '@element-plus/icons-vue'
import PermissionButton from '@/components/PermissionButton.vue'
import {
  rolesApi,
  menusApi,
  type RoleDetail,
  type RoleListItem,
  type RoleMenuItem,
  type MenuNode,
} from '@/api/roles'
import { fieldCategoriesApi, type FieldCategory } from '@/api/field_categories'

interface MatrixRow {
  menu_id: number
  code: string
  label: string
  parent_id: number | null
  depth: number          // 0=tab(顶级) 1=group(分组) 2=leaf(叶子)
  is_leaf: boolean       // 叶子节点：可勾选可访问 + 操作权限
  enabled: boolean
  scope_dimension: 'cost_center' | 'org' | 'none'
  can_create: boolean
  can_update: boolean
  can_delete: boolean
  can_export: boolean
}

const list = ref<RoleListItem[]>([])
const loading = ref(false)
const allMenus = ref<MenuNode[]>([])
const allCategories = ref<FieldCategory[]>([])
const selectedCategoryIds = ref<number[]>([])

const editingId = ref<number | 'new' | null>(null)
const form = reactive<{
  name: string
  description: string
  is_active: boolean
  matrix: MatrixRow[]
}>({
  name: '',
  description: '',
  is_active: true,
  matrix: [],
})
const saving = ref(false)

const editingTitle = computed(() => {
  if (editingId.value === 'new') return '新建角色'
  if (typeof editingId.value === 'number') {
    const r = list.value.find((x) => x.id === editingId.value)
    return `编辑角色 · ${r?.name ?? ''}`
  }
  return ''
})

async function loadList() {
  loading.value = true
  try {
    const resp = await rolesApi.list()
    list.value = resp.items
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '加载失败')
  } finally {
    loading.value = false
  }
}

async function loadMenus() {
  if (allMenus.value.length) return
  allMenus.value = await menusApi.list()
}

function buildMatrix(detail: RoleDetail | null): MatrixRow[] {
  const dict = new Map<number, RoleMenuItem>()
  detail?.menus.forEach((m) => dict.set(m.menu_id, m))

  // 计算每个菜单的 depth：根节点 0，依次 +1
  const byId = new Map<number, MenuNode>()
  allMenus.value.forEach((m) => byId.set(m.id, m))
  const depthOf = (m: MenuNode): number => {
    let d = 0
    let cur: MenuNode | undefined = m
    while (cur && cur.parent_id !== null) {
      d++
      cur = byId.get(cur.parent_id)
    }
    return d
  }

  // 子节点存在性 → 判断是否叶子
  const hasChildren = new Set<number>()
  allMenus.value.forEach((m) => {
    if (m.parent_id !== null) hasChildren.add(m.parent_id)
  })

  // 排序：父在前、按 display_order
  const sorted = [...allMenus.value].sort((a, b) => {
    if (a.parent_id === b.parent_id) {
      return (a.id ?? 0) - (b.id ?? 0)
    }
    return 0
  })

  return sorted.map((m) => {
    const cur = dict.get(m.id)
    return {
      menu_id: m.id,
      code: m.code,
      label: m.label,
      parent_id: m.parent_id,
      depth: depthOf(m),
      is_leaf: !hasChildren.has(m.id),
      enabled: !!cur,
      scope_dimension: (cur?.scope_dimension as any) ?? 'none',
      can_create: !!cur?.can_create,
      can_update: !!cur?.can_update,
      can_delete: !!cur?.can_delete,
      can_export: !!cur?.can_export,
    }
  })
}

async function openCreate() {
  await loadMenus()
  await loadCategories()
  selectedCategoryIds.value = []
  editingId.value = 'new'
  Object.assign(form, {
    name: '',
    description: '',
    is_active: true,
    matrix: buildMatrix(null),
  })
}

async function openEdit(id: number) {
  await loadMenus()
  await loadCategories()
  try {
    const detail = await rolesApi.get(id)
    const visibleCats = await fieldCategoriesApi.getRoleVisible(id).catch(() => [])
    selectedCategoryIds.value = [...visibleCats]
    editingId.value = id
    Object.assign(form, {
      name: detail.name,
      description: detail.description ?? '',
      is_active: detail.is_active,
      matrix: buildMatrix(detail),
    })
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '加载失败')
  }
}

async function loadCategories() {
  try {
    allCategories.value = await fieldCategoriesApi.list()
  } catch {
    allCategories.value = []
  }
}

function exitEdit() {
  editingId.value = null
}

async function onSave() {
  if (!form.name.trim()) {
    ElMessage.warning('请填写角色名')
    return
  }
  saving.value = true
  try {
    const menus: RoleMenuItem[] = form.matrix
      .filter((m) => m.enabled)
      .map((m) => ({
        menu_id: m.menu_id,
        scope_dimension: m.scope_dimension,
        can_view: true,
        can_create: m.can_create,
        can_update: m.can_update,
        can_delete: m.can_delete,
        can_export: m.can_export,
      }))

    if (editingId.value === 'new') {
      const created = await rolesApi.create({
        name: form.name,
        description: form.description || undefined,
        menus,
      })
      // 新建后保存可见分类
      if (selectedCategoryIds.value.length > 0) {
        await fieldCategoriesApi
          .setRoleVisible(created.id, selectedCategoryIds.value)
          .catch(() => {})
      }
      ElMessage.success('角色已创建')
    } else if (typeof editingId.value === 'number') {
      await rolesApi.update(editingId.value, {
        name: form.name,
        description: form.description || undefined,
        is_active: form.is_active,
        menus,
      })
      await fieldCategoriesApi
        .setRoleVisible(editingId.value, selectedCategoryIds.value)
        .catch(() => {})
      ElMessage.success('角色已更新')
    }
    exitEdit()
    loadList()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
  } finally {
    saving.value = false
  }
}

async function onToggleActive(row: RoleListItem) {
  const action = row.is_active ? '停用' : '启用'
  try {
    await ElMessageBox.confirm(`${action}角色 "${row.name}"？`, '提示', {
      type: 'warning',
      confirmButtonText: action,
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    if (row.is_active) await rolesApi.deactivate(row.id)
    else await rolesApi.activate(row.id)
    ElMessage.success(`已${action}`)
    loadList()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || `${action}失败`)
  }
}

function toggleEnabled(row: MatrixRow) {
  if (!row.enabled) {
    row.scope_dimension = 'none'
    row.can_create = false
    row.can_update = false
    row.can_delete = false
    row.can_export = false
  }
}

function onSelectAllOps(row: MatrixRow, on: boolean) {
  row.can_create = on
  row.can_update = on
  row.can_delete = on
  row.can_export = on
}

onMounted(() => {
  loadList()
})
</script>
