import axios from "axios";

const runtimeApiBase = import.meta.env.DEV ? "" : (import.meta.env.VITE_API_BASE || "");
export const api = axios.create({
  baseURL: `${runtimeApiBase}/api`,
});
