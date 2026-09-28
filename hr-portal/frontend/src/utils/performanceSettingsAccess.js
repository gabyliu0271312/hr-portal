export function canManagePerformanceSettings(menuCodes, context) {
    if (!context || !new Set(menuCodes).has('performance.admin'))
        return false;
    return context.portal_entry_permissions.includes('performance.admin');
}
