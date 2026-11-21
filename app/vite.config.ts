import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Served from GitHub Pages at /tnpsc-app/
export default defineConfig({ base: "/tnpsc-app/", plugins: [react()] });
