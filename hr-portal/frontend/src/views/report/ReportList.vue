<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Document, Edit, Delete, View } from '@element-plus/icons-vue'
import PermissionButton from '@/components/PermissionButton.vue'
import { reportsApi, type ReportItem } from '@/api/reports'
import { datasetsApi, type DatasetItem } from '@/api/datasets'

const router = useRouter()

const list = ref<ReportItem[]>([])
const datasets = ref<DatasetItem[]>([])
const loading = ref(false)
const filterDataset = ref<number | null>(null)
const filterKeyword = ref('')

async function load() {
  loading.value = true
  try {
    list.value = await reportsApi.list({
      dataset_id: filterDataset.value || undefined,
      keyword: filterKeyword.value || undefined,
    })
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '加载失败')
  } finally {
    loading.value = false
  }
}

async function loadDatasets() {
  try {
    datasets.value = await datasetsApi.list()
  } catch {
    datasets.value = []
  }
}

function openDesigner(row?: ReportItem) {
  if (row) {
    router.push(`/report/designer/${row.id}`)
  } else {
    router.push('/report/designer/new')
  }
}

function openRun(row: ReportItem) {
  router.push(`/report/run/${row.id}`)
}

async function handleDelete(row: ReportItem) {
  try {
    await ElMessageBox.confirm(`确认删除报表「${row.name}」？该操作不可恢复。`, '删除确认', {
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await reportsApi.remove(row.id)
    ElMessage.success('已删���')
    await load()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '删除失败')
  }
}

const filteredList = computed(() => list.value)

onMounted(async () => {
  await Promise.all([loadDatasets(), load()])
})
</script>

<template>
  <div style="padding: 24px">
    <el-card>
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <span style="font-size: 16px; font-weight: 600">报表管理（共 {{ filteredList.length }} 个）</span>
          <PermissionButton menu="report.list" op="C" type="primary" @click="openDesigner()">
            <el-icon style="margin-right: 4px"><Plus /></el-icon>新建报表
          </PermissionButton>
        </div>
      </template>

      <el-form inline style="margin-bottom: 16px">
        <el-form-item label="数据集">
          <el-select v-model="filterDataset" placeholder="全部" clearable style="width: 220px" @change="load" @clear="load">
            <el-option v-for="ds in datasets" :key="ds.id" :label="ds.name" :value="ds.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="名称">
          <el-input
            v-model="filterKeyword"
            placeholder="按报表名搜索"
            clearable
            style="width: 240px"
            @keyup.enter="load"
            @clear="load"
          />
        </el-form-item>
        <el-form-item>
          <el-button @click="load">查询</el-button>
        </el-form-item>
      </el-form>

      <div style="overflow-x: auto">
        <el-table v-loading="loading" :data="filteredList" stripe style="width: 100%" max-height="600">
          <el-table-column label="报表名" min-width="220">
            <template #default="{ row }">
              <button class="report-name-link" type="button" @click="openRun(row)">
                {{ row.name }}
              </button>
              <el-tag v-if="!row.is_published" size="small" type="info" style="margin-left: 8px">草稿</el-tag>
              <el-tag v-else size="small" type="success" style="margin-left: 8px">已发布</el-tag>
              <div v-if="row.description" style="color: var(--color-text-secondary); font-size: 12px; margin-top: 2px">
                {{ row.description }}
              </div>
            </template>
          </el-table-column>
          <el-table-column label="数据来源" min-width="200">
            <template #default="{ row }">
              <span>
                <el-tag size="small" type="warning" effect="plain">数据集</el-tag>
                <strong style="margin-left: 6px">{{ row.dataset_name || `#${row.dataset_id}` }}</strong>
              </span>
            </template>
          </el-table-column>
          <el-table-column label="所有者" width="120">
            <template #default="{ row }">
              {{ row.owner_name || '—' }}
            </template>
          </el-table-column>
          <el-table-column label="运行次数" width="100">
            <template #default="{ row }">{{ row.run_count }}</template>
          </el-table-column>
          <el-table-column label="上次运行" min-width="180">
            <template #default="{ row }">
              <span v-if="row.last_run_at">
                {{ new Date(row.last_run_at).toLocaleString('zh-CN') }}
              </span>
              <span v-else style="color: var(--color-text-placeholder)">—</span>
            </template>
          </el-table-column>
          <el-table-column label="更新时间" min-width="180">
            <template #default="{ row }">
              {{ new Date(row.updated_at).toLocaleString('zh-CN') }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="280" fixed="right">
            <template #default="{ row }">
              <PermissionButton menu="report.list" op="V" size="small" @click="openRun(row)">
                <el-icon style="margin-right: 4px"><View /></el-icon>查看
              </PermissionButton>
              <PermissionButton menu="report.list" op="U" size="small" @click="openDesigner(row)">
                <el-icon style="margin-right: 4px"><Edit /></el-icon>编辑
              </PermissionButton>
              <PermissionButton menu="report.list" op="D" size="small" type="danger" @click="handleDelete(row)">
                <el-icon style="margin-right: 4px"><Delete /></el-icon>删除
              </PermissionButton>
            </template>
          </el-table-column>
          <template #empty>
            <div style="padding: 32px 0; color: var(--color-text-placeholder); font-size: 13px">
              <el-icon style="vertical-align: -2px"><Document /></el-icon>
              暂无报表 · 点击右上角「新建报表」创建第一张
            </div>
          </template>
        </el-table>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.report-name-link {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-primary);
  cursor: pointer;
  font: inherit;
  font-weight: 700;
  text-align: left;
}
.report-name-link:hover {
  text-decoration: underline;
}
</style>
