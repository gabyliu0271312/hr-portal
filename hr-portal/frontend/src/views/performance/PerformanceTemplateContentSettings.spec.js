import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PerformanceTemplateContentSettings from "./PerformanceTemplateContentSettings.vue";
import PerformanceAssessmentContentLayers from "@/components/performance/PerformanceAssessmentContentLayers.vue";
import PerformanceRatingControl from "@/components/performance/PerformanceRatingControl.vue";
import { performanceReviewQuestionApi, performanceTemplateApi } from "@/api/performance";
const mockNodes = [
  { node_id: "n1", node_type: "work_summary", name: "\u5DE5\u4F5C\u603B\u7ED3\u73AF\u8282", executor_label: "\u88AB\u8BC4\u4F30\u4EBA" },
  { node_id: "n2", node_type: "reviewer_360_invite", name: "360\xB0\u9080\u8BF7\u73AF\u8282", executor_label: "\u88AB\u8BC4\u4F30\u4EBA" },
  { node_id: "n3", node_type: "reviewer_360_confirm", name: "360\xB0\u786E\u8BA4\u73AF\u8282", executor_label: "\u76F4\u5C5E\u4E0A\u7EA7" },
  { node_id: "n4", node_type: "evaluation", name: "\u8BC4\u4F30\u578B\u73AF\u8282", executor_label: "360\xB0\u8BC4\u4F30\u4EBA" },
  { node_id: "n5", node_type: "calibration", name: "\u6821\u51C6\u73AF\u8282", executor_label: "\u5728\u9879\u76EE\u914D\u7F6E\u65F6\u6307\u5B9A" },
  { node_id: "n6", node_type: "result_communication", name: "\u7ED3\u679C\u6C9F\u901A", executor_label: "\u76F4\u5C5E\u4E0A\u7EA7" },
  { node_id: "n7", node_type: "evaluation", name: "\u8BC4\u4F30\u578B\u73AF\u8282", executor_label: "\u76F4\u5C5E\u4E0A\u7EA7" },
  { node_id: "n8", node_type: "result_view", name: "\u7EE9\u6548\u7ED3\u679C\u67E5\u770B\u73AF\u8282", executor_label: "\u88AB\u8BC4\u4F30\u4EBA" },
  { node_id: "n9", node_type: "result_reconsideration", name: "\u7ED3\u679C\u590D\u8BAE\u5904\u7406", executor_label: "\u590D\u8BAE\u5904\u7406\u4EBA" }
];
function pointerEvent(type, values) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value }])));
  return event;
}
describe("PerformanceTemplateContentSettings", () => {
  beforeEach(() => {
    vi.spyOn(performanceTemplateApi, "getWorkflow").mockResolvedValue({ nodes: mockNodes });
    vi.spyOn(performanceReviewQuestionApi, "list").mockResolvedValue([]);
  });
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });
  it("renders the three-column architecture and workflow-driven stage list in API order", async () => {
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } });
    await flushPromises();
    expect(wrapper.find(".stage-panel").exists()).toBe(true);
    expect(wrapper.find(".content-canvas").exists()).toBe(true);
    expect(wrapper.find(".content-tabs__divider").exists()).toBe(true);
    expect(wrapper.get(".text-normal__title").text()).toBe("\u5185\u5BB9\u8BBE\u7F6E");
    expect(wrapper.get(".text-normal__body").text()).toBe("\u6682\u672A\u9009\u62E9\u5185\u5BB9");
    expect(wrapper.findAll(".stage-card")).toHaveLength(9);
    expect(wrapper.findAll(".stage-card__title").map((node) => node.text())).toEqual([
      "\u5DE5\u4F5C\u603B\u7ED3\u73AF\u8282",
      "360\xB0\u9080\u8BF7\u73AF\u8282",
      "360\xB0\u786E\u8BA4\u73AF\u8282",
      "\u8BC4\u4F30\u578B\u73AF\u8282",
      "\u6821\u51C6\u73AF\u8282",
      "\u7ED3\u679C\u6C9F\u901A",
      "\u8BC4\u4F30\u578B\u73AF\u8282",
      "\u7EE9\u6548\u7ED3\u679C\u67E5\u770B\u73AF\u8282",
      "\u7ED3\u679C\u590D\u8BAE\u5904\u7406"
    ]);
  });
  it("updates the selected stage without changing the empty right-panel contract", async () => {
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } });
    await flushPromises();
    await wrapper.findAll(".stage-card")[0].trigger("click");
    expect(wrapper.findAll(".stage-card")[0].classes()).toContain("selected");
    expect(wrapper.get(".text-normal__body").text()).toBe("\u6682\u672A\u9009\u62E9\u5185\u5BB9");
    expect(wrapper.get(".template-section__title").text()).toBe("\u5DE5\u4F5C\u603B\u7ED3\u73AF\u8282");
    expect(wrapper.findAll(".template-operate__button").map((button) => button.text())).toEqual(["\u6DFB\u52A0\u5185\u5BB9", "\u6DFB\u52A0\u63D0\u793A"]);
  });
  it("derives the middle tabs from the selected workflow node and moves the active ink", async () => {
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } });
    await flushPromises();
    expect(wrapper.findAll(".content-tab").map((tab) => tab.text())).toEqual(["\u914D\u7F6E\u586B\u5199\u5185\u5BB9", "\u914D\u7F6E\u53C2\u8003\u5185\u5BB9"]);
    await wrapper.findAll(".content-tab")[1].trigger("click");
    expect(wrapper.findAll(".content-tab")[1].classes()).toContain("content-tab--active");
    await wrapper.findAll(".stage-card")[0].trigger("click");
    expect(wrapper.findAll(".content-tab").map((tab) => tab.text())).toEqual(["\u914D\u7F6E\u586B\u5199\u5185\u5BB9"]);
    expect(wrapper.get(".content-tab").classes()).toContain("content-tab--active");
  });
  it("opens add-content layers for supported stages and filters result-view types", async () => {
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } });
    await flushPromises();
    await wrapper.findAll(".stage-card")[0].trigger("click");
    await wrapper.findAll(".template-operate__button")[0].trigger("click");
    expect(document.body.querySelector("#assessment-drawer-title")?.textContent).toBe("\u9009\u62E9\u8BC4\u4F30\u5185\u5BB9");
    document.body.querySelector(".drawer-header .icon-button").click();
    await wrapper.vm.$nextTick();
    await wrapper.findAll(".stage-card")[1].trigger("click");
    await wrapper.findAll(".template-operate__button")[0].trigger("click");
    expect(document.body.querySelector("#assessment-drawer-title")?.textContent).toBe("\u9009\u62E9\u8BC4\u4F30\u5185\u5BB9");
    document.body.querySelector(".drawer-header .icon-button").click();
    await wrapper.vm.$nextTick();
    await wrapper.findAll(".stage-card")[3].trigger("click");
    await wrapper.findAll(".template-operate__button")[0].trigger("click");
    expect(document.body.querySelector("#assessment-drawer-title")?.textContent).toBe("\u9009\u62E9\u8BC4\u4F30\u5185\u5BB9");
    expect(Array.from(document.body.querySelectorAll('.create-menu [role="menuitem"]')).map((node) => node.textContent)).toEqual([]);
    document.body.querySelector(".create-button").click();
    await wrapper.vm.$nextTick();
    expect(Array.from(document.body.querySelectorAll('.create-menu [role="menuitem"]')).map((node) => node.textContent)).toEqual(["\u5DE5\u4F5C\u603B\u7ED3", "\u8BC4\u5206\u8BC4\u7EA7", "\u81EA\u5B9A\u4E49"]);
    document.body.querySelector(".drawer-header .icon-button").click();
    await wrapper.vm.$nextTick();
    await wrapper.findAll(".stage-card")[7].trigger("click");
    await wrapper.findAll(".template-operate__button")[0].trigger("click");
    document.body.querySelector(".create-button").click();
    await wrapper.vm.$nextTick();
    expect(Array.from(document.body.querySelectorAll('.create-menu [role="menuitem"]')).map((node) => node.textContent)).toEqual(["\u8BC4\u5206\u8BC4\u7EA7", "\u81EA\u5B9A\u4E49"]);
  });
  it("loads only active rating questions and maps their rule name as the option description", async () => {
    vi.mocked(performanceReviewQuestionApi.list).mockResolvedValue([
      { id: 101, name: "\u7EE9\u6548\u8BC4\u7EA7", display_mode: "\u4E0B\u62C9\u6837\u5F0F", rule: { name: "7\u6863\u7EE9\u6548\u7B49\u7EA7", review_type: "\u8BC4\u7EA7", status: "active", config: { display_mode: "\u6807\u7B7E\u6837\u5F0F", levels: [{ id: "excellent", name: "\u4F18\u79C0", color: "#3370ff" }] } } },
      { id: 102, name: "\u8BC4\u5206\u9879", rule: { name: "\u767E\u5206\u5236\u8BC4\u5206", review_type: "\u8BC4\u5206", status: "active", config: {} } },
      { id: 103, name: "\u505C\u7528\u8BC4\u7EA7", rule: { name: "\u505C\u7528\u89C4\u5219", review_type: "\u8BC4\u7EA7", status: "inactive", config: {} } }
    ]);
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } });
    await flushPromises();
    expect(performanceReviewQuestionApi.list).toHaveBeenCalledWith("\u8BC4\u7EA7");
    expect(wrapper.findComponent(PerformanceAssessmentContentLayers).props("ratingOptions")).toEqual([
      expect.objectContaining({ id: "101", label: "\u7EE9\u6548\u8BC4\u7EA7", description: "7\u6863\u7EE9\u6548\u7B49\u7EA7", displayMode: "\u4E0B\u62C9\u6837\u5F0F", levels: ["\u4F18\u79C0"], levelOptions: [{ id: "excellent", label: "\u4F18\u79C0", color: "#3370ff" }] })
    ]);
    await wrapper.findAll(".stage-card")[3].trigger("click");
    await wrapper.find(".template-operate__button").trigger("click");
    await document.body.querySelector(".create-button").click();
    await wrapper.vm.$nextTick();
    await Array.from(document.body.querySelectorAll('.create-menu [role="menuitem"]')).find((node) => node.textContent === "\u8BC4\u5206\u8BC4\u7EA7").click();
    await wrapper.vm.$nextTick();
    document.body.querySelector(".select-shell > button").click();
    await wrapper.vm.$nextTick();
    const options = Array.from(document.body.querySelectorAll('.option-menu [role="option"]'));
    expect(options).toHaveLength(1);
    expect(options[0].textContent).toContain("\u7EE9\u6548\u8BC4\u7EA7");
    expect(options[0].textContent).toContain("7\u6863\u7EE9\u6548\u7B49\u7EA7");
    expect(options[0].textContent).not.toContain("\u8BC4\u5206\u9879");
    expect(options[0].textContent).not.toContain("\u505C\u7528\u8BC4\u7EA7");
  });
  it("refreshes configured rating content from the current assessment rule", async () => {
    vi.mocked(performanceTemplateApi.getWorkflow).mockResolvedValue({
      nodes: [{ ...mockNodes[0], content: [{ content_id: "rating-content", content_slot: "fill", type: "rating", name: "\u8BC4\u5206\u8BC4\u7EA7", description: "", ratingOptionId: "101", items: [{ id: "old", label: "\u65E7\u9879", hint: "" }, { id: "101", label: "\u65E7\u8BC4\u7EA7\u540D\u79F0", hint: "" }], options: [{ id: "old-level", label: "\u65E7\u7B49\u7EA7" }] }] }],
      content_library: []
    });
    vi.mocked(performanceReviewQuestionApi.list).mockResolvedValue([
      { id: 101, name: "\u5F53\u524D\u7EE9\u6548\u8BC4\u7EA7", display_mode: "\u4E0B\u62C9\u6837\u5F0F", rule: { name: "\u5F53\u524D\u8BC4\u7EA7\u89C4\u5219", review_type: "\u8BC4\u7EA7", status: "active", config: { levels: [{ id: "current-level", code: "\u5F53\u524D\u7B49\u7EA7", color: "#3370ff" }] } } }
    ]);
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } });
    await flushPromises();
    await wrapper.get(".stage-card").trigger("click");
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll(".content-renderer-rating")).toHaveLength(1);
    expect(wrapper.get(".content-renderer-rating > strong").text()).toBe("\u5F53\u524D\u7EE9\u6548\u8BC4\u7EA7");
    const ratingControl = wrapper.getComponent(PerformanceRatingControl);
    expect(ratingControl.props("displayMode")).toBe("\u4E0B\u62C9\u6837\u5F0F");
    expect(ratingControl.props("options").map((option) => option.label)).toEqual(["\u5F53\u524D\u7B49\u7EA7"]);
    expect(wrapper.get(".rating-select-preview").text()).toContain("\u8BF7\u9009\u62E9\u7B49\u7EA7");
    expect(wrapper.text()).not.toContain("\u65E7\u9879");
    expect(wrapper.text()).not.toContain("\u65E7\u7B49\u7EA7");
  });
  it("projects confirmed assessment content into the configuration panel", async () => {
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } });
    await flushPromises();
    await wrapper.findAll(".stage-card")[0].trigger("click");
    const layer = wrapper.findComponent(PerformanceAssessmentContentLayers);
    layer.vm.$emit("confirm", [{ type: "work_summary", name: "\u603B\u7ED3\u5185\u5BB9", description: "\u63CF\u8FF0", items: [{ id: "i1", label: "\u672C\u5468\u4EA7\u51FA", hint: "" }] }]);
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".configured-content-panel").text()).toContain("\u603B\u7ED3\u5185\u5BB9");
    expect(wrapper.find(".configured-content-panel").text()).toContain("\u672C\u5468\u4EA7\u51FA");
    expect(wrapper.get(".configured-content-card__description").text()).toBe("\u63CF\u8FF0");
    await wrapper.get(".configured-content-card__row").trigger("click");
    expect(wrapper.get(".configured-content-card").classes()).toContain("is-selected");
    expect(wrapper.get(".configured-content-card__row").classes()).not.toContain("is-selected");
    expect(wrapper.get(".configured-content-card__row").classes()).not.toContain("is-focused");
    expect(wrapper.find(".content-settings-detail--root").exists()).toBe(true);
    expect(wrapper.get(".content-settings-detail--root").text()).toContain("\u663E\u793A\u8BBE\u7F6E");
    expect(wrapper.get(".content-settings-detail--root").text()).toContain("\u9690\u85CF\u63CF\u8FF0");
    expect(wrapper.get(".content-settings-detail--root").text()).toContain("\u5141\u8BB8\u6DFB\u52A0\u591A\u4E2A");
    expect(wrapper.get(".content-settings-detail--root").text()).not.toContain("\u5728\u6B64\u73AF\u8282\u586B\u5199");
    expect(wrapper.get(".content-settings-detail--root").text()).not.toContain("\u5FC5\u586B\u9879\u8BBE\u7F6E");
    await wrapper.get('[data-content-item-id="i1"]').trigger("click");
    expect(wrapper.find(".content-settings-detail--item").exists()).toBe(true);
    expect(wrapper.get(".content-settings-detail--item").text()).toContain("\u5728\u6B64\u73AF\u8282\u586B\u5199");
    expect(wrapper.get(".content-settings-detail--item").text()).toContain("\u5728\u6B64\u73AF\u8282\u9690\u85CF");
    expect(wrapper.get(".content-settings-detail--item").text()).toContain("\u5FC5\u586B\u9879\u8BBE\u7F6E");
    expect(wrapper.get(".content-settings-detail--item").text()).not.toContain("\u9690\u85CF\u63CF\u8FF0");
    expect(wrapper.get(".content-settings-detail--item").text()).not.toContain("\u5141\u8BB8\u6DFB\u52A0\u591A\u4E2A");
  });
  it("persists allowMultiple in the configured content snapshot", async () => {
    const updateWorkflow = vi.spyOn(performanceTemplateApi, "updateWorkflow").mockResolvedValue({ nodes: mockNodes });
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } });
    await flushPromises();
    await wrapper.findAll(".stage-card")[0].trigger("click");
    wrapper.findComponent(PerformanceAssessmentContentLayers).vm.$emit("confirm", [{ type: "work_summary", name: "\u603B\u7ED3\u5185\u5BB9", description: "", items: [{ id: "i1", label: "\u672C\u5468\u4EA7\u51FA", hint: "" }] }]);
    await wrapper.vm.$nextTick();
    await wrapper.get(".configured-content-card__row").trigger("click");
    await wrapper.findAll('.content-settings-detail--root input[type="checkbox"]')[1].setValue(true);
    await wrapper.vm.save();
    const payload = updateWorkflow.mock.calls[0][1];
    const content = payload.nodes.flatMap((node) => node.content || []).find((item) => item.name === "\u603B\u7ED3\u5185\u5BB9");
    expect(content?.settings).toEqual({ hideDescription: false, allowMultiple: true });
  });
  it("persists every configured stage instead of only the active stage", async () => {
    const updateWorkflow = vi.spyOn(performanceTemplateApi, "updateWorkflow").mockResolvedValue({ nodes: mockNodes });
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } });
    await flushPromises();
    await wrapper.findAll(".stage-card")[0].trigger("click");
    const layer = wrapper.findComponent(PerformanceAssessmentContentLayers);
    layer.vm.$emit("confirm", [{ type: "work_summary", name: "\u9996\u73AF\u8282\u5185\u5BB9", description: "", items: [{ id: "first-item", label: "\u9996\u9879", hint: "" }] }]);
    await wrapper.findAll(".stage-card")[3].trigger("click");
    layer.vm.$emit("confirm", [{ type: "work_summary", name: "\u5F53\u524D\u73AF\u8282\u5185\u5BB9", description: "", items: [{ id: "current-item", label: "\u5F53\u524D\u9879", hint: "" }] }]);
    await wrapper.vm.$nextTick();
    await wrapper.vm.save();
    const payload = updateWorkflow.mock.calls[0][1];
    expect(payload.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ node_id: "n1", content: [expect.objectContaining({ name: "\u9996\u73AF\u8282\u5185\u5BB9" })] }),
      expect.objectContaining({ node_id: "n4", content: [expect.objectContaining({ name: "\u5F53\u524D\u73AF\u8282\u5185\u5BB9" })] })
    ]));
  });
  it("keeps configured blocks independent per stage and per content tab", async () => {
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } });
    await flushPromises();
    const layer = wrapper.findComponent(PerformanceAssessmentContentLayers);
    await wrapper.findAll(".stage-card")[0].trigger("click");
    layer.vm.$emit("confirm", [{ type: "work_summary", name: "\u5DE5\u4F5C\u603B\u7ED3\u5757", description: "", items: [{ id: "work-item", label: "\u5DE5\u4F5C\u9879", hint: "" }] }]);
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".configured-content-panel").text()).toContain("\u5DE5\u4F5C\u603B\u7ED3\u5757");
    await wrapper.findAll(".stage-card")[1].trigger("click");
    expect(wrapper.find(".configured-content-panel").exists()).toBe(false);
    await wrapper.findAll(".template-operate__button")[0].trigger("click");
    expect(wrapper.findComponent(PerformanceAssessmentContentLayers).props("initialContents")).toEqual([]);
    document.body.querySelector(".drawer-header .icon-button").click();
    await wrapper.vm.$nextTick();
    await wrapper.findAll(".stage-card")[3].trigger("click");
    await wrapper.findAll(".content-tab")[1].trigger("click");
    expect(wrapper.find(".configured-content-panel").exists()).toBe(false);
  });
  it("persists configured content and hydrates it on reopen", async () => {
    const updateWorkflow = vi.spyOn(performanceTemplateApi, "updateWorkflow").mockResolvedValue({ nodes: mockNodes });
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } });
    await flushPromises();
    await wrapper.findAll(".stage-card")[3].trigger("click");
    const layer = wrapper.findComponent(PerformanceAssessmentContentLayers);
    layer.vm.$emit("confirm", [{ type: "work_summary", name: "\u5DF2\u4FDD\u5B58\u603B\u7ED3", description: "", items: [{ id: "saved-item", label: "\u5DF2\u4FDD\u5B58\u586B\u5199\u9879", hint: "" }] }]);
    await wrapper.vm.$nextTick();
    await wrapper.vm.save();
    expect(updateWorkflow).toHaveBeenCalledWith(1, expect.objectContaining({
      nodes: expect.arrayContaining([expect.objectContaining({ node_id: "n4", content: [expect.objectContaining({ name: "\u5DF2\u4FDD\u5B58\u603B\u7ED3" })] })])
    }));
    vi.mocked(performanceTemplateApi.getWorkflow).mockResolvedValue({
      nodes: mockNodes.map((node) => node.node_id === "n4" ? { ...node, content: [{ type: "work_summary", name: "\u91CD\u5F00\u603B\u7ED3", description: "", items: [{ id: "reopen-item", label: "\u91CD\u5F00\u586B\u5199\u9879", hint: "" }] }] } : node)
    });
    const reopened = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } });
    await flushPromises();
    await reopened.findAll(".stage-card")[3].trigger("click");
    expect(reopened.find(".configured-content-panel").text()).toContain("\u91CD\u5F00\u603B\u7ED3");
    expect(reopened.find(".configured-content-panel").text()).toContain("\u91CD\u5F00\u586B\u5199\u9879");
  });
  it("scopes root and item selection to the rendered content card", async () => {
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } });
    await flushPromises();
    const layer = wrapper.findComponent(PerformanceAssessmentContentLayers);
    layer.vm.$emit("confirm", [
      { type: "work_summary", name: "\u7B2C\u4E00\u5757", description: "", items: [{ id: "same-item", label: "\u76F8\u540C\u586B\u5199\u9879", hint: "" }] },
      { type: "work_summary", name: "\u7B2C\u4E8C\u5757", description: "", items: [{ id: "same-item", label: "\u76F8\u540C\u586B\u5199\u9879", hint: "" }] }
    ]);
    await wrapper.vm.$nextTick();
    const cards = wrapper.findAll(".configured-content-card");
    expect(cards).toHaveLength(2);
    await cards[0].find(".configured-content-card__row").trigger("click");
    expect(wrapper.findAll(".performance-content-selection-frame--root.is-selected")).toHaveLength(1);
    await cards[0].find('[data-content-item-id="same-item"]').trigger("click");
    expect(wrapper.findAll(".performance-content-selection-frame--item.is-selected")).toHaveLength(1);
    expect(wrapper.findAll(".performance-content-selection-frame--root.is-selected")).toHaveLength(0);
  });
  it("applies the captured work-summary root and item settings without crossing owners", async () => {
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } });
    await flushPromises();
    await wrapper.findAll(".stage-card")[0].trigger("click");
    const layer = wrapper.findComponent(PerformanceAssessmentContentLayers);
    layer.vm.$emit("confirm", [{ type: "work_summary", name: "\u5DE5\u4F5C\u603B\u7ED3", description: "\u63CF\u8FF0", items: [{ id: "fill-item", label: "\u586B\u5199\u9898\u540D\u79F0", hint: "" }] }]);
    await wrapper.vm.$nextTick();
    const card = wrapper.get(".configured-content-card");
    await card.get(".configured-content-card__row").trigger("click");
    let rootCheckboxes = wrapper.findAll('.content-settings-detail--root input[type="checkbox"]');
    expect(rootCheckboxes).toHaveLength(2);
    expect(wrapper.get(".content-settings-detail--root").text()).not.toContain("\u5728\u6B64\u73AF\u8282\u586B\u5199");
    await rootCheckboxes[0].setValue(true);
    expect(card.classes()).toContain("hides-description");
    expect(card.find(".configured-content-card__description").exists()).toBe(false);
    await rootCheckboxes[0].setValue(false);
    expect(card.classes()).not.toContain("hides-description");
    expect(card.get(".configured-content-card__description").text()).toBe("\u63CF\u8FF0");
    await rootCheckboxes[1].setValue(true);
    expect(card.classes()).toContain("allows-multiple");
    expect(card.get(".configured-content-card__add-item").text()).toBe("\u6DFB\u52A0");
    expect(card.find('[data-icon="AddOutlined"]').exists()).toBe(true);
    await card.get(".configured-content-card__add-item").trigger("click");
    expect(card.findAll("[data-content-item-id]")).toHaveLength(1);
    await card.get(".configured-content-card__row").trigger("click");
    rootCheckboxes = wrapper.findAll('.content-settings-detail--root input[type="checkbox"]');
    await rootCheckboxes[1].setValue(false);
    expect(card.find(".configured-content-card__add-item").exists()).toBe(false);
    await card.findAll("[data-content-item-id]")[0].trigger("click");
    let itemRadios = wrapper.findAll('.content-settings-detail--item input[type="radio"]');
    expect(itemRadios).toHaveLength(2);
    expect(wrapper.get(".content-settings-detail--item").text()).not.toContain("\u9690\u85CF\u63CF\u8FF0");
    expect(wrapper.get(".content-settings-detail--item").text()).not.toContain("\u5141\u8BB8\u6DFB\u52A0\u591A\u4E2A");
    await itemRadios[1].setValue();
    const firstItem = card.get('[data-content-item-id="fill-item"]');
    expect(firstItem.classes()).toContain("content-renderer-item--hidden");
    expect(firstItem.find('[data-icon="VisibleLockOutlined"]').exists()).toBe(true);
    expect(wrapper.find(".work-summary-required-setting").exists()).toBe(false);
    expect(firstItem.find(".performance-assessment-rich-text-field__label i").exists()).toBe(false);
    itemRadios = wrapper.findAll('.content-settings-detail--item input[type="radio"]');
    await itemRadios[0].setValue();
    expect(card.find('[data-icon="VisibleLockOutlined"]').exists()).toBe(false);
    expect(wrapper.find(".work-summary-required-setting").exists()).toBe(true);
    const required = wrapper.get('.content-settings-detail--item input[type="checkbox"]');
    await required.setValue(false);
    expect(firstItem.find(".performance-assessment-rich-text-field__label i").exists()).toBe(false);
    await required.setValue(true);
    expect(firstItem.get(".performance-assessment-rich-text-field__label i").text()).toBe("*");
    await card.get(".configured-content-card__row").trigger("click");
    expect(wrapper.find(".content-settings-detail--root").exists()).toBe(true);
    expect(wrapper.get(".content-settings-detail--root").text()).not.toContain("\u5FC5\u586B\u9879\u8BBE\u7F6E");
  });
  it("applies the complete content-rule component by stage variant instead of content type", async () => {
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } });
    await flushPromises();
    const layer = wrapper.findComponent(PerformanceAssessmentContentLayers);
    await wrapper.findAll(".stage-card")[0].trigger("click");
    layer.vm.$emit("confirm", [{ type: "custom", name: "\u590D\u7528\u533A\u5757", description: "\u63CF\u8FF0", items: [{ id: "custom-item", label: "\u586B\u5199\u9879", hint: "" }] }]);
    await wrapper.vm.$nextTick();
    await wrapper.get(".configured-content-card__row").trigger("click");
    expect(wrapper.find(".content-settings-detail--root").exists()).toBe(true);
    await wrapper.findAll(".stage-card")[3].trigger("click");
    layer.vm.$emit("confirm", [{ type: "work_summary", name: "\u975E\u5E94\u7528\u73AF\u8282\u5185\u5BB9", description: "\u63CF\u8FF0", items: [{ id: "other-item", label: "\u586B\u5199\u9879", hint: "" }] }]);
    await wrapper.vm.$nextTick();
    await wrapper.get(".configured-content-card__row").trigger("click");
    expect(wrapper.find(".content-settings-detail--root").exists()).toBe(false);
    expect(wrapper.get(".text-normal__body").text()).toBe("\u6682\u672A\u9009\u62E9\u5185\u5BB9");
  });
  it("normalizes legacy duplicate rating items to the explicitly selected question", async () => {
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } });
    await flushPromises();
    const layer = wrapper.findComponent(PerformanceAssessmentContentLayers);
    layer.vm.$emit("confirm", [{
      type: "rating",
      name: "\u8BC4\u5206\u8BC4\u7EA7",
      description: "",
      ratingOptionId: "new",
      items: [{ id: "old", label: "\u65E7\u8BC4\u4F30\u9879", hint: "" }, { id: "new", label: "\u65B0\u8BC4\u4F30\u9879", hint: "" }],
      options: [{ id: "excellent", label: "\u4F18\u79C0", color: "#3370ff" }]
    }]);
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll(".content-renderer-rating")).toHaveLength(1);
    expect(wrapper.get(".content-renderer-rating > strong").text()).toBe("\u65B0\u8BC4\u4F30\u9879");
    expect(wrapper.text()).not.toContain("\u65E7\u8BC4\u4F30\u9879");
    expect(wrapper.findAll(".content-renderer-rating__levels .performance-rating-control__option").map((item) => item.text())).toEqual(["\u4F18\u79C0"]);
  });
  it("exposes captured card actions, enforces move boundaries, and deletes a configured card", async () => {
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } });
    await flushPromises();
    const layer = wrapper.findComponent(PerformanceAssessmentContentLayers);
    layer.vm.$emit("confirm", [
      { type: "work_summary", name: "First", description: "", items: [{ id: "a", label: "A", hint: "" }] },
      { type: "rating", name: "Second", description: "", items: [{ id: "b", label: "B", hint: "" }] }
    ]);
    await wrapper.vm.$nextTick();
    const cards = () => wrapper.findAll(".configured-content-card");
    await cards()[0].trigger("mouseenter");
    const actions = cards()[0].findAll(".captured-actions .performance-icon-button");
    expect(actions).toHaveLength(4);
    expect(actions[0].attributes("disabled")).toBeDefined();
    expect(actions[1].attributes("disabled")).toBeUndefined();
    expect(cards()[0].find(".performance-expand-button").exists()).toBe(true);
    expect(cards()[0].find('[data-icon="DragOutlined"]').exists()).toBe(true);
    await actions[1].trigger("click");
    expect(cards().map((card) => card.find("strong").text())).toEqual(["Second", "First"]);
    await cards()[0].trigger("mouseenter");
    await cards()[0].find('[aria-label="Delete content"]').trigger("click");
    expect(cards()).toHaveLength(1);
    expect(cards()[0].find("strong").text()).toBe("First");
  });
  it("reorders different-height content cards through the shared sortable list", async () => {
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } });
    await flushPromises();
    const layer = wrapper.findComponent(PerformanceAssessmentContentLayers);
    layer.vm.$emit("confirm", [
      { type: "work_summary", name: "Short card", description: "", items: [{ id: "a", label: "A", hint: "" }] },
      { type: "rating", name: "Expanded card", description: "More details", items: [{ id: "b", label: "B", hint: "" }, { id: "c", label: "C", hint: "" }] }
    ]);
    await wrapper.vm.$nextTick();
    const cards = wrapper.findAll(".configured-content-card");
    cards.forEach((card, index) => {
      vi.spyOn(card.element, "getBoundingClientRect").mockReturnValue({
        top: index === 0 ? 0 : 64,
        left: 0,
        right: 800,
        bottom: index === 0 ? 56 : 160,
        width: 800,
        height: index === 0 ? 56 : 96,
        x: 0,
        y: index === 0 ? 0 : 64,
        toJSON: () => ({})
      });
    });
    await cards[0].find("[data-drag-handle]").trigger("pointerdown", { button: 0, pointerId: 10, clientX: 20, clientY: 20 });
    window.dispatchEvent(pointerEvent("pointermove", { pointerId: 10, clientX: 20, clientY: 100 }));
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".configured-content-sortable-list [data-sortable-placeholder]").exists()).toBe(true);
    window.dispatchEvent(pointerEvent("pointerup", { pointerId: 10, clientX: 20, clientY: 100 }));
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll(".configured-content-card").map((card) => card.find("strong").text())).toEqual(["Expanded card", "Short card"]);
  });
});
