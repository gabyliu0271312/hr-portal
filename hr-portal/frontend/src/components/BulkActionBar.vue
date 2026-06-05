<script setup lang="ts">
import { computed } from 'vue'
import { useUserStore } from '@/stores/user'
import type { ColumnInfo } from '@/api/data'

const props = defineProps<{
  selectedRows: Record<string, any>[]
  statusCol: ColumnInfo | undefined
  tableCode: string
}>()

const emit = defineEmits<{
  bulkStatus: [val: string]
  bulkDelete: []
  clear: []
}>()

const userStore = useUserStore()
const canUpdate = computed(() => userStore.hasOp('data.view', 'U'))
const canDelete = computed(() => userStore.hasOp('data.view', 'D'))

// 操作条整体可见条件：勾选了行 且 至少有一个按钮可显示
const visible = computed(() =>
  props.selectedRows.length > 0 && (
    (!!props.statusCol && canUpdate.value) || canDelete.value
  )
)
</script>

<template>
  <div
    v-if="visible"
    style="
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
      padding: 8px 14px;
      background: var(--el-color-primary-light-9, #ecf5ff);
      border-radius: 6px;
    "
  >
    <span style="font-size: 13px">已选 {{ selectedRows.length }} 行：</span>

    <!-- 批量改状态：有 statusCol 且有 U 权限 -->
    <template v-if="statusCol && canUpdate">
      <el-button
        v-for="opt in (statusCol.enum_options || [])"
        :key="opt"
        size="small"
        :type="opt === '停用' ? 'warning' : 'primary'"
        @click="emit('bulkStatus', opt)"
      >
        批量设为{{ opt }}
      </el-button>
    </template>

    <!-- 批量删除：有 D 权限 -->
    <el-popconfirm
      v-if="canDelete"
      :title="`确认删除选中的 ${selectedRows.length} 行？此操作不可恢复。`"
      confirm-button-text="确认删除"
      cancel-button-text="取消"
      confirm-button-type="danger"
      @confirm="emit('bulkDelete')"
    >
      <template #reference>
        <el-button size="small" type="danger" plain>批量删除</el-button>
      </template>
    </el-popconfirm>

    <el-button size="small" link @click="emit('clear')">取消选择</el-button>
  </div>
</template>
