<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import PermissionButton from '@/components/PermissionButton.vue'
import { createAuthorizationContract, type ModelTable } from '@/api/warehouse'

const props = defineProps<{
  modelId: number
  tables: ModelTable[]
  outputs: Array<{ output_code: string; agg_role: string; is_sensitive: boolean }>
  latestVersion: number
}>()
const emit = defineEmits<{ created: [] }>()
const standard = ref(true)
const saving = ref(false)
const error = ref('')
const facts = ref<Array<{
  alias: string; table_name: string; fact_key: string; employee_key: string
  cost_center_key: string; role: string; allow_cost_center_summary: boolean; allow_employee_count: boolean
}>>([])
watch(() => [props.modelId, props.tables.map(table => `${table.alias}:${table.table_name}`).join('|')], () => {
  facts.value = props.tables.map(table => ({
    alias: table.alias, table_name: table.table_name, fact_key: '', employee_key: '',
    cost_center_key: '', role: 'person_fact', allow_cost_center_summary: false, allow_employee_count: false,
  }))
  error.value = ''
}, { immediate: true })
const valid = computed(() => facts.value.length > 0
  && (standard.value || facts.value.length === 1)
  && facts.value.every(fact => fact.fact_key.trim() && fact.employee_key.trim()
    && (!fact.allow_cost_center_summary || (fact.role === 'allocation_fact' && fact.cost_center_key.trim()))))
function changeRole(fact: typeof facts.value[number]) {
  if (fact.role !== 'allocation_fact') {
    fact.allow_cost_center_summary = false
    fact.cost_center_key = ''
  }
}
async function create() {
  if (!valid.value || saving.value) return
  saving.value = true
  error.value = ''
  try {
    const payload: Record<string, unknown> = {
      expected_version: props.latestVersion,
      facts: facts.value.map(fact => ({
        ...fact, fact_key: fact.fact_key.trim(), employee_key: fact.employee_key.trim(),
        cost_center_key: fact.allow_cost_center_summary ? fact.cost_center_key.trim() : null,
        missing_assignment: 'reject',
      })),
    }
    if (standard.value) payload.schema_version = 3
    else {
      const visible = props.outputs.filter(field => !field.is_sensitive)
      payload.output_fields = visible.map(field => field.output_code)
      payload.dimensions = visible.filter(field => field.agg_role !== 'measure').map(field => field.output_code)
      payload.measures = visible.filter(field => field.agg_role === 'measure').map(field => field.output_code)
      payload.internal_fields = []
    }
    await createAuthorizationContract(props.modelId, payload)
    ElMessage.success('授权合同草稿已创建，批准前不会开放执行')
    emit('created')
  } catch (cause: any) {
    const detail = cause?.response?.data?.detail
    error.value = typeof detail === 'string' ? detail : detail?.message || '授权合同创建失败，请核对事实与关联配置。'
  } finally { saving.value = false }
}
</script>

<template>
  <div class="contract-form">
    <el-switch v-model="standard" active-text="schema3事实与路径合同" :disabled="saving" />
    <p class="contract-form__note">每个事实独立授权；中心资格仅补充分摊汇总，不授予工资或员工明细。字段权限仍逐项生效。</p>
    <el-alert v-if="!standard && tables.length > 1" title="旧合同模式不支持多事实，请使用schema3。" type="warning" :closable="false" />
    <el-empty v-if="!tables.length" description="请先在数据建模步骤添加事实来源" :image-size="48" />
    <div v-for="fact in facts" :key="fact.alias" class="contract-form__fact">
      <strong>{{ fact.alias }} · {{ fact.table_name }}</strong>
      <el-form label-position="top" :disabled="saving" class="contract-form__fields">
        <el-form-item label="事实角色">
          <el-select v-model="fact.role" :aria-label="`${fact.alias}事实角色`" @change="changeRole(fact)">
            <el-option label="人员事实" value="person_fact" />
            <el-option label="分摊事实" value="allocation_fact" />
          </el-select>
        </el-form-item>
        <el-form-item label="唯一事实键（物理列）">
          <el-input v-model="fact.fact_key" :aria-label="`${fact.alias}事实键`" placeholder="如 fact_id" maxlength="128" />
        </el-form-item>
        <el-form-item label="人员键（物理列）">
          <el-input v-model="fact.employee_key" :aria-label="`${fact.alias}人员键`" placeholder="如 employee_no" maxlength="128" />
        </el-form-item>
        <el-form-item v-if="fact.role === 'allocation_fact'" label="成本中心路径">
          <el-checkbox v-model="fact.allow_cost_center_summary">批准中心汇总</el-checkbox>
          <el-input v-if="fact.allow_cost_center_summary" v-model="fact.cost_center_key" :aria-label="`${fact.alias}中心键`" placeholder="中心键（物理列）" maxlength="128" />
        </el-form-item>
      </el-form>
      <el-checkbox v-if="standard" v-model="fact.allow_employee_count" :disabled="saving">批准人数指标（COUNT DISTINCT 人员键）</el-checkbox>
    </div>
    <p v-if="tables.length > 1" class="contract-form__note">关联键、方向与基数沿用“数据建模”配置。服务端验证事实身份、基数与防重复口径；未支持的关系仍阻断。</p>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <PermissionButton menu="warehouse.assets" op="U" size="small" :loading="saving" :disabled="saving || !valid" @click="create">创建合同草稿</PermissionButton>
  </div>
</template>

<style scoped>
.contract-form { display: grid; gap: var(--spacing-3); }
.contract-form__note { margin: 0; color: var(--color-text-secondary); font-size: var(--font-size-sm); line-height: 1.6; }
.contract-form__fact { display: grid; gap: var(--spacing-2); padding-block: var(--spacing-3); border-top: 1px solid var(--color-border); }
.contract-form__fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--spacing-3); }
.contract-form__fields :deep(.el-form-item) { margin-bottom: 0; }
</style>
