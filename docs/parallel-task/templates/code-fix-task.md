# 代码修复任务模板

```markdown
## TaskGroup: [Bug 描述]

### Meta
- parallel_limit: 3
- review_level: standard
- on_failure: stop

### Tasks
1. [research] 定位 [Bug 描述] 根因 @cache(1d)
2. [code:fix] 修复 [Bug 描述] @isolated([file_path])
3. [test] 补充回归测试 @isolated([file_path])
```

## 使用说明

- **并行策略**: `isolated` — 同文件串行
- **Review 级别**: `standard`
- **on_failure**: `stop` — 修复失败应立即停止

## 注意事项

- 先调研再修复，避免盲目改代码
- 修复和测试使用相同隔离键（同文件）
- 修复后必须补充回归测试
- 如涉及多文件，每个文件用独立隔离键
