# Submitting Media Diary to the Obsidian community directory

Since May 2026, plugins are submitted through the developer dashboard at https://community.obsidian.md (not a pull request to obsidian-releases).

1. Push this repository to GitHub. `README.md`, `LICENSE`, and `manifest.json` must be in the root of the default branch.
2. Create the release with GitHub Actions: open the **Actions** tab → **Release** → **Run workflow**. It builds the plugin, adds artifact attestations, and publishes a release named after `manifest.json`'s version with `main.js`, `manifest.json`, and `styles.css` attached.
3. Sign in at https://community.obsidian.md with your Obsidian account and link your GitHub account.
4. Choose "Add a plugin or theme" and select this repository.
5. Review is automated and results usually appear within minutes. Fix any reported issues, bump the version, and publish a new release.

For later updates: raise `version` in `manifest.json` and `package.json`, add it to `versions.json` and `CHANGELOG.md`, push, then run the Release workflow again.

## Checks before each release

Run these from the repository root:

```bash
npm ci            # must succeed: the review installs dependencies the same way
npm run build
cd tools/lint && npm install && npm run lint   # same ESLint rules as the review
```

`tools/lint` has its own `package.json` so the review's install of the plugin itself stays small. Its `.npmrc` allows the newer Obsidian types next to the lint plugin.
