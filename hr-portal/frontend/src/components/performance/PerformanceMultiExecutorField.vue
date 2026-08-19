<template>
  <div class="multi-executor-field">
    <div class="multi-executor-label">环节执行人<span class="required-mark">*</span></div>
    <div class="multi-executor-help">若有多名执行人，他们共同填写一份复议结果，截止时间前允许相互修改，并以最后提交内容为准</div>
    <div class="executor-role-list">
      <div v-for="role in roleOrder" :key="role" class="executor-role">
        <label class="check-row">
          <input class="sr-input" type="checkbox" :checked="hasRole(role)" :disabled="disabled" @change="toggleRole(role, ($event.target as HTMLInputElement).checked)" />
          <span class="check-wallpaper" :class="{ checked: hasRole(role) }" aria-hidden="true"><svg v-if="hasRole(role)" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M9.589 2.903l.808.809a.35.35 0 010 .495L5.18 9.425a.35.35 0 01-.495 0l-2.981-2.98a.35.35 0 010-.496l.808-.808a.35.35 0 01.495 0l1.925 1.925 4.163-4.163a.35.35 0 01.495 0z" fill="currentColor" /></svg></span>
          <span>{{ roleLabels[role] }}</span>
        </label>
        <div v-if="role === 'REAL_LINE_MANAGER' && hasRole(role)" class="nested-options">
          <label v-for="level in managerLevels" :key="level.value" class="check-row">
            <input class="sr-input" type="checkbox" :checked="hasLevel(role, level.value)" :disabled="disabled" @change="toggleLevel(role, level.value, ($event.target as HTMLInputElement).checked)" />
            <span class="check-wallpaper" :class="{ checked: hasLevel(role, level.value) }" aria-hidden="true"><svg v-if="hasLevel(role, level.value)" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M9.589 2.903l.808.809a.35.35 0 010 .495L5.18 9.425a.35.35 0 01-.495 0l-2.981-2.98a.35.35 0 010-.496l.808-.808a.35.35 0 01.495 0l1.925 1.925 4.163-4.163a.35.35 0 01.495 0z" fill="currentColor" /></svg></span>
            <span>{{ level.label }}</span>
          </label>
        </div>
        <div v-if="role === 'DEPARTMENT_HEAD' && hasRole(role)" class="nested-select">
          <select :value="departmentLevel" :disabled="disabled" aria-label="部门负责人层级" @change="setDepartmentLevel(($event.target as HTMLSelectElement).value)">
            <option v-for="level in departmentLevels" :key="level.value" :value="level.value">{{ level.label }}</option>
          </select>
        </div>
        <div v-if="role === 'SPECIFIED_PERSON' && hasRole(role)" class="nested-select">
          <select :value="selectedPersonNo" :disabled="disabled || peopleOptions.length === 0" aria-label="指定人员" @change="setPerson(($event.target as HTMLSelectElement).value)">
            <option value="">请选择</option>
            <option v-for="person in peopleOptions" :key="person.employee_no" :value="person.employee_no">{{ person.display_name }}</option>
          </select>
          <span v-if="people.length" class="selected-people">{{ people.map((person) => person.display_name).join('、') }}</span>
        </div>
      </div>
    </div>
    <div v-if="error" class="executor-error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PerformanceExecutorConfig, PerformanceExecutorPerson, PerformanceExecutorRole, PerformanceExecutorRoleType } from '@/api/performance'

const props = withDefaults(defineProps<{ modelValue: PerformanceExecutorConfig; disabled?: boolean; peopleOptions?: PerformanceExecutorPerson[]; error?: string }>(), { disabled: false, peopleOptions: () => [], error: '' })
const emit = defineEmits<{ (event: 'update:modelValue', value: PerformanceExecutorConfig): void }>()
const roleOrder: PerformanceExecutorRoleType[] = ['REAL_LINE_MANAGER', 'HRBP', 'DEPARTMENT_HEAD', 'SPECIFIED_PERSON']
const roleLabels: Record<PerformanceExecutorRoleType, string> = { REAL_LINE_MANAGER: '实线上级', HRBP: 'HRBP', DEPARTMENT_HEAD: '部门负责人', SPECIFIED_PERSON: '指定人员' }
const managerLevels = [{ value: 'DIRECT_MANAGER', label: '直属上级' }, { value: 'LEVEL_1_MANAGER', label: '隔 1 级上级' }] as const
const departmentLevels = [{ value: 'CURRENT_DEPARTMENT', label: '所属部门负责人' }, { value: 'PARENT_DEPARTMENT', label: '隔级部门负责人' }, { value: 'LEVEL_1_DEPARTMENT', label: '所属一级部门负责人' }] as const
const roles = computed(() => props.modelValue.roles)
const people = computed(() => (roles.value.find((role): role is Extract<PerformanceExecutorRole, { type: 'SPECIFIED_PERSON' }> => role.type === 'SPECIFIED_PERSON')?.people || []))
const selectedPersonNo = computed(() => people.value[0]?.employee_no || '')
const departmentLevel = computed(() => (roles.value.find((role): role is Extract<PerformanceExecutorRole, { type: 'DEPARTMENT_HEAD' }> => role.type === 'DEPARTMENT_HEAD')?.levels[0] || 'CURRENT_DEPARTMENT'))
function hasRole(type: PerformanceExecutorRoleType) { return roles.value.some((role) => role.type === type) }
function hasLevel(type: 'REAL_LINE_MANAGER' | 'DEPARTMENT_HEAD', value: string) { const role = roles.value.find((item) => item.type === type); return !!role && 'levels' in role && role.levels.includes(value as never) }
function update(nextRoles: PerformanceExecutorRole[]) { emit('update:modelValue', { mode: 'MULTI_ROLE', roles: nextRoles }) }
function toggleRole(type: PerformanceExecutorRoleType, checked: boolean) {
  const next = roles.value.filter((role) => role.type !== type)
  if (checked) {
    next.push(type === 'HRBP' ? { type } : type === 'REAL_LINE_MANAGER' ? { type, levels: ['DIRECT_MANAGER'] } : type === 'DEPARTMENT_HEAD' ? { type, levels: ['CURRENT_DEPARTMENT'] } : { type, people: props.peopleOptions.slice(0, 1) })
  }
  update(next)
}
function toggleLevel(type: 'REAL_LINE_MANAGER', value: 'DIRECT_MANAGER' | 'LEVEL_1_MANAGER', checked: boolean) {
  const role = roles.value.find((item): item is Extract<PerformanceExecutorRole, { type: 'REAL_LINE_MANAGER' }> => item.type === type)
  if (!role) return
  const levels = checked ? [...new Set([...role.levels, value])] : role.levels.filter((item) => item !== value)
  update(roles.value.map((item) => item.type === type ? { type, levels } : item))
}
function setDepartmentLevel(value: string) { update(roles.value.map((item) => item.type === 'DEPARTMENT_HEAD' ? { type: item.type, levels: [value as 'CURRENT_DEPARTMENT' | 'PARENT_DEPARTMENT' | 'LEVEL_1_DEPARTMENT'] } : item)) }
function setPerson(employeeNo: string) { const person = props.peopleOptions.find((item) => item.employee_no === employeeNo); if (!person) return; update(roles.value.map((item) => item.type === 'SPECIFIED_PERSON' ? { type: item.type, people: [person] } : item)) }
</script>

<style scoped>
.multi-executor-field{width:100%;box-sizing:border-box;color:#1f2329;font:400 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif}.multi-executor-label{height:22px;color:rgba(0,0,0,.85);font-weight:500}.required-mark{margin-left:2px;color:#f54a45;font-family:SimSun,sans-serif}.multi-executor-help{width:263.333px;margin-top:-8px;margin-bottom:8px;color:#646a73;line-height:22px}.executor-role-list{display:flex;flex-direction:column;gap:8px;width:263.333px}.executor-role{display:flex;flex-direction:column;gap:8px}.check-row{display:flex;align-items:baseline;position:relative;min-height:22px;color:#1f2329;cursor:pointer}.sr-input{position:absolute;width:16px;height:16px;opacity:0}.check-wallpaper{display:flex;align-items:center;justify-content:center;width:16px;height:16px;margin-right:8px;box-sizing:border-box;border:.666667px solid #8f959e;border-radius:4px;background:#fff;color:#fff}.check-wallpaper.checked{border-color:transparent;background:#1456f0}.nested-options{display:flex;flex-direction:column;gap:8px;margin:0 0 0 24px}.nested-select{margin-left:24px}.nested-select select{width:239.333px;height:32px;padding:1px 11px;border:.666667px solid #d0d3d6;border-radius:6px;background:#fff;color:#1f2329;font:400 14px/22px inherit}.selected-people{display:block;margin-top:4px;color:#646a73;font-size:12px}.executor-error{margin-top:8px;color:#f54a45;font-size:12px}
</style>
