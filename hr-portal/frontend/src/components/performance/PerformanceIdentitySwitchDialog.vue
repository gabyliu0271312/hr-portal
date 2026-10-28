<template>
  <el-dialog :model-value="modelValue" title="切换绩效用户" width="560px" :close-on-click-modal="false" @update:model-value="$emit('update:modelValue', $event)" @open="loadPeople">
    <el-alert type="warning" :closable="false" title="操作将按目标员工权限真实生效，不继承操作者的管理权限。原业务接收人及业务群始终禁投。" />
    <div class="search-row"><el-input v-model="query" clearable placeholder="搜索姓名或员工编号" @keyup.enter="search" /><el-button :loading="loading" @click="search">搜索</el-button></div>
    <PerformancePersonSelect :model-value="selected" :options="options" :disabled="loading || saving" aria-label="切换目标员工" placeholder="选择员工，不要求 Portal 账号" @update:model-value="value => selected = typeof value === 'string' ? value : null" />
    <p class="hint">按统一员工名单选择；同名以员工编号区分。业务身份由周期、组织关系和任务计算，不在这里授予角色。</p>
    <el-pagination v-if="total > 50" v-model:current-page="page" :page-size="50" :total="total" layout="prev, pager, next" @current-change="loadPeople" />
    <el-alert v-if="error" type="error" :closable="false" :title="error" />
    <template #footer><el-button @click="$emit('update:modelValue', false)">取消</el-button><el-button type="primary" :loading="saving" :disabled="!selected" @click="confirmSwitch">确认切换</el-button></template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import PerformancePersonSelect from './PerformancePersonSelect.vue'
import { identitySwitchApi, type SwitchPerson } from '@/api/identitySwitch'
import { employeeSwitchSession, clearEmployeeSwitch, setEmployeeSwitch } from '@/stores/identitySwitch'

 defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; changed: [] }>()
const router = useRouter()
const query = ref('')
const selected = ref<string | null>(null)
const people = ref<SwitchPerson[]>([])
const options = computed(() => people.value.map(p => ({ value: p.employee_no, label: `${p.display_name} · ${p.employee_no}${p.organization_label ? ' · ' + p.organization_label : ''}` })))
const page = ref(1)
const total = ref(0)
const loading = ref(false)
const saving = ref(false)
const error = ref('')
let request = 0
async function loadPeople() {
  const current = ++request
  loading.value = true
  error.value = ''
  try {
    const result = await identitySwitchApi.people(query.value, page.value)
    if (current !== request) return
    people.value = result.items
    total.value = result.total
    selected.value = null
  } catch (e: any) { if (current === request) error.value = e?.response?.data?.detail || '员工名单加载失败，请重试' }
  finally { if (current === request) loading.value = false }
}
function search() { page.value = 1; return loadPeople() }
async function confirmSwitch() {
  if (!selected.value || saving.value) return
  saving.value = true
  error.value = ''
  try {
    const old = employeeSwitchSession.value
    clearEmployeeSwitch()
    if (old) await identitySwitchApi.end(old.session_id)
    const capability = await identitySwitchApi.capability()
    const session = await identitySwitchApi.create(selected.value, capability.generation)
    setEmployeeSwitch(session)
    emit('update:modelValue', false)
    emit('changed')
    await router.replace('/performance/workbench')
  } catch (e: any) { error.value = e?.response?.data?.detail || '切换失败，当前已恢复本人' }
  finally { saving.value = false }
}
</script>

<style scoped>
.search-row { display: flex; gap: 8px; margin: 18px 0 12px; }
.hint { font-size: 13px; color: var(--color-text-secondary); }
</style>
