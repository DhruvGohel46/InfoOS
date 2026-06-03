import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/**
 * Guard for admin-only routes.
 * In worker mode, it opens the unlock modal and returns to billing.
 */
export default function AdminRoute({ children }) {
  const { isAdmin, openUnlock } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAdmin) {
      openUnlock(location.pathname);
      navigate('/', { replace: true });
    }
  }, [isAdmin, openUnlock, location.pathname, navigate]);

  if (!isAdmin) return null;
  return children;
}

