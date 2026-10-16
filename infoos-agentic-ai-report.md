<h1 style="color:#F0A868">InfoOS Agentic AI</h1>

**Production Architecture Report**
A guarded multi-agent system for retail POS and ERP: no raw SQL, a zero-cost fast path, and human approval for every risky action.

| System | Stack | Agent runner | Security tier |
|---|---|---|---|
| InfoOS Desktop | Electron, React, Flask, SQLite | AgentGraph (zero pip dependencies) | RBAC + hardcoded ceilings |

---

<h2 style="color:#F0A868">1. The Problem</h2>

POS and ERP software runs in zero-fault environments. Stock errors cause stockouts, billing errors break tax compliance, and a wrong deletion destroys transaction history for good.

| Common approach | What goes wrong |
|---|---|
| **Unbounded text-to-SQL bots** | The model writes raw SQL. This brings injection risk, skips validation logic and can corrupt the database. |
| **Monolithic single-prompt chatbots** | Every tool sits in one prompt, so quality degrades, hallucinations rise and token costs balloon. |
| **The InfoOS approach** | Guarded multi-agent design with zero direct SQL. Each tool is a thin wrapper over an existing, validated Python service. Financial and destructive actions wait for a human diff card. Frequent queries use a deterministic fast path costing 0 tokens and $0.00. |

---

<h2 style="color:#F0A868">2. System Topology</h2>

The orchestrator only classifies intent. Specialist agents call service-layer functions, and nothing reaches SQLite except through them.

```
        +--------------------------------------+
        |  AgentChatPanel (React)              |
        |  Structured cards, diff approvals    |
        +------------------+-------------------+
                           |
        +------------------v-------------------+
        |  @admin_only gate  (workers: 403)    |
        +------------------+-------------------+
                           |
   +---------------------+ | +--------------------------+
   | ZERO-COST FAST PATH |<+>|  ORCHESTRATOR AGENT      |
   | regex match         |   |  intent classification   |
   | 0 tokens, $0.00     |   |  only                    |
   +---------------------+   +------------+-------------+
                                          |
   +---------+-----------+---------+------+-----+----------+-----------+
   |         |           |         |            |          |           |
+--v---+ +---v-----+ +---v----+ +--v-------+ +--v-----+ +--v-------+ +-v--------+
|Billing| |Inventory| |Product | |Worker/Pay| |Expense | |Analytics | |Reminder  |
|confirm| |confirm  | |confirm | |confirm   | |confirm | |autonomous| |autonomous|
+--+---+ +---+-----+ +---+----+ +--+-------+ +--+-----+ +--+-------+ +-+--------+
   +---------+-----------+---------+------+-----+----------+-----------+
                                          |
              +---------------------------v--------------------------+
              |  VALIDATED SERVICE LAYER                             |
              |  DatabaseService, WorkerService, UndoService         |
              +---------------------------+--------------------------+
                                          |
                          +---------------v---------------+
                          |  SQLite + AgentCheckpoint     |
                          +-------------------------------+
```

*Figure 1. Request path from chat panel to database. "confirm" = Suggest and Confirm tier; "autonomous" = Full Autonomy tier.*

---

<h2 style="color:#F0A868">3. Six Architectural Pillars</h2>

| Pillar | What it guarantees |
|---|---|
| **1. Zero raw SQL** | Agents cannot write or run SQL strings. Every tool maps to validated services (`DatabaseService`, `WorkerService`), so foreign keys, rollbacks and stock checks are inherited. |
| **2. Zero-cost fast path** | Regex classifiers in `fast_path.py` answer routine queries (daily sales, staff on duty, low stock) in under 20 ms with 0 tokens and $0.00. |
| **3. Resumable state graph** | `AgentGraph` has zero external pip dependencies and checkpoints to SQLite (`AgentCheckpoint`). Risky actions pause at `waiting_approval` and resume when an admin approves. |
| **4. Hardcoded security ceilings** | Workers are blocked in middleware. Payroll disbursement, retroactive bill voiding and catalog deletion can never be made fully autonomous, even for admins. |
| **5. Bring your own LLM** | OpenAI, Claude, Gemini or local endpoints (Ollama, vLLM). Keys are encrypted at rest with Fernet/AES-256 and never logged or sent to the client. |
| **6. Structured UI cards** | Models stream strict JSON (`metric_list`, `insight_block`, `action_list`, `table`) rendered as native React cards with one-click PDF export. |

---

<h2 style="color:#F0A868">4. Domain Agents and Policy</h2>

Five agents write data and need a human to confirm. Two are safe to run on their own.

| Agent | Capabilities | Default tier | Safety constraint |
|---|---|---|---|
| **Billing** | Draft bills, product lookup, split payments, hold tables | Suggest & Confirm | Full autonomy locked. Cannot disburse funds or void old bills without human review. |
| **Inventory** | Adjust stock, set low-stock thresholds, reorders | Suggest & Confirm | Stock changes need an audit reason. Cache cleared on mutation. |
| **Product** | Add and edit items, variations, categories, group sequences | Suggest & Confirm | Permanent deletion forbidden. Items are soft-disabled (`active=False`). |
| **Worker / Payroll** | Attendance audit, salary advances, shift monitoring | Suggest & Confirm | Payroll disbursement requires explicit manual human execution. |
| **Expense** | Log expenses, categorize vendor costs, trend reports | Suggest & Confirm | Bulk deletion shows a staged sample preview table first. |
| **Analytics** | Sales summaries, margin analysis, revenue comparisons | Full Autonomy | Read-only by construction. Cannot alter records. |
| **Reminder** | Schedule alerts, vendor follow-ups, stock checks | Full Autonomy | Low risk and fully reversible. |

---

<h2 style="color:#F0A868">5. Resumable State Graph</h2>

Built with standard Python libraries and SQLAlchemy. When a tool needs approval, the graph pauses, stages a proposal in `AgentActionLog` and saves state to `AgentCheckpoint`.

```
 call_llm --> check_tool_calls --> dispatch_tool --> append_tool_result
    ^               |                   |                   |
    |               v                   v                   |
    |         [ done ]          [ waiting_approval ]        |
    |        (no pending         (admin must approve,       |
    |         tool calls)         then resume)              |
    +-----------------------------------------------------<-+
```

*Figure 2. Graph in `backend/agents/graph_runner.py`. `dispatch_tool` pauses execution when status is `waiting_approval`; `check_tool_calls` ends the run when status is `done` or no tool calls remain.*

### Suggest-and-Confirm in practice

1. Admin asks: "Increase Cold Coffee price to ₹120".
2. The Product Agent calls `propose_update_product`.
3. The backend builds the diff "Update product #14: Price → ₹120.00" and returns an action ID. The database is untouched.
4. The chat panel shows an Approve / Reject card. Only Approve writes the change.

---

<h2 style="color:#F0A868">6. Zero-Cost Fast Path and Token Economics</h2>

Up to 70% of POS assistant queries are repetitive status checks. Sending them to an external LLM adds 1 to 3 seconds and $0.005 to $0.02 per call.

| Query type | Latency | Tokens | Cost |
|---|---|---|---|
| Daily revenue / net profit | under 15 ms | 0 | $0.00 |
| Staff attendance audit | under 18 ms | 0 | $0.00 |
| Low-stock critical alert | under 20 ms | 0 | $0.00 |
| Open-ended business analysis (orchestrator + LLM) | 800 to 1800 ms | about 850 | about $0.00045 (GPT-4o-mini) |

```
Latency (log scale, longer bar = slower)

Daily revenue / profit  |############                    under 15 ms
Staff attendance        |#############                   under 18 ms
Low-stock alert         |##############                  under 20 ms
Open-ended analysis     |################################ 800 to 1800 ms
```

---

<h2 style="color:#F0A868">7. Scoped Deletion and Undo Safety</h2>

| Entity type | Rule |
|---|---|
| **History-bearing** (products, workers, bills) | Hard deletes are blocked in code. Products are soft-disabled (`active=False`) so old invoices and analytics stay valid. |
| **Reversible actions** | `UndoService` logs inverse JSON mutations. After an approved stock adjustment or rename, an Undo button stays in the chat panel to restore the previous state. |

---

*InfoOS Desktop · Engineering architecture documentation · Confidential · Production spec v1.0*
