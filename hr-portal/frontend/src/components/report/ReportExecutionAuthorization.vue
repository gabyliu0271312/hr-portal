<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import PermissionButton from '@/components/PermissionButton.vue'
import { useUserStore } from '@/stores/user'
import { reportsApi, reportErrorMessage, type ReportItem, type ReportExecutionBinding, type ReportExecutionReadiness } from '@/api/reports'

const props = defineProps<{ report: ReportItem }>()
const emit = defineEmits<{ approved: [] }>()
const user = useUserStore()
const allowed = computed(() => props.report.can_edit && user.hasOp('report.list', 'U') && user.menus.some(menu => menu.code === 'warehouse.assets') && user.hasOp('warehouse.assets', 'U'))
const open = ref(false)
const busy = ref(false)
const binding = ref<ReportExecutionBinding | null>(null)
const readiness = ref<ReportExecutionReadiness | null>(null)
const reason = ref('')
const confirmed = ref(false)
const error = ref('')
const conflict = ref(false)
let sequence = 0
const eligible = computed(() => readiness.value?.eligible === true && readiness.value.runtime_enabled === true
  && readiness.value.dataset_id === props.report.dataset_id && Number.isInteger(readiness.value.contract_id)
  && Number(readiness.value.contract_id) > 0 && Number.isInteger(readiness.value.contract_version)
  && Number(readiness.value.contract_version) > 0 && readiness.value.issues.length === 0)
const canApprove = computed(() => allowed.value && !busy.value && !conflict.value && eligible.value
  && !!binding.value?.fingerprint && confirmed.value && !!reason.value.trim())

function invalidate() {
  sequence++
  busy.value = false
  binding.value = null
  readiness.value = null
  confirmed.value = false
}
watch(() => JSON.stringify([props.report, user.user?.id, user.menus, allowed.value]), () => {
  invalidate()
  open.value = false
  reason.value = ''
  error.value = ''
  conflict.value = false
}, { flush: 'sync' })
watch(open, (value) => { if (!value) invalidate() }, { flush: 'sync' })
onBeforeUnmount(invalidate)

async function load() {
  if (!allowed.value || busy.value) return
  invalidate()
  const request = sequence
  busy.value = true
  error.value = ''
  conflict.value = false
  try {
    const [current, ready] = await Promise.all([
      reportsApi.executionBinding(props.report.id), reportsApi.executionReadiness(props.report.dataset_id),
    ])
    if (request !== sequence || !allowed.value || !open.value) return
    binding.value = current
    readiness.value = ready
  } catch (e) {
    if (request !== sequence) return
    error.value = reportErrorMessage(e, '执行授权信息加载失败，请确认后端已部署后重新加载')
  } finally {
    if (request === sequence) busy.value = false
  }
}
function show() {
  if (!allowed.value) return
  open.value = true
  void load()
}
async function approve() {
  if (!canApprove.value) return
  const request = ++sequence
  const id = props.report.id
  const expected = readiness.value!
  busy.value = true
  error.value = ''
  try {
    const current = await reportsApi.executionReadiness(props.report.dataset_id)
    if (request !== sequence || !allowed.value || !open.value) return
    readiness.value = current
    if (!eligible.value || current.contract_id !== expected.contract_id || current.contract_version !== expected.contract_version) {
      conflict.value = true
      error.value = '当前运行资格或合同已变化，请主动重新加载并核对后批准'
      return
    }
    const result = await reportsApi.bindExecution(id, {
      expected_fingerprint: binding.value!.fingerprint,
      contract_id: current.contract_id!, contract_version: current.contract_version!, reason: reason.value.trim(),
    })
    if (request !== sequence || !allowed.value || !open.value) return
    if (result.execution_version !== 'authorized_v1') {
      error.value = '服务端未确认授权执行版本，请重新加载核对'
      conflict.value = true
      return
    }
    binding.value = result
    ElMessage.success('执行授权已批准，仅开放当前授权范围内汇总')
    open.value = false
    emit('approved')
  } catch (e: any) {
    if (request !== sequence) return
    conflict.value = true
    error.value = reportErrorMessage(e, '执行授权批准失败') + (e?.response?.status === 409 ? '；请主动重新加载并核对，批准原因已保留' : '；请重新加载后核对')
  } finally {
    if (request === sequence) busy.value = false
  }
}
</script>

<template>
  <PermissionButton v-if="allowed" menu="report.list" op="U" @click="show">执行授权</PermissionButton>
  <el-drawer v-model="open" title="执行授权" size="min(560px, 92vw)" append-to-body>
    <section v-if="allowed" v-loading="busy" class="execution-authorization">
      <el-alert type="info" :closable="false" show-icon title="仅批准无出口的单表分摊汇总试点">
        仅开放当前授权范围内汇总、run / COUNT / CSV / XLSX；无明细下钻、复杂过滤或对外出口。AI解释、推送、筛选、设计器模型预览等渠道未开放；不自动迁移其他报表，不回退旧执行版本。
      </el-alert>
      <p>报表：{{ report.name }}</p>
      <p v-if="binding">执行版本：{{ binding.execution_version }}</p>
      <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
      <template v-if="readiness">
        <el-tag :type="eligible ? 'success' : 'warning'">{{ eligible ? '本次运行资格通过' : '当前不可批准' }}</el-tag>
        <p v-if="readiness.contract_id">合同 #{{ readiness.contract_id }} · 版本 {{ readiness.contract_version }}</p>
        <ul v-if="readiness.issues.length"><li v-for="issue in readiness.issues" :key="issue.code">{{ issue.message }}</li></ul>
        <p v-if="!eligible && !readiness.issues.length">运行资格未通过或尚未启用，请先完成仓库治理与正式批准。</p>
      </template>
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="批准原因">
          <el-input v-model="reason" type="textarea" :rows="3" maxlength="1000" show-word-limit :disabled="busy" placeholder="说明试点用途与批准依据" />
        </el-form-item>
        <el-checkbox v-model="confirmed" :disabled="busy || !eligible || conflict">已核对上述限缩范围，仅批准当前报表</el-checkbox>
      </el-form>
      <div class="authorization-actions">
        <PermissionButton menu="report.list" op="U" :disabled="busy" @click="load">重新加载</PermissionButton>
        <PermissionButton menu="warehouse.assets" op="U" type="primary" :disabled="!canApprove" @click="approve">批准执行授权</PermissionButton>
      </div>
    </section>
  </el-drawer>
</template>

<style scoped>
.execution-authorization { display: grid; gap: 16px; color: var(--el-text-color-primary); }
p, ul { margin: 0; line-height: 1.6; overflow-wrap: anywhere; }
ul { padding-left: 20px; }
.authorization-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
</style>
