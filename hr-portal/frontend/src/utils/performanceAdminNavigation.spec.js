import { describe, expect, it } from 'vitest';
import { DEFAULT_PERFORMANCE_ADMIN_SECTION, PERFORMANCE_ADMIN_MENU_ITEMS, getPerformanceAdminSectionLabel, } from './performanceAdminNavigation';
describe('performance admin navigation', () => {
    it('keeps the confirmed application-settings menu and default placeholder', () => {
        expect(PERFORMANCE_ADMIN_MENU_ITEMS.map((item) => item.label)).toEqual([
            '周期与项目',
            '席位管理',
            '绩效模板',
            '评估题管理',
            '权限管理',
            '系统设置',
        ]);
        expect(DEFAULT_PERFORMANCE_ADMIN_SECTION).toBe('seats');
        expect(getPerformanceAdminSectionLabel(DEFAULT_PERFORMANCE_ADMIN_SECTION)).toBe('席位管理');
    });
});
