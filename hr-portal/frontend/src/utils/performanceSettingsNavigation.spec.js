import { afterEach, describe, expect, it, vi } from 'vitest';
import { PERFORMANCE_SETTINGS_PATH, openPerformanceSettingsInNewTab, } from './performanceSettingsNavigation';
describe('openPerformanceSettingsInNewTab', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });
    it('opens the standalone settings route in a new tab without an opener', () => {
        const open = vi.spyOn(window, 'open').mockImplementation(() => null);
        openPerformanceSettingsInNewTab();
        expect(open).toHaveBeenCalledWith(PERFORMANCE_SETTINGS_PATH, '_blank', 'noopener');
    });
});
