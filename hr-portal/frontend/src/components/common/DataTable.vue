<template>
  <div class="data-table" :class="{ 'is-fill-viewport': fillViewport }">
    <div v-if="$slots.toolbar" class="data-table__toolbar">
      <slot name="toolbar" />
    </div>
    <div class="data-table__shell">
      <el-table
        v-loading="loading"
        :data="data"
        stripe
        style="width: 100%"
        :height="fillViewport ? '100%' : undefined"
        :max-height="fillViewport ? undefined : (maxHeight ?? 600)"
        empty-text="暂无数据"
      >
        <el-table-column
          v-for="col in columns"
          :key="col.prop ?? col.label"
          :prop="col.prop"
          :label="col.label"
          :min-width="col.minWidth"
          :width="col.width"
          :fixed="col.fixed"
        >
          <template #default="{ row }">
            <template v-if="row">
              <slot v-if="col.slot" :name="col.slot" :row="row"><span>{{ col.prop ? (row[col.prop] ?? '--') : '--' }}</span></slot>
              <span v-else-if="col.prop">{{ row[col.prop] ?? '--' }}</span>
            </template>
          </template>
        </el-table-column>
        <template #empty>
          <slot name="empty">
            <div class="data-table__empty">{{ emptyText }}</div>
          </slot>
        </template>
      </el-table>
    </div>
    <el-pagination
      v-if="total !== undefined"
      class="data-table__pagination"
      :current-page="page"
      :page-size="pageSize"
      :total="total"
      :page-sizes="pageSizes ?? [20, 50, 100]"
      layout="total, sizes, prev, pager, next"
      @current-change="(v: number) => emit('update:page', v)"
      @size-change="(v: number) => emit('update:pageSize', v)"
    />
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  columns: Array<{
    prop?: string
    label: string
    minWidth?: number | string
    width?: number | string
    fixed?: 'left' | 'right'
    slot?: string
  }>
  data: Record<string, any>[]
  loading?: boolean
  emptyText?: string
  fillViewport?: boolean
  maxHeight?: number | string
  total?: number
  page?: number
  pageSize?: number
  pageSizes?: number[]
}>(), {
  loading: false,
  emptyText: '暂无数据',
  fillViewport: false,
  total: undefined,
  page: 1,
  pageSize: 20,
  pageSizes: undefined,
})

const emit = defineEmits<{
  'update:page': [v: number]
  'update:pageSize': [v: number]
}>()

defineSlots<{
  toolbar?: () => any
  empty?: () => any
  [name: string]: any
}>()
</script>

<style scoped>
.data-table { display: flex; flex-direction: column; flex: 1 1; min-width: 0; min-height: 0; }
.data-table__toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: var(--page-gap-toolbar-items); margin-bottom: var(--page-gap-toolbar-table); }
.data-table__shell { flex: 1 1; min-width: 0; min-height: 0; overflow-x: auto; }
.data-table.is-fill-viewport .data-table__shell { overflow: hidden; }
.data-table__empty { padding: 32px 0; color: var(--color-text-placeholder); font-size: 13px; }
.data-table__pagination { flex: 0 0 auto; justify-content: flex-end; margin-top: var(--page-gap-table-pagination); }
</style>
