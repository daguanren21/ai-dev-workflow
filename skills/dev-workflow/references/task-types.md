# Task Types & Scheduling

## Task Types

| Type | ID | Strategy | Review Level | Description |
|------|-----|---------|------------|------|
| Code Development | `code:dev` | `isolated` | strict | Serial within module, parallel across modules |
| Code Fix | `code:fix` | `isolated` | standard | Serial within file |
| Code Refactor | `code:refactor` | `serial` | strict | Global serial, large impact |
| Doc Writing | `doc:write` | `parallel` | light | Fully parallel |
| Doc Translation | `doc:translate` | `parallel` | light | Fully parallel |
| Research | `research` | `parallel` | light | Fully parallel, supports caching |
| Data Processing | `data` | `isolated` | standard | Isolated by data source |
| Testing | `test` | `parallel` | standard | Fully parallel |

## Scheduling Strategies

- **parallel** — Fully parallel, no restrictions (bounded by parallel_limit)
- **isolated** — Group by isolation key; serial within group, parallel between groups
- **serial** — Global lock, one task at a time

## Max Parallelism: 5

## Task Declaration Syntax

```markdown
## TaskGroup: <group name>

### Meta
- parallel_limit: 5
- review_level: standard
- on_failure: continue | stop

### Tasks
1. [code:dev] Implement auth module @isolated(auth/)
2. [code:dev] Implement order module @isolated(order/)
3. [doc:write] Write API docs
4. [research] Research payment gateway @cache(7d)
```

| Element | Format | Description |
|---------|--------|-------------|
| Task type | `[type:subtype]` | Type identifier in brackets |
| Isolation key | `@isolated(key)` | Grouping key for isolation |
| Cache | `@cache(duration)` | Cache TTL for research tasks |
| Dependency | `@depends(task_id)` | Prerequisite task dependency |

## Fullstack Parallel Strategy

```
     ┌─────────────┐
     │ API Contract │
     └──────┬──────┘
            ↓
  ┌─────────┴─────────┐
  ↓                   ↓
┌─────────┐     ┌─────────┐
│ Frontend │     │ Backend │
│ (Mock)  │     │ (API)   │
└────┬────┘     └────┬────┘
     └────────┬──────┘
              ↓
       ┌─────────────┐
       │ Integration  │
       └─────────────┘
```

## Templates

### Code Development
```markdown
## TaskGroup: [Feature Name]
### Meta
- parallel_limit: 5
- review_level: strict
- on_failure: continue
### Tasks
1. [code:dev] Implement [module] core logic @isolated([module]/)
2. [code:dev] Implement [module] UI components @isolated([module]/)
3. [code:dev] Implement [module] API layer @isolated([module]/api/)
4. [test] Write [module] unit tests @isolated([module]/)
```

### Code Fix
```markdown
## TaskGroup: [Bug Description]
### Meta
- parallel_limit: 3
- review_level: standard
- on_failure: stop
### Tasks
1. [research] Root cause analysis @cache(1d)
2. [code:fix] Fix [bug] @isolated([file_path])
3. [test] Add regression tests @isolated([file_path])
```

### Code Refactor
```markdown
## TaskGroup: [Refactor Goal]
### Meta
- parallel_limit: 1
- review_level: strict
- on_failure: stop
### Tasks
1. [research] Analyze dependencies
2. [code:refactor] Refactor core structure
3. [code:fix] Fix type errors from refactoring
4. [test] Run full test suite
```

### Research
```markdown
## TaskGroup: [Research Topic]
### Meta
- parallel_limit: 5
- review_level: light
- on_failure: continue
### Tasks
1. [research] Research [option A] @cache(7d)
2. [research] Research [option B] @cache(7d)
3. [research] Compare A and B @depends(1,2)
4. [doc:write] Write conclusion document
```
