/**
 * =============================================================================
 * POS DATA CONTEXT — POSDataContext.jsx
 * =============================================================================
 *
 * PRODUCTION PATTERN: Load-Once, Run-From-Memory
 *
 * This context calls GET /api/pos/bootstrap on app mount and stores
 * products, categories, workers, and settings in React state.
 *
 * All screens consume this context instead of making their own API calls.
 * Data is refreshed:
 *   - Products: after bill creation (event-driven)
 *   - Categories: after category mutations
 *   - Everything: on manual refresh or every 5 minutes (idle interval)
 *
 * BONUS: Idle-time preloading of analytics data for instant screen loads.
 * =============================================================================
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { posAPI } from '../api/pos';

const POSDataContext = createContext();

export const usePOSData = () => {
    const context = useContext(POSDataContext);
    if (!context) {
        throw new Error('usePOSData must be used within a POSDataProvider');
    }
    return context;
};

// Refresh analytics cache every 5 minutes
const ANALYTICS_REFRESH_INTERVAL = 5 * 60 * 1000;

export const POSDataProvider = ({ children }) => {
    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [workers, setWorkers] = useState([]);
    const [nextBillNumber, setNextBillNumber] = useState(1);
    const [bootstrapLoading, setBootstrapLoading] = useState(true);
    const [bootstrapError, setBootstrapError] = useState(null);
    const [lastBootstrapTime, setLastBootstrapTime] = useState(null);

    // Catalog version tracking
    const catalogVersionRef = useRef("0");

    // Analytics pre-cache (loaded in idle time)
    const [cachedAnalytics, setCachedAnalytics] = useState(null);
    const analyticsTimerRef = useRef(null);

    // ------------------------------------------------------------------
    // Bootstrap: Load everything in one request
    // ------------------------------------------------------------------
    const bootstrap = useCallback(async () => {
        try {
            setBootstrapLoading(true);
            setBootstrapError(null);

            const data = await posAPI.bootstrap();

            if (data.success) {
                setProducts(data.products || []);
                setCategories(data.categories || []);
                setWorkers(data.workers || []);
                setNextBillNumber(data.next_bill_number || 1);
                setLastBootstrapTime(Date.now());
                catalogVersionRef.current = data.settings?.catalog_version || "0";
            } else {
                throw new Error(data.message || 'Bootstrap failed');
            }
        } catch (err) {
            console.error('POS Bootstrap failed:', err);
            setBootstrapError(err.message);
            
            // Fallback: try to load products individually
            try {
                const fallback = await posAPI.refreshProducts();
                if (fallback.products) {
                    setProducts(fallback.products);
                }
            } catch (fallbackErr) {
                console.error('Fallback product load also failed:', fallbackErr);
            }
        } finally {
            setBootstrapLoading(false);
        }
    }, []);

    // ------------------------------------------------------------------
    // Targeted refresh functions (called after mutations)
    // ------------------------------------------------------------------
    const refreshProducts = useCallback(async () => {
        try {
            const data = await posAPI.refreshProducts();
            if (data.products) {
                setProducts(data.products);
            }
            // Sync current catalog version to avoid duplicate updates
            const { default: api } = await import('../utils/api');
            const versionRes = await api.get('/api/products/catalog-version');
            if (versionRes.data?.success) {
                catalogVersionRef.current = versionRes.data.catalog_version || "0";
            }
        } catch (err) {
            console.error('Product refresh failed:', err);
        }
    }, []);

    const checkCatalogVersion = useCallback(async () => {
        try {
            const { default: api } = await import('../utils/api');
            const response = await api.get('/api/products/catalog-version');
            if (response.data?.success) {
                const newVersion = response.data.catalog_version || "0";
                if (newVersion !== catalogVersionRef.current) {
                    console.log(`[POSDataContext] Catalog version changed from ${catalogVersionRef.current} to ${newVersion}. Reloading...`);
                    catalogVersionRef.current = newVersion;
                    
                    // Fetch lightweight products list
                    const data = await posAPI.refreshProducts();
                    if (data.products) {
                        setProducts(data.products);
                    }
                }
            }
        } catch (err) {
            console.error('Failed to check catalog version:', err);
        }
    }, []);

    const refreshWorkers = useCallback(async () => {
        try {
            // Re-fetch everything to keep it simple, or add targeted worker refresh
            const data = await posAPI.bootstrap();
            if (data.workers) {
                setWorkers(data.workers);
            }
        } catch (err) {
            console.error('Worker refresh failed:', err);
        }
    }, []);

    const refreshAll = useCallback(async () => {
        await bootstrap();
        await checkCatalogVersion();
    }, [bootstrap, checkCatalogVersion]);

    // ------------------------------------------------------------------
    // Idle-time preloading (request analytics data in background)
    // ------------------------------------------------------------------
    const preloadAnalytics = useCallback(async () => {
        try {
            const { default: api } = await import('../utils/api');
            const response = await api.get('/api/summary/today');
            if (response.data?.success) {
                setCachedAnalytics({
                    data: response.data.summary,
                    loadedAt: Date.now(),
                });
            }
        } catch (err) {
            // Silent failure — this is a background optimization
        }
    }, []);

    // ------------------------------------------------------------------
    // Lifecycle
    // ------------------------------------------------------------------
    useEffect(() => {
        bootstrap();
    }, [bootstrap]);

    // Preload analytics after initial bootstrap
    useEffect(() => {
        if (!bootstrapLoading && !bootstrapError) {
            // Use requestIdleCallback if available, else setTimeout
            const schedulePreload = window.requestIdleCallback || ((cb) => setTimeout(cb, 2000));
            schedulePreload(() => preloadAnalytics());
        }
    }, [bootstrapLoading, bootstrapError, preloadAnalytics]);

    // Refresh analytics every 5 minutes
    useEffect(() => {
        analyticsTimerRef.current = setInterval(() => {
            preloadAnalytics();
        }, ANALYTICS_REFRESH_INTERVAL);

        return () => {
            if (analyticsTimerRef.current) {
                clearInterval(analyticsTimerRef.current);
            }
        };
    }, [preloadAnalytics]);

    // Periodically check for catalog updates every 1 minute
    useEffect(() => {
        const interval = setInterval(() => {
            checkCatalogVersion();
        }, 60000); // 1 minute
        return () => clearInterval(interval);
    }, [checkCatalogVersion]);

    // ------------------------------------------------------------------
    // Context API
    // ------------------------------------------------------------------
    const value = {
        // Data
        products,
        categories,
        workers,
        nextBillNumber,

        // Loading state
        bootstrapLoading,
        bootstrapError,
        lastBootstrapTime,

        // Refresh functions
        refreshProducts,    // After bill creation (stock changed)
        refreshWorkers,     // After worker mutations
        refreshAll,         // Full re-bootstrap
        checkCatalogVersion, // Manual/mount catalog verification
        setProducts,        // Direct state update (for optimistic UI)
        setCategories,      // Direct state update
        setWorkers,         // Direct state update

        // Analytics pre-cache
        cachedAnalytics,
        preloadAnalytics,
    };

    return (
        <POSDataContext.Provider value={value}>
            {children}
        </POSDataContext.Provider>
    );
};

export default POSDataContext;
