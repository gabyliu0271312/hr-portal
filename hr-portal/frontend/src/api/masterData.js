import { api } from "./client";
const masterDataApi = {
  list(params = {}) {
    return api.get("/master-data/entities", { params }).then((r) => r.data);
  },
  get(id) {
    return api.get(`/master-data/entities/${id}`).then((r) => r.data);
  },
  create(payload) {
    return api.post("/master-data/entities", payload).then((r) => r.data);
  },
  update(id, payload) {
    return api.put(`/master-data/entities/${id}`, payload).then((r) => r.data);
  }
};
export {
  masterDataApi
};
