import axios from "axios";

export const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) ?? "http://localhost:4000";
export const USE_API = (import.meta.env.VITE_USE_API as string) === "true";

export const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

export default api;
