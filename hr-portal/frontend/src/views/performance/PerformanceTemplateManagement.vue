<template>
  <div class="template-page">
    <div class="template-title">绩效模板</div>

    <section class="template-content" aria-label="绩效模板列表">
      <div class="template-toolbar">
        <div class="toolbar-left">
          <el-button class="create-button" type="primary" @click="openCreatePage">
            <el-icon><Plus /></el-icon>
            <span>新建</span>
          </el-button>
        </div>
        <div class="toolbar-right">
          <el-input v-model="keyword" class="template-search" clearable placeholder="通过名称、备注搜索" aria-label="通过名称、备注搜索">
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <el-button class="filter-button" aria-label="筛选模板" @click="showComingSoon('筛选')">
            <el-icon><Filter /></el-icon>
          </el-button>
        </div>
      </div>

      <div v-if="loading" class="template-loading" role="status">正在加载绩效模板...</div>
      <div v-else-if="filteredTemplates.length === 0" class="template-empty">
        <el-empty :description="keyword ? '没有找到匹配的绩效模板' : '暂无绩效模板'" />
      </div>
      <div v-else class="template-table-wrap">
        <el-table :data="filteredTemplates" stripe style="width: 100%" max-height="600" row-key="name">
          <el-table-column prop="name" label="名称" min-width="220" />
          <el-table-column prop="description" label="描述" min-width="300" show-overflow-tooltip />
          <el-table-column label="状态" min-width="130">
            <template #default="{ row }">
              <span class="status-badge" :class="`status-${row.status}`">
                <i aria-hidden="true"></i>{{ row.status === 'active' ? '已启用' : '待完成配置' }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" label="创建时间" min-width="170" />
          <el-table-column label="操作" width="190" fixed="right">
            <template #default="{ row }">
              <div class="row-actions">
                <el-button link type="primary" @click="showComingSoon(`编辑模板：${row.name}`)">编辑</el-button>
                <el-button link type="primary" :disabled="row.status === 'inactive'" @click="showComingSoon('启用')">{{ row.status === 'active' ? '停用' : '启用' }}</el-button>
                <el-dropdown trigger="click" @command="(action: string) => showComingSoon(`${action}模板：${row.name}`)">
                  <el-button class="more-button" link aria-label="更多操作"><el-icon><MoreFilled /></el-icon></el-button>
                  <template #dropdown>
                    <el-dropdown-menu class="template-action-menu">
                      <el-dropdown-item command="复制">复制</el-dropdown-item>
                      <el-dropdown-item command="删除">删除</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div class="template-pagination" aria-label="模板分页">
        <span>共 {{ filteredTemplates.length }} 条</span>
        <el-button link disabled aria-label="上一页"><el-icon><ArrowLeftBold /></el-icon></el-button>
        <button class="page-current" type="button" aria-current="page">1</button>
        <el-button link disabled aria-label="下一页"><el-icon><ArrowRightBold /></el-icon></el-button>
        <span class="page-size">10 条/页 <el-icon><ArrowDown /></el-icon></span>
      </div>
    </section>

    <el-alert v-if="notice" class="template-notice" :title="notice" type="info" show-icon closable @close="notice = ''" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { performanceTemplateApi } from '@/api/performance'
import { ArrowDown, ArrowLeftBold, ArrowRightBold, Filter, MoreFilled, Plus, Search } from '@element-plus/icons-vue'

type TemplateStatus = 'active' | 'inactive'

interface PerformanceTemplate {
  name: string
  description: string
  status: TemplateStatus
  createdAt: string
}

const keyword = ref('')
const loading = ref(false)
const notice = ref('')
const router = useRouter()

const seedTemplates: PerformanceTemplate[] = [
  { name: '11', description: '--', status: 'inactive', createdAt: '2026-08-07 13:10' },
  { name: '半年度绩效评估（2026模板）', description: '半年度评估-360自愿评估-无投入度价值观', status: 'active', createdAt: '2026-06-22 15:05' },
  { name: '全年度绩效评估', description: '全年度评估-360自愿评估', status: 'active', createdAt: '2023-12-12 16:08' },
  { name: '半年度绩效评估', description: '半年度评估-360自愿评估', status: 'active', createdAt: '2023-06-15 17:31' },
  { name: '2022年全年度绩效评估', description: '创梦总部-2022年度评估', status: 'active', createdAt: '2022-12-06 17:50' },
  { name: '2022年半年度绩效评估', description: '创梦总部-2022半年度评估', status: 'active', createdAt: '2022-06-13 15:00' },
  { name: '2021年下半年度绩效评估', description: '--', status: 'active', createdAt: '2021-11-29 11:12' },
]
const templates = ref<PerformanceTemplate[]>([...seedTemplates])

const filteredTemplates = computed(() => {
  const normalizedKeyword = keyword.value.trim().toLowerCase()
  return templates.value.filter((template) => !normalizedKeyword || `${template.name} ${template.description}`.toLowerCase().includes(normalizedKeyword))
})

function openCreatePage() {
  void router.push({ name: 'PerformanceTemplateCreate' })
}

function showComingSoon(action: string) {
  notice.value = `${action}功能将在后续模板配置阶段开放，当前仅展示列表原型。`
}

onMounted(async () => {
  try {
    const persisted = await performanceTemplateApi.list()
    const persistedRows = persisted.map((template) => ({
      name: template.name,
      description: template.description || '--',
      status: 'inactive' as TemplateStatus,
      createdAt: template.created_at ? new Date(template.created_at).toLocaleString('zh-CN', { hour12: false }).replaceAll('/', '-') : '--',
    }))
    const names = new Set(persistedRows.map((template) => template.name))
    templates.value = [...persistedRows, ...seedTemplates.filter((template) => !names.has(template.name))]
  } catch {
    // Keep the reference rows visible when the list API is temporarily unavailable.
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.template-page { min-height: calc(100vh - 56px); padding: 20px; box-sizing: border-box; color: #1f2329; }
.template-title { margin-bottom: 16px; font-size: 18px; font-weight: 600; line-height: 26px; }
.template-content { min-height: calc(100vh - 138px); padding: 20px; box-sizing: border-box; border-radius: 8px; background: #fff; box-shadow: 0 1px 4px rgba(31, 35, 41, .05); }
.template-toolbar { display: flex; align-items: center; justify-content: space-between; min-height: 32px; margin-bottom: 16px; }
.toolbar-left, .toolbar-right, .row-actions { display: flex; align-items: center; }
.toolbar-right { gap: 12px; }
.create-button { min-width: 80px; height: 32px; padding: 4px 11px; border-radius: 6px; }
.template-search { width: 210px; }
.template-search :deep(.el-input__wrapper) { min-height: 32px; padding: 4px 8px 4px 11px; border: 1px solid #d0d3d6; border-radius: 6px; box-shadow: none; }
.filter-button { width: 40px; height: 32px; padding: 4px 11px; border-color: #d0d3d6; border-radius: 6px; }
.template-table-wrap { overflow-x: auto; }
.status-badge { display: inline-flex; align-items: center; gap: 6px; color: #646a73; white-space: nowrap; }
.status-badge i { width: 6px; height: 6px; border-radius: 50%; background: #f5920a; }
.status-active { color: #1f2329; }.status-active i { background: #12b76a; }
.row-actions { gap: 2px; white-space: nowrap; }.row-actions :deep(.el-button) { padding: 4px 6px; }.more-button { width: 28px; }
:global(.template-action-menu) { min-width: 67px; margin: 0; padding: 2px 0; border: 1px solid #dee0e3; border-radius: 6px; box-shadow: 0 8px 24px 8px rgba(31, 35, 41, .04), 0 6px 12px rgba(31, 35, 41, .04), 0 4px 8px -8px rgba(31, 35, 41, .06); }
:global(.template-action-menu .el-dropdown-menu__item) { min-width: 60px; height: 37px; margin: 1px 3px; padding: 7px 16px; border-radius: 4px; color: #1f2329; font-size: 14px; line-height: 22px; }
:global(.template-action-menu .el-dropdown-menu__item:hover) { background: rgba(31, 35, 41, .08); color: #1f2329; }
.template-loading, .template-empty { min-height: 280px; display: grid; place-items: center; color: #646a73; }
.template-pagination { display: flex; align-items: center; justify-content: flex-end; gap: 8px; min-height: 40px; margin-top: 16px; color: #646a73; font-size: 14px; }
.template-pagination :deep(.el-button) { width: 28px; height: 28px; padding: 0; }.page-current { width: 28px; height: 28px; border: 1px solid #3370ff; border-radius: 4px; background: #fff; color: #3370ff; }.page-size { display: inline-flex; align-items: center; gap: 4px; margin-left: 8px; }
.template-notice { position: fixed; right: 24px; bottom: 24px; z-index: 10; width: min(440px, calc(100vw - 48px)); }
@media (max-width: 640px) { .template-toolbar { align-items: stretch; flex-direction: column; gap: 12px; }.toolbar-right { justify-content: flex-end; }.template-search { flex: 1; width: auto; } }
</style>

