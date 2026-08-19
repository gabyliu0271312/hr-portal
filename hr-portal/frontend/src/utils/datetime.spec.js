import { describe, expect, it } from 'vitest';
import { shanghaiLocalToUtcIso, utcToShanghaiLocal } from './datetime';
describe('performance cycle datetime helpers', () => {
    it('treats datetime-local input as Asia/Shanghai wall time', () => {
        expect(shanghaiLocalToUtcIso('2026-01-01T09:00')).toBe('2026-01-01T01:00:00.000Z');
    });
    it('returns Beijing wall time for UTC input', () => {
        expect(utcToShanghaiLocal('2026-01-01T01:00:00.000Z')).toBe('2026-01-01T09:00');
    });
});
