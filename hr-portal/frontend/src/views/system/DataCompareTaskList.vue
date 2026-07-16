<template>
  <div class="data-compare-page">
    <div class="page-header">
      <h2>数据对比</h2>
    </div>

    <el-tabs v-model="activeTab" @tab-change="onTabChange">
      <!-- Tab 1: 对比配置 (Skills) -->
      <el-tab-pane label="对比配置" name="skills">
        <div class="tab-header">
          <el-select v-model="filterStatus" placeholder="状态筛选" clearable style="width: 140px" @change="loadSkills">
            <el-option label="全部" value="" />
            <el-option label="草稿" value="draft" />
            <el-option label="已启用" value="active" />
            <el-option label="已归档" value="archived" />
          </el-select>
          <el-button type="primary" @click="openCreateDialog">新建对比</el-button>
        </div>

        <div v-loading="loading" class="skill-cards">
          <div v-if="skills.length === 0 && !loading" class="empty">暂无对比配置</div>
          <el-card
            v-for="skill in skills"
            :key="skill.id"
            class="skill-card"
            shadow="hover"
          >
            <div class="card-body">
              <div class="card-main">
                <div class="card-title">
                  <span class="name">{{ skill.name }}</span>
                  <el-tag :type="statusType(skill.status)" size="small">{{ statusLabel(skill.status) }}</el-tag>
                  <el-tag v-if="skill.params?.compare_type" type="info" size="small" class="type-tag">
                    {{ compareTypeLabel(skill.params.compare_type) }}
                  </el-tag>
                </div>
                <div class="card-desc">{{ skill.description || skill.instruction?.slice(0, 100) || '无描述' }}</div>
                <div class="card-meta">
                  <span>执行 {{ skill.run_count }} 次</span>
                  <span v-if="skill.last_run_at">上次: {{ formatTime(skill.last_run_at) }}</span>
                </div>
              </div>
              <div class="card-actions">
                <el-button size="small" @click="runSkill(skill.id)" :loading="runningId === skill.id">运行</el-button>
                <el-button size="small" @click="editSkill(skill)">编辑</el-button>
                <el-popconfirm title="确定删除？" @confirm="deleteSkill(skill.id)">
                  <template #reference>
                    <el-button size="small" type="danger" text>删除</el-button>
                  </template>
                </el-popconfirm>
              </div>
            </div>
          </el-card>
        </div>
      </el-tab-pane>

      <!-- Tab 2: 定时任务 (Phase 2) -->
      <el-tab-pane label="定时任务" name="tasks">
        <div class="tab-header">
          <el-select v-model="filterEnabled" placeholder="状态筛选" clearable style="width: 140px" @change="loadTasks">
            <el-option label="全部" :value="null" />
            <el-option label="已启用" :value="true" />
            <el-option label="未启用" :value="false" />
          </el-select>
          <el-button type="primary" @click="showTaskDialog = true">新建任务</el-button>
        </div>

        <el-table v-loading="taskLoading" :data="tasks" border stripe>
          <el-table-column prop="name" label="任务名称" min-width="160" />
          <el-table-column prop="compare_type" label="类型" width="100">
            <template #default="{ row }">{{ compareTypeLabel(row.compare_type) }}</template>
          </el-table-column>
          <el-table-column label="表A → 表B" min-width="200">
            <template #default="{ row }">{{ row.table_a }} → {{ row.table_b }}</template>
          </el-table-column>
          <el-table-column label="定时" width="180">
            <template #default="{ row }">
              <el-tag v-if="row.cron_expression" type="success" size="small">{{ row.cron_expression }}</el-tag>
              <span v-else class="text-muted">未绑定</span>
            </template>
          </el-table-column>
          <el-table-column label="启用" width="80">
            <template #default="{ row }">
              <el-tag :type="row.enabled ? 'success' : 'info'" size="small">{{ row.enabled ? '是' : '否' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="上次执行" width="200">
            <template #default="{ row }">
              <div v-if="row.last_run_at">
                <div>{{ formatTime(row.last_run_at) }}</div>
                <el-tag :type="taskStatusTag(row.last_status)" size="small">{{ taskStatusLabel(row.last_status) }}</el-tag>
                <span v-if="row.last_diff_count > 0" class="diff-count">差异 {{ row.last_diff_count }}</span>
              </div>
              <span v-else class="text-muted">未执行</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="280" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="runTask(row.id)" :loading="runningTaskId === row.id">执行</el-button>
              <el-button size="small" @click="openScheduleDialog(row)">定时</el-button>
              <el-button size="small" @click="viewRuns(row.id)">记录</el-button>
              <el-popconfirm title="确定删除？" @confirm="deleteTask(row.id)">
                <template #reference>
                  <el-button size="small" type="danger" text>删除</el-button>
                </template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- 结果弹窗 -->
    <el-dialog v-model="showResult" title="对比结果" width="800px" destroy-on-close>
      <CompareResultCard v-if="lastResult" :result="lastResult" />
      <template #footer>
        <el-button @click="showResult = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 创建/编辑弹窗 -->
    <el-dialog v-model="showCreateDialog" :title="editingSkill ? '编辑对比配置' : '新建对比'" width="760px" destroy-on-close>
      <el-form :model="form" label-position="top">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" placeholder="如：2026年5月分摊表 vs 工资表名单核对" />
        </el-form-item>
        <el-form-item label="自然语言需求" required>
          <el-input
            v-model="form.instruction"
            type="textarea"
            :rows="4"
            placeholder="例：对员工月度成本分摊表emp_monthly_allocation中的名单与员工月度工资表emp_monthly_salary中的名单进行对比，对比月份是2026.05"
          />
        </el-form-item>
        <el-form-item label="AI 生成配置">
          <div class="generate-row">
            <el-button type="primary" plain :loading="generating" @click="generateParams">AI生成配置</el-button>
            <span class="generate-tip">优先输入自然语言；后端会自动规范化月份、period 和 join_keys。</span>
          </div>
          <el-alert
            v-if="generatedSummary"
            class="generated-summary"
            type="success"
            :closable="false"
            :title="generatedSummary"
          />
        </el-form-item>
        <el-collapse>
          <el-collapse-item title="高级：查看/编辑 CompareSpec JSON" name="json">
            <el-input
              v-model="form.paramsJson"
              type="textarea"
              :rows="10"
              placeholder="点击 AI生成配置 后自动填充；如需高级调试可手工修改"
            />
          </el-collapse-item>
        </el-collapse>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="saveSkill" :loading="saving || generating">保存</el-button>
      </template>
    </el-dialog>

    <!-- 新建任务弹窗 -->
    <el-dialog v-model="showTaskDialog" title="新建定时任务" width="500px" destroy-on-close>
      <el-form :model="taskForm" label-position="top">
        <el-form-item label="任务名称" required>
          <el-input v-model="taskForm.name" placeholder="如：月度花名册对比" />
        </el-form-item>
        <el-form-item label="关联对比配置">
          <el-select v-model="taskForm.skill_id" placeholder="选择已有的对比配置" filterable clearable>
            <el-option
              v-for="s in skillsForSelect"
              :key="s.id"
              :label="s.name"
              :value="s.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="taskForm.description" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showTaskDialog = false">取消</el-button>
        <el-button type="primary" @click="saveTask" :loading="taskSaving">创建</el-button>
      </template>
    </el-dialog>

    <!-- 定时绑定弹窗 -->
    <ScheduleBindingDialog
      v-model="showScheduleDialog"
      :task="scheduleTask"
      @saved="loadTasks"
    />
  </div>
</template>

<script setup lang="ts">
import { formatDateTime } from '@/utils/datetime'
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { dataCompareApi, type SkillOut, type CompareResult, type TaskOut } from '@/api/data-compare'
import CompareResultCard from '@/components/ai/CompareResultCard.vue'
import ScheduleBindingDialog from '@/components/ai/ScheduleBindingDialog.vue'

const router = useRouter()

const activeTab = ref('skills')
const loading = ref(false)
const saving = ref(false)
const generating = ref(false)
const skills = ref<SkillOut[]>([])
const filterStatus = ref('')
const showCreateDialog = ref(false)
const showResult = ref(false)
const editingSkill = ref<SkillOut | null>(null)
const runningId = ref<number | null>(null)
const lastResult = ref<CompareResult | null>(null)
const generatedSummary = ref('')

const form = ref({
  name: '',
  instruction: '',
  paramsJson: '',
})

function resetForm() {
  editingSkill.value = null
  generatedSummary.value = ''
  form.value = { name: '', instruction: '', paramsJson: '' }
}

function openCreateDialog() {
  resetForm()
  showCreateDialog.value = true
}

// Phase 2: Task state
const taskLoading = ref(false)
const taskSaving = ref(false)
const tasks = ref<TaskOut[]>([])
const filterEnabled = ref<boolean | null>(null)
const showTaskDialog = ref(false)
const showScheduleDialog = ref(false)
const scheduleTask = ref<TaskOut | null>(null)
const runningTaskId = ref<number | null>(null)
const skillsForSelect = ref<SkillOut[]>([])

const taskForm = ref({
  name: '',
  skill_id: null as number | null,
  description: '',
})

function statusType(status: string) {
  return status === 'active' ? 'success' : status === 'archived' ? 'info' : 'warning'
}

function statusLabel(status: string) {
  return status === 'active' ? '已启用' : status === 'archived' ? '已归档' : '草稿'
}

function compareTypeLabel(type: string) {
  const map: Record<string, string> = { roster: '名单对比', field: '字段对比', amount: '金额对比' }
  return map[type] || type
}

function taskStatusLabel(s: string) {
  const map: Record<string, string> = { success: '成功', partial_diff: '有差异', failed: '失败' }
  return map[s] || s || '-'
}

function taskStatusTag(s: string): '' | 'success' | 'warning' | 'danger' {
  const map: Record<string, '' | 'success' | 'warning' | 'danger'> = {
    success: 'success', partial_diff: 'warning', failed: 'danger',
  }
  return map[s] || ''
}

function formatTime(iso: string) {
  if (!iso) return ''
  return formatDateTime(iso)
}

function onTabChange(tab: string) {
  if (tab === 'tasks') {
    loadTasks()
    loadSkillsForSelect()
  }
}

async function loadSkills() {
  loading.value = true
  try {
    const data = await dataCompareApi.listSkills({
      status: filterStatus.value || undefined,
    })
    skills.value = data.items
  } catch (e: any) {
    ElMessage.error('加载失败: ' + (e?.message || '未知错误'))
  } finally {
    loading.value = false
  }
}

async function loadSkillsForSelect() {
  try {
    const data = await dataCompareApi.listSkills({ status: 'active' })
    skillsForSelect.value = data.items
  } catch {
    // ignore
  }
}

async function runSkill(id: number) {
  runningId.value = id
  try {
    const data = await dataCompareApi.invokeSkill(id)
    lastResult.value = data.result
    showResult.value = true
    await loadSkills()
  } catch (e: any) {
    ElMessage.error('执行失败: ' + (e?.response?.data?.detail || e?.message || '未知错误'))
  } finally {
    runningId.value = null
  }
}

function editSkill(skill: SkillOut) {
  editingSkill.value = skill
  generatedSummary.value = skill.params?.compare_type
    ? `${compareTypeLabel(skill.params.compare_type)}: ${skill.params.source_a?.table || ''} -> ${skill.params.source_b?.table || ''}`
    : ''
  form.value = {
    name: skill.name,
    instruction: skill.instruction,
    paramsJson: JSON.stringify(skill.params, null, 2),
  }
  showCreateDialog.value = true
}

async function generateParams() {
  if (!form.value.instruction) {
    ElMessage.warning('请先输入自然语言需求')
    return false
  }
  generating.value = true
  try {
    const data = await dataCompareApi.generateSkill({
      instruction: form.value.instruction,
      name: form.value.name || undefined,
    })
    form.value.paramsJson = JSON.stringify(data.params, null, 2)
    generatedSummary.value = data.summary
    ElMessage.success('CompareSpec 已生成并完成规范化')
    return true
  } catch (e: any) {
    ElMessage.error('生成失败: ' + (e?.response?.data?.detail || e?.message || '未知错误'))
    return false
  } finally {
    generating.value = false
  }
}

async function saveSkill() {
  if (!form.value.name || !form.value.instruction) {
    ElMessage.warning('名称和需求描述为必填')
    return
  }

  if (!form.value.paramsJson) {
    const ok = await generateParams()
    if (!ok) return
  }

  let params: any
  try {
    params = form.value.paramsJson ? JSON.parse(form.value.paramsJson) : {}
  } catch {
    ElMessage.error('CompareSpec JSON 格式不合法')
    return
  }

  saving.value = true
  try {
    if (editingSkill.value) {
      await dataCompareApi.updateSkill(editingSkill.value.id, {
        name: form.value.name,
        instruction: form.value.instruction,
        params,
      })
      ElMessage.success('更新成功')
    } else {
      await dataCompareApi.createSkill({
        name: form.value.name,
        instruction: form.value.instruction,
        params,
      })
      ElMessage.success('创建成功')
    }
    showCreateDialog.value = false
    resetForm()
    await loadSkills()
  } catch (e: any) {
    ElMessage.error('保存失败: ' + (e?.response?.data?.detail || e?.message || '未知错误'))
  } finally {
    saving.value = false
  }
}


async function deleteSkill(id: number) {
  try {
    await dataCompareApi.deleteSkill(id)
    ElMessage.success('删除成功')
    await loadSkills()
  } catch (e: any) {
    ElMessage.error('删除失败: ' + (e?.response?.data?.detail || e?.message || '未知错误'))
  }
}

// Phase 2: Task functions
async function loadTasks() {
  taskLoading.value = true
  try {
    const data = await dataCompareApi.listTasks({
      enabled: filterEnabled.value ?? undefined,
    })
    tasks.value = data.items
  } catch (e: any) {
    ElMessage.error('加载失败: ' + (e?.message || '未知错误'))
  } finally {
    taskLoading.value = false
  }
}

async function saveTask() {
  if (!taskForm.value.name) {
    ElMessage.warning('任务名称为必填')
    return
  }
  if (!taskForm.value.skill_id) {
    ElMessage.warning('请选择关联的对比配置')
    return
  }
  taskSaving.value = true
  try {
    await dataCompareApi.createTask({
      name: taskForm.value.name,
      skill_id: taskForm.value.skill_id,
      description: taskForm.value.description || undefined,
    })
    ElMessage.success('任务创建成功')
    showTaskDialog.value = false
    taskForm.value = { name: '', skill_id: null, description: '' }
    await loadTasks()
  } catch (e: any) {
    ElMessage.error('创建失败: ' + (e?.response?.data?.detail || e?.message || '未知错误'))
  } finally {
    taskSaving.value = false
  }
}

async function runTask(id: number) {
  runningTaskId.value = id
  try {
    await dataCompareApi.runTask(id)
    ElMessage.success('执行完成')
    await loadTasks()
  } catch (e: any) {
    ElMessage.error('执行失败: ' + (e?.response?.data?.detail || e?.message || '未知错误'))
  } finally {
    runningTaskId.value = null
  }
}

function openScheduleDialog(task: TaskOut) {
  scheduleTask.value = task
  showScheduleDialog.value = true
}

function viewRuns(taskId: number) {
  router.push(`/system/data-compare/runs/${taskId}`)
}

async function deleteTask(id: number) {
  try {
    await dataCompareApi.deleteTask(id)
    ElMessage.success('删除成功')
    await loadTasks()
  } catch (e: any) {
    ElMessage.error('删除失败: ' + (e?.response?.data?.detail || e?.message || '未知错误'))
  }
}

onMounted(() => {
  loadSkills()
})
</script>

<style scoped>
.data-compare-page {
  padding: var(--spacing-4, 16px);
  max-width: 1100px;
}

.page-header {
  margin-bottom: 16px;
}

.page-header h2 {
  margin: 0;
  font-size: 18px;
  color: var(--color-text-primary);
}

.tab-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.skill-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.empty {
  text-align: center;
  color: var(--color-text-secondary);
  padding: 40px 0;
}

.skill-card .card-body {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.card-main {
  flex: 1;
}

.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.card-title .name {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.type-tag {
  margin-left: 4px;
}

.card-desc {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-bottom: 6px;
}

.card-meta {
  font-size: 12px;
  color: var(--color-text-secondary);
  display: flex;
  gap: 16px;
}

.card-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  margin-left: 16px;
}

.text-muted {
  color: var(--el-text-color-secondary);
}

.diff-count {
  margin-left: 6px;
  font-size: 12px;
  color: var(--el-color-warning);
}

.generate-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.generate-tip {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.generated-summary {
  margin-top: 10px;
}
</style>

