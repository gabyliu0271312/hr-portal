export const PERFORMANCE_SETTINGS_PATH = '/performance/settings';
export function openPerformanceSettingsInNewTab() {
    window.open(PERFORMANCE_SETTINGS_PATH, '_blank', 'noopener');
}
