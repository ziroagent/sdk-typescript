# Yêu cầu hệ thống agentic cho ZiroAgent SDK

**Phiên bản tài liệu:** 1.0  
**Trạng thái:** Bản nháp làm việc (working draft) — định hướng sản phẩm và kiểm thử hồi quy kiến trúc  
**Tham chiếu khái niệm (không ràng buộc pháp lý):** *Building Applications with AI Agents* (Michael Albada, O’Reilly, 2025) — dùng làm **từ vựng chung** và **phạm vi năng lực** cho hệ “agentic system” (foundation model + tools + memory + orchestration + hạ tầng).

---

## 1. Mục đích và phạm vi

### 1.1 Mục đích

Tài liệu này chuyển mô hình **agentic system** trong tài liệu tham khảo (sách trên) thành **yêu cầu có thể kiểm chứng** đối với **ZiroAgent SDK**: những gì SDK **phải** hỗ trợ để một ứng dụng agentic đạt chất lượng production, và những gì **nên** / **có thể** có theo lộ trình.

### 1.2 Phạm vi

- **Trong phạm vi:** thư viện TypeScript monorepo `@ziro-agent/*`, CLI, ví dụ, và tài liệu hướng dẫn triển khai agent.
- **Ngoài phạm vi:** UI sản phẩm cuối (ngoài playground/docs), vận hành cluster của khách hàng, tuân thủ pháp lý cụ thể từng quốc gia (SDK chỉ **cung cấp primitive** audit/guard).

### 1.3 Từ khóa mức bắt buộc (RFC 2119)

- **PHẢI (MUST)** — không đáp ứng thì không coi là đủ “agentic production story” của Ziro.
- **NÊN (SHOULD)** — lệch khỏi đặc tả cần lý do ghi rõ (ADR / RFC).
- **CÓ THỂ (MAY)** — tùy chọn hoặc mở rộng.

### 1.4 Định nghĩa “agentic system” (theo SDK)

**Hệ agentic** = tổ hợp có thể triển khai được gồm ít nhất:

1. **Mô hình ngôn ngữ / foundation model** (gọi qua abstraction thống nhất).  
2. **Công cụ (tools)** — kênh tác động ra hệ thống bên ngoài qua schema an toàn kiểu.  
3. **Bộ nhớ / tri thức** — giữ ngữ cảnh và/hoặc truy xuất tri thức ngoài context window.  
4. **Điều phối (orchestration)** — vòng lặp quyết định → tool → quan sát kết quả, đồ thị workflow, hoặc đa agent.  
5. **Hạ tầng production** — bền vững (durable), ngân sách, quan sát (observability), đánh giá (eval), kiểm soát (governance), an toàn cơ bản.

---

## 2. Ma trận tham chiếu: chương sách → nhóm yêu cầu SDK

| Chương / chủ đề (sách) | Nhóm REQ (mục 3) | Gói / lớp Ziro liên quan |
|-------------------------|------------------|-------------------------|
| Ch.1 — Định nghĩa agent, sync/async, workflow vs agent | REQ-FM, REQ-ORCH, REQ-RUN | `core`, `agent`, `workflow`, `inngest` |
| Ch.2 — Thiết kế: model, tools, memory, trade-off | REQ-FM, REQ-TOOL, REQ-MEM, REQ-NFR | toàn bộ packages lõi |
| Ch.3 — UX agentic | REQ-UX | `apps/playground`, docs, (tích hợp app người dùng) |
| Ch.4 — Tool use, MCP | REQ-TOOL | `tools`, `mcp-server`, `openapi` |
| Ch.5 — Orchestration | REQ-ORCH | `agent`, `workflow`, `middleware` |
| Ch.6 — Knowledge & memory | REQ-MEM | `memory`, checkpoint stores |
| Ch.7 — Learning | REQ-LEARN | `eval`, (tương lai: fine-tune adapters — ngoài v0.x nếu không có RFC) |
| Ch.8 — Multi-agent | REQ-MA | `workflow`, `agent` |
| Ch.9 — Validation & measurement | REQ-EVAL | `eval` |
| Ch.10 — Monitoring | REQ-OBS | `tracing`, tích hợp OTel |
| Ch.11 — Improvement loops | REQ-LOOP | `eval`, checkpoint, docs pipeline |
| Ch.12 — Bảo vệ hệ agentic | REQ-SEC | `middleware`, `audit`, `compliance`, guardrails trong `agent` |
| Ch.13 — Human–agent | REQ-HITL | `agent` (approval), snapshot/resume |

---

## 3. Yêu cầu chức năng theo lớp

### REQ-FM — Foundation model & lời gọi LLM

| ID | Mức | Yêu cầu |
|----|-----|---------|
| REQ-FM-01 | PHẢI | Abstraction `LanguageModel` (hoặc tương đương) cho phép `generateText` / `streamText` với usage token và lỗi phân loại rõ. |
| REQ-FM-02 | PHẢI | Ít nhất một provider sản xuất (hosted) và một luồng **sovereign** (local / open-weight) được tài liệu hóa end-to-end. |
| REQ-FM-03 | NÊN | Điều khiển prompt cache / TTL theo provider (chi phí & độ trễ). |
| REQ-FM-04 | NÊN | Middleware model: wrap generate/stream, chuẩn bị bước (`prepareStep`), sửa tool call lỗi (`repairToolCall` pattern). |
| REQ-FM-05 | PHẢI | Ngân sách per-call / per-run: từ chối gọi model **trước** khi vượt ngưỡng (không chỉ hậu kiểm). |

**Hiện trạng gói:** `@ziro-agent/core`, `@ziro-agent/providers-*`, `@ziro-agent/middleware`.

---

### REQ-TOOL — Công cụ & MCP

| ID | Mức | Yêu cầu |
|----|-----|---------|
| REQ-TOOL-01 | PHẢI | Định nghĩa tool type-safe (schema input/output), thực thi đồng bộ/bất đồng bộ, lỗi có cấu trúc. |
| REQ-TOOL-02 | PHẢI | Gọi song song nhiều tool khi model yêu cầu (an toàn race / timeout theo cấu hình). |
| REQ-TOOL-03 | PHẢI | **MCP:** client tiêu thụ server MCP bên ngoài như nguồn tool; **MCP server** xuất tool Ziro ra ecosystem (stdio / HTTP theo RFC dự án). |
| REQ-TOOL-04 | NÊN | Công cụ từ OpenAPI / HTTP được tạo hoặc bọc có kiểm soát timeout & redaction. |
| REQ-TOOL-05 | PHẢI | Cờ `requiresApproval` (hoặc tương đương) cho tool nhạy cảm — tích hợp với vòng đời agent pause/resume. |

**Hiện trạng gói:** `@ziro-agent/tools`, `@ziro-agent/mcp-server`, `@ziro-agent/openapi`.

---

### REQ-MEM — Tri thức & bộ nhớ

| ID | Mức | Yêu cầu |
|----|-----|---------|
| REQ-MEM-01 | PHẢI | Interface vector store + embedder + chunker; ít nhất một adapter in-process và một adapter DB được hỗ trợ (vd. pgvector). |
| REQ-MEM-02 | NÊN | RAG pipeline có ví dụ: ingest → retrieve → inject context → giới hạn ngân sách. |
| REQ-MEM-03 | NÊN | Semantic / GraphRAG / knowledge graph: **không bắt buộc trong core**; nếu có thì qua package hoặc recipe rõ ràng, không phá abstraction lõi. |
| REQ-MEM-04 | PHẢI | Checkpoint thread/session: `get` / `put` / `list` / `delete` + `threadId`, tương thích resume sau crash (ít nhất memory + một store bền). |

**Hiện trạng gói:** `@ziro-agent/memory`, `@ziro-agent/checkpoint-*`.

---

### REQ-ORCH — Điều phối

| ID | Mức | Yêu cầu |
|----|-----|---------|
| REQ-ORCH-01 | PHẢI | Vòng agent: suy luận → tool calls → quan sát → lặp với điều kiện dừng (`stopWhen` / max bước). |
| REQ-ORCH-02 | PHẢI | Phát sự kiện theo bước (step events) để UI và trace gắn được. |
| REQ-ORCH-03 | NÊN | Workflow graph: song song, rẽ nhánh, state chia sẻ — tách khỏi “một prompt một lần”. |
| REQ-ORCH-04 | NÊN | Hỗ trợ mô hình tư duy ReAct / planner–executor qua composition (không nhất thiết class tên riêng từng pattern). |
| REQ-ORCH-05 | PHẢI | Hủy bỏ an toàn (`AbortSignal`) xuyên suốt LLM + tool. |

**Hiện trạng gói:** `@ziro-agent/agent`, `@ziro-agent/workflow`.

---

### REQ-RUN — Thực thi bền & thời gian chạy dài

| ID | Mức | Yêu cầu |
|----|-----|---------|
| REQ-RUN-01 | PHẢI | Adapter durable: ít nhất một engine được ship (vd. Inngest) với câu chuyện resume/replay tài liệu hóa. |
| REQ-RUN-02 | NÊN | Adapter bổ sung (Temporal / Restate) theo roadmap — không phá interface runtime. |
| REQ-RUN-03 | PHẢI | Snapshot run có phiên bản schema; migration khi bump version (tránh mất fidelity resume). |

**Hiện trạng gói:** `@ziro-agent/inngest`, checkpoint packages, `agent`.

---

### REQ-EVAL — Đo lường & kiểm thử

| ID | Mức | Yêu cầu |
|----|-----|---------|
| REQ-EVAL-01 | PHẢI | Định nghĩa eval-as-code: case input → kỳ vọng (tool, cost, từ chối, v.v.). |
| REQ-EVAL-02 | NÊN | Replay trace production → eval case (cùng artifact hoặc export tương thích). |
| REQ-EVAL-03 | NÊN | Cổng CI (`--gate`) để fail build khi hồi quy. |

**Hiện trạng gói:** `@ziro-agent/eval`.

---

### REQ-OBS — Quan sát (observability)

| ID | Mức | Yêu cầu |
|----|-----|---------|
| REQ-OBS-01 | PHẢI | OpenTelemetry (hoặc tương đương) trên LLM call, tool call, agent step — tuân semantic conventions GenAI khi áp dụng được. |
| REQ-OBS-02 | NÊN | Tài liệu tích hợp với stack quan sát phổ biến (Grafana / Tempo / vendor APM). |

**Hiện trạng gói:** `@ziro-agent/tracing`.

---

### REQ-SEC — An toàn, policy, audit

| ID | Mức | Yêu cầu |
|----|-----|---------|
| REQ-SEC-01 | PHẢI | Guardrails cấu hình được: block prompt, redact PII (mức tối thiểu hook/middleware). |
| REQ-SEC-02 | NÊN | Audit trail (hash-chained hoặc append-only log) cho quyết định agent / tool nhạy cảm. |
| REQ-SEC-03 | CÓ THỂ | Compliance pack (mapping control → primitive SDK). |

**Hiện trạng gói:** `@ziro-agent/audit`, `@ziro-agent/compliance`, guardrails trong `agent` / `middleware`.

---

### REQ-HITL — Con người trong vòng lặp

| ID | Mức | Yêu cầu |
|----|-----|---------|
| REQ-HITL-01 | PHẢI | Pause khi tool cần phê duyệt; resume với quyết định người; state không mất qua deploy khi dùng durable + checkpoint. |
| REQ-HITL-02 | NÊN | API rõ ràng cho “escalation” trong app host (webhook / queue). |

**Hiện trạng:** `createAgent` + approval + snapshot (`agent`, checkpoint).

---

### REQ-MA — Đa agent

| ID | Mức | Yêu cầu |
|----|-----|---------|
| REQ-MA-01 | NÊN | Ví dụ multi-agent hoặc handoff (planner → worker → critic) dùng workflow + shared state. |
| REQ-MA-02 | CÓ THỂ | Agent-to-agent protocol chuẩn hóa — chỉ khi có RFC và nhu cầu partner rõ. |

**Hiện trạng:** `examples/multi-agent-*`, `@ziro-agent/workflow`.

---

### REQ-UX — Trải nghiệm nhà phát triển & vận hành

| ID | Mức | Yêu cầu |
|----|-----|---------|
| REQ-UX-01 | PHẢI | CLI: init, chạy ví dụ, playground / chat REPL theo README đã công bố. |
| REQ-UX-02 | PHẢI | Docs: getting-started, lỗi, so sánh định vị, cookbooks cho các pillar chính. |
| REQ-UX-03 | NÊN | TypeDoc API build trong CI. |

**Hiện trạng:** `@ziro-agent/cli`, `apps/docs`, `apps/playground`.

---

### REQ-LOOP — Vòng cải tiến (sách Ch.11)

| ID | Mức | Yêu cầu |
|----|-----|---------|
| REQ-LOOP-01 | NÊN | Thu thập phản hồi (human / automated) → backlog cải tiến prompt/tool — quy trình tài liệu, không nhất thiết code hết trong SDK. |
| REQ-LOOP-02 | NÊN | Shadow / canary pattern mô tả trong docs hoặc example (tích hợp runtime khách). |

---

### REQ-NFR — Phi chức năng

| ID | Mức | Yêu cầu |
|----|-----|---------|
| REQ-NFR-01 | PHẢI | TypeScript strict; kiểm thử & CI trên monorepo. |
| REQ-NFR-02 | PHẢI | License OSS (Apache-2.0) cho lõi; phân tách optional commercial. |
| REQ-NFR-03 | NÊN | Mỗi primitive “production” có retry, timeout, circuit breaker **cấu hình được** (theo README pillars). |

---

## 4. Tiêu chí chấp nhận (release gate)

Một minor release **agent runtime** (ví dụ `@ziro-agent/agent`) được coi là **đạt bar agentic** nếu:

1. REQ-FM-01, REQ-FM-05 được kiểm thử tự động.  
2. REQ-TOOL-01, REQ-TOOL-03 (ít nhất một hướng MCP) có ví dụ chạy được.  
3. REQ-ORCH-01, REQ-ORCH-05 có ví dụ + test.  
4. REQ-OBS-01 bật được trong ví dụ playground hoặc doc.  
5. REQ-HITL-01 có cookbook hoặc test tích hợp (khi tính năng bật).

Các nhóm REQ-MEM-03, REQ-MA-02, REQ-LOOP-02 là **P1/P2** — theo `ROADMAP.md` và RFC liên quan.

---

## 5. Duy trì tài liệu này

- **Owner:** maintainers + PM kỹ thuật.  
- **Cập nhật:** mỗi khi đóng milestone roadmap hoặc thêm primitive mới — cập nhật bảng REQ và cột “hiện trạng gói”.  
- **Xung đột với marketing:** ưu tiên **mã nguồn + test + docs site**; README phải đồng bộ (xem mục trust recovery trên roadmap).

---

## 6. Phụ lục — Gói monorepo (tham chiếu nhanh)

| Gói | Vai trò trong REQ |
|-----|-------------------|
| `@ziro-agent/core` | REQ-FM, REQ-NFR |
| `@ziro-agent/providers-*` | REQ-FM |
| `@ziro-agent/middleware` | REQ-FM-04, REQ-SEC |
| `@ziro-agent/tools` | REQ-TOOL |
| `@ziro-agent/mcp-server` | REQ-TOOL-03 |
| `@ziro-agent/openapi` | REQ-TOOL-04 |
| `@ziro-agent/agent` | REQ-ORCH, REQ-HITL, REQ-RUN (tích hợp) |
| `@ziro-agent/workflow` | REQ-ORCH, REQ-MA |
| `@ziro-agent/memory` | REQ-MEM |
| `@ziro-agent/checkpoint-*` | REQ-MEM-04, REQ-RUN |
| `@ziro-agent/inngest` | REQ-RUN |
| `@ziro-agent/tracing` | REQ-OBS |
| `@ziro-agent/eval` | REQ-EVAL, REQ-LOOP |
| `@ziro-agent/audit`, `@ziro-agent/compliance` | REQ-SEC |
| `@ziro-agent/cli` | REQ-UX |
| `apps/docs`, `apps/playground` | REQ-UX |

*Bảng gói có thể thay đổi theo thời gian; `package.json` / `README.md` là nguồn sự thật.*
