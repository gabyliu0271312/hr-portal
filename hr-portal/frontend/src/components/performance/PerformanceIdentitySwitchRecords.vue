<template>
  <el-dialog :model-value="modelValue" title="身份切换消息测试记录" width="900px" @update:model-value="$emit('update:modelValue', $event)" @open="load">
    <el-alert type="warning" :closable="false" title="原业务接收方始终零投递。默认仅记录；admin 开放受控投递后，每次一条独立汇总，样式验证另发一条样例。" />
    <div class="toolbar"><el-checkbox v-model="verifyStyle">验证样式（仅 1 条样例）</el-checkbox><el-button :loading="loading" @click="load">刷新记录</el-button></div>
    <div class="table-scroll"><el-table :data="runs" v-loading="loading" stripe max-height="500" style="width:100%">
      <el-table-column label="批次" min-width="150"><template #default="{ row }"><div>{{ row.id.slice(0, 8) }}</div><small>{{ row.environment }} · {{ row.target_employee_no }}</small></template></el-table-column>
      <el-table-column label="原计划人数" prop="planned_count" width="105" />
      <el-table-column label="生成异常" prop="error_count" width="95" />
      <el-table-column label="原业务投递" width="105"><template #default="{ row }">{{ row.original_delivery_count }} 条</template></el-table-column>
      <el-table-column label="样例 / 汇总" min-width="165"><template #default="{ row }">{{ statusLabel(row.sample_status) }} / {{ statusLabel(row.summary_status) }}</template></el-table-column>
      <el-table-column label="操作" min-width="150"><template #default="{ row }"><el-button link type="primary" @click="selected = row">查看明细</el-button><el-button v-if="row.can_deliver" link type="primary" :disabled="sending" @click="deliver(row)">受控测试投递</el-button></template></el-table-column>
    </el-table></div>
    <p v-if="!loading && !runs.length">暂无测试记录。切换期间的通知触发后会在这里记录，不会为单纯查看页面伪造通知。</p>
    <section v-if="selected" class="details"><h3>批次 {{ selected.id }}</h3><p>来源：{{ selected.source }}</p><el-alert v-if="selected.delivery_error" type="warning" :closable="false" :title="selected.delivery_error" /><p>生成成功不等于实际送达。原始通知逐条核验，样例和汇总的投递状态独立记录。</p><article v-for="(item, index) in selected.items" :key="index"><strong>{{ item.title }}</strong><pre>{{ item.content }}</pre><small>原计划接收人数：{{ item.receiver_count }}</small></article></section>
  </el-dialog>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { identitySwitchApi, type NotificationTestRun } from '@/api/identitySwitch'

defineProps<{ modelValue: boolean }>()
defineEmits<{ 'update:modelValue': [value: boolean] }>()
const runs = ref<NotificationTestRun[]>([])
const selected = ref<NotificationTestRun | null>(null)
const verifyStyle = ref(true)
const loading = ref(false)
const sending = ref(false)
function statusLabel(value: string) {
  return ({ recorded: '仅记录', sent: '已发送', sending: '待核对', unknown: '结果未确认', skipped: '已拦截', not_requested: '未请求' } as Record<string, string>)[value] || value
}
async function load() {
  loading.value = true
  try { runs.value = (await identitySwitchApi.runs()).items }
  finally { loading.value = false }
}
async function deliver(row: NotificationTestRun) {
  try { await ElMessageBox.confirm(`仅向 admin 配置且不在原名单内的测试接收人投递${verifyStyle.value ? '一条样例和' : ''}一条汇总。不会向原业务接收方发送。`, '确认受控测试投递', { confirmButtonText: '确认投递', cancelButtonText: '取消' }) }
  catch { return }
  sending.value = true
  try { selected.value = await identitySwitchApi.deliver(row.id, verifyStyle.value); await load() }
  finally { sending.value = false }
}
</script>
<style scoped>
.toolbar { display: flex; gap: 12px; justify-content: space-between; margin: 16px 0; flex-wrap: wrap; }
.table-scroll { overflow-x: auto; }
small { color: var(--color-text-secondary); }
.details { margin-top: 20px; border-top: 1px solid var(--color-border); padding-top: 12px; }
article { padding: 12px 0; border-bottom: 1px solid var(--color-border); }
pre { white-space: pre-wrap; overflow-wrap: anywhere; font-family: inherit; }
</style>
