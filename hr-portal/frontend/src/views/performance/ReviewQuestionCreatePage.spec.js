import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
const { route, create, update, getQuestion, getRule, listRules, listSubQuestionOptions } = vi.hoisted(() => ({
  route: { name: "ReviewQuestionCreate", query: {}, params: {} },
  create: vi.fn(),
  update: vi.fn(),
  getQuestion: vi.fn(),
  getRule: vi.fn(),
  listRules: vi.fn(),
  listSubQuestionOptions: vi.fn()
}));
vi.mock("vue-router", () => ({
  useRoute: () => route,
  useRouter: () => ({ push: vi.fn() })
}));
vi.mock("element-plus", () => ({
  ElMessage: { warning: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() }
}));
vi.mock("@/api/performance", () => ({
  performanceReviewRuleApi: { list: listRules, get: getRule },
  performanceReviewQuestionApi: { create, get: getQuestion, update, listSubQuestionOptions }
}));
import ReviewQuestionCreatePage from "./ReviewQuestionCreatePage.vue";
function mountPage() {
  return mount(ReviewQuestionCreatePage, {
    global: {
      stubs: {
        FullScreenModal: { props: ["title"], emits: ["submit"], template: `<div><h1>{{ title }}</h1><slot /><button data-submit @click="$emit('submit')" /></div>` },
        ReviewQuestionFormBasic: { template: "<div />" },
        ReviewQuestionFormType: {
          props: ["modelValue"],
          emits: ["update:modelValue"],
          template: `<button data-type-change @click="$emit('update:modelValue', modelValue === 'regular' ? 'bonus' : 'regular')">\u7C7B\u578B</button>`
        },
        PerformanceTextField: { template: "<textarea />" },
        PerformanceRequiredLabel: { props: ["label"], template: "<span>{{ label }}</span>" },
        "el-form": { template: "<form><slot /></form>" },
        "el-form-item": { template: '<div><slot /><slot name="label" /></div>' },
        "el-select": {
          props: ["modelValue", "loading", "disabled"],
          emits: ["update:modelValue"],
          template: `<select :value="modelValue ?? ''" :disabled="disabled" @change="$emit('update:modelValue', Number($event.target.value))"><slot /></select>`
        },
        "el-option": { props: ["label", "value"], template: '<option :value="value">{{ label }}</option>' }
      }
    }
  });
}
describe("ReviewQuestionCreatePage rule relationship", () => {
  beforeEach(() => {
    route.name = "ReviewQuestionCreate";
    route.query = {};
    route.params = {};
    create.mockReset();
    update.mockReset();
    getQuestion.mockReset();
    getRule.mockReset();
    listRules.mockReset();
    listSubQuestionOptions.mockReset();
    listSubQuestionOptions.mockResolvedValue([]);
  });
  it("loads API rules and submits the selected rule_id", async () => {
    listRules.mockResolvedValue([{ id: 11, name: "\u6D4B\u8BD5\u8BC4\u7EA7", review_type: "\u8BC4\u7EA7", status: "active", updated_at: "", config_summary: {} }]);
    getRule.mockResolvedValue({ id: 11, name: "\u6D4B\u8BD5\u8BC4\u7EA7", review_type: "\u8BC4\u7EA7", status: "active", updated_at: "", config_summary: {}, config: { grade_participates_in_calculation: false, levels: [] } });
    create.mockResolvedValue({});
    route.query = { name: "\u9898\u76EE" };
    const wrapper = mountPage();
    await flushPromises();
    expect(listSubQuestionOptions).toHaveBeenCalledWith("none");
    expect(listSubQuestionOptions).toHaveBeenCalledWith("condition");
    await wrapper.get("select").setValue("11");
    await flushPromises();
    await wrapper.get("[data-submit]").trigger("click");
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      rule_id: 11,
      is_sub_question: false,
      parent_question_id: null
    }));
    expect(create.mock.calls[0][0]).not.toHaveProperty("hide_grade_quantified_score");
    expect(create.mock.calls[0][0]).not.toHaveProperty("hideGradeQuantifiedScore");
    expect(wrapper.find('[aria-label="\u914D\u7F6E\u7B49\u7EA7\u63CF\u8FF0"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="\u8BC4\u4F30\u65B9\u5F0F"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="\u5C55\u793A\u65B9\u5F0F"]').exists()).toBe(true);
  });
  it("persists the selected display mode on the current question", async () => {
    listRules.mockResolvedValue([{ id: 11, name: "\u6D4B\u8BD5\u8BC4\u7EA7", review_type: "\u8BC4\u7EA7", status: "active", updated_at: "", config_summary: {} }]);
    getRule.mockResolvedValue({ id: 11, name: "\u6D4B\u8BD5\u8BC4\u7EA7", review_type: "\u8BC4\u7EA7", status: "active", updated_at: "", config_summary: {}, config: { displayMode: "\u6807\u7B7E\u6837\u5F0F", levels: [{ code: "A" }] } });
    create.mockResolvedValue({});
    route.query = { name: "\u9898\u76EE" };
    const wrapper = mountPage();
    await flushPromises();
    await wrapper.get("select").setValue("11");
    await flushPromises();
    await wrapper.findAll('[aria-label="\u5C55\u793A\u65B9\u5F0F"] [role="radio"]')[1].trigger("click");
    await wrapper.get("[data-submit]").trigger("click");
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ rule_id: 11, display_mode: "\u4E0B\u62C9\u6837\u5F0F" }));
  });
  it("rehydrates and updates dropdown display mode without resetting it", async () => {
    route.name = "ReviewQuestionEdit";
    route.params = { id: "2" };
    listRules.mockResolvedValue([{ id: 11, name: "\u6D4B\u8BD5\u8BC4\u7EA7", review_type: "\u8BC4\u7EA7", status: "active", updated_at: "", config_summary: {} }]);
    getRule.mockResolvedValue({ id: 11, name: "\u6D4B\u8BD5\u8BC4\u7EA7", review_type: "\u8BC4\u7EA7", status: "active", updated_at: "", config_summary: {}, config: { levels: [{ code: "A" }] } });
    getQuestion.mockResolvedValue({ id: 2, language: "zh-CN", name: "\u4E0B\u62C9\u9898\u76EE", description: "", type: "regular", rule_id: 11, display_mode: "\u4E0B\u62C9\u6837\u5F0F", remark: "", is_sub_question: false, parent_question_id: null });
    update.mockResolvedValue({});
    const wrapper = mountPage();
    await flushPromises();
    const modes = wrapper.findAll('[aria-label="\u5C55\u793A\u65B9\u5F0F"] [role="radio"]');
    expect(modes[1].attributes("aria-checked")).toBe("true");
    await wrapper.get("[data-submit]").trigger("click");
    expect(update).toHaveBeenCalledWith(2, expect.objectContaining({ display_mode: "\u4E0B\u62C9\u6837\u5F0F" }));
  });
  it("blocks score-range sub-item submission when no sub-question is selected", async () => {
    listRules.mockResolvedValue([{ id: 11, name: "\u8BC4\u4F30\u89C4\u5219--\u62FC\u5206\uFF08\u5728\u5206\u6570\u4E0A\u4E0B\u9650\u5185\u8F93\u5165\u8BC4\u5206\uFF09", review_type: "\u8BC4\u5206", status: "active", updated_at: "", config_summary: {} }]);
    getRule.mockResolvedValue({
      id: 11,
      name: "\u8BC4\u4F30\u89C4\u5219--\u62FC\u5206\uFF08\u5728\u5206\u6570\u4E0A\u4E0B\u9650\u5185\u8F93\u5165\u8BC4\u5206\uFF09",
      review_type: "\u8BC4\u5206",
      status: "active",
      updated_at: "",
      config_summary: {},
      config: { evaluation_method: "\u6309\u5B50\u8BC4\u4F30\u9879\u8BC4\u5206", score: { method: "\u5728\u5206\u6570\u4E0A\u4E0B\u9650\u5185\u8F93\u5165\u8BC4\u5206" } }
    });
    route.query = { name: "\u9898\u76EE" };
    const wrapper = mountPage();
    await flushPromises();
    await wrapper.get("select").setValue("11");
    await flushPromises();
    await wrapper.get("[data-submit]").trigger("click");
    expect(create).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("\u8BE5\u5B57\u6BB5\u662F\u5FC5\u586B\u5B57\u6BB5");
  });
  it("clears the selected rule when the regular question type changes", async () => {
    listRules.mockResolvedValue([{ id: 11, name: "\u6D4B\u8BD5\u8BC4\u7EA7", review_type: "\u8BC4\u7EA7", status: "active", updated_at: "", config_summary: {} }]);
    getRule.mockResolvedValue({ id: 11, name: "\u6D4B\u8BD5\u8BC4\u7EA7", review_type: "\u8BC4\u7EA7", status: "active", updated_at: "", config_summary: {}, config: { levels: [{ code: "A" }] } });
    route.query = { name: "\u9898\u76EE" };
    const wrapper = mountPage();
    await flushPromises();
    await wrapper.get("select").setValue("11");
    await flushPromises();
    expect(wrapper.find('[aria-label="\u914D\u7F6E\u7B49\u7EA7\u63CF\u8FF0"]').exists()).toBe(true);
    await wrapper.get("[data-type-change]").trigger("click");
    await flushPromises();
    expect(wrapper.find('[aria-label="\u914D\u7F6E\u7B49\u7EA7\u63CF\u8FF0"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="\u8BC4\u7EA7\u6863\u4F4D"]').exists()).toBe(false);
    expect(wrapper.get("select").element.value).toBe("");
  });
  it("clears the selected rule when the sub-question type changes", async () => {
    listRules.mockResolvedValue([{ id: 11, name: "\u6D4B\u8BD5\u8BC4\u7EA7", review_type: "\u8BC4\u7EA7", status: "active", updated_at: "", config_summary: {} }]);
    getRule.mockResolvedValue({ id: 11, name: "\u6D4B\u8BD5\u8BC4\u7EA7", review_type: "\u8BC4\u7EA7", status: "active", updated_at: "", config_summary: {}, config: { levels: [{ code: "\u7B49\u7EA7A" }] } });
    route.query = { isSub: "1", name: "\u5B50\u95EE\u9898" };
    const wrapper = mountPage();
    await flushPromises();
    await wrapper.get("select").setValue("11");
    await flushPromises();
    expect(wrapper.find('[aria-label="\u8BC4\u7EA7\u6863\u4F4D"]').exists()).toBe(true);
    await wrapper.get("[data-type-change]").trigger("click");
    await flushPromises();
    expect(wrapper.find('[aria-label="\u8BC4\u7EA7\u6863\u4F4D"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="\u914D\u7F6E\u7B49\u7EA7\u63CF\u8FF0"]').exists()).toBe(false);
    expect(wrapper.get("select").element.value).toBe("");
  });
  it("treats isSub=1 as the sub-question fixed-score variant", async () => {
    listRules.mockResolvedValue([{ id: 11, name: "\u6D4B\u8BD5\u8BC4\u5206", review_type: "\u8BC4\u5206", status: "active", updated_at: "", config_summary: {} }]);
    getRule.mockResolvedValue({
      id: 11,
      name: "\u6D4B\u8BD5\u8BC4\u5206",
      review_type: "\u8BC4\u5206",
      status: "active",
      updated_at: "",
      config_summary: {},
      config: { score: { method: "\u5728\u56FA\u5B9A\u5206\u503C\u9009\u9879\u5185\u9009\u62E9\u8BC4\u5206", fixed_options: [{ id: "1", value: "1" }, { id: "2", value: "2222...2222" }], precision: "\u4E0D\u4FDD\u7559\u5C0F\u6570" } }
    });
    route.query = { isSub: "1", name: "\u5B50\u95EE\u9898" };
    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.get("h1").text()).toBe("\u65B0\u5EFA\u5B50\u8BC4\u4F30\u9898");
    await wrapper.get("select").setValue("11");
    await flushPromises();
    expect(wrapper.find('[aria-label="\u5206\u503C\u9009\u9879"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="\u8BC4\u5206\u914D\u7F6E"]').exists()).toBe(false);
    expect(wrapper.findAll(".sub-fixed-option")).toHaveLength(2);
  });
  it("renders the shared rating component as the sub-question tier variant", async () => {
    listRules.mockResolvedValue([{ id: 11, name: "\u4EFB\u610F\u540D\u79F0\u7684\u8BC4\u7EA7\u89C4\u5219", review_type: "\u8BC4\u7EA7", status: "active", updated_at: "", config_summary: {} }]);
    getRule.mockResolvedValue({ id: 11, name: "\u4EFB\u610F\u540D\u79F0\u7684\u8BC4\u7EA7\u89C4\u5219", review_type: "\u8BC4\u7EA7", status: "active", updated_at: "", config_summary: {}, config: { levels: [{ code: "\u7B49\u7EA7A", color: "#fbd0cd" }, { code: "\u7B49\u7EA7B", color: "#fee0bd" }] } });
    route.query = { isSub: null, name: "\u5B50\u95EE\u9898" };
    create.mockResolvedValue({});
    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.get("h1").text()).toBe("\u65B0\u5EFA\u5B50\u8BC4\u4F30\u9898");
    await wrapper.get("select").setValue("11");
    await flushPromises();
    expect(wrapper.find('[aria-label="\u8BC4\u7EA7\u6863\u4F4D"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="\u914D\u7F6E\u7B49\u7EA7\u63CF\u8FF0"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="\u8BC4\u4F30\u65B9\u5F0F"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="\u5C55\u793A\u65B9\u5F0F"]').exists()).toBe(false);
    await wrapper.get("[data-submit]").trigger("click");
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ is_sub_question: true, parent_question_id: null, rule_id: 11 }));
  });
});
