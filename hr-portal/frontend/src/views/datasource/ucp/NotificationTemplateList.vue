<template>
  <div class="notification-template-page">
    <div class="page-header">
      <h2>通知模板管理</h2>
      <p class="desc">管理 UCP 流水线/连接器执行结果通知模板。模板支持 <code v-pre>{{var}}</code> 变量占位符，可一键应用到 pipeline/connector 的 notification_config。</p>
    </div>

    <div class="toolbar">
      <el-input
        v-model="filterKeyword"
        placeholder="搜索模板编码/名称"
        clearable
        style="width: 240px"
        :prefix-icon="Search"
      />
      <el-select v-model="filterScene" placeholder="触发场景" clearable style="width: 140px">
        <el-option
          v-for="(label, value) in ucpApi.NOTIFICATION_SCENE_LABELS"
          :key="value"
          :label="label"
          :value="value"
        />
      </el-select>
      <el-select v-model="filterActive" placeholder="启用状态" clearable style="width: 120px">
        <el-option label="已启用" :value="1" />
        <el-option label="已停用" :value="0" />
      </el-select>
      <el-button :icon="Refresh" @click="loadTemplates">刷新</el-button>
      <PermissionButton type="primary" :icon="Plus" menu="datasource.ucp_config" op="C" @click="openCreateDialog">
        新建模板
      </PermissionButton>
    </div>

    <el-table :data="filteredTemplates" v-loading="loading" stripe size="small">
      <el-table-column prop="template_code" label="模板编码" min-width="160" />
      <el-table-column prop="template_name" label="模板名称" min-width="160" />
      <el-table-column label="触发场景" width="120">
        <template #default="{ row }">
          <el-tag size="small" :type="sceneTagType(row.trigger_scene)">
            {{ row.trigger_scene_label || row.trigger_scene }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="渠道" width="100">
        <template #default="{ row }">
          <el-tag size="small" effect="plain">{{ row.channel }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="title_template" label="标题模板" min-width="200" show-overflow-tooltip />
      <el-table-column label="启用" width="80" align="center">
        <template #default="{ row }">
          <el-tag :type="row.is_active ? 'success' : 'info'" size="small">
            {{ row.is_active ? '已启用' : '已停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="updated_at" label="更新时间" width="180">
        <template #default="{ row }">{{ formatTime(row.updated_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="280" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openPreviewDialog(row)">预览</el-button>
          <el-button link type="primary" size="small" @click="openEditDialog(row)">编辑</el-button>
          <el-button link type="warning" size="small" @click="handleToggle(row)">
            {{ row.is_active ? '停用' : '启用' }}
          </el-button>
          <el-button link type="danger" size="small" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- ===== 新建/编辑对话框 ===== -->
    <el-dialog
      v-model="editDialogVisible"
      :title="editingId ? '编辑通知模板' : '新建通知模板'"
      width="780"
      :close-on-click-modal="false"
    >
      <el-form :model="editForm" :rules="formRules" ref="editFormRef" label-width="120px" size="default">
        <el-form-item label="模板编码" prop="template_code" :required="!editingId">
          <el-input v-model="editForm.template_code" :disabled="!!editingId" placeholder="例如：pipeline_success_default" maxlength="64" />
        </el-form-item>
        <el-form-item label="模板名称" prop="template_name" required>
          <el-input v-model="editForm.template_name" maxlength="128" />
        </el-form-item>
        <el-form-item label="触发场景" prop="trigger_scene" required>
          <el-select v-model="editForm.trigger_scene" style="width: 100%">
            <el-option
              v-for="(label, value) in ucpApi.NOTIFICATION_SCENE_LABELS"
              :key="value"
              :label="label"
              :value="value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="渠道" prop="channel">
          <el-radio-group v-model="editForm.channel">
            <el-radio value="feishu">飞书</el-radio>
            <el-radio value="email">邮件</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="消息格式" prop="message_format">
          <el-radio-group v-model="editForm.message_format">
            <el-radio value="markdown">Markdown</el-radio>
            <el-radio value="text">纯文本</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="标题模板" prop="title_template" required>
          <el-input v-model="editForm.title_template" placeholder="支持 {{var}} 占位符" maxlength="255" />
        </el-form-item>
        <el-form-item label="正文模板" prop="content_template" required>
          <el-input
            v-model="editForm.content_template"
            type="textarea"
            :rows="6"
            placeholder="支持 {{var}} 占位符，可使用多行 markdown"
          />
        </el-form-item>
        <el-form-item label="接收人规则" prop="receivers">
          <el-input
            v-model="receiversText"
            type="textarea"
            :rows="3"
            placeholder='每行一条，例如：config_owner、custom:open_id_xxx、pipeline_owner'
          />
        </el-form-item>
        <el-form-item label="是否启用">
          <el-switch v-model="editForm.is_active_bool" :active-value="1" :inactive-value="0" />
        </el-form-item>
        <el-form-item label="变量说明">
          <el-input
            v-model="variableSchemaText"
            type="textarea"
            :rows="3"
            placeholder="每行 key = 描述，例如：pending_count = 待入职人数"
          />
          <el-text size="small" type="info">用于前端预览面板展示变量含义</el-text>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>

    <!-- ===== 预览对话框 ===== -->
    <el-dialog
      v-model="previewDialogVisible"
      :title="`模板预览 - ${previewResult?.template_code || ''}`"
      width="780"
      :close-on-click-modal="false"
    >
      <div v-if="previewResult" class="preview-content">
        <el-alert
          :title="`渲染结果`"
          type="info"
          :closable="false"
          show-icon
        />
        <el-descriptions :column="1" border size="small" class="mt-12">
          <el-descriptions-item label="标题（渲染后）">
            <pre class="rendered">{{ previewResult.title_rendered }}</pre>
          </el-descriptions-item>
          <el-descriptions-item label="正文（渲染后）">
            <pre class="rendered">{{ previewResult.content_rendered }}</pre>
          </el-descriptions-item>
        </el-descriptions>

        <el-divider content-position="left">变量使用情况</el-divider>
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="使用的变量">
            <el-tag v-for="v in previewResult.variables_used" :key="v" size="small" effect="plain" class="var-tag">
              <span v-pre>{{</span>{{ v }}<span v-pre>}}</span>
            </el-tag>
            <span v-if="previewResult.variables_used.length === 0" class="empty">无</span>
          </el-descriptions-item>
          <el-descriptions-item v-if="previewResult.missing_variables.length" label="未提供的变量">
            <el-tag v-for="v in previewResult.missing_variables" :key="v" type="warning" size="small" effect="plain" class="var-tag">
              <span v-pre>{{</span>{{ v }}<span v-pre>}}</span>
            </el-tag>
          </el-descriptions-item>
        </el-descriptions>
      </div>

      <template #footer>
        <el-button @click="previewDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh, Search } from '@element-plus/icons-vue'
import { ucpApi } from '@/api/ucp'
import PermissionButton from '@/components/PermissionButton.vue'

const templates = ref<any[]>([])
const loading = ref(false)
const saving = ref(false)
const filterKeyword = ref('')
const filterScene = ref<string>('')
const filterActive = ref<number | ''>('')

const editDialogVisible = ref(false)
const editingId = ref<number | null>(null)
const editFormRef = ref<any>()
const editForm = ref<any>({
  template_code: '',
  template_name: '',
  description: '',
  trigger_scene: 'on_success',
  channel: 'feishu',
  message_format: 'markdown',
  title_template: '',
  content_template: '',
  receivers: [],
  variable_schema: {},
  is_active: 1,
  is_active_bool: 1,
})
const receiversText = ref('')
const variableSchemaText = ref('')

const formRules = {
  template_code: [{ required: true, message: '请输入模板编码', trigger: 'blur' }],
  template_name: [{ required: true, message: '请输入模板名称', trigger: 'blur' }],
  trigger_scene: [{ required: true, message: '请选择触发场景', trigger: 'change' }],
  title_template: [{ required: true, message: '请输入标题模板', trigger: 'blur' }],
  content_template: [{ required: true, message: '请输入正文模板', trigger: 'blur' }],
}

const previewDialogVisible = ref(false)
const previewResult = ref<any>(null)

const filteredTemplates = computed(() => {
  return templates.value
})

async function loadTemplates() {
  loading.value = true
  try {
    const res = await ucpApi.listNotificationTemplates({
      keyword: filterKeyword.value || undefined,
      trigger_scene: filterScene.value || undefined,
      is_active: filterActive.value === '' ? undefined : (filterActive.value as number),
    })
    templates.value = res.items || []
  } catch (e: any) {
    ElMessage.error(`加载模板列表失败: ${e?.response?.data?.detail || e?.message || e}`)
  } finally {
    loading.value = false
  }
}

function sceneTagType(scene: string): 'success' | 'danger' | 'warning' | 'info' {
  if (scene === 'on_success') return 'success'
  if (scene === 'on_failure') return 'danger'
  if (scene === 'on_partial_success') return 'warning'
  return 'info'
}

function formatTime(iso: string | null) {
  if (!iso) return '-'
  return iso.replace('T', ' ').slice(0, 19)
}

function openCreateDialog() {
  editingId.value = null
  editForm.value = {
    template_code: '',
    template_name: '',
    description: '',
    trigger_scene: 'on_success',
    channel: 'feishu',
    message_format: 'markdown',
    title_template: '',
    content_template: '',
    receivers: [],
    variable_schema: {},
    is_active: 1,
    is_active_bool: 1,
  }
  receiversText.value = ''
  variableSchemaText.value = ''
  editDialogVisible.value = true
}

function openEditDialog(row: any) {
  editingId.value = row.id
  editForm.value = {
    template_code: row.template_code,
    template_name: row.template_name,
    description: row.description || '',
    trigger_scene: row.trigger_scene,
    channel: row.channel,
    message_format: row.message_format,
    title_template: row.title_template,
    content_template: row.content_template,
    receivers: row.receivers || [],
    variable_schema: row.variable_schema || {},
    is_active: row.is_active,
    is_active_bool: row.is_active,
  }
  receiversText.value = (row.receivers || []).join('\n')
  variableSchemaText.value = Object.entries(row.variable_schema || {})
    .map(([k, v]) => `${k} = ${v}`)
    .join('\n')
  editDialogVisible.value = true
}

function parseReceivers(text: string): string[] {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function parseVariableSchema(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  text.split('\n').forEach((line) => {
    const m = line.match(/^\s*([\w_]+)\s*=\s*(.+)$/)
    if (m) {
      out[m[1]] = m[2].trim()
    }
  })
  return out
}

async function handleSave() {
  try {
    await editFormRef.value.validate()
  } catch {
    return
  }
  saving.value = true
  try {
    const payload: any = {
      template_code: editForm.value.template_code,
      template_name: editForm.value.template_name,
      description: editForm.value.description || undefined,
      trigger_scene: editForm.value.trigger_scene,
      channel: editForm.value.channel,
      message_format: editForm.value.message_format,
      title_template: editForm.value.title_template,
      content_template: editForm.value.content_template,
      receivers: parseReceivers(receiversText.value),
      variable_schema: parseVariableSchema(variableSchemaText.value),
      is_active: editForm.value.is_active_bool,
    }
    if (editingId.value) {
      await ucpApi.updateNotificationTemplate(editingId.value, payload)
    } else {
      await ucpApi.createNotificationTemplate(payload)
    }
    ElMessage.success('保存成功')
    editDialogVisible.value = false
    await loadTemplates()
  } catch (e: any) {
    ElMessage.error(`保存失败: ${e?.response?.data?.detail?.message || e?.response?.data?.detail || e?.message || e}`)
  } finally {
    saving.value = false
  }
}

async function handleToggle(row: any) {
  try {
    await ucpApi.toggleNotificationTemplate(row.id)
    ElMessage.success(`已${row.is_active ? '停用' : '启用'}`)
    await loadTemplates()
  } catch (e: any) {
    ElMessage.error(`操作失败: ${e?.response?.data?.detail || e?.message || e}`)
  }
}

async function handleDelete(row: any) {
  try {
    await ElMessageBox.confirm(
      `确认删除模板「${row.template_name}」？`,
      '删除确认',
      { type: 'warning' },
    )
    await ucpApi.deleteNotificationTemplate(row.id)
    ElMessage.success('已删除')
    await loadTemplates()
  } catch (e: any) {
    if (e === 'cancel') return
    ElMessage.error(`删除失败: ${e?.response?.data?.detail || e?.message || e}`)
  }
}

async function openPreviewDialog(row: any) {
  try {
    const res = await ucpApi.previewNotificationTemplate(row.id)
    previewResult.value = res
    previewDialogVisible.value = true
  } catch (e: any) {
    ElMessage.error(`预览失败: ${e?.response?.data?.detail || e?.message || e}`)
  }
}

onMounted(() => {
  loadTemplates()
})
</script>

<style scoped>
.notification-template-page {
  padding: 16px;
}
.page-header {
  margin-bottom: 16px;
}
.page-header h2 {
  margin: 0 0 4px 0;
  font-size: 20px;
  font-weight: 600;
}
.desc {
  margin: 0;
  color: #909399;
  font-size: 13px;
}
.toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.preview-content {
  padding: 4px;
}
.rendered {
  background: #f5f7fa;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  padding: 8px 12px;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
}
.var-tag {
  margin-right: 6px;
  margin-bottom: 4px;
}
.empty {
  color: #c0c4cc;
  font-size: 13px;
}
.mt-12 {
  margin-top: 12px;
}
</style>
