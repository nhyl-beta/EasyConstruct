import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // Fixed port, never "whatever is free". Vite otherwise hops to 5174 when
    // 5173 is taken, and every emailed link (APP_URL on the server) then
    // points at a port nothing is listening on — "localhost refused to
    // connect". Better to fail loudly at startup.
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
});
