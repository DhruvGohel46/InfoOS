/**
 * =============================================================================
 * ERROR BOUNDARY — Global React Error Catcher
 * =============================================================================
 *
 * Wraps the entire application to catch unhandled JavaScript errors in the
 * React component tree. Renders a full-screen fallback UI instead of a
 * white screen of death.
 *
 * Features:
 *   - Catches render errors, lifecycle errors, and constructor errors
 *   - Displays a themed fallback screen with glassmorphism styling
 *   - Logs errors to the Electron IPC channel (if available)
 *   - Provides a "Reload App" button to recover
 *   - Does NOT catch errors in event handlers or async code
 *     (those are handled by the Axios interceptor + ApiErrorListener)
 *
 * Usage in App.jsx:
 *   <ErrorBoundary>
 *     <AppContent />
 *   </ErrorBoundary>
 * =============================================================================
 */
import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });

    // Log to console
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);

    // Log to Electron IPC if available
    if (window.electronAPI?.writeLog) {
      try {
        window.electronAPI.writeLog({
          level: 'error',
          source: 'ErrorBoundary',
          message: error?.message || String(error),
          stack: error?.stack || '',
          componentStack: errorInfo?.componentStack || '',
          timestamp: new Date().toISOString(),
        });
      } catch (_) {
        // IPC not available — ignore
      }
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleDismiss = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #0f1117 0%, #1a1d28 50%, #12141c 100%)',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
            color: '#e4e4e7',
          }}
        >
          <div
            style={{
              maxWidth: '520px',
              width: '90%',
              padding: '40px',
              borderRadius: '24px',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              boxShadow: '0 24px 48px rgba(0, 0, 0, 0.4)',
              textAlign: 'center',
            }}
          >
            {/* Icon */}
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '16px',
                background: 'rgba(239, 68, 68, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 24px auto',
                fontSize: '28px',
              }}
            >
              ⚠️
            </div>

            {/* Title */}
            <h1
              style={{
                margin: '0 0 8px 0',
                fontSize: '22px',
                fontWeight: 700,
                letterSpacing: '0.2px',
                color: '#f4f4f5',
              }}
            >
              Something went wrong
            </h1>

            {/* Subtitle */}
            <p
              style={{
                margin: '0 0 24px 0',
                fontSize: '14px',
                color: '#a1a1aa',
                lineHeight: 1.6,
              }}
            >
              An unexpected error occurred in the application. You can try
              reloading or going back to the previous screen.
            </p>

            {/* Error message (collapsed) */}
            {this.state.error && (
              <div
                style={{
                  marginBottom: '24px',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  background: 'rgba(239, 68, 68, 0.06)',
                  border: '1px solid rgba(239, 68, 68, 0.15)',
                  textAlign: 'left',
                  maxHeight: '120px',
                  overflow: 'auto',
                }}
              >
                <code
                  style={{
                    fontSize: '12px',
                    color: '#fca5a5',
                    fontFamily: "'Fira Code', 'Consolas', monospace",
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {this.state.error.message || String(this.state.error)}
                </code>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={this.handleDismiss}
                style={{
                  padding: '10px 24px',
                  borderRadius: '12px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: '#a1a1aa',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                }}
              >
                Try Again
              </button>
              <button
                onClick={this.handleReload}
                style={{
                  padding: '10px 24px',
                  borderRadius: '12px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #f97316, #ea580c)',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 4px 16px rgba(249, 115, 22, 0.3)',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(249, 115, 22, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(249, 115, 22, 0.3)';
                }}
              >
                Reload App
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
