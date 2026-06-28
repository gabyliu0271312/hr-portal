<template>
  <div class="data-compare-page">
    <div class="page-header">
      <h2>数据对比</h2>
      <el-button type="primary" @click="openCreateDialog">新建对比</el-button>
    </div>

    <!-- 筛选 -->
    <div class="filter-bar">
      <el-select v-model="filterStatus" placeholder="状态筛选" clearable style="width: 140px" @change="loadSkills">
        <el-option label="全部" value="" />
        <el-option label="草稿" value="draft" />
        <el-option label="已启用" value="active" />
        <el-option label="已归档" value="archived" />
      </el-select>
    </div>

    <!-- 卡片列表 -->
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
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { dataCompareApi, type SkillOut, type CompareResult } from '@/api/data-compare'
import CompareResultCard from '@/components/ai/CompareResultCard.vue'

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

function formatTime(iso: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('zh-CN')
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

async function runSkill(id: number) {
  runningId.value = id
  try {
    const data = await dataCompareApi.invokeSkill(id)
    lastResult.value = data.result
    showResult.value = true
    await loadSkills() // 刷新列表
  } catch (e: any) {
    ElMessage.error('执行失败: ' + (e?.response?.data?.detail || e?.message || '未知错误'))
  } finally {
    runningId.value = null
  }
}

function editSkill(skill: SkillOut) {
  editingSkill.value = skill
  generatedSummary.value = skill.params?.compare_type
    ? `${compareTypeLabel(skill.params.compare_type)}：${skill.params.source_a?.table || ''} → ${skill.params.source_b?.table || ''}`
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
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.page-header h2 {
  margin: 0;
  font-size: 18px;
  color: var(--color-text-primary);
}

.filter-bar {
  margin-bottom: 16px;
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
</style>
