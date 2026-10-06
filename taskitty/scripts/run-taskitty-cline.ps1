# Run from the Taskitty Rust repository regardless of where the suite is checked out.
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path
Set-Location -LiteralPath $projectRoot

cline `
  -P openai-compatible `
  -m "qwen3.8-flash-next-coder-iq1_m" `
  --auto-approve true `
  --thinking high `
  "Fetch the next eligible DOING TASK or a Task in the DOING list and work on it then commit. You aren't allowed to ask questions and wait for instructions, insead try to proceed on your own. If it needs a human decision, add a comment and a tag.If no doing task is available, fetch tasks in high priority or from other boards. If no tasks are there anymore, think about a new task and document it, then stop without making changes."