---
description: Package releases and worktree handoffs for mst-query
applyTo: 'packages/mst-query/**'
---

Git branch switches do not refresh ignored `dist/` or `node_modules/` directories. After moving release work to another worktree, run `npm ci` in that worktree's `packages/mst-query` directory, then pack and verify the package there. Keep the `prepack` build hook so `npm pack` and `npm publish` rebuild from the current source; do not bypass lifecycle scripts for local release packaging. Verify the packed runtime and declaration exports, including `HydrationBoundary` and `useSuspenseQuery`: passing source tests or inspecting another worktree's build does not validate the package being published.
