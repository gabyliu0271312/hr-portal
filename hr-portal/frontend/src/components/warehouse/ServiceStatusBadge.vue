<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ status: string }>()

const STATUS_MAP: Record<string, { label: string; type: '' | 'success' | 'warning' | 'info' | 'danger' }> = {
  draft:    { label: '草稿', type: 'info' },
  enabled:  { label: '已启用', type: 'success' },
  disabled: { label: '已停用', type: 'warning' },
  error:    { label: '异常', type: 'danger' },
  paused:   { label: '已暂停', type: 'warning' },
  expired:  { label: '已过期', type: 'info' },
  success:  { label: '成功', type: 'success' },
  failed:   { label: '失败', type: 'danger' },
  partial:  { label: '部分成功', type: 'warning' },
  pending:  { label: '待执行', type: 'info' },
}

const info = computed(() => STATUS_MAP[props.status] || { label: props.status, type: 'info' as const })
</script>

<template>
  <el-tag :type="info.type" size="small">{{ info.label }}</el-tag>
</template>
