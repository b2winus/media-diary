import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import { fileURLToPath } from "node:url";
import path from "node:path";

// 저장소 맨 위 (tsconfig.json이 있는 곳)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig([
	{ ignores: ["main.js", "node_modules/", "dist/", "tools/", "esbuild.config.mjs"] },
	...obsidianmd.configs.recommended,
	{
		files: ["src/**/*.ts"],
		languageOptions: {
			parserOptions: { projectService: true, tsconfigRootDir: root },
		},
	},
]);
