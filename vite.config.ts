import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, "src/selector"),
  publicDir: path.resolve(__dirname, "public"),
  server: {
    port: 3001,
  },
  build: {
    outDir: path.resolve(__dirname, "dist/selector"),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
