<script setup lang="ts">
import { ref } from 'vue'
import PerformanceButton from './PerformanceButton.vue'
import PerformanceExportIcon from './PerformanceExportIcon.vue'

const props = defineProps<{ loadRows: () => Promise<string[][]>; filename: string; disabled?: boolean }>()
const emit = defineEmits<{ success: []; error: [error: unknown] }>()
const exporting = ref(false)

function csvCell(value: string) {
  const safe = /^[\s\u0000-\u001f]*[=+\-@]/.test(value) ? `'${value}` : value
  return `"${safe.replace(/"/g, '""')}"`
}
async function exportRows() {
  if (props.disabled || exporting.value) return
  exporting.value = true
  let url: string | undefined
  let anchor: HTMLAnchorElement | undefined
  try {
    const rows = await props.loadRows()
    const csv = '﻿' + rows.map(row => row.map(csvCell).join(',')).join('\r\n')
    url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${props.filename.replace(/[\\/:*?"<>|]/g, '_')}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    emit('success')
  } catch (error) {
    emit('error', error)
  } finally {
    anchor?.remove()
    if (url) URL.revokeObjectURL(url)
    exporting.value = false
  }
}
</script>

<template>
  <PerformanceButton class="performance-export-button" aria-label="导出" :disabled="disabled" :loading="exporting" @click="exportRows"><PerformanceExportIcon /><span>导出</span></PerformanceButton>
</template>

<style scoped>
.performance-export-button svg { width: var(--font-size-md); height: var(--font-size-md); margin-right: var(--spacing-1); }
</style>
