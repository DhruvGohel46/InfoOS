import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { useAlert } from '../../context/AlertContext';
import { useTheme } from '../../context/ThemeContext';
import { agentsAPI } from '../../api/agents';
import DynamicAiMascot from '../common/DynamicAiMascot';
import { jsPDF } from 'jspdf';

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
  analytics: { label: 'Analytics Agent', icon: <TrendingUpIcon size={14} color="#FF8A3D" />, color: '#FF8A3D' },
  inventory: { label: 'Inventory Agent', icon: <PackageIcon size={14} color="#FF8A3D" />, color: '#FF8A3D' },
  worker: { label: 'Worker Agent', icon: <UsersIcon size={14} color="#FF8A3D" />, color: '#FF8A3D' },
  reminder: { label: 'Reminder Agent', icon: <ClockIcon size={14} color="#FF8A3D" />, color: '#FF8A3D' },
  billing: { label: 'Billing Agent', icon: <ReceiptIcon size={14} color="#FF8A3D" />, color: '#FF8A3D' },
  product: { label: 'Product Agent', icon: <BoxIcon size={14} color="#FF8A3D" />, color: '#FF8A3D' },
  expense: { label: 'Expense Agent', icon: <DollarSignIcon size={14} color="#FF8A3D" />, color: '#FF8A3D' },
  system: { label: 'System Agent', icon: <CpuIcon size={14} color="#CBD5E1" />, color: '#CBD5E1' },
  orchestrator: { label: 'Orchestrator', icon: <DynamicAiMascot size={15} />, color: '#FF6B1A' },
};

const SUGGESTIONS = [
  {
    icon: <TrendingUpIcon size={18} color="#FF8A3D" />,
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
    icon: <UsersIcon size={18} color="#FF8A3D" />,
    title: 'Staff On Duty',
    desc: 'Attendance status & active shifts today',
    prompt: 'Who is present, absent, or marked on duty today?'
  },
  {
    icon: <DollarSignIcon size={18} color="#FF8A3D" />,
    title: 'Recent Expenses',
    desc: 'Log of operational costs this week',
    prompt: 'Summarize recent operational expenses recorded this week'
  },
  {
    icon: <ReceiptIcon size={18} color="#FF8A3D" />,
    title: 'Recent Bills',
    desc: 'Latest customer orders & payment modes',
    prompt: 'Show the 5 most recent customer bills created today'
  },
  {
    icon: <StarIcon size={18} color="#FF8A3D" />,
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
    title: { icon: 'ai_review', text: 'Your Business AI' },
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
  const { isDark } = useTheme();
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

  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const baseDraftRef = useRef('');

  const isOnlyWelcome = useMemo(() => {
    return messages.length === 1 && messages[0].id === 'welcome';
  }, [messages]);

  // Clean up speech recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
    };
  }, []);

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
      const filtered = prev.filter((s) => s.id !== sessionId);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
      } catch (err) {}
      return filtered;
    });

    if (currentSessionId === sessionId) {
      startNewChat();
    }
  };

  const clearAllHistory = () => {
    if (window.confirm('Clear all conversation history?')) {
      setSessions([]);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {}
      startNewChat();
    }
  };

  // ── Download AI Chat as PDF Routine ──────────────────────────────────────
  const handleExportPDF = async () => {
    if (!messages || messages.length === 0 || isOnlyWelcome) {
      showError('No conversation to download yet. Ask a question first!');
      return;
    }

    try {
      const dateStr = new Date().toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      const exportFilename = `InfoOS_AI_Chat_${new Date().toISOString().split('T')[0]}.pdf`;

      // 1. Generate clean, sharp vector PDF directly
      const doc = generateChatPdfDoc({
        messages,
        dateStr,
        userRole: isAdmin ? 'Admin' : 'Operator',
      });

      // 2. Direct save in Windows Explorer with specific filename (no popup window)
      if (window.electronAPI && typeof window.electronAPI.saveFile === 'function') {
        const base64Data = doc.output('datauristring').split(',')[1];
        const res = await window.electronAPI.saveFile(exportFilename, base64Data);
        if (res?.success) {
          showSuccess(`AI chat transcript saved successfully to Windows Explorer!`);
        } else if (!res?.cancelled) {
          showError(res?.error || 'Failed to save PDF.');
        }
      } else {
        // Direct browser file download into Downloads folder with specific filename
        doc.save(exportFilename);
        showSuccess(`AI chat transcript downloaded to your Downloads folder!`);
      }
    } catch (err) {
      console.error('PDF export error:', err);
      showError('Failed to export PDF: ' + err.message);
    }
  };

  // ── Speech Recognition & Voice Input Routine ────────────────────────────
  const handleToggleMic = () => {
    if (isRecording) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
      setIsRecording(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showError('Voice recognition is not supported in this environment. Please type your query.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-IN';

      baseDraftRef.current = draft ? draft.trim() + ' ' : '';

      recognition.onstart = () => {
        setIsRecording(true);
      };

      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        if (transcript) {
          setDraft(baseDraftRef.current + transcript);
        }
      };

      recognition.onerror = (event) => {
        console.warn('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          showError('Microphone permission was denied. Please allow microphone access in system settings.');
        }
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('Failed to start voice recognition:', err);
      showError('Could not start microphone: ' + (err.message || 'Unknown error'));
      setIsRecording(false);
    }
  };

  // ── Send Message Routine ──────────────────────────────────────────────────
  const sendMessage = async (customText = null) => {
    const text = (customText || draft).trim();
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
      showSuccess(res.message || 'Action executed and verified in database.');

      const entityBadge = res.affected_entity_id ? ` (Record ID: #${res.affected_entity_id})` : '';
      const execTime = res.execution_timestamp
        ? new Date(res.execution_timestamp).toLocaleTimeString()
        : new Date().toLocaleTimeString();

      setMessages((prev) => [
        ...prev,
        {
          id: `action_approved_${actionId}`,
          role: 'assistant',
          agent: 'system',
          text: JSON.stringify({
            title: { icon: 'alert_success', text: `Action Confirmed & Executed${entityBadge}` },
            sections: [
              {
                type: 'insight_block',
                icon: 'alert_success',
                heading: 'Verified Database Commit',
                body: `${res.message || 'Action executed successfully.'} Changes committed at ${execTime} with full immutable audit record.`
              }
            ],
            meta: { status: 'normal', statusIcon: 'status_normal' }
          }),
          timestamp: new Date().toISOString()
        }
      ]);
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
    } catch (err) {
      console.error('Action undo failed:', err);
      const errText = err.response?.data?.error || 'Failed to restore action.';
      showError(errText);
      setActionStatuses((prev) => ({ ...prev, [actionId]: 'approved' }));
    }
  };

  return (
    <AnimatePresence>
      {isOpen && isAdmin && (
        <div
          id="infoos-assistant-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: isDark ? 'rgba(8, 9, 13, 0.72)' : 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4px',
            zIndex: 99999,
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsOpen(false);
          }}
        >
          <motion.div
            id="infoos-assistant-modal"
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            style={{
              width: '82vw',
              maxWidth: 960,
              height: '88vh',
              maxHeight: '88vh',
              background: isDark ? 'linear-gradient(165deg, #11141F 0%, #0B0D14 100%)' : '#FFFFFF',
              border: isDark ? '1px solid rgba(255, 255, 255, 0.11)' : '1px solid #CBD5E1',
              borderRadius: 24,
              boxShadow: isDark
                ? '0 36px 95px -10px rgba(0, 0, 0, 0.85), 0 0 1px 1px rgba(255, 255, 255, 0.09), inset 0 1px 0 rgba(255, 255, 255, 0.16)'
                : '0 32px 80px -10px rgba(15, 23, 42, 0.22), 0 0 0 1px rgba(203, 213, 225, 0.6)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              position: 'relative',
              color: isDark ? '#F8FAFC' : '#0F172A',
            }}
          >
            {/* Soft Ambient Velvet Glow Underlays */}
            {isDark && (
              <>
                <div
                  style={{
                    position: 'absolute',
                    top: -100,
                    left: '25%',
                    width: 600,
                    height: 300,
                    background: 'radial-gradient(circle, rgba(255, 107, 26, 0.09) 0%, transparent 70%)',
                    pointerEvents: 'none',
                    zIndex: 0,
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    bottom: -100,
                    right: '10%',
                    width: 500,
                    height: 300,
                    background: 'radial-gradient(circle, rgba(56, 189, 248, 0.05) 0%, transparent 70%)',
                    pointerEvents: 'none',
                    zIndex: 0,
                  }}
                />
              </>
            )}

            {/* ── HEADER ─────────────────────────────────────────────────── */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 26px',
                borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #E2E8F0',
                background: isDark ? 'rgba(16, 20, 30, 0.85)' : '#F8FAFC',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                position: 'relative',
                zIndex: 10,
              }}
            >
              {/* Left Identity */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <DynamicAiMascot
                  size={38}
                  state={loading ? 'thinking' : isRecording ? 'listening' : 'idle'}
                  glow={loading || isRecording}
                  style={{ marginRight: 2 }}
                />

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span style={{ fontSize: 16, fontWeight: 750, color: isDark ? '#FFFFFF' : '#0F172A', letterSpacing: '-0.01em' }}>
                      Your Business AI
                    </span>
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color: '#FF8A3D',
                        background: isDark ? 'rgba(255, 107, 26, 0.14)' : '#FFF7ED',
                        padding: '2px 8px',
                        borderRadius: 6,
                        border: isDark ? '1px solid rgba(255, 107, 26, 0.3)' : '1px solid #FDBA74',
                      }}
                    >
                      ENTERPRISE COPILOT
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Controls: History Toggle, New Chat, Close */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Chat History Drawer Toggle Button */}
                <button
                  onClick={() => setShowHistory((s) => !s)}
                  title="Chat History"
                  style={{
                    background: showHistory
                      ? (isDark ? 'rgba(255, 107, 26, 0.15)' : '#FFF7ED')
                      : (isDark ? 'rgba(255, 255, 255, 0.04)' : '#FFFFFF'),
                    color: showHistory ? '#FF8A3D' : (isDark ? 'rgba(255, 255, 255, 0.85)' : '#334155'),
                    border: `1px solid ${showHistory ? (isDark ? 'rgba(255, 107, 26, 0.35)' : '#FF8A00') : (isDark ? 'rgba(255, 255, 255, 0.09)' : '#CBD5E1')}`,
                    borderRadius: 10,
                    padding: '0 12px',
                    height: 36,
                    display: 'inline-flex',
                    alignItems: 'center',
                    cursor: 'pointer',
                    gap: 7,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <HistoryIcon size={14} color={showHistory ? '#FF8A3D' : (isDark ? 'currentColor' : '#64748B')} />
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>History</span>
                </button>

                {/* New Chat Button */}
                <button
                  onClick={startNewChat}
                  title="New Conversation"
                  style={{
                    background: isDark ? 'rgba(255, 255, 255, 0.04)' : '#FFFFFF',
                    border: isDark ? '1px solid rgba(255, 255, 255, 0.09)' : '1px solid #CBD5E1',
                    color: isDark ? 'rgba(255, 255, 255, 0.85)' : '#334155',
                    borderRadius: 10,
                    padding: '0 12px',
                    height: 36,
                    display: 'inline-flex',
                    alignItems: 'center',
                    cursor: 'pointer',
                    gap: 6,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <PlusIcon size={14} color={isDark ? 'currentColor' : '#64748B'} />
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>New Chat</span>
                </button>

                {/* Download PDF Button */}
                <button
                  onClick={handleExportPDF}
                  title="Download Conversation as PDF"
                  style={{
                    background: isDark ? 'rgba(255, 255, 255, 0.04)' : '#FFFFFF',
                    border: isDark ? '1px solid rgba(255, 255, 255, 0.09)' : '1px solid #CBD5E1',
                    color: isDark ? 'rgba(255, 255, 255, 0.85)' : '#334155',
                    borderRadius: 10,
                    padding: '0 12px',
                    height: 36,
                    display: 'inline-flex',
                    alignItems: 'center',
                    cursor: 'pointer',
                    gap: 6,
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#FF8A3D';
                    e.currentTarget.style.color = '#FF8A3D';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = isDark ? 'rgba(255, 255, 255, 0.09)' : '#CBD5E1';
                    e.currentTarget.style.color = isDark ? 'rgba(255, 255, 255, 0.85)' : '#334155';
                  }}
                >
                  <DownloadIcon size={14} color="currentColor" />
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>PDF</span>
                </button>

                {/* Close Button */}
                <button
                  onClick={() => setIsOpen(false)}
                  title="Close (Esc)"
                  style={{
                    width: 36,
                    height: 36,
                    minWidth: 36,
                    borderRadius: 10,
                    background: isDark ? 'rgba(255, 255, 255, 0.04)' : '#FFFFFF',
                    border: isDark ? '1px solid rgba(255, 255, 255, 0.09)' : '1px solid #CBD5E1',
                    color: isDark ? 'rgba(255, 255, 255, 0.75)' : '#64748B',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    padding: 0,
                    boxShadow: isDark ? 'none' : '0 1px 3px rgba(15, 23, 42, 0.04)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = isDark ? 'rgba(239, 68, 68, 0.14)' : '#FEE2E2';
                    e.currentTarget.style.borderColor = isDark ? 'rgba(239, 68, 68, 0.3)' : '#FCA5A5';
                    e.currentTarget.style.color = '#EF4444';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = isDark ? 'rgba(255, 255, 255, 0.04)' : '#FFFFFF';
                    e.currentTarget.style.borderColor = isDark ? 'rgba(255, 255, 255, 0.09)' : '#CBD5E1';
                    e.currentTarget.style.color = isDark ? 'rgba(255, 255, 255, 0.75)' : '#64748B';
                  }}
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
                      background: isDark ? '#13151F' : '#F8FAFC',
                      borderRight: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #E2E8F0',
                      display: 'flex',
                      flexDirection: 'column',
                      zIndex: 20,
                    }}
                  >
                    <div
                      style={{
                        padding: '12px 14px',
                        borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid #E2E8F0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 700, color: isDark ? 'rgba(255, 255, 255, 0.7)' : '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Past Conversations ({sessions.length})
                      </span>
                      {sessions.length > 0 && (
                        <button
                          onClick={clearAllHistory}
                          title="Clear all history"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: isDark ? 'rgba(255, 255, 255, 0.4)' : '#94A3B8',
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
                        <div style={{ padding: '24px 12px', textAlign: 'center', color: isDark ? 'rgba(255, 255, 255, 0.4)' : '#94A3B8', fontSize: 12 }}>
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
                                background: isActive
                                  ? (isDark ? 'rgba(255, 107, 26, 0.12)' : '#FFF7ED')
                                  : (isDark ? 'transparent' : '#FFFFFF'),
                                border: `1px solid ${
                                  isActive
                                    ? (isDark ? 'rgba(255, 107, 26, 0.35)' : '#FDBA74')
                                    : (isDark ? 'transparent' : '#E2E8F0')
                                }`,
                                cursor: 'pointer',
                                marginBottom: 4,
                                transition: 'all 0.15s ease',
                                boxShadow: isDark ? 'none' : '0 1px 2px rgba(15, 23, 42, 0.03)',
                              }}
                              onMouseEnter={(e) => {
                                if (!isActive) e.currentTarget.style.background = isDark ? 'rgba(255, 255, 255, 0.04)' : '#F1F5F9';
                              }}
                              onMouseLeave={(e) => {
                                if (!isActive) e.currentTarget.style.background = isDark ? 'transparent' : '#FFFFFF';
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                                <MessageSquareIcon size={13} color={isActive ? '#FF8A3D' : (isDark ? 'rgba(255, 255, 255, 0.4)' : '#94A3B8')} />
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div
                                    style={{
                                      fontSize: 12.5,
                                      fontWeight: isActive ? 600 : 400,
                                      color: isActive ? (isDark ? '#FFFFFF' : '#C2410C') : (isDark ? 'rgba(255, 255, 255, 0.75)' : '#0F172A'),
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                    }}
                                  >
                                    {s.title}
                                  </div>
                                  <div style={{ fontSize: 10, color: isDark ? 'rgba(255, 255, 255, 0.35)' : '#94A3B8', marginTop: 1 }}>
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
                                  color: isDark ? 'rgba(255, 255, 255, 0.3)' : '#94A3B8',
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
                                  e.currentTarget.style.color = isDark ? 'rgba(255, 255, 255, 0.3)' : '#94A3B8';
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
                  background: isDark ? '#0F1117' : '#F1F5F9',
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
                        padding: '24px 16px',
                        position: 'relative',
                        zIndex: 1,
                      }}
                    >
                      {/* Hero Mascot with Soft Velvet Aura */}
                      <div
                        style={{
                          marginBottom: 16,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          position: 'relative',
                        }}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            width: 140,
                            height: 140,
                            borderRadius: '50%',
                            background: isDark
                              ? 'radial-gradient(circle, rgba(255, 107, 26, 0.18) 0%, rgba(255, 107, 26, 0.03) 65%, transparent 100%)'
                              : 'radial-gradient(circle, rgba(255, 107, 26, 0.12) 0%, transparent 70%)',
                            filter: 'blur(8px)',
                            pointerEvents: 'none',
                          }}
                        />
                        <DynamicAiMascot size={88} state="idle" glow={true} />
                      </div>

                      <h2
                        style={{
                          fontSize: 24,
                          fontWeight: 800,
                          color: isDark ? '#FFFFFF' : '#0F172A',
                          letterSpacing: '-0.02em',
                          marginBottom: 8,
                        }}
                      >
                        Enterprise Store Intelligence
                      </h2>
                      <p
                        style={{
                          fontSize: 14,
                          color: isDark ? 'rgba(255, 255, 255, 0.65)' : '#64748B',
                          maxWidth: 580,
                          lineHeight: 1.55,
                          marginBottom: 26,
                        }}
                      >
                        Real-time automated analytics, inventory audits, workforce shifts & financial billing intelligence across 10,000+ daily orders.
                      </p>

                      {/* 3x2 Luxury Suggestion Grid */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                          gap: 14,
                          width: '100%',
                          maxWidth: 960,
                        }}
                      >
                        {SUGGESTIONS.map((s, idx) => (
                          <button
                            key={idx}
                            onClick={() => sendMessage(s.prompt)}
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 14,
                              padding: '16px 18px',
                              borderRadius: 16,
                              background: isDark ? 'rgba(255, 255, 255, 0.035)' : '#FFFFFF',
                              border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #CBD5E1',
                              backdropFilter: 'blur(10px)',
                              WebkitBackdropFilter: 'blur(10px)',
                              textAlign: 'left',
                              cursor: 'pointer',
                              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                              boxShadow: isDark ? '0 4px 16px rgba(0, 0, 0, 0.15)' : '0 2px 8px rgba(15, 23, 42, 0.05)',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = isDark ? 'rgba(255, 255, 255, 0.065)' : '#F8FAFC';
                              e.currentTarget.style.borderColor = 'rgba(255, 107, 26, 0.45)';
                              e.currentTarget.style.transform = 'translateY(-2px)';
                              e.currentTarget.style.boxShadow = '0 8px 24px rgba(255, 107, 26, 0.15)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = isDark ? 'rgba(255, 255, 255, 0.035)' : '#FFFFFF';
                              e.currentTarget.style.borderColor = isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '#CBD5E1';
                              e.currentTarget.style.transform = 'translateY(0)';
                              e.currentTarget.style.boxShadow = isDark ? '0 4px 16px rgba(0, 0, 0, 0.15)' : '0 2px 8px rgba(15, 23, 42, 0.05)';
                            }}
                          >
                            <div
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: 10,
                                background: isDark ? 'rgba(255, 255, 255, 0.05)' : '#FFF7ED',
                                border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #FDBA74',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                marginTop: 1,
                              }}
                            >
                              {s.icon}
                            </div>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: isDark ? '#FFFFFF' : '#0F172A' }}>{s.title}</div>
                              <div style={{ fontSize: 12.5, color: isDark ? 'rgba(255, 255, 255, 0.65)' : '#64748B', marginTop: 3, lineHeight: 1.4 }}>{s.desc}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    messages.map((m, i) =>
                      m.role === 'user' ? (
                        <UserMessageBubble key={m.id || i} text={m.text} isDark={isDark} />
                      ) : (
                        <ConversationMessage
                          key={m.id || i}
                          message={m}
                          actionStatuses={actionStatuses}
                          onApprove={handleApproveAction}
                          onReject={handleRejectAction}
                          onUndo={handleUndoAction}
                          isDark={isDark}
                        />
                      )
                    )
                  )}

                  {/* ── Redesigned "AI Working" Intermediate Loading State with Skeleton Morph ── */}
                  {loading && (
                    <AiWorkingCard activeAgent={activeAgent} statusText={currentStatus} isDark={isDark} />
                  )}
                </div>

                {/* ── CLEAN PROMPT SHORTCUT ROW ──────────────────────────── */}
                <div
                  style={{
                    padding: '10px 24px',
                    borderTop: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid #E2E8F0',
                    background: isDark ? 'rgba(12, 14, 22, 0.9)' : '#F8FAFC',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    overflowX: 'auto',
                    scrollbarWidth: 'none',
                  }}
                >
                  {[
                    { icon: <TrendingUpIcon size={13} color="#FF6B1A" />, label: 'Sales Today', prompt: "What is today's total sales and net profit summary?" },
                    { icon: <PackageIcon size={13} color="#FB923C" />, label: 'Low Stock', prompt: 'List all inventory items currently below alert threshold' },
                    { icon: <UsersIcon size={13} color="#A78BFA" />, label: 'Attendance', prompt: 'Who is present and on duty today?' },
                    { icon: <DollarSignIcon size={13} color="#34D399" />, label: 'Expenses', prompt: 'Summarize recent operational expenses this week' },
                    { icon: <ReceiptIcon size={13} color="#38BDF8" />, label: 'Recent Bills', prompt: 'Show the 5 most recent bills created today' },
                    { icon: <StarIcon size={13} color="#FBBF24" />, label: 'Top Items', prompt: 'What are the top 5 best selling products today?' },
                  ].map((c, idx) => (
                    <button
                      key={idx}
                      onClick={() => sendMessage(c.prompt)}
                      disabled={loading}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 7,
                        padding: '6px 14px',
                        borderRadius: 20,
                        fontSize: 12.5,
                        fontWeight: 550,
                        background: isDark ? 'rgba(255, 255, 255, 0.04)' : '#FFFFFF',
                        color: isDark ? 'rgba(255, 255, 255, 0.85)' : '#334155',
                        border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #CBD5E1',
                        cursor: loading ? 'default' : 'pointer',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        transition: 'all 0.18s ease',
                        boxShadow: isDark ? 'none' : '0 1px 3px rgba(15, 23, 42, 0.04)',
                      }}
                      onMouseEnter={(e) => {
                        if (!loading) {
                          e.currentTarget.style.background = isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9';
                          e.currentTarget.style.color = isDark ? '#FFFFFF' : '#0F172A';
                          e.currentTarget.style.borderColor = 'rgba(255, 107, 26, 0.45)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!loading) {
                          e.currentTarget.style.background = isDark ? 'rgba(255, 255, 255, 0.04)' : '#FFFFFF';
                          e.currentTarget.style.color = isDark ? 'rgba(255, 255, 255, 0.85)' : '#334155';
                          e.currentTarget.style.borderColor = isDark ? 'rgba(255, 255, 255, 0.08)' : '#CBD5E1';
                        }
                      }}
                    >
                      {c.icon}
                      <span>{c.label}</span>
                    </button>
                  ))}
                </div>

                {/* ── INPUT BAR ──────────────────────────────────────────── */}
                <div style={{ padding: '10px 24px 18px', background: isDark ? 'rgba(12, 14, 22, 0.9)' : '#F8FAFC' }}>
                  {/* Live Voice Recording Status & Waveform Indicator */}
                  <AnimatePresence>
                    {isRecording && (
                      <motion.div
                        initial={{ opacity: 0, y: 6, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: 'auto' }}
                        exit={{ opacity: 0, y: 6, height: 0 }}
                        transition={{ duration: 0.2 }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 16px',
                          marginBottom: 10,
                          borderRadius: 14,
                          background: isDark
                            ? 'linear-gradient(90deg, rgba(239, 68, 68, 0.16) 0%, rgba(255, 107, 26, 0.16) 100%)'
                            : 'linear-gradient(90deg, #FEE2E2 0%, #FFF7ED 100%)',
                          border: isDark ? '1px solid rgba(239, 68, 68, 0.35)' : '1.5px solid #FCA5A5',
                          boxShadow: '0 4px 16px rgba(239, 68, 68, 0.12)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {/* Pulsing Red Recording Indicator */}
                          <motion.span
                            animate={{ scale: [1, 1.35, 1], opacity: [0.7, 1, 0.7] }}
                            transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
                            style={{
                              width: 9,
                              height: 9,
                              borderRadius: '50%',
                              background: '#EF4444',
                              display: 'inline-block',
                              boxShadow: '0 0 12px rgba(239, 68, 68, 0.9)',
                            }}
                          />
                          <span style={{ fontSize: 13, fontWeight: 750, color: isDark ? '#FFFFFF' : '#0F172A' }}>
                            Listening to microphone… Speak now
                          </span>
                        </div>

                        {/* Live Bouncing Audio Waveform Bars */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 22 }}>
                          {[0.4, 0.85, 0.5, 1.25, 0.7, 1.4, 0.65, 1.1, 0.5, 0.9, 0.4].map((scale, i) => (
                            <motion.span
                              key={i}
                              animate={{
                                height: [4, 18 * scale, 6, 22 * scale, 4],
                                backgroundColor: ['#EF4444', '#FF6B1A', '#EF4444'],
                              }}
                              transition={{
                                duration: 0.75 + (i % 4) * 0.15,
                                repeat: Infinity,
                                ease: 'easeInOut',
                                delay: i * 0.06,
                              }}
                              style={{
                                width: 3.5,
                                borderRadius: 3,
                                background: '#EF4444',
                                display: 'inline-block',
                              }}
                            />
                          ))}
                        </div>

                        {/* Done Button */}
                        <button
                          onClick={handleToggleMic}
                          style={{
                            padding: '4px 12px',
                            borderRadius: 8,
                            background: '#EF4444',
                            border: 'none',
                            color: '#FFFFFF',
                            fontSize: 12,
                            fontWeight: 750,
                            cursor: 'pointer',
                            boxShadow: '0 2px 8px rgba(239, 68, 68, 0.3)',
                          }}
                        >
                          Done
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div
                    style={{
                      background: isDark ? 'rgba(255, 255, 255, 0.045)' : '#FFFFFF',
                      border: isRecording
                        ? '1.5px solid #EF4444'
                        : (isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1.5px solid #CBD5E1'),
                      borderRadius: 16,
                      padding: '8px 10px 8px 18px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      boxShadow: isRecording
                        ? '0 0 16px rgba(239, 68, 68, 0.2)'
                        : (isDark ? '0 6px 20px rgba(0, 0, 0, 0.25)' : '0 2px 8px rgba(15, 23, 42, 0.05)'),
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <input
                      ref={inputRef}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                      placeholder={isRecording ? 'Transcribing your voice in real-time…' : 'Ask anything about sales, stock, staff, expenses, or bills…'}
                      disabled={loading}
                      style={{
                        flex: 1,
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        fontSize: 14,
                        color: isDark ? '#FFFFFF' : '#0F172A',
                        padding: '4px 0',
                      }}
                    />

                    {/* Mic Button with Live Pulsing Animation */}
                    <motion.button
                      onClick={handleToggleMic}
                      title={isRecording ? 'Stop Recording' : 'Voice Input'}
                      animate={isRecording ? { scale: [1, 1.1, 1] } : {}}
                      transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 10,
                        border: isRecording ? '1.5px solid #EF4444' : (isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #CBD5E1'),
                        background: isRecording ? '#EF4444' : (isDark ? 'rgba(255, 255, 255, 0.04)' : '#F1F5F9'),
                        color: isRecording ? '#FFFFFF' : (isDark ? 'rgba(255, 255, 255, 0.75)' : '#475569'),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        flexShrink: 0,
                        transition: 'all 0.15s ease',
                        boxShadow: isRecording ? '0 0 12px rgba(239, 68, 68, 0.6)' : 'none',
                      }}
                    >
                      <MicIcon size={16} color={isRecording ? '#FFFFFF' : 'currentColor'} />
                    </motion.button>

                    {/* Send Button */}
                    <button
                      onClick={() => sendMessage()}
                      disabled={loading || !draft.trim()}
                      title="Send Message"
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 10,
                        background: draft.trim() && !loading
                          ? 'linear-gradient(135deg, #FF6B1A 0%, #FF8A3D 100%)'
                          : (isDark ? 'rgba(255, 255, 255, 0.06)' : '#E2E8F0'),
                        border: 'none',
                        color: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: draft.trim() && !loading ? 'pointer' : 'default',
                        flexShrink: 0,
                        transition: 'all 0.18s ease',
                        boxShadow: draft.trim() && !loading ? '0 2px 10px rgba(255, 107, 26, 0.35)' : 'none',
                      }}
                    >
                      <ArrowUpIcon size={15} color={draft.trim() && !loading ? '#FFFFFF' : (isDark ? 'rgba(255,255,255,0.3)' : '#94A3B8')} />
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
function AiWorkingCard({ activeAgent, statusText, isDark = true }) {
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
        width: '100%',
        maxWidth: 780,
        position: 'relative',
      }}
    >
      {/* ── Mountain Hill Top Crest Tab (Seamlessly Merged with Card) ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          width: '100%',
          marginBottom: -1,
          position: 'relative',
          zIndex: 10,
        }}
      >
        {/* The Mountain Peak Tab (Agent Badge + Live Thinking Indicator) */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: isDark
              ? 'linear-gradient(180deg, rgba(255, 107, 26, 0.22) 0%, #151926 100%)'
              : 'linear-gradient(180deg, #FFF7ED 0%, #FFFFFF 100%)',
            border: isDark ? '1px solid rgba(255, 107, 26, 0.35)' : '1.5px solid #CBD5E1',
            borderBottom: isDark ? '1px solid #151926' : '1.5px solid #FFFFFF',
            borderRadius: '16px 16px 0 0',
            padding: '7px 18px 8px 14px',
            boxShadow: isDark ? '0 -4px 16px rgba(255, 107, 26, 0.14)' : '0 -2px 8px rgba(15, 23, 42, 0.04)',
          }}
        >
          {meta.icon ? (
            meta.icon
          ) : (
            <DynamicAiMascot size={16} state="thinking" />
          )}
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: meta.color || '#FF8A3D',
            }}
          >
            {meta.label || 'ORCHESTRATOR'}
          </span>

          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              background: isDark ? 'rgba(255, 107, 26, 0.15)' : '#FFF7ED',
              border: isDark ? '1px solid rgba(255, 107, 26, 0.3)' : '1px solid #FDBA74',
              borderRadius: 10,
              padding: '2px 7px',
              fontSize: 10,
              fontWeight: 700,
              color: '#FF6B1A',
              marginLeft: 4,
            }}
          >
            <motion.span
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: '#FF6B1A',
                display: 'inline-block',
              }}
            />
            PROCESSING
          </span>
        </div>
      </div>

      {/* Main Unified Mountain Hill Card Body */}
      <div
        style={{
          background: isDark ? '#151926' : '#FFFFFF',
          border: isDark ? '1px solid rgba(255, 107, 26, 0.35)' : '1.5px solid #CBD5E1',
          borderRadius: '0 20px 20px 20px',
          padding: '18px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          boxShadow: isDark
            ? '0 12px 36px rgba(0, 0, 0, 0.35), 0 0 20px rgba(255, 107, 26, 0.06)'
            : '0 4px 16px rgba(15, 23, 42, 0.06)',
          position: 'relative',
        }}
      >
        {/* Top Processing Bar with Bouncing Dots & Pulse Core */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 28,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <DynamicAiMascot size={26} state="thinking" glow={true} />
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={displayStatus}
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -3 }}
                transition={{ duration: 0.25 }}
                style={{ fontSize: 13.5, fontWeight: 600, color: isDark ? '#F8FAFC' : '#0F172A' }}
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
              background: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0',
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
                  background: isDark ? 'rgba(255, 255, 255, 0.035)' : '#F8FAFC',
                  border: isDark ? '1px solid rgba(255, 255, 255, 0.05)' : '1px solid #E2E8F0',
                  borderRadius: 8,
                  padding: '8px 10px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ width: '60%', height: 8, background: isDark ? 'rgba(255, 255, 255, 0.06)' : '#E2E8F0', borderRadius: 3 }} />
                <div style={{ width: '80%', height: 12, background: isDark ? 'rgba(255, 107, 26, 0.15)' : 'rgba(255, 107, 26, 0.12)', borderRadius: 3 }} />
              </motion.div>
            ))}
          </div>

          {/* Skeleton Insight Block */}
          <motion.div
            animate={{ opacity: [0.25, 0.5, 0.25] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
            style={{
              height: 52,
              background: isDark ? 'rgba(255, 255, 255, 0.025)' : '#FFF7ED',
              border: isDark ? '1px solid rgba(255, 255, 255, 0.05)' : '1px solid #FDBA74',
              borderLeft: '3px solid #FF8A3D',
              borderRadius: 8,
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ width: '35%', height: 9, background: isDark ? 'rgba(255, 255, 255, 0.08)' : '#FDBA74', borderRadius: 3 }} />
            <div style={{ width: '92%', height: 8, background: isDark ? 'rgba(255, 255, 255, 0.05)' : '#E2E8F0', borderRadius: 3 }} />
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


// ── Themed SVG Icon Selector ───────────────────────────────────────────────
export function getThemedIcon(iconName, size = 15) {
  switch (iconName) {
    case 'sales_comparison':
    case 'sales':
    case 'analytics':
      return <TrendingUpIcon size={size} color="#FF8A3D" />;
    case 'prediction':
      return <SparkleWaveIcon size={size} color="#FF8A3D" />;
    case 'tip':
      return <LightbulbIcon size={size} color="#FF8A3D" />;
    case 'ai_review':
      return <AiCoreIcon size={size} color="#FF6B1A" />;
    case 'alert_warning':
    case 'status_warning':
    case 'warning':
    case 'not_marked':
      return <AlertTriangleIcon size={size} color="#FF8A3D" />;
    case 'alert_success':
    case 'status_normal':
    case 'success':
    case 'present':
      return <CheckCircleIcon size={size} color="#FF8A3D" />;
    case 'alert_critical':
    case 'status_critical':
    case 'critical':
      return <AlertOctagonIcon size={size} color="#EF4444" />;
    case 'inventory':
    case 'low_stock':
      return <PackageIcon size={size} color="#FF8A3D" />;
    case 'staff':
    case 'attendance':
    case 'worker':
      return <UsersIcon size={size} color="#FF8A3D" />;
    case 'insight':
      return <CompassIcon size={size} color="#FF8A3D" />;
    case 'finance':
    case 'expense':
      return <DollarSignIcon size={size} color="#FF8A3D" />;
    case 'bill':
    case 'order':
    case 'billing':
      return <ReceiptIcon size={size} color="#FF8A3D" />;
    case 'task':
    case 'reminder':
      return <CheckSquareIcon size={size} color="#FF8A3D" />;
    default:
      return <DynamicAiMascot size={size} />;
  }
}

// ── User Message Bubble with Copy Feature ──────────────────────────────
function UserMessageBubble({ text, isDark = true }) {
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);

  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{ display: 'flex', justifyContent: 'flex-end', position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        style={{
          background: isDark ? '#1A1D28' : '#FFFFFF',
          color: isDark ? '#FFFFFF' : '#0F172A',
          border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1.5px solid #CBD5E1',
          borderRadius: '14px 14px 2px 14px',
          padding: '10px 16px',
          fontSize: 14,
          maxWidth: '80%',
          lineHeight: 1.5,
          wordBreak: 'break-word',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          boxShadow: isDark ? '0 4px 14px rgba(0, 0, 0, 0.25)' : '0 2px 6px rgba(15, 23, 42, 0.05)',
        }}
      >
        <span style={{ flex: 1 }}>{text}</span>
        <button
          onClick={handleCopy}
          title={copied ? 'Copied query to clipboard!' : 'Copy user query'}
          style={{
            background: copied
              ? (isDark ? 'rgba(34, 197, 94, 0.18)' : '#DCFCE7')
              : (isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9'),
            border: `1px solid ${
              copied
                ? (isDark ? 'rgba(34, 197, 94, 0.4)' : '#86EFAC')
                : (isDark ? 'rgba(255, 255, 255, 0.12)' : '#CBD5E1')
            }`,
            borderRadius: 6,
            padding: '3px 7px',
            color: copied ? (isDark ? '#4ADE80' : '#16A34A') : (isDark ? 'rgba(255, 255, 255, 0.75)' : '#64748B'),
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            fontWeight: 600,
            transition: 'all 0.15s ease',
            opacity: hovered || copied ? 1 : 0.6,
            flexShrink: 0,
            marginTop: 1,
          }}
        >
          {copied ? <CheckIcon size={12} color={isDark ? '#4ADE80' : '#16A34A'} /> : <CopyIcon size={12} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
    </div>
  );
}

// ── Plaintext Formatter for Assistant Response Copying ──────────────────────
function formatAssistantTextForCopy(structuredData, rawText) {
  if (!structuredData) return rawText || '';
  const lines = [];

  if (structuredData.title?.text) {
    lines.push(structuredData.title.text);
    lines.push('');
  }

  (structuredData.sections || []).forEach((sec) => {
    if (sec.type === 'metric_list' && sec.items) {
      sec.items.forEach((it) => {
        lines.push(`• ${it.label}: ${it.value}${it.note ? ` (${it.note})` : ''}`);
      });
      lines.push('');
    } else if (sec.type === 'insight_block') {
      if (sec.heading) lines.push(`[${sec.heading}]`);
      if (sec.body) lines.push(sec.body);
      lines.push('');
    } else if (sec.type === 'action_list' && sec.items) {
      if (sec.heading) lines.push(sec.heading);
      sec.items.forEach((it, idx) => {
        lines.push(`${idx + 1}. ${it.title}: ${it.body}`);
      });
      lines.push('');
    } else if (sec.type === 'table' && sec.columns && sec.rows) {
      if (sec.heading) lines.push(sec.heading);
      lines.push(sec.columns.join(' | '));
      sec.rows.forEach((r) => {
        const rowStr = r.map((c) => (typeof c === 'object' ? c.text || '' : String(c))).join(' | ');
        lines.push(rowStr);
      });
      lines.push('');
    }
  });

  const res = lines.join('\n').trim();
  return res || rawText || '';
}

// ── Structured Conversation Message Component ──────────────────────────────
function ConversationMessage({ message, actionStatuses, onApprove, onReject, onUndo, isDark = true }) {
  const meta = message.agent ? (AGENT_META[message.agent] || AGENT_META.orchestrator) : null;
  const [showSteps, setShowSteps] = useState(false);
  const [copied, setCopied] = useState(false);
  const steps = message.steps || [];

  // Parse structured data payload or sanitize markdown into structured card schema
  const structuredData = useMemo(() => {
    return parseToStructuredSchema(message.text, message.data);
  }, [message.text, message.data]);

  const handleCopyResponse = (e) => {
    e.stopPropagation();
    const formatted = formatAssistantTextForCopy(structuredData, message.text);
    navigator.clipboard.writeText(formatted);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 960, width: '100%' }}>
      {/* Main Structured Card Component with Integrated Mountain Hill Crest */}
      <StructuredCard
        data={structuredData}
        agentMeta={meta}
        onCopy={handleCopyResponse}
        copied={copied}
        steps={steps}
        showSteps={showSteps}
        setShowSteps={setShowSteps}
        isDark={isDark}
      />

      {/* Action Approval Proposal Cards */}
      {message.pending_actions && message.pending_actions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {message.pending_actions.map((act, pIdx) => {
            const status = actionStatuses[act.action_id];
            const isApproved = status === 'approved' || status === 'restoring' || status === 'restored';

            return (
              <div
                key={act.action_id}
                style={{
                  background: isApproved
                    ? (isDark ? 'rgba(34, 197, 94, 0.08)' : '#F0FDF4')
                    : (isDark ? 'linear-gradient(135deg, rgba(255, 107, 26, 0.08) 0%, rgba(20, 24, 35, 0.95) 100%)' : '#FFFFFF'),
                  border: `1.5px solid ${
                    isApproved
                      ? (isDark ? 'rgba(34, 197, 94, 0.35)' : '#86EFAC')
                      : (isDark ? 'rgba(255, 107, 26, 0.35)' : '#CBD5E1')
                  }`,
                  borderRadius: 16,
                  padding: '14px 18px',
                  boxShadow: isDark ? '0 4px 16px rgba(0, 0, 0, 0.2)' : '0 2px 8px rgba(15, 23, 42, 0.05)',
                }}
              >
                {isApproved ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <CheckIcon size={16} color="#22C55E" />
                      <div style={{ fontSize: 13.5, fontWeight: 650, color: '#16A34A' }}>
                        Action Confirmed: {act.diff_summary}
                      </div>
                    </div>
                    {status !== 'restored' && onUndo && (
                      <button
                        onClick={() => onUndo(act.action_id)}
                        disabled={status === 'restoring'}
                        style={{
                          background: isDark ? 'rgba(255, 255, 255, 0.05)' : '#F1F5F9',
                          border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid #CBD5E1',
                          borderRadius: 8,
                          padding: '4px 10px',
                          color: isDark ? '#CBD5E1' : '#334155',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: status === 'restoring' ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                        }}
                      >
                        <UndoIcon size={12} />
                        <span>{status === 'restoring' ? 'Restoring...' : 'Undo'}</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                            background: isDark ? 'rgba(255, 107, 26, 0.2)' : '#FFF7ED',
                            border: isDark ? 'none' : '1px solid #FDBA74',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            marginTop: 2,
                          }}
                        >
                          <ZapIcon size={14} color="#FF6B1A" />
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: isDark ? '#FFFFFF' : '#0F172A' }}>
                            Proposed Mutation: {act.tool_name}
                          </div>
                          <div style={{ fontSize: 12.5, color: isDark ? '#CBD5E1' : '#475569', marginTop: 2, lineHeight: 1.4 }}>
                            {act.diff_summary}
                          </div>
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          color: '#D97706',
                          background: isDark ? 'rgba(245, 158, 11, 0.14)' : '#FEF3C7',
                          border: isDark ? 'none' : '1px solid #FCD34D',
                          padding: '2px 8px',
                          borderRadius: 6,
                        }}
                      >
                        Requires Approval
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
                      <button
                        onClick={() => onReject && onReject(act.action_id)}
                        disabled={status === 'rejecting' || status === 'approving'}
                        style={{
                          background: isDark ? 'rgba(255, 255, 255, 0.05)' : '#F1F5F9',
                          border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid #CBD5E1',
                          borderRadius: 8,
                          padding: '6px 14px',
                          color: isDark ? '#CBD5E1' : '#475569',
                          fontSize: 12.5,
                          fontWeight: 650,
                          cursor: 'pointer',
                        }}
                      >
                        {status === 'rejecting' ? 'Rejecting...' : 'Reject'}
                      </button>
                      <button
                        onClick={() => onApprove && onApprove(act.action_id)}
                        disabled={status === 'rejecting' || status === 'approving'}
                        style={{
                          background: 'linear-gradient(135deg, #FF6B1A 0%, #FF8A3D 100%)',
                          border: 'none',
                          borderRadius: 8,
                          padding: '6px 16px',
                          color: '#FFFFFF',
                          fontSize: 12.5,
                          fontWeight: 750,
                          cursor: 'pointer',
                          boxShadow: '0 2px 10px rgba(255, 107, 26, 0.35)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <CheckIcon size={13} color="#FFFFFF" />
                        <span>{status === 'approving' ? 'Applying...' : 'Approve & Apply'}</span>
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

// ── Structured Card Renderer Component with Mountain Hill Structure ─────────
function StructuredCard({ data, agentMeta, onCopy, copied, steps = [], showSteps = false, setShowSteps, isDark = true }) {
  if (!data) return null;

  const { title, sections = [], meta } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', position: 'relative' }}>
      {/* ── Mountain Hill Top Crest Tab (Seamlessly Merged with Card) ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          width: '100%',
          marginBottom: -1,
          position: 'relative',
          zIndex: 10,
          paddingLeft: 0,
          paddingRight: 0,
        }}
      >
        {/* The Mountain Peak Tab (Agent Badge + Steps Toggle, Flush Left Edge) */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: isDark
              ? 'linear-gradient(180deg, rgba(255, 107, 26, 0.22) 0%, #151926 100%)'
              : 'linear-gradient(180deg, #FFF7ED 0%, #FFFFFF 100%)',
            border: isDark ? '1px solid rgba(255, 107, 26, 0.35)' : '1.5px solid #CBD5E1',
            borderBottom: isDark ? '1px solid #151926' : '1.5px solid #FFFFFF',
            borderRadius: '16px 16px 0 0',
            padding: '7px 18px 8px 14px',
            boxShadow: isDark ? '0 -4px 16px rgba(255, 107, 26, 0.14)' : '0 -2px 8px rgba(15, 23, 42, 0.04)',
            marginLeft: 0,
          }}
        >
          {agentMeta?.icon ? (
            agentMeta.icon
          ) : (
            <DynamicAiMascot size={16} state="idle" />
          )}
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: agentMeta?.color || '#FF8A3D',
            }}
          >
            {agentMeta?.label || 'YOUR BUSINESS AI'}
          </span>

          {/* Operational Steps Pill Toggle */}
          {steps && steps.length > 0 && (
            <button
              onClick={() => setShowSteps?.((s) => !s)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                background: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
                border: isDark ? '1px solid rgba(255, 255, 255, 0.14)' : '1px solid #CBD5E1',
                borderRadius: 12,
                padding: '2px 7px',
                color: isDark ? 'rgba(255, 255, 255, 0.85)' : '#475569',
                fontSize: 10.5,
                fontWeight: 650,
                cursor: 'pointer',
                marginLeft: 4,
              }}
            >
              <ZapIcon size={10} color="#FF6B1A" />
              <span>{steps.length} step{steps.length > 1 ? 's' : ''}</span>
              <ChevronDownIcon size={10} rotate={showSteps ? 180 : 0} />
            </button>
          )}
        </div>

        {/* Copy Response Button Docked Flush on Top Right */}
        {onCopy && (
          <button
            onClick={onCopy}
            title={copied ? 'Copied to clipboard!' : 'Copy response'}
            style={{
              background: copied
                ? (isDark ? 'linear-gradient(180deg, rgba(34, 197, 94, 0.25) 0%, #151926 100%)' : '#DCFCE7')
                : (isDark ? 'linear-gradient(180deg, rgba(255, 107, 26, 0.18) 0%, #151926 100%)' : 'linear-gradient(180deg, #FFF7ED 0%, #FFFFFF 100%)'),
              border: `1.5px solid ${copied ? (isDark ? 'rgba(34, 197, 94, 0.45)' : '#86EFAC') : (isDark ? 'rgba(255, 107, 26, 0.35)' : '#CBD5E1')}`,
              borderBottom: isDark ? '1px solid #151926' : '1.5px solid #FFFFFF',
              borderRadius: '16px 16px 0 0',
              padding: '7px 16px 8px',
              color: copied ? (isDark ? '#4ADE80' : '#16A34A') : (isDark ? 'rgba(255, 255, 255, 0.85)' : '#475569'),
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              fontWeight: 650,
              transition: 'all 0.15s ease',
              marginRight: 0,
              boxShadow: isDark ? '0 -4px 16px rgba(255, 107, 26, 0.12)' : '0 -2px 8px rgba(15, 23, 42, 0.04)',
            }}
          >
            {copied ? <CheckIcon size={12} color={isDark ? '#4ADE80' : '#16A34A'} /> : <CopyIcon size={12} color="#FF8A3D" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        )}
      </div>

      {/* ── Main Message Card Body Fused With Mountain Crest ── */}
      <div
        style={{
          background: isDark
            ? 'linear-gradient(180deg, #151926 0%, rgba(13, 16, 25, 0.98) 100%)'
            : '#FFFFFF',
          border: isDark ? '1px solid rgba(255, 107, 26, 0.35)' : '1.5px solid #CBD5E1',
          borderRadius: onCopy ? '0 0 22px 22px' : '0 18px 22px 22px', // Flush with both left peak and right copy crest
          padding: '22px 24px',
          color: isDark ? '#F8FAFC' : '#0F172A',
          fontSize: 14,
          lineHeight: 1.6,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          boxShadow: isDark
            ? '0 14px 38px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.08)'
            : '0 4px 20px -2px rgba(15, 23, 42, 0.08), 0 1px 4px rgba(15, 23, 42, 0.04)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          position: 'relative',
          zIndex: 2,
        }}
      >
        {/* Expanded Steps Drawer Inside Card */}
        {showSteps && steps && steps.length > 0 && (
          <div
            style={{
              background: isDark ? 'rgba(255, 255, 255, 0.025)' : '#F8FAFC',
              border: isDark ? '1px solid rgba(255, 255, 255, 0.07)' : '1.5px solid #E2E8F0',
              borderRadius: 14,
              padding: '10px 14px',
              fontSize: 12,
              marginBottom: 8,
            }}
          >
            <div style={{ fontSize: 11.5, fontWeight: 800, color: '#FF8A3D', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              Actions Taken ({steps.length} {steps.length === 1 ? 'step' : 'steps'})
            </div>
            {steps.map((st, idx) => {
              // Convert any technical raw tool strings into clear, friendly plain language
              let cleanTitle = st.title || 'Checked database';
              let cleanDetails = st.details || '';

              if (cleanTitle.startsWith('Executed ')) {
                const rawTool = cleanTitle.replace('Executed ', '');
                const formatted = rawTool.replace(/^propose_/, '').replace(/^get_/, '').replace(/^list_/, '').replace(/_/g, ' ');
                cleanTitle = `Checked ${formatted}`;
              }

              if (cleanDetails.includes('Queried ') || cleanDetails.includes('{')) {
                cleanDetails = cleanDetails
                  .replace(/Queried\s+[a-zA-Z0-9_]+\s*(with)?/g, 'Checked database')
                  .replace(/\{"period":\s*"([^"]+)"\}/g, 'for $1')
                  .replace(/\{"query":\s*"([^"]+)"\}/g, 'matching "$1"')
                  .replace(/\{"([^"]+)":\s*"([^"]+)"\}/g, '($1: $2)')
                  .replace(/_/g, ' ');
              }

              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    padding: '3px 0',
                    color: isDark ? 'rgba(255, 255, 255, 0.7)' : '#475569',
                    fontSize: 12,
                    lineHeight: 1.4,
                  }}
                >
                  <span style={{ color: '#22C55E', fontWeight: 800 }}>✓</span>
                  <div>
                    <span style={{ color: isDark ? '#FFFFFF' : '#0F172A', fontWeight: 700 }}>{cleanTitle}:</span>{' '}
                    <span>{cleanDetails}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Card Title Header */}
        {title && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  background: isDark ? 'rgba(255, 107, 26, 0.14)' : '#FFF7ED',
                  border: isDark ? '1px solid rgba(255, 107, 26, 0.28)' : '1px solid #FDBA74',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  boxShadow: '0 2px 8px rgba(255, 107, 26, 0.18)',
                }}
              >
                {getThemedIcon(title.icon || 'ai_review', 16)}
              </div>
              <span style={{ fontSize: 16, fontWeight: 750, color: isDark ? '#FFFFFF' : '#0F172A', letterSpacing: '-0.01em' }}>
                {title.text}
              </span>
            </div>

            {meta && meta.status && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 10px',
                  borderRadius: 20,
                  background: isDark ? 'rgba(255, 255, 255, 0.05)' : '#F1F5F9',
                  border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #CBD5E1',
                }}
              >
                {getThemedIcon(meta.statusIcon || `status_${meta.status}`, 12)}
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 750,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: meta.status === 'critical' ? (isDark ? '#F87171' : '#DC2626') : meta.status === 'warning' ? (isDark ? '#FBBF24' : '#D97706') : (isDark ? '#4ADE80' : '#16A34A'),
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
                background: isDark ? 'rgba(255, 255, 255, 0.06)' : '#E2E8F0',
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
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 12,
              }}
            >
              {sec.items.map((item, iIdx) => (
                <div
                  key={iIdx}
                  style={{
                    background: isDark
                      ? 'linear-gradient(135deg, rgba(255, 107, 26, 0.07) 0%, rgba(255, 255, 255, 0.025) 100%)'
                      : '#F8FAFC',
                    border: isDark ? '1px solid rgba(255, 107, 26, 0.18)' : '1.5px solid #E2E8F0',
                    borderRadius: 16,
                    padding: '14px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    boxShadow: isDark ? '0 4px 14px rgba(0, 0, 0, 0.12)' : '0 1px 4px rgba(15, 23, 42, 0.03)',
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 650, color: isDark ? 'rgba(255, 255, 255, 0.65)' : '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {item.label}
                  </div>
                  <div
                    style={{
                      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                      fontSize: 22,
                      fontWeight: 800,
                      color: item.value?.startsWith('₹') ? '#FF8A3D' : (isDark ? '#FFFFFF' : '#0F172A'),
                      letterSpacing: '-0.02em',
                      marginTop: 4,
                    }}
                  >
                    {item.value}
                  </div>
                  {item.note && (
                    <div style={{ fontSize: 11.5, color: isDark ? 'rgba(255, 255, 255, 0.55)' : '#64748B', marginTop: 3 }}>
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
                background: isWarning
                  ? (isDark ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(255, 255, 255, 0.02) 100%)' : '#FFFBEB')
                  : (isDark ? 'linear-gradient(135deg, rgba(255, 107, 26, 0.09) 0%, rgba(255, 255, 255, 0.02) 100%)' : '#FFF7ED'),
                border: `1.5px solid ${isWarning ? (isDark ? 'rgba(245, 158, 11, 0.3)' : '#FCD34D') : (isDark ? 'rgba(255, 107, 26, 0.28)' : '#FDBA74')}`,
                borderRadius: 16,
                padding: '16px 20px',
                boxShadow: isDark ? '0 4px 16px rgba(0, 0, 0, 0.12)' : '0 2px 8px rgba(15, 23, 42, 0.03)',
              }}
            >
              {sec.heading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 7 }}>
                  {getThemedIcon(sec.icon || 'ai_review', 16)}
                  <span style={{ fontSize: 14, fontWeight: 750, color: isWarning ? (isDark ? '#FBBF24' : '#D97706') : (isDark ? '#FFFFFF' : '#0F172A'), letterSpacing: '-0.01em' }}>
                    {sec.heading}
                  </span>
                </div>
              )}
              <div style={{ fontSize: 13.5, color: isDark ? '#E2E8F0' : '#334155', lineHeight: 1.6 }}>
                {sec.body}
              </div>
            </div>
          );
        }

        if (sec.type === 'action_list' && Array.isArray(sec.items)) {
          const validItems = sec.items.filter((item) => item && (item.title?.trim() || item.body?.trim()));
          if (validItems.length === 0) return null;

          return (
            <div
              key={sIdx}
              style={{
                margin: '4px 0',
                background: isDark ? 'rgba(255, 107, 26, 0.04)' : '#F8FAFC',
                border: isDark ? '1px solid rgba(255, 107, 26, 0.15)' : '1.5px solid #E2E8F0',
                borderRadius: 16,
                padding: '16px 20px',
              }}
            >
              {sec.heading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
                  {getThemedIcon(sec.icon || 'tip', 16)}
                  <span style={{ fontSize: 14, fontWeight: 750, color: isDark ? '#FFFFFF' : '#0F172A', letterSpacing: '-0.01em' }}>
                    {sec.heading}
                  </span>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {validItems.map((item, aIdx) => {
                  const title = item.title?.trim();
                  const body = item.body?.trim();
                  return (
                    <div key={aIdx} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <span
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #FF6B1A 0%, #FF8A3D 100%)',
                          color: '#FFFFFF',
                          fontSize: 11,
                          fontWeight: 750,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          marginTop: 2,
                          boxShadow: '0 2px 8px rgba(255, 107, 26, 0.35)',
                        }}
                      >
                        {aIdx + 1}
                      </span>
                      <div style={{ fontSize: 13, lineHeight: 1.55 }}>
                        {title && <strong style={{ color: isDark ? '#FFFFFF' : '#0F172A', fontWeight: 700 }}>{title}{body ? ': ' : ''}</strong>}
                        {body && <span style={{ color: isDark ? '#CBD5E1' : '#475569' }}>{body}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }


        if (sec.type === 'table' && Array.isArray(sec.columns) && Array.isArray(sec.rows)) {
          return (
            <div
              key={sIdx}
              style={{
                margin: '4px 0',
                background: isDark ? 'rgba(255, 255, 255, 0.018)' : '#FFFFFF',
                border: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1.5px solid #E2E8F0',
                borderRadius: 16,
                padding: '12px 16px',
                overflowX: 'auto',
              }}
            >
              {sec.heading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  {getThemedIcon(sec.icon || 'attendance', 15)}
                  <span style={{ fontSize: 14, fontWeight: 750, color: isDark ? '#FFFFFF' : '#0F172A', letterSpacing: '-0.01em' }}>
                    {sec.heading}
                  </span>
                </div>
              )}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: isDark ? 'rgba(255, 255, 255, 0.035)' : '#F1F5F9', borderRadius: 10, textAlign: 'left' }}>
                    {sec.columns.map((col, cIdx) => (
                      <th
                        key={cIdx}
                        style={{
                          padding: '9px 14px',
                          color: isDark ? 'rgba(255, 255, 255, 0.55)' : '#64748B',
                          textTransform: 'uppercase',
                          fontSize: 11,
                          fontWeight: 650,
                          letterSpacing: '0.05em',
                          border: 'none',
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
                        borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.04)' : '1px solid #E2E8F0',
                        transition: 'background 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = isDark ? 'rgba(255, 255, 255, 0.03)' : '#F8FAFC';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      {row.map((cell, cellIdx) => (
                        <td
                          key={cellIdx}
                          style={{
                            padding: '11px 14px',
                            color: isDark ? '#F8FAFC' : '#0F172A',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          <TableCellRenderer cell={cell} isDark={isDark} />
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
    </div>
  );
}


// ── Table Cell Renderer (Supports status badge objects) ────────────────────
function TableCellRenderer({ cell, isDark = true }) {
  if (cell === null || cell === undefined) return '-';

  if (typeof cell === 'object') {
    const isWarn = cell.status === 'not_marked' || cell.status === 'warning' || cell.status === 'absent';
    const isSuccess = cell.status === 'present' || cell.status === 'success';

    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '3px 10px',
          borderRadius: 20,
          background: isWarn
            ? (isDark ? 'rgba(245, 158, 11, 0.14)' : '#FEF3C7')
            : isSuccess
            ? (isDark ? 'rgba(16, 185, 129, 0.14)' : '#DCFCE7')
            : (isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9'),
          color: isWarn
            ? (isDark ? '#FBBF24' : '#D97706')
            : isSuccess
            ? (isDark ? '#34D399' : '#16A34A')
            : (isDark ? '#FFFFFF' : '#334155'),
          border: `1px solid ${
            isWarn
              ? (isDark ? 'rgba(245, 158, 11, 0.3)' : '#FCD34D')
              : isSuccess
              ? (isDark ? 'rgba(16, 185, 129, 0.3)' : '#86EFAC')
              : (isDark ? 'transparent' : '#CBD5E1')
          }`,
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

// ── Incomplete JSON Auto-Repair ──────────────────────────────────────────────
function repairIncompleteJson(str) {
  if (!str || typeof str !== 'string') return null;
  let s = str.trim();

  // Strip leading non-JSON preamble if any
  const firstBrace = s.indexOf('{');
  if (firstBrace === -1) return null;
  s = s.substring(firstBrace);

  // Quick direct try
  try {
    const direct = JSON.parse(s);
    if (direct && (direct.title || direct.sections)) return direct;
  } catch (e) {
    // continue to repair
  }

  // Iteratively trim broken trailing properties, keys, or truncated tokens
  for (let cut = 0; cut < 15; cut++) {
    // If inside a string (odd number of unescaped quotes), close it
    let inString = false;
    let escaped = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '\\') {
        escaped = !escaped;
      } else if (c === '"' && !escaped) {
        inString = !inString;
      } else {
        escaped = false;
      }
    }
    let testStr = inString ? s + '"' : s;

    // Remove dangling commas, colons, or incomplete key/values at the end
    testStr = testStr.replace(/,\s*$/, '').replace(/:\s*"?$/, '').replace(/,\s*"?$/, '');

    // Count open braces and brackets
    const stack = [];
    inString = false;
    escaped = false;
    for (let i = 0; i < testStr.length; i++) {
      const c = testStr[i];
      if (c === '\\') {
        escaped = !escaped;
      } else if (c === '"' && !escaped) {
        inString = !inString;
      } else if (!inString) {
        if (c === '{') stack.push('}');
        else if (c === '[') stack.push(']');
        else if (c === '}' || c === ']') {
          if (stack.length > 0 && stack[stack.length - 1] === c) {
            stack.pop();
          }
        }
      } else {
        escaped = false;
      }
    }

    // Append closing tokens in reverse order
    let candidate = testStr;
    while (stack.length > 0) {
      candidate += stack.pop();
    }

    try {
      const parsed = JSON.parse(candidate);
      if (parsed && (parsed.title || parsed.sections)) {
        return parsed;
      }
    } catch (err) {
      // Trim back to previous comma or brace and try again
      const lastComma = s.lastIndexOf(',');
      const lastCloseBrace = s.lastIndexOf('}');
      const trimPoint = Math.max(lastComma, lastCloseBrace);
      if (trimPoint > firstBrace + 10) {
        s = s.substring(0, trimPoint);
      } else {
        break;
      }
    }
  }
  return null;
}

// ── Universal Structured Schema Parser & Markdown Sanitizer ────────────────
function parseToStructuredSchema(rawText, rawData) {
  // 1. Direct JSON data object
  if (rawData && typeof rawData === 'object' && (rawData.sections || rawData.title)) {
    return rawData;
  }
  if (typeof rawText === 'object' && rawText !== null && (rawText.sections || rawText.title)) {
    return rawText;
  }

  let text = typeof rawText === 'string' ? rawText.trim() : '';
  if (!text) {
    return {
      title: { icon: 'ai_review', text: 'Assistant Response' },
      sections: [],
      meta: { status: 'normal', statusIcon: 'status_normal' }
    };
  }

  // Strip <thought>...</thought> tags and thought prefixes
  text = text.replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim();
  text = text.replace(/^thought\s*\{/i, '{').trim();
  text = text.replace(/^thought[:\s]*\n?/i, '').trim();

  // 2. Try JSON Parse from text (including ```json code blocks)
  const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/;
  const match = text.match(jsonBlockRegex);
  let targetJsonStr = match ? match[1].trim() : text;
  targetJsonStr = targetJsonStr.replace(/^thought\s*\{/i, '{').trim();

  const firstBrace = targetJsonStr.indexOf('{');
  if (firstBrace !== -1) {
    const candidate = targetJsonStr.substring(firstBrace);
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && (parsed.sections || parsed.title)) {
        return parsed;
      }
    } catch (e) {
      // Attempt incomplete JSON repair
      const repaired = repairIncompleteJson(candidate);
      if (repaired) {
        return repaired;
      }
    }
  }

  // 3. Fallback: Universal Markdown-to-Structured Converter
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
      const itemTitle = numMatch[2].trim();
      const itemBody = numMatch[3].trim();
      if (itemTitle || itemBody) {
        currentActions.push({
          title: itemTitle,
          body: itemBody,
        });
      }
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

  let defaultBody = cleanText.replace(/###/g, '').replace(/---/g, '').trim();
  let defaultHeading = 'Store Summary';
  let defaultTitle = title;

  // Prevent raw JSON from ever being displayed directly as plain text
  if (defaultBody.startsWith('{') || defaultBody.startsWith('thought{') || defaultBody.includes('"title"') || defaultBody.includes('"sections"')) {
    const titleMatch = defaultBody.match(/"text"\s*:\s*"([^"]+)"/);
    const bodyMatch = defaultBody.match(/"body"\s*:\s*"([^"]+)"/);
    const headingMatch = defaultBody.match(/"heading"\s*:\s*"([^"]+)"/);
    if (bodyMatch) {
      defaultBody = bodyMatch[1];
    } else if (titleMatch) {
      defaultBody = titleMatch[1];
    } else {
      defaultBody = defaultBody.replace(/["{}[\]]/g, ' ').replace(/\s+/g, ' ').trim();
    }
    if (headingMatch && headingMatch[1]) {
      defaultHeading = headingMatch[1];
    }
    if (titleMatch && titleMatch[1]) {
      defaultTitle = { icon: title.icon || 'ai_review', text: titleMatch[1] };
    }
  }

  return {
    title: defaultTitle,
    sections: sections.length > 0 ? sections : [
      {
        type: 'insight_block',
        icon: 'ai_review',
        heading: defaultHeading,
        body: defaultBody,
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
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
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

function CopyIcon({ size = 13, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
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

function DownloadIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

// ── HTML Document Generator for Clean Executive PDF Export ─────────────────
// ── Direct Vector PDF Document Generator using jsPDF ────────────────────────
function generateChatPdfDoc({ messages, dateStr, userRole }) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;
  const contentWidth = pageWidth - margin * 2;
  const bottomLimit = pageHeight - margin - 32;

  let y = margin;

  const renderHeader = (isFirstPage = false) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(255, 107, 26); // InfoOS Orange #FF6B1A
    doc.text('InfoOS Copilot', margin, y + 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('ENTERPRISE AI INTELLIGENCE & STORE CONSULTATION REPORT', margin, y + 25);

    if (isFirstPage) {
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      const rightMeta = [
        `Date: ${dateStr}`,
        `Operator: ${userRole}`,
        `Total Interactions: ${messages.filter(m => m && m.role === 'user').length}`
      ];
      rightMeta.forEach((line, idx) => {
        doc.text(line, pageWidth - margin, y + 11 + idx * 10, { align: 'right' });
      });
      y += 36;
    } else {
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(`Continued • ${dateStr}`, pageWidth - margin, y + 18, { align: 'right' });
      y += 26;
    }

    doc.setDrawColor(255, 138, 61);
    doc.setLineWidth(1.2);
    doc.line(margin, y, pageWidth - margin, y);
    y += 14;
  };

  const checkPageBreak = (neededHeight) => {
    if (y + neededHeight > bottomLimit) {
      doc.addPage();
      y = margin;
      renderHeader(false);
      return true;
    }
    return false;
  };

  // Render initial page header
  renderHeader(true);

  const filtered = messages.filter((m) => m && m.id !== 'welcome');

  for (const m of filtered) {
    const rawText = m.text || m.content || '';

    if (m.role === 'user') {
      const userTextLines = doc.splitTextToSize(String(rawText), contentWidth - 28);
      const bubbleHeight = Math.max(30, 16 + userTextLines.length * 12);

      checkPageBreak(bubbleHeight + 20);

      // Badge
      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(margin, y, 76, 13, 3, 3, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(71, 85, 105);
      doc.text('OWNER QUERY', margin + 6, y + 9.5);

      // Bubble
      const bubbleY = y + 15;
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.8);
      doc.roundedRect(margin, bubbleY, contentWidth, bubbleHeight, 5, 5, 'FD');

      // Orange left accent
      doc.setFillColor(255, 107, 26);
      doc.roundedRect(margin, bubbleY, 3.5, bubbleHeight, 2, 2, 'F');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text(userTextLines, margin + 12, bubbleY + 13);

      y = bubbleY + bubbleHeight + 12;
    } else {
      const agentKey = m.agent || 'orchestrator';
      const agentTitle = (agentKey.charAt(0).toUpperCase() + agentKey.slice(1)) + ' Agent';

      let card = m.structured_card;
      if (!card && typeof m.text === 'object' && m.text !== null) {
        card = m.text;
      }
      if (!card && m.data && typeof m.data === 'object') {
        card = m.data;
      }
      if (!card && rawText) {
        card = parseToStructuredSchema(rawText, m.data);
      }

      const cardTitleText = (card?.title?.text) || 'Analysis Summary';

      checkPageBreak(50);

      // Agent Badge
      doc.setFillColor(255, 247, 237);
      doc.setDrawColor(255, 237, 213);
      doc.roundedRect(margin, y, 95, 14, 3, 3, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(194, 65, 12);
      doc.text(agentTitle.toUpperCase(), margin + 6, y + 10);

      // Verified Chip
      doc.setFillColor(240, 253, 244);
      doc.setDrawColor(187, 247, 208);
      doc.roundedRect(margin + 101, y, 48, 14, 3, 3, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(22, 101, 52);
      doc.text('VERIFIED', margin + 108, y + 10);

      y += 18;

      // Card Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text(cardTitleText, margin, y + 4);
      y += 14;

      if (card && Array.isArray(card.sections) && card.sections.length > 0) {
        for (const sec of card.sections) {
          if (sec.type === 'metric_list' && Array.isArray(sec.items) && sec.items.length > 0) {
            checkPageBreak(46);
            const items = sec.items.slice(0, 4);
            const colWidth = (contentWidth - (items.length - 1) * 8) / items.length;
            const boxHeight = 36;

            for (let i = 0; i < items.length; i++) {
              const item = items[i];
              const xPos = margin + i * (colWidth + 8);
              doc.setFillColor(248, 250, 252);
              doc.setDrawColor(226, 232, 240);
              doc.roundedRect(xPos, y, colWidth, boxHeight, 4, 4, 'FD');

              doc.setFont('helvetica', 'normal');
              doc.setFontSize(7);
              doc.setTextColor(100, 116, 139);
              doc.text(String(item.label || '').toUpperCase(), xPos + 8, y + 12);

              doc.setFont('helvetica', 'bold');
              doc.setFontSize(12);
              doc.setTextColor(15, 23, 42);
              doc.text(String(item.value || '0'), xPos + 8, y + 27);
            }
            y += boxHeight + 10;
          } else if (sec.type === 'table' && Array.isArray(sec.columns) && Array.isArray(sec.rows)) {
            checkPageBreak(50);
            if (sec.heading) {
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(9);
              doc.setTextColor(51, 65, 85);
              doc.text(sec.heading, margin, y + 2);
              y += 12;
            }

            const cols = sec.columns;
            const rows = sec.rows;
            const numCols = cols.length || 1;
            const colWidth = contentWidth / numCols;
            const rowHeight = 17;

            // Draw table header helper
            // eslint-disable-next-line no-loop-func
            const renderTableCols = () => {
              doc.setFillColor(241, 245, 249);
              doc.setDrawColor(203, 213, 225);
              doc.rect(margin, y, contentWidth, rowHeight, 'FD');
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(7.5);
              doc.setTextColor(30, 41, 59);

              for (let ci = 0; ci < cols.length; ci++) {
                doc.text(String(cols[ci]), margin + ci * colWidth + 6, y + 11.5);
              }
              y += rowHeight;
            };

            renderTableCols();

            for (let ri = 0; ri < rows.length; ri++) {
              if (checkPageBreak(rowHeight + 4)) {
                renderTableCols();
              }
              if (ri % 2 === 1) {
                doc.setFillColor(250, 250, 250);
                doc.rect(margin, y, contentWidth, rowHeight, 'F');
              }
              doc.setDrawColor(241, 245, 249);
              doc.line(margin, y + rowHeight, margin + contentWidth, y + rowHeight);

              const rowCells = Array.isArray(rows[ri]) ? rows[ri] : [];
              for (let ci = 0; ci < rowCells.length; ci++) {
                const cell = rowCells[ci];
                let cellText = '';
                if (typeof cell === 'object' && cell !== null) {
                  cellText = String(cell.text || cell.value || '');
                } else {
                  cellText = String(cell ?? '');
                }

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7.5);
                doc.setTextColor(51, 65, 85);
                const maxChars = Math.floor(colWidth / 5.2);
                if (cellText.length > maxChars) {
                  cellText = cellText.substring(0, maxChars - 2) + '..';
                }
                doc.text(cellText, margin + ci * colWidth + 6, y + 11.5);
              }
              y += rowHeight;
            }
            y += 8;
          } else if (sec.type === 'insight_block') {
            const bodyLines = doc.splitTextToSize(String(sec.body || ''), contentWidth - 24);
            const boxH = Math.max(30, 16 + bodyLines.length * 11);
            checkPageBreak(boxH + 8);

            doc.setFillColor(238, 242, 255);
            doc.setDrawColor(199, 210, 254);
            doc.roundedRect(margin, y, contentWidth, boxH, 4, 4, 'FD');

            doc.setFillColor(79, 70, 229);
            doc.roundedRect(margin, y, 3, boxH, 1, 1, 'F');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(55, 48, 163);
            doc.text(sec.heading || 'Store Insight', margin + 10, y + 11);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(30, 41, 59);
            doc.text(bodyLines, margin + 10, y + 22);

            y += boxH + 8;
          } else if (sec.type === 'action_list' && Array.isArray(sec.items)) {
            checkPageBreak(26);
            if (sec.heading) {
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(8.5);
              doc.setTextColor(51, 65, 85);
              doc.text(sec.heading, margin, y + 2);
              y += 11;
            }

            for (let ai = 0; ai < sec.items.length; ai++) {
              const act = sec.items[ai];
              const actTitle = act.title || '';
              const actDesc = act.body || act.desc || '';
              const textLines = doc.splitTextToSize(`${actTitle}: ${actDesc}`, contentWidth - 32);
              const itemH = Math.max(16, textLines.length * 10 + 4);

              checkPageBreak(itemH + 3);

              doc.setFillColor(255, 107, 26);
              doc.circle(margin + 5, y + 6, 4, 'F');
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(6);
              doc.setTextColor(255, 255, 255);
              doc.text(String(ai + 1), margin + 3.8, y + 8);

              doc.setFont('helvetica', 'normal');
              doc.setFontSize(7.5);
              doc.setTextColor(30, 41, 59);
              doc.text(textLines, margin + 16, y + 8);

              y += itemH;
            }
            y += 6;
          } else if (sec.type === 'divider') {
            doc.setDrawColor(241, 245, 249);
            doc.line(margin, y + 3, margin + contentWidth, y + 3);
            y += 6;
          }
        }
      } else {
        const plainLines = doc.splitTextToSize(String(rawText), contentWidth - 20);
        const boxH = Math.max(26, 12 + plainLines.length * 10.5);
        checkPageBreak(boxH + 8);

        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(margin, y, contentWidth, boxH, 4, 4, 'FD');

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(30, 41, 59);
        doc.text(plainLines, margin + 10, y + 13);

        y += boxH + 8;
      }

      // Bottom separator
      doc.setDrawColor(241, 245, 249);
      doc.line(margin, y + 4, margin + contentWidth, y + 4);
      y += 12;
    }
  }

  // Add Footers to all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.line(margin, pageHeight - margin + 8, pageWidth - margin, pageHeight - margin + 8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text('Generated by InfoOS POS System • Confidential Store Record', margin, pageHeight - margin + 18);
    doc.text(`Executive Consultation Transcript • Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - margin + 18, { align: 'right' });
  }

  return doc;
}

// ── HTML Document Generator for Clean Executive PDF Export ─────────────────
// eslint-disable-next-line no-unused-vars
function generateChatPdfHtml({ messages, dateStr, userRole }) {

  const sanitize = (text) => {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  let messagesHtml = '';
  const filtered = messages.filter((m) => m && m.id !== 'welcome');

  for (const m of filtered) {
    const rawText = m.text || m.content || '';

    if (m.role === 'user') {
      messagesHtml += `
        <div class="pdf-msg-user">
          <div class="pdf-msg-badge user-badge">Owner Query</div>
          <div class="pdf-msg-bubble user-bubble">${sanitize(rawText)}</div>
        </div>
      `;
    } else {
      const agentKey = m.agent || 'orchestrator';
      const agentTitle = (agentKey.charAt(0).toUpperCase() + agentKey.slice(1)) + ' Agent';

      let card = m.structured_card;
      if (!card && typeof m.text === 'object' && m.text !== null) {
        card = m.text;
      }
      if (!card && m.data && typeof m.data === 'object') {
        card = m.data;
      }
      if (!card && rawText) {
        card = parseToStructuredSchema(rawText, m.data);
      }

      let cardSectionsHtml = '';

      if (card && Array.isArray(card.sections)) {
        for (const sec of card.sections) {
          if (sec.type === 'metric_list' && Array.isArray(sec.items)) {
            const itemsHtml = sec.items.map(it => `
              <div class="metric-card">
                <div class="metric-label">${sanitize(it.label)}</div>
                <div class="metric-value">${sanitize(it.value)}</div>
              </div>
            `).join('');
            cardSectionsHtml += `<div class="metric-grid">${itemsHtml}</div>`;
          } else if (sec.type === 'table' && Array.isArray(sec.columns) && Array.isArray(sec.rows)) {
            const thHtml = sec.columns.map(c => `<th>${sanitize(c)}</th>`).join('');
            const trHtml = sec.rows.map(row => {
              const tds = (Array.isArray(row) ? row : []).map(cell => {
                if (typeof cell === 'object' && cell !== null) {
                  const statusClass = cell.status === 'present' ? 'status-present' : (cell.status === 'warning' ? 'status-warning' : 'status-default');
                  return `<td><span class="badge ${statusClass}">${sanitize(cell.text || cell.value || '')}</span></td>`;
                }
                return `<td>${sanitize(cell)}</td>`;
              }).join('');
              return `<tr>${tds}</tr>`;
            }).join('');
            cardSectionsHtml += `
              <div class="table-container">
                <div class="section-heading">${sanitize(sec.heading || 'Report Data')}</div>
                <table class="pdf-table">
                  <thead><tr>${thHtml}</tr></thead>
                  <tbody>${trHtml}</tbody>
                </table>
              </div>
            `;
          } else if (sec.type === 'insight_block') {
            cardSectionsHtml += `
              <div class="insight-box">
                <div class="insight-title">${sanitize(sec.heading || 'Store Insight')}</div>
                <div class="insight-body">${sanitize(sec.body || '')}</div>
              </div>
            `;
          } else if (sec.type === 'action_list' && Array.isArray(sec.items)) {
            const actionsHtml = sec.items.map((act, i) => `
              <div class="action-item">
                <div class="action-number">${i + 1}</div>
                <div class="action-content">
                  <div class="action-title">${sanitize(act.title || '')}</div>
                  <div class="action-desc">${sanitize(act.body || act.desc || '')}</div>
                </div>
              </div>
            `).join('');
            cardSectionsHtml += `
              <div class="actions-container">
                <div class="section-heading">${sanitize(sec.heading || 'Recommended Actions')}</div>
                ${actionsHtml}
              </div>
            `;
          } else if (sec.type === 'divider') {
            cardSectionsHtml += `<hr class="pdf-divider" />`;
          }
        }
      } else if (rawText) {
        cardSectionsHtml = `<div class="plain-text-response">${sanitize(typeof rawText === 'object' ? JSON.stringify(rawText, null, 2) : rawText)}</div>`;
      }

      let actionsHtml = '';
      if (m.pending_actions && m.pending_actions.length > 0) {
        actionsHtml += m.pending_actions.map(a => `
          <div class="mutation-box pending">
            <strong>Proposed Mutation (Staged):</strong> ${sanitize(a.diff_summary || a.tool_name)}
          </div>
        `).join('');
      }
      if (m.executed_actions && m.executed_actions.length > 0) {
        actionsHtml += m.executed_actions.map(a => `
          <div class="mutation-box executed">
            <strong>Action Executed:</strong> ${sanitize(a.diff_summary || a.tool_name)}
          </div>
        `).join('');
      }

      messagesHtml += `
        <div class="pdf-msg-assistant">
          <div class="assistant-header">
            <span class="pdf-msg-badge agent-badge">${sanitize(agentTitle)}</span>
            <span class="status-chip">VERIFIED</span>
          </div>
          <div class="card-title">${sanitize(card?.title?.text || 'Analysis Summary')}</div>
          <div class="card-body">
            ${cardSectionsHtml}
            ${actionsHtml}
          </div>
        </div>
      `;
    }
  }


  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>InfoOS AI Consultation Transcript</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 14mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #0F172A;
      background: #FFFFFF;
      margin: 0;
      padding: 0;
      font-size: 10.5pt;
      line-height: 1.5;
    }
    .header {
      border-bottom: 2px solid #FF8A3D;
      padding-bottom: 12px;
      margin-bottom: 18px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .header-brand {
      font-size: 18pt;
      font-weight: 800;
      color: #FF6B1A;
      letter-spacing: -0.02em;
    }
    .header-subtitle {
      font-size: 9.5pt;
      color: #64748B;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-top: 2px;
    }
    .meta-info {
      text-align: right;
      font-size: 8.5pt;
      color: #475569;
      line-height: 1.4;
    }
    .pdf-msg-user {
      margin-bottom: 14px;
      page-break-inside: avoid;
    }
    .pdf-msg-badge {
      display: inline-block;
      font-size: 7.5pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 2px 7px;
      border-radius: 4px;
      margin-bottom: 4px;
    }
    .user-badge {
      background: #F1F5F9;
      color: #334155;
      border: 1px solid #E2E8F0;
    }
    .agent-badge {
      background: #FFF7ED;
      color: #C2410C;
      border: 1px solid #FFEDD5;
    }
    .status-chip {
      font-size: 7.5pt;
      font-weight: 700;
      color: #16A34A;
      background: #F0FDF4;
      border: 1px solid #DCFCE7;
      padding: 2px 6px;
      border-radius: 4px;
      margin-left: 6px;
    }
    .user-bubble {
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 8px;
      padding: 9px 13px;
      font-weight: 600;
      color: #1E293B;
      font-size: 10.5pt;
    }
    .pdf-msg-assistant {
      margin-bottom: 18px;
      background: #FFFFFF;
      border: 1px solid #E2E8F0;
      border-left: 4px solid #FF8A3D;
      border-radius: 8px;
      padding: 12px 15px;
      page-break-inside: avoid;
    }
    .assistant-header {
      display: flex;
      align-items: center;
      margin-bottom: 8px;
    }
    .card-title {
      font-size: 12pt;
      font-weight: 750;
      color: #0F172A;
      margin-bottom: 10px;
    }
    .metric-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 8px;
      margin-bottom: 12px;
    }
    .metric-card {
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 6px;
      padding: 8px 10px;
    }
    .metric-label {
      font-size: 7.5pt;
      color: #64748B;
      text-transform: uppercase;
      font-weight: 600;
    }
    .metric-value {
      font-size: 12pt;
      font-weight: 750;
      color: #0F172A;
      margin-top: 2px;
    }
    .section-heading {
      font-size: 9.5pt;
      font-weight: 700;
      color: #334155;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .pdf-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
      font-size: 9pt;
    }
    .pdf-table th {
      background: #F1F5F9;
      color: #334155;
      text-align: left;
      padding: 6px 9px;
      font-weight: 700;
      border-bottom: 2px solid #CBD5E1;
    }
    .pdf-table td {
      padding: 6px 9px;
      border-bottom: 1px solid #E2E8F0;
    }
    .pdf-table tr:nth-child(even) td {
      background: #F8FAFC;
    }
    .badge {
      display: inline-block;
      font-size: 7.5pt;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .status-present {
      background: #DCFCE7;
      color: #166534;
    }
    .status-warning {
      background: #FEF3C7;
      color: #92400E;
    }
    .status-default {
      background: #F1F5F9;
      color: #475569;
    }
    .insight-box {
      background: #FFFBEB;
      border: 1px solid #FDE68A;
      border-radius: 6px;
      padding: 9px 12px;
      margin-bottom: 10px;
    }
    .insight-title {
      font-weight: 700;
      color: #92400E;
      font-size: 9.5pt;
      margin-bottom: 3px;
    }
    .insight-body {
      font-size: 9pt;
      color: #78350F;
      line-height: 1.45;
    }
    .action-item {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin-bottom: 6px;
    }
    .action-number {
      background: #FF8A3D;
      color: #FFFFFF;
      font-size: 8pt;
      font-weight: 750;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-top: 2px;
    }
    .action-title {
      font-weight: 700;
      font-size: 9.5pt;
      color: #0F172A;
    }
    .action-desc {
      font-size: 9pt;
      color: #475569;
    }
    .pdf-divider {
      border: 0;
      border-top: 1px dashed #CBD5E1;
      margin: 10px 0;
    }
    .mutation-box {
      padding: 7px 10px;
      border-radius: 6px;
      font-size: 8.5pt;
      margin-top: 8px;
    }
    .mutation-box.pending {
      background: #FFF7ED;
      border: 1px solid #FDBA74;
      color: #9A3412;
    }
    .mutation-box.executed {
      background: #F0FDF4;
      border: 1px solid #86EFAC;
      color: #166534;
    }
    .plain-text-response {
      font-size: 9.5pt;
      color: #334155;
      line-height: 1.5;
    }
    .footer {
      margin-top: 20px;
      border-top: 1px solid #E2E8F0;
      padding-top: 8px;
      display: flex;
      justify-content: space-between;
      font-size: 7.5pt;
      color: #94A3B8;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="header-brand">InfoOS Copilot</div>
      <div class="header-subtitle">Enterprise AI Intelligence &amp; Store Consultation Report</div>
    </div>
    <div class="meta-info">
      <div><strong>Date:</strong> ${dateStr}</div>
      <div><strong>Operator Role:</strong> ${sanitize(userRole)}</div>
      <div><strong>Total Interactions:</strong> ${filtered.filter(m => m.role === 'user').length}</div>
    </div>
  </div>

  <div class="content">
    ${messagesHtml || '<p style="color: #64748B; font-style: italic;">No conversation messages to display.</p>'}
  </div>

  <div class="footer">
    <div>Generated by InfoOS POS System • Confidential Store Record</div>
    <div>Executive Consultation Transcript</div>
  </div>
</body>
</html>`;
}


