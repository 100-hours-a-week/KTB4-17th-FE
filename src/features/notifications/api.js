import { apiRequest } from "../../shared/api/client.js";

export const notifications = (category = "ALL") =>
  apiRequest(`/api/v1/notifications?category=${category}&size=20`);
