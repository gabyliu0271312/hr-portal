import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { performanceReviewApi } from "@/api/performance";
import { usePerformanceProjectContextStore } from "@/stores/performanceProjectContext";
const push = vi.fn();
const replace = vi.fn();
vi.mock("vue-router", () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push, replace })
}));
import Review from "./Review.vue";
import performanceLayoutSource from "@/layouts/PerformanceLayout.vue?raw";
import reviewSource from "./Review.vue?raw";
import reviewContentSource from "@/components/performance/PerformanceReviewContent.vue?raw";
const overview = {
  projects: [{ project_id: 1, project_name: "\u7EE9\u6548\u9879\u76EE", cycle_name: "2026\u5E74\u5168\u5E74", cycle_start_at: "2026-01-01", cycle_end_at: "2026-12-31" }],
  active_project: { project_id: 1, project_name: "\u7EE9\u6548\u9879\u76EE", cycle_name: "2026\u5E74\u5168\u5E74", cycle_start_at: "2026-01-01", cycle_end_at: "2026-12-31" },
  template_name: "\u534A\u5E74\u5EA6\u7EE9\u6548\u8BC4\u4F30\u6A21\u677F",
  categories: [
    { key: "mine", label: "\u6211\u7684\u7EE9\u6548", nodes: [{ task_id: 11, node_id: "summary", node_name: "\u5DE5\u4F5C\u603B\u7ED3\u73AF\u8282", node_type: "work_summary", task_kind: "work_summary", entry_mode: "template_task", executor_label: "\u88AB\u8BC4\u4F30\u4EBA", status: "pending", start_at: null, end_at: null, action_url: "/performance/review?node=summary" }] },
    { key: "others", label: "\u7ED9\u4ED6\u4EBA\u7684\u8BC4\u4F30", nodes: [{ node_id: "review-360", node_name: "360\xB0\u8BC4\u4F30", node_type: "evaluation", executor_label: "360\xB0\u8BC4\u4F30\u4EBA", status: "overdue", start_at: null, end_at: null, action_url: "/performance/review?node=review-360" }] },
    { key: "team", label: "\u6211\u56E2\u961F\u7684\u7EE9\u6548", nodes: [{ node_id: "calibration", node_name: "\u6821\u51C6\u73AF\u8282", node_type: "calibration", executor_label: "\u5728\u9879\u76EE\u914D\u7F6E\u65F6\u6307\u5B9A", status: "not_started", start_at: null, end_at: null, action_url: "/performance/review?node=calibration" }] },
    { key: "other", label: "\u5176\u4ED6\u4E8B\u9879", nodes: [{ node_id: "appeal", node_name: "\u7ED3\u679C\u590D\u8BAE\u5904\u7406\u73AF\u8282", node_type: "result_reconsideration", executor_label: "", status: "pending", start_at: null, end_at: null, action_url: "/performance/review?node=appeal" }] }
  ]
};
let pinia;
function mountView() {
  return mount(Review, {
    global: {
      plugins: [pinia],
      stubs: {
        "el-icon": { template: "<span><slot /></span>" },
        "el-dropdown": { template: '<div><slot /><slot name="dropdown" /></div>' },
        "el-dropdown-menu": { template: "<div><slot /></div>" },
        "el-dropdown-item": { template: "<div><slot /></div>", props: ["command"] }
      }
    }
  });
}
describe("PerformanceReview", () => {
  it("uses the same outer card width and scrollbar behavior for every node state", () => {
    expect(performanceLayoutSource).toMatch(/\.review-main\s*\{[^}]*scrollbar-gutter:\s*auto/s);
    expect(reviewSource).toContain(":global(html:has(.review-page)) { scrollbar-gutter: auto; }");
    expect(reviewContentSource).toMatch(/\.review-content\s*\{[^}]*padding:\s*var\(--performance-review-surface-inset\) var\(--performance-review-surface-inset\) 0;[^}]*scrollbar-width:\s*none/s);
    expect(reviewContentSource).toMatch(/\.review-content::-webkit-scrollbar\s*\{[^}]*display:\s*none/s);
    expect(reviewContentSource).not.toMatch(/\.review-content\.is-completed\s*\{/);
  });
  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    localStorage.clear();
    push.mockReset();
    replace.mockReset();
    vi.restoreAllMocks();
    vi.spyOn(performanceReviewApi, "overview").mockResolvedValue(overview);
  });
  it("renders the template name and all four template-driven categories", async () => {
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.text()).toContain("\u534A\u5E74\u5EA6\u7EE9\u6548\u8BC4\u4F30\u6A21\u677F");
    expect(wrapper.text()).toContain("\u6211\u7684\u7EE9\u6548");
    expect(wrapper.text()).toContain("\u7ED9\u4ED6\u4EBA\u7684\u8BC4\u4F30");
    expect(wrapper.text()).toContain("\u6211\u56E2\u961F\u7684\u7EE9\u6548");
    expect(wrapper.text()).toContain("\u5176\u4ED6\u4E8B\u9879");
    expect(wrapper.text()).toContain("\u5DE5\u4F5C\u603B\u7ED3\u73AF\u8282");
    expect(wrapper.get(".review-sidebar").attributes("style")).toBeUndefined();
    expect(wrapper.findAll(".category-icon svg")).toHaveLength(4);
    expect(usePerformanceProjectContextStore().activeProjectId).toBe(1);
  });
  it("restores cached overview immediately and refreshes it silently", async () => {
    const context = usePerformanceProjectContextStore();
    context.setActiveProjectId(1);
    context.setReviewOverview(overview);
    vi.mocked(performanceReviewApi.overview).mockReturnValue(new Promise(() => {
    }));
    const wrapper = mountView();
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain("\u534A\u5E74\u5EA6\u7EE9\u6548\u8BC4\u4F30\u6A21\u677F");
    expect(wrapper.text()).not.toContain("\u6B63\u5728\u52A0\u8F7D\u7EE9\u6548\u8BC4\u4F30");
    expect(performanceReviewApi.overview).toHaveBeenCalledWith(1, void 0);
  });
  it("supports collapsing each category block from its title button", async () => {
    const wrapper = mountView();
    await flushPromises();
    const categoryToggle = wrapper.get(".category-toggle");
    expect(categoryToggle.attributes("aria-expanded")).toBe("true");
    await categoryToggle.trigger("click");
    expect(categoryToggle.attributes("aria-expanded")).toBe("false");
    expect(wrapper.get(".review-node-list").attributes("style")).toContain("display: none");
  });
  it("uses only registered task kind and entry mode for template task navigation", async () => {
    const { performanceTaskEntryRoute } = await import("@/components/performance/performanceTaskEntry");
    const registered = overview.categories[0].nodes[0];
    expect(performanceTaskEntryRoute(registered, 1)).toBe("/performance/review/self-summary?task_id=11&project_id=1");
    expect(performanceTaskEntryRoute({ ...registered, task_id: 299, task_kind: "evaluation" }, 3)).toBe("/performance/review/template-task?task_id=299&project_id=3");
    expect(performanceTaskEntryRoute({ ...registered, entry_mode: "route" }, 1)).toBeNull();
    expect(performanceTaskEntryRoute({ ...registered, task_kind: "future_task" }, 1)).toBeNull();
    expect(performanceTaskEntryRoute({ ...registered, task_id: void 0 }, 1)).toBeNull();
  });
  it("shows node states and keeps internal task navigation inside the SPA", async () => {
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.text()).toContain("\u5F85\u5B8C\u6210");
    expect(wrapper.text()).toContain("\u5DF2\u903E\u671F");
    expect(wrapper.text()).toContain("\u672A\u5F00\u59CB");
    await wrapper.get(".review-node").trigger("click");
    await wrapper.get(".primary-button").trigger("click");
    expect(push).toHaveBeenCalledWith("/performance/review/self-summary?task_id=11&project_id=1");
  });
  it("keeps the time subtitle on unfinished nodes", async () => {
    const scheduled = structuredClone(overview);
    scheduled.categories[0].nodes[0].end_at = "2026-09-24T15:59:00Z";
    scheduled.categories[2].nodes[0].start_at = "2026-09-24T00:00:00Z";
    vi.mocked(performanceReviewApi.overview).mockResolvedValueOnce(scheduled);
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.get(".review-heading .review-deadline").text()).toContain("\u622A\u6B62\u65F6\u95F4\uFF1A");
    await wrapper.findAll(".review-node")[2].trigger("click");
    expect(wrapper.get(".review-heading .review-deadline").text()).toContain("\u542F\u52A8\u65F6\u95F4\uFF1A");
    expect(wrapper.findAll(".review-panel")).toHaveLength(1);
  });
  it("keeps the submitted task selected and renders its answers in the review panel", async () => {
    const completed = structuredClone(overview);
    Object.assign(completed.categories[0].nodes[0], {
      status: "completed",
      submitted_at: "2026-09-17T03:10:10Z",
      end_at: "2026-09-24T15:59:00Z",
      editable: true,
      form_schema: [
        { id: "work", name: "\u5DE5\u4F5C\u603B\u7ED3", description: "\u63CF\u8FF0", allow_multiple: true, fields: [{ id: "answer", type: "rich_text", label: "\u586B\u5199\u5185\u5BB9" }] },
        { id: "rating", name: "\u8BC4\u5206\u8BC4\u7EA7", fields: [{ id: "level", type: "rating", label: "\u7EE9\u6548\u8BC4\u7EA7", options: [{ id: "four", label: "4\u661F", color: "#d9f5d6", description: "\u8D85\u51FA\u9884\u671F" }] }] },
        { id: "tag", name: "\u6807\u7B7E\u578B\u586B\u5199\u9898", fields: [{ id: "contribution", type: "tag_with_followup", label: "\u4EF7\u503C\u8D21\u732E", options: [{ id: "good", label: "\u505A\u5F97\u597D\u7684" }] }] }
      ],
      answers: { answer: ["<ol><li><b>\u5DF2\u63D0\u4EA4\u5185\u5BB9</b></li></ol>"], level: "four", contribution: { tags: ["good"], note: "<p>\u8865\u5145\u8BF4\u660E</p>" } }
    });
    vi.mocked(performanceReviewApi.overview).mockResolvedValueOnce(completed);
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.text()).toContain("\u5DF2\u5B8C\u6210");
    expect(wrapper.text()).toContain("\u586B\u5199\u5185\u5BB9 1");
    expect(wrapper.text()).toContain("\u5DF2\u63D0\u4EA4\u5185\u5BB9");
    expect(wrapper.text()).toContain("\u4F60\u53EF\u4EE5\u5728 2026-09-24 23:59\uFF08GMT+8\uFF09 \u524D\u7EE7\u7EED\u7F16\u8F91");
    expect(wrapper.find(".review-heading .review-deadline").exists()).toBe(false);
    expect(wrapper.get(".performance-review-completion-notice__edit").text()).toBe("\u7F16\u8F91");
    expect(wrapper.get(".performance-review-completion-notice__edit").attributes("aria-label")).toBe("\u7F16\u8F91\u5DF2\u63D0\u4EA4\u5185\u5BB9");
    expect(wrapper.get(".performance-review-completion-notice__edit svg").attributes("viewBox")).toBe("0 0 24 24");
    expect(wrapper.get(".performance-review-completion-notice__edit svg").attributes("data-icon")).toBe("EditOutlined");
    expect(wrapper.text()).toContain("4\u661F");
    expect(wrapper.get(".readonly-field-rating").text()).toContain("\u7EE9\u6548\u8BC4\u7EA74\u661F\u8D85\u51FA\u9884\u671F");
    expect(wrapper.text()).toContain("\u8D85\u51FA\u9884\u671F");
    expect(wrapper.text()).toContain("\u505A\u5F97\u597D\u7684");
    expect(wrapper.text()).toContain("\u8865\u5145\u8BF4\u660E");
    expect(wrapper.get(".rich-answer ol li b").text()).toBe("\u5DF2\u63D0\u4EA4\u5185\u5BB9");
    expect(wrapper.text()).not.toContain("\u6682\u672A\u586B\u5199");
    expect(wrapper.text()).not.toContain("\u53BB\u5B8C\u6210");
    await wrapper.get(".performance-review-completion-notice__edit").trigger("click");
    expect(replace).toHaveBeenLastCalledWith({ query: { project_id: "1", node: "summary", task_id: "11" } });
    expect(push).toHaveBeenCalledWith("/performance/review/self-summary?task_id=11&project_id=1");
  });
  it("shows submitted content without an edit action after the deadline", async () => {
    const completed = structuredClone(overview);
    Object.assign(completed.categories[0].nodes[0], {
      status: "completed",
      editable: false,
      end_at: "2026-07-10T15:59:00Z",
      form_schema: [{ id: "work", name: "\u5DE5\u4F5C\u603B\u7ED3", fields: [{ id: "answer", type: "rich_text", label: "\u603B\u7ED3" }] }],
      answers: { answer: '<script>alert(1)<\/script><a href="javascript:alert(1)">\u6076\u610F\u94FE\u63A5</a><ul><li>\u4FDD\u7559\u5217\u8868</li></ul>' }
    });
    vi.mocked(performanceReviewApi.overview).mockResolvedValueOnce(completed);
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.text()).toContain("\u4FDD\u7559\u5217\u8868");
    expect(wrapper.find(".rich-answer ul li").exists()).toBe(true);
    expect(wrapper.find(".rich-answer script").exists()).toBe(false);
    expect(wrapper.get(".rich-answer a").attributes("href")).toBeUndefined();
    expect(wrapper.find(".performance-review-completion-notice").exists()).toBe(true);
    expect(wrapper.text()).toContain("\u8BE5\u73AF\u8282\u5DF2\u5728 2026-07-10 23:59\uFF08GMT+8\uFF09 \u622A\u6B62\uFF1B\u5982\u6709\u7591\u95EE\uFF0C\u8BF7\u8054\u7CFB\u4F60\u7684 HRBP\u3002");
    expect(wrapper.find(".performance-review-completion-notice__edit").exists()).toBe(false);
  });
  it("renders an empty state when the current user has no started project", async () => {
    vi.mocked(performanceReviewApi.overview).mockResolvedValueOnce({
      projects: [],
      active_project: null,
      template_name: "",
      categories: overview.categories.map((category) => ({ ...category, nodes: [] }))
    });
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.text()).toContain("\u6682\u65E0\u5DF2\u542F\u52A8\u7684\u7EE9\u6548\u8BC4\u4F30");
  });
});
