import { defineConfig } from "vite-plus";

/** Generated files and tool-managed folders: never linted, never formatted. */
const managed = ["dist/**", ".astro/**"];

/**
 * Vite+ config: lint and format settings for `vp check`; Astro itself keeps `astro.config.mjs`.
 * Oxfmt does not format `.astro` files: `astro check` covers them.
 * @see https://viteplus.dev/config.md (vite-plus 1.6.0)
 */
export default defineConfig({
  lint: {
    ignorePatterns: managed,
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  fmt: {
    sortPackageJson: false,
    // data/ is written by scripts/sync.ts (the only writer); src/showcases/ are hand-written demos shown
    // verbatim as code on the site: formatting them would change what visitors read.
    ignorePatterns: ["**/*.md", "data/**", "src/showcases/**", "wrangler.jsonc", ...managed],
  },
  staged: { "*.{ts,tsx,js,jsx,cjs,mjs,json}": "vp check --fix" },
});
