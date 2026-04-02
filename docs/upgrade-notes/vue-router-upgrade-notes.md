# Vue Router 升级注意事项

## 当前结论

- 当前项目暂不跟进 `vue-router` 5.x。
- 当前项目依赖版本以 `vue-router` 4.x 最新版本为准。
- 截至 2026-03-16，官方 4.x 最新版本为 `4.6.3`，本项目先保持在该版本。

## 暂不升级到 5.x 的原因

- 业务路由链路较重，包含登录守卫、SSO 放行、后端菜单转前端路由、动态 `addRoute()`、`router-view` 插槽配合 `keep-alive`、`/redirect/*` 刷新跳转等多条关键链路。
- 升级到 `5.0.3` 后，主流程功能本身可以跑通，但全局守卫会出现官方弃用警告，需要额外改造守卫写法。
- 该改造本身不复杂，但属于跨项目可复用的统一升级项，更适合后续随其他项目一起落地，而不是在本项目单独提前切换。

## 5.x 升级时必须处理的点

### 1. 全局守卫不要再使用 `next()` 回调风格

`vue-router` 5.x 下，导航守卫中第三个参数 `next` 已进入弃用路径。

当前项目受影响位置：

- `src/permission.ts`
- `src/permission-ext.ts`

当前 4.x 写法示例：

```ts
router.beforeEach((to, from, next) => {
  if (!permissionCheck(to, from, next)) {
    return
  }

  if (!getToken()) {
    next(`/login?redirect=${to.fullPath}`)
    return
  }

  next()
})
```

5.x 统一改造方向：

- 改为 `router.beforeEach(async (to) => {})`
- 使用 `return true`
- 使用 `return false`
- 使用 `return '/login?redirect=...'`
- 使用 `return { path: '/', replace: true }`

### 2. 动态路由注入完成后，需要用 return 风格重新进入目标路由

当前项目在获取用户信息和菜单后，会执行：

```ts
router.addRoute(route)
next({ ...to, replace: true })
```

后续升级到 5.x 时，统一改为：

```ts
router.addRoute(route)
return { ...to, replace: true }
```

### 3. SSO 白名单逻辑也要一起改造

当前 `src/permission-ext.ts` 中 `checkSSO()` 依赖 `next()` 直接放行 `/sso-login`。

升级到 5.x 时，需要同步改成 return 风格，否则控制台仍会出现弃用警告。

## 已验证过的 5.x 风险点

在本项目本地联调中，以下链路在 5.x 下都需要重点回归：

- 未登录访问受保护页面时，是否仍跳转到 `/login?redirect=...`
- 登录后 `GetInfo` + `GenerateRoutes` + `addRoute()` 是否正常
- 动态菜单页面是否正常渲染
- `/redirect/*` 刷新链路是否正常
- `router.currentRoute.value` 相关 tab 操作是否正常
- `<router-view v-slot>` 配合 `keep-alive` 是否正常
- 404 页面是否正常

## 本项目升级 5.x 时的特殊提醒

### 1. 不要顺手修历史路由问题

`src/router/index.js` 中存在重复路径：

- `/product/review-detail/:id`

这属于历史行为，统一升级 `vue-router` 时不要顺手改掉，以免把“版本升级”与“业务路由调整”混在一起。

### 2. 本地登录环境受 SSO 配置影响

当前项目 `src/system.ts` 中 `SSO` 为 `true`，登录页会先请求 `/prod-api/getLoginUrl`。

因此升级验证时要区分：

- 是 `vue-router` 版本兼容问题
- 还是本地代理 / SSO / 后端接口环境问题

## 建议的统一升级顺序

1. 先把所有项目统一到 `vue-router` 4.x 最新版本。
2. 抽出一套通用守卫改造方案，把 `next()` 风格统一改成 return 风格。
3. 统一回归登录、动态路由、redirect、keep-alive、404。
4. 最后再统一切到 `vue-router` 5.x。

## 参考来源

- Vue Router Releases: `https://github.com/vuejs/router/releases`
- Vue Router Migration Guide: `https://router.vuejs.org/guide/migration/`
