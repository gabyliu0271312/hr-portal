import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { getToken, setUnauthorizedHandler } from '@/api/client'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/auth/Login.vue'),
    meta: { public: true },
  },
  {
    path: '/auth/feishu/callback',
    name: 'FeishuCallback',
    component: () => import('@/views/auth/FeishuCallback.vue'),
    meta: { public: true },
  },
  {
    path: '/',
    component: () => import('@/layouts/Default.vue'),
    children: [
      {
        path: '',
        redirect: '/home',
      },
      {
        path: 'home',
        name: 'Home',
        component: () => import('@/views/Home.vue'),
        meta: { label: '首页', menuCode: null },
      },
      {
        path: 'system/users',
        name: 'SystemUsers',
        component: () => import('@/views/system/Users.vue'),
        meta: { label: '用户管理', menuCode: 'system.users' },
      },
      {
        path: 'system/roles',
        name: 'SystemRoles',
        component: () => import('@/views/system/Roles.vue'),
        meta: { label: '角色配置', menuCode: 'system.roles' },
      },
      {
        path: 'system/scopes',
        name: 'SystemScopes',
        component: () => import('@/views/system/Scopes.vue'),
        meta: { label: '管理单元', menuCode: 'system.scopes' },
      },
      {
        path: 'system/field-categories',
        name: 'SystemFieldCategories',
        component: () => import('@/views/system/FieldCategory.vue'),
        meta: { label: '字段分类', menuCode: 'system.field_categories' },
      },
      {
        path: 'system/field-columns',
        name: 'SystemFieldColumns',
        component: () => import('@/views/system/FieldColumns.vue'),
        meta: { label: '字段管理', menuCode: 'system.field_columns' },
      },
      {
        path: 'system/compensation-caps',
        name: 'SystemCompensationCaps',
        component: () => import('@/views/system/CompensationCaps.vue'),
        meta: { label: '补偿金上限维护', menuCode: 'system.compensation_caps' },
      },
      {
        path: 'system/document-templates',
        name: 'SystemDocumentTemplates',
        component: () => import('@/views/system/DocumentTemplates.vue'),
        meta: { label: '模板维护', menuCode: 'system.document_templates' },
      },
      {
        path: 'system/ai-config',
        name: 'SystemAiConfig',
        component: () => import('@/views/system/AiConfig.vue'),
        meta: { label: 'AI 基础配置', menuCode: 'system.ai_config' },
      },
      {
        path: 'system/function-library',
        name: 'SystemFunctionLibrary',
        component: () => import('@/views/system/FunctionLibrary.vue'),
        meta: { label: '函数库管理', menuCode: 'system.function_library' },
      },
      {
        path: 'system/logs/ai',
        name: 'SystemAiLogs',
        component: () => import('@/views/system/SystemLogs.vue'),
        meta: { label: 'AI 调用日志', menuCode: 'system.logs.ai' },
      },
      {
        path: 'system/logs/operation',
        name: 'SystemOperationLogs',
        component: () => import('@/views/system/OperationLogs.vue'),
        meta: { label: '操作日志', menuCode: 'system.logs.operation' },
      },
      {
        path: 'system/data-compare',
        name: 'DataCompareTaskList',
        component: () => import('@/views/system/DataCompareTaskList.vue'),
        meta: { label: '数据对比', menuCode: 'system.data_compare' },
      },
      {
        path: 'datasource/endpoints',
        name: 'DatasourceEndpoints',
        component: () => import('@/views/datasource/Endpoints.vue'),
        meta: { label: '接口配置', menuCode: 'datasource.endpoints' },
      },
      {
        path: 'datasource/sync-runs',
        name: 'DatasourceSyncRuns',
        component: () => import('@/views/datasource/SyncRuns.vue'),
        meta: { label: '同步历史', menuCode: 'datasource.sync_runs' },
      },
      // ===== UCP 数据连接平台（导航重构 v2：7 项四字菜单，扁平化）=====
      {
        path: 'ucp',
        name: 'UcpIndex',
        component: () => import('@/views/ucp/UcpOverview.vue'),
        meta: { label: '数据连接概览', menuCode: 'ucp' },
      },
      { path: 'ucp/systems', name: 'UcpSystems', component: () => import('@/views/ucp/tabs/SystemsTabView.vue'), meta: { label: '接入系统', menuCode: 'ucp.systems' } },
      { path: 'ucp/pipelines', name: 'UcpPipelines', component: () => import('@/views/ucp/PipelineListView.vue'), meta: { label: '流程编排', menuCode: 'ucp.pipelines' } },
      { path: 'ucp/pipelines/designer', name: 'UcpPipelineDesigner', component: () => import('@/views/ucp/PipelineDesignerView.vue'), meta: { label: '流程设计器', menuCode: 'ucp.pipelines', hideInMenu: true, hideAside: true } },
      { path: 'ucp/runs', name: 'UcpRuns', component: () => import('@/views/ucp/PipelineExecList.vue'), meta: { label: '运行中心', menuCode: 'ucp.executions' } },
      { path: 'ucp/runs/:id', name: 'UcpRunDetail', component: () => import('@/views/ucp/PipelineExecDetail.vue'), meta: { label: '运行详情', menuCode: 'ucp.executions', hideInMenu: true } },
      { path: 'ucp/events', name: 'UcpEvents', component: () => import('@/views/ucp/EventListView.vue'), meta: { label: '事件处理', menuCode: 'ucp.events' } },
      { path: 'ucp/events/triggers', name: 'UcpTriggers', component: () => import('@/views/ucp/EventTriggerConfigView.vue'), meta: { label: '触发规则', menuCode: 'ucp.events', hideInMenu: true } },
      { path: 'ucp/events/dead-letters', name: 'UcpDeadLetters', component: () => import('@/views/ucp/DeadLetterListView.vue'), meta: { label: '死信队列', menuCode: 'ucp.events', hideInMenu: true } },
      { path: 'ucp/events/:eventId', name: 'UcpEventDetail', component: () => import('@/views/ucp/EventDetailView.vue'), meta: { label: '事件详情', menuCode: 'ucp.events', hideInMenu: true } },
      { path: 'ucp/monitor', name: 'UcpMonitor', component: () => import('@/views/ucp/MonitorDashboardView.vue'), meta: { label: '监控告警', menuCode: 'ucp.monitor' } },
      { path: 'ucp/monitor/templates', name: 'UcpNotificationTemplates', component: () => import('@/views/ucp/NotificationTemplateList.vue'), meta: { label: '通知模板', menuCode: 'ucp.monitor', hideInMenu: true } },
      { path: 'ucp/scenarios', name: 'UcpScenarios', component: () => import('@/views/ucp/ScenarioListView.vue'), meta: { label: '场景方案', menuCode: 'ucp.scenarios' } },
      { path: 'ucp/scenarios/oa-sync', name: 'UcpOaSync', component: () => import('@/views/ucp/OaSyncView.vue'), meta: { label: 'OA 组织同步', menuCode: 'ucp.scenarios', hideInMenu: true } },
      { path: 'ucp/scenarios/external-accounts', name: 'UcpExternalAccounts', component: () => import('@/views/ucp/ExternalAccountListView.vue'), meta: { label: '外部账号', menuCode: 'ucp.scenarios', hideInMenu: true } },
      { path: 'ucp/scenarios/account-lifecycle', name: 'UcpAccountLifecycle', component: () => import('@/views/ucp/AccountLifecycleRuleView.vue'), meta: { label: '????????', menuCode: 'ucp.scenarios', hideInMenu: true } },
      { path: 'ucp/assets', name: 'UcpAssetCatalog', component: () => import('@/views/ucp/AssetCatalogView.vue'), meta: { label: '资产治理', menuCode: 'ucp.assets' } },
      // 旧路由重定向
      { path: 'ucp/executions', redirect: '/ucp/runs' },
      { path: 'ucp/executions/:id', redirect: (to: any) => ({ path: `/ucp/runs/${to.params.id}` }) },
      { path: 'ucp/triggers', redirect: '/ucp/events/triggers' },
      { path: 'ucp/dead-letters', redirect: '/ucp/events/dead-letters' },
      { path: 'ucp/oa-sync', redirect: '/ucp/scenarios/oa-sync' },
      { path: 'ucp/external-accounts', redirect: '/ucp/scenarios/external-accounts' },
      { path: 'ucp/pipeline-designer', redirect: '/ucp/pipelines/designer' },
      { path: 'ucp/pipeline-designer/:templateCode', redirect: (to: any) => ({ path: '/ucp/pipelines/designer', query: { code: to.params.templateCode } }) },
      { path: 'ucp/pipelines/create', redirect: '/ucp/pipelines/designer' },
      { path: 'ucp/pipelines/:id/edit', redirect: (to: any) => ({ path: '/ucp/pipelines/designer', query: { code: to.params.id } }) },
      { path: 'ucp/notification-templates', redirect: '/ucp/monitor/templates' },
      // 隐藏路由（详情页/管理页，不在侧边栏显示）
      { path: 'ucp/credentials', name: 'UcpCredentials', component: () => import('@/views/ucp/CredentialListView.vue'), meta: { label: '凭证管理', menuCode: 'ucp.systems', hideInMenu: true } },
      { path: 'ucp/approvals', name: 'UcpApprovals', component: () => import('@/views/ucp/ApprovalInboxView.vue'), meta: { label: '审批中心', menuCode: 'ucp.scenarios', hideInMenu: true } },
      { path: 'ucp/circuits', name: 'UcpCircuitBreaker', component: () => import('@/views/ucp/CircuitBreakerStatus.vue'), meta: { label: '熔断与限流', menuCode: 'ucp.monitor', hideInMenu: true } },
      { path: 'ucp/adapter-registry', name: 'UcpAdapterRegistry', component: () => import('@/views/ucp/AdapterRegistryView.vue'), meta: { label: '适配器注册', menuCode: 'ucp.systems', hideInMenu: true } },
      { path: 'ucp/api-templates', name: 'UcpApiTemplates', component: () => import('@/views/ucp/ApiTemplateLibrary.vue'), meta: { label: 'API 模板库', menuCode: 'ucp.systems', hideInMenu: true } },
      { path: 'ucp/topology', name: 'UcpTopology', component: () => import('@/views/ucp/TopologyView.vue'), meta: { label: '依赖拓扑', menuCode: 'ucp.assets', hideInMenu: true } },
      { path: 'ucp/sla', name: 'UcpSla', component: () => import('@/views/ucp/SlaConfigView.vue'), meta: { label: 'SLA 管理', menuCode: 'ucp.assets', hideInMenu: true } },
      { path: 'ucp/changes', name: 'UcpChanges', component: () => import('@/views/ucp/ChangeManagementView.vue'), meta: { label: '变更管理', menuCode: 'ucp.assets', hideInMenu: true } },
      { path: 'ucp/master-data', name: 'UcpMasterData', component: () => import('@/views/ucp/MasterDataView.vue'), meta: { label: '主数据治理', menuCode: 'ucp.assets', requiredMenuCode: 'ucp.governance', hideInMenu: true } },
      { path: 'ucp/diff', name: 'UcpDiff', component: () => import('@/views/ucp/DiffJobView.vue'), meta: { label: '差异检测', menuCode: 'ucp.assets', requiredMenuCode: 'ucp.governance', hideInMenu: true } },
      { path: 'ucp/quality', name: 'UcpQuality', component: () => import('@/views/ucp/QualityRuleView.vue'), meta: { label: '质量规则', menuCode: 'ucp.assets', requiredMenuCode: 'ucp.governance', hideInMenu: true } },
      { path: 'ucp/conflicts', name: 'UcpConflicts', component: () => import('@/views/ucp/ConflictWorkbench.vue'), meta: { label: '冲突工作台', menuCode: 'ucp.assets', requiredMenuCode: 'ucp.governance', hideInMenu: true } },
      { path: 'ucp/governance', name: 'UcpGovernance', component: () => import('@/views/ucp/GovernanceTaskView.vue'), meta: { label: '治理任务', menuCode: 'ucp.assets', requiredMenuCode: 'ucp.governance', hideInMenu: true } },
      {
        path: 'datasource/datasets',
        name: 'DatasourceDatasets',
        component: () => import('@/views/datasource/Datasets.vue'),
        meta: { label: '表间关联', menuCode: 'datasource.datasets' },
      },
      {
        path: 'datasource/datasets/:id',
        name: 'DatasetEdit',
        component: () => import('@/views/datasource/DatasetEdit.vue'),
        meta: { label: '数据集设计', menuCode: 'datasource.datasets' },
      },
      {
        path: 'data/view',
        name: 'DataView',
        component: () => import('@/views/data/DataView.vue'),
        meta: { label: '数据视图', menuCode: 'data.view' },
      },
      {
        path: 'data/:table',
        name: 'DataTable',
        component: () => import('@/views/data/DataTableView.vue'),
        meta: { label: '数据表' },
      },
      {
        path: 'report/list',
        name: 'ReportList',
        component: () => import('@/views/report/ReportList.vue'),
        meta: { label: '报表管理', menuCode: 'report.list' },
      },
      {
        path: 'report/designer/:id',
        name: 'ReportDesigner',
        component: () => import('@/views/report/ReportDesigner.vue'),
        meta: { label: '报表设计', menuCode: 'report.list', hideAside: true },
      },
      {
        path: 'report/run/:id',
        name: 'ReportRun',
        component: () => import('@/views/report/ReportRun.vue'),
        meta: { label: '查看报表', menuCode: 'report.list' },
      },
      {
        path: 'tools/allocation-designer/:id',
        name: 'AllocationSchemeDesigner',
        component: () => import('@/views/tools/AllocationSchemeDesigner.vue'),
        meta: { label: '分摊方案配置', menuCode: 'tools.cost_allocation', hideAside: true },
      },
      {
        path: 'tools/cost-allocation',
        name: 'CostAllocation',
        component: () => import('@/views/tools/CostAllocation.vue'),
        meta: { label: '成本分摊', menuCode: 'tools.cost_allocation' },
      },
      {
        path: 'tools/center',
        name: 'ToolsCenter',
        component: () => import('@/views/tools/ToolCenter.vue'),
        meta: { label: '工具中心', menuCode: 'tools.center' },
      },
      {
        path: 'tools/table-merge',
        name: 'TableMerge',
        component: () => import('@/views/tools/TableMerge.vue'),
        meta: { label: '表格归集', menuCode: 'table_tools' },
      },
      {
        path: 'tools/compensation-calc',
        name: 'CompensationCalc',
        component: () => import('@/views/tools/CompensationCalc.vue'),
        meta: { label: '补偿金计算', menuCode: 'tools.compensation_calc' },
      },
      {
        path: 'tools/income-certificate',
        name: 'IncomeCertificate',
        component: () => import('@/views/tools/IncomeCertificate.vue'),
        meta: { label: '证明开具', menuCode: 'tools.income_certificate' },
      },
      {
        path: 'cost-allocation-system',
        name: 'CostAllocationSystemEntry',
        component: () => import('@/views/costAllocation/Entry.vue'),
        meta: { label: '成本分摊系统入口', menuCode: 'cost_allocation.app', entryType: 'app' },
      },
      {
        path: 'cost-allocation-system/admin',
        name: 'CostAllocationSystemAdminEntry',
        component: () => import('@/views/costAllocation/Entry.vue'),
        meta: { label: '成本分摊后台入口', menuCode: 'cost_allocation.admin', entryType: 'admin' },
      },
      // ==================== 数据仓库 ====================
      {
        path: 'warehouse',
        name: 'Warehouse',
        component: () => import('@/views/warehouse/WarehouseHome.vue'),
        meta: { label: '数据仓库', menuCode: 'warehouse' },
      },
      {
        path: 'warehouse/assets',
        name: 'WarehouseAssets',
        component: () => import('@/views/warehouse/WarehouseAssets.vue'),
        meta: { label: '数据资产', menuCode: 'warehouse.assets' },
      },
      {
        path: 'warehouse/assets/:tableName',
        name: 'WarehouseAssetDetail',
        component: () => import('@/views/warehouse/WarehouseAssetDetail.vue'),
        meta: { label: '资产详情', menuCode: 'warehouse.assets' },
      },
      {
        path: 'warehouse/assets/:table/columns',
        name: 'WarehouseAssetColumns',
        component: () => import('@/views/warehouse/WarehouseAssetColumns.vue'),
        meta: { label: '字段管理', menuCode: 'warehouse.assets' },
      },
      {
        path: 'warehouse/modeling',
        name: 'WarehouseModeling',
        component: () => import('@/views/warehouse/WarehouseModeling.vue'),
        meta: { label: '数据建模', menuCode: 'warehouse.modeling' },
      },
      {
        path: 'warehouse/modeling/quick',
        redirect: '/warehouse/modeling/visual',
        meta: { label: '快速关联', menuCode: 'warehouse.modeling' },
      },
      {
        path: 'warehouse/modeling/visual/:id?',
        name: 'WarehouseModelingVisual',
        component: () => import('@/views/warehouse/WarehouseModelingVisual.vue'),
        meta: { label: '可视化建模', menuCode: 'warehouse.modeling', hideAside: true },
      },
      {
        path: 'warehouse/data-recipe',
        name: 'WarehouseDataRecipe',
        component: () => import('@/views/warehouse/WarehouseDataRecipe.vue'),
        meta: { label: '数据清洗', menuCode: 'warehouse.cleaning' },
      },
      {
        path: 'warehouse/snapshots',
        name: 'WarehouseSnapshots',
        component: () => import('@/views/warehouse/WarehouseSnapshots.vue'),
        meta: { label: '快照管理', menuCode: 'warehouse.modeling' },
      },
      {
        path: 'warehouse/scd',
        name: 'WarehouseScd',
        component: () => import('@/views/warehouse/WarehouseScd.vue'),
        meta: { label: 'SCD 拉链', menuCode: 'warehouse.modeling' },
      },
      {
        path: 'warehouse/service',
        name: 'WarehouseDataService',
        component: () => import('@/views/warehouse/WarehouseDataService.vue'),
        meta: { label: '数据服务', menuCode: 'warehouse.service' },
      },
      {
        path: 'warehouse/ads',
        redirect: '/warehouse/service',
      },
      {
        path: 'warehouse/metrics',
        name: 'WarehouseMetrics',
        component: () => import('@/views/warehouse/WarehouseMetrics.vue'),
        meta: { label: '指标管理', menuCode: 'warehouse.metrics' },
      },
      {
        path: 'warehouse/dimensions',
        name: 'WarehouseDimension',
        component: () => import('@/views/warehouse/WarehouseDimension.vue'),
        meta: { label: '维度管理', menuCode: 'warehouse.dimensions' },
      },
      {
        path: 'warehouse/dws-aggregates',
        name: 'WarehouseDwsAggregate',
        component: () => import('@/views/warehouse/WarehouseDwsAggregate.vue'),
        meta: { label: 'DWS 聚合', menuCode: 'warehouse.dws_aggregates' },
      },
      {
        path: 'warehouse/governance',
        name: 'WarehouseGovernance',
        component: () => import('@/views/warehouse/WarehouseGovernance.vue'),
        meta: { label: '数据治理', menuCode: 'warehouse.governance' },
      },
      {
        path: 'warehouse/lineage',
        name: 'WarehouseLineage',
        component: () => import('@/views/warehouse/WarehouseLineage.vue'),
        meta: { label: '数据血缘', menuCode: 'warehouse.governance' },
      },
      {
        path: 'warehouse/quality',
        name: 'WarehouseQuality',
        component: () => import('@/views/warehouse/WarehouseQuality.vue'),
        meta: { label: '数据质量', menuCode: 'warehouse.governance' },
      },
      {
        path: 'warehouse/monitor',
        name: 'WarehouseMonitor',
        component: () => import('@/views/warehouse/WarehouseMonitor.vue'),
        meta: { label: '执行监控', menuCode: 'warehouse.governance' },
      },
      {
        path: 'warehouse/impact',
        name: 'WarehouseImpact',
        component: () => import('@/views/warehouse/WarehouseImpact.vue'),
        meta: { label: '影响分析', menuCode: 'warehouse.impact' },
      },
      {
        path: 'warehouse/automation',
        name: 'WarehouseAutomation',
        component: () => import('@/views/warehouse/WarehouseAutomation.vue'),
        meta: { label: '自动化配置', menuCode: 'warehouse.automation' },
      },
      {
        path: 'automation/rules',
        name: 'AutomationRuleList',
        component: () => import('@/views/automation/AutomationRuleList.vue'),
        meta: { label: '自动通知', menuCode: 'automation.rules' },
      },
      {
        path: 'automation/rules/create',
        name: 'AutomationRuleCreate',
        component: () => import('@/views/automation/AutomationRuleEditor.vue'),
        meta: { label: '新建通知', menuCode: 'automation.rules', hideAside: true },
      },
      {
        path: 'automation/rules/:id',
        name: 'AutomationRuleEdit',
        component: () => import('@/views/automation/AutomationRuleEditor.vue'),
        meta: { label: '编辑通知', menuCode: 'automation.rules', hideAside: true },
      },
      {
        path: 'automation/executions',
        name: 'AutomationExecutions',
        component: () => import('@/views/automation/AutomationExecutions.vue'),
        meta: { label: '通知记录', menuCode: 'automation.rules' },
      },
    ],
  },
  {
    path: '/performance',
    component: () => import('@/layouts/PerformanceLayout.vue'),
    meta: { menuCode: 'performance.app' },
    children: [
      {
        path: '',
        redirect: '/performance/workbench',
      },
      {
        path: 'workbench',
        name: 'PerformanceWorkbench',
        component: () => import('@/views/performance/Workbench.vue'),
        meta: { label: '绩效工作台', menuCode: 'performance.app' },
      },
      {
        path: 'review',
        name: 'PerformanceReview',
        component: () => import('@/views/performance/Review.vue'),
        meta: { label: '绩效评估', menuCode: 'performance.app' },
      },
      {
        path: 'projects',
        name: 'PerformanceProjects',
        component: () => import('@/views/performance/Projects.vue'),
        meta: { label: '项目管理', menuCode: 'performance.app' },
      },
      {
        path: 'settings',
        name: 'PerformanceSettings',
        component: () => import('@/views/performance/Settings.vue'),
        meta: { label: '绩效后台设置', menuCode: 'performance.admin' },
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/home',
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.onError((error, to) => {
  if (/Failed to fetch dynamically imported module|Unable to preload CSS|Load failed/.test(error.message)) {
    window.location.href = to.fullPath
  }
})

router.beforeEach(async (to) => {
  if (to.meta.public) return true

  const userStore = useUserStore()
  const token = getToken()

  if (!token) {
    return { name: 'Login', query: { redirect: to.fullPath } }
  }

  // 已有 token 但 store 是空的（刷新后），先拉一次 me
  if (!userStore.isLoggedIn) {
    const me = await userStore.refresh()
    if (!me) {
      return { name: 'Login', query: { redirect: to.fullPath } }
    }
  }

  // 菜单级权限校验：requiredMenuCode 优先，menuCode 兜底
  const menuCodes = userStore.menus.map(m => m.code)
  const requiredCode = to.meta.requiredMenuCode as string | null | undefined
  const code = to.meta.menuCode as string | null | undefined
  if (requiredCode) {
    if (!menuCodes.includes(requiredCode)) return { name: 'Home' }
  } else if (code) {
    if (!menuCodes.includes(code)) return { name: 'Home' }
  }

  return true
})

// 401 时让 client 通知路由跳到 /login
setUnauthorizedHandler(() => {
  if (router.currentRoute.value.name !== 'Login') {
    router.push({ name: 'Login' })
  }
})

export default router
