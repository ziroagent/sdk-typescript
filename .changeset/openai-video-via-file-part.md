---
'@ziro-agent/openai': patch
'@ziro-agent/core': patch
---

Map `VideoPart` to OpenAI chat `file` parts (`file_id` / `file_data`), matching `FilePart` URL constraints. Optional `filename` on `VideoPart` for OpenAI metadata.
