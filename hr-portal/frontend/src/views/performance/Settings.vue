<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import PerformanceManagerStandardDialog from '@/components/performance/PerformanceManagerStandardDialog.vue'
import { getPerformanceManagerStandard, getPerformanceEmployeeTypes, savePerformanceManagerStandard } from '@/api/performanceFieldSettings'
import { ElMessage } from 'element-plus'
import UiButton from '@/components/ui/UiButton.vue'
import PerformancePageTitle from '@/components/performance/PerformancePageTitle.vue'
import PerformanceFieldSettingsSection from '@/components/performance/PerformanceFieldSettingsSection.vue'
import PerformanceDepartmentSearchOptions from '@/components/performance/PerformanceDepartmentSearchOptions.vue'
import {
  createFieldSettingsPreview,
  detailFieldOptions,
  type PerformanceFieldOption,
  type PerformanceFieldSettings,
  type PerformanceManagerStandard,
  type PerformanceFieldSettingsSection as SectionKey,
} from '@/components/performance/performanceFieldSettings'

const props = withDefaults(defineProps<{
  section?: string
  title?: string
  settings?: PerformanceFieldSettings
  fieldOptions?: PerformanceFieldOption[]
}>(), {
  title: '字段设置',
  settings: createFieldSettingsPreview,
  fieldOptions: () => detailFieldOptions,
})
const emit = defineEmits<{ 'request-edit': [section: SectionKey]; 'request-example': [] }>()
const visibleFields = computed(() => props.settings.review_detail_visible_fields.field.map(id => props.fieldOptions.find(field => field.id === id)?.label || id))

const manager = ref<PerformanceManagerStandard | null>(null)
const employeeTypes = ref<{ value: string; label: string }[]>([])
const managerOpen = ref(false)
const loadingManager = ref(true)
const savingManager = ref(false)
const loadError = ref('')
const saveError = ref('')
const managerOptions = computed(() => {
  const options = [...employeeTypes.value]
  for (const value of manager.value?.specific_employee_types || []) {
    if (!options.some(option => option.value === value)) options.push({ value, label: value })
  }
  return options
})
const managerSummary = computed(() => {
  if (!manager.value) return loadingManager.value ? '加载中…' : '管理者判定标准加载失败'
  if (manager.value.manager_standard === 'inservice_direct_underling') return '有在职直属下级时，可被认定为管理者。'
  const labels = manager.value.specific_employee_types.map(value => managerOptions.value.find(option => option.value === value)?.label || value)
  return `拥有“人员类型为${labels.join('、')}”的在职直属下级时，才能被认定为管理者。`
})
async function loadManager() {
  loadingManager.value = true
  loadError.value = ''
  try {
    const [value, options] = await Promise.all([getPerformanceManagerStandard(), getPerformanceEmployeeTypes()])
    manager.value = value
    employeeTypes.value = options
  } catch {
    loadError.value = '加载失败，请重试或联系管理员确认配置权限'
  } finally {
    loadingManager.value = false
  }
}
async function saveManager(value: PerformanceManagerStandard) {
  if (savingManager.value) return
  savingManager.value = true
  saveError.value = ''
  try {
    await savePerformanceManagerStandard(value)
    manager.value = await getPerformanceManagerStandard()
    managerOpen.value = false
  } catch {
    saveError.value = '保存或回读失败，请重试；当前编辑内容已保留'
  } finally {
    savingManager.value = false
  }
}
onMounted(loadManager)
function requestEdit(section: SectionKey) {
  emit('request-edit', section)
  if (section === 'definition_of_manager') {
    if (!manager.value || loadingManager.value || loadError.value) return
    saveError.value = ''
    managerOpen.value = true
    return
  }
  ElMessage.info('当前为配置预览，设置弹窗及保存功能将在后续开放')
}

function requestExample() {
  emit('request-example')
  ElMessage.info('筛选示例将在后续开放')
}
</script>

<template>
  <div class="field-settings-page">
    <PerformancePageTitle :title="title" role="heading" aria-level="1" />
    <PerformanceFieldSettingsSection title="详情页顶部字段设置" action-label="设置详情页顶部字段" @edit="requestEdit('review_detail_visible_fields')">
      <template #description>
        设置人员详情页顶部展示哪些字段，对全局生效。如果你需要配置不同角色可见不同字段，请跳转至<RouterLink :to="{ name: 'PerformancePermissionSubjectVisibility' }">被评估人可见性设置</RouterLink>。
      </template>
      <div class="field-settings-summary">
        <div class="field-settings-summary__label">展示字段</div>
        <div>{{ visibleFields.join('、') || '暂无展示字段' }}</div>
      </div>
    </PerformanceFieldSettingsSection>

    <PerformanceFieldSettingsSection title="筛选设置" action-label="设置筛选条件" @edit="requestEdit('default_filter_condition')">
      <template #description>
        可设置前台页面筛选面板中各条件的排列顺序和是否默认显示。<UiButton variant="link" @click="requestExample">查看示例</UiButton>
      </template>
      <div class="field-settings-summary">
        <div class="field-settings-summary__label">筛选条件</div>
        <div class="field-settings-summary__filters"><template v-for="(condition, index) in settings.default_filter_condition.filter_conditions" :key="condition.filter_key"><span v-if="index">、</span><span>{{ condition.label }}</span><span v-if="condition.default">（默认筛选）</span></template><span v-if="!settings.default_filter_condition.filter_conditions.length">暂无筛选条件</span></div>
      </div>
    </PerformanceFieldSettingsSection>

    <PerformanceFieldSettingsSection title="部门字段搜索设置">
      <template #description>设置前台页面使用部门或所属部门搜索时，是否默认可见部门树</template>
      <PerformanceDepartmentSearchOptions :model-value="settings.department_tree_view_all.enabled" @request-change="requestEdit('department_tree_view_all')" />
    </PerformanceFieldSettingsSection>

    <PerformanceFieldSettingsSection title="管理者的判定标准设置" action-label="设置管理者判定标准" @edit="requestEdit('definition_of_manager')">
      <template #description>此设置用于定义“管理者”的判定标准。当在项目校准规则或前台筛选条件中使用“管理者”条件筛选成员时，系统将根据以下条件标准判断成员是否为管理者。</template>
      <div class="field-settings-summary">
        <div class="field-settings-summary__label">判定标准</div>
        <div>{{ managerSummary }}</div>
        <div v-if="loadError" role="alert">{{ loadError }} <UiButton variant="link" :disabled="loadingManager" @click="loadManager">重试</UiButton></div>
      </div>
    </PerformanceFieldSettingsSection>
    <PerformanceManagerStandardDialog v-if="manager" v-model="managerOpen" :value="manager" :options="managerOptions" :saving="savingManager" :error="saveError" @save="saveManager" />
  </div>
</template>

<style scoped>
.field-settings-page { display: flex; flex-direction: column; gap: var(--spacing-4); min-width: 0; font-family: var(--font-sans); color: var(--color-text-primary); font-size: var(--font-size-md); line-height: var(--performance-settings-help-line-height); }
.field-settings-page :deep(a) { color: var(--color-primary); text-decoration: none; }
.field-settings-page :deep(a:hover) { text-decoration: none; }
.field-settings-summary { padding: var(--spacing-3) var(--spacing-4); border-radius: var(--radius-md); background: var(--performance-review-readonly-surface); overflow-wrap: anywhere; }
.field-settings-summary__label { margin-bottom: var(--spacing-2); color: var(--performance-settings-text-secondary); }
</style>
