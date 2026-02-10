# 测试任务模板

```markdown
## TaskGroup: [测试范围]

### Meta
- parallel_limit: 5
- review_level: standard
- on_failure: continue

### Tasks
1. [test] 编写 [模块A] 单元测试
2. [test] 编写 [模块B] 单元测试
3. [test] 编写 [功能] 集成测试
4. [test] 运行全量测试并生成覆盖率报告
```

## 使用说明

- **并行策略**: `parallel` — 不同模块的测试可并行编写
- **Review 级别**: `standard`
- **on_failure**: `continue` — 单模块测试失败不阻塞其他

## 注意事项

- 不同模块的测试可完全并行编写
- 集成测试可能依赖多个模块，注意声明依赖
- 全量测试运行应在所有测试编写完成后
- 关注测试覆盖率目标
- 使用项目已有的测试框架和模式
