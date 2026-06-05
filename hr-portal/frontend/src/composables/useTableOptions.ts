import { ref, onMounted } from 'vue'
import { adminTablesApi } from '@/api/admin_tables'

export interface TableOption {
  value: string
  label: string
}

export function useTableOptions() {
  const tables = ref<TableOption[]>([])
  const loading = ref(false)

  async function load() {
    loading.value = true
    try {
      const all = await adminTablesApi.list()
      tables.value = all.map((t) => ({ value: t.table_name, label: t.table_label }))
    } finally {
      loading.value = false
    }
  }

  onMounted(load)

  return { tables, loading, reload: load }
}
