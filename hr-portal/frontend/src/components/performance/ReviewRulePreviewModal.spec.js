import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import ReviewRulePreviewModal from './ReviewRulePreviewModal.vue';
function payload(reviewType) {
    return {
        languages: { chinese: true, english: false },
        name: '预览规则',
        reviewType,
        gradeParticipatesInCalculation: false,
        levels: [
            { id: 'c', color: 'red', code: 'C', name: '待改进', quantifiedScore: '', value: '' },
            { id: 'b', color: 'orange', code: 'B', name: '符合预期', quantifiedScore: '', value: '' },
            { id: 'a', color: 'yellow', code: 'A', name: '优秀', quantifiedScore: '', value: '' },
        ],
        score: { method: '在分数上下限内输入评分', min: '0', max: '100', precision: '不保留小数', fixedOptions: [{ id: '20', value: '20' }, { id: '40', value: '40' }] },
        mapping: { method: '在分数上下限内输入评分', min: '0', max: '100', rule: 'a ≤ 分数 < b', intervals: [{ lower: '0', upper: '60', code: 'C', name: '待改进' }, { lower: '60', upper: '100', code: 'A', name: '优秀' }], precision: '不保留小数' },
        remark: '',
    };
}
describe('ReviewRulePreviewModal', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });
    it('uses one compact shell for the rating renderer and verifies close', async () => {
        const wrapper = mount(ReviewRulePreviewModal, { props: { open: true, reviewType: 'rating', formValue: payload('评级') } });
        const dialog = document.body.querySelector('[role="dialog"]');
        expect(dialog.classList).toContain('is-rating');
        expect(document.body.querySelector('.review-rule-preview-header')).toBeTruthy();
        expect(document.body.querySelector('.rating-rule-preview')?.textContent).toBe('CBA');
        expect(document.body.querySelector('.rating-rule-preview .performance-option-navigator')).toBeTruthy();
        expect(document.body.querySelectorAll('.rating-rule-preview .performance-option-navigator__option')).toHaveLength(3);
        expect(document.body.querySelector('.preview-close-button')?.getAttribute('aria-label')).toBe('关闭预览');
        await wrapper.getComponent({ name: 'PreviewCloseButton' }).trigger('click');
        expect(wrapper.emitted('close')).toHaveLength(1);
        wrapper.unmount();
    });
    it('clamps score preview values and links steppers to precision and bounds', async () => {
        const fixture = payload('评分');
        fixture.score.precision = '保留 2 位小数';
        const wrapper = mount(ReviewRulePreviewModal, { props: { open: true, reviewType: 'score', formValue: fixture } });
        const score = wrapper.findComponent({ name: 'ScoreRulePreview' });
        const input = score.get('input[aria-label="预览评分"]');
        await input.setValue('120');
        expect(input.element.value).toBe('100.00');
        expect(score.get('button[aria-label="预览评分增加"]').attributes('disabled')).toBeDefined();
        await input.setValue('0');
        expect(score.get('button[aria-label="预览评分减少"]').attributes('disabled')).toBeDefined();
        await input.setValue('1');
        await input.trigger('blur');
        expect(input.element.value).toBe('1.00');
        expect(score.find('[data-step="0.01"]').exists()).toBe(true);
    });
    it('uses equal-width mapping segments and grows the mapping shell for additional intervals', async () => {
        const fixture = payload('评分映射等级型');
        fixture.mapping.intervals = [
            { lower: '0', upper: '20', code: 'D', name: '差' },
            { lower: '20', upper: '40', code: 'C', name: '待改进' },
            { lower: '40', upper: '60', code: 'B', name: '良好' },
            { lower: '60', upper: '100', code: 'A', name: '优秀' },
        ];
        const wrapper = mount(ReviewRulePreviewModal, { props: { open: true, reviewType: 'mapping', formValue: fixture } });
        const segments = document.body.querySelectorAll('.mapping-scale__segment');
        expect(segments).toHaveLength(4);
        expect([...segments].every((segment) => !segment.getAttribute('style'))).toBe(true);
        const modal = document.body.querySelector('.review-rule-preview-modal');
        const modalStyle = modal.getAttribute('style') || '';
        expect(Number(modalStyle.match(/--mapping-preview-body-height:\s*([\d.]+)px/)?.[1])).toBeCloseTo(404, 0);
        wrapper.unmount();
    });
    it('positions the preview cursor inside the equal-width track', async () => {
        const fixture = payload('评分映射等级型');
        const wrapper = mount(ReviewRulePreviewModal, { props: { open: true, reviewType: 'mapping', formValue: fixture } });
        const input = wrapper.findComponent({ name: 'ScoreMappingRulePreview' }).get('input[aria-label="预览分数"]');
        await input.setValue('50');
        let cursor = document.body.querySelector('.mapping-scale__cursor');
        expect(Number.parseFloat(cursor.style.left)).toBeCloseTo(229.167, 2);
        expect(cursor.classList.contains('is-min')).toBe(false);
        expect(cursor.classList.contains('is-max')).toBe(false);
        expect(cursor.querySelector('svg')?.getAttribute('width')).toBe('7');
        expect(cursor.querySelector('svg')?.getAttribute('height')).toBe('28');
        expect(cursor.querySelectorAll('path')).toHaveLength(3);
        await input.setValue('0');
        cursor = document.body.querySelector('.mapping-scale__cursor');
        expect(cursor.classList.contains('is-min')).toBe(true);
        expect(Number.parseFloat(cursor.style.left)).toBe(0);
        expect(cursor.querySelector('.mapping-scale__bubble')?.classList.contains('is-red')).toBe(true);
        await input.setValue('100');
        cursor = document.body.querySelector('.mapping-scale__cursor');
        expect(cursor.classList.contains('is-max')).toBe(true);
        expect(Number.parseFloat(cursor.style.left)).toBe(552);
        expect(cursor.querySelector('.mapping-scale__bubble')?.classList.contains('is-purple')).toBe(true);
        wrapper.unmount();
    });
    it('keeps mapping preview numbers at the configured precision', async () => {
        const fixture = payload('评分映射等级型');
        fixture.mapping.precision = '保留 2 位小数';
        const wrapper = mount(ReviewRulePreviewModal, { props: { open: true, reviewType: 'mapping', formValue: fixture } });
        const input = wrapper.findComponent({ name: 'ScoreMappingRulePreview' }).get('input[aria-label="预览分数"]');
        expect(input.attributes('step')).toBe('0.01');
        await input.setValue('1');
        await input.trigger('blur');
        expect(input.element.value).toBe('1.00');
        expect(document.body.textContent).toContain('60.00');
        wrapper.unmount();
    });
    it('keeps mapping preview input local and emits value without changing payload', async () => {
        const initial = payload('评分映射等级型');
        const wrapper = mount(ReviewRulePreviewModal, { props: { open: true, reviewType: 'mapping', formValue: initial } });
        const dialog = document.body.querySelector('[role="dialog"]');
        expect(dialog.classList).toContain('is-mapping');
        const input = wrapper.findComponent({ name: 'ScoreMappingRulePreview' }).get('input[aria-label="预览分数"]');
        await input.setValue('50');
        expect(wrapper.emitted('update:previewValue')?.at(-1)).toEqual(['50']);
        expect(initial.mapping.intervals[0].upper).toBe('60');
        expect(document.body.querySelector('.mapping-scale__bubble')?.textContent).toContain('50分');
        wrapper.unmount();
    });
});
