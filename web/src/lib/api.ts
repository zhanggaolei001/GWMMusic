import axios from "axios";

export const api = axios.create({
  baseURL: "/api",
});

export const setApiCookie = (cookie: string | null) => {
  if (cookie && cookie.trim() !== "") {
    api.defaults.headers.common["x-netease-cookie"] = cookie;
  } else {
    delete api.defaults.headers.common["x-netease-cookie"];
  }
};
