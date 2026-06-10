<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Setting, Delete } from '@element-plus/icons-vue'
import PermissionButton from '@/components/PermissionButton.vue'
import AllocationRunDialog from '@/components/allocation/AllocationRunDialog.vue'
import { allocationApi, type AllocationSchemeOut } from '@/api/allocation'

const router = useRouter()
const schemes = ref<AllocationSchemeOut[]>([])
const loading = ref(false)
const runDialogVisible = ref(false)
const activeScheme = ref<AllocationSchemeOut | null>(null)

async function loadSchemes() {
  loading.value = true
  try { schemes.value = await allocationApi.listSchemes() }
  catch { ElMessage.error('加载方案列表失败') }
  finally { loading.value = false }
}

function openRunDialog(scheme: AllocationSchemeOut) {
  activeScheme.value = scheme
  runDialogVisible.value = true
}

async function deleteScheme(scheme: AllocationSchemeOut) {
  await ElMessageBox.confirm(`确认删除方案「${scheme.name}」？执行历史也将一并删除。`, '确认删除', {
    type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消',
  })
  try {
    await allocationApi.deleteScheme(scheme.id)
    ElMessage.success('已删除')
    await loadSchemes()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '删除失败')
  }
}

function onRunDone() {
  loadSchemes()
}

onMounted(loadSchemes)
</script>

<template>
  <div style="padding: 24px">
    <el-card>
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <div>
            <div style="font-size: 16px; font-weight: 600">成本分摊</div>
            <div style="margin-top: 4px; font-size: 13px; color: var(--color-text-placeholder)">
              管理分摊方案，配置字段与规则后按月份执行存档。
            </div>
          </div>
          <PermissionButton menu="tools.cost_allocation" op="C" type="primary"
            @click="router.push('/tools/allocation-designer/new')">
            <el-icon style="margin-right: 4px"><Plus /></el-icon>新建方案
          </PermissionButton>
        </div>
      </template>

      <el-empty v-if="!loading && !schemes.length" description="暂无分摊方案，点击右上角新建" />

      <div v-loading="loading" style="overflow-x: auto">
        <el-table v-if="schemes.length" :data="schemes" stripe style="width: 100%" max-height="600">
          <el-table-column label="方案名" min-width="160">
            <template #default="{ row }">
              <el-button link type="primary" @click="router.push(`/tools/allocation-designer/${row.id}`)">
                {{ row.name }}
              </el-button>
            </template>
          </el-table-column>
          <el-table-column label="数据来源" min-width="160">
            <template #default="{ row }">
              <span>
                <el-tag size="small" type="warning" effect="plain">数据集</el-tag>
                <span style="margin-left: 6px">{{ row.dataset_name || `#${row.dataset_id}` }}</span>
              </span>
            </template>
          </el-table-column>
          <el-table-column label="写入结果表" min-width="160" prop="result_table_label" />
          <el-table-column label="最近执行" min-width="160">
            <template #default="{ row }">
              <span v-if="row.last_run">
                <el-tag
                  size="small"
                  :type="row.last_run.status === 'success' ? 'success' : 'danger'"
                  effect="plain"
                >{{ row.last_run.status === 'success' ? '成功' : '失败' }}</el-tag>
                <span style="margin-left: 6px; color: var(--color-text-secondary); font-size: 12px">
                  {{ row.last_run.period_ym }} · {{ row.last_run.rows_written }} 行
                </span>
              </span>
              <span v-else style="color: var(--color-text-placeholder)">—</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="200" fixed="right">
            <template #default="{ row }">
              <PermissionButton menu="tools.cost_allocation" op="U" size="small"
                @click="router.push(`/tools/allocation-designer/${row.id}`)">
                <el-icon><Setting /></el-icon>配置
              </PermissionButton>
              <PermissionButton menu="tools.cost_allocation" op="C" size="small" type="primary"
                style="margin-left: 8px" @click="openRunDialog(row)">
                计算
              </PermissionButton>
              <PermissionButton menu="tools.cost_allocation" op="D" size="small" type="danger"
                style="margin-left: 8px" @click="deleteScheme(row)">
                <el-icon><Delete /></el-icon>
              </PermissionButton>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-card>

    <AllocationRunDialog
      v-model:visible="runDialogVisible"
      :scheme="activeScheme"
      @done="onRunDone"
    />
  </div>
</template>
