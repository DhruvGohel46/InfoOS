/**
 * =============================================================================
 * SOUND SERVICE — Bulletproof Notification & Reminder Audio Manager
 * =============================================================================
 *
 * Features:
 * - Multi-tier audio fallback: Custom file -> Bundled MP3/WAV -> Web Audio Synth -> Electron System Beep
 * - Handles Chromium/Electron autoplay restrictions (AudioContext resume & audio unlock)
 * - Looping alarm support for active reminders with clean stop
 * - Single-shot chimes for alerts, toasts, and notifications
 * - Preview sound support for Settings screen
 * =============================================================================
 */

let activeAudio = null;
let synthLoopTimer = null;

/**
 * Play a short, subtle cash-register 'ding' via Web Audio API.
 * Single crisp metallic tap — fast attack, quick decay (~150ms total).
 * Guaranteed to produce sound even if sound files are missing or offline.
 */
export const playSynthChime = () => {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;

        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
        }

        const now = ctx.currentTime;

        // Primary metallic tap: 2200 Hz triangle wave — crisp, short
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(2200, now);
        osc1.frequency.exponentialRampToValueAtTime(1800, now + 0.08);
        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(0.3, now + 0.004);   // Near-instant attack
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.16);

        // Subtle body tone: 1100 Hz sine — gives it warmth
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1100, now);
        gain2.gain.setValueAtTime(0, now);
        gain2.gain.linearRampToValueAtTime(0.12, now + 0.003);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.10);

        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now);
        osc2.stop(now + 0.11);

        setTimeout(() => {
            try {
                ctx.close();
            } catch (_) {}
        }, 400);
    } catch (err) {
        console.warn('Web Audio synth chime failed:', err);
    }
};

/**
 * Play an audio element with fallback cascade
 */
const playAudioWithFallback = async (urls, options = {}) => {
    const { loop = false, onPlayed = null } = options;

    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        try {
            const audio = new Audio(url);
            audio.loop = loop;
            audio.volume = 0.85;

            const playPromise = audio.play();
            if (playPromise !== undefined) {
                await playPromise;
                if (onPlayed) onPlayed(audio);
                return audio;
            }
        } catch (err) {
            console.warn(`Sound candidate ${url} could not play:`, err.message);
        }
    }

    // If all audio element candidates fail, play synthetic chime
    playSynthChime();

    // Also trigger native Electron chime if available
    if (window.electronAPI && typeof window.electronAPI.playNotificationSound === 'function') {
        window.electronAPI.playNotificationSound().catch(() => {});
    }

    return null;
};

/**
 * Play a single notification sound chime.
 */
export const playNotificationSound = async () => {
    const publicUrl = process.env.PUBLIC_URL || '';
    const apiUrl = process.env.REACT_APP_API_URL || 'http://127.0.0.1:5050';

    const candidates = [
        `${publicUrl}/sounds/notification.wav`,
        `${publicUrl}/sounds/notifiction.wav`,
        `${publicUrl}/sounds/reminder.mp3`,
        `${apiUrl}/api/sounds/notification.wav`,
        `${apiUrl}/api/sounds/reminder.mp3`,
        'sounds/notification.wav',
        'sounds/reminder.mp3'
    ];

    return playAudioWithFallback(candidates);
};

/**
 * Start playing the reminder alert sound (looping until dismissed).
 */
export const startReminderSound = (soundFilename = 'reminder.mp3') => {
    stopReminderSound();

    const publicUrl = process.env.PUBLIC_URL || '';
    const apiUrl = process.env.REACT_APP_API_URL || 'http://127.0.0.1:5050';

    const candidates = [];
    if (soundFilename && soundFilename !== 'default') {
        candidates.push(`${apiUrl}/api/sounds/${soundFilename}?v=${Date.now()}`);
    }
    candidates.push(`${publicUrl}/sounds/reminder.mp3`);
    candidates.push(`${apiUrl}/api/sounds/reminder.mp3?v=${Date.now()}`);
    candidates.push('sounds/reminder.mp3');

    playAudioWithFallback(candidates, {
        loop: true,
        onPlayed: (audio) => {
            activeAudio = audio;
        }
    }).then(audio => {
        if (!audio) {
            // Audio element failed; keep synth chime repeating every 4 seconds
            playSynthChime();
            synthLoopTimer = setInterval(() => {
                playSynthChime();
            }, 4000);
        }
    });
};

/**
 * Stop any currently playing reminder alert sound.
 */
export const stopReminderSound = () => {
    if (activeAudio) {
        try {
            activeAudio.pause();
            activeAudio.currentTime = 0;
        } catch (_) {}
        activeAudio = null;
    }

    if (synthLoopTimer) {
        clearInterval(synthLoopTimer);
        synthLoopTimer = null;
    }
};

/**
 * Preview a sound (used in Settings).
 */
export const previewSoundFile = async (soundFilename = 'reminder.mp3') => {
    const publicUrl = process.env.PUBLIC_URL || '';
    const apiUrl = process.env.REACT_APP_API_URL || 'http://127.0.0.1:5050';

    const candidates = [];
    if (soundFilename && soundFilename !== 'default' && soundFilename !== 'Default') {
        candidates.push(`${apiUrl}/api/sounds/${soundFilename}?v=${Date.now()}`);
    }
    candidates.push(`${publicUrl}/sounds/reminder.mp3`);
    candidates.push(`${publicUrl}/sounds/notification.wav`);
    candidates.push(`${apiUrl}/api/sounds/reminder.mp3?v=${Date.now()}`);

    return playAudioWithFallback(candidates);
};

/**
 * Play a refined, professional celebration chime via Web Audio API.
 * Standard milestone: clean two-note ascending bell (~0.6s).
 * Grand milestone: three-note ascending chime with harmonic tail (~1.2s).
 * Zero dependencies — synthesized on the fly.
 */
export const playCelebrationFanfare = (isGrand = false) => {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;

        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
        }

        const now = ctx.currentTime;

        const playTone = (freq, start, dur, vol, type = 'sine') => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = type;
            osc.frequency.setValueAtTime(freq, now + start);

            gain.gain.setValueAtTime(0, now + start);
            gain.gain.linearRampToValueAtTime(vol, now + start + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(now + start);
            osc.stop(now + start + dur);
        };

        if (isGrand) {
            // Grand: Three ascending bell tones + gentle harmonic
            playTone(587.33, 0,    0.35, 0.22);        // D5
            playTone(880.00, 0.12, 0.40, 0.25);        // A5
            playTone(1174.66, 0.26, 0.55, 0.22);       // D6
            playTone(1760.00, 0.32, 0.70, 0.10, 'triangle'); // A6 harmonic tail
        } else {
            // Standard: Two clean ascending bell tones
            playTone(587.33, 0,    0.30, 0.22);        // D5
            playTone(880.00, 0.10, 0.40, 0.25);        // A5
        }

        setTimeout(() => {
            try {
                ctx.close();
            } catch (_) {}
        }, isGrand ? 1500 : 800);
    } catch (err) {
        console.warn('Celebration chime failed:', err);
    }
};

const soundService = {
    playNotificationSound,
    startReminderSound,
    stopReminderSound,
    previewSoundFile,
    playSynthChime,
    playCelebrationFanfare
};

export default soundService;
