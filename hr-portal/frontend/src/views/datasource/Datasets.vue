<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Connection, Edit, Delete } from '@element-plus/icons-vue'
import PermissionButton from '@/components/PermissionButton.vue'
import { datasetsApi, type DatasetItem } from '@/api/datasets'

const router = useRouter()

const list = ref<DatasetItem[]>([])
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    list.value = await datasetsApi.list()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '加载失败')
  } finally {
    loading.value = false
  }
}

function openNew() {
  router.push('/datasource/datasets/new')
}

function openEdit(row: DatasetItem) {
  router.push(`/datasource/datasets/${row.id}`)
}

async function handleDelete(row: DatasetItem) {
  try {
    await ElMessageBox.confirm(`确认删除数据集「${row.name}」？`, '删除确认', {
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await datasetsApi.remove(row.id)
    ElMessage.success('已删除')
    await load()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '删除失败')
  }
}

const filteredList = computed(() => list.value)

onMounted(load)
</script>

<template>
  <div style="padding: 24px">
    <el-card>
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <span style="font-size: 16px; font-weight: 600">表间关联（数据集，共 {{ filteredList.length }} 个）</span>
          <PermissionButton menu="datasource.datasets" op="C" type="primary" @click="openNew">
            <el-icon style="margin-right: 4px"><Plus /></el-icon>新建数据集
          </PermissionButton>
        </div>
      </template>

      <el-alert type="info" :closable="false" show-icon style="margin-bottom: 16px">
        <p style="margin: 0; line-height: 1.6">
          数据集 = 一组数据表 + 表间 JOIN 关系。新建报表时必须先选数据集；
          同一组表可建多个不同 JOIN 策略的数据集，互不干扰。
        </p>
      </el-alert>

      <div style="overflow-x: auto">
        <el-table v-loading="loading" :data="filteredList" stripe style="width: 100%" max-height="600">
          <el-table-column label="数据集名称" min-width="200">
            <template #default="{ row }">
              <strong>{{ row.name }}</strong>
              <el-tag v-if="!row.is_active" size="small" type="info" style="margin-left: 8px">停用</el-tag>
              <div v-if="row.description" style="color: var(--color-text-secondary); font-size: 12px; margin-top: 2px">
                {{ row.description }}
              </div>
            </template>
          </el-table-column>
          <el-table-column label="包含的表" min-width="240">
            <template #default="{ row }">
              <el-tag
                v-for="t in row.tables"
                :key="t.alias"
                size="small"
                effect="plain"
                style="margin-right: 4px"
              >
                {{ t.alias }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="关联数" width="90">
            <template #default="{ row }">{{ row.relations.length }}</template>
          </el-table-column>
          <el-table-column label="被报表引用" width="120">
            <template #default="{ row }">{{ row.referenced_by_reports }}</template>
          </el-table-column>
          <el-table-column label="操作" width="240" fixed="right">
            <template #default="{ row }">
              <PermissionButton menu="datasource.datasets" op="U" size="small" @click="openEdit(row)">
                <el-icon style="margin-right: 4px"><Connection /></el-icon>设计
              </PermissionButton>
              <PermissionButton menu="datasource.datasets" op="D" size="small" type="danger" @click="handleDelete(row)">
                <el-icon style="margin-right: 4px"><Delete /></el-icon>删除
              </PermissionButton>
            </template>
          </el-table-column>
          <template #empty>
            <div style="padding: 32px 0; color: var(--color-text-placeholder); font-size: 13px">
              暂无数据集 · 点击右上角「新建数据集」开始
            </div>
          </template>
        </el-table>
      </div>
    </el-card>
  </div>
</template>
