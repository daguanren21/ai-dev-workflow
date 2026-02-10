# 调研分析任务模板

```markdown
## TaskGroup: [调研主题]

### Meta
- parallel_limit: 5
- review_level: light
- on_failure: continue

### Tasks
1. [research] 调研 [方案A] 的优劣势 @cache(7d)
2. [research] 调研 [方案B] 的优劣势 @cache(7d)
3. [research] 对比 [方案A] 和 [方案B] @depends(1,2)
4. [doc:write] 输出调研结论文档
```

## 使用说明

- **并行策略**: `parallel` — 不同方向可同时调研
- **Review 级别**: `light`
- **缓存**: 调研结果可缓存，避免重复工作

## 注意事项

- 使用 `@cache(duration)` 缓存调研结果
- 多个方案可并行调研
- 对比分析需等待各方案调研完成（使用 `@depends`）
- 调研结论应输出为结构化文档
- 注明信息来源和时效性
