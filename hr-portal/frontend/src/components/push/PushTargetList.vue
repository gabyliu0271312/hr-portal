<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, VideoPlay, Search } from '@element-plus/icons-vue'
import { formatDateTime } from '@/utils/datetime'
import PermissionButton from '@/components/PermissionButton.vue'
import PushTargetDialog from './PushTargetDialog.vue'
import PushRunHistory from './PushRunHistory.vue'
import type { PushTargetOut, SchemaOrphan } from '@/api/push_targets'
import { pushTargetsApi } from '@/api/push_targets'

const props = withDefaults(defineProps<{
  sourceTable: string
  sourceColumns?: any[]
  compact?: boolean
  hideHeader?: boolean
  permissionMenu?: string
}>(), {
  compact: false,
  hideHeader: false,
  permissionMenu: 'warehouse.service',
})

const emit = defineEmits<{ 'targets-change': [targets: PushTargetOut[]] }>()

const targets = ref<PushTargetOut[]>([])
const loading = ref(false)
const running = ref<number | null>(null)
const historyTarget = ref<PushTargetOut | null>(null)
const dialogRef = ref<InstanceType<typeof PushTargetDialog> | null>(null)
const historyRef = ref<InstanceType<typeof PushRunHistory> | null>(null)
const orphanDialogVisible = ref(false)
const orphanLoading = ref(false)
const orphans = ref<SchemaOrphan[]>([])
const activeTargets = computed(() => targets.value.filter((item) => item.is_active).length)
const tableMaxHeight = computed(() => (props.compact ? 300 : 400))

async function load() {
  loading.value = true
  try {
    targets.value = await pushTargetsApi.list(props.sourceTable || undefined)
    emit('targets-change', targets.value)
  } catch {
    ElMessage.error('加载推送配置失败')
  } finally {
    loading.value = false
  }
}

async function runNow(target: PushTargetOut) {
  if (target.push_type === 'db_realtime') {
    ElMessage.info('实时数据库视图会在查询时读取当前数据，无需手动推送')
    return
  }
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
  await ElMessageBox.confirm(`确认删除推送配置「${target.name}」？`, '确认删除', {
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

async function checkOrphans() {
  orphanLoading.value = true
  orphanDialogVisible.value = true
  try {
    orphans.value = await pushTargetsApi.schemaOrphans()
  } catch {
    ElMessage.error('检查孤儿 Schema 失败')
  } finally {
    orphanLoading.value = false
  }
}

const PUSH_TYPE_LABELS: Record<string, string> = {
  external_db: '写入数据库',
  http_push: 'HTTP 推送',
  api_expose: 'API 暴露',
  db_realtime: '实时数据库',
  db_snapshot: '快照数据库',
  feishu_sheet: '飞书表格',
}

watch(() => props.sourceTable, () => load())
onMounted(load)
</script>

<template>
  <div class="push-target-list" :class="{ 'is-compact': compact }">
    <div v-if="!hideHeader" class="push-list-header">
      <PermissionButton :menu="permissionMenu" op="D" plain @click="checkOrphans">
        <el-icon style="margin-right: 4px"><Search /></el-icon>检查孤儿 Schema
      </PermissionButton>
      <PermissionButton :menu="permissionMenu" op="C" type="primary" @click="dialogRef?.open()">
        <el-icon style="margin-right: 4px"><Plus /></el-icon>新增推送
      </PermissionButton>
    </div>
    <div v-else class="push-list-toolbar">
      <span class="push-summary">已配置 {{ targets.length }} 个推送配置，启用 {{ activeTargets }} 个</span>
      <PermissionButton :menu="permissionMenu" op="D" plain @click="checkOrphans">
        <el-icon style="margin-right: 4px"><Search /></el-icon>检查孤儿 Schema
      </PermissionButton>
      <PermissionButton :menu="permissionMenu" op="C" type="primary" plain @click="dialogRef?.open()">
        <el-icon style="margin-right: 4px"><Plus /></el-icon>新增推送
      </PermissionButton>
    </div>

    <el-empty v-if="!loading && !targets.length" :image-size="compact ? 72 : 120" description="暂无推送配置" />

    <div v-loading="loading" class="push-table-wrap">
      <el-table v-if="targets.length" :data="targets" stripe style="width: 100%" :max-height="tableMaxHeight">
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
                {{ formatDateTime(row.last_push_at) }}
                · {{ row.last_rows }} 行
              </span>
            </span>
            <span v-else style="color: var(--color-text-placeholder)">—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <PermissionButton v-if="row.push_type === 'db_snapshot' || !['api_expose', 'db_realtime'].includes(row.push_type)" :menu="permissionMenu" op="C" size="small" type="primary"
              :loading="running === row.id" @click="runNow(row)">
              <el-icon><VideoPlay /></el-icon>{{ row.push_type === 'db_snapshot' ? '立即同步' : '立即推送' }}
            </PermissionButton>
            <el-button size="small" style="margin-left: 8px"
              @click="historyTarget = row">历史</el-button>
            <PermissionButton :menu="permissionMenu" op="U" size="small" style="margin-left: 8px"
              @click="dialogRef?.open(row)">
              <el-icon><Edit /></el-icon>
            </PermissionButton>
            <PermissionButton :menu="permissionMenu" op="D" size="small" type="danger" style="margin-left: 8px"
              @click="remove(row)">
              <el-icon><Delete /></el-icon>
            </PermissionButton>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="orphanDialogVisible" title="孤儿 Schema 检查" width="760px">
      <el-table v-loading="orphanLoading" :data="orphans" stripe>
        <el-table-column prop="schema" label="Schema" min-width="300" />
        <el-table-column prop="object_count" label="对象数" width="100" />
        <el-table-column label="状态" min-width="180">
          <template #default="{ row }">
            <el-tag :type="row.safe_to_delete ? 'warning' : 'success'">
              {{ row.safe_to_delete ? '未被引用' : '仍被引用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="reason" label="说明" min-width="180" />
      </el-table>
      <el-empty v-if="!orphanLoading && !orphans.length" description="未发现孤儿 Schema" />
    </el-dialog>

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
      :source-columns="sourceColumns"
      @done="load"
    />
  </div>
</template>


<style scoped>
.push-target-list { display: grid; gap: 12px; }
.push-list-header, .push-list-toolbar { display: flex; align-items: center; justify-content: flex-end; gap: 12px; }
.push-summary { color: var(--color-text-secondary); font-size: 12px; }
.push-table-wrap { min-width: 0; overflow-x: auto; }
.is-compact :deep(.el-empty) { padding: 18px 0; }
@media (max-width: 900px) { .push-list-header, .push-list-toolbar { align-items: flex-start; flex-direction: column; } }
</style>
