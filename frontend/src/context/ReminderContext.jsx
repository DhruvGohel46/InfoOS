import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAlert } from "./AlertContext";
import { reminderAPI } from "../api/reminderAPI";
import { useSettings } from "./SettingsContext";
import { startReminderSound, stopReminderSound } from "../utils/soundService";

const ReminderContext = createContext();

export const ReminderProvider = ({ children }) => {
    const [reminders, setReminders] = useState([]);
    const [activeAlerts, setActiveAlerts] = useState([]);
    const { addToast } = useAlert();
    const { settings } = useSettings();

    // Sound management
    useEffect(() => {
        if (activeAlerts.length > 0) {
            startReminderSound(settings?.reminder_sound);
        } else {
            stopReminderSound();
        }

        return () => {
            stopReminderSound();
        };
    }, [activeAlerts.length, settings?.reminder_sound]);

    // Data fetch + alert sync
    const fetchReminders = useCallback(async () => {
        try {
            const data = await reminderAPI.getReminders();
            if (Array.isArray(data)) {
                setReminders(data);
                const triggered = data.filter(r => r.status === "triggered" && !r.is_dismissed);
                setActiveAlerts(triggered);
            }
        } catch (error) {
            console.error("Failed to fetch reminders:", error);
        }
    }, []);

    const createReminder = async (data) => {
        const created = await reminderAPI.createReminder(data);
        setReminders(prev => [...prev, created]);
        fetchReminders();
        return created;
    };

    const deleteReminder = async (id) => {
        await reminderAPI.deleteReminder(id);
        setReminders(prev => prev.filter(r => r.id !== id));
        setActiveAlerts(prev => prev.filter(a => a.id !== id));
    };

    const snoozeReminder = async (id, minutes = 5) => {
        setActiveAlerts(prev => prev.filter(a => a.id !== id));
        try {
            await reminderAPI.snoozeReminder(id, minutes);
            await fetchReminders();
        } catch (error) {
            console.error("Snooze failed:", error);
            addToast("Snooze failed", "Could not snooze reminder");
        }
    };

    const dismissReminder = async (id) => {
        setActiveAlerts(prev => prev.filter(a => a.id !== id));
        try {
            await reminderAPI.completeReminder(id);
            await fetchReminders();
        } catch (error) {
            console.error("Dismiss failed:", error);
            addToast("Dismiss failed", "Could not dismiss reminder");
        }
    };

    // Poll every 15s to stay in sync with background checker
    useEffect(() => {
        fetchReminders();
        const interval = setInterval(fetchReminders, 15000);
        return () => clearInterval(interval);
    }, [fetchReminders]);

    return (
        <ReminderContext.Provider value={{
            reminders,
            activeAlerts,
            createReminder,
            deleteReminder,
            snoozeReminder,
            dismissReminder,
            fetchReminders
        }}>
            {children}
        </ReminderContext.Provider>
    );
};

export const useReminders = () => {
    const context = useContext(ReminderContext);
    if (!context) throw new Error("useReminders must be used within ReminderProvider");
    return context;
};
