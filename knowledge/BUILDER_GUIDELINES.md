# BUILDER_GUIDELINES

Guidelines for Carl (Claude) and Billy (MiniMax) in the Junto JFL workflow.

## Task Lifecycle

Backlog → Ready → In-progress → Review → Done

| Label | Meaning |
|---|---|
| jfl/backlog | Not yet started |
| jfl/ready | Ready to start |
| jfl/in-progress | Being worked on |
| jfl/review | PR open, awaiting merge |
| jfl/done | Completed and merged |

## Agent Assignment Labels

- **Carl** (Claude): Picks up issues labeled Carl. ≤10min, ≤8000 tokens per task.
- **Billy**: Picks up issues labeled Billy. ≤5min, ≤2000 tokens per task.
- **Benji**: Human review required. Carl adds this when unclear.

## Git Workflow

1. Pull main: git pull origin main
2. Create branch: task-<issue-number>
3. Commit with author Jonto
4. Push and open PR linking issue
5. Add jfl/review label
6. After merge, add jfl/done

## Kanban API

The JFL API reads jfl/* labels to populate the Kanban board.
The Carl label signals the local Carl worker to pick up the issue.
