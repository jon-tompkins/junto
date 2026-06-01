# Builder Guidelines -- Junto JFL Kanban

## Agents

Agent: Carl -- Label: Carl -- Limits: 10 min / 8000 tokens -- Role: Complex code tasks
Agent: Billy -- Label: Billy -- Limits: 5 min / 2000 tokens -- Role: Quick label/config work

## Task Lifecycle

jfl/backlog to jfl/ready to jfl/in-progress to jfl/review to jfl/done

- jfl/backlog: Task created not yet assigned
- jfl/ready: Reviewed ready for agent pickup
- jfl/in-progress: Agent actively working
- jfl/review: PR open awaiting review
- jfl/done: Merged and complete

## Git Workflow

1. git pull origin main
2. git checkout -b carl/issue-NUMBER
3. Make changes commit with author Jonto
4. git push origin carl/issue-NUMBER
5. gh pr create linking the issue
6. Comment on issue summarising changes
7. Remove Carl label add jfl/review
8. Close issue after PR merged

## Escalation

If unclear: remove Carl add Benji leave clarification comment

## Working Directory

All Junto code: /Users/jonathantompkins/Development/ClaudeCode/junto