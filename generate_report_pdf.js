const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>InfoOS Desktop — Agentic AI Implementation Report</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');

  @page {
    size: A4;
    margin: 20mm 15mm 20mm 15mm;
    @bottom-right {
      content: counter(page);
    }
  }

  *, *::before, *::after {
    box-sizing: border-box;
  }

  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #1e293b;
    background: #ffffff;
    line-height: 1.55;
    font-size: 11pt;
    margin: 0;
    padding: 0;
  }

  .page {
    page-break-after: always;
    position: relative;
  }

  .page:last-child {
    page-break-after: avoid;
  }

  /* Cover & Headers */
  .cover {
    padding: 40px 20px 20px 20px;
    border-bottom: 2px solid #e2e8f0;
    margin-bottom: 30px;
  }

  .badge-tag {
    display: inline-block;
    padding: 4px 10px;
    border-radius: 9999px;
    font-size: 8.5pt;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    background: #eff6ff;
    color: #2563eb;
    border: 1px solid #bfdbfe;
    margin-bottom: 12px;
  }

  .title {
    font-size: 26pt;
    font-weight: 800;
    color: #0f172a;
    line-height: 1.2;
    margin: 0 0 10px 0;
    letter-spacing: -0.02em;
  }

  .subtitle {
    font-size: 13pt;
    font-weight: 400;
    color: #64748b;
    margin: 0 0 20px 0;
    line-height: 1.4;
  }

  .meta-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 15px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 14px 18px;
    margin-top: 20px;
  }

  .meta-item {
    font-size: 8.5pt;
  }
  .meta-label {
    text-transform: uppercase;
    color: #94a3b8;
    font-weight: 600;
    margin-bottom: 3px;
  }
  .meta-value {
    color: #1e293b;
    font-weight: 600;
  }

  /* Headings */
  h1, h2, h3, h4 {
    color: #0f172a;
    font-weight: 700;
    margin-top: 24px;
    margin-bottom: 10px;
    letter-spacing: -0.01em;
  }

  h1 { font-size: 16pt; border-bottom: 1.5px solid #e2e8f0; padding-bottom: 6px; }
  h2 { font-size: 13pt; color: #1e293b; }
  h3 { font-size: 11pt; color: #334155; }

  p {
    margin: 0 0 10px 0;
  }

  /* Callout boxes */
  .callout {
    border-left: 4px solid #3b82f6;
    background: #f0f7ff;
    padding: 12px 16px;
    border-radius: 0 8px 8px 0;
    margin: 14px 0;
    font-size: 10pt;
  }
  .callout-warning {
    border-left-color: #f59e0b;
    background: #fffbeb;
  }
  .callout-danger {
    border-left-color: #ef4444;
    background: #fef2f2;
  }
  .callout-success {
    border-left-color: #10b981;
    background: #ecfdf5;
  }

  /* Tables */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 14px 0;
    font-size: 9pt;
  }

  th, td {
    padding: 8px 10px;
    border: 1px solid #cbd5e1;
    text-align: left;
    vertical-align: top;
  }

  th {
    background-color: #f1f5f9;
    color: #0f172a;
    font-weight: 600;
  }

  tr:nth-child(even) td {
    background-color: #f8fafc;
  }

  /* Code / Pre */
  code {
    font-family: 'JetBrains Mono', Consolas, monospace;
    font-size: 8.5pt;
    background: #f1f5f9;
    padding: 2px 5px;
    border-radius: 4px;
    color: #0f172a;
  }

  pre {
    font-family: 'JetBrains Mono', Consolas, monospace;
    background: #0f172a;
    color: #f8fafc;
    padding: 12px 14px;
    border-radius: 6px;
    font-size: 8pt;
    line-height: 1.45;
    overflow-x: auto;
    margin: 12px 0;
  }

  /* Grid cards */
  .card-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    margin: 14px 0;
  }

  .card {
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 12px 14px;
    background: #ffffff;
  }

  .card-title {
    font-weight: 700;
    font-size: 10pt;
    color: #0f172a;
    margin-bottom: 6px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .card-body {
    font-size: 9pt;
    color: #475569;
    line-height: 1.45;
  }

  /* Badges */
  .badge {
    display: inline-block;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 7.5pt;
    font-weight: 600;
  }
  .badge-blue { background: #dbeafe; color: #1e40af; }
  .badge-green { background: #dcfce7; color: #166534; }
  .badge-amber { background: #fef3c7; color: #92400e; }
  .badge-red { background: #fee2e2; color: #991b1b; }
  .badge-purple { background: #f3e8ff; color: #6b21a8; }

  /* Diagram box */
  .diagram-container {
    background: #0f172a;
    color: #e2e8f0;
    padding: 16px;
    border-radius: 8px;
    margin: 16px 0;
    text-align: center;
  }

  .diagram-container svg {
    max-width: 100%;
    height: auto;
  }

  .footer-note {
    margin-top: 30px;
    padding-top: 10px;
    border-top: 1px solid #e2e8f0;
    font-size: 8pt;
    color: #94a3b8;
    display: flex;
    justify-content: space-between;
  }
</style>
</head>
<body>

  <!-- PAGE 1: COVER & EXECUTIVE SUMMARY -->
  <div class="page">
    <div class="cover">
      <div class="badge-tag">Production Architecture Document</div>
      <h1 class="title">InfoOS Agentic AI</h1>
      <div class="subtitle">Complete Technical Design, Multi-Agent Architecture, and Production Implementation Report</div>
      
      <div class="meta-grid">
        <div class="meta-item">
          <div class="meta-label">System</div>
          <div class="meta-value">InfoOS Desktop</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Stack</div>
          <div class="meta-value">Electron + React + Flask + SQLite</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Agent Runner</div>
          <div class="meta-value">AgentGraph (Zero Pip Dep)</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Security Tier</div>
          <div class="meta-value">RBAC + Hardcoded Ceilings</div>
        </div>
      </div>
    </div>

    <h1>1. Executive Summary & Problem Space</h1>
    <p>
      Retail Point-of-Sale (POS) and Enterprise Resource Planning (ERP) applications operate in zero-fault environments: inventory discrepancies cause stockouts, billing errors break legal tax compliance, and accidental data deletions permanently destroy transaction history.
    </p>
    <p>
      Traditional AI integrations in business management software almost universally adopt one of two flawed paradigms:
    </p>
    <ul>
      <li><strong>Unbounded Text-to-SQL Bots:</strong> The model generates raw SQLite/Postgres queries. This presents critical SQL injection risks, bypasses validation logic, and frequently causes database corruption.</li>
      <li><strong>Monolithic Single-Prompt Chatbots:</strong> All tools are dumped into a single agent prompt, causing prompt degradation, high hallucination rates, and massive token costs.</li>
    </ul>

    <div class="callout callout-success">
      <strong>The InfoOS Solution:</strong> InfoOS implements a guarded, multi-agent architecture with zero direct SQL generation. Every tool is a thin wrapper over existing, validated Python service layers. Financial and destructive actions are gated by human-in-the-loop diff cards, while high-frequency queries execute via a deterministic fast-path consuming <strong>0 tokens and $0.00 in LLM cost</strong>.
    </div>

    <h2>High-Level System Topology</h2>
    <div class="diagram-container">
      <svg width="650" height="260" viewBox="0 0 650 260" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- Client Layer -->
        <rect x="20" y="20" width="180" height="60" rx="8" fill="#1E293B" stroke="#38BDF8" stroke-width="2"/>
        <text x="110" y="45" fill="#F8FAFC" font-size="12" font-weight="700" text-anchor="middle">AgentChatPanel (React)</text>
        <text x="110" y="65" fill="#94A3B8" font-size="10" text-anchor="middle">Structured Cards & Mascot</text>

        <!-- Middleware -->
        <rect x="235" y="20" width="180" height="60" rx="8" fill="#1E293B" stroke="#F59E0B" stroke-width="2"/>
        <text x="325" y="45" fill="#F8FAFC" font-size="12" font-weight="700" text-anchor="middle">@admin_only Gate</text>
        <text x="325" y="65" fill="#FCA5A5" font-size="10" text-anchor="middle">Workers Blocked (403)</text>

        <!-- Fast Path -->
        <rect x="450" y="20" width="180" height="60" rx="8" fill="#064E3B" stroke="#10B981" stroke-width="2"/>
        <text x="540" y="45" fill="#ECFDF5" font-size="12" font-weight="700" text-anchor="middle">Zero-Cost Fast Path</text>
        <text x="540" y="65" fill="#6EE7B7" font-size="10" text-anchor="middle">0 Tokens / $0.00 Cost</text>

        <!-- Orchestrator -->
        <rect x="235" y="110" width="180" height="50" rx="8" fill="#1E293B" stroke="#818CF8" stroke-width="2"/>
        <text x="325" y="132" fill="#F8FAFC" font-size="12" font-weight="700" text-anchor="middle">Orchestrator Agent</text>
        <text x="325" y="148" fill="#C7D2FE" font-size="10" text-anchor="middle">Intent Classification Only</text>

        <!-- Domain Agents -->
        <rect x="20" y="190" width="80" height="45" rx="6" fill="#334155"/>
        <text x="60" y="217" fill="#F8FAFC" font-size="9" font-weight="600" text-anchor="middle">Billing</text>

        <rect x="110" y="190" width="80" height="45" rx="6" fill="#334155"/>
        <text x="150" y="217" fill="#F8FAFC" font-size="9" font-weight="600" text-anchor="middle">Inventory</text>

        <rect x="200" y="190" width="80" height="45" rx="6" fill="#334155"/>
        <text x="240" y="217" fill="#F8FAFC" font-size="9" font-weight="600" text-anchor="middle">Product</text>

        <rect x="290" y="190" width="80" height="45" rx="6" fill="#334155"/>
        <text x="330" y="217" fill="#F8FAFC" font-size="9" font-weight="600" text-anchor="middle">Worker/Pay</text>

        <rect x="380" y="190" width="80" height="45" rx="6" fill="#334155"/>
        <text x="420" y="217" fill="#F8FAFC" font-size="9" font-weight="600" text-anchor="middle">Expense</text>

        <rect x="470" y="190" width="80" height="45" rx="6" fill="#334155"/>
        <text x="510" y="217" fill="#F8FAFC" font-size="9" font-weight="600" text-anchor="middle">Analytics</text>

        <rect x="560" y="190" width="70" height="45" rx="6" fill="#334155"/>
        <text x="595" y="217" fill="#F8FAFC" font-size="9" font-weight="600" text-anchor="middle">Reminder</text>

        <!-- Arrows -->
        <path d="M200 50 L235 50" stroke="#94A3B8" stroke-width="2" marker-end="url(#arrow)"/>
        <path d="M415 50 L450 50" stroke="#94A3B8" stroke-width="2"/>
        <path d="M325 80 L325 110" stroke="#94A3B8" stroke-width="2"/>
        <path d="M325 160 L325 180" stroke="#94A3B8" stroke-width="2"/>
      </svg>
    </div>
  </div>

  <!-- PAGE 2: THE 6 CORE PILLARS -->
  <div class="page">
    <h1>2. The Six Architectural Pillars</h1>

    <div class="card-grid">
      <div class="card">
        <div class="card-title">
          <span class="badge badge-blue">Pillar 1</span> Zero Raw SQL Guarantee
        </div>
        <div class="card-body">
          Agents possess zero capability to generate or execute raw SQL strings. Every tool maps to pre-existing, validated Python backend services (<code>DatabaseService</code>, <code>WorkerService</code>). Foreign key constraints, transaction rollbacks, and stock validations are automatically inherited.
        </div>
      </div>

      <div class="card">
        <div class="card-title">
          <span class="badge badge-green">Pillar 2</span> Zero-Cost Fast Path
        </div>
        <div class="card-body">
          High-frequency business inquiries (e.g., daily sales summaries, staff on duty, low-stock threshold queries) are intercepted via deterministic regex classifiers in <code>fast_path.py</code>. Handled in under 20ms with 0 input/output tokens and $0.00 cost.
        </div>
      </div>

      <div class="card">
        <div class="card-title">
          <span class="badge badge-amber">Pillar 3</span> Resumable State Graph
        </div>
        <div class="card-body">
          Implemented via <code>AgentGraph</code> with zero external pip dependencies. Checkpointed in SQLite (<code>AgentCheckpoint</code>). Destructive actions pause the execution state at <code>waiting_approval</code> and resume execution instantly when an admin approves.
        </div>
      </div>

      <div class="card">
        <div class="card-title">
          <span class="badge badge-red">Pillar 4</span> Hardcoded Security Ceilings
        </div>
        <div class="card-body">
          Worker accounts are hard-blocked at the middleware layer. Even for Admin users, actions involving payroll disbursement, retroactive bill voiding, or catalog deletion have hardcoded ceilings and can <strong>never</strong> be configured for full autonomy.
        </div>
      </div>

      <div class="card">
        <div class="card-title">
          <span class="badge badge-purple">Pillar 5</span> Provider-Agnostic BYO-LLM
        </div>
        <div class="card-body">
          Businesses bring their own API keys for OpenAI, Anthropic Claude, Google Gemini, or local endpoints (Ollama/vLLM). All credentials are encrypted at rest with Fernet/AES-256 and never logged or exposed to the client.
        </div>
      </div>

      <div class="card">
        <div class="card-title">
          <span class="badge badge-blue">Pillar 6</span> Structured UI Card Engine
        </div>
        <div class="card-body">
          Instead of unstructured markdown and emojis, the models stream strict JSON conforming to typed schemas (<code>metric_list</code>, <code>insight_block</code>, <code>action_list</code>, <code>table</code>). Directly rendered into native React cards with one-click PDF export.
        </div>
      </div>
    </div>

    <h1>3. Domain Agents & Scope Matrix</h1>
    <table>
      <thead>
        <tr>
          <th>Domain Agent</th>
          <th>Registered Capabilities</th>
          <th>Default Tier</th>
          <th>Safety & Policy Constraints</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Billing Agent</strong></td>
          <td>Draft bills, lookup products, calculate split payments, hold tables</td>
          <td><span class="badge badge-amber">Suggest & Confirm</span></td>
          <td>Hard Ceiling: Full autonomy locked. Cannot disburse funds or void old bills without human review.</td>
        </tr>
        <tr>
          <td><strong>Inventory Agent</strong></td>
          <td>Adjust stock levels, set low-stock alert thresholds, reorders</td>
          <td><span class="badge badge-amber">Suggest & Confirm</span></td>
          <td>Stock changes require explicit audit reasons. In-memory cache cleared on mutation.</td>
        </tr>
        <tr>
          <td><strong>Product Agent</strong></td>
          <td>Add/edit items, variations, categories, item group sequences</td>
          <td><span class="badge badge-amber">Suggest & Confirm</span></td>
          <td>Permanent deletion strictly forbidden. Soft-disables items (<code>active=False</code>) to protect sales history.</td>
        </tr>
        <tr>
          <td><strong>Worker / Payroll</strong></td>
          <td>Attendance audit, salary advances, active shift monitoring</td>
          <td><span class="badge badge-amber">Suggest & Confirm</span></td>
          <td>Hard Ceiling: Full payroll disbursement requires explicit human manual execution.</td>
        </tr>
        <tr>
          <td><strong>Expense Agent</strong></td>
          <td>Log operational expenses, categorize vendor costs, report trends</td>
          <td><span class="badge badge-amber">Suggest & Confirm</span></td>
          <td>Bulk deletion requires staged sample preview tables before confirmation.</td>
        </tr>
        <tr>
          <td><strong>Analytics Agent</strong></td>
          <td>Sales summaries, margin analysis, revenue comparisons</td>
          <td><span class="badge badge-green">Full Autonomy</span></td>
          <td>Read-only by construction. Completely safe; cannot alter database records.</td>
        </tr>
        <tr>
          <td><strong>Reminder Agent</strong></td>
          <td>Schedule operational alerts, vendor follow-ups, stock checks</td>
          <td><span class="badge badge-green">Full Autonomy</span></td>
          <td>Low risk, fully reversible operational reminders.</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- PAGE 3: STATE GRAPH & CODE IMPLEMENTATION -->
  <div class="page">
    <h1>4. Resumable State Graph & SQLite Checkpointing</h1>
    <p>
      The state machine is built entirely with standard Python libraries and SQLAlchemy. When a tool requires human approval, the graph pauses, stages a proposal in <code>AgentActionLog</code>, and saves the conversation state to <code>AgentCheckpoint</code>.
    </p>

    <pre><code># Graph Topology: backend/agents/graph_runner.py
call_llm → check_tool_calls → dispatch_tool → append_tool_result
                 ↑                                     │
                 └─────────────────────────────────────┘
(dispatch_tool pauses execution when status="waiting_approval")
(check_tool_calls terminates when status="done" or no pending tool calls)</code></pre>

    <h2>The Suggest-and-Confirm Execution Flow</h2>
    <div class="callout callout-warning">
      <strong>Human-in-the-Loop Diff Generation:</strong> When an admin asks <em>"Increase Cold Coffee price to ₹120"</em>, the Product Agent calls <code>propose_update_product</code>. 
      The backend computes a diff string: <code>"Update product #14: Price → ₹120.00"</code> and returns an action ID. The frontend renders an <strong>Approve / Reject</strong> card. 
      The database remains untouched until the admin explicitly clicks Approve.
    </div>

    <h1>5. Zero-Cost Fast Path & Token Economics</h1>
    <p>
      In POS software, up to 70% of assistant queries are repetitive status checks. Passing these through an external LLM adds 1–3 seconds of latency and costs $0.005–$0.02 per call.
    </p>

    <table>
      <thead>
        <tr>
          <th>Query Type</th>
          <th>Deterministic Pattern</th>
          <th>Latency</th>
          <th>Tokens Used</th>
          <th>Cost</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Daily Revenue / Net Profit</td>
          <td><code>r"\b(today'?s\s+sales|revenue|profit)\b"</code></td>
          <td>&lt; 15 ms</td>
          <td>0</td>
          <td>$0.00000</td>
        </tr>
        <tr>
          <td>Staff Attendance Audit</td>
          <td><code>r"\b(who\s+is\s+present|attendance\s+today)\b"</code></td>
          <td>&lt; 18 ms</td>
          <td>0</td>
          <td>$0.00000</td>
        </tr>
        <tr>
          <td>Low Stock Critical Alert</td>
          <td><code>r"\b(check\s+low\s+stock|low\s+stock\s+items)\b"</code></td>
          <td>&lt; 20 ms</td>
          <td>0</td>
          <td>$0.00000</td>
        </tr>
        <tr>
          <td>Open-Ended Business Analysis</td>
          <td>Full Orchestrator Routing → LLM Adapter</td>
          <td>800–1800 ms</td>
          <td>~850 tokens</td>
          <td>~$0.00045 (GPT-4o-mini)</td>
        </tr>
      </tbody>
    </table>

    <h1>6. Scoped Deletion & Undo Safety</h1>
    <p>
      To prevent accidental data loss, InfoOS distinguishes between <strong>history-bearing entities</strong> and <strong>transient entities</strong>:
    </p>
    <ul>
      <li><strong>History-Bearing (Products, Workers, Bills):</strong> Hard deletes are physically blocked in code. Products are soft-disabled (<code>active=False</code>) so historical invoices and analytics remain valid.</li>
      <li><strong>Reversible Action Rollbacks:</strong> The <code>UndoService</code> logs inverse JSON mutations. If a stock adjustment or item rename is approved, an "Undo" button remains active in the chat panel to restore previous state immediately.</li>
    </ul>
  </div>

  <!-- PAGE 4: LINKEDIN LAUNCH ASSETS -->
  <div class="page">
    <h1>7. LinkedIn Launch Package</h1>
    <p>Use the following pre-formatted copy and carousel storyboard to announce and showcase this architecture on LinkedIn.</p>

    <h2>Recommended Post Copy</h2>
    <div class="callout">
      <strong>Post Caption:</strong><br><br>
      Most "AI integrations" in business software are just glorified chatbots connected to raw SQL queries.<br><br>
      In a real-world Point of Sale or ERP system, that's a recipe for disaster: hallucinated stock counts, runaway token bills, and zero auditability.<br><br>
      Over the past few months, we designed and built a production-grade Agentic AI layer into InfoOS (Electron + React + Flask + SQLite). Here are the 5 architectural rules we followed:<br><br>
      1️⃣ <strong>Zero Direct SQL:</strong> The agents never touch the database directly. All capabilities are thin wrappers over our existing, validated service functions.<br>
      2️⃣ <strong>Zero-Cost Fast Path:</strong> Common questions ("today's sales", "low stock audit", "staff on duty") bypass the LLM entirely via deterministic regex matching — 0 tokens, $0.00 cost, and instant 15ms responses.<br>
      3️⃣ <strong>Resumable State Graph:</strong> Built a lightweight state machine with SQLite checkpoints. Destructive actions pause the execution state and resume when the admin clicks Approve.<br>
      4️⃣ <strong>Hardcoded Safety Ceilings:</strong> Cashiers/workers are blocked at the middleware layer (403). Payroll disbursement and bill voids can NEVER be automated.<br>
      5️⃣ <strong>Structured UI Cards:</strong> Replaced raw markdown dumps with strict JSON schemas rendered into native KPI cards, diff previews, and tables.<br><br>
      AI in enterprise software shouldn't just be a gimmick — it has to be reliable, transparent, and bounded by business logic.<br><br>
      #AgenticAI #SoftwareEngineering #Python #React #Electron #ArtificialIntelligence #SystemDesign #BuildingInPublic
    </div>

    <h2>8-Slide Carousel Storyboard (PDF Presentation)</h2>
    <table>
      <thead>
        <tr>
          <th>Slide #</th>
          <th>Headline</th>
          <th>Key Visual / Content Elements</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Slide 1</td>
          <td>Building Production-Grade Agentic AI for Desktop POS</td>
          <td>High-contrast cover slide with InfoOS logo & architectural badges.</td>
        </tr>
        <tr>
          <td>Slide 2</td>
          <td>The Danger of Unbounded Text-to-SQL</td>
          <td>Comparison: SQL Injection & Hallucinations vs Validated Service Layers.</td>
        </tr>
        <tr>
          <td>Slide 3</td>
          <td>Hub-and-Spoke Multi-Agent Architecture</td>
          <td>Diagram showing Orchestrator routing to 7 domain-specific specialists.</td>
        </tr>
        <tr>
          <td>Slide 4</td>
          <td>Zero-Cost Fast Path: 0 Tokens, $0.00 Cost</td>
          <td>Regex classification table demonstrating instant &lt;20ms performance.</td>
        </tr>
        <tr>
          <td>Slide 5</td>
          <td>Resumable State Graphs with SQLite Checkpointing</td>
          <td>Flowchart of state execution pausing on <code>waiting_approval</code>.</td>
        </tr>
        <tr>
          <td>Slide 6</td>
          <td>Granular Permissions & Non-Negotiable Ceilings</td>
          <td>Security matrix: Worker 403 blocks and mandatory human confirmation.</td>
        </tr>
        <tr>
          <td>Slide 7</td>
          <td>Structured UI Cards vs Markdown Text Dumps</td>
          <td>Side-by-side: Messy emoji markdown vs Clean React KPI metric cards.</td>
        </tr>
        <tr>
          <td>Slide 8</td>
          <td>Summary & Key Engineering Takeaways</td>
          <td>Key lessons, tech stack summary, and engagement call-to-action.</td>
        </tr>
      </tbody>
    </table>

    <div class="footer-note">
      <span>InfoOS Desktop &bull; Engineering Architecture Documentation</span>
      <span>Confidential &bull; Production Spec v1.0</span>
    </div>
  </div>

</body>
</html>
`;

async function generatePdf() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.setContent(htmlContent, { waitUntil: 'networkidle' });
  
  // Save both exact requested name and clean name
  const targetPath1 = path.join(__dirname, 'AgenticAI implementation.pdf');
  const targetPath2 = path.join(__dirname, 'AgenticAI inmplementation.pdf');
  
  const pdfOptions = {
    format: 'A4',
    printBackground: true,
    margin: {
      top: '15mm',
      bottom: '15mm',
      left: '12mm',
      right: '12mm'
    }
  };

  await page.pdf({ path: targetPath1, ...pdfOptions });
  await page.pdf({ path: targetPath2, ...pdfOptions });

  await browser.close();
  console.log('SUCCESS: PDFs generated at:');
  console.log(' - ' + targetPath1);
  console.log(' - ' + targetPath2);
}

generatePdf().catch(err => {
  console.error('Error generating PDF:', err);
  process.exit(1);
});
