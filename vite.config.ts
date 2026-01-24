import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import path from "path";

export default defineConfig({
  plugins: [
    TanStackRouterVite({
      routesDirectory: path.resolve(__dirname, "src/app/routes"),
      generatedRouteTree: path.resolve(__dirname, "src/app/routeTree.gen.ts"),
    }),
    react(),
  ],
  root: path.resolve(__dirname, "src/app"),
  publicDir: path.resolve(__dirname, "public"),
  server: {
    port: 3000,
  },
  build: {
    outDir: path.resolve(__dirname, "dist"),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
