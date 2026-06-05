<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, VideoPlay } from '@element-plus/icons-vue'
import PermissionButton from '@/components/PermissionButton.vue'
import PushTargetDialog from './PushTargetDialog.vue'
import PushRunHistory from './PushRunHistory.vue'
import type { PushTargetOut } from '@/api/push_targets'
import { pushTargetsApi } from '@/api/push_targets'

const props = defineProps<{ sourceTable: string }>()

const targets = ref<PushTargetOut[]>([])
const loading = ref(false)
const running = ref<number | null>(null)
const historyTarget = ref<PushTargetOut | null>(null)
const dialogRef = ref<InstanceType<typeof PushTargetDialog> | null>(null)
const historyRef = ref<InstanceType<typeof PushRunHistory> | null>(null)

async function load() {
  loading.value = true
  try {
    targets.value = await pushTargetsApi.list(props.sourceTable)
  } catch {
    ElMessage.error('加载推送目标失败')
  } finally {
    loading.value = false
  }
}

async function runNow(target: PushTargetOut) {
  running.value = target.id
  try {
    const res = await pushTargetsApi.run(target.id)
    ElMessage.success(res.message || '推送成功')
    await load()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '推送失败')
  } finally {
    running.value = null
  }
}

async function remove(target: PushTargetOut) {
  await ElMessageBox.confirm(`确认删除推送目标「${target.name}」？`, '确认删除', {
    type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消',
  })
  try {
    await pushTargetsApi.remove(target.id)
    ElMessage.success('已删除')
    await load()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '删除失败')
  }
}

const PUSH_TYPE_LABELS: Record<string, string> = {
  external_db: '写入数据库',
  http_push: 'HTTP 推送',
  api_expose: 'API 暴露',
}

onMounted(load)
</script>

<template>
  <div>
    <div style="display: flex; justify-content: flex-end; margin-bottom: 12px">
      <PermissionButton menu="system.users" op="C" type="primary" @click="dialogRef?.open()">
        <el-icon style="margin-right: 4px"><Plus /></el-icon>新建推送目标
      </PermissionButton>
    </div>

    <el-empty v-if="!loading && !targets.length" description="暂无推送目标" />

    <div v-loading="loading" style="overflow-x: auto">
      <el-table v-if="targets.length" :data="targets" stripe style="width: 100%" max-height="400">
        <el-table-column label="名称" min-width="140" prop="name" />
        <el-table-column label="推送方式" width="120">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ PUSH_TYPE_LABELS[row.push_type] ?? row.push_type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag size="small" :type="row.is_active ? 'success' : 'info'" effect="plain">
              {{ row.is_active ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="最近推送" min-width="160">
          <template #default="{ row }">
            <span v-if="row.last_push_at">
              <el-tag size="small" :type="row.last_status === 'success' ? 'success' : 'danger'" effect="plain">
                {{ row.last_status === 'success' ? '成功' : '失败' }}
              </el-tag>
              <span style="margin-left: 6px; font-size: 12px; color: var(--color-text-secondary)">
                {{ new Date(row.last_push_at).toLocaleString('zh-CN') }}
                · {{ row.last_rows }} 行
              </span>
            </span>
            <span v-else style="color: var(--color-text-placeholder)">—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <PermissionButton menu="system.users" op="C" size="small" type="primary"
              :loading="running === row.id" @click="runNow(row)">
              <el-icon><VideoPlay /></el-icon>立即推送
            </PermissionButton>
            <el-button size="small" style="margin-left: 8px"
              @click="historyTarget = row">历史</el-button>
            <PermissionButton menu="system.users" op="U" size="small" style="margin-left: 8px"
              @click="dialogRef?.open(row)">
              <el-icon><Edit /></el-icon>
            </PermissionButton>
            <PermissionButton menu="system.users" op="D" size="small" type="danger" style="margin-left: 8px"
              @click="remove(row)">
              <el-icon><Delete /></el-icon>
            </PermissionButton>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 推送历史抽屉 -->
    <el-drawer
      :model-value="!!historyTarget"
      :title="`推送历史 · ${historyTarget?.name}`"
      size="500px"
      @close="historyTarget = null"
    >
      <PushRunHistory v-if="historyTarget" :push-target-id="historyTarget.id" ref="historyRef" />
    </el-drawer>

    <PushTargetDialog
      ref="dialogRef"
      :source-table="sourceTable"
      @done="load"
    />
  </div>
</template>
