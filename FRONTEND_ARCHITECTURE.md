# InfoBill POS — Frontend Architecture

This document describes the structure, state management, and design philosophy of the InfoBill POS frontend (React 18).

## 📂 Directory Structure

The frontend is organized by feature and technical domain:

```text
frontend/src/
├── api/             # Axios instance, interceptors, and typed API services
├── components/
│   ├── common/      # Reusable general-purpose UI blocks (ToastItem, ConfirmModal)
│   ├── screens/     # Top-level route components (Bill, Analytics, Management)
│   ├── system/      # Hidden infrastructure (ErrorBoundary, ApiErrorListener)
│   ├── ui/          # Core Design System components (Button, Card, Sidebar)
│   └── workers/     # Feature-specific components for the Worker module
├── context/         # Global React Context providers
├── hooks/           # Custom React hooks (useAnimation, useDebounce)
├── services/        # Frontend business logic separated from UI
├── styles/          # Global CSS, CSS variables, and theme definitions
└── utils/           # Helper functions (formatting, date logic)
```

## 🏗️ State Management

The application avoids heavy state management libraries (like Redux or Zustand) in favor of React Context. This is appropriate given the localized nature of POS data.

### Core Contexts

1. **`ThemeContext`**: Manages Light/Dark mode and exposes the global design tokens.
2. **`AlertContext`**: Provides a unified API for Toast notifications and Confirmation Modals.
3. **`SettingsContext`**: Holds shop preferences (currency, name, printer width).
4. **`POSDataContext`**: A "load-once" bootstrap context. It fetches Products, Categories, Workers, and Settings in a single `/api/pos/bootstrap` call on app startup, eliminating waterfall requests.
5. **`ReminderContext`**: Manages the global notification drawer and polling logic for application reminders.

## 🌉 API Interface Layer

All communication with the Flask backend happens through `frontend/src/api/api.js`.

- **Axios Instance**: Configured with a `15000ms` timeout to accommodate local DB export generation.
- **Request Interceptor**: Prepares the request (stubbed for future JWT auth).
- **Response Interceptor**: The single source of truth for error handling. It catches any non-2xx response, formats the backend's Canonical Error object (`{ success, error, code }`), and dispatches a standard DOM `api-error` event.

### The Error Bridge (`ApiErrorListener.jsx`)
Instead of coupling the Axios instance tightly to the React Component tree, Axios fires a DOM event. `ApiErrorListener` (mounted near the root) listens for this event and calls `useAlert().showError()`. This keeps network logic pure while ensuring users always see beautifully formatted error toasts.

## 🛡️ Production Hardening

- **`ErrorBoundary.jsx`**: Wraps the entire application. If a React render cycle crashes, it catches the error, displays a glassmorphism "Something went wrong" screen (preventing the white screen of death), and logs the stack trace to the local filesystem via an Electron IPC channel.
- **Offline Resilience**: The UI detects `navigator.onLine` status and displays a persistent banner if the backend process crashes or the network stack fails.

## 🎨 Design System

The application uses a custom-built, highly dynamic Design System mapped entirely to CSS Variables (CSS Custom Properties). Tailwind is *not* used, prioritizing maintainability and specific thematic control.

### Key Files
- `styles/theme.js`: JavaScript object representation of the theme (passed via Context to handle dynamic switches).
- `styles/design-tokens.css`: The source of truth for spacing, radii, z-indexes, and animation curves.
- `styles/global.css`: Base resets, scrollbar styling, and root variables.

### Aesthetics
- **Glassmorphism**: Heavy use of semi-transparent backgrounds with `backdrop-filter: blur()`.
- **Dynamic Feedback**: Almost every interactive element uses Framer Motion (`useAnimation` hook) for micro-interactions (e.g., button press scaling, toast pop-ins, cart item entry).
- **Typography**: Inter (primary UI) and Roboto Mono (receipts/tabular data).

## 🚀 Routing

The app is wrapped in a `HashRouter` (required for Electron compatibility, as standard browser history API doesn't work well over `file://` protocol in packaged apps).

```javascript
// App.jsx structure
<ErrorBoundary>
  <ThemeProvider>
    <AlertProvider>
      <POSDataProvider>
        <HashRouter>
          <ApiErrorListener /> {/* Invisible */}
          <Sidebar />
          <Routes>
            <Route path="/" element={<WorkingPOSInterface />} />
            <Route path="/analytics" element={<Analytics />} />
            {/* ... other routes ... */}
          </Routes>
        </HashRouter>
      </POSDataProvider>
    </AlertProvider>
  </ThemeProvider>
</ErrorBoundary>
```
