# Vue Router 5.0.3 Upgrade Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade the application from `vue-router@4.5.1` to `vue-router@5.0.3` without changing user-visible routing behavior.

**Architecture:** Keep the existing hand-written route table, dynamic route injection, and keep-alive layout flow intact. Apply the dependency upgrade first, then verify the login guard, backend-menu-to-route transform, redirect flow, and layout route rendering before making any opportunistic refactors.

**Tech Stack:** Vue 3.5, Vite 6, TypeScript bundler mode, Vue Router, Vuex, Element Plus, pnpm

## Preconditions

- The repo currently uses `vue-router@4.5.1` in `package.json`.
- Router entry is `src/router/index.js`.
- Login and dynamic route injection are handled in `src/permission.ts`.
- Backend route normalization is handled in `src/store/modules/permission.js`.
- Main layout route rendering uses `<router-view v-slot>` in `src/layout/components/AppMain.vue`.
- There are no existing first-party `*.spec.*` or `*.test.*` files for routing in `src/`.
- Do not expand scope into router refactors unless the upgrade breaks existing behavior.

## Known Risks To Preserve During Upgrade

- `src/router/index.js` contains two route records with the same child path `/product/review-detail/:id`. Treat this as pre-existing behavior and do not silently "fix" it during the dependency bump.
- `src/permission.ts` uses the callback-style `next()` guard API and injects dynamic routes via `router.addRoute(route)` before re-entering navigation with `next({ ...to, replace: true })`.
- `src/store/modules/permission.js` mutates backend route data in `filterAsyncRouter()` and `filterChildren()`.
- `src/layout/components/AppMain.vue` depends on the `router-view` slot API and wraps routed components for `keep-alive`.

### Task 1: Capture The Upgrade Baseline

**Files:**
- Modify: `docs/plans/2026-03-16-vue-router-5-upgrade.md`
- Inspect: `package.json`
- Inspect: `src/router/index.js`
- Inspect: `src/permission.ts`
- Inspect: `src/store/modules/permission.js`
- Inspect: `src/layout/components/AppMain.vue`

**Step 1: Verify the current dependency version**

Run:

```bash
pnpm.cmd why vue-router
```

Expected: output shows `vue-router 4.5.1` as a direct dependency of the app.

**Step 2: Run the current lint command as the pre-upgrade failing-or-passing gate**

Run:

```bash
pnpm.cmd lint
```

Expected: either PASS, or a known existing lint failure unrelated to router upgrade is recorded in the working notes.

**Step 3: Run the current production build as the pre-upgrade failing-or-passing gate**

Run:

```bash
pnpm.cmd build
```

Expected: either PASS, or a known existing build failure unrelated to router upgrade is recorded in the working notes.

**Step 4: Record the manual smoke baseline**

Manually verify these flows in the running app:

- Open `/login`
- Log in with a valid account
- Confirm sidebar routes appear after login
- Open a page that depends on dynamic routes
- Refresh an opened page from tags view
- Navigate through a redirect route such as `/redirect/<path>`
- Open a detail route using params
- Navigate to an unknown URL and confirm 404

Expected: each flow is marked PASS or FAIL before any dependency changes.

**Step 5: Commit the baseline notes**

```bash
git add docs/plans/2026-03-16-vue-router-5-upgrade.md
git commit -m "docs: add vue-router 5 upgrade plan"
```

### Task 2: Upgrade The Dependency And Lockfile

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Step 1: Write the dependency change**

Change `package.json` from:

```json
"vue-router": "^4.5.1"
```

to:

```json
"vue-router": "5.0.3"
```

**Step 2: Update the lockfile**

Run:

```bash
pnpm.cmd install
```

Expected: `pnpm-lock.yaml` is updated and the installed version resolves to `5.0.3`.

**Step 3: Verify the installed version**

Run:

```bash
pnpm.cmd why vue-router
```

Expected: output shows `vue-router 5.0.3`.

**Step 4: Review the dependency diff**

Run:

```bash
git diff -- package.json pnpm-lock.yaml
```

Expected: only the intended router version and lockfile entries changed.

**Step 5: Commit the dependency bump**

```bash
git add package.json pnpm-lock.yaml
git commit -m "build: upgrade vue-router to 5.0.3"
```

### Task 3: Verify Compile-Time Compatibility

**Files:**
- Inspect: `tsconfig.json`
- Inspect: `src/main.ts`
- Inspect: `vite/plugins/auto-import.ts`

**Step 1: Run lint after the version bump**

Run:

```bash
pnpm.cmd lint
```

Expected: PASS, or only pre-existing lint failures remain.

**Step 2: Run the production build after the version bump**

Run:

```bash
pnpm.cmd build
```

Expected: PASS.

**Step 3: If type or import errors mention router exports, verify these imports remain valid**

Current imports that must keep working:

```ts
import { createWebHistory, createRouter } from 'vue-router'
import { useRouter, useRoute } from 'vue-router'
```

Expected: no code changes are needed if build and lint pass.

**Step 4: If install or build rewrites generated import types, review the auto-import output**

Run:

```bash
git diff -- types
```

Expected: no unexpected router-related generated changes are introduced.

**Step 5: Commit only if compatibility fixes were required**

```bash
git add tsconfig.json src/main.ts vite/plugins/auto-import.ts types
git commit -m "build: fix router 5 compatibility"
```

### Task 4: Validate Global Guard And Dynamic Route Injection

**Files:**
- Inspect: `src/permission.ts`
- Inspect: `src/permission-ext.ts`
- Inspect: `src/store/modules/permission.js`

**Step 1: Verify the guard entry still runs on initial navigation**

Relevant code that must keep working:

```ts
router.beforeEach((to, from, next) => {
  if (!permissionCheck(to, from, next)) {
    return
  }
  // ...
})
```

Manual check:

- Open the app in a fresh browser session
- Visit a protected route without a token
- Confirm redirect to `/login?redirect=...`

Expected: protected routes still redirect to login.

**Step 2: Verify dynamic routes are still injected after login**

Relevant code that must keep working:

```ts
accessRoutes.forEach((route) => {
  if (!isHttp(route.path)) {
    router.addRoute(route)
  }
})
next({ ...to, replace: true })
```

Manual check:

- Log in
- Confirm post-login navigation lands on the intended page
- Confirm dynamically injected menus and pages render

Expected: no blank screen, no infinite redirect, no unmatched route error.

**Step 3: Verify backend route normalization still produces valid route records**

Relevant code that must keep working:

```js
function filterAsyncRouter(asyncRouterMap, lastRouter = false, type = false) {
  return asyncRouterMap.filter((route) => {
    if (type && route.children) {
      route.children = filterChildren(route.children)
    }
    // ...
    return true
  })
}
```

Manual check:

- Open at least one page under a backend-provided nested menu
- Open at least one page under a flattened `ParentView` menu branch

Expected: nested and flattened backend routes still match and render.

**Step 4: If navigation breaks, apply the smallest compatible guard fix**

Only change the guard if the upgrade proves it necessary. Preferred minimal fix:

```ts
router.beforeEach(async (to, from) => {
  if (getToken() && store.getters.roles.length === 0) {
    await store.dispatch('GetInfo')
    const accessRoutes = await store.dispatch('GenerateRoutes')
    accessRoutes.forEach((route) => {
      if (!isHttp(route.path)) {
        router.addRoute(route)
      }
    })
    return { ...to, replace: true }
  }
})
```

Do not apply this refactor unless the callback-style guard fails under `5.0.3`.

**Step 5: Commit only if a guard compatibility fix was required**

```bash
git add src/permission.ts src/permission-ext.ts src/store/modules/permission.js
git commit -m "fix: keep dynamic routing compatible with vue-router 5"
```

### Task 5: Validate Layout Routing, Redirects, And Keep-Alive Behavior

**Files:**
- Inspect: `src/layout/components/AppMain.vue`
- Inspect: `src/views/redirect/index.vue`
- Inspect: `src/plugins/tab.js`
- Inspect: `src/layout/components/TagsView/index.vue`

**Step 1: Verify `router-view` slot rendering still works**

Relevant code that must keep working:

```vue
<router-view v-slot="{ Component, route: r }">
  <transition name="fade-transform" mode="out-in">
    <keep-alive :include="cachedViews">
      <component :is="wrap(route.fullPath, Component)" :key="r.fullPath" />
    </keep-alive>
  </transition>
</router-view>
```

Manual check:

- Navigate between two cached pages
- Confirm page content renders
- Confirm cached page state persists where expected

Expected: route transitions and keep-alive behavior remain unchanged.

**Step 2: Verify redirect refresh flow**

Relevant code that must keep working:

```js
router.replace({
  path: '/redirect' + path,
  query,
})
```

and:

```vue
router.replace({ path: '/' + path, query })
```

Manual check:

- Open a page in tags view
- Click the refresh action

Expected: page reloads through the redirect view without ending on 404.

**Step 3: Verify direct use of `router.currentRoute.value`**

Manual check:

- Trigger any flow that calls `$tab.refreshPage()`
- Trigger any flow that closes the current tab
- Open pages used by `brand-detail-style.vue` and `brand-detail-video.vue`

Expected: `currentRoute.value` remains reactive and no runtime error is thrown.

**Step 4: Verify basic router-link and back navigation behavior**

Manual check:

- Click a `router-link`
- Use a page button that calls `$router.go(-1)` or `router.go(-1)`

Expected: navigation works and browser history remains intact.

**Step 5: Commit only if layout compatibility fixes were required**

```bash
git add src/layout/components/AppMain.vue src/views/redirect/index.vue src/plugins/tab.js src/layout/components/TagsView/index.vue
git commit -m "fix: keep layout routing compatible with vue-router 5"
```

### Task 6: Run Focused Regression Checks On Known Sensitive Routes

**Files:**
- Inspect: `src/router/index.js`
- Inspect: route target components reached during smoke testing

**Step 1: Verify catch-all and login routes**

Manual check:

- Visit a non-existent URL
- Visit `/login`
- Visit `/register`

Expected: 404, login, and register pages still render correctly.

**Step 2: Verify redirect route and param route matching**

Manual check:

- Visit `/redirect/<existing-full-path>`
- Visit a known param page such as `/system/user-auth/role/<id>`

Expected: route params still resolve and the destination page renders.

**Step 3: Verify the duplicated review-detail route behavior is unchanged**

Relevant duplicated records live in:

- `src/router/index.js`

Manual check:

- Navigate to `/product/review-detail/<id>` through the same entry points used in production
- Record which component actually renders after the upgrade

Expected: behavior is unchanged from the pre-upgrade baseline. Do not silently change it as part of this task.

**Step 4: Re-run the production build one final time**

Run:

```bash
pnpm.cmd build
```

Expected: PASS.

**Step 5: Commit the verified upgrade**

```bash
git add .
git commit -m "chore: verify vue-router 5 upgrade"
```

### Task 7: Write The Upgrade Notes

**Files:**
- Create: `docs/upgrade-notes/vue-router-5.0.3.md`

**Step 1: Document the final version bump**

Write:

```md
# Vue Router 5.0.3 Upgrade Notes

- Upgraded from `vue-router@4.5.1` to `vue-router@5.0.3`
- No router API code changes were required
- Dynamic routes, redirect routes, keep-alive routes, and 404 routes were manually verified
```

**Step 2: Document any compatibility code changes**

Add only the changes that actually happened:

```md
- Updated the global guard to preserve dynamic route injection behavior
- No changes were required to `router-view` slot usage
```

**Step 3: Document residual risk**

Write:

```md
- `src/router/index.js` still contains duplicated `/product/review-detail/:id` records
- This duplicated route behavior was preserved intentionally during the dependency upgrade
```

**Step 4: Verify the notes file**

Run:

```bash
git diff -- docs/upgrade-notes/vue-router-5.0.3.md
```

Expected: the notes only describe the router upgrade and residual risk.

**Step 5: Commit the notes**

```bash
git add docs/upgrade-notes/vue-router-5.0.3.md
git commit -m "docs: add vue-router 5 upgrade notes"
```

## Final Verification Checklist

- `pnpm.cmd why vue-router` shows `5.0.3`
- `pnpm.cmd lint` passes, or only pre-existing unrelated failures remain
- `pnpm.cmd build` passes
- Login redirect still works
- Dynamic route injection still works
- Tags view refresh still works
- Redirect route still works
- Param routes still work
- 404 catch-all still works
- Duplicated `/product/review-detail/:id` behavior is unchanged

