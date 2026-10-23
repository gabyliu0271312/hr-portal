import { api } from "./client";
const standardFieldsApi = {
  list(params = {}) {
    return api.get("/warehouse/standard-fields", { params }).then((r) => r.data);
  },
  get(id) {
    return api.get(`/warehouse/standard-fields/${id}`).then((r) => r.data);
  },
  bindingCandidates(fieldId, params = {}) {
    if (!params.dataset_id && !params.table_name?.trim()) return Promise.resolve([]);
    return api.get(`/warehouse/standard-fields/${fieldId}/binding-candidates`, { params }).then((r) => r.data);
  },
  createBinding(fieldId, payload) {
    return api.post(`/warehouse/standard-fields/${fieldId}/bindings`, payload).then((r) => r.data);
  },
  confirmBinding(fieldId, bindingId, payload) {
    return api.post(`/warehouse/standard-fields/${fieldId}/bindings/${bindingId}/confirm`, payload).then((r) => r.data);
  },
  invalidateBinding(fieldId, bindingId, payload) {
    return api.post(`/warehouse/standard-fields/${fieldId}/bindings/${bindingId}/invalidate`, payload).then((r) => r.data);
  },
  create(payload) {
    return api.post("/warehouse/standard-fields", payload).then((r) => r.data);
  },
  createVersion(fieldId, payload) {
    return api.post(`/warehouse/standard-fields/${fieldId}/versions`, payload).then((r) => r.data);
  },
  updateVersion(fieldId, versionId, payload) {
    return api.put(`/warehouse/standard-fields/${fieldId}/versions/${versionId}`, payload).then((r) => r.data);
  },
  approve(fieldId, versionId, expected_revision, reason) {
    return api.post(`/warehouse/standard-fields/${fieldId}/versions/${versionId}/approve`, { expected_revision, reason }).then((r) => r.data);
  },
  deprecate(fieldId, versionId, expected_revision, reason) {
    return api.post(`/warehouse/standard-fields/${fieldId}/versions/${versionId}/deprecate`, { expected_revision, reason }).then((r) => r.data);
  },
  archive(fieldId, versionId, expected_revision, reason) {
    return api.post(`/warehouse/standard-fields/${fieldId}/versions/${versionId}/archive`, { expected_revision, reason }).then((r) => r.data);
  },
  remove(fieldId, expected_version, expected_revision) {
    return api.delete(`/warehouse/standard-fields/${fieldId}`, { params: { expected_version, expected_revision } });
  }
};
export {
  standardFieldsApi
};
