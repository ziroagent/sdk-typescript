# Hermes Agent (Nous Research) — Tài liệu tham khảo chi tiết

> **Tên & nguồn:** Dự án chính thức là **[Hermes Agent](https://github.com/NousResearch/hermes-agent)** của **Nous Research** (MIT).  
> **Không nhầm với:** [Helmes](https://helmes.com/) (công ty tư vấn/phần mềm Estonia — “Helmes AI agents” là dịch vụ doanh nghiệp, khác hẳn repo này).

**Trang chủ docs:** [hermes-agent.nousresearch.com/docs](https://hermes-agent.nousresearch.com/docs/)  
**Repository:** [github.com/NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)

---

## 1. Hermes Agent là gì?

Hermes Agent là **agent AI mã nguồn mở**, tập trung vào:

- **Vòng học kín (closed learning loop):** nhớ xuyên phiên, skill sinh ra và cải tiến từ kinh nghiệm, tìm kiếm hội thoại cũ (FTS5 + tóm tắt LLM), mô hình hóa người dùng (tích hợp [Honcho](https://github.com/plastic-labs/honcho)), tương thích chuẩn **[agentskills.io](https://agentskills.io)**.
- **Chạy trên hạ tầng của bạn:** VPS giá thấp, cluster GPU, hoặc sandbox/serverless (Modal, Daytona, …) — không bị khóa vào một máy laptop.
- **Đa model:** đổi provider/model bằng lệnh (`hermes model`), không cần sửa code — OpenRouter (200+ models), Nous Portal, NVIDIA NIM, OpenAI, Anthropic, các endpoint tùy chỉnh, v.v.

Định vị marketing: *“The agent that grows with you”* — nhấn mạnh **nhớ lâu dài**, **skill**, và **đa kênh**.

---

## 2. Thông tin repository & phiên bản

| Mục | Giá trị (tham khảo; có thể thay đổi theo thời gian) |
|-----|-----------------------------------------------------|
| **License** | MIT |
| **Ngôn ngữ chính** | Python (~89%), TypeScript/Rust shell cho UI và tooling |
| **Branch mặc định** | `main` |
| **Website / Docs** | [hermes-agent.nousresearch.com](https://hermes-agent.nousresearch.com) |
| **Phiên bản gần đây** | Ví dụ: **v0.13.0** (2026-05-07) — release *“The Tenacity Release”* |

Số liệu GitHub (stars/forks/issues) biến động nhanh; xem trực tiếp trên repo để có con số mới nhất.

---

## 3. Kiến trúc tổng thể

Hermes tách ** lõi agent** khỏi **kênh giao tiếp**. Một lớp `AIAgent` phục vụ CLI, gateway tin nhắn, ACP (IDE), batch runner, và API server — khác biệt nền tảng nằm ở entry point, không phân nhánh logic agent cốt lõi.

### 3.1. Sơ đồ luồng (tóm tắt từ tài liệu Architecture chính thức)

```
Entry points:  CLI (cli.py) | Gateway (gateway/run.py) | ACP (acp_adapter/) | Batch | API Server | Thư viện Python
                                    │
                                    ▼
              AIAgent (run_agent.py) — vòng hội thoại + tool
                    │
      ┌─────────────┼─────────────┐
      ▼             ▼             ▼
 Prompt Builder   Provider      Tool dispatch
                  Resolution    (model_tools.py + registry)
                                    │
              Session (SQLite + FTS5)     Tool backends: terminal (7), browser, web, MCP, file, vision, …
```

### 3.2. Các module “chịu tải” (theo `AGENTS.md` trong repo)

| Thành phần | Vai trò |
|------------|---------|
| `run_agent.py` | Lớp **`AIAgent`** — vòng hội thoại chính (file rất lớn, ~ hàng chục nghìn dòng theo mô tả nội bộ). |
| `model_tools.py` | Điều phối tool: discovery, schema, `handle_function_call()`. |
| `toolsets.py` | Nhóm tool / preset theo nền tảng. |
| `cli.py` | **`HermesCLI`** — điều phối TUI / CLI tương tác. |
| `hermes_state.py` | **`SessionDB`** — SQLite, **FTS5** cho tìm kiếm session. |
| `hermes_constants.py` | `HERMES_HOME`, đường dẫn theo profile. |
| `tools/` | Tool cụ thể; **auto-discover** qua `tools/registry.py`. |
| `tools/environments/` | Backend thực thi terminal: local, Docker, SSH, Modal, Daytona, Singularity, Vercel Sandbox, … |
| `gateway/` | Gateway tin nhắn: `run.py`, `session.py`, `platforms/` (mỗi nền tảng một adapter). |
| `hermes_cli/` | Subcommand `hermes`, wizard setup, plugin loader, slash commands. |
| `plugins/` | Memory provider, context engine, model providers, kanban, observability, … |
| `cron/` | Lịch tác vụ (scheduler). |
| `acp_adapter/` | Tích hợp IDE (VS Code, Zed, JetBrains) qua ACP. |
| `environments/` | RL / Atropos — huấn luyện & đánh giá. |
| `ui-tui/` | TUI React/Ink; `tui_gateway/` — backend JSON-RPC cho TUI. |

### 3.3. Chuỗi phụ thuộc tool (file dependency chain)

```
tools/registry.py  ← không phụ thuộc file khác; được mọi tool import
       ↑
tools/*.py         ← mỗi file gọi registry.register() khi import
       ↑
model_tools.py     ← discovery + dispatch
       ↑
run_agent.py, cli.py, batch_runner.py, environments/
```

Ý nghĩa: thêm tool mới thường là **tạo file trong `tools/`** và đăng ký — không cần danh sách import tay đầy đủ trong một chỗ tập trung.

---

## 4. Lớp `AIAgent` (hợp đồng sử dụng cơ bản)

Theo tài liệu developer trong repo, constructor thực tế nhận **rất nhiều tham số** (hàng chục), gồm credentials, routing, callback, session, budget, credential pool, v.v.

Giao diện rút gọn:

```python
class AIAgent:
    def chat(self, message: str) -> str:
        """Giao diện đơn giản — trả về chuỗi phản hồi cuối."""

    def run_conversation(self, user_message: str, system_message: str = None,
                         conversation_history: list = None, task_id: str = None) -> dict:
        """Đầy đủ — dict gồm final_response, messages, …"""
```

**Vòng lặp agent** xử lý: chọn provider, dựng prompt, gọi API (nhiều **API mode**: chat completions, Codex responses, Anthropic messages, …), thực thi tool, nén ngữ cảnh, lưu session, retry/fallback.

---

## 5. Tính năng phía người dùng (theo README & docs)

### 5.1. Giao diện & điều khiển

- **TUI thật:** đa dòng, slash command, autocomplete, lịch sử, stream output tool, gián đoạn (interrupt).
- **Hai lối vào chính:** `hermes` (CLI) hoặc **`hermes gateway`** (Telegram, Discord, Slack, WhatsApp, Signal, Email, …).
- Lệnh chung (ví dụ): `/new`, `/reset`, `/model`, `/personality`, `/retry`, `/undo`, `/compress`, `/usage`, `/insights`, `/skills`, `/stop`, …

### 5.2. Nhớ & skill

- File persona / bối cảnh phổ biến: **SOUL.md**, **MEMORY.md**, **USER.md**, **AGENTS.md**, `.hermes.md`, context files.
- Skill: Markdown, có thể tự tạo/cải tiến; Skills Hub; tương thích agentskills.io.

### 5.3. Tool & môi trường thực thi

- Hàng chục tool built-in (web, browser, file, code execution, delegate subagent, MCP, …), nhóm theo **toolset**.
- **Bảy backend terminal** (local, Docker, SSH, Singularity, Modal, Daytona, Vercel Sandbox) — phù hợp cô lập và chi phí serverless.

### 5.4. MCP

- Client MCP: mở rộng capability bằng server MCP bên ngoài.  
- Trong v0.13: cải tiến SSE, OAuth, retry, hiển thị ảnh (MEDIA tags), keepalive, v.v.

### 5.5. Cron

- Tác vụ theo lịch, giao prompt cho agent, **gửi kết quả lên nền tảng** được cấu hình.  
- v0.13 thêm chế độ **`no_agent`**: chỉ chạy script (watchdog), không qua LLM.

### 5.6. Đa agent / Kanban (v0.13+)

- **Kanban bền vững (durable):** bảng đa agent, heartbeat, reclaim task, phát hiện zombie, retry, phục hồi “ảo giác” (hallucination recovery).  
- **`/goal`:** giữ mục tiêu xuyên nhiều lượt (Ralph loop).

### 5.7. Tích hợp IDE (ACP)

- Steer/queue agent từ Zed, VS Code, JetBrains; phiên bản gần đây bổ sung `/steer`, `/queue`, persistence session.

### 5.8. Nghiên cứu / RL

- Batch trajectory, môi trường Atropos, nén trajectory cho huấn luyện model tool-calling.

---

## 6. Cài đặt & lệnh CLI thường dùng

**Cài nhanh (Linux / macOS / WSL2 / Termux):**

```bash
curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash
```

**Windows (PowerShell) — beta:**

```powershell
irm https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.ps1 | iex
```

Sau cài: `source ~/.bashrc` (hoặc zshrc), chạy `hermes`.

**Lệnh khởi động:**

```bash
hermes              # CLI tương tác
hermes model        # Chọn provider/model
hermes tools        # Bật/tắt toolset
hermes config set   # Cấu hình từng key
hermes gateway      # Gateway tin nhắn
hermes setup        # Wizard toàn phần
hermes claw migrate # Nhập từ OpenClaw
hermes update
hermes doctor
```

**Cấu hình người dùng (mặc định):**

- `~/.hermes/config.yaml` — settings  
- `~/.hermes/.env` — API keys  
- Logs: `~/.hermes/logs/` (`agent.log`, `errors.log`, `gateway.log`)

**Profile:** `hermes -p <name>` — mỗi profile có `HERMES_HOME`, config, session, gateway PID riêng.

---

## 7. Migration từ OpenClaw

Hermes hỗ trợ nhập cấu hình OpenClaw (`~/.openclaw`): persona, memory, skill, allowlist lệnh, cấu hình messaging, API keys được allowlist, v.v. Xem README repo và `hermes claw migrate --help`.

---

## 8. Bảo mật & vận hành (ví dụ v0.13)

Các hướng đã được nhấn mạnh trong release notes (không thay thế việc đọc [Security guide](https://hermes-agent.nousresearch.com/docs/user-guide/security)):

- Redaction **bật mặc định**; hardening Discord/WhatsApp; giảm TOCTOU trên `auth.json` / MCP OAuth; trình duyệt chặn SSRF metadata; cron quét prompt-injection trên skill; `hermes debug share` redact khi upload.

Luôn cập nhật phiên bản và đọc `SECURITY.md` trên repo.

---

## 9. Nguyên tắc thiết kế (trích từ docs Architecture)

| Nguyên tắc | Ý nghĩa thực tế |
|------------|------------------|
| Prompt stability | System prompt không đổi giữa chừng; đổi model/cache có lối đi rõ ràng. |
| Observable execution | Tool call hiển thị cho user (spinner / tin nhắn). |
| Interruptible | Hủy giữa chừng API hoặc tool. |
| Platform-agnostic core | Một `AIAgent` cho mọi entry point. |
| Loose coupling | MCP, plugin, memory — registry, không hard-code phụ thuộc. |
| Profile isolation | Profile tách biệt dữ liệu & tiến trình. |

---

## 10. Tài liệu đọc thêm (thứ tự gợi ý của upstream)

1. Architecture (đã lược dẫn ở trên)  
2. Agent Loop Internals  
3. Prompt Assembly  
4. Provider Runtime Resolution  
5. Adding Providers  
6. Tools Runtime  
7. Session Storage  
8. Gateway Internals  
9. Context Compression & Prompt Caching  
10. ACP Internals  
11. Environments / RL  

Liên kết đầy đủ: [hermes-agent.nousresearch.com/docs](https://hermes-agent.nousresearch.com/docs/).

---

## 11. Ghi chú cho đội dùng ZiroAgent SDK

- **Hermes Agent:** Python-first, **ứng dụng agent đầy đủ** (CLI + gateway + skill + nhớ + sandbox execution).  
- **ZiroAgent SDK:** TypeScript, tập trung **runtime agent trong code**, durable checkpoint, budget, MCP, eval, compliance — phục vụ **nhúng vào sản phẩm/CI** khác kiểu Hermes.

Hai thế giới có thể **bổ sung**: ví dụ gateway Telegram chạy Hermes cho cá nhân; backend doanh nghiệp viết bằng Ziro cho API/durable/audit.

---

*Tài liệu này tổng hợp README, `AGENTS.md`, release v0.13.0, và trang Architecture chính thức của Nous Research. Chi tiết implementation có thể thay đổi theo commit; luôn ưu tiên [repo GitHub](https://github.com/NousResearch/hermes-agent) và [docs site](https://hermes-agent.nousresearch.com/docs/) làm nguồn chân lý.*
