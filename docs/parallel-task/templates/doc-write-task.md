# 文档编写任务模板

```markdown
## TaskGroup: [文档主题]

### Meta
- parallel_limit: 5
- review_level: light
- on_failure: continue

### Tasks
1. [doc:write] 编写 [模块] API 文档
2. [doc:write] 编写 [模块] 使用指南
3. [doc:write] 更新 README
4. [doc:write] 编写 CHANGELOG
```

## 使用说明

- **并行策略**: `parallel` — 完全并行，文档间无冲突
- **Review 级别**: `light` — 快速检查即可
- **on_failure**: `continue` — 单篇文档失败不影响其他

## 注意事项

- 文档任务可完全并行，无需隔离
- 注意保持文档间的交叉引用一致性
- 使用项目已有的文档格式和风格
- 技术文档应包含代码示例
