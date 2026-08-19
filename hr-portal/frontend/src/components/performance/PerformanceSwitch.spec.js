import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import PerformanceSwitch from './PerformanceSwitch.vue';
describe('PerformanceSwitch', () => {
    it('renders the shared 28x16 switch contract and emits updates', async () => {
        const wrapper = mount(PerformanceSwitch, { props: { modelValue: false, ariaLabel: '测试开关' } });
        const button = wrapper.get('button');
        expect(button.attributes('role')).toBe('switch');
        expect(button.attributes('aria-checked')).toBe('false');
        expect(button.attributes('aria-label')).toBe('测试开关');
        expect(wrapper.vm.$el.classList.contains('on')).toBe(false);
        await button.trigger('click');
        expect(wrapper.emitted('update:modelValue')).toEqual([[true]]);
    });
    it('keeps the disabled state non-interactive', async () => {
        const wrapper = mount(PerformanceSwitch, { props: { modelValue: true, disabled: true } });
        const button = wrapper.get('button');
        expect(button.attributes('disabled')).toBeDefined();
        expect(button.attributes('aria-checked')).toBe('true');
        await button.trigger('click');
        expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    });
});
