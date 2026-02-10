# 代码重构任务模板

```markdown
## TaskGroup: [重构目标]

### Meta
- parallel_limit: 1
- review_level: strict
- on_failure: stop

### Tasks
1. [research] 分析当前 [模块] 的问题和依赖关系
2. [code:refactor] 重构 [模块] 核心结构
3. [code:fix] 修复重构引入的类型错误
4. [test] 运行全量测试确认无回归
```

## 使用说明

- **并行策略**: `serial` — 强制串行，影响范围大
- **Review 级别**: `strict` — 重构需严格审查
- **on_failure**: `stop` — 重构出错应立即停止

## 注意事项

- 重构任务必须串行执行，避免冲突
- 先分析依赖关系，确定影响范围
- 重构后必须运行全量测试
- 大范围重构建议拆分为多个小步骤
- 每步重构后验证编译通过再继续
