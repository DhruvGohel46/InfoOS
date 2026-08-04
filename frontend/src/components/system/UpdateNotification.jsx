import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* ─────────────────────────────────────────────────────────────────────────────
   WaveCanvas — animated sine-wave progress bar
   Orange = completed (left), dark gray = remaining (right)
   Glowing orange dot tracks the live wave position at the progress boundary
───────────────────────────────────────────────────────────────────────────── */
const WaveCanvas = ({ progress = 0 }) => {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);
  const phaseRef  = useRef(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr    = window.devicePixelRatio || 1;
    const W      = canvas.width  / dpr;
    const H      = canvas.height / dpr;
    const ctx    = canvas.getContext('2d');

    const MID_Y     = H / 2;
    const AMPLITUDE = 7;
    const PERIOD    = 156;
    const LINE_W    = 10;
    const PROG_X    = W * (progress / 100);
    const phase     = phaseRef.current;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    const getY = (x) => MID_Y + AMPLITUDE * Math.sin(2 * Math.PI * (x + phase) / PERIOD);

    // Build path helper
    const buildPath = () => {
      ctx.beginPath();
      for (let x = 0; x <= W; x++) {
        const y = getY(x);
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
    };

    // 1 — Full gray wave (background)
    buildPath();
    ctx.strokeStyle = '#2E2E2E';
    ctx.lineWidth   = LINE_W;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur  = 0;
    ctx.stroke();

    // 2 — Orange wave (progress region, clipped)
    if (progress > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, PROG_X, H);
      ctx.clip();

      buildPath();
      ctx.strokeStyle = '#FF7A00';
      ctx.lineWidth   = LINE_W;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      ctx.shadowColor = 'rgba(255, 122, 0, 0.45)';
      ctx.shadowBlur  = 12;
      ctx.stroke();

      // Soft extra glow pass
      ctx.globalAlpha = 0.25;
      ctx.lineWidth   = LINE_W + 8;
      ctx.shadowBlur  = 20;
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.restore();
    }

    // 3 — Progress dot
    if (progress > 0 && progress < 100) {
      const dotY = getY(PROG_X);

      // Outer halo
      const halo = ctx.createRadialGradient(PROG_X, dotY, 0, PROG_X, dotY, 20);
      halo.addColorStop(0,   'rgba(255, 122, 0, 0.32)');
      halo.addColorStop(0.5, 'rgba(255, 122, 0, 0.10)');
      halo.addColorStop(1,   'rgba(255, 122, 0, 0)');
      ctx.beginPath();
      ctx.arc(PROG_X, dotY, 20, 0, Math.PI * 2);
      ctx.fillStyle = halo;
      ctx.fill();

      // Inner glow
      const inner = ctx.createRadialGradient(PROG_X, dotY, 0, PROG_X, dotY, 10);
      inner.addColorStop(0,   'rgba(255, 160, 40, 0.75)');
      inner.addColorStop(0.6, 'rgba(255, 122, 0, 0.4)');
      inner.addColorStop(1,   'rgba(255, 122, 0, 0)');
      ctx.beginPath();
      ctx.arc(PROG_X, dotY, 10, 0, Math.PI * 2);
      ctx.fillStyle = inner;
      ctx.fill();

      // Solid dot
      ctx.beginPath();
      ctx.arc(PROG_X, dotY, 7, 0, Math.PI * 2);
      ctx.fillStyle   = '#FF7A00';
      ctx.shadowColor = 'rgba(255, 122, 0, 0.9)';
      ctx.shadowBlur  = 16;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Specular highlight
      ctx.beginPath();
      ctx.arc(PROG_X - 1.5, dotY - 2, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.fill();
    }

    ctx.restore();

    phaseRef.current -= 1.3; // flow speed — negative = wave scrolls left
    rafRef.current = requestAnimationFrame(draw);
  }, [progress]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const parent = canvas.parentElement;

    const resize = () => {
      const w = parent.clientWidth;
      const h = 44;
      canvas.style.width  = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.width  = w * dpr;
      canvas.height = h * dpr;
    };

    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(parent);

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafRef.current);
    };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', width: '100%' }}
    />
  );
};

/* ─────────────────────────────────────────────────────────────────────────────
   Helper formatters
───────────────────────────────────────────────────────────────────────────── */
const fmt = (bytes) => {
  if (!bytes || bytes <= 0) return '0 KB';
  const k = 1024, sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const fmtSpeed = (bps) => {
  if (!bps || bps <= 0) return '0 KB/s';
  return `${fmt(bps)}/s`;
};

const fmtTime = (totalBytes, transferred, bps) => {
  if (!bps || bps <= 0) return '--';
  const rem = totalBytes - transferred;
  if (rem <= 0) return '0s';
  const s = Math.ceil(rem / bps);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
};

/* ─────────────────────────────────────────────────────────────────────────────
   Icon components (thin white outline, minimal)
───────────────────────────────────────────────────────────────────────────── */
const DownloadIcon = () => (
  <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
    <path d="M20 7V28" stroke="#FF7A00" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12 21L20 29L28 21" stroke="#FF7A00" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M9 34H31" stroke="#FF7A00" strokeWidth="2.6" strokeLinecap="round"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
    <polyline points="8 21 16 29 32 12" stroke="#22C55E" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const ErrorIcon = () => (
  <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
    <path d="M20 16V22" stroke="#EF4444" strokeWidth="2.6" strokeLinecap="round"/>
    <circle cx="20" cy="28" r="1.5" fill="#EF4444"/>
    <path d="M16.8 8.5L4.5 29A3.7 3.7 0 0 0 8.2 35H31.8A3.7 3.7 0 0 0 35.5 29L23.2 8.5A3.7 3.7 0 0 0 16.8 8.5Z" stroke="#EF4444" strokeWidth="2.2" strokeLinejoin="round"/>
  </svg>
);

const SpinnerIcon = () => (
  <svg width="40" height="40" viewBox="0 0 40 40" fill="none"
    style={{ animation: 'infoUpdateSpin 1.2s linear infinite' }}>
    <circle cx="20" cy="20" r="14" stroke="rgba(255,255,255,0.08)" strokeWidth="2.6"/>
    <path d="M20 6 A14 14 0 0 1 34 20" stroke="#FF7A00" strokeWidth="2.6" strokeLinecap="round"/>
  </svg>
);

const PauseIcon = () => (
  <svg width="12" height="14" viewBox="0 0 12 14" fill="none">
    <rect x="0.5" y="0.5" width="3.5" height="13" rx="1.5" fill="white"/>
    <rect x="8" y="0.5" width="3.5" height="13" rx="1.5" fill="white"/>
  </svg>
);

const ResumeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <polygon points="2,1 13,7 2,13" fill="white"/>
  </svg>
);

const SpeedIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a10 10 0 0 1 10 10"/>
    <path d="M12 2a10 10 0 0 0-10 10"/>
    <path d="M2 12a10 10 0 0 0 10 10"/>
    <path d="M22 12a10 10 0 0 1-10 10"/>
    <path d="M12 12L8.5 8.5"/>
    <circle cx="12" cy="12" r="1.2" fill="rgba(255,255,255,0.4)" stroke="none"/>
  </svg>
);

const ClockIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 15.5 14.5"/>
  </svg>
);

/* ─────────────────────────────────────────────────────────────────────────────
   Main Component
───────────────────────────────────────────────────────────────────────────── */
const UpdateNotification = () => {
  const [status, setStatus]               = useState('idle');
  const [progress, setProgress]           = useState(0);
  const [bytesPerSecond, setBps]          = useState(0);
  const [totalBytes, setTotalBytes]       = useState(149210342);
  const [transferredBytes, setTransferred]= useState(0);
  const [errorMessage, setErrorMessage]   = useState('');
  const [isPaused, setIsPaused]           = useState(false);
  const [hovering, setHovering]           = useState(false);

  useEffect(() => {
    if (!window.electronAPI) return;

    const unbindStatus = window.electronAPI.onUpdateStatusChanged((state) => {
      if (isPaused) return;
      if (state.status === 'checking')          { setStatus('checking'); }
      else if (state.status === 'downloading')  {
        setStatus('downloading');
        setProgress(Math.round(state.percent || 0));
        setBps(state.bytesPerSecond || 0);
      }
      else if (state.status === 'downloaded')   { setStatus('completed'); setProgress(100); }
      else if (state.status === 'error')        { setStatus('failed'); setErrorMessage(state.errorMessage || 'Unknown error'); }
    });

    const unbindAvailable = window.electronAPI.onUpdateAvailable(() => setStatus('checking'));

    const unbindProgress = window.electronAPI.onUpdateProgress((_ev, info) => {
      if (isPaused) return;
      setStatus('downloading');
      setProgress(Math.round(info.percent || 0));
      setBps(info.bytesPerSecond || 0);
      if (info.total)       setTotalBytes(info.total);
      if (info.transferred) setTransferred(info.transferred);
    });

    const unbindDownloaded = window.electronAPI.onUpdateDownloaded(() => {
      setStatus('completed'); setProgress(100);
    });

    window.electronAPI.getUpdaterStatus().then((state) => {
      if (!state || state.status === 'idle') return;
      if (state.status === 'checking')         setStatus('checking');
      else if (state.status === 'downloading') {
        setStatus('downloading');
        setProgress(Math.round(state.percent || 0));
        setBps(state.bytesPerSecond || 0);
      }
      else if (state.status === 'downloaded')  { setStatus('completed'); setProgress(100); }
      else if (state.status === 'error')       { setStatus('failed'); setErrorMessage(state.errorMessage || ''); }
    });

    return () => {
      unbindStatus?.();
      unbindAvailable?.();
      unbindProgress?.();
      unbindDownloaded?.();
    };
  }, [isPaused]);

  // Auto-hide completed/failed/checking
  useEffect(() => {
    if (status === 'completed' || status === 'failed') {
      const t = setTimeout(() => setStatus('idle'), 6000);
      return () => clearTimeout(t);
    }
    if (status === 'checking') {
      const t = setTimeout(() => setStatus('idle'), 15000);
      return () => clearTimeout(t);
    }
  }, [status]);

  const handlePauseToggle = () => {
    if (status === 'downloading')  { setStatus('paused');       setIsPaused(true); }
    else if (status === 'paused')  { setStatus('downloading');  setIsPaused(false); }
  };

  const handleRetry = () => {
    setStatus('checking'); setErrorMessage('');
    window.electronAPI?.checkForUpdates?.();
  };

  const handleInstall = () => {
    setStatus('installing');
    window.electronAPI?.installUpdate?.();
  };

  if (status === 'idle') return null;

  const isDownloading = status === 'downloading';
  const isPausedState = status === 'paused';
  const showWave      = isDownloading || isPausedState;
  const computed      = transferredBytes || Math.round((progress / 100) * totalBytes);

  const getTitle = () => {
    switch (status) {
      case 'checking':   return 'Checking for Updates';
      case 'downloading': return 'Downloading Update...';
      case 'paused':     return 'Update Paused';
      case 'completed':  return 'Update Ready!';
      case 'failed':     return 'Update Failed';
      case 'installing': return 'Installing...';
      default: return 'Update Available';
    }
  };

  const getSubtitle = () => {
    if (isDownloading) return `${progress}% completed  •  ${fmt(computed)} of ${fmt(totalBytes)}`;
    if (isPausedState) return `Paused at ${progress}%  •  ${fmt(computed)} of ${fmt(totalBytes)}`;
    if (status === 'checking')   return 'Searching for the latest version...';
    if (status === 'completed')  return 'Ready to install. Restart to apply.';
    if (status === 'failed')     return errorMessage || 'Connection lost. Please retry.';
    if (status === 'installing') return 'Restarting and applying update...';
    return '';
  };

  const getIcon = () => {
    if (status === 'completed')  return <CheckIcon />;
    if (status === 'failed')     return <ErrorIcon />;
    if (status === 'checking' || status === 'installing') return <SpinnerIcon />;
    return <DownloadIcon />;
  };

  const iconBorderColor =
    status === 'completed' ? 'rgba(34, 197, 94, 0.3)' :
    status === 'failed'    ? 'rgba(239, 68, 68, 0.3)' :
    'rgba(255, 255, 255, 0.10)';

  return (
    <>
      {/* Keyframes injected once */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        @keyframes infoUpdateSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .info-update-btn:hover {
          background: #111111 !important;
          border-color: rgba(255,255,255,0.36) !important;
          box-shadow: 0 0 20px rgba(255,255,255,0.04) !important;
        }
        .info-update-btn:active {
          transform: scale(0.97);
        }
        .info-update-action-btn:hover {
          opacity: 0.88;
        }
      `}</style>

      <AnimatePresence>
        {status !== 'idle' && (
          <div style={{
            position: 'fixed',
            bottom: '28px',
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 9999,
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          }}>
            <motion.div
              initial={{ opacity: 0, y: 52, scale: 0.94 }}
              animate={{ opacity: 1, y: 0,  scale: 1 }}
              exit={{    opacity: 0, y: 30,  scale: 0.96 }}
              transition={{ type: 'spring', damping: 22, stiffness: 220, mass: 0.9 }}
              style={{
                pointerEvents: 'auto',
                width: '740px',
                background: '#0D0D0D',
                border: '1.5px solid rgba(255,255,255,0.13)',
                borderRadius: '26px',
                padding: '28px 30px 24px',
                boxShadow: `
                  0 0 0 0.5px rgba(255,255,255,0.04) inset,
                  0 36px 72px rgba(0,0,0,0.88),
                  0 0 80px rgba(255,122,0,0.035)
                `,
                boxSizing: 'border-box',
                WebkitFontSmoothing: 'antialiased',
              }}
            >
              {/* ── Header ── */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '18px', marginBottom: showWave ? '26px' : '0' }}>
                {/* Icon */}
                <div style={{
                  width: '80px', height: '80px', flexShrink: 0,
                  background: '#111111',
                  border: `1.5px solid ${iconBorderColor}`,
                  borderRadius: '18px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 6px 24px rgba(0,0,0,0.55)',
                }}>
                  {getIcon()}
                </div>

                {/* Title + Subtitle */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '26px', fontWeight: 700, color: '#FFFFFF',
                    letterSpacing: '-0.55px', lineHeight: 1.15, marginBottom: '7px',
                  }}>
                    {getTitle()}
                  </div>
                  <div style={{
                    fontSize: '15px', fontWeight: 400, color: '#767676',
                    letterSpacing: '-0.1px', lineHeight: 1.4,
                  }}>
                    {getSubtitle()}
                  </div>
                </div>
              </div>

              {/* ── Wave Progress ── */}
              {showWave && (
                <div style={{ margin: '0 -2px', paddingBottom: '2px' }}>
                  <WaveCanvas progress={isPausedState ? progress : progress} />
                </div>
              )}

              {/* ── Divider ── */}
              {showWave && (
                <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '18px 0 20px' }} />
              )}

              {/* Non-wave status: spacer */}
              {!showWave && <div style={{ height: '20px' }} />}

              {/* ── Footer ── */}
              <div style={{ display: 'flex', alignItems: 'center' }}>

                {/* Stats */}
                {isDownloading && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                      <SpeedIcon />
                      <div>
                        <div style={{ fontSize: '9.5px', fontWeight: 500, color: '#3C3C3C', textTransform: 'uppercase', letterSpacing: '0.65px', marginBottom: '2px' }}>Speed</div>
                        <div style={{ fontSize: '13.5px', fontWeight: 500, color: '#A0A0A0', letterSpacing: '-0.2px' }}>{fmtSpeed(bytesPerSecond)}</div>
                      </div>
                    </div>

                    <div style={{ width: '1px', height: '26px', background: 'rgba(255,255,255,0.07)', margin: '0 18px' }} />

                    <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                      <ClockIcon />
                      <div>
                        <div style={{ fontSize: '9.5px', fontWeight: 500, color: '#3C3C3C', textTransform: 'uppercase', letterSpacing: '0.65px', marginBottom: '2px' }}>Time</div>
                        <div style={{ fontSize: '13.5px', fontWeight: 500, color: '#A0A0A0', letterSpacing: '-0.2px' }}>{fmtTime(totalBytes, computed, bytesPerSecond)}</div>
                      </div>
                    </div>
                  </>
                )}

                {isPausedState && (
                  <div style={{ fontSize: '13px', fontWeight: 400, color: '#555555', letterSpacing: '-0.1px' }}>
                    Download paused
                  </div>
                )}

                {status === 'checking' && (
                  <div style={{ fontSize: '13px', fontWeight: 400, color: '#555555' }}>
                    Connecting to update server...
                  </div>
                )}

                {status === 'failed' && (
                  <div style={{ fontSize: '13px', fontWeight: 400, color: '#EF4444', opacity: 0.8 }}>
                    {errorMessage || 'Unable to reach server'}
                  </div>
                )}

                {status === 'completed' && (
                  <div style={{ fontSize: '13px', fontWeight: 400, color: '#22C55E', opacity: 0.85 }}>
                    Download complete
                  </div>
                )}

                {/* Spacer */}
                <div style={{ flex: 1 }} />

                {/* Action Buttons */}
                {(isDownloading || isPausedState) && (
                  <button
                    className="info-update-btn"
                    onClick={handlePauseToggle}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '9px',
                      background: '#000000',
                      border: '1.5px solid rgba(255,255,255,0.17)',
                      borderRadius: '13px',
                      height: '48px', padding: '0 22px',
                      color: '#FFFFFF',
                      fontSize: '14px', fontWeight: 600,
                      fontFamily: 'inherit',
                      letterSpacing: '-0.2px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      outline: 'none',
                    }}
                  >
                    {isPausedState ? <ResumeIcon /> : <PauseIcon />}
                    {isPausedState ? 'Resume' : 'Pause'}
                  </button>
                )}

                {status === 'failed' && (
                  <button
                    className="info-update-action-btn"
                    onClick={handleRetry}
                    style={{
                      background: '#FF7A00',
                      border: 'none', outline: 'none',
                      borderRadius: '13px',
                      height: '48px', padding: '0 22px',
                      color: '#FFFFFF',
                      fontSize: '14px', fontWeight: 600,
                      fontFamily: 'inherit', letterSpacing: '-0.2px',
                      cursor: 'pointer',
                      transition: 'opacity 0.15s',
                      boxShadow: '0 4px 16px rgba(255,122,0,0.3)',
                    }}
                  >
                    Retry
                  </button>
                )}

                {status === 'completed' && (
                  <button
                    className="info-update-action-btn"
                    onClick={handleInstall}
                    style={{
                      background: '#FF7A00',
                      border: 'none', outline: 'none',
                      borderRadius: '13px',
                      height: '48px', padding: '0 22px',
                      color: '#FFFFFF',
                      fontSize: '14px', fontWeight: 600,
                      fontFamily: 'inherit', letterSpacing: '-0.2px',
                      cursor: 'pointer',
                      transition: 'opacity 0.15s',
                      boxShadow: '0 4px 16px rgba(255,122,0,0.3)',
                    }}
                  >
                    Restart &amp; Install
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default UpdateNotification;
