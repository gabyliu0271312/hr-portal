export const PERFORMANCE_SETTINGS_PATH = '/performance/settings'

export function openPerformanceSettingsInNewTab(): void {
  window.open(PERFORMANCE_SETTINGS_PATH, '_blank', 'noopener')
}
