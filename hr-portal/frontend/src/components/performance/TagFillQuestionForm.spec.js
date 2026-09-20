import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import TagFillQuestionForm from './TagFillQuestionForm.vue';
import { TAG_FILL_QUESTION_FIXTURES, cloneTagFillQuestion } from './tagFillQuestionFixtures';
describe('TagFillQuestionForm', () => {
    it('renders the confirmed create fields and supports adding a tag locally', async () => {
        const wrapper = mount(TagFillQuestionForm, {
            props: { modelValue: cloneTagFillQuestion(TAG_FILL_QUESTION_FIXTURES[0]), mode: 'create' },
            global: { stubs: { 'el-button': true } },
        });
        expect(wrapper.text()).toContain('中文');
        expect(wrapper.find('input[placeholder="请输入标签名称"]').exists()).toBe(true);
        expect(wrapper.findAll('.tag-card')).toHaveLength(1);
        await wrapper.get('.add-tag').trigger('click');
        expect(wrapper.findAll('.tag-card')).toHaveLength(2);
        const updates = wrapper.emitted('update:modelValue') || [];
        expect((updates.at(-1)?.[0]).tags).toHaveLength(2);
    });
    it('exposes empty-form preview validation without emitting a preview payload', async () => {
        const preview = vi.fn();
        const wrapper = mount(TagFillQuestionForm, {
            props: {
                modelValue: {
                    ...cloneTagFillQuestion(TAG_FILL_QUESTION_FIXTURES[0]),
                    name: '',
                    tags: [{ id: 'empty', name: '', description: '', prompt: '' }],
                },
                mode: 'create',
            },
            global: { stubs: { 'el-button': true } },
        });
        wrapper.vm.$.exposed?.preview();
        await wrapper.vm.$nextTick();
        expect(preview).not.toHaveBeenCalled();
        expect(wrapper.text()).toContain('名称为必填');
    });
});
