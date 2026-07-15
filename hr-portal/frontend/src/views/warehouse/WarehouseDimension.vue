<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useUserStore } from '@/stores/user'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, Refresh } from '@element-plus/icons-vue'
import {
  listDimensions, getDimensionTree, createDimension, updateDimension, deleteDimension, getDimensionImpact,
  listModels, getModel, getOutputFields, listAssetColumns, type Dimension,
} from '@/api/warehouse'

const userStore = useUserStore()
const dims = ref<Dimension[]>([])
const treeData = ref<Dimension[]>([])
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    dims.value = await listDimensions()
    treeData.value = await getDimensionTree()
  } catch { ElMessage.error('加载维度列表失败') }
  finally { loading.value = false }
}

// 弹窗
const dialogVisible = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const editId = ref<number | null>(null)
const form = ref({ dimension_code: '', dimension_name: '', parent_id: undefined as number | undefined, source_dataset_id: undefined as number | undefined, bound_field: '', description: '', display_order: 0 })
const saving = ref(false)

// 数据集下拉（DWD层）
const datasets = ref<any[]>([])
const columns = ref<{ column_code: string; column_label: string; data_type: string }[]>([])
const columnsLoading = ref(false)

function datasetLabel(item: any) {
  return item.label || item.name || `数据集 #${item.id}`
}

function fieldLabel(item: { column_code: string; column_label: string; data_type: string }) {
  const label = item.column_label || item.column_code
  const code = item.column_code && item.column_code !== label ? ` · ${item.column_code}` : ''
  const type = item.data_type ? ` (${item.data_type})` : ''
  return `${label}${code}${type}`
}

async function loadDatasets() {
  try {
    const res = await listModels({ page_size: 200, warehouse_layer: 'DWD' })
    datasets.value = res.items
  } catch { datasets.value = [] }
}

async function loadDatasetFields(datasetId: number | undefined) {
  columns.value = []
  if (!datasetId) return
  columnsLoading.value = true
  try {
    const fields = await getOutputFields(datasetId)
    columns.value = (fields || [])
      .filter((f: any) => f.is_visible !== false)
      .map((f: any) => ({
        column_code: f.output_code || f.source_column,
        column_label: f.output_label || f.output_code || f.source_column,
        data_type: f.data_type || '',
      }))
    if (!columns.value.length) {
      const model = await getModel(datasetId) as any
      const tableFields = await Promise.all((model.tables || []).map(async (t: any) => {
        const res = await listAssetColumns(t.table_name)
        return (res.columns || [])
          .filter((c: any) => c.is_visible !== false)
          .map((c: any) => ({
            column_code: c.column_code,
            column_label: c.column_label || c.column_code,
            data_type: c.data_type || '',
          }))
      }))
      const seen = new Set<string>()
      columns.value = tableFields.flat().filter((c) => {
        if (!c.column_code || seen.has(c.column_code)) return false
        seen.add(c.column_code)
        return true
      })
    }
  } catch { columns.value = [] }
  finally { columnsLoading.value = false }
}

async function onDatasetChange(datasetId: number | undefined) {
  form.value.source_dataset_id = datasetId
  form.value.bound_field = ''
  await loadDatasetFields(datasetId)
}

function openCreate(parentId?: number) {
  dialogMode.value = 'create'; editId.value = null
  form.value = { dimension_code: '', dimension_name: '', parent_id: parentId, source_dataset_id: undefined, bound_field: '', description: '', display_order: 0 }
  columns.value = []
  loadDatasets()
  dialogVisible.value = true
}

async function openEdit(id: number) {
  const d = dims.value.find(x => x.id === id)
  if (!d) return
  dialogMode.value = 'edit'; editId.value = id
  form.value = { dimension_code: d.dimension_code, dimension_name: d.dimension_name, parent_id: d.parent_id ?? undefined, source_dataset_id: (d as any).source_dataset_id ?? undefined, bound_field: d.bound_field ?? '', description: d.description ?? '', display_order: d.display_order ?? 0 }
  await loadDatasets()
  if ((d as any).source_dataset_id) await loadDatasetFields((d as any).source_dataset_id)
  dialogVisible.value = true
}

async function save() {
  saving.value = true
  try {
    if (dialogMode.value === 'create') {
      await createDimension(form.value as any)
      ElMessage.success('维度已创建')
    } else {
      const { dimension_code, ...payload } = form.value as any
      await updateDimension(editId.value!, payload)
      ElMessage.success('维度已更新')
    }
    dialogVisible.value = false; load()
  } catch (e: any) { ElMessage.error(e?.response?.data?.detail || '保存失败') }
  finally { saving.value = false }
}

async function doDelete(id: number) {
  try {
    const impact = await getDimensionImpact(id)
    if (!impact.can_delete) {
      const refs = impact.referenced_by_aggregates.map((a: any) => a.name).join(', ')
      ElMessage.warning(`该维度被聚合定义引用（${refs}），无法删除`)
      return
    }
    if (impact.referenced_by_children.length > 0) {
      await ElMessageBox.confirm(
        `该维度下有 ${impact.referenced_by_children.length} 个子维度，删除后子维度将成为根节点。确定删除？`,
        '确认删除', { type: 'warning' }
      )
    } else {
      await ElMessageBox.confirm('确定删除该维度？', '确认删除', { type: 'warning' })
    }
    await deleteDimension(id); ElMessage.success('已删除'); load()
  } catch { /* 取消 */ }
}

onMounted(load)
</script>

<template>
  <div style="padding: 24px">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px">
      <h2 style="margin: 0; font-size: 20px">维度管理</h2>
      <div>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button v-if="userStore.hasOp('warehouse.modeling','C')" type="primary" :icon="Plus" @click="openCreate()">新建维度</el-button>
      </div>
    </div>

    <el-card shadow="never">
      <el-table v-loading="loading" :data="treeData" border stripe size="small" empty-text="暂无维度" row-key="id" :tree-props="{ children: 'children' }" default-expand-all>
        <el-table-column label="维度名称" min-width="200">
          <template #default="{ row }">
            <span :style="{ paddingLeft: '4px' }">
              {{ row.dimension_name }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="dimension_code" label="编码" width="140" />
        <el-table-column label="绑定字段" width="200">
          <template #default="{ row }">
            <span v-if="(row as any).source_dataset_id && row.bound_field">数据集 #{{ (row as any).source_dataset_id }} · {{ row.bound_field }}</span>
            <span v-else style="color:#909399">—</span>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="说明" min-width="120" show-overflow-tooltip />
        <el-table-column prop="display_order" label="排序" width="60" align="center" />
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button v-if="userStore.hasOp('warehouse.modeling','C')" text size="small" :icon="Plus" @click="openCreate(row.id)">添加子维度</el-button>
            <el-button v-if="userStore.hasOp('warehouse.modeling','U')" text size="small" :icon="Edit" @click="openEdit(row.id)">编辑</el-button>
            <el-button v-if="userStore.hasOp('warehouse.modeling','D')" text size="small" type="danger" :icon="Delete" @click="doDelete(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新建/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="dialogMode==='create'?'新建维度':'编辑维度'" width="500px" @close="editId=null">
      <el-form v-if="dialogVisible" label-width="100px" size="small">
        <el-form-item label="维度编码" required><el-input v-model="form.dimension_code" :disabled="dialogMode==='edit'" maxlength="64" /></el-form-item>
        <el-form-item label="维度名称" required><el-input v-model="form.dimension_name" maxlength="128" /></el-form-item>
        <el-form-item label="父维度">
          <el-select v-model="form.parent_id" clearable placeholder="无（根节点）" style="width:100%">
            <el-option v-for="d in dims.filter(x => x.id !== editId)" :key="d.id" :label="d.dimension_code + ' - ' + d.dimension_name" :value="d.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="数据集(DWD)">
          <el-select v-model="form.source_dataset_id" clearable filterable placeholder="选择DWD数据集" style="width:100%" @change="onDatasetChange">
            <el-option v-for="t in datasets" :key="(t as any).id" :label="datasetLabel(t)" :value="(t as any).id">
              <span>{{ datasetLabel(t) }}</span>
              <span style="float:right;color:#909399;font-size:12px">{{ (t as any).name }}</span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="绑定字段">
          <el-select v-model="form.bound_field" clearable filterable placeholder="先选数据集" style="width:100%" :loading="columnsLoading" :disabled="!form.source_dataset_id">
            <el-option v-for="c in columns" :key="c.column_code" :label="fieldLabel(c)" :value="c.column_code" />
          </el-select>
        </el-form-item>
        <el-form-item label="说明"><el-input v-model="form.description" type="textarea" :rows="2" /></el-form-item>
        <el-form-item label="排序"><el-input-number v-model="form.display_order" :min="0" style="width:160px" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible=false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>
