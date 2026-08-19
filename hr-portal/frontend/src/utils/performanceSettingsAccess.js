const PERFORMANCE_CONFIGURATION_PERMISSIONS = new Set([
    'performance.authorization.manage',
    'performance.configuration.manage',
    'performance.cycles.manage',
    'performance.projects.manage',
]);
export function canManagePerformanceSettings(menuCodes, context) {
    if (!context || !new Set(menuCodes).has('performance.admin'))
        return false;
    return context.permission_codes.some((permission) => PERFORMANCE_CONFIGURATION_PERMISSIONS.has(permission));
}
