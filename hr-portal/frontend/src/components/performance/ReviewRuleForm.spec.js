import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ReviewRuleForm from './ReviewRuleForm.vue';
import reviewRuleFormSource from './ReviewRuleForm.vue?raw';
import scoreBoundsFieldSource from './ScoreBoundsField.vue?raw';
function mountForm() {
    return mount(ReviewRuleForm, {
        props: { mode: 'create' },
        global: {
            stubs: {
                'el-button': { template: '<button><slot /></button>' },
            },
        },
    });
}
function mountQuantifiedForm(mode) {
    return mount(ReviewRuleForm, {
        props: {
            mode,
            modelValue: {
                name: '量化评级规则',
                reviewType: '评级',
                gradeParticipatesInCalculation: true,
                levels: [
                    { id: 'level-c', color: 'red', code: 'C', name: '', quantifiedScore: '', value: '' },
                    { id: 'level-b', color: 'orange', code: 'B', name: '', quantifiedScore: '', value: '' },
                    { id: 'level-a', color: 'yellow', code: 'A', name: '', quantifiedScore: '', value: '' },
                ],
            },
        },
    });
}
describe('ReviewRuleForm', () => {
    it('renders the captured default rating form', () => {
        const wrapper = mountForm();
        expect(wrapper.find('.form-card').exists()).toBe(true);
        expect(wrapper.find('input[placeholder="请输入名称"]').exists()).toBe(true);
        expect(wrapper.get('[aria-label="评估类型"]').text()).toContain('评级');
        expect(wrapper.find('[aria-label="评级设置"]').exists()).toBe(true);
        expect(reviewRuleFormSource).toContain('.rating-preview { margin-bottom: 20px; }');
        expect(wrapper.find('textarea[placeholder*="帮助管理员"]').exists()).toBe(true);
    });
    it('toggles the quantified score column without losing its value', async () => {
        const wrapper = mountForm();
        const rating = wrapper.get('[aria-label="评级设置"]');
        expect(rating.find('[data-quantified="false"]').exists()).toBe(true);
        expect(rating.find('.quantified-score-header').exists()).toBe(false);
        expect(rating.findAll('.performance-number-input')).toHaveLength(3);
        await rating.get('.performance-switch').trigger('click');
        expect(rating.find('[data-quantified="true"]').exists()).toBe(true);
        expect(rating.get('.quantified-score-header').text()).toContain('量化分');
        expect(rating.find('[data-icon="AsteriskOutlined"]').exists()).toBe(true);
        expect(rating.findAll('.level-header [data-icon="InfoOutlined"]')).toHaveLength(2);
        expect(rating.findAll('.performance-number-input')).toHaveLength(6);
        const quantifiedInput = rating.get('input[aria-label="第1个等级量化分"]');
        await quantifiedInput.setValue('2.5');
        await rating.get('.performance-switch').trigger('click');
        expect(rating.find('input[aria-label="第1个等级量化分"]').exists()).toBe(false);
        expect(rating.findAll('.performance-number-input')).toHaveLength(3);
        await rating.get('.performance-switch').trigger('click');
        expect(rating.get('input[aria-label="第1个等级量化分"]').element.value).toBe('2.5');
    });
    it('switches between score and mapping configurations', async () => {
        const wrapper = mountForm();
        const radios = wrapper.findAll('input[name="review-type"]');
        await radios[1].setValue();
        expect(wrapper.find('[aria-label="评分设置"]').exists()).toBe(true);
        expect(wrapper.find('[aria-label="评分设置"] .score-bounds-field').exists()).toBe(true);
        expect(wrapper.findAll('[aria-label="评分设置"] .performance-required-label')).toHaveLength(2);
        expect(scoreBoundsFieldSource).toContain('.score-bounds-field { margin-bottom: 20px;');
        expect(wrapper.findAll('[aria-label="评分设置"] .performance-number-input')).toHaveLength(2);
        expect(wrapper.findAll('[aria-label="评分设置"] [data-step="1"]')).toHaveLength(2);
        await wrapper.find('[aria-label="评分设置"] input[aria-label="分数下限"]').setValue('1.234');
        await wrapper.find('[aria-label="评分设置"] input[aria-label="分数上限"]').setValue('9.876');
        await wrapper.findAll('input[name="score-precision"]')[1].setValue();
        const scoreMinInput = wrapper.find('[aria-label="评分设置"] input[aria-label="分数下限"]');
        const scoreMaxInput = wrapper.find('[aria-label="评分设置"] input[aria-label="分数上限"]');
        expect(scoreMinInput.element.value).toBe('1.2');
        expect(scoreMaxInput.element.value).toBe('9.9');
        expect(wrapper.findAll('[aria-label="评分设置"] [data-step="0.1"]')).toHaveLength(2);
        await scoreMinInput.setValue('5');
        await scoreMinInput.trigger('blur');
        expect(scoreMinInput.element.value).toBe('5.0');
        await radios[2].setValue();
        expect(wrapper.find('[aria-label="评分映射等级型设置"]').exists()).toBe(true);
        expect(wrapper.find('[aria-label="评分设置"]').exists()).toBe(false);
        expect(wrapper.find('input[name="mapping-method"]').exists()).toBe(true);
        expect(wrapper.find('[aria-label="评分映射等级型设置"] .score-bounds-field').exists()).toBe(true);
        expect(wrapper.findAll('[aria-label="评分映射等级型设置"] .performance-required-label')).toHaveLength(5);
        expect(wrapper.find('[aria-label="评分映射等级型设置"] .interval-header').text()).toBe('分数子区间*等级代号*等级名称');
        expect(wrapper.findAll('[aria-label="评分映射等级型设置"] .performance-number-input')).toHaveLength(6);
        expect(wrapper.findAll('[aria-label="评分映射等级型设置"] [data-icon="UpBoldOutlined"]')).toHaveLength(6);
        await wrapper.findAll('input[name="mapping-precision"]')[2].setValue();
        expect(wrapper.findAll('[aria-label="评分映射等级型设置"] [data-step="0.01"]')).toHaveLength(6);
        expect(wrapper.findAll('[data-icon="InfoOutlined"]')).toHaveLength(3);
        expect(wrapper.find('[aria-label="评分映射等级型设置"] .interval-header').classes()).not.toContain('has-delete');
        await wrapper.find('[aria-label="评分映射等级型设置"] .add-interval-button').trigger('click');
        expect(wrapper.find('[aria-label="评分映射等级型设置"] .interval-header').classes()).toContain('has-delete');
    });
    it('uses the shared sortable list for fixed score options', async () => {
        const wrapper = mountForm();
        await wrapper.findAll('input[name="review-type"]')[1].setValue();
        await wrapper.findAll('input[name="score-method"]')[1].setValue();
        const fixed = wrapper.find('.fixed-score-options-editor');
        expect(fixed.exists()).toBe(true);
        expect(fixed.findAll('.fixed-score-option-row')).toHaveLength(2);
        expect(fixed.findAll('[data-drag-handle]')).toHaveLength(2);
        await fixed.find('input').setValue('0.022');
        expect(fixed.find('.fixed-score-option-error').text()).toBe('最多支持2位小数');
        await fixed.find('.add-fixed-score-button').trigger('click');
        expect(fixed.findAll('.fixed-score-option-row')).toHaveLength(3);
        expect(fixed.findAll('.fixed-score-option-row .performance-icon-button')).toHaveLength(3);
    });
    it('links mapping interval boundaries to score bounds and previous upper values', async () => {
        const wrapper = mountForm();
        await wrapper.findAll('input[name="review-type"]')[2].setValue();
        const bounds = wrapper.find('.score-bounds-field');
        await bounds.find('input[aria-label="分数下限"]').setValue('0');
        await bounds.find('input[aria-label="分数上限"]').setValue('10');
        const rows = wrapper.findAll('[aria-label="分数子区间编辑器"] .interval-row');
        expect(rows[0].findAll('input')[0].element.value).toBe('0');
        expect(rows[1].findAll('input')[1].element.value).toBe('10');
        expect(rows[0].findAll('input')[0].attributes('readonly')).toBeDefined();
        expect(rows[1].findAll('input')[0].attributes('readonly')).toBeDefined();
        await rows[0].findAll('input')[1].setValue('5');
        expect(rows[1].findAll('input')[0].element.value).toBe('5');
        await wrapper.findAll('input[name="mapping-precision"]')[1].setValue();
        expect(rows[0].findAll('input')[1].element.value).toBe('5.0');
        expect(rows[1].findAll('input')[1].element.value).toBe('10.0');
        await rows[0].findAll('input')[1].setValue('6');
        await rows[0].findAll('input')[1].trigger('blur');
        expect(rows[0].findAll('input')[1].element.value).toBe('6.0');
    });
    it('blocks invalid rating preview and emits a readonly payload after recovery', async () => {
        const wrapper = mountForm();
        wrapper.vm.preview();
        await wrapper.vm.$nextTick();
        expect(wrapper.emitted('preview')).toBeUndefined();
        expect(wrapper.text()).toContain('名称为必填');
        expect(wrapper.findAll('.error-text').filter((item) => item.text() === '等级代号为必填')).toHaveLength(3);
        await wrapper.get('input[placeholder="请输入名称"]').setValue('评级预览规则');
        for (const [index, input] of wrapper.findAll('input[placeholder="请输入「中文」等级代号"]').entries())
            await input.setValue(['C', 'B', 'A'][index]);
        wrapper.vm.preview();
        await wrapper.vm.$nextTick();
        const payload = wrapper.emitted('preview')?.at(-1)?.[0];
        expect(payload.name).toBe('评级预览规则');
        expect(payload.levels.map((level) => level.code)).toEqual(['C', 'B', 'A']);
    });
    it('validates and emits score bounds and fixed-option preview payloads', async () => {
        const wrapper = mountForm();
        await wrapper.findAll('input[name="review-type"]')[1].setValue();
        wrapper.vm.preview();
        await wrapper.vm.$nextTick();
        expect(wrapper.find('.bounds-error').text()).toBe('评分上下限为必填');
        await wrapper.get('input[placeholder="请输入名称"]').setValue('评分预览规则');
        await wrapper.get('input[aria-label="分数下限"]').setValue('0');
        await wrapper.get('input[aria-label="分数上限"]').setValue('100');
        wrapper.vm.preview();
        await wrapper.vm.$nextTick();
        expect((wrapper.emitted('preview')?.at(-1)?.[0]).score).toMatchObject({ min: '0', max: '100' });
        await wrapper.findAll('input[name="score-method"]')[1].setValue();
        const fixedInputs = wrapper.findAll('.fixed-score-option-row input');
        await fixedInputs[0].setValue('20');
        await fixedInputs[1].setValue('40');
        wrapper.vm.preview();
        await wrapper.vm.$nextTick();
        expect((wrapper.emitted('preview')?.at(-1)?.[0]).score.fixedOptions.map((item) => item.value)).toEqual(['20', '40']);
    });
    it('validates mapping intervals before emitting the preview payload', async () => {
        const wrapper = mountForm();
        await wrapper.findAll('input[name="review-type"]')[2].setValue();
        wrapper.vm.preview();
        await wrapper.vm.$nextTick();
        expect(wrapper.find('.bounds-error').exists()).toBe(true);
        expect(wrapper.findAll('.interval-code-error')).toHaveLength(2);
        await wrapper.get('input[placeholder="请输入名称"]').setValue('评分映射预览规则');
        const bounds = wrapper.find('.score-bounds-field');
        await bounds.get('input[aria-label="分数下限"]').setValue('0');
        await bounds.get('input[aria-label="分数上限"]').setValue('100');
        const rows = wrapper.findAll('.interval-row');
        await rows[0].findAll('.performance-number-input input')[1].setValue('60');
        await rows[0].get('input[placeholder="请输入等级代号"]').setValue('C');
        await rows[1].get('input[placeholder="请输入等级代号"]').setValue('A');
        wrapper.vm.preview();
        await wrapper.vm.$nextTick();
        const payload = wrapper.emitted('preview')?.at(-1)?.[0];
        expect(payload.mapping).toMatchObject({ min: '0', max: '100' });
        expect(payload.mapping.intervals.map((item) => item.code)).toEqual(['C', 'A']);
    });
    it('allows negative score bounds in the preview payload', async () => {
        const wrapper = mountForm();
        await wrapper.findAll('input[name="review-type"]')[1].setValue();
        await wrapper.get('input[placeholder="请输入名称"]').setValue('负数评分规则');
        await wrapper.get('input[aria-label="分数下限"]').setValue('-10');
        await wrapper.get('input[aria-label="分数上限"]').setValue('100');
        wrapper.vm.preview();
        await wrapper.vm.$nextTick();
        expect((wrapper.emitted('preview')?.at(-1)?.[0]).score).toMatchObject({ min: '-10', max: '100' });
    });
    it('blocks numeric-equivalent duplicate fixed values and accepts negative values after recovery', async () => {
        const wrapper = mountForm();
        await wrapper.findAll('input[name="review-type"]')[1].setValue();
        await wrapper.get('input[placeholder="请输入名称"]').setValue('固定分值规则');
        await wrapper.findAll('input[name="score-method"]')[1].setValue();
        const fixedInputs = wrapper.findAll('.fixed-score-option-row input');
        await fixedInputs[0].setValue('-20');
        await fixedInputs[1].setValue('-20.00');
        wrapper.vm.preview();
        await wrapper.vm.$nextTick();
        expect(wrapper.emitted('preview')).toBeUndefined();
        expect(wrapper.findAll('.fixed-score-option-error').map((item) => item.text())).toEqual(['分值重复', '分值重复']);
        await fixedInputs[1].setValue('-40');
        wrapper.vm.preview();
        await wrapper.vm.$nextTick();
        expect((wrapper.emitted('preview')?.at(-1)?.[0]).score.fixedOptions.map((item) => item.value)).toEqual(['-20', '-40']);
    });
    it.each(['create', 'edit'])('blocks %s submit and preview when quantified scores are empty', async (mode) => {
        const wrapper = mountQuantifiedForm(mode);
        await wrapper.get('form').trigger('submit');
        wrapper.vm.preview();
        await wrapper.vm.$nextTick();
        expect(wrapper.emitted('submit')).toBeUndefined();
        expect(wrapper.emitted('preview')).toBeUndefined();
        expect(wrapper.findAll('.error-text').filter((item) => item.text() === '量化分为必填')).toHaveLength(3);
        for (const [index, input] of wrapper.findAll('input[aria-label$="量化分"]').entries())
            await input.setValue(String(index + 1));
        await wrapper.get('form').trigger('submit');
        wrapper.vm.preview();
        await wrapper.vm.$nextTick();
        expect(wrapper.emitted('submit')).toHaveLength(1);
        expect(wrapper.emitted('preview')).toHaveLength(1);
        expect(wrapper.text()).not.toContain('量化分为必填');
    });
    it('keeps every create capability available when editing an unused rule', () => {
        const wrapper = mount(ReviewRuleForm, {
            props: { mode: 'edit', isUsed: false, modelValue: { name: '未使用规则' } },
        });
        expect(wrapper.findAll('input[name="review-type"]').every((input) => input.attributes('disabled') === undefined)).toBe(true);
        expect(wrapper.findAll('input[type="checkbox"]')[1].attributes('disabled')).toBeUndefined();
        expect(wrapper.get('textarea').attributes('disabled')).toBeUndefined();
    });
    it('locks rating structure and quantified scores for a used rule', () => {
        const wrapper = mount(ReviewRuleForm, {
            props: {
                mode: 'edit',
                isUsed: true,
                modelValue: {
                    name: '已使用评级',
                    reviewType: '评级',
                    gradeParticipatesInCalculation: true,
                    levels: [
                        { id: 'a', color: 'red', code: 'A', name: '优秀', quantifiedScore: '3', value: '30' },
                        { id: 'b', color: 'orange', code: 'B', name: '良好', quantifiedScore: '2', value: '20' },
                    ],
                },
            },
        });
        expect(wrapper.findAll('input[name="review-type"]').every((input) => input.attributes('disabled') !== undefined)).toBe(true);
        expect(wrapper.get('.performance-switch').attributes('disabled')).toBeDefined();
        expect(wrapper.findAll('[data-drag-handle]').every((handle) => handle.attributes('aria-disabled') === 'true')).toBe(true);
        expect(wrapper.findAll('input[aria-label$="量化分"]').every((input) => input.attributes('disabled') !== undefined)).toBe(true);
        expect(wrapper.findAll('input[aria-label$="量化值"]').every((input) => input.attributes('disabled') === undefined)).toBe(true);
        expect(wrapper.find('.add-level-button').exists()).toBe(false);
        expect(wrapper.find('[aria-label^="删除第"]').exists()).toBe(false);
        expect(wrapper.get('input[placeholder="请输入「中文」等级代号"]').attributes('disabled')).toBeUndefined();
        expect(wrapper.get('textarea').attributes('disabled')).toBeDefined();
    });
    it('only leaves the name editable for a used score rule', () => {
        const wrapper = mount(ReviewRuleForm, {
            props: {
                mode: 'edit',
                isUsed: true,
                modelValue: {
                    name: '已使用评分',
                    reviewType: '评分',
                    score: {
                        method: '在固定分值选项内选择评分',
                        min: '',
                        max: '',
                        precision: '不保留小数',
                        fixedOptions: [{ id: 'one', value: '20' }, { id: 'two', value: '40' }],
                    },
                },
            },
        });
        expect(wrapper.get('input[placeholder="请输入名称"]').attributes('disabled')).toBeUndefined();
        expect(wrapper.findAll('input[name="score-method"]').every((input) => input.attributes('disabled') !== undefined)).toBe(true);
        expect(wrapper.findAll('input[name="score-precision"]').every((input) => input.attributes('disabled') !== undefined)).toBe(true);
        expect(wrapper.findAll('.fixed-score-option-row input').every((input) => input.attributes('disabled') !== undefined)).toBe(true);
        expect(wrapper.find('.add-fixed-score-button').exists()).toBe(false);
        expect(wrapper.findAll('[data-drag-handle]').every((handle) => handle.attributes('aria-disabled') === 'true')).toBe(true);
        expect(wrapper.get('textarea').attributes('disabled')).toBeDefined();
        const bounds = mount(ReviewRuleForm, {
            props: {
                mode: 'edit',
                isUsed: true,
                modelValue: {
                    name: '已使用上下限评分',
                    reviewType: '评分',
                    score: { method: '在分数上下限内输入评分', min: '0', max: '100', precision: '不保留小数', fixedOptions: [] },
                },
            },
        });
        expect(bounds.findAll('.score-bounds-field input').every((input) => input.attributes('disabled') !== undefined)).toBe(true);
    });
    it('locks mapping bounds and interval structure while keeping mapping content editable', () => {
        const wrapper = mount(ReviewRuleForm, {
            props: {
                mode: 'edit',
                isUsed: true,
                modelValue: {
                    name: '已使用映射',
                    reviewType: '评分映射等级型',
                    mapping: {
                        method: '在分数上下限内输入评分',
                        min: '0',
                        max: '100',
                        rule: 'a ≤ 分数 < b',
                        precision: '不保留小数',
                        intervals: [
                            { lower: '0', upper: '40', code: 'C', name: '待改进' },
                            { lower: '40', upper: '70', code: 'B', name: '良好' },
                            { lower: '70', upper: '100', code: 'A', name: '优秀' },
                        ],
                    },
                },
            },
        });
        expect(wrapper.findAll('.score-bounds-field input').every((input) => input.attributes('disabled') !== undefined)).toBe(true);
        expect(wrapper.findAll('input[name="mapping-rule"]').every((input) => input.attributes('disabled') === undefined)).toBe(true);
        expect(wrapper.findAll('input[name="mapping-precision"]').every((input) => input.attributes('disabled') === undefined)).toBe(true);
        expect(wrapper.get('.interval-code-input').attributes('disabled')).toBeUndefined();
        expect(wrapper.find('.add-interval-button').exists()).toBe(false);
        expect(wrapper.find('[aria-label^="删除第"][aria-label$="分数子区间"]').exists()).toBe(false);
        expect(wrapper.get('textarea').attributes('disabled')).toBeDefined();
    });
    it('shows required errors after submitting an empty rating form', async () => {
        const wrapper = mountForm();
        await wrapper.get('form').trigger('submit');
        expect(wrapper.text()).toContain('名称为必填');
        expect(wrapper.findAll('.error-text').length).toBeGreaterThanOrEqual(4);
    });
    it('blocks preview when fewer than two rating levels remain', async () => {
        const wrapper = mount(ReviewRuleForm, {
            props: {
                mode: 'create',
                modelValue: {
                    name: '单等级规则',
                    levels: [{ id: 'only-level', color: 'red', code: 'A', name: '', quantifiedScore: '', value: '' }],
                },
            },
        });
        wrapper.vm.preview();
        await wrapper.vm.$nextTick();
        expect(wrapper.emitted('preview')).toBeUndefined();
        expect(wrapper.get('.mt-1.text-R-500').text()).toBe('无法删除，需保留至少两个非隐藏型等级');
    });
    it('submits rating data after level codes are filled', async () => {
        const wrapper = mountForm();
        await wrapper.get('input[placeholder="请输入名称"]').setValue('绩效规则');
        for (const input of wrapper.findAll('input[placeholder="请输入「中文」等级代号"]'))
            await input.setValue('A');
        await wrapper.get('form').trigger('submit');
        expect(wrapper.findAll('.error-text')).toHaveLength(0);
        expect(wrapper.emitted('submit')).toHaveLength(1);
    });
});
