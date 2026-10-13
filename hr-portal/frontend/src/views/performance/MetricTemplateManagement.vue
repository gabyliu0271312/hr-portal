<template>
  <PerformanceListPage title="指标模板">
    <div v-if="loading" role="status">正在加载指标模板</div>
    <div v-else-if="templates.length === 0" class="metric-template-empty-state" role="status">
      <MetricTemplateEmptyIllustration />
      <div class="metric-template-empty-title">暂无内容</div>
      <div class="metric-template-empty-description">可以使用指标模板中设置制定指标规则以及不同人群的指标</div>
      <MetricTemplateActionButtons
        placement="empty"
        @create="createDialogOpen = true"
        @import="notify('导入指标模板功能将在下一阶段开放')"
      />
    </div>

    <template v-else>
      <PerformanceListToolbar
        v-model:keyword="keyword"
        search-placeholder="搜索"
        search-aria-label="搜索指标模板"
        @filter="notify('筛选功能将在指标模板数据接入后开放')"
      >
        <template #left>
          <MetricTemplateActionButtons
            placement="toolbar"
            @create="createDialogOpen = true"
            @import="notify('导入指标模板功能将在下一阶段开放')"
          />
        </template>
      </PerformanceListToolbar>

      <PerformanceManagementTable
        :rows="filteredTemplates"
        :loading="false"
        loading-text="正在加载指标模板"
        empty-text="暂无数据"
        table-aria-label="指标模板列表"
        pagination-aria-label="指标模板分页"
        :show-pagination="false"
      >
        <template #empty>
          <div class="metric-template-empty">暂无数据</div>
        </template>
        <el-table-column prop="name" label="名称" min-width="180" />
        <el-table-column prop="status" label="状态" min-width="120" />
        <el-table-column prop="description" label="描述" min-width="280" show-overflow-tooltip />
        <el-table-column prop="updatedBy" label="更新人" min-width="140" />
        <el-table-column prop="updatedAt" label="最近更新时间" min-width="180" />
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <PerformancePermissionButton
              allowed
              op="U"
              aria-label="编辑指标模板"
              @click="router.push({ name: 'PerformanceMetricTemplateDetail', params: { templateId: row.id } })"
            >编辑</PerformancePermissionButton>
          </template>
        </el-table-column>
      </PerformanceManagementTable>
    </template>

    <MetricTemplateCreateDialog
      v-model="createDialogOpen"
      :saving="createSaving"
      :error-message="createError"
      @confirm="createTemplate"
    />
    <div v-if="notice" class="metric-template-notice" role="alert">{{ notice }}</div>
  </PerformanceListPage>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import MetricTemplateActionButtons from '@/components/performance/MetricTemplateActionButtons.vue'
import { performanceTemplateApi } from '@/api/performance'
import type { MetricTemplateDraft } from '@/components/performance/MetricTemplateCreateDialog.vue'
import MetricTemplateCreateDialog from '@/components/performance/MetricTemplateCreateDialog.vue'
import MetricTemplateEmptyIllustration from '@/components/performance/MetricTemplateEmptyIllustration.vue'
import PerformanceListPage from '@/components/performance/PerformanceListPage.vue'
import PerformanceListToolbar from '@/components/performance/PerformanceListToolbar.vue'
import PerformanceManagementTable from '@/components/performance/PerformanceManagementTable.vue'
import PerformancePermissionButton from '@/components/performance/PerformancePermissionButton.vue'

type MetricTemplate = {
  id: number
  name: string
  status: string
  description: string
  updatedBy: string
  updatedAt: string
}

const router = useRouter()
const loading = ref(false)
const createDialogOpen = ref(false)
const createSaving = ref(false)
const createError = ref('')
const keyword = ref('')
const notice = ref('')
const templates = ref<MetricTemplate[]>([])

const filteredTemplates = computed(() => {
  const normalizedKeyword = keyword.value.trim().toLowerCase()
  if (!normalizedKeyword) return templates.value
  return templates.value.filter((template) => `${template.name} ${template.description}`.toLowerCase().includes(normalizedKeyword))
})

function notify(message: string) {
  notice.value = message
}

function apiErrorMessage(error: any) {
  const detail = error?.response?.data?.detail
  return typeof detail === 'string' ? detail : detail?.message || '模板保存失败，请稍后重试'
}

async function createTemplate(draft: MetricTemplateDraft) {
  if (createSaving.value) return
  createSaving.value = true
  createError.value = ''
  try {
    const created = await performanceTemplateApi.create({
      name: draft.name,
      description: draft.description,
      language: 'zh-CN',
      english_enabled: false,
      audience_settings_enabled: draft.byAudience,
      template_kind: 'metric',
      calculation_enabled: false,
      selected_rules: [],
    })
    createDialogOpen.value = false
    await loadTemplates()
    try {
      await router.push({ name: 'PerformanceMetricTemplateDetail', params: { templateId: created.template_id } })
    } catch { notify('模板已保存，请从列表进入详情') }
  } catch (error) {
    createError.value = apiErrorMessage(error)
  } finally {
    createSaving.value = false
  }
}
async function loadTemplates() {
  loading.value = true
  try {
    templates.value = (await performanceTemplateApi.list('metric')).map(item => ({
      id: item.template_id, name: item.name, description: item.description,
      status: item.status === 'active' ? '启用' : '未启用',
      updatedBy: item.updated_by || '—', updatedAt: item.updated_at || item.created_at,
    }))
  } catch { notify('指标模板列表加载失败，请刷新重试') } finally { loading.value = false }
}
watch(createDialogOpen, open => { if (open) createError.value = '' })
onMounted(() => { void loadTemplates() })
</script>

<style scoped>
.metric-template-empty-state { display: flex; min-height: 493px; flex-direction: column; align-items: center; justify-content: center; color: var(--color-text-primary); font-size: var(--font-size-md); line-height: var(--performance-input-line-height); text-align: center; }
.metric-template-empty-title { font-weight: 700; }
.metric-template-empty-description { margin-top: 4px; color: var(--color-text-secondary); }
.metric-template-empty { display: grid; min-height: 300px; place-items: center; color: var(--color-text-secondary); font-size: 14px; }
.metric-template-notice { position: fixed; right: 24px; bottom: 24px; z-index: 10; max-width: min(440px, calc(100vw - 48px)); padding: 10px 16px; border: 1px solid var(--color-border-light); border-radius: var(--radius-md); background: var(--color-bg-hover); color: var(--color-primary-hover); font-size: 14px; line-height: 22px; }
</style>
