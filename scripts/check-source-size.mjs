import { readdir, readFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";

const root = resolve(".");
const maxLines = 500;
const sourceExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".jsx",
  ".mjs",
  ".ts",
  ".tsx",
]);
const ignoredDirectories = new Set([
  ".git",
  "coverage",
  "dist",
  "node_modules",
]);
const oversizedFiles = [];

async function checkDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) await checkDirectory(filePath);
    } else if (sourceExtensions.has(extname(entry.name))) {
      const content = await readFile(filePath, "utf8");
      const lineCount =
        content.split(/\r?\n/).length - Number(content.endsWith("\n"));
      if (lineCount > maxLines) {
        oversizedFiles.push(
          `${relative(root, filePath)}: ${lineCount} lines (max ${maxLines})`,
        );
      }
    }
  }
}

await checkDirectory(root);
if (oversizedFiles.length) {
  console.error(oversizedFiles.join("\n"));
  process.exitCode = 1;
}
