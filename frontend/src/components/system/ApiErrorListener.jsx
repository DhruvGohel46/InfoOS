/**
 * =============================================================================
 * API ERROR LISTENER — Global Axios Error → Toast Bridge
 * =============================================================================
 *
 * Listens for 'api-error' custom events dispatched by the Axios response
 * interceptor (in api/api.js) and displays toast notifications using the
 * existing AlertContext system.
 *
 * This component should be mounted ONCE inside AppContent (after AlertProvider).
 * It does NOT render any visible UI — it only listens and fires toasts.
 *
 * Network errors (backend offline) show a distinct warning toast instead
 * of a generic error, to help users distinguish connectivity issues from
 * application bugs.
 * =============================================================================
 */
import { useEffect } from 'react';
import { useAlert } from '../../context/AlertContext';

export default function ApiErrorListener() {
  const { showError, showWarning } = useAlert();

  useEffect(() => {
    const handleApiError = (event) => {
      const { message, isNetworkError } = event.detail || {};

      if (isNetworkError) {
        showWarning(
          message || 'Unable to connect to the server. Please check if the backend is running.',
          6000
        );
      } else {
        showError(
          message || 'An unexpected error occurred',
          5000
        );
      }
    };

    window.addEventListener('api-error', handleApiError);
    return () => window.removeEventListener('api-error', handleApiError);
  }, [showError, showWarning]);

  // This component renders nothing visible
  return null;
}
