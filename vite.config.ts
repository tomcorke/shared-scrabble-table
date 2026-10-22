import { execSync } from "node:child_process";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const [sha, committedAt] = execSync("git log -1 --format=%H%n%ct")
  .toString()
  .trim()
  .split("\n");
const buildInfo = `${sha.slice(0, 8)} · ${new Date(Number(committedAt) * 1000)
  .toISOString()
  .slice(0, 16)
  .replace("T", " ")} UTC`;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: { __BUILD_INFO__: JSON.stringify(buildInfo) },
});
