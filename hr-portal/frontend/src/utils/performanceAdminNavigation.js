import { Calendar, Collection, DocumentChecked, EditPen, Lock, Setting, } from '@element-plus/icons-vue';
export const DEFAULT_PERFORMANCE_ADMIN_SECTION = 'seats';
export const PERFORMANCE_ADMIN_MENU_ITEMS = [
    { key: 'cycles-projects', label: '周期与项目', icon: Calendar },
    { key: 'seats', label: '席位管理', icon: Collection },
    { key: 'templates', label: '绩效模板', icon: DocumentChecked },
    { key: 'evaluation-questions', label: '评估题管理', icon: EditPen },
    { key: 'permissions', label: '权限管理', icon: Lock },
    { key: 'system', label: '系统设置', icon: Setting },
];
export function getPerformanceAdminSectionLabel(section) {
    return PERFORMANCE_ADMIN_MENU_ITEMS.find((item) => item.key === section)?.label || '席位管理';
}
