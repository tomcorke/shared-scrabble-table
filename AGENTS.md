# Agent notes

- Keep signalling manual and serverless. Peers exchange WebRTC session JSON through copy and paste.
- Keep `src/signalling.ts` free of browser runtime dependencies so Node can test it directly.
- Google's public STUN server is demo-only. Do not add TURN, persistence, routing, or a signalling service without a concrete requirement.
- `.npmrc` intentionally pins `registry.npmjs.org`; do not replace it with an organisation mirror.

## Publishing

`publish` is the GitHub Pages artifact branch. It contains the built site at its root. `public/CNAME` sets `spell.corke.dev`; `public/.nojekyll` disables Jekyll processing.

For each release:

1. Update `main` with `git switch main` and `git pull --ff-only origin main`.
2. Fetch `origin/publish`. Publish only from a clean `main` worktree; stop if `git status --porcelain` is not empty.
3. Record `main_commit=$(git rev-parse HEAD)` and `main_short=$(git rev-parse --short HEAD)`.
4. Run `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm lint`, `pnpm typecheck`, and `pnpm build`.
5. Confirm `main` still points to `main_commit` and the worktree is still clean.
6. Use a temporary worktree for `publish`. For the first release, create an orphan branch. For later releases, start from `origin/publish`. Replace its contents with `dist/`; keep `CNAME` and `.nojekyll` at the branch root.
7. Commit with subject `Publish main@<short-sha>` and body `Source-main-commit: <full-sha>`. Push to `origin/publish`.
8. Remove the temporary worktree after the push succeeds. Verify `https://spell.corke.dev/` serves the new build.

Run release steps in one shell so recorded commit values stay fixed. Use `git clean -fdx` only in the dedicated temporary publish worktree. If push fails, keep that worktree while investigating. Never publish staged, unstaged, or untracked source changes.
