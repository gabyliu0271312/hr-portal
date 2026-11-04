<template>
  <div class="ui-pagination" :aria-label="ariaLabel">
    <ul class="pagination-list">
      <li>
        <button class="pagination-arrow" type="button" aria-label="上一页" :disabled="page <= 1" @click="changePage(page - 1)">
          <svg viewBox="0 0 24 24" aria-hidden="true" data-icon="LeftBoldOutlined"><path d="m16.314 3.515-.707-.707a1 1 0 0 0-1.414 0l-7.779 7.778a2 2 0 0 0 0 2.829l7.779 7.778a1 1 0 0 0 1.414 0l.707-.707a1 1 0 0 0 0-1.414L9.243 12l7.07-7.072a1 1 0 0 0 0-1.414Z" fill="currentColor" /></svg>
        </button>
      </li>
      <template v-for="item in pageItems" :key="item.type === 'page' ? `page-${item.page}` : item.key">
        <li v-if="item.type === 'jump'" class="pagination-ellipsis" aria-hidden="true">…</li>
        <li v-else>
          <button class="page-number" :class="{ current: item.page === page }" type="button" :aria-current="item.page === page ? 'page' : undefined" :aria-label="`第 ${item.page} 页`" @click="changePage(item.page)">{{ item.page }}</button>
        </li>
      </template>
      <li>
        <button class="pagination-arrow" type="button" aria-label="下一页" :disabled="page >= pageCount" @click="changePage(page + 1)">
          <svg viewBox="0 0 24 24" aria-hidden="true" data-icon="RightBoldOutlined"><path d="m7.586 20.486.707.707a1 1 0 0 0 1.414 0l7.778-7.778a2 2 0 0 0 0-2.829L9.707 2.808a1 1 0 0 0-1.414 0l-.707.707a1 1 0 0 0 0 1.414l7.07 7.072-7.07 7.07a1 1 0 0 0 0 1.415Z" fill="currentColor" /></svg>
        </button>
      </li>
    </ul>
    <el-select popper-class="ui-pagination-size-popper" class="page-size-select" :model-value="pageSize" :suffix-icon="ArrowDown" size="small" aria-label="每页条数" @change="emit('page-size-change', $event)">
      <el-option v-for="size in sizes" :key="size" :label="`${size} 条/页`" :value="size" />
    </el-select>
    <span v-if="showJump" class="pagination-jump">跳至 <input v-model="jumpText" class="pagination-jump-input" type="text" inputmode="numeric" aria-label="跳至页码" @keyup.enter="jumpToPage" @blur="jumpToPage" /> 页</span>
  </div>
</template>

<script setup lang="ts">
import { ElOption, ElSelect } from 'element-plus'
import { ArrowDown } from '@element-plus/icons-vue'
import { computed, ref } from 'vue'

/**
 * UiPagination —— 全局分页组件（REA 绩效线 ud__pagination 实测规格）。
 *
 * - 高 28、页码 28×28 圆角 6、激活页白底 + --ui-pagination-active-color(#1456f0)
 * - 箭头白底描边 #d0d3d6、禁用 #bbbfc4、容量选择、可选跳页
 * - 只负责内容行；外边距 / 对齐（左或右）由使用方的布局容器决定（REA 组件与布局解耦）
 */
const props = withDefaults(defineProps<{
  page: number
  pageSize: number
  total?: number
  ariaLabel?: string
  sizes?: number[]
  showJump?: boolean
}>(), {
  total: 0,
  ariaLabel: '分页',
  sizes: () => [10, 20, 50, 100],
  showJump: true,
})

const emit = defineEmits<{
  'page-change': [page: number]
  'page-size-change': [pageSize: number]
}>()

const totalCount = computed(() => props.total)
const pageCount = computed(() => Math.max(1, Math.ceil(totalCount.value / props.pageSize)))

function changePage(page: number) {
  if (page >= 1 && page <= pageCount.value && page !== props.page) emit('page-change', page)
}

const jumpText = ref('')
type PageItem = { type: 'page'; page: number } | { type: 'jump'; key: string }
const pageItems = computed<PageItem[]>(() => {
  const count = pageCount.value
  const current = Math.min(Math.max(props.page, 1), count)
  const pages = new Set<number>([1, count, current])
  if (count <= 7) {
    for (let index = 1; index <= count; index += 1) pages.add(index)
  } else if (current <= 4) {
    ;[2, 3, 4, 5].forEach(page => pages.add(page))
  } else if (current >= count - 3) {
    ;[count - 4, count - 3, count - 2, count - 1].forEach(page => pages.add(page))
  } else {
    ;[current - 1, current + 1].forEach(page => pages.add(page))
  }
  const ordered = [...pages].filter(page => page >= 1 && page <= count).sort((left, right) => left - right)
  const items: PageItem[] = []
  ordered.forEach((page, index) => {
    if (index > 0 && page - ordered[index - 1] > 1) items.push({ type: 'jump', key: `jump-${page}` })
    items.push({ type: 'page', page })
  })
  return items
})

function jumpToPage() {
  const value = Number(jumpText.value)
  jumpText.value = ''
  if (!Number.isFinite(value)) return
  changePage(Math.min(Math.max(Math.trunc(value), 1), pageCount.value))
}
</script>

<style scoped>
.ui-pagination {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ui-pagination-group-gap);
  color: var(--ui-pagination-color);
  font-size: var(--font-size-md);
}
.pagination-list { display: flex; align-items: center; gap: var(--ui-pagination-item-gap); margin: 0; padding: 0; list-style: none; }
.pagination-arrow, .page-number, .pagination-ellipsis {
  min-width: var(--ui-pagination-item-size);
  height: var(--ui-pagination-height);
  display: inline-grid;
  place-items: center;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--ui-pagination-item-radius);
  background: transparent;
  color: var(--ui-pagination-color);
  font: inherit;
}
.pagination-arrow { border-color: var(--ui-pagination-arrow-border); background: var(--ui-pagination-arrow-background); }
.pagination-arrow svg { width: var(--ui-pagination-arrow-icon-size); height: var(--ui-pagination-arrow-icon-size); }
.pagination-arrow:disabled { color: var(--ui-pagination-disabled-color); cursor: not-allowed; }
.page-number { cursor: pointer; }
.page-number:hover { background: var(--ui-pagination-hover-background); }
.page-number.current { border-color: var(--ui-pagination-active-color); color: var(--ui-pagination-active-color); font-weight: 600; }
.page-size-select { width: var(--ui-pagination-select-width); }
.pagination-jump { display: inline-flex; align-items: center; gap: var(--ui-pagination-item-gap); color: var(--ui-pagination-color); }
.pagination-jump-input {
  width: var(--ui-pagination-jump-input-width);
  height: var(--ui-pagination-height);
  padding: 0 6px;
  border: 1px solid var(--ui-pagination-arrow-border);
  border-radius: var(--ui-pagination-item-radius);
  box-sizing: border-box;
  font: inherit;
  text-align: center;
}
</style>
