# GitHub sync workflow

The intended remote is a private `yellow-spicychat-mvp` GitHub repository. It has not been created yet. Keep the synced `sources/` directory and unrelated project-mirror files out of Git.

For every demo update:

1. Pull the latest `main` before editing. If local work is already in progress, inspect the working tree first and preserve it; integrate remote changes with rebase only when safe.
2. Make the requested demo changes and run the relevant checks (`npm run typecheck`, `npm test`, and `npm run build` for code changes).
3. Review the staged diff and confirm that no credentials, `.env` files, user data, generated build output, or `sources/` material is included.
4. Commit the verified change, then push it to `origin/main` and confirm the remote commit matches local `HEAD`.

Once the remote exists, the normal update sequence is:

```sh
git pull --rebase origin main
# edit and verify the demo
git add <reviewed-files>
git diff --cached
git commit -m "Describe the demo update"
git push origin main
```

Do not use force-push for routine demo updates. Resolve conflicts by preserving both the latest remote work and the local change.
