<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Delete } from '@element-plus/icons-vue'
import PermissionButton from '@/components/PermissionButton.vue'
import {
  toolsApi,
  type CompensationCap,
  type CompensationCapPayload,
  type InstallmentRuleItem,
} from '@/api/tools'

const loading = ref(false)
const saving = ref(false)
const list = ref<CompensationCap[]>([])
const keyword = ref('')
const dialogOpen = ref(false)
const editing = ref<CompensationCap | null>(null)

// 分期规则
const rulesLoading = ref(false)
const rulesSaving = ref(false)
const rules = ref<InstallmentRuleItem[]>([])

const form = reactive<CompensationCapPayload>({
  region: '',
  effective_start: '',
  effective_end: '',
  cap_amount: 0,
  note: '',
})

function money(v: number) {
  return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0)
}

async function load() {
  loading.value = true
  try {
    list.value = await toolsApi.listCompensationCaps({ keyword: keyword.value || undefined })
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '加载补偿金上限失败')
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editing.value = null
  Object.assign(form, {
    region: '',
    effective_start: '',
    effective_end: '',
    cap_amount: 0,
    note: '',
  })
  dialogOpen.value = true
}

function openEdit(row: CompensationCap) {
  editing.value = row
  Object.assign(form, {
    region: row.region,
    effective_start: row.effective_start,
    effective_end: row.effective_end,
    cap_amount: row.cap_amount,
    note: row.note || '',
  })
  dialogOpen.value = true
}

async function save() {
  if (!form.region.trim() || !form.effective_start || !form.effective_end || !form.cap_amount) {
    ElMessage.warning('地区、生效期间和基数上限必填')
    return
  }
  saving.value = true
  try {
    if (editing.value) await toolsApi.updateCompensationCap(editing.value.id, form)
    else await toolsApi.createCompensationCap(form)
    ElMessage.success('已保存')
    dialogOpen.value = false
    load()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
  } finally {
    saving.value = false
  }
}

async function remove(row: CompensationCap) {
  try {
    await ElMessageBox.confirm(`删除「${row.region}」${row.effective_start} 至 ${row.effective_end} 的上限规则？`, '提示', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await toolsApi.removeCompensationCap(row.id)
    ElMessage.success('已删除')
    load()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '删除失败')
  }
}

async function loadRules() {
  rulesLoading.value = true
  try {
    rules.value = await toolsApi.listInstallmentRules()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '加载分期规则失败')
  } finally {
    rulesLoading.value = false
  }
}

function addRule() {
  const nextNo = rules.value.length ? Math.max(...rules.value.map((r) => r.period_no)) + 1 : 1
  rules.value.push({ period_no: nextNo, ratio: 0, months_after: nextNo, pay_day: 15 })
}

function removeRule(idx: number) {
  rules.value.splice(idx, 1)
  rules.value.forEach((r, i) => (r.period_no = i + 1))
}

const ratioSum = () => rules.value.reduce((s, r) => s + (Number(r.ratio) || 0), 0)

async function saveRules() {
  if (!rules.value.length) {
    ElMessage.warning('至少保留一期')
    return
  }
  if (Math.abs(ratioSum() - 100) > 0.01) {
    ElMessage.warning(`各期比例之和必须为 100%，当前为 ${ratioSum()}%`)
    return
  }
  rulesSaving.value = true
  try {
    rules.value = await toolsApi.saveInstallmentRules(rules.value)
    ElMessage.success('分期规则已保存')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
  } finally {
    rulesSaving.value = false
  }
}

onMounted(() => {
  load()
  loadRules()
})
</script>

<template>
  <div style="padding: 24px">
    <el-card>
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <div>
            <div style="font-size: 16px; font-weight: 600">补偿金规则维护</div>
            <div style="margin-top: 4px; color: var(--color-text-placeholder); font-size: 13px">
              维护不同地区、不同生效期间的补偿基数上限。
            </div>
          </div>
          <PermissionButton menu="system.compensation_caps" op="C" type="primary" @click="openCreate">
            <el-icon style="margin-right: 4px"><Plus /></el-icon>新增上限规则
          </PermissionButton>
        </div>
      </template>

      <el-form inline style="margin-bottom: 16px">
        <el-form-item>
          <el-input
            v-model="keyword"
            placeholder="请输入地区关键词"
            clearable
            style="width: 220px"
            @keyup.enter="load"
            @change="load"
          />
        </el-form-item>
        <el-form-item>
          <el-button @click="load">查询</el-button>
          <el-button link @click="keyword = ''; load()">重置</el-button>
        </el-form-item>
      </el-form>

      <div style="overflow-x: auto">
        <el-table v-loading="loading" :data="list" stripe style="width: 100%" max-height="600">
          <el-table-column prop="region" label="地区" min-width="120" />
          <el-table-column prop="effective_start" label="生效开始日期" min-width="140" />
          <el-table-column prop="effective_end" label="生效结束日期" min-width="140" />
          <el-table-column label="基数上限" min-width="140" align="right">
            <template #default="{ row }">{{ money(row.cap_amount) }}</template>
          </el-table-column>
          <el-table-column prop="note" label="备注" min-width="180">
            <template #default="{ row }">{{ row.note || '—' }}</template>
          </el-table-column>
          <el-table-column label="操作" width="180" fixed="right">
            <template #default="{ row }">
              <PermissionButton menu="system.compensation_caps" op="U" size="small" @click="openEdit(row)">
                编辑
              </PermissionButton>
              <PermissionButton menu="system.compensation_caps" op="D" size="small" type="danger" @click="remove(row)">
                删除
              </PermissionButton>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-card>

    <el-card style="margin-top: 16px">
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <div>
            <div style="font-size: 16px; font-weight: 600">分期支付规则</div>
            <div style="margin-top: 4px; color: var(--color-text-placeholder); font-size: 13px">
              生成解除协议时按此规则计算分期付款。取整方式固定为「前面各期向下取整、最后一期取剩余」，保证各期合计等于补偿总额。
            </div>
          </div>
          <div>
            <PermissionButton menu="system.compensation_caps" op="U" size="small" @click="addRule">
              <el-icon style="margin-right: 4px"><Plus /></el-icon>新增一期
            </PermissionButton>
            <PermissionButton
              menu="system.compensation_caps"
              op="U"
              type="primary"
              size="small"
              :loading="rulesSaving"
              @click="saveRules"
            >
              保存分期规则
            </PermissionButton>
          </div>
        </div>
      </template>

      <div style="overflow-x: auto">
        <el-table v-loading="rulesLoading" :data="rules" stripe style="width: 100%" max-height="400">
          <el-table-column label="期号" min-width="80" align="left">
            <template #default="{ row }">第 {{ row.period_no }} 期</template>
          </el-table-column>
          <el-table-column label="比例(%)" min-width="140" align="left">
            <template #default="{ row }">
              <el-input-number v-model="row.ratio" :min="0" :max="100" :precision="2" :step="5" size="small" />
            </template>
          </el-table-column>
          <el-table-column label="离职后第几个月" min-width="160" align="left">
            <template #default="{ row }">
              <el-input-number v-model="row.months_after" :min="0" :step="1" size="small" />
            </template>
          </el-table-column>
          <el-table-column label="当月几号付款" min-width="150" align="left">
            <template #default="{ row }">
              <el-input-number v-model="row.pay_day" :min="1" :max="31" :step="1" size="small" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100" fixed="right" align="left">
            <template #default="{ $index }">
              <PermissionButton
                menu="system.compensation_caps"
                op="U"
                size="small"
                type="danger"
                @click="removeRule($index)"
              >
                <el-icon><Delete /></el-icon>
              </PermissionButton>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <div style="margin-top: 10px; font-size: 13px" :style="{ color: Math.abs(ratioSum() - 100) > 0.01 ? 'var(--el-color-danger)' : 'var(--color-text-regular)' }">
        各期比例合计：{{ ratioSum() }}%（须等于 100%）
      </div>
    </el-card>

    <el-dialog v-model="dialogOpen" :title="editing ? '编辑补偿金上限规则' : '新增补偿金上限规则'" width="480px">
      <el-form label-position="top">
        <el-form-item label="地区" required>
          <el-input v-model="form.region" placeholder="如：深圳、上海、北京" />
        </el-form-item>
        <el-form-item label="生效期间" required>
          <el-date-picker
            v-model="form.effective_start"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="开始日期"
            style="width: 47%"
          />
          <span style="display: inline-block; width: 6%; text-align: center">至</span>
          <el-date-picker
            v-model="form.effective_end"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="结束日期"
            style="width: 47%"
          />
        </el-form-item>
        <el-form-item label="基数上限" required>
          <el-input-number v-model="form.cap_amount" :min="0" :precision="2" :step="1000" style="width: 100%" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.note" type="textarea" :rows="3" placeholder="可选" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>
