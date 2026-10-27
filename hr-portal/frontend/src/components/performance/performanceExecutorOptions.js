const SUBJECT_EXECUTOR_OPTION = {
  type: "SUBJECT",
  roleCode: "assessment.reviewee",
  label: "\u88AB\u8BC4\u4F30\u4EBA"
};
const CALIBRATION_EXECUTOR_OPTION = {
  type: "PROJECT_CONFIGURED",
  roleCode: "assessment.calibrator",
  label: "\u5728\u9879\u76EE\u914D\u7F6E\u65F6\u6307\u5B9A"
};
const PERFORMANCE_EXECUTOR_OPTIONS = [
  SUBJECT_EXECUTOR_OPTION,
  { type: "REVIEWER_360", roleCode: "assessment.reviewer_360", label: "360\xB0\u8BC4\u4F30\u4EBA" },
  { type: "REAL_LINE_MANAGER", roleCode: "assessment.line_manager", label: "\u5B9E\u7EBF\u4E0A\u7EA7" },
  { type: "VIRTUAL_LINE_MANAGER", roleCode: "assessment.dotted_manager", label: "\u865A\u7EBF\u4E0A\u7EA7" },
  { type: "INDICATOR_EVALUATOR", roleCode: "assessment.metric_evaluator", label: "\u6307\u6807\u8BC4\u4EF7\u4EBA" }
];
const RESULT_COMMUNICATION_EXECUTOR_OPTIONS = PERFORMANCE_EXECUTOR_OPTIONS.filter(
  (option) => option.type === "REAL_LINE_MANAGER" || option.type === "VIRTUAL_LINE_MANAGER"
);
const REAL_LINE_MANAGER_LEVEL_OPTIONS = [
  { type: "DIRECT_MANAGER", label: "\u76F4\u5C5E\u4E0A\u7EA7" },
  { type: "LEVEL_1_MANAGER", label: "\u9694 1 \u7EA7\u4E0A\u7EA7" },
  { type: "LEVEL_2_MANAGER", label: "\u9694 2 \u7EA7\u4E0A\u7EA7" },
  { type: "LEVEL_3_MANAGER_PLUS", label: "\u9694 3 \u7EA7\u4E0A\u7EA7\u53CA\u4EE5\u4E0A" }
];
const REVIEWER_360_CONFIRM_MANAGER_LEVEL_OPTIONS = REAL_LINE_MANAGER_LEVEL_OPTIONS.slice(0, 3);
export {
  CALIBRATION_EXECUTOR_OPTION,
  PERFORMANCE_EXECUTOR_OPTIONS,
  REAL_LINE_MANAGER_LEVEL_OPTIONS,
  RESULT_COMMUNICATION_EXECUTOR_OPTIONS,
  REVIEWER_360_CONFIRM_MANAGER_LEVEL_OPTIONS,
  SUBJECT_EXECUTOR_OPTION
};
