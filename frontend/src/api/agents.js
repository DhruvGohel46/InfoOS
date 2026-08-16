import api from '../utils/api';

export const agentsAPI = {
    /**
     * Send user message to multi-agent assistant
     * @param {string} message
     * @param {Array} history
     */
    /**
     * Send user message to multi-agent assistant
     * @param {string} message
     * @param {Array} history
     */
    sendMessage: async (message, history = []) => {
        const response = await api.post('/api/agents/chat', { message, history });
        return response.data;
    },

    /**
     * Send user message to multi-agent assistant with live SSE status streaming
     * @param {string} message
     * @param {Array} history
     * @param {Function} onStatus - callback(label)
     * @param {Function} onFinal - callback(finalData)
     * @param {Function} onError - callback(error)
     */
    sendMessageStream: async (message, history = [], onStatus, onFinal, onError) => {
        const token = sessionStorage.getItem('pos_session_token');
        const baseUrl = process.env.REACT_APP_API_URL || `http://${process.env.REACT_APP_API_HOST || 'localhost'}:${process.env.REACT_APP_API_PORT || 5050}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);

        try {
            const response = await fetch(`${baseUrl}/api/agents/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'text/event-stream',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ message, history, stream: true }),
                signal: controller.signal
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || `HTTP ${response.status}: ${response.statusText}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const chunks = buffer.split('\n\n');
                buffer = chunks.pop(); // Keep incomplete chunk

                for (const chunk of chunks) {
                    if (!chunk.trim()) continue;
                    const eventMatch = chunk.match(/^event:\s*(\w+)/m);
                    const dataMatch = chunk.match(/^data:\s*(.+)$/m);
                    const eventType = eventMatch ? eventMatch[1] : 'message';

                    if (dataMatch) {
                        try {
                            const parsedData = JSON.parse(dataMatch[1]);
                            if (eventType === 'status') {
                                onStatus && onStatus(parsedData.label || 'Processing…');
                            } else if (eventType === 'final') {
                                clearTimeout(timeoutId);
                                onFinal && onFinal(parsedData);
                                return parsedData;
                            } else if (eventType === 'error') {
                                clearTimeout(timeoutId);
                                onError && onError(new Error(parsedData.error || 'Server error'));
                                return;
                            }
                        } catch (e) {
                            console.warn('Failed to parse SSE chunk:', chunk, e);
                        }
                    }
                }
            }
            clearTimeout(timeoutId);
        } catch (err) {
            clearTimeout(timeoutId);
            onError && onError(err);
        }
    },

    /**
     * Approve a proposed mutating action
     * @param {number} actionId
     */
    approveAction: async (actionId) => {
        const response = await api.post(`/api/agents/actions/${actionId}/approve`);
        return response.data;
    },

    /**
     * Reject a proposed mutating action
     * @param {number} actionId
     */
    rejectAction: async (actionId) => {
        const response = await api.post(`/api/agents/actions/${actionId}/reject`);
        return response.data;
    },

    /**
     * Restore/Undo an executed action within 48h window
     * @param {number} actionId
     */
    undoAction: async (actionId) => {
        const response = await api.post(`/api/agents/actions/${actionId}/undo`);
        return response.data;
    },

    /**
     * Get LLM provider configuration
     */
    getConfig: async () => {
        const response = await api.get('/api/agents/config');
        return response.data;
    },

    /**
     * Update LLM provider configuration
     * @param {Object} data - { provider, model_name, base_url, api_key, enabled }
     */
    updateConfig: async (data) => {
        const response = await api.post('/api/agents/config', data);
        return response.data;
    },

    /**
     * Test connection to LLM provider
     * @param {Object} data - { provider, model_name, base_url, api_key }
     */
    testConnection: async (data = {}) => {
        const response = await api.post('/api/agents/test-connection', data);
        return response.data;
    },

    /**
     * Get per-agent action tier permissions
     */
    getPermissions: async () => {
        const response = await api.get('/api/agents/permissions');
        return response.data;
    },

    /**
     * Update per-agent permissions
     * @param {Array} permissions - List of { agent_name, tier, enabled }
     */
    updatePermissions: async (permissions) => {
        const response = await api.put('/api/agents/permissions', { permissions });
        return response.data;
    },

    /**
     * Get audit action logs
     * @param {Object} params - { limit, agent, status }
     */
    getAuditLogs: async (params = {}) => {
        const response = await api.get('/api/agents/logs', { params });
        return response.data;
    },

    /**
     * Get daily request and token usage metrics
     */
    getUsageSummary: async () => {
        const response = await api.get('/api/agents/usage-summary');
        return response.data;
    }
};
