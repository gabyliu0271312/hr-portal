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
        meta: { label: '报表设计', menuCode: 'report.list' },
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
        meta: { label: '分摊方案配置', menuCode: 'tools.cost_allocation' },
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

  // 菜单级权限校验：路由有 menuCode 时必须在用户菜单清单里
  const code = to.meta.menuCode as string | null | undefined
  if (code && !userStore.menus.some((m) => m.code === code)) {
    return { name: 'Home' }
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
