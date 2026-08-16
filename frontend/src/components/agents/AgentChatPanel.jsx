import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { useAlert } from '../../context/AlertContext';
import { agentsAPI } from '../../api/agents';

/**
 * InfoOS AI — Production-Grade Multi-Agent Interface with Structured Card System
 *
 * Features:
 * - Strict Structured Component System (No raw markdown or emoji characters)
 * - Themed SVG Icon Mapping for all sections, metrics, tables, and statuses
 * - Redesigned Branded "AI Working" Intermediate Loading State with Skeleton Morph
 * - Persistent Chat History Drawer with session management (New Chat, Restore, Delete)
 * - Real-time Database Tool Execution & Action Proposal Approvals
 */

const STORAGE_KEY = 'infoos_ai_chat_sessions_v1';

const AGENT_META = {
  analytics: { label: 'Analytics Agent', icon: <TrendingUpIcon size={14} color="#38BDF8" />, color: '#38bdf8' },
  inventory: { label: 'Inventory Agent', icon: <PackageIcon size={14} color="#FBBF24" />, color: '#fbbf24' },
  worker: { label: 'Worker Agent', icon: <UsersIcon size={14} color="#A78BFA" />, color: '#a78bfa' },
  reminder: { label: 'Reminder Agent', icon: <ClockIcon size={14} color="#F472B6" />, color: '#f472b6' },
  billing: { label: 'Billing Agent', icon: <ReceiptIcon size={14} color="#34D399" />, color: '#34d399' },
  product: { label: 'Product Agent', icon: <BoxIcon size={14} color="#FB923C" />, color: '#fb923c' },
  expense: { label: 'Expense Agent', icon: <DollarSignIcon size={14} color="#F87171" />, color: '#f87171' },
  system: { label: 'System Agent', icon: <CpuIcon size={14} color="#94A3B8" />, color: '#94a3b8' },
  orchestrator: { label: 'Orchestrator', icon: <AiCoreIcon size={14} color="#FF6B1A" />, color: '#ff6b1a' },
};

const SUGGESTIONS = [
  {
    icon: <TrendingUpIcon size={18} color="#FF6B1A" />,
    title: "Today's Financials",
    desc: 'Sales, net profit & margin breakdown',
    prompt: "What is today's total sales, gross revenue, and net profit summary?"
  },
  {
    icon: <PackageIcon size={18} color="#FF8A3D" />,
    title: 'Low Stock Audit',
    desc: 'Items below alert threshold needing restock',
    prompt: 'Show all low stock inventory items currently below alert threshold'
  },
  {
    icon: <UsersIcon size={18} color="#A78BFA" />,
    title: 'Staff On Duty',
    desc: 'Attendance status & active shifts today',
    prompt: 'Who is present, absent, or marked on duty today?'
  },
  {
    icon: <DollarSignIcon size={18} color="#34D399" />,
    title: 'Recent Expenses',
    desc: 'Log of operational costs this week',
    prompt: 'Summarize recent operational expenses recorded this week'
  },
  {
    icon: <ReceiptIcon size={18} color="#38BDF8" />,
    title: 'Recent Bills',
    desc: 'Latest customer orders & payment modes',
    prompt: 'Show the 5 most recent customer bills created today'
  },
  {
    icon: <StarIcon size={18} color="#FBBF24" />,
    title: 'Top Sellers',
    desc: 'Best performing products & categories',
    prompt: 'What are the top 5 best selling menu products today?'
  }
];

const DEFAULT_WELCOME_MSG = {
  id: 'welcome',
  role: 'assistant',
  agent: 'orchestrator',
  text: JSON.stringify({
    title: { icon: 'ai_review', text: 'InfoOS AI Assistant' },
    sections: [
      {
        type: 'insight_block',
        icon: 'ai_review',
        heading: 'Connected to Live Store Database',
        body: 'I am ready to query your store database for real-time sales performance, inventory thresholds, staff attendance, expenses, and billing.'
      }
    ],
    meta: { status: 'normal', statusIcon: 'status_normal' }
  }),
  data: null,
  steps: [],
  pending_actions: [],
  timestamp: new Date().toISOString()
};

export default function AgentChatPanel() {
  const { isAdmin } = useAuth();
  const { showSuccess, showError } = useAlert();

  const [isOpen, setIsOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [sessions, setSessions] = useState(() => loadSavedSessions());
  const [currentSessionId, setCurrentSessionId] = useState(() => `session_${Date.now()}`);

  const [messages, setMessages] = useState(() => [DEFAULT_WELCOME_MSG]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeAgent, setActiveAgent] = useState('orchestrator');
  const [currentStatus, setCurrentStatus] = useState(null);
  const [actionStatuses, setActionStatuses] = useState({});
  const [isRecording, setIsRecording] = useState(false);
  const [todayTokens, setTodayTokens] = useState(0);
  const [todayCost, setTodayCost] = useState(0.0);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  const isOnlyWelcome = useMemo(() => {
    return messages.length === 1 && messages[0].id === 'welcome';
  }, [messages]);

  // Load token/cost usage summary
  const loadTodayUsage = useCallback(async () => {
    try {
      const res = await agentsAPI.getUsageSummary();
      if (res.success && res.usage) {
        setTodayTokens((res.usage.total_input_tokens || 0) + (res.usage.total_output_tokens || 0));
        setTodayCost(res.usage.estimated_cost_usd || 0.0);
      }
    } catch (e) {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (isOpen && isAdmin) {
      loadTodayUsage();
    }
  }, [isOpen, isAdmin, loadTodayUsage]);

  useEffect(() => {
    if (isOpen && isAdmin) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, loading, currentStatus, isOpen, isAdmin]);

  useEffect(() => {
    if (isOpen && isAdmin) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, isAdmin]);

  useEffect(() => {
    if (!isAdmin && isOpen) {
      setIsOpen(false);
    }
  }, [isAdmin, isOpen]);

  // Auto-sync active conversation to sessions & localStorage
  useEffect(() => {
    const userMsgs = messages.filter((m) => m.role === 'user');
    if (userMsgs.length === 0) return;

    const firstQuery = userMsgs[0].text;
    const title = firstQuery.length > 42 ? firstQuery.slice(0, 40) + '…' : firstQuery;

    setSessions((prevSessions) => {
      const existingIdx = prevSessions.findIndex((s) => s.id === currentSessionId);
      const updatedSession = {
        id: currentSessionId,
        title: title || 'Store Query',
        updatedAt: new Date().toISOString(),
        messages: messages,
      };

      let newSessions;
      if (existingIdx >= 0) {
        newSessions = [...prevSessions];
        newSessions[existingIdx] = updatedSession;
      } else {
        newSessions = [updatedSession, ...prevSessions];
      }

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newSessions.slice(0, 50)));
      } catch (e) {
        // ignore storage limits
      }
      return newSessions;
    });
  }, [messages, currentSessionId]);

  // Global window event listeners
  useEffect(() => {
    const handleToggle = () => {
      if (isAdmin) setIsOpen((prev) => !prev);
    };
    const handleOpen = () => {
      if (isAdmin) setIsOpen(true);
    };
    const handleClose = () => setIsOpen(false);

    window.addEventListener('toggle-agent-chat', handleToggle);
    window.addEventListener('open-agent-chat', handleOpen);
    window.addEventListener('close-agent-chat', handleClose);

    return () => {
      window.removeEventListener('toggle-agent-chat', handleToggle);
      window.removeEventListener('open-agent-chat', handleOpen);
      window.removeEventListener('close-agent-chat', handleClose);
    };
  }, [isAdmin]);

  if (!isAdmin) return null;

  // ── Session History Operations ───────────────────────────────────────────
  const startNewChat = () => {
    const newId = `session_${Date.now()}`;
    setCurrentSessionId(newId);
    setMessages([DEFAULT_WELCOME_MSG]);
    setActionStatuses({});
    setShowHistory(false);
  };

  const loadPastSession = (session) => {
    setCurrentSessionId(session.id);
    setMessages(session.messages || [DEFAULT_WELCOME_MSG]);
    setActionStatuses({});
    setShowHistory(false);
  };

  const deleteSession = (sessionId, e) => {
    e.stopPropagation();
    setSessions((prev) => {
      const updated = prev.filter((s) => s.id !== sessionId);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (err) {
        // ignore
      }
      return updated;
    });

    if (currentSessionId === sessionId) {
      startNewChat();
    }
  };

  const clearAllHistory = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      // ignore
    }
    setSessions([]);
    startNewChat();
    showSuccess('Chat history cleared.');
  };

  // ── Send Message Routine ──────────────────────────────────────────────────
  const sendMessage = async (customText = null) => {
    const text = (customText ?? draft).trim();
    if (!text || loading) return;

    // Determine initial active agent cue from prompt keywords
    const lowerText = text.toLowerCase();
    if (lowerText.includes('stock') || lowerText.includes('inventory')) setActiveAgent('inventory');
    else if (lowerText.includes('worker') || lowerText.includes('attendance') || lowerText.includes('staff')) setActiveAgent('worker');
    else if (lowerText.includes('expense')) setActiveAgent('expense');
    else if (lowerText.includes('bill') || lowerText.includes('receipt')) setActiveAgent('billing');
    else if (lowerText.includes('sales') || lowerText.includes('revenue') || lowerText.includes('profit')) setActiveAgent('analytics');
    else setActiveAgent('orchestrator');

    const userMsg = {
      id: `user_${Date.now()}`,
      role: 'user',
      text: text,
      timestamp: new Date().toISOString()
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customText) setDraft('');
    setLoading(true);
    setCurrentStatus('Understanding your request...');

    try {
      const history = messages
        .filter((m) => m.id !== 'welcome')
        .slice(-8)
        .map((m) => ({
          role: m.role,
          content: typeof m.text === 'object' ? JSON.stringify(m.text) : m.text
        }));

      await agentsAPI.sendMessageStream(
        text,
        history,
        (statusLabel) => {
          setCurrentStatus(statusLabel);
        },
        (finalPayload) => {
          const rawResponse = finalPayload.response;
          const agentName = finalPayload.agent || finalPayload.response?.agent_name || 'orchestrator';

          const assistantMsg = {
            id: `asst_${Date.now()}`,
            role: 'assistant',
            agent: agentName,
            text: rawResponse,
            data: finalPayload.data || finalPayload.response?.data || null,
            steps: finalPayload.steps || finalPayload.response?.steps || [],
            pending_actions: finalPayload.pending_actions || finalPayload.response?.pending_actions || [],
            input_tokens: finalPayload.input_tokens || finalPayload.response?.input_tokens || 0,
            output_tokens: finalPayload.output_tokens || finalPayload.response?.output_tokens || 0,
            estimated_cost: finalPayload.estimated_cost ?? finalPayload.response?.estimated_cost_usd ?? 0.0,
            fast_path: finalPayload.fast_path ?? finalPayload.response?.fast_path ?? false,
            timestamp: new Date().toISOString()
          };

          setMessages((prev) => [...prev, assistantMsg]);
          setCurrentStatus(null);
          setLoading(false);
          loadTodayUsage();
        },
        (error) => {
          console.error('Agent chat stream error:', error);
          const errText = error.message || 'Failed to reach AI assistant.';
          showError(errText);
          setMessages((prev) => [
            ...prev,
            {
              id: `err_${Date.now()}`,
              role: 'assistant',
              agent: 'system',
              text: JSON.stringify({
                title: { icon: 'alert_critical', text: 'Error Reaching Assistant' },
                sections: [
                  {
                    type: 'insight_block',
                    icon: 'alert_critical',
                    heading: 'Connection Failed',
                    body: `${errText}. Please check your API key in Settings > AI Agents.`
                  }
                ],
                meta: { status: 'critical', statusIcon: 'status_critical' }
              }),
              isError: true,
              timestamp: new Date().toISOString()
            }
          ]);
          setCurrentStatus(null);
          setLoading(false);
        }
      );
    } catch (err) {
      console.error('Agent chat error:', err);
      setCurrentStatus(null);
      setLoading(false);
    }
  };

  const handleApproveAction = async (actionId) => {
    setActionStatuses((prev) => ({ ...prev, [actionId]: 'approving' }));
    try {
      const res = await agentsAPI.approveAction(actionId);
      setActionStatuses((prev) => ({ ...prev, [actionId]: 'approved' }));
      showSuccess(res.message || 'Action executed successfully.');
      setMessages((prev) => [
        ...prev,
        {
          id: `action_approved_${actionId}`,
          role: 'assistant',
          agent: 'system',
          text: JSON.stringify({
            title: { icon: 'alert_success', text: 'Action Confirmed & Executed' },
            sections: [
              {
                type: 'insight_block',
                icon: 'alert_success',
                heading: 'Database Updated',
                body: res.message || 'Database changes applied with full audit verification.'
              }
            ],
            meta: { status: 'normal', statusIcon: 'status_normal' }
          }),
          timestamp: new Date().toISOString()
        }
      ]);
      loadTodayUsage();
    } catch (err) {
      console.error('Action approval failed:', err);
      const errText = err.response?.data?.error || 'Failed to approve action.';
      showError(errText);
      setActionStatuses((prev) => ({ ...prev, [actionId]: 'failed' }));
    }
  };

  const handleRejectAction = async (actionId) => {
    setActionStatuses((prev) => ({ ...prev, [actionId]: 'rejecting' }));
    try {
      const res = await agentsAPI.rejectAction(actionId);
      setActionStatuses((prev) => ({ ...prev, [actionId]: 'rejected' }));
      showSuccess('Action proposal rejected.');
      setMessages((prev) => [
        ...prev,
        {
          id: `action_rejected_${actionId}`,
          role: 'assistant',
          agent: 'system',
          text: JSON.stringify({
            title: { icon: 'alert_warning', text: 'Action Discarded' },
            sections: [
              {
                type: 'insight_block',
                icon: 'alert_warning',
                heading: 'Proposal Cancelled',
                body: res.message || 'Action proposal was cancelled without database changes.'
              }
            ],
            meta: { status: 'warning', statusIcon: 'status_warning' }
          }),
          timestamp: new Date().toISOString()
        }
      ]);
    } catch (err) {
      console.error('Action rejection failed:', err);
      const errText = err.response?.data?.error || 'Failed to reject action.';
      showError(errText);
      setActionStatuses((prev) => ({ ...prev, [actionId]: 'failed' }));
    }
  };

  const handleUndoAction = async (actionId) => {
    setActionStatuses((prev) => ({ ...prev, [actionId]: 'restoring' }));
    try {
      const res = await agentsAPI.undoAction(actionId);
      setActionStatuses((prev) => ({ ...prev, [actionId]: 'restored' }));
      showSuccess(res.message || 'Action restored successfully.');
      setMessages((prev) => [
        ...prev,
        {
          id: `action_restored_${actionId}`,
          role: 'assistant',
          agent: 'system',
          text: JSON.stringify({
            title: { icon: 'alert_success', text: 'Action Undone & Restored' },
            sections: [
              {
                type: 'insight_block',
                icon: 'alert_success',
                heading: 'Record Restored from Undo Window',
                body: res.message || 'The deleted record(s) have been fully restored to your store database.'
              }
            ],
            meta: { status: 'normal', statusIcon: 'status_normal' }
          }),
          timestamp: new Date().toISOString()
        }
      ]);
      loadTodayUsage();
    } catch (err) {
      console.error('Action undo failed:', err);
      const errText = err.response?.data?.error || 'Failed to restore action.';
      showError(errText);
      setActionStatuses((prev) => ({ ...prev, [actionId]: 'approved' }));
    }
  };

  const handleToggleMic = () => {
    if (!isRecording) {
      setIsRecording(true);
      showSuccess('Listening...');
      setTimeout(() => {
        setIsRecording(false);
        setDraft("What is today's total revenue and net profit?");
      }, 2000);
    } else {
      setIsRecording(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          id="infoos-assistant-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(8, 9, 13, 0.72)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            zIndex: 99999,
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsOpen(false);
          }}
        >
          <motion.div
            id="infoos-assistant-modal"
            initial={{ opacity: 0, scale: 0.98, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 10 }}
            transition={{ duration: 0.18 }}
            style={{
              width: '100%',
              maxWidth: 940,
              height: '86vh',
              maxHeight: 780,
              background: '#0F1117',
              border: '1px solid rgba(255, 255, 255, 0.09)',
              borderRadius: 18,
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.65)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              position: 'relative',
              color: '#F1F2F6'
            }}
          >
            {/* ── HEADER ─────────────────────────────────────────────────── */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 20px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                background: '#131620',
                position: 'relative',
                zIndex: 10,
              }}
            >
              {/* Left Identity */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: '#FF6B1A',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <AiCoreIcon size={18} color="#FFFFFF" />
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#FFFFFF' }}>
                      InfoOS AI
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        color: '#FF8A3D',
                        background: 'rgba(255, 107, 26, 0.12)',
                        padding: '2px 6px',
                        borderRadius: 4,
                        border: '1px solid rgba(255, 107, 26, 0.25)',
                      }}
                    >
                      COPILOT
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 1 }}>
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: '#22C55E',
                        display: 'inline-block',
                      }}
                    />
                    <span style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.45)' }}>
                      Connected to store database
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Controls: Token/Price Badge, History Toggle, New Chat, Close */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {/* Token & Price Badge */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: 6,
                    padding: '4px 8px',
                    fontFamily: "'SF Mono', 'Roboto Mono', monospace",
                    fontSize: 11,
                    color: 'rgba(255, 255, 255, 0.65)',
                    marginRight: 4,
                  }}
                  title="Today's Token and Cost Usage"
                >
                  <span>{todayTokens.toLocaleString()} tok</span>
                  <span style={{ color: 'rgba(255, 255, 255, 0.25)' }}>•</span>
                  <span>${(todayCost || 0).toFixed(4)}</span>
                </div>

                {/* Chat History Drawer Toggle Button */}
                <button
                  onClick={() => setShowHistory((s) => !s)}
                  title="Chat History"
                  style={{
                    ...ghostBtnStyle(),
                    background: showHistory ? 'rgba(255, 107, 26, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                    color: showHistory ? '#FF8A3D' : 'rgba(255, 255, 255, 0.7)',
                    borderColor: showHistory ? 'rgba(255, 107, 26, 0.3)' : 'transparent',
                    border: '1px solid',
                    width: 'auto',
                    padding: '0 10px',
                    gap: 6,
                  }}
                >
                  <HistoryIcon size={14} />
                  <span style={{ fontSize: 12, fontWeight: 500 }}>History</span>
                </button>

                {/* New Chat Button */}
                <button
                  onClick={startNewChat}
                  title="New Conversation"
                  style={{
                    ...ghostBtnStyle(),
                    width: 'auto',
                    padding: '0 10px',
                    gap: 5,
                  }}
                >
                  <PlusIcon size={13} />
                  <span style={{ fontSize: 12, fontWeight: 500 }}>New Chat</span>
                </button>

                {/* Close Button */}
                <button
                  onClick={() => setIsOpen(false)}
                  title="Close"
                  style={ghostBtnStyle()}
                >
                  <CloseIcon size={16} />
                </button>
              </div>
            </div>

            {/* ── MAIN CONTENT (CHAT CANVAS + COLLAPSIBLE HISTORY DRAWER) ── */}
            <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
              {/* History Drawer */}
              <AnimatePresence>
                {showHistory && (
                  <motion.div
                    initial={{ x: -280, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -280, opacity: 0 }}
                    transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                    style={{
                      width: 270,
                      background: '#13151F',
                      borderRight: '1px solid rgba(255, 255, 255, 0.08)',
                      display: 'flex',
                      flexDirection: 'column',
                      zIndex: 20,
                    }}
                  >
                    <div
                      style={{
                        padding: '12px 14px',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255, 255, 255, 0.7)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Past Conversations ({sessions.length})
                      </span>
                      {sessions.length > 0 && (
                        <button
                          onClick={clearAllHistory}
                          title="Clear all history"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'rgba(255, 255, 255, 0.4)',
                            fontSize: 11,
                            cursor: 'pointer',
                            padding: '2px 4px',
                          }}
                        >
                          Clear All
                        </button>
                      )}
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                      {sessions.length === 0 ? (
                        <div style={{ padding: '24px 12px', textAlign: 'center', color: 'rgba(255, 255, 255, 0.4)', fontSize: 12 }}>
                          No past conversations yet.
                        </div>
                      ) : (
                        sessions.map((s) => {
                          const isActive = s.id === currentSessionId;
                          return (
                            <div
                              key={s.id}
                              onClick={() => loadPastSession(s)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '9px 10px',
                                borderRadius: 8,
                                background: isActive ? 'rgba(255, 107, 26, 0.12)' : 'transparent',
                                border: `1px solid ${isActive ? 'rgba(255, 107, 26, 0.35)' : 'transparent'}`,
                                cursor: 'pointer',
                                marginBottom: 4,
                                transition: 'all 0.15s ease',
                              }}
                              onMouseEnter={(e) => {
                                if (!isActive) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                              }}
                              onMouseLeave={(e) => {
                                if (!isActive) e.currentTarget.style.background = 'transparent';
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                                <MessageSquareIcon size={13} color={isActive ? '#FF8A3D' : 'rgba(255, 255, 255, 0.4)'} />
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div
                                    style={{
                                      fontSize: 12.5,
                                      fontWeight: isActive ? 600 : 400,
                                      color: isActive ? '#FFFFFF' : 'rgba(255, 255, 255, 0.75)',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                    }}
                                  >
                                    {s.title}
                                  </div>
                                  <div style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.35)', marginTop: 1 }}>
                                    {formatRelativeTime(s.updatedAt)}
                                  </div>
                                </div>
                              </div>

                              <button
                                onClick={(e) => deleteSession(s.id, e)}
                                title="Delete chat"
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: 'rgba(255, 255, 255, 0.3)',
                                  cursor: 'pointer',
                                  padding: '4px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  borderRadius: 4,
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.color = '#EF4444';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.color = 'rgba(255, 255, 255, 0.3)';
                                }}
                              >
                                <TrashIcon size={12} />
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Chat Canvas */}
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  minWidth: 0,
                  background: '#0F1117',
                }}
              >
                <div
                  ref={scrollRef}
                  style={{
                    flex: 1,
                    padding: '20px 22px',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16,
                  }}
                >
                  {isOnlyWelcome ? (
                    /* Greeting State */
                    <div
                      style={{
                        margin: 'auto 0',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        textAlign: 'center',
                        padding: '16px 8px',
                      }}
                    >
                      <div
                        style={{
                          width: 46,
                          height: 46,
                          borderRadius: 12,
                          background: 'rgba(255, 107, 26, 0.12)',
                          border: '1px solid rgba(255, 107, 26, 0.3)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginBottom: 14,
                        }}
                      >
                        <AiCoreIcon size={24} color="#FF6B1A" />
                      </div>

                      <h2
                        style={{
                          fontSize: 20,
                          fontWeight: 700,
                          color: '#FFFFFF',
                          letterSpacing: '-0.01em',
                          marginBottom: 6,
                        }}
                      >
                        How can I assist your store today?
                      </h2>
                      <p
                        style={{
                          fontSize: 13.5,
                          color: 'rgba(255, 255, 255, 0.5)',
                          maxWidth: 460,
                          lineHeight: 1.5,
                          marginBottom: 22,
                        }}
                      >
                        Ask questions about sales, inventory stock, staff attendance, or expenses.
                      </p>

                      {/* 2x3 Suggestion Grid */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
                          gap: 10,
                          width: '100%',
                          maxWidth: 740,
                        }}
                      >
                        {SUGGESTIONS.map((s, idx) => (
                          <button
                            key={idx}
                            onClick={() => sendMessage(s.prompt)}
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 12,
                              padding: '12px 14px',
                              borderRadius: 10,
                              background: 'rgba(255, 255, 255, 0.025)',
                              border: '1px solid rgba(255, 255, 255, 0.08)',
                              textAlign: 'left',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                              e.currentTarget.style.borderColor = 'rgba(255, 107, 26, 0.4)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.025)';
                              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                            }}
                          >
                            <div style={{ marginTop: 2 }}>{s.icon}</div>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF' }}>{s.title}</div>
                              <div style={{ fontSize: 11.5, color: 'rgba(255, 255, 255, 0.45)', marginTop: 2 }}>{s.desc}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    messages.map((m, i) =>
                      m.role === 'user' ? (
                        <div
                          key={m.id || i}
                          style={{ display: 'flex', justifyContent: 'flex-end' }}
                        >
                          <div
                            style={{
                              background: '#1A1D28',
                              color: '#FFFFFF',
                              border: '1px solid rgba(255, 255, 255, 0.1)',
                              borderRadius: '14px 14px 2px 14px',
                              padding: '10px 16px',
                              fontSize: 14,
                              maxWidth: '80%',
                              lineHeight: 1.5,
                              wordBreak: 'break-word',
                            }}
                          >
                            {m.text}
                          </div>
                        </div>
                      ) : (
                        <ConversationMessage
                          key={m.id || i}
                          message={m}
                          actionStatuses={actionStatuses}
                          onApprove={handleApproveAction}
                          onReject={handleRejectAction}
                          onUndo={handleUndoAction}
                        />
                      )
                    )
                  )}

                  {/* ── Redesigned "AI Working" Intermediate Loading State with Skeleton Morph ── */}
                  {loading && (
                    <AiWorkingCard activeAgent={activeAgent} statusText={currentStatus} />
                  )}
                </div>

                {/* ── CLEAN PROMPT SHORTCUT ROW ──────────────────────────── */}
                <div
                  style={{
                    padding: '8px 18px',
                    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                    background: '#0C0D13',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    overflowX: 'auto',
                    scrollbarWidth: 'none',
                  }}
                >
                  {[
                    { icon: <TrendingUpIcon size={12} color="#FF6B1A" />, label: 'Sales Today', prompt: "What is today's total sales and net profit summary?" },
                    { icon: <PackageIcon size={12} color="#FB923C" />, label: 'Low Stock', prompt: 'List all inventory items currently below alert threshold' },
                    { icon: <UsersIcon size={12} color="#A78BFA" />, label: 'Attendance', prompt: 'Who is present and on duty today?' },
                    { icon: <DollarSignIcon size={12} color="#34D399" />, label: 'Expenses', prompt: 'Summarize recent operational expenses this week' },
                    { icon: <ReceiptIcon size={12} color="#38BDF8" />, label: 'Recent Bills', prompt: 'Show the 5 most recent bills created today' },
                    { icon: <StarIcon size={12} color="#FBBF24" />, label: 'Top Items', prompt: 'What are the top 5 best selling products today?' },
                  ].map((c, idx) => (
                    <button
                      key={idx}
                      onClick={() => sendMessage(c.prompt)}
                      disabled={loading}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '5px 11px',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 500,
                        background: 'rgba(255, 255, 255, 0.03)',
                        color: 'rgba(255, 255, 255, 0.7)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        cursor: loading ? 'default' : 'pointer',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (!loading) {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.07)';
                          e.currentTarget.style.color = '#FFFFFF';
                          e.currentTarget.style.borderColor = 'rgba(255, 107, 26, 0.4)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!loading) {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                          e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
                          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                        }
                      }}
                    >
                      {c.icon}
                      <span>{c.label}</span>
                    </button>
                  ))}
                </div>

                {/* ── INPUT BAR ──────────────────────────────────────────── */}
                <div style={{ padding: '8px 18px 14px', background: '#0C0D13' }}>
                  <div
                    style={{
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: 12,
                      padding: '7px 10px 7px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <input
                      ref={inputRef}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                      placeholder="Ask anything about sales, stock, staff, expenses, or bills…"
                      disabled={loading}
                      style={{
                        flex: 1,
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        fontSize: 13.5,
                        color: '#FFFFFF',
                        padding: '4px 0',
                      }}
                    />

                    {/* Mic Button */}
                    <button
                      onClick={handleToggleMic}
                      title={isRecording ? 'Stop Recording' : 'Voice Input'}
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 6,
                        border: isRecording ? '1px solid #EF4444' : 'none',
                        background: isRecording ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
                        color: isRecording ? '#EF4444' : 'rgba(255, 255, 255, 0.6)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      <MicIcon size={14} />
                    </button>

                    {/* Send Button */}
                    <button
                      onClick={() => sendMessage()}
                      disabled={loading || !draft.trim()}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        border: 'none',
                        background: draft.trim() && !loading ? '#FF6B1A' : 'rgba(255, 255, 255, 0.08)',
                        color: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: draft.trim() && !loading ? 'pointer' : 'default',
                        flexShrink: 0,
                        transition: 'background 0.15s ease',
                      }}
                    >
                      <ArrowUpIcon size={15} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ── Redesigned Intermediate Loading State Component ────────────────────────
function AiWorkingCard({ activeAgent, statusText }) {
  const meta = AGENT_META[activeAgent] || AGENT_META.orchestrator;
  const [stageIndex, setStageIndex] = useState(0);

  const stages = useMemo(() => [
    'Understanding your request…',
    'Querying live store database…',
    'Analyzing business metrics…',
    'Putting together your answer…',
  ], []);

  useEffect(() => {
    const timer = setInterval(() => {
      setStageIndex((prev) => (prev + 1) % stages.length);
    }, 1800);
    return () => clearInterval(timer);
  }, [stages.length]);

  const displayStatus = statusText || stages[stageIndex];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.2 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        maxWidth: 780,
      }}
    >
      {/* Agent Badge Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 2 }}>
        {meta.icon}
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: meta.color,
          }}
        >
          {meta.label}
        </span>
      </div>

      {/* Branded Loading Container with Skeleton Morph */}
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.035)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '2px 14px 14px 14px',
          padding: '16px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        {/* Top Processing Bar with Bouncing Dots & Pulse Core */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <motion.div
              animate={{ scale: [1, 1.1, 1], opacity: [0.8, 1, 0.8] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                width: 26,
                height: 26,
                borderRadius: 6,
                background: 'rgba(255, 107, 26, 0.15)',
                border: '1px solid rgba(255, 107, 26, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AiCoreIcon size={14} color="#FF6B1A" />
            </motion.div>

            <AnimatePresence mode="wait">
              <motion.div
                key={displayStatus}
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -3 }}
                transition={{ duration: 0.25 }}
                style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255, 255, 255, 0.85)' }}
              >
                {displayStatus}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Animated 3-dot pulse */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {[0, 0.2, 0.4].map((delay, idx) => (
              <motion.span
                key={idx}
                animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: delay }}
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: '#FF8A3D',
                  display: 'inline-block',
                }}
              />
            ))}
          </div>
        </div>

        {/* Subtle Skeleton Card Preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Skeleton Title Bar */}
          <motion.div
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              height: 14,
              width: '42%',
              background: 'rgba(255, 255, 255, 0.08)',
              borderRadius: 4,
            }}
          />

          {/* 3 Metric Card Skeletons */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 8,
            }}
          >
            {[1, 2, 3].map((_, idx) => (
              <motion.div
                key={idx}
                animate={{ opacity: [0.25, 0.55, 0.25] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut', delay: idx * 0.15 }}
                style={{
                  height: 48,
                  background: 'rgba(255, 255, 255, 0.035)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: 8,
                  padding: '8px 10px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ width: '60%', height: 8, background: 'rgba(255, 255, 255, 0.06)', borderRadius: 3 }} />
                <div style={{ width: '80%', height: 12, background: 'rgba(255, 107, 26, 0.15)', borderRadius: 3 }} />
              </motion.div>
            ))}
          </div>

          {/* Skeleton Insight Block */}
          <motion.div
            animate={{ opacity: [0.25, 0.5, 0.25] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
            style={{
              height: 52,
              background: 'rgba(255, 255, 255, 0.025)',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              borderLeft: '3px solid rgba(255, 107, 26, 0.4)',
              borderRadius: 8,
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ width: '35%', height: 9, background: 'rgba(255, 255, 255, 0.08)', borderRadius: 3 }} />
            <div style={{ width: '92%', height: 8, background: 'rgba(255, 255, 255, 0.05)', borderRadius: 3 }} />
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────
function loadSavedSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    // ignore
  }
  return [];
}

function formatRelativeTime(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const d = new Date(dateStr);
  const diffSec = Math.floor((now - d) / 1000);

  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function ghostBtnStyle() {
  return {
    height: 28,
    borderRadius: 6,
    border: 'none',
    background: 'rgba(255, 255, 255, 0.04)',
    color: 'rgba(255, 255, 255, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'all 0.15s ease',
  };
}

// ── Themed SVG Icon Selector ───────────────────────────────────────────────
export function getThemedIcon(iconName, size = 15) {
  switch (iconName) {
    case 'sales_comparison':
    case 'sales':
    case 'analytics':
      return <TrendingUpIcon size={size} color="#FF6B1A" />;
    case 'prediction':
      return <SparkleWaveIcon size={size} color="#A855F7" />;
    case 'tip':
      return <LightbulbIcon size={size} color="#FBBF24" />;
    case 'ai_review':
      return <AiCoreIcon size={size} color="#FF6B1A" />;
    case 'alert_warning':
    case 'status_warning':
    case 'warning':
    case 'not_marked':
      return <AlertTriangleIcon size={size} color="#F59E0B" />;
    case 'alert_success':
    case 'status_normal':
    case 'success':
    case 'present':
      return <CheckCircleIcon size={size} color="#10B981" />;
    case 'alert_critical':
    case 'status_critical':
    case 'critical':
      return <AlertOctagonIcon size={size} color="#EF4444" />;
    case 'inventory':
    case 'low_stock':
      return <PackageIcon size={size} color="#FB923C" />;
    case 'staff':
    case 'attendance':
    case 'worker':
      return <UsersIcon size={size} color="#A78BFA" />;
    case 'insight':
      return <CompassIcon size={size} color="#38BDF8" />;
    case 'finance':
    case 'expense':
      return <DollarSignIcon size={size} color="#34D399" />;
    case 'bill':
    case 'order':
    case 'billing':
      return <ReceiptIcon size={size} color="#38BDF8" />;
    case 'task':
    case 'reminder':
      return <CheckSquareIcon size={size} color="#EC4899" />;
    default:
      return <AiCoreIcon size={size} color="#FF6B1A" />;
  }
}

// ── Structured Conversation Message Component ──────────────────────────────
function ConversationMessage({ message, actionStatuses, onApprove, onReject, onUndo }) {
  const meta = message.agent ? (AGENT_META[message.agent] || AGENT_META.orchestrator) : null;
  const [showSteps, setShowSteps] = useState(false);
  const steps = message.steps || [];

  // Parse structured data payload or sanitize markdown into structured card schema
  const structuredData = useMemo(() => {
    return parseToStructuredSchema(message.text, message.data);
  }, [message.text, message.data]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 780 }}>
      {meta && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 2 }}>
          {meta.icon}
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: meta.color || '#A855F7',
            }}
          >
            {meta.label}
          </span>
        </div>
      )}

      {/* Tool Execution Steps Accordion */}
      {steps && steps.length > 0 && (
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.025)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: 8,
            overflow: 'hidden',
            fontSize: 11.5,
          }}
        >
          <button
            onClick={() => setShowSteps((s) => !s)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '5px 10px',
              background: 'transparent',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.6)',
              cursor: 'pointer',
              fontSize: 11.5,
              fontWeight: 500,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <ZapIcon size={11} color="#FF6B1A" />
              {steps.length} tool step{steps.length > 1 ? 's' : ''} completed
            </span>
            <ChevronDownIcon size={11} rotate={showSteps ? 180 : 0} />
          </button>
          {showSteps && (
            <div style={{ padding: '4px 10px 6px', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
              {steps.map((st, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 6,
                    padding: '2px 0',
                    color: 'rgba(255, 255, 255, 0.5)',
                    fontFamily: "'SF Mono', 'Roboto Mono', monospace",
                    fontSize: 11,
                  }}
                >
                  <span style={{ color: '#22C55E' }}>✓</span>
                  <div>
                    <span style={{ color: '#FFFFFF', fontWeight: 600 }}>{st.title}:</span>{' '}
                    <span>{st.details}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main Structured Card Component */}
      <StructuredCard data={structuredData} />

      {/* Action Approval Proposal Cards */}
      {message.pending_actions && message.pending_actions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {message.pending_actions.map((act, pIdx) => {
            const status = actionStatuses[act.action_id];
            const isApproved = status === 'approved' || status === 'restoring' || status === 'restored';

            return (
              <div
                key={act.action_id}
                style={{
                  background: isApproved ? 'rgba(34, 197, 94, 0.08)' : '#141620',
                  borderLeft: `3px solid ${isApproved ? '#22C55E' : '#FF6B1A'}`,
                  border: `1px solid ${isApproved ? 'rgba(34, 197, 94, 0.3)' : 'rgba(255, 107, 26, 0.35)'}`,
                  borderRadius: 8,
                  padding: '10px 12px',
                }}
              >
                {isApproved ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <CheckIcon size={14} color="#22C55E" />
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: '#22C55E' }}>
                        Action Confirmed: {act.diff_summary}
                      </div>
                    </div>
                    {(act.tool?.includes('delete') || act.tool?.includes('bulk') || act.action_type?.includes('delete')) && onUndo && (
                      <button
                        onClick={() => onUndo(act.action_id)}
                        disabled={status === 'restoring' || status === 'restored'}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '4px 9px',
                          borderRadius: 6,
                          background: status === 'restored' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 107, 26, 0.15)',
                          border: `1px solid ${status === 'restored' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 107, 26, 0.35)'}`,
                          color: status === 'restored' ? 'rgba(255, 255, 255, 0.5)' : '#FF8A3D',
                          fontSize: 11.5,
                          fontWeight: 600,
                          cursor: status === 'restored' || status === 'restoring' ? 'default' : 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                        title="Restore this deletion within the 48-hour recovery window"
                      >
                        <UndoIcon size={12} />
                        <span>{status === 'restoring' ? 'Restoring…' : status === 'restored' ? 'Restored' : 'Undo Deletion'}</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#FF8A3D', textTransform: 'uppercase' }}>
                        Approval Required
                      </span>
                      <span style={{ fontSize: 10.5, color: 'rgba(255, 255, 255, 0.4)', fontFamily: 'monospace' }}>
                        #{pIdx + 1}
                      </span>
                    </div>

                    <div style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF', marginBottom: 4 }}>
                      {act.diff_summary}
                    </div>

                    <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.45)', marginBottom: 8 }}>
                      Target tool: <code style={{ fontFamily: 'monospace', background: 'rgba(255,255,255,0.06)', padding: '1px 4px', borderRadius: 3 }}>{act.tool}</code>
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => onApprove(act.action_id)}
                        disabled={Boolean(status)}
                        style={{
                          flex: 1,
                          padding: '6px 12px',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          background: '#FF6B1A',
                          border: 'none',
                          color: '#FFFFFF',
                          cursor: status ? 'default' : 'pointer',
                        }}
                      >
                        {status === 'approving' ? 'Applying…' : 'Approve & Apply'}
                      </button>
                      <button
                        onClick={() => onReject(act.action_id)}
                        disabled={Boolean(status)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 500,
                          background: 'transparent',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          color: 'rgba(255, 255, 255, 0.7)',
                          cursor: status ? 'default' : 'pointer',
                        }}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Structured Card Renderer Component ─────────────────────────────────────
function StructuredCard({ data }) {
  if (!data) return null;

  const { title, sections = [], meta } = data;

  return (
    <div
      style={{
        background: 'rgba(255, 255, 255, 0.035)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '2px 14px 14px 14px',
        padding: '16px 18px',
        color: '#F1F2F6',
        fontSize: 13.5,
        lineHeight: 1.55,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {/* Card Title Header */}
      {title && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 6,
                background: 'rgba(255, 107, 26, 0.12)',
                border: '1px solid rgba(255, 107, 26, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {getThemedIcon(title.icon || 'ai_review', 14)}
            </div>
            <span style={{ fontSize: 14.5, fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.01em' }}>
              {title.text}
            </span>
          </div>

          {meta && meta.status && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {getThemedIcon(meta.statusIcon || `status_${meta.status}`, 12)}
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.03em',
                  color: meta.status === 'critical' ? '#EF4444' : meta.status === 'warning' ? '#F59E0B' : '#10B981',
                }}
              >
                {meta.status}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Sections Array */}
      {sections.map((sec, sIdx) => {
        if (!sec) return null;

        if (sec.type === 'divider') {
          return (
            <div
              key={sIdx}
              style={{
                height: 1,
                background: 'rgba(255, 255, 255, 0.07)',
                margin: '2px 0',
              }}
            />
          );
        }

        if (sec.type === 'metric_list' && Array.isArray(sec.items)) {
          return (
            <div
              key={sIdx}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                gap: 8,
              }}
            >
              {sec.items.map((item, iIdx) => (
                <div
                  key={iIdx}
                  style={{
                    background: 'rgba(255, 255, 255, 0.025)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: 8,
                    padding: '9px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255, 255, 255, 0.5)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    {item.label}
                  </div>
                  <div
                    style={{
                      fontFamily: "'SF Mono', 'Roboto Mono', monospace",
                      fontSize: 15,
                      fontWeight: 700,
                      color: item.value?.startsWith('₹') ? '#FF8A3D' : '#FFFFFF',
                      marginTop: 3,
                    }}
                  >
                    {item.value}
                  </div>
                  {item.note && (
                    <div style={{ fontSize: 10.5, color: 'rgba(255, 255, 255, 0.4)', fontStyle: 'italic', marginTop: 2 }}>
                      {item.note}
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        }

        if (sec.type === 'insight_block') {
          const isWarning = sec.icon === 'alert_warning' || sec.icon === 'alert_critical';
          return (
            <div
              key={sIdx}
              style={{
                background: isWarning ? 'rgba(245, 158, 11, 0.05)' : 'rgba(255, 107, 26, 0.04)',
                border: `1px solid ${isWarning ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255, 107, 26, 0.2)'}`,
                borderLeft: `3px solid ${isWarning ? '#F59E0B' : '#FF6B1A'}`,
                borderRadius: 8,
                padding: '12px 14px',
              }}
            >
              {sec.heading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                  {getThemedIcon(sec.icon || 'ai_review', 14)}
                  <span style={{ fontSize: 13, fontWeight: 700, color: isWarning ? '#FBBF24' : '#FFFFFF' }}>
                    {sec.heading}
                  </span>
                </div>
              )}
              <div style={{ fontSize: 13, color: 'rgba(255, 255, 255, 0.85)', lineHeight: 1.55 }}>
                {sec.body}
              </div>
            </div>
          );
        }

        if (sec.type === 'action_list' && Array.isArray(sec.items)) {
          return (
            <div
              key={sIdx}
              style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: 8,
                padding: '12px 14px',
              }}
            >
              {sec.heading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                  {getThemedIcon(sec.icon || 'tip', 14)}
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF' }}>
                    {sec.heading}
                  </span>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sec.items.map((item, aIdx) => (
                  <div key={aIdx} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <span
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 4,
                        background: 'rgba(255, 107, 26, 0.15)',
                        color: '#FF8A3D',
                        fontSize: 11,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        marginTop: 1,
                      }}
                    >
                      {aIdx + 1}
                    </span>
                    <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                      <strong style={{ color: '#FFFFFF' }}>{item.title}: </strong>
                      <span style={{ color: 'rgba(255, 255, 255, 0.8)' }}>{item.body}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        }

        if (sec.type === 'table' && Array.isArray(sec.columns) && Array.isArray(sec.rows)) {
          return (
            <div key={sIdx} style={{ margin: '4px 0', overflowX: 'auto' }}>
              {sec.heading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                  {getThemedIcon(sec.icon || 'attendance', 14)}
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF' }}>
                    {sec.heading}
                  </span>
                </div>
              )}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.12)', textAlign: 'left' }}>
                    {sec.columns.map((col, cIdx) => (
                      <th
                        key={cIdx}
                        style={{
                          padding: '6px 10px',
                          color: 'rgba(255, 255, 255, 0.5)',
                          textTransform: 'uppercase',
                          fontSize: 10.5,
                          fontWeight: 600,
                          letterSpacing: '0.04em',
                        }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sec.rows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      style={{
                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      {row.map((cell, cellIdx) => (
                        <td
                          key={cellIdx}
                          style={{
                            padding: '7px 10px',
                            color: '#FFFFFF',
                          }}
                        >
                          <TableCellRenderer cell={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}

// ── Table Cell Renderer (Supports status badge objects) ────────────────────
function TableCellRenderer({ cell }) {
  if (cell === null || cell === undefined) return '-';

  if (typeof cell === 'object') {
    const isWarn = cell.status === 'not_marked' || cell.status === 'warning' || cell.status === 'absent';
    const isSuccess = cell.status === 'present' || cell.status === 'success';

    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: '2px 8px',
          borderRadius: 4,
          background: isWarn ? 'rgba(245, 158, 11, 0.12)' : isSuccess ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.06)',
          color: isWarn ? '#F59E0B' : isSuccess ? '#10B981' : '#FFFFFF',
          border: `1px solid ${isWarn ? 'rgba(245, 158, 11, 0.3)' : isSuccess ? 'rgba(16, 185, 129, 0.3)' : 'transparent'}`,
          fontSize: 11.5,
          fontWeight: 600,
        }}
      >
        {getThemedIcon(cell.icon || (isWarn ? 'alert_warning' : isSuccess ? 'alert_success' : 'ai_review'), 12)}
        <span>{cell.text || cell.status}</span>
      </span>
    );
  }

  const str = String(cell);
  if (str.startsWith('₹') || /^\d+$/.test(str)) {
    return <span style={{ fontFamily: "'SF Mono', 'Roboto Mono', monospace", fontWeight: 600 }}>{str}</span>;
  }

  return str;
}

// ── Universal Structured Schema Parser & Markdown Sanitizer ────────────────
function parseToStructuredSchema(rawText, rawData) {
  // 1. Direct JSON data object
  if (rawData && typeof rawData === 'object' && (rawData.sections || rawData.title)) {
    return rawData;
  }

  const text = typeof rawText === 'string' ? rawText.trim() : '';

  // 2. Try JSON Parse from text (including ```json code blocks)
  const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/;
  const match = text.match(jsonBlockRegex);
  const targetJsonStr = match ? match[1].trim() : text;

  if (targetJsonStr.startsWith('{') && targetJsonStr.endsWith('}')) {
    try {
      const parsed = JSON.parse(targetJsonStr);
      if (parsed && (parsed.sections || parsed.title)) {
        return parsed;
      }
    } catch (e) {
      // ignore
    }
  }

  // 3. Fallback: Universal Markdown-to-Structured Converter
  // Strips all emojis and parses raw markdown headers/tables into the structured schema
  return sanitizeMarkdownToStructured(text);
}

function sanitizeMarkdownToStructured(rawText) {
  if (!rawText) {
    return {
      title: { icon: 'ai_review', text: 'Assistant Response' },
      sections: [],
      meta: { status: 'normal', statusIcon: 'status_normal' }
    };
  }

  // Strip all unicode emojis completely
  const cleanText = rawText
    .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]/gu, '')
    .trim();

  const lines = cleanText.split('\n').map((l) => l.trim());
  const sections = [];
  let title = { icon: 'sales_comparison', text: 'Store Data Report' };

  // Check first line for title
  if (lines.length > 0) {
    const firstLine = lines[0].replace(/^[#*•\s-]+/, '').replace(/\*\*([^*]+)\*\*/g, '$1').trim();
    if (firstLine && !firstLine.includes(':')) {
      const icon = firstLine.toLowerCase().includes('stock') ? 'inventory'
        : firstLine.toLowerCase().includes('attendance') || firstLine.toLowerCase().includes('staff') ? 'attendance'
        : firstLine.toLowerCase().includes('expense') ? 'expense'
        : 'sales_comparison';
      title = { icon, text: firstLine };
    }
  }

  let inTable = false;
  let tableCols = [];
  let tableRows = [];
  let currentMetrics = [];
  let currentInsight = null;
  let currentActions = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Check for divider
    if (line === '---' || line === '***') {
      if (currentMetrics.length > 0) {
        sections.push({ type: 'metric_list', items: [...currentMetrics] });
        currentMetrics = [];
      }
      if (currentInsight) {
        sections.push(currentInsight);
        currentInsight = null;
      }
      if (currentActions.length > 0) {
        sections.push({ type: 'action_list', icon: 'tip', heading: 'Actionable Tips', items: [...currentActions] });
        currentActions = [];
      }
      sections.push({ type: 'divider' });
      continue;
    }

    // Check for Table Row
    if (line.startsWith('|') && line.endsWith('|')) {
      const cells = line.split('|').map((c) => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      if (cells.every((c) => /^:?-+:?$/.test(c))) {
        // Separator line, ignore
        continue;
      }
      if (!inTable) {
        inTable = true;
        tableCols = cells;
      } else {
        const rowCells = cells.map((cellStr) => {
          const lower = cellStr.toLowerCase();
          if (lower.includes('not marked') || lower.includes('unmarked')) {
            return { text: 'Not Marked', status: 'not_marked', icon: 'alert_warning' };
          }
          if (lower.includes('present')) {
            return { text: 'Present', status: 'present', icon: 'alert_success' };
          }
          if (lower.includes('low stock')) {
            return { text: 'Low Stock', status: 'warning', icon: 'alert_warning' };
          }
          return cellStr.replace(/\*\*/g, '');
        });
        tableRows.push(rowCells);
      }
      continue;
    } else if (inTable) {
      inTable = false;
      if (tableCols.length > 0 && tableRows.length > 0) {
        sections.push({
          type: 'table',
          icon: title.icon,
          heading: 'Report Table',
          columns: tableCols,
          rows: tableRows,
        });
        tableCols = [];
        tableRows = [];
      }
    }

    // Check for AI Review Heading
    if (line.toLowerCase().includes('ai review') || line.toLowerCase().includes('actionable insights')) {
      if (currentMetrics.length > 0) {
        sections.push({ type: 'metric_list', items: [...currentMetrics] });
        currentMetrics = [];
      }
      currentInsight = {
        type: 'insight_block',
        icon: 'ai_review',
        heading: 'AI Review & Actionable Insights',
        body: '',
      };
      continue;
    }

    if (currentInsight) {
      currentInsight.body = currentInsight.body ? `${currentInsight.body} ${line}` : line;
      continue;
    }

    // Check for Numbered Action Items: "1. Push High-Margin: ..."
    const numMatch = line.match(/^(\d+)\.\s*\*\*?([^*:]+)\*\*?:?\s*(.*)$/);
    if (numMatch) {
      currentActions.push({
        title: numMatch[2].trim(),
        body: numMatch[3].trim(),
      });
      continue;
    }

    // Check for KPI metric lines: "• **Total Revenue:** ₹2,710.00"
    const kpiMatch = line.match(/^[•*-\s]*\*\*?([^*:]+)\*\*?:\s*(.+)$/);
    if (kpiMatch) {
      currentMetrics.push({
        label: kpiMatch[1].trim(),
        value: kpiMatch[2].trim().replace(/\*\*/g, ''),
      });
      continue;
    }
  }

  // Flush remaining blocks
  if (currentMetrics.length > 0) {
    sections.push({ type: 'metric_list', items: currentMetrics });
  }
  if (inTable && tableCols.length > 0 && tableRows.length > 0) {
    sections.push({ type: 'table', icon: title.icon, heading: 'Report Table', columns: tableCols, rows: tableRows });
  }
  if (currentActions.length > 0) {
    sections.push({ type: 'action_list', icon: 'tip', heading: 'Actionable Tips', items: currentActions });
  }
  if (currentInsight && currentInsight.body) {
    sections.push(currentInsight);
  }

  return {
    title,
    sections: sections.length > 0 ? sections : [
      {
        type: 'insight_block',
        icon: 'ai_review',
        heading: 'Store Summary',
        body: cleanText.replace(/###/g, '').replace(/---/g, '').trim(),
      }
    ],
    meta: { status: 'normal', statusIcon: 'status_normal' },
  };
}

// ── Vector SVG Components ──────────────────────────────────────────────────
export function AiCoreIcon({ size = 16, color = 'currentColor', strokeWidth = 2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 21 7 21 17 12 22 3 17 3 7" />
      <polyline points="12 2 12 12 21 7" />
      <polyline points="12 12 3 7" />
      <line x1="12" y1="12" x2="12" y2="22" />
      <circle cx="12" cy="12" r="2" fill={color} stroke="none" />
    </svg>
  );
}

function SparkleWaveIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v18" /><path d="M3 12h18" /><path d="m5.5 5.5 13 13" /><path d="m18.5 5.5-13 13" />
    </svg>
  );
}

function LightbulbIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-1 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6" /><path d="M10 22h4" />
    </svg>
  );
}

function AlertTriangleIcon({ size = 15, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function CheckCircleIcon({ size = 15, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function AlertOctagonIcon({ size = 15, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" />
      <line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function CompassIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  );
}

function CheckSquareIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 11 12 14 22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

function HistoryIcon({ size = 15, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><polyline points="12 7 12 12 15 15" />
    </svg>
  );
}

function PlusIcon({ size = 15, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function MessageSquareIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function TrendingUpIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
    </svg>
  );
}

function PackageIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m7.5 4.27 9 5.15" />
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
}

function UsersIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function DollarSignIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="2" x2="12" y2="22" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function ReceiptIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
      <path d="M8 7h8" /><path d="M8 11h8" /><path d="M8 15h5" />
    </svg>
  );
}

function StarIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function BoxIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    </svg>
  );
}

function ClockIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function CpuIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="16" height="16" x="4" y="4" rx="2" /><rect width="6" height="6" x="9" y="9" />
      <path d="M15 2v2" /><path d="M15 20v2" /><path d="M2 15h2" /><path d="M2 9h2" />
      <path d="M20 15h2" /><path d="M20 9h2" /><path d="M9 2v2" /><path d="M9 20v2" />
    </svg>
  );
}

function CloseIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
  );
}

function TrashIcon({ size = 15, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}

function ArrowUpIcon({ size = 15, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
    </svg>
  );
}

function ZapIcon({ size = 12, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function MicIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function ChevronDownIcon({ size = 14, color = 'currentColor', rotate = 0 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: `rotate(${rotate}deg)`, transition: 'transform 0.15s' }}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function CheckIcon({ size = 12, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function UndoIcon({ size = 12, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
    </svg>
  );
}

