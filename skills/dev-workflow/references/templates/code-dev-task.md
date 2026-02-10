# 代码开发任务模板

```markdown
## TaskGroup: [功能名称]

### Meta
- parallel_limit: 5
- review_level: strict
- on_failure: continue

### Tasks
1. [code:dev] 实现 [模块名] 核心逻辑 @isolated([module]/)
2. [code:dev] 实现 [模块名] UI 组件 @isolated([module]/)
3. [code:dev] 实现 [模块名] API 接口层 @isolated([module]/api/)
4. [test] 编写 [模块名] 单元测试 @isolated([module]/)
```

## 使用说明

- **并行策略**: `isolated` — 同模块内串行执行，跨模块并行
- **Review 级别**: `strict` — 新功能需严格审查
- **隔离键**: 使用模块路径作为隔离键，如 `@isolated(auth/)`

## 注意事项

- 同一模块的 UI 和逻辑建议串行（共享隔离键）
- 不同模块可并行开发
- 确保接口契约在实现前确定
- 新功能必须附带测试任务
