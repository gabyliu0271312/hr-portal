<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, VideoPlay } from '@element-plus/icons-vue'
import { formatDateTime } from '@/utils/datetime'
import ServiceStatusBadge from '@/components/warehouse/ServiceStatusBadge.vue'
import ServiceSourcePicker from '@/components/warehouse/ServiceSourcePicker.vue'
import ServiceFieldSelector from '@/components/warehouse/ServiceFieldSelector.vue'
import DeliveryTargetEditor from '@/components/warehouse/DeliveryTargetEditor.vue'
import ScheduleEditor from '@/components/warehouse/ScheduleEditor.vue'
import { subscriptionsApi, type SubscriptionOut, type SubscriptionIn } from '@/api/subscriptions'

const items = ref<SubscriptionOut[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const editing = ref<SubscriptionOut | null>(null)
const running = ref<number | null>(null)

const form = ref<SubscriptionIn & { id?: number }>({
  name: '', source_type: 'table', source_id: '',
  field_scope: [], recipients: [],
  delivery_target: 'feishu', frequency: 'manual',
  push_format: 'json',
})

const sourceRef = ref({ source_type: 'table', source_id: '', source_label: '' })
const deliveryRef = ref({ target: 'feishu', address: '' })
const scheduleRef = ref({ frequency: 'manual', cron_expr: '' })

async function load() {
  loading.value = true
  try { items.value = await subscriptionsApi.list() } catch { items.value = [] }
  finally { loading.value = false }
}

function openCreate() {
  editing.value = null
  form.value = { name: '', source_type: 'table', source_id: '', field_scope: [], recipients: [], delivery_target: 'feishu', frequency: 'manual', push_format: 'json' }
  sourceRef.value = { source_type: 'table', source_id: '', source_label: '' }
  deliveryRef.value = { target: 'feishu', address: '' }
  scheduleRef.value = { frequency: 'manual', cron_expr: '' }
  dialogVisible.value = true
}

function openEdit(item: SubscriptionOut) {
  editing.value = item
  form.value = { name: item.name, description: item.description, source_type: item.source_type, source_id: item.source_id, source_label: item.source_label, source_layer: item.source_layer || undefined, field_scope: item.field_scope, recipients: item.recipients, delivery_target: item.delivery_target, frequency: item.frequency, cron_expr: item.cron_expr, push_format: item.push_format }
  sourceRef.value = { source_type: item.source_type, source_id: item.source_id, source_label: item.source_label || '' }
  deliveryRef.value = { target: item.delivery_target, address: '' }
  scheduleRef.value = { frequency: item.frequency, cron_expr: item.cron_expr || '' }
  dialogVisible.value = true
}

async function save() {
  const payload = {
    ...form.value,
    source_type: sourceRef.value.source_type,
    source_id: sourceRef.value.source_id,
    source_label: sourceRef.value.source_label,
    delivery_target: deliveryRef.value.target,
    frequency: scheduleRef.value.frequency,
    cron_expr: scheduleRef.value.cron_expr || null,
  }
  try {
    if (editing.value) {
      await subscriptionsApi.update(editing.value.id, payload)
      ElMessage.success('已更新')
    } else {
      await subscriptionsApi.create(payload as unknown as SubscriptionIn)
      ElMessage.success('已创建')
    }
    dialogVisible.value = false
    await load()
  } catch (e: any) { ElMessage.error(e?.response?.data?.detail || '保存失败') }
}

async function toggle(item: SubscriptionOut) {
  try { await subscriptionsApi.toggle(item.id); ElMessage.success(item.status === 'enabled' ? '已暂停' : '已启用'); await load() }
  catch (e: any) { ElMessage.error(e?.response?.data?.detail || '操作失败') }
}

async function runNow(item: SubscriptionOut) {
  running.value = item.id
  try { const res = await subscriptionsApi.run(item.id); ElMessage.success(res.data?.message || '已触发'); await load() }
  catch (e: any) { ElMessage.error(e?.response?.data?.detail || '触发失败') }
  finally { running.value = null }
}

async function remove(item: SubscriptionOut) {
  await ElMessageBox.confirm(`删除「${item.name}」？`, '确认删除', { type: 'warning' })
  try { await subscriptionsApi.remove(item.id); ElMessage.success('已删除'); await load() }
  catch (e: any) { ElMessage.error(e?.response?.data?.detail || '删除失败') }
}

onMounted(() => load())
</script>

<template>
  <div style="padding: 16px">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px">
      <span style="font-size: 14px; color: #606266">共 {{ items.length }} 个订阅</span>
      <el-button :icon="Plus" type="primary" size="small" @click="openCreate">新建订阅</el-button>
    </div>

    <el-table :data="items" v-loading="loading" stripe size="small">
      <el-table-column prop="name" label="名称" min-width="130" show-overflow-tooltip />
      <el-table-column prop="frequency" label="频率" width="80">
        <template #default="{ row }">{{ ({ manual: '手动', daily: '每天', weekly: '每周', monthly: '每月', event: '事件' } as Record<string, string>)[row.frequency] || row.frequency }}</template>
      </el-table-column>
      <el-table-column label="投递" width="80">
        <template #default="{ row }">{{ ({ feishu: '飞书', email: '邮件', webhook: 'Webhook', file: '文件' } as Record<string, string>)[row.delivery_target] || row.delivery_target }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="80">
        <template #default="{ row }"><ServiceStatusBadge :status="row.status" /></template>
      </el-table-column>
      <el-table-column prop="last_sent_at" label="最近投递" width="150">
        <template #default="{ row }">{{ row.last_sent_at ? formatDateTime(row.last_sent_at) : '-' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="240" fixed="right">
        <template #default="{ row }">
          <el-button size="small" text type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" text :type="row.status === 'enabled' ? 'warning' : 'success'" @click="toggle(row)">
            {{ row.status === 'enabled' ? '暂停' : '启用' }}
          </el-button>
          <el-button size="small" text type="primary" :loading="running === row.id" @click="runNow(row)">执行</el-button>
          <el-button size="small" text type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 弹窗 -->
    <el-dialog v-model="dialogVisible" :title="editing ? '编辑订阅' : '新建订阅'" width="680px" destroy-on-close>
      <el-form label-width="100px" label-position="left">
        <el-form-item label="名称" required><el-input v-model="form.name" placeholder="如: 每周薪酬报表推送" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="form.description" type="textarea" :rows="2" /></el-form-item>
        <el-form-item label="来源资产" required>
          <ServiceSourcePicker v-model="sourceRef" />
        </el-form-item>
        <el-form-item label="接收人" required>
          <el-input v-model="form.recipients[0]?.id" placeholder="用户ID 或 群ID" style="width: 200px" />
        </el-form-item>
        <el-form-item label="投递方式"><DeliveryTargetEditor v-model="deliveryRef" /></el-form-item>
        <el-form-item label="调度"><ScheduleEditor v-model="scheduleRef" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>
