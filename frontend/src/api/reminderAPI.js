/**
 * ============================================================================= 
 * REMINDER API SERVICE - Frontend API integration
 * =============================================================================
 * 
 * Handles all reminder-related API calls to the backend
 * =============================================================================
 */

import { apiRequest } from './api';

export const reminderAPI = {
    // ─── Basic CRUD Operations ───────────────────────────────────────────────
    
    /**
     * Get all reminders
     * @param {Object} options - Query options
     * @param {boolean} options.includeInactive - Include inactive reminders
     * @param {string} options.repeatType - Filter by repeat type ('once', 'daily')
     * @returns {Promise<Array>} Array of reminder objects
     */
    async getReminders(options = {}) {
        const params = new URLSearchParams();
        
        if (options.includeInactive) {
            params.append('include_inactive', 'true');
        }
        
        if (options.repeatType) {
            params.append('repeat_type', options.repeatType);
        }
        
        const url = params.toString() ? `/api/reminders?${params.toString()}` : '/api/reminders';
        const response = await apiRequest('GET', url);
        
        if (response.success) {
            return response.data;
        } else {
            throw new Error(response.error || 'Failed to fetch reminders');
        }
    },

    /**
     * Get a specific reminder by ID
     * @param {string} reminderId - Reminder ID
     * @returns {Promise<Object>} Reminder object
     */
    async getReminder(reminderId) {
        const response = await apiRequest('GET', `/api/reminders/${reminderId}`);
        
        if (response.success) {
            return response.data;
        } else {
            throw new Error(response.error || 'Failed to fetch reminder');
        }
    },

    /**
     * Create a new reminder
     * @param {Object} reminderData - Reminder data
     * @param {string} reminderData.title - Reminder title
     * @param {string} reminderData.description - Reminder description (optional)
     * @param {string} reminderData.reminder_time - ISO datetime string
     * @param {string} reminderData.repeat_type - 'once' or 'daily'
     * @param {boolean} reminderData.is_active - Active status (default: true)
     * @returns {Promise<Object>} Created reminder object
     */
    async createReminder(reminderData) {
        const response = await apiRequest('POST', '/api/reminders', reminderData);
        
        if (response.success) {
            return response.data;
        } else {
            throw new Error(response.error || 'Failed to create reminder');
        }
    },

    /**
     * Update an existing reminder
     * @param {string} reminderId - Reminder ID
     * @param {Object} reminderData - Updated reminder data
     * @returns {Promise<Object>} Updated reminder object
     */
    async updateReminder(reminderId, reminderData) {
        const response = await apiRequest('PUT', `/api/reminders/${reminderId}`, reminderData);
        
        if (response.success) {
            return response.data;
        } else {
            throw new Error(response.error || 'Failed to update reminder');
        }
    },

    /**
     * Delete a reminder
     * @param {string} reminderId - Reminder ID
     * @returns {Promise<boolean>} True if deleted successfully
     */
    async deleteReminder(reminderId) {
        const response = await apiRequest('DELETE', `/api/reminders/${reminderId}`);
        
        if (response.success) {
            return true;
        } else {
            throw new Error(response.error || 'Failed to delete reminder');
        }
    },

    // ─── Special Operations ─────────────────────────────────────────────────────

    /**
     * Snooze a reminder for specified minutes
     * @param {string} reminderId - Reminder ID
     * @param {number} minutes - Minutes to snooze (1-1440)
     * @returns {Promise<Object>} Updated reminder object
     */
    async snoozeReminder(reminderId, minutes) {
        const response = await apiRequest('POST', `/api/reminders/${reminderId}/snooze`, {
            minutes: minutes
        });
        
        if (response.success) {
            return response.data;
        } else {
            throw new Error(response.error || 'Failed to snooze reminder');
        }
    },

    /**
     * Mark a reminder as completed
     * @param {string} reminderId - Reminder ID
     * @returns {Promise<Object>} Updated reminder object
     */
    async completeReminder(reminderId) {
        const response = await apiRequest('POST', `/api/reminders/${reminderId}/dismiss`);
        
        if (response.success) {
            return response.data;
        } else {
            throw new Error(response.error || 'Failed to complete reminder');
        }
    },

    /**
     * Get scheduler status and statistics
     * @returns {Promise<Object>} Scheduler status info
     */
    async getSchedulerStatus() {
        const response = await apiRequest('GET', '/api/reminders/status');
        
        if (response.success) {
            return response.data;
        } else {
            throw new Error(response.error || 'Failed to get scheduler status');
        }
    },

    /**
     * Create a test reminder (for debugging)
     * @param {Object} testData - Test reminder data
     * @returns {Promise<Object>} Created test reminder
     */
    async createTestReminder(testData = {}) {
        const response = await apiRequest('POST', '/api/reminders/test', {
            title: testData.title || 'Test Reminder',
            description: testData.description || 'This is a test reminder',
            ...testData
        });
        
        if (response.success) {
            return response.data;
        } else {
            throw new Error(response.error || 'Failed to create test reminder');
        }
    },

    // ─── Utility Methods ───────────────────────────────────────────────────────

    /**
     * Format reminder time for display
     * @param {string} isoString - ISO datetime string
     * @returns {Object} Formatted date and time
     */
    formatReminderTime(isoString) {
        try {
            const date = new Date(isoString);
            const now = new Date();
            
            return {
                date: date.toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric'
                }),
                time: date.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                }),
                isToday: date.toDateString() === now.toDateString(),
                isOverdue: date < now,
                relativeTime: this.getRelativeTime(date, now)
            };
        } catch (error) {
            return {
                date: 'Invalid Date',
                time: 'Invalid Time',
                isToday: false,
                isOverdue: false,
                relativeTime: 'Invalid'
            };
        }
    },

    /**
     * Get relative time string
     * @param {Date} date - Target date
     * @param {Date} now - Current date
     * @returns {string} Relative time description
     */
    getRelativeTime(date, now = new Date()) {
        const diffMs = date - now;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMs < 0) {
            // Past
            if (diffMins > -60) return `${Math.abs(diffMins)} minutes ago`;
            if (diffHours > -24) return `${Math.abs(diffHours)} hours ago`;
            return `${Math.abs(diffDays)} days ago`;
        } else {
            // Future
            if (diffMins < 60) return `in ${diffMins} minutes`;
            if (diffHours < 24) return `in ${diffHours} hours`;
            return `in ${diffDays} days`;
        }
    },

    /**
     * Validate reminder data before sending to API
     * @param {Object} data - Reminder data to validate
     * @returns {Object} Validation result
     */
    validateReminderData(data) {
        const errors = [];

        if (!data.title || data.title.trim().length === 0) {
            errors.push('Title is required');
        }

        if (data.title && data.title.length > 255) {
            errors.push('Title must be less than 255 characters');
        }

        if (data.description && data.description.length > 1000) {
            errors.push('Description must be less than 1000 characters');
        }

        if (!data.reminder_time) {
            errors.push('Reminder time is required');
        } else {
            try {
                const reminderTime = new Date(data.reminder_time);
                if (isNaN(reminderTime.getTime())) {
                    errors.push('Invalid reminder time format');
                } else if (reminderTime <= new Date()) {
                    errors.push('Reminder time must be in the future');
                }
            } catch (error) {
                errors.push('Invalid reminder time format');
            }
        }

        if (data.repeat_type && !['once', 'daily'].includes(data.repeat_type)) {
            errors.push('Repeat type must be either "once" or "daily"');
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    },

    /**
     * Get snooze options with labels
     * @returns {Array} Array of snooze options
     */
    getSnoozeOptions() {
        return [
            { minutes: 5, label: '5 minutes', shortLabel: '5 min' },
            { minutes: 10, label: '10 minutes', shortLabel: '10 min' },
            { minutes: 15, label: '15 minutes', shortLabel: '15 min' },
            { minutes: 30, label: '30 minutes', shortLabel: '30 min' },
            { minutes: 60, label: '1 hour', shortLabel: '1 hour' },
            { minutes: 120, label: '2 hours', shortLabel: '2 hours' },
            { minutes: 240, label: '4 hours', shortLabel: '4 hours' },
            { minutes: 480, label: '8 hours', shortLabel: '8 hours' },
            { minutes: 720, label: '12 hours', shortLabel: '12 hours' },
            { minutes: 1440, label: '1 day', shortLabel: '1 day' }
        ];
    },

    /**
     * Get repeat type options
     * @returns {Array} Array of repeat type options
     */
    getRepeatTypeOptions() {
        return [
            { value: 'once', label: 'Once', description: 'Runs only once at the specified time' },
            { value: 'daily', label: 'Daily', description: 'Runs every day at the specified time' }
        ];
    }
};

export default reminderAPI;
