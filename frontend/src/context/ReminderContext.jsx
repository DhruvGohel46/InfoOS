import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useAlert } from "./AlertContext";
import { reminderAPI } from "../api/reminderAPI";
import { useSettings } from "./SettingsContext";

const ReminderContext = createContext();

export const ReminderProvider = ({ children }) => {
    const [reminders, setReminders] = useState([]);
    const [activeAlerts, setActiveAlerts] = useState([]);
    const audioRef = useRef(null);
    const { addToast } = useAlert();
    const { settings } = useSettings();

    // Sound management
    useEffect(() => {
        const soundFile = settings?.reminder_sound || "reminder.mp3";
        // Use backend API URL for sounds with timestamp to prevent caching
        const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5050';
        audioRef.current = new Audio(`${apiUrl}/api/sounds/${soundFile}?v=${new Date().getTime()}`);
        audioRef.current.loop = true;
        audioRef.current.playbackRate = 1.0;

    }, [settings?.reminder_sound]);

    const playAlertSound = useCallback(() => {
        if (audioRef.current && activeAlerts.length > 0) {
            audioRef.current.play().catch(() => {
                // Ignore autoplay block; sound will play on next interaction
            });
        }
    }, [activeAlerts]);

    const stopAlertSound = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
        }
    }, []);

    useEffect(() => {
        if (activeAlerts.length > 0) {
            playAlertSound();
        } else {
            stopAlertSound();
        }
    }, [activeAlerts, playAlertSound, stopAlertSound]);

    // Data fetch + alert sync
    const fetchReminders = useCallback(async () => {
        try {
            const data = await reminderAPI.getReminders();
            setReminders(data);

            const triggered = data.filter(r => r.status === "triggered" && !r.is_dismissed);
            if (triggered.length > 0) {
                setActiveAlerts(prev => {
                    const existing = new Set(prev.map(a => a.id));
                    const newOnes = triggered.filter(a => !existing.has(a.id));
                    return [...prev, ...newOnes];
                });
            }
        } catch (error) {
            console.error("Failed to fetch reminders:", error);
            addToast("Reminder fetch failed", "Unable to load reminders right now");
        }
    }, [addToast]);

    const createReminder = async (data) => {
        const created = await reminderAPI.createReminder(data);
        setReminders(prev => [...prev, created]);
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
            fetchReminders();
        } catch (error) {
            console.error("Snooze failed:", error);
            addToast("Snooze failed", "Could not snooze reminder");
        }
    };

    const dismissReminder = async (id) => {
        setActiveAlerts(prev => prev.filter(a => a.id !== id));
        try {
            await reminderAPI.completeReminder(id);
            fetchReminders();
        } catch (error) {
            console.error("Dismiss failed:", error);
            addToast("Dismiss failed", "Could not dismiss reminder");
        }
    };

    // Poll every 60s to stay in sync
    useEffect(() => {
        fetchReminders();
        const interval = setInterval(fetchReminders, 60000);
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
