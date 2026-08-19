import { Money, Document, Histogram, Grid, Notification } from '@element-plus/icons-vue';
export const TOOLS_CATALOG = [
    {
        code: 'tools.compensation_calc',
        title: '补偿金计算',
        desc: '根据员工信息、离职日期和地区补偿基数上限自动计算 N / N+1 补偿金，并可一键生成解除劳动合同协议。',
        path: '/tools/compensation-calc',
        icon: Money,
    },
    {
        code: 'tools.income_certificate',
        title: '证明开具',
        desc: '选择模板后开具收入证明，支持预览、打印和下载 Word。',
        path: '/tools/income-certificate',
        icon: Document,
    },
    {
        code: 'tools.cost_allocation',
        title: '成本分摊',
        desc: '选择分摊报表运行预览，确认无误后一键计算存档至数据视图。',
        path: '/tools/cost-allocation',
        icon: Histogram,
    },
    {
        code: 'table_tools',
        title: '表格归集',
        desc: '上传多源 Excel 文件，按人合并为标准字段表格，支持 AI 自动识别映射关系。',
        path: '/tools/table-merge',
        icon: Grid,
    },
    {
        code: 'automation.rules',
        title: '自动通知',
        desc: '按事件触发器配置飞书消息通知，任务完成、报表生成后自动推送提醒。',
        path: '/automation/rules',
        icon: Notification,
    },
];
