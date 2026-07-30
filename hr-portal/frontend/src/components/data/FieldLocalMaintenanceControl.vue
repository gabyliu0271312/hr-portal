<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { tableColumnsApi, type TableColumn } from '@/api/table_columns'

type MaintenanceColumn = Pick<
  TableColumn,
  'id' | 'column_code' | 'column_label' | 'auto_discovered' | 'is_pk_part' | 'is_computed'
>

const props = defineProps<{
  tableName: string
  column: MaintenanceColumn
  canManage: boolean
}>()

const emit = defineEmits<{ updated: [column: TableColumn] }>()
const loading = ref(false)

const unavailableReason = computed(() => {
  if (props.column.is_pk_part) return '业务主键字段不能改为手工字段'
  if (props.column.is_computed) return '计算字段不能改为手工字段'
  if (!props.canManage) return '暂无字段维护权限'
  return ''
})

async function enableLocalMaintenance() {
  try {
    await ElMessageBox.confirm(
      `字段“${props.column.column_label}”切换后将完全由人工维护：可在数据视图编辑，后续系统同步不会覆盖该字段。此操作不可恢复，确认继续吗？`,
      '改为手工字段',
      { type: 'warning', confirmButtonText: '确认修改', cancelButtonText: '取消' },
    )
  } catch {
    return
  }

  loading.value = true
  try {
    const column = await tableColumnsApi.enableLocalMaintenance(props.tableName, props.column.id)
    ElMessage.success('字段已改为手工字段')
    emit('updated', column)
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.detail || '改为手工字段失败')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div style="display: flex; align-items: center; gap: 6px">
    <el-tag v-if="!column.auto_discovered" size="small" type="success" effect="plain">手工字段</el-tag>
    <template v-else>
      <el-tag size="small" type="info" effect="plain">系统同步</el-tag>
      <el-tooltip v-if="unavailableReason" :content="unavailableReason">
        <el-button text size="small" disabled>改为手工字段</el-button>
      </el-tooltip>
      <el-button v-else text size="small" type="primary" :loading="loading" @click="enableLocalMaintenance">
        改为手工字段
      </el-button>
    </template>
  </div>
</template>
