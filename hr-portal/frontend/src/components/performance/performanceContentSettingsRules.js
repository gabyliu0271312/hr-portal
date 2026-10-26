const itemSettingsCapabilities = {
  "calibration-work-summary": { hideName: false, mode: true, required: true, viewResults: true, modeDisabled: true, requiredDisabled: true, allowModify: true },
  "calibration-custom-text": { hideName: true, mode: true, required: true, viewResults: true, modeDisabled: true, requiredDisabled: true, allowModify: true },
  "calibration-custom-tag": { hideName: true, hideDescription: true, mode: true, required: true, viewResults: true, modeDisabled: true, requiredDisabled: true, allowModify: true },
  "calibration-rating": { hideName: true, mode: false, required: true, levelRules: true, requiredDisabled: true, allowModify: true },
  "work-summary": { hideName: false, mode: true, required: true },
  "custom-text": { hideName: true, mode: true, required: true },
  "custom-tag": { hideName: true, hideDescription: true, mode: true, required: true },
  rating: { hideName: true, mode: false, required: true, levelRules: true },
  prompt: { hideName: false, mode: false, required: false, allowView: true, onlyWhenFilling: true },
  "evaluation-work-summary": { hideName: false, mode: true, required: true, viewResults: true },
  "evaluation-custom-text": { hideName: true, mode: true, required: true, viewResults: true },
  "evaluation-custom-tag": { hideName: true, hideDescription: true, mode: true, required: true, viewResults: true },
  "evaluation-rating": { hideName: true, mode: false, required: true, levelRules: true },
  "result-communication-work-summary": { hideName: false, mode: true, required: true, viewResults: true },
  "result-communication-custom-text": { hideName: true, mode: true, required: true, viewResults: true },
  "result-communication-custom-tag": { hideName: true, hideDescription: true, mode: true, required: true, viewResults: true },
  "result-communication-rating": { hideName: true, mode: false, required: true, levelRules: true },
  "result-view-work-summary": { hideName: false, mode: false, required: false, allowView: true },
  "result-view-rating": { hideName: true, mode: false, required: false, allowView: true },
  "result-view-custom-text": { hideName: true, hideDescription: true, mode: false, required: false, allowView: true },
  "result-view-tag": { hideName: true, hideDescription: true, mode: false, required: false, allowView: true }
};
function getItemSettingsVariant(content, item) {
  if (content.type === "prompt" || item?.kind === "prompt") return "prompt";
  if (item?.kind === "rating" || content.type === "rating" && item?.kind === void 0) return "rating";
  if (content.type === "custom" || content.type === "rating" && item?.kind === "fill") return (item?.questionType || content.questionType || "text") === "tag" ? "custom-tag" : "custom-text";
  return "work-summary";
}
function supportsEvaluationView(content, item) {
  const variant = getItemSettingsVariant(content, item);
  return variant === "work-summary" || variant === "custom-text" || variant === "custom-tag";
}
function supportsEvaluationItemSettings(content, item) {
  return supportsEvaluationView(content, item) || getItemSettingsVariant(content, item) === "rating";
}
function supportsResultViewSettings(content, item) {
  return ["work-summary", "rating", "custom-text", "custom-tag"].includes(getItemSettingsVariant(content, item));
}
function supportsStageItemView(nodeType, content, item) {
  if (nodeType === "calibration") return supportsEvaluationView(content, item);
  if (nodeType === "evaluation") return supportsEvaluationView(content, item);
  if (nodeType === "result_communication") return ["work-summary", "custom-text", "custom-tag"].includes(getItemSettingsVariant(content, item));
  return false;
}
function getEvaluationExecutorKind(executorLabel, executorTypes = []) {
  if (executorLabel?.includes("360") || executorTypes.some((type) => /360|REVIEWER/i.test(type))) return "reviewer_360";
  if (executorLabel?.includes("\u76F4\u5C5E") || executorLabel?.includes("\u76F4\u63A5") || executorLabel?.includes("\u5B9E\u7EBF") || executorTypes.includes("DIRECT_MANAGER")) return "direct_manager";
  return "other";
}
function getRootSettingsCapabilities(content, variant = "") {
  if (content.type === "prompt") return { allowMultiple: false, allowUnknown: false };
  if (variant === "evaluation-360-root") return { allowMultiple: content.type === "work_summary", allowUnknown: content.type === "rating" };
  if (variant === "evaluation-direct-root") return { allowMultiple: content.type === "work_summary", allowUnknown: false };
  if (variant === "result-communication-root") return { allowMultiple: content.type === "work_summary", allowUnknown: false };
  if (variant === "result-view-root") return { allowMultiple: false, allowUnknown: false, allowView: true };
  return { allowMultiple: content.type === "work_summary", allowUnknown: content.type === "rating" && content.items.some((item) => item.kind !== "fill" && item.kind !== "prompt") };
}
const genericRule = {
  visibleSlots: ["fill", "reference"],
  forbiddenSlots: ["adjustment", "view"],
  rootSettingsEnabled: false,
  itemSettingsEnabled: false,
  rootSettingsVariant: "generic-root",
  itemSettingsVariant: "generic-item",
  allowedContentTypes: ["work_summary", "rating", "custom"]
};
const stageContentRules = {
  work_summary: {
    ...genericRule,
    visibleSlots: ["fill"],
    forbiddenSlots: ["reference", "adjustment", "view"],
    rootSettingsEnabled: true,
    itemSettingsEnabled: true,
    rootSettingsVariant: "work-summary-root",
    itemSettingsVariant: "work-summary-item"
  },
  reviewer_360_invite: genericRule,
  reviewer_360_confirm: genericRule,
  evaluation: {
    ...genericRule,
    itemSettingsEnabled: true,
    itemSettingsVariant: "evaluation-item"
  },
  calibration: {
    ...genericRule,
    visibleSlots: ["adjustment"],
    itemSettingsEnabled: true,
    itemSettingsVariant: "calibration-item",
    forbiddenSlots: ["fill", "reference", "view"]
  },
  result_communication: {
    ...genericRule,
    rootSettingsEnabled: true,
    itemSettingsEnabled: true,
    rootSettingsVariant: "result-communication-root",
    itemSettingsVariant: "result-communication-item"
  },
  result_view: {
    ...genericRule,
    visibleSlots: ["view"],
    forbiddenSlots: ["fill", "reference", "adjustment"],
    rootSettingsEnabled: true,
    itemSettingsEnabled: true,
    rootSettingsVariant: "result-view-root",
    itemSettingsVariant: "result-view-item",
    allowedContentTypes: ["work_summary", "rating", "custom"]
  },
  result_reconsideration: {
    ...genericRule,
    rootSettingsVariant: "appeal-root"
  }
};
const contentSlotLabels = {
  fill: "\u914D\u7F6E\u586B\u5199\u5185\u5BB9",
  reference: "\u914D\u7F6E\u53C2\u8003\u5185\u5BB9",
  adjustment: "\u914D\u7F6E\u4F9B\u8C03\u6574\u5185\u5BB9",
  view: "\u914D\u7F6E\u67E5\u770B\u5185\u5BB9"
};
function getStageContentRule(nodeType, evaluationExecutorKind = "other") {
  const rule = stageContentRules[nodeType || ""] || genericRule;
  if (nodeType === "evaluation" && evaluationExecutorKind !== "other") {
    return {
      ...rule,
      rootSettingsEnabled: true,
      rootSettingsVariant: evaluationExecutorKind === "reviewer_360" ? "evaluation-360-root" : "evaluation-direct-root"
    };
  }
  return rule;
}
function getStageContentTabs(nodeType, evaluationExecutorKind = "other") {
  return getStageContentRule(nodeType, evaluationExecutorKind).visibleSlots.map((key) => ({ key, label: contentSlotLabels[key] }));
}
function supportsCalibrationItemSettings(content, item) {
  return ["work-summary", "custom-text", "custom-tag", "rating"].includes(getItemSettingsVariant(content, item));
}
function resolveCalibrationContents(contents, settings = {}) {
  return contents.map((content) => ({
    ...content,
    content_slot: "adjustment",
    items: content.items.map((item) => {
      if (!supportsCalibrationItemSettings(content, item)) return item;
      const override = settings[content.content_id || content.id || `${content.type}-${content.name}`]?.items?.[item.id];
      return {
        ...item,
        settings: {
          ...item.settings,
          ...override?.hideName !== void 0 ? { hideName: override.hideName } : {},
          ...override?.hideDescription !== void 0 ? { hideDescription: override.hideDescription } : {},
          ...override?.levelRulesEnabled !== void 0 ? { levelRulesEnabled: override.levelRulesEnabled } : {},
          allowModify: override?.allowModify !== false
        }
      };
    })
  }));
}
export {
  contentSlotLabels,
  getEvaluationExecutorKind,
  getItemSettingsVariant,
  getRootSettingsCapabilities,
  getStageContentRule,
  getStageContentTabs,
  itemSettingsCapabilities,
  resolveCalibrationContents,
  stageContentRules,
  supportsCalibrationItemSettings,
  supportsEvaluationItemSettings,
  supportsEvaluationView,
  supportsResultViewSettings,
  supportsStageItemView
};
