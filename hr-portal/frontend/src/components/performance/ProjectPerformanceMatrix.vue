<template>
  <PerformanceSurfaceCard ref="rootEl" class="project-matrix" role="region" aria-label="矩阵分析">
    <div v-if="loading" class="matrix-state">正在加载矩阵分析…</div>
    <div v-else-if="error" class="matrix-state matrix-state-error">
      <p>{{ error }}</p>
      <button type="button" @click="load">重新加载</button>
    </div>
    <template v-else>
      <header class="matrix-toolbar">
        <div class="matrix-scope-tabs" role="tablist" aria-label="人员范围">
          <button type="button" class="matrix-scope-tab active" role="tab" aria-selected="true">
            <span>全部</span>
            <span>({{ matrix.completed_count }}/{{ matrix.total }})</span>
          </button>
          <button type="button" class="matrix-more" disabled aria-label="更多人员范围">更多⌄</button>
        </div>
        <button type="button" class="matrix-filter" disabled aria-label="筛选"><svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 11.431V21a1 1 0 1 1-2 0V11c0-.147.032-.287.089-.412a.96.96 0 0 1 .4-.467L20 6.83V4H4v2.866l5.345 3.195A1 1 0 0 1 10 11v6.5a1 1 0 1 1-2 0v-6.035c-.477-.285-3.369-1.867-4.957-2.735A2 2 0 0 1 2 6.975V4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v2.945a2 2 0 0 1-1.035 1.752L16 11.43Z" fill="currentColor" /></svg><span>筛选</span></button>
      </header>

      <section class="matrix-block pending-block">
        <h3 class="matrix-title">待完成评估 <span>（{{ matrix.pending_count }} 人）</span></h3>
        <div class="matrix-table-wrap">
          <table class="matrix-table pending-table pending-header-table">
            <colgroup><col class="pending-level-col" /><col class="pending-people-col" /></colgroup>
            <thead><tr><th class="sticky-level">职级</th><th>被评估人</th></tr></thead>
          </table>
          <table class="matrix-table pending-table pending-body-table">
            <colgroup><col class="pending-level-col" /><col class="pending-people-col" /></colgroup>
            <tbody>
              <tr aria-hidden="true" class="matrix-measure-row"><td></td><td></td></tr>
              <tr v-if="!matrix.pending_rows.length"><td colspan="2" class="matrix-empty">--</td></tr>
              <tr v-for="row in matrix.pending_rows" :key="`pending-${row.level}`">
                <td class="level-cell sticky-level">{{ row.level }}</td>
                <td><PeopleCell :people="row.cells.pending?.people || []" :expanded="isExpanded(`pending-${row.level}`)" @toggle="toggle(`pending-${row.level}`)" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="matrix-block completed-block">
        <div class="completed-heading">
          <h3 class="matrix-title">已完成评估 <span>（{{ matrix.completed_count }} 人）</span></h3>
          <div class="matrix-selects">
            <label class="matrix-select">评估维度：绩效评级</label>
            <label class="matrix-display-select">
              <span class="sr-only">展示方式</span>
              <PerformanceSearchSelect :model-value="displayMode" :options="[{ value: 'name', label: '展示方式：人员姓名' }, { value: 'count', label: '展示方式：人员数量' }]" selection-style="plain" aria-label="展示方式" @update:model-value="displayMode = $event === 'count' ? 'count' : 'name'" />
            </label>
          </div>
        </div>
        <div class="matrix-table-wrap completed-table-wrap">
          <table class="matrix-table completed-table completed-header-table">
            <colgroup>
              <col class="completed-level-col" />
              <col v-for="rating in matrix.ratings" :key="rating.key" class="completed-rating-col" />
            </colgroup>
            <thead>
              <tr>
                <th class="sticky-level">职级</th>
                <th v-for="rating in matrix.ratings" :key="rating.key">
                  <span class="rating-chip" :style="ratingStyle(rating)">{{ rating.label }}</span>
                </th>
              </tr>
            </thead>
          </table>
          <table class="matrix-table completed-table completed-body-table">
            <colgroup>
              <col class="completed-level-col" />
              <col v-for="rating in matrix.ratings" :key="rating.key" class="completed-rating-col" />
            </colgroup>
            <tbody>
              <tr aria-hidden="true" class="matrix-measure-row"><td></td><td v-for="rating in matrix.ratings" :key="rating.key"></td></tr>
              <tr v-if="!matrix.completed_rows.length"><td :colspan="Math.max(matrix.ratings.length + 1, 2)" class="matrix-empty">暂无最终绩效评级</td></tr>
              <tr v-for="row in matrix.completed_rows" :key="`completed-${row.level}`">
                <td class="level-cell sticky-level">{{ row.level }}</td>
                <td v-for="rating in matrix.ratings" :key="rating.key" class="rating-cell">
                  <template v-if="row.cells[rating.key]?.count">
                    <span v-if="displayMode === 'count'" class="count-value">{{ row.cells[rating.key].count }}</span>
                    <PeopleCell v-else :people="row.cells[rating.key].people" :expanded="isExpanded(`completed-${row.level}-${rating.key}`)" @toggle="toggle(`completed-${row.level}-${rating.key}`)" />
                  </template>
                  <span v-else class="matrix-zero">--</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </PerformanceSurfaceCard>
</template>

<script setup lang="ts">
import PerformanceSearchSelect from './PerformanceSearchSelect.vue'
import { nextTick, onMounted, ref, watch } from 'vue'
import { projectManagementApi, type ProjectMatrix, type ProjectMatrixRating } from '@/api/performance'
import PerformanceSurfaceCard from './PerformanceSurfaceCard.vue'
import { performanceLevelBackground } from './performanceColorOptions'

const props = defineProps<{ projectId: number }>()
const matrix = ref<ProjectMatrix>({ source: 'template_final_result', dimension: 'rating', display_modes: ['name', 'count'], total: 0, completed_count: 0, pending_count: 0, ratings: [], pending_rows: [], completed_rows: [] })
const loading = ref(false)
const error = ref('')
const displayMode = ref<'name' | 'count'>('name')
const expanded = ref(new Set<string>())
const rootEl = ref<HTMLElement | null>(null)

function syncColumnWidths() {
  // 表头表体分离后，两表各自按内容定宽会错位；用表体实测列宽回填两表 colgroup，保证对齐。
  const target = rootEl.value
  const root = target instanceof Element ? target : (target as { $el?: Element } | null)?.$el
  if (!root) return
  const pairs = [
    ['.pending-header-table', '.pending-body-table'],
    ['.completed-header-table', '.completed-body-table'],
  ] as const
  for (const [headerSel, bodySel] of pairs) {
    const header = root.querySelector<HTMLTableElement>(headerSel)
    const body = root.querySelector<HTMLTableElement>(bodySel)
    if (!header || !body) continue
    const headerCols = Array.from(header.querySelectorAll('col'))
    const bodyCols = Array.from(body.querySelectorAll('col'))
    if (!headerCols.length || headerCols.length !== bodyCols.length) continue
    const colCount = headerCols.length
    const firstRow = body.querySelector('tbody tr')
    const widths: number[] = []
    for (let i = 0; i < colCount; i++) {
      const th = header.querySelectorAll('thead th')[i]
      const td = firstRow?.querySelectorAll('td')[i]
      const measured = Math.max(
        th ? th.getBoundingClientRect().width : 0,
        td ? td.getBoundingClientRect().width : 0,
      )
      widths.push(measured > 0 ? measured : (i === 0 ? 100 : 108))
    }
    headerCols.forEach((col, i) => { col.style.width = `${widths[i]}px` })
    bodyCols.forEach((col, i) => { col.style.width = `${widths[i]}px` })
    body.style.width = `${widths.reduce((a, b) => a + b, 0)}px`
    header.style.width = body.style.width
  }
}

async function load() {
  if (!props.projectId) return
  loading.value = true
  error.value = ''
  try {
    matrix.value = await projectManagementApi.matrix(props.projectId)
    expanded.value = new Set()
  } catch {
    error.value = '矩阵分析加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
  await nextTick()
  syncColumnWidths()
}

function toggle(key: string) {
  const next = new Set(expanded.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expanded.value = next
  nextTick(syncColumnWidths)
}

function isExpanded(key: string) {
  return expanded.value.has(key)
}

function ratingStyle(rating: ProjectMatrixRating) {
  const color = rating.color || '#646a73'
  return { '--rating-color': color, '--rating-bg': performanceLevelBackground(color) }
}

onMounted(load)
watch(() => props.projectId, load)
watch(displayMode, () => nextTick(syncColumnWidths))
</script>

<script lang="ts">
import { defineComponent, h } from 'vue'
import type { ProjectMatrixPerson } from '@/api/performance'

const PeopleCell = defineComponent({
  name: 'PeopleCell',
  props: {
    people: { type: Array as () => ProjectMatrixPerson[], default: () => [] },
    expanded: { type: Boolean, default: false },
  },
  emits: ['toggle'],
  setup(props, { emit }) {
    return () => h('div', { class: ['people-cell', { expanded: props.expanded }] }, [
      h('div', { class: 'people-list' }, props.people.map(person => h('span', { class: 'person-name matrix-user-block', key: person.employee_no, title: person.display_name }, person.display_name))),
      props.people.length > 6 ? h('button', { type: 'button', class: 'people-toggle', 'aria-label': props.expanded ? '收起人员' : '展开人员', onClick: () => emit('toggle') }, props.expanded ? '收起' : '展开') : null,
    ])
  },
})

export default { components: { PeopleCell } }
</script>

<style scoped>
.project-matrix.surface-card { display: block; flex: none; padding: 0 20px 20px; }
.matrix-toolbar { position: sticky; top: 0; z-index: 4; display: flex; align-items: center; justify-content: space-between; min-height: 72px; background: #fff; }
.matrix-scope-tabs { display: flex; align-items: center; min-width: 0; }
.matrix-scope-tab { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 16px; border: 1px solid #3370ff; border-radius: 6px 0 0 6px; background: #e1eaff; color: #3370ff; font-size: 14px; font-weight: 500; cursor: pointer; }
.matrix-more, .matrix-filter { height: 32px; padding: 0 14px; border: 1px solid #d0d3d6; border-radius: 6px; background: #fff; color: #646a73; font-size: 14px; }
.matrix-more { margin-left: 8px; }
.matrix-filter { display: inline-flex; align-items: center; gap: 6px; }
.matrix-filter:disabled, .matrix-more:disabled { opacity: 1; cursor: default; }
.matrix-block { min-width: 0; }
.completed-block { margin-top: 24px; }
.matrix-title { margin: 0 0 12px; padding-left: 8px; font-size: 16px; font-weight: 600; line-height: 24px; }
.matrix-title span { font-weight: 600; }
.completed-heading { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin: 24px 0 12px; }
.completed-heading .matrix-title { margin: 0; }
.matrix-selects { display: flex; align-items: center; gap: 24px; }
.matrix-select { display: inline-flex; align-items: center; height: 32px; min-width: 170px; padding: 0 10px; border: 1px solid #d0d3d6; border-radius: 6px; color: #646a73; font-size: 14px; white-space: nowrap; }
.matrix-select select { width: 100%; border: 0; outline: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; }
.matrix-table-wrap { overflow-x: auto; border: 1px solid #eff0f1; border-radius: 6px; }
.matrix-table { width: 100%; min-width: 760px; border-collapse: separate; border-spacing: 0; font-size: 14px; }
.matrix-table th, .matrix-table td { border-right: 1px solid #eff0f1; border-bottom: 1px solid #eff0f1; text-align: left; vertical-align: top; }
.matrix-table th:last-child, .matrix-table td:last-child { border-right: 0; }
.matrix-table tbody tr:last-child td { border-bottom: 0; }
.matrix-table th { height: 49px; padding: 0 12px; background: #f5f6f7; color: #646a73; font-weight: 500; vertical-align: middle; }
.matrix-table td { min-height: 55px; padding: 12px; line-height: 22px; }
.pending-level-col, .completed-level-col { width: 100px; }
.pending-people-col { width: auto; }
.completed-rating-col { width: auto; }
.completed-rating-col .rating-chip { white-space: nowrap; }
.matrix-measure-row td { height: 0; padding: 0; border-width: 0 0 1px 0; overflow: hidden; visibility: hidden; }
.sticky-level { position: sticky; left: 0; z-index: 2; background: #f5f6f7; box-shadow: 1px 0 0 #eff0f1; }
.matrix-header-table thead .sticky-level { z-index: 4; background: #f5f6f7; }
.matrix-table tbody .level-cell { background: #f5f6f7; }
.level-cell { color: #1f2329; font-weight: 500; white-space: nowrap; }
.people-cell { position: relative; max-height: 156px; overflow: hidden; }
.people-cell.expanded { max-height: none; }
.people-cell :deep(.people-list) { display: flex; flex-wrap: wrap; gap: 0 10px; align-items: flex-start; }
.people-cell :deep(.person-name) { min-width: 0; min-height: 0; max-width: 100%; box-sizing: border-box; padding: 0; border: 0; background: transparent; font-family: LarkHackSafariFont, LarkEmojiFont, LarkChineseQuote, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Tahoma, "PingFang SC", "Microsoft Yahei", Arial, "Hiragino Sans GB", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"; font-size: 14px; font-weight: 400; line-height: 22px; text-align: left; word-break: keep-all; color: #1f2329; list-style-type: none; cursor: pointer; }
.people-cell :deep(.person-name:hover) { color: #4e83fd; }
.people-cell :deep(.people-toggle) { position: absolute; right: 0; bottom: 0; width: 59px; height: 23px; padding-left: 14px; border: 0; background: linear-gradient(to right, rgba(255,255,255,0), #fff 20%, #fff); color: #4e83fd; font: inherit; cursor: pointer; text-align: left; }
.people-cell.expanded :deep(.people-toggle) { position: static; width: auto; height: auto; padding: 0; margin-left: 8px; background: transparent; }
.rating-chip { display: inline-flex; align-items: center; justify-content: center; min-width: 44px; height: 24px; padding: 0 10px; border-radius: 9999px; background: var(--rating-bg); color: #1f2329; font-family: LarkHackSafariFont, LarkEmojiFont, LarkChineseQuote, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Tahoma, "PingFang SC", "Microsoft Yahei", Arial, "Hiragino Sans GB", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"; font-size: 14px; font-weight: 400; line-height: 22px; }
.rating-cell { min-height: 57px; }
.count-value { display: block; color: #1f2329; font-variant-numeric: tabular-nums; text-align: center; }
.matrix-zero, .matrix-empty { color: #8f959e; }
.matrix-empty { padding: 20px !important; text-align: center !important; }
.matrix-state { display: grid; place-items: center; min-height: 220px; color: #646a73; }
.matrix-state-error { color: #d14343; }
.matrix-state-error button { padding: 6px 18px; border: 0; border-radius: 6px; background: #3370ff; color: #fff; cursor: pointer; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
@media (max-width: 900px) { .completed-heading { align-items: flex-start; flex-direction: column; } .matrix-selects { width: 100%; } }
.matrix-display-select { width: 200px; min-width: 0; }
</style>
