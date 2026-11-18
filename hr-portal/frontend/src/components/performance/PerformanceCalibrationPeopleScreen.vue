<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PerformanceCalibrationPerson } from '@/api/performance'
import UiFullScreenModal from '@/components/ui/UiFullScreenModal.vue'
import UiSurface from '@/components/ui/UiSurface.vue'
import PerformanceManagementTable from './PerformanceManagementTable.vue'
import PerformanceListToolbar from './PerformanceListToolbar.vue'
import PerformancePersonSelect from './PerformancePersonSelect.vue'
import PerformancePopover from './PerformancePopover.vue'
import UiButton from '@/components/ui/UiButton.vue'

const props = defineProps<{ people: PerformanceCalibrationPerson[] }>()
const emit = defineEmits<{ close: [] }>()
const keyword = ref('')
const query = ref('')
const page = ref(1)
const pageSize = ref(10)
const filterAnchor = ref<HTMLElement | null>(null)
const filterOpen = ref(false)
const selected = ref<string[]>([])
const applied = ref<string[]>([])
const filtered = computed(() => props.people.filter(person => (!query.value || `${person.display_name} ${person.employee_no}`.toLowerCase().includes(query.value.toLowerCase())) && (!applied.value.length || applied.value.includes(person.employee_no))))
const rows = computed(() => filtered.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const columns = [
  { key: 'display_name', label: '姓名', width: 312, fixed: 'left' as const },
  { key: 'direct_supervisor_name', label: '直属上级', width: 312 },
  { key: 'dotted_supervisor_name', label: '虚线上级', width: 312 },
  { key: 'department', label: '一级部门', width: 312 },
  { key: 'leaf_department', label: '末级部门', width: 312 },
  { key: 'job_family', label: '序列', width: 312 },
  { key: 'job_category', label: '子序列', width: 312 },
  { key: 'standard_position', label: '职务', width: 312 },
]
function search() { query.value = keyword.value.trim(); page.value = 1 }
function openFilter() {
  filterAnchor.value = document.querySelector<HTMLElement>('.calibration-people-screen .filter-button')
  selected.value = [...applied.value]
  filterOpen.value = !filterOpen.value
}
function apply() { applied.value = [...selected.value]; page.value = 1; filterOpen.value = false }
</script>

<template>
  <UiFullScreenModal class="calibration-people-screen" title="人员列表" :show-footer="false" content-scroll="page" @back="emit('close')">
    <template #subtitle>符合条件的员工，共计 {{ people.length }} 人</template>
    <div class="calibration-people-page">
      <UiSurface radius="all" min-width="0" padding="24px">
        <PerformanceListToolbar v-model:keyword="keyword" search-placeholder="搜索成员" search-aria-label="搜索成员" search-fill @search="search" @clear="search" @filter="openFilter" />
        <PerformanceManagementTable class="calibration-people-table" :rows="rows" :columns="columns" :loading="false" loading-text="正在加载人员…" empty-text="暂无符合条件的员工" table-aria-label="未分配校准人员列表" pagination-aria-label="人员列表分页" row-key="employee_no" scroll-mode="page" :page="page" :page-size="pageSize" :total="filtered.length" @page-change="page = $event" @page-size-change="pageSize = $event; page = 1" />
      </UiSurface>
    </div>
    <PerformancePopover :visible="filterOpen" :anchor="filterAnchor" :width="348" role="dialog" name="calibration-people-filter" @close="filterOpen = false">
      <form class="calibration-people-filter-form" @submit.prevent="apply"><label>姓名</label><PerformancePersonSelect v-model="selected" :options="people.map(person => ({ value: person.employee_no, label: person.display_name }))" multiple :remote-search="false" placeholder="全部" aria-label="筛选人员" /><div><UiButton variant="link" @click="selected = []">清除</UiButton><UiButton size="small" @click="filterOpen = false">取消</UiButton><UiButton variant="primary" size="small" type="submit">确定</UiButton></div></form>
    </PerformancePopover>
  </UiFullScreenModal>
</template>

<style scoped>
.calibration-people-screen{width:100vw;right:auto;z-index:calc(var(--z-index-drawer) + 1);--ui-fullscreen-background:var(--ui-page-background);--performance-fullscreen-content-bottom-space:0px}
.calibration-people-page{width:100%;min-width:0;padding:20px;box-sizing:border-box}
.calibration-people-table{margin-top:0}
.calibration-people-screen :deep(.full-screen-modal-header){padding-left:20px;border-bottom:1px solid var(--color-line-header)}
.calibration-people-screen :deep(.full-screen-modal-header-subtitle){color:var(--performance-text-secondary);font-size:14px;font-weight:400}
.calibration-people-filter-form>label{display:block;margin-bottom:8px;font-weight:600}
.calibration-people-filter-form>div:last-child{display:flex;justify-content:flex-end;gap:12px;margin-top:20px}
</style>
<style>.calibration-people-filter{z-index:calc(var(--z-index-drawer) + 3)}</style>
