# C:\Files\github\taskitty-rust\run-taskitty-cline.ps1

Set-Location "C:\Files\github\taskitty-rust"

cline `
  -P lmstudio `
  -m "unsloth/qwen3.8-27b" `
  --auto-approve true `
  "Fetch the next eligible DOING TASK or a Task in the DOING list and work on it then commit. You aren't allowed to ask questions and wait for instructions, insead try to proceed on your own. If it needs a human decision, add a comment and a tag.If no doing task is available, fetch tasks in high priority or from other boards. If no tasks are there anymore, think about a new task and document it, then stop without making changes."