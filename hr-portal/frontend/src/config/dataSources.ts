/**
 * 数据源类型注册表
 *
 * 每种接入方式（北森报表 API / 北森接口 API / 内部上传 / 通用 HTTP / 数据库直连 ...）
 * 在这里声明它需要的配置字段。接口配置抽屉根据类型动态 render 表单。
 *
 * 新增数据源类型 = 只改这一个文件，UI 自动适配。
 */

export type FieldType = 'text' | 'password' | 'url' | 'textarea' | 'select'

export interface FieldDef {
  /** 字段编码（保存到后端的 key） */
  key: string
  /** 表单 label */
  label: string
  /** 输入类型 */
  type: FieldType
  /** 是否必填 */
  required?: boolean
  /** 默认值 */
  default?: string
  /** 占位提示 */
  placeholder?: string
  /** 字段下方的辅助说明 */
  hint?: string
  /** select 类型的选项 */
  options?: { label: string; value: string }[]
}

export interface FieldGroup {
  /** 分组标题（小写英文 → UI 上转大写） */
  title: string
  fields: FieldDef[]
}

export interface SourceTypeDef {
  /** 类型 code（唯一） */
  code: string
  /** 显示名 */
  label: string
  /** 一行简短描述 */
  description: string
  /** 字段分组定义 */
  groups: FieldGroup[]
  /** 是否支持「测试连接」按钮 */
  testable?: boolean
  /** 默认调度选项（覆盖通用默认） */
  defaultSchedule?: string
}

/** ============================================================
 *  内置数据源类型
 * ============================================================ */

export const SOURCE_TYPES: SourceTypeDef[] = [
  {
    code: 'beisen_report',
    label: '北森报表 API',
    description: '基于 Report ID 拉取花名册、月度工资等业务数据，使用北森报表中心的 GridHeader / GridData 接口',
    testable: true,
    defaultSchedule: '每日 06:00',
    groups: [
      {
        title: '认证信息',
        fields: [
          { key: 'BEISEN_APP_KEY', label: 'AppKey', type: 'text', required: true, placeholder: '北森后台 → 应用管理获取' },
          { key: 'BEISEN_APP_SECRET', label: 'AppSecret', type: 'password', required: true },
          { key: 'BEISEN_REPORT_ID', label: 'Report ID', type: 'text', required: true, placeholder: '北森后台 → 报表管理', hint: '每张表对应一个独立的 Report ID' },
        ],
      },
      {
        title: '接口地址',
        fields: [
          { key: 'BEISEN_TOKEN_URL', label: 'Token 接口', type: 'url', required: true, default: 'https://openapi.italent.cn/token' },
          { key: 'BEISEN_HEADER_URL', label: '表头接口', type: 'url', required: true, default: 'https://openapi.italent.cn/Ocean/api/v2/Reports/GridHeader' },
          { key: 'BEISEN_DATA_URL', label: '数据接口', type: 'url', required: true, default: 'https://openapi.italent.cn/Ocean/api/v2/Reports/GridData' },
        ],
      },
    ],
  },
  {
    code: 'beisen_api',
    label: '北森接口 API',
    description: '北森原生 OpenAPI（如 SearchCostCenter、组织架构、员工档案等），不走报表中心',
    testable: true,
    defaultSchedule: '每日 06:00',
    groups: [
      {
        title: '认证信息',
        fields: [
          { key: 'BEISEN_API_APP_KEY', label: 'AppKey', type: 'text', required: true },
          { key: 'BEISEN_API_APP_SECRET', label: 'AppSecret', type: 'password', required: true },
        ],
      },
      {
        title: '接口地址',
        fields: [
          { key: 'BEISEN_API_TOKEN_URL', label: 'Token 接口', type: 'url', required: true, default: 'https://openapi.italent.cn/token' },
          { key: 'BEISEN_API_DATA_URL', label: '数据接口', type: 'url', required: true, placeholder: '如 https://openapi.italent.cn/compensationv2/v2/PublicData/SearchCostCenter', hint: '不同接入表对应不同接口地址' },
          { key: 'BEISEN_API_METHOD', label: '请求方法', type: 'select', default: 'POST', options: [
            { label: 'POST', value: 'POST' },
            { label: 'GET', value: 'GET' },
          ] },
          { key: 'BEISEN_API_BODY_TEMPLATE', label: '请求体模板（JSON）', type: 'textarea', default: '{"apicode": "cost_center_list"}', placeholder: '{ "apicode": "cost_center_list" }', hint: '北森接口 API 通常需要 apicode 等参数指定具体业务，必填；不同业务对应不同 apicode（如 cost_center_list、employee_list 等）' },
        ],
      },
    ],
  },
  {
    code: 'upload',
    label: '内部上传 (Excel)',
    description: '手动上传 Excel / CSV，或由内部业务系统推送（如成本分摊系统）',
    testable: false,
    defaultSchedule: '手动触发',
    groups: [
      {
        title: '上传规则',
        fields: [
          { key: 'TEMPLATE_URL', label: '模板下载链接', type: 'url', placeholder: '可选 · 留空则使用系统内置模板' },
          { key: 'WEBHOOK_TOKEN', label: 'Webhook Token', type: 'password', hint: '上游系统推送时用作鉴权（如成本分摊系统主动推送数据）' },
          { key: 'FIELD_MAPPING', label: '字段映射 (JSON)', type: 'textarea', placeholder: '{ "源列名": "本地字段", ... }', hint: '上传文件列名与本地字段不一致时使用' },
        ],
      },
    ],
  },
  {
    code: 'http_generic',
    label: '通用 HTTP API',
    description: '对接其他系统的 RESTful API（飞书、企微、SAP、自建系统等），支持多种鉴权方式',
    testable: true,
    defaultSchedule: '每日 06:00',
    groups: [
      {
        title: '认证信息',
        fields: [
          { key: 'HTTP_AUTH_TYPE', label: '鉴权类型', type: 'select', required: true, default: 'bearer', options: [
            { label: 'Bearer Token', value: 'bearer' },
            { label: 'Basic Auth', value: 'basic' },
            { label: 'OAuth2 Client Credentials', value: 'oauth2_cc' },
            { label: 'API Key (Header)', value: 'api_key_header' },
            { label: '无鉴权', value: 'none' },
          ] },
          { key: 'HTTP_CREDENTIAL', label: '凭证内容', type: 'password', placeholder: 'Bearer/Basic 模式填 Token；OAuth2 填 ClientID:Secret', hint: '按鉴权类型填写' },
        ],
      },
      {
        title: '接口地址',
        fields: [
          { key: 'HTTP_BASE_URL', label: 'Base URL', type: 'url', required: true },
          { key: 'HTTP_PATH', label: '请求路径', type: 'text', required: true, placeholder: '/api/v1/xxx' },
          { key: 'HTTP_METHOD', label: '请求方法', type: 'select', default: 'GET', options: [
            { label: 'GET', value: 'GET' },
            { label: 'POST', value: 'POST' },
            { label: 'PUT', value: 'PUT' },
          ] },
          { key: 'HTTP_HEADERS', label: '额外请求头 (JSON)', type: 'textarea', placeholder: '{ "X-Tenant": "xxx" }' },
          { key: 'HTTP_BODY_TEMPLATE', label: '请求体模板 (JSON)', type: 'textarea' },
        ],
      },
    ],
  },
  {
    code: 'feishu_sheet',
    label: '飞书在线表格',
    description: '通过飞书开放平台读取在线电子表格，将表头行后的数据转换为业务表数据并落库',
    testable: true,
    defaultSchedule: '每日 06:00',
    groups: [
      {
        title: '认证信息',
        fields: [
          { key: 'FEISHU_APP_ID', label: 'App ID', type: 'text', required: true, placeholder: '飞书开放平台应用 App ID' },
          { key: 'FEISHU_APP_SECRET', label: 'App Secret', type: 'password', required: true },
        ],
      },
      {
        title: '表格定位',
        fields: [
          { key: 'FEISHU_WIKI_URL_OR_TOKEN', label: 'Wiki 链接或节点 Token', type: 'text', placeholder: 'https://xxx.feishu.cn/wiki/xxxx 或 wiki node token', hint: '如果表格挂在知识库里，可直接填 Wiki 页面地址，系统会自动解析真实 Spreadsheet Token。' },
          { key: 'FEISHU_SPREADSHEET_TOKEN', label: 'Spreadsheet Token', type: 'text', placeholder: '表格 URL 中 /sheets/ 后的 token', hint: '与 Wiki 链接二选一；如果两者都填，优先使用 Spreadsheet Token。' },
          { key: 'FEISHU_SHEET_ID', label: 'Sheet ID', type: 'text', placeholder: '工作表 gid/sheetId，如：6e5ed3', hint: '可选；留空时系统会读取第一个工作表。' },
          { key: 'FEISHU_RANGE', label: '读取范围', type: 'text', required: true, default: 'A1:ZZ10000', placeholder: 'A1:Z1000', hint: '与 Sheet ID 拼成 SheetID!A1:Z1000。表头行通常在该范围内第 1 行。' },
          { key: 'FEISHU_SHEET_RANGE', label: '完整范围（可选）', type: 'text', placeholder: '6e5ed3!A1:Z1000', hint: '填写后优先使用，可覆盖 Sheet ID + 读取范围。' },
          { key: 'FEISHU_HEADER_ROW', label: '表头行号', type: 'text', required: true, default: '1', placeholder: '1', hint: '相对于读取范围的第几行作为表头，默认 1。' },
          { key: 'FEISHU_SKIP_EMPTY_ROWS', label: '跳过空行', type: 'select', default: 'true', options: [
            { label: '是', value: 'true' },
            { label: '否', value: 'false' },
          ] },
        ],
      },
      {
        title: '接口地址',
        fields: [
          { key: 'FEISHU_BASE_URL', label: '飞书 OpenAPI Base URL', type: 'url', required: true, default: 'https://open.feishu.cn' },
          { key: 'FEISHU_TOKEN_URL', label: 'Token 接口（可选）', type: 'url', placeholder: '默认自动使用 /open-apis/auth/v3/tenant_access_token/internal' },
        ],
      },
    ],
  },
  {
    code: 'database',
    label: '数据库直连',
    description: '直连业务系统数据库（MySQL / PostgreSQL / SQL Server），适合内部仓库类场景',
    testable: true,
    defaultSchedule: '每日 06:00',
    groups: [
      {
        title: '连接信息',
        fields: [
          { key: 'DB_DIALECT', label: '数据库类型', type: 'select', required: true, default: 'postgresql', options: [
            { label: 'PostgreSQL', value: 'postgresql' },
            { label: 'MySQL', value: 'mysql' },
            { label: 'SQL Server', value: 'mssql' },
            { label: 'Oracle', value: 'oracle' },
          ] },
          { key: 'DB_HOST', label: '主机', type: 'text', required: true, placeholder: 'db.internal.example.com' },
          { key: 'DB_PORT', label: '端口', type: 'text', required: true, default: '5432' },
          { key: 'DB_NAME', label: '数据库名', type: 'text', required: true },
          { key: 'DB_USER', label: '用户名', type: 'text', required: true },
          { key: 'DB_PASSWORD', label: '密码', type: 'password', required: true },
        ],
      },
      {
        title: '查询配置',
        fields: [
          { key: 'DB_SCHEMA', label: 'Schema', type: 'text', placeholder: 'public', hint: '可选' },
          { key: 'DB_QUERY', label: 'SELECT 查询', type: 'textarea', required: true, placeholder: 'SELECT * FROM employee WHERE updated_at > :since' },
        ],
      },
    ],
  },
]

export function findSourceType(code: string): SourceTypeDef | undefined {
  return SOURCE_TYPES.find((s) => s.code === code)
}

/** 给某个类型生成一份"默认值表单初始 state" */
export function initFormForType(code: string): Record<string, string> {
  const t = findSourceType(code)
  if (!t) return {}
  const state: Record<string, string> = {}
  for (const g of t.groups) {
    for (const f of g.fields) {
      state[f.key] = f.default ?? ''
    }
  }
  return state
}

/** 常用调度选项 */
export const SCHEDULE_OPTIONS = [
  { label: '每日 06:00', value: '每日 06:00' },
  { label: '每周一 06:00', value: '每周一 06:00' },
  { label: '每月 1 日 06:00', value: '每月 1 日 06:00' },
  { label: '每月 5 日 06:00', value: '每月 5 日 06:00' },
  { label: '每小时整点', value: '每小时整点' },
  { label: '手动触发', value: '手动触发' },
]
