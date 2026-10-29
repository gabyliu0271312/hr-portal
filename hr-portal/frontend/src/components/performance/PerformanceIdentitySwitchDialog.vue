<template>
  <PerformanceDialogShell :model-value="modelValue" title="切换绩效用户" width="560px" :loading="switching" @update:model-value="$emit('update:modelValue', $event)">
    <div class="switch-body">
      <el-alert type="warning" :closable="false" title="操作将按目标员工权限真实生效，不继承操作者的管理权限。原业务接收人及业务群始终禁投。" />
      <div v-if="favorites.length" class="favorite-list">
        <div v-for="person in favorites" :key="person.employee_no" class="favorite-row">
          <button class="favorite-person" type="button" :disabled="switching || savingFavorite" :title="`切换为 ${person.display_name}`" @click="switchTo(person)">
            <span class="favorite-person__name">{{ person.display_name }}</span>
            <span class="favorite-person__meta">{{ person.employee_no }}<template v-if="person.organization_label"> · {{ person.organization_label }}</template></span>
          </button>
          <PerformanceButton variant="text" size="small" :disabled="switching || savingFavorite" @click="removeFavorite(person)">删除</PerformanceButton>
        </div>
      </div>
      <p v-else-if="!adding" class="favorite-empty">暂无添加的用户，点击下方「+添加用户」添加</p>
      <div v-if="adding" class="favorite-row is-adding">
        <PerformancePersonSelect :model-value="selected" :options="options" :disabled="savingFavorite" aria-label="添加人员" placeholder="搜索姓名或员工编号" @search="searchPeople" @update:model-value="pickPerson" />
        <PerformanceButton variant="text" size="small" :disabled="savingFavorite" @click="cancelAdd">删除</PerformanceButton>
      </div>
      <p v-if="error" class="switch-error" role="alert">{{ error }}</p>
      <div class="add-action">
        <PerformanceButton variant="text" :disabled="adding || switching || savingFavorite" @click="startAdd">+添加用户</PerformanceButton>
      </div>
    </div>
    <template #footer>
      <div class="switch-actions">
        <PerformanceButton :disabled="switching" @click="$emit('update:modelValue', false)">取消</PerformanceButton>
      </div>
    </template>
  </PerformanceDialogShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import PerformanceButton from './PerformanceButton.vue'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformancePersonSelect from './PerformancePersonSelect.vue'
import { identitySwitchApi, type SwitchPerson } from '@/api/identitySwitch'
import { employeeSwitchSession, clearEmployeeSwitch, setEmployeeSwitch } from '@/stores/identitySwitch'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const router = useRouter()
const favorites = ref<SwitchPerson[]>([])
const people = ref<SwitchPerson[]>([])
const options = computed(() => people.value.map(person => ({ value: person.employee_no, label: personLabel(person) })))
const adding = ref(false)
const selected = ref<string | null>(null)
const switching = ref(false)
const savingFavorite = ref(false)
const error = ref('')
let searchTimer: ReturnType<typeof setTimeout> | undefined
let lastKeyword = ''

function personLabel(person: SwitchPerson) {
  return `${person.display_name} · ${person.employee_no}${person.organization_label ? ' · ' + person.organization_label : ''}`
}
function errorMessage(e: any, fallback: string) {
  const detail = e?.response?.data?.detail
  if (typeof detail === 'string') return detail
  return detail?.message || fallback
}
async function loadFavorites() {
  favorites.value = await identitySwitchApi.favorites()
}
async function loadPeople(keyword = '') {
  const result = await identitySwitchApi.people(keyword, 1)
  people.value = result.items
}
function searchPeople(keyword: string) {
  // 选项更新会触发重渲染并再次发出同一关键词，去重避免反复请求
  if (keyword === lastKeyword) return
  lastKeyword = keyword
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { void loadPeople(keyword).catch(() => { people.value = [] }) }, 300)
}
function startAdd() {
  adding.value = true
  selected.value = null
  lastKeyword = ''
  error.value = ''
}
function cancelAdd() {
  adding.value = false
  selected.value = null
}
async function pickPerson(value: string | string[] | null) {
  const employeeNo = typeof value === 'string' ? value : null
  if (!employeeNo || savingFavorite.value) return
  savingFavorite.value = true
  error.value = ''
  try {
    const saved = await identitySwitchApi.addFavorite(employeeNo)
    favorites.value = [...favorites.value.filter(person => person.employee_no !== saved.employee_no), saved]
    cancelAdd()
  } catch (e: any) {
    error.value = errorMessage(e, '添加人员失败，请重试')
  } finally {
    savingFavorite.value = false
  }
}
async function removeFavorite(person: SwitchPerson) {
  if (savingFavorite.value) return
  savingFavorite.value = true
  error.value = ''
  try {
    await identitySwitchApi.removeFavorite(person.employee_no)
    favorites.value = favorites.value.filter(item => item.employee_no !== person.employee_no)
  } catch (e: any) {
    error.value = errorMessage(e, '删除失败，请重试')
  } finally {
    savingFavorite.value = false
  }
}
async function switchTo(person: SwitchPerson) {
  if (switching.value) return
  switching.value = true
  error.value = ''
  try {
    const old = employeeSwitchSession.value
    clearEmployeeSwitch()
    if (old) await identitySwitchApi.end(old.session_id)
    const capability = await identitySwitchApi.capability()
    const session = await identitySwitchApi.create(person.employee_no, capability.generation)
    setEmployeeSwitch(session)
    emit('update:modelValue', false)
    await router.replace('/performance/workbench')
  } catch (e: any) {
    error.value = errorMessage(e, '切换失败，当前已恢复本人')
  } finally {
    switching.value = false
  }
}

watch(() => props.modelValue, open => {
  if (!open) return
  error.value = ''
  adding.value = false
  selected.value = null
  lastKeyword = ''
  void loadFavorites().catch((e: any) => { error.value = errorMessage(e, '常用人员加载失败，请重试') })
  void loadPeople().catch(() => { people.value = [] })
}, { immediate: true })
</script>

<style scoped>
.switch-body { display: flex; flex-direction: column; gap: var(--spacing-4); padding-bottom: var(--spacing-5); }
.favorite-list { display: flex; max-height: min(320px, calc(100vh - 360px)); flex-direction: column; gap: var(--spacing-2); overflow-y: auto; }
.favorite-row { display: flex; align-items: center; gap: var(--spacing-3); }
.favorite-row.is-adding > :first-child { flex: 1; width: auto; min-width: 0; }
.favorite-person { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 2px; padding: var(--spacing-3) var(--spacing-4); border: 1px solid var(--color-border); border-radius: var(--performance-control-radius); background: var(--color-bg-card); color: var(--color-text-primary); font: 400 var(--font-size-md)/22px var(--font-sans); text-align: left; cursor: pointer; }
.favorite-person:hover:not(:disabled) { border-color: var(--color-action-primary); background: var(--color-surface-disabled); }
.favorite-person:disabled { cursor: not-allowed; opacity: .6; }
.favorite-person__name { overflow: hidden; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.favorite-person__meta { overflow: hidden; color: var(--color-text-secondary); font-size: var(--font-size-sm); text-overflow: ellipsis; white-space: nowrap; }
.favorite-empty { margin: 0; padding: var(--spacing-6) 0; color: var(--color-text-secondary); font-size: var(--font-size-md); text-align: center; }
.add-action { display: flex; justify-content: flex-start; }
.switch-error { margin: 0; color: var(--performance-field-error-color); font-size: var(--font-size-sm); line-height: 20px; }
.switch-actions { display: flex; justify-content: flex-end; gap: var(--performance-dialog-footer-gap); }
</style>
