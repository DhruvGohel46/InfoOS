import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
    IoLocateOutline,
    IoSearchOutline,
    IoCheckmarkCircleOutline,
    IoAlertCircleOutline,
    IoPinOutline,
    IoRefreshOutline,
} from 'react-icons/io5';

// Custom Glowing SVG Marker Icon
const createPinIcon = () => {
    return L.divIcon({
        className: 'infoos-map-pin-container',
        html: `
            <div style="position: relative; width: 36px; height: 44px; display: flex; align-items: center; justify-content: center;">
                <div style="position: absolute; bottom: 0; width: 14px; height: 6px; background: rgba(0,0,0,0.35); border-radius: 50%; filter: blur(2px);"></div>
                <div style="
                    width: 32px; 
                    height: 32px; 
                    background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); 
                    border: 2.5px solid #ffffff; 
                    border-radius: 50% 50% 50% 0; 
                    transform: rotate(-45deg); 
                    box-shadow: 0 4px 12px rgba(249, 115, 22, 0.45);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-bottom: 8px;
                ">
                    <div style="width: 10px; height: 10px; background: #ffffff; border-radius: 50%; transform: rotate(45deg);"></div>
                </div>
            </div>
        `,
        iconSize: [36, 44],
        iconAnchor: [18, 42],
        popupAnchor: [0, -40]
    });
};

/**
 * LocationMapPicker Component
 * Allows store owners to pinpoint their shop on an interactive OpenStreetMap.
 * Updates exact latitude and longitude for hyper-local sales predictions and weather signals.
 */
const LocationMapPicker = ({
    latitude,
    longitude,
    onChange,
    address = '',
    city = '',
    state = '',
    pincode = '',
    country = '',
}) => {
    const mapContainerRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markerRef = useRef(null);

    const [locating, setLocating] = useState(false);
    const [searching, setSearching] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [reverseAddress, setReverseAddress] = useState('');

    // Default center: India (Pune / Maharashtra coordinates as sensible baseline)
    const initialLat = (latitude !== undefined && latitude !== null && !isNaN(Number(latitude)))
        ? Number(latitude)
        : 18.5204;
    const initialLon = (longitude !== undefined && longitude !== null && !isNaN(Number(longitude)))
        ? Number(longitude)
        : 73.8567;
    const hasExistingCoords = (latitude !== undefined && latitude !== null && !isNaN(Number(latitude)));

    // Reverse Geocode helper (Nominatim OSM - Global)
    const fetchReverseAddress = useCallback(async (lat, lon) => {
        try {
            const resp = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
                { headers: { 'User-Agent': 'InfoOS-POS/1.0 (infoos@local.dev)' } }
            );
            if (resp.ok) {
                const data = await resp.json();
                if (data?.display_name) {
                    setReverseAddress(data.display_name);
                }
                const addr = data?.address || {};
                const detectedCountry = addr.country || '';
                const detectedCountryCode = addr.country_code ? addr.country_code.toUpperCase() : '';
                const detectedCity = addr.city || addr.town || addr.village || addr.county || '';
                const detectedState = addr.state || '';
                const detectedPincode = addr.postcode || '';

                if (onChange) {
                    onChange({
                        latitude: lat,
                        longitude: lon,
                        country: detectedCountry,
                        countryCode: detectedCountryCode,
                        city: detectedCity,
                        state: detectedState,
                        pincode: detectedPincode,
                        formattedAddress: data?.display_name || '',
                    });
                }
            }
        } catch {
            // Silently ignore reverse geocoding network errors
        }
    }, [onChange]);

    // Update marker position and notify parent
    const updatePinPosition = useCallback((lat, lon, zoom = null, updateReverse = true) => {
        const cleanLat = Number(lat.toFixed(6));
        const cleanLon = Number(lon.toFixed(6));

        if (markerRef.current) {
            markerRef.current.setLatLng([cleanLat, cleanLon]);
        }
        if (mapInstanceRef.current && zoom) {
            mapInstanceRef.current.setView([cleanLat, cleanLon], zoom);
        } else if (mapInstanceRef.current) {
            mapInstanceRef.current.panTo([cleanLat, cleanLon]);
        }

        if (onChange) {
            onChange({ latitude: cleanLat, longitude: cleanLon });
        }
        if (updateReverse) {
            fetchReverseAddress(cleanLat, cleanLon);
        }
    }, [onChange, fetchReverseAddress]);

    // Initialize Leaflet Map
    useEffect(() => {
        if (!mapContainerRef.current) return;
        if (mapInstanceRef.current) return; // already initialized

        const map = L.map(mapContainerRef.current, {
            center: [initialLat, initialLon],
            zoom: hasExistingCoords ? 16 : 13,
            zoomControl: true,
            scrollWheelZoom: true,
        });

        // Clean OpenStreetMap Tile Layer
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        // Add Draggable Marker
        const pinIcon = createPinIcon();
        const marker = L.marker([initialLat, initialLon], {
            icon: pinIcon,
            draggable: true,
            autoPan: true,
        }).addTo(map);

        marker.on('dragend', () => {
            const pos = marker.getLatLng();
            updatePinPosition(pos.lat, pos.lng);
            setStatusMessage('Pin moved to new coordinates');
            setTimeout(() => setStatusMessage(''), 3000);
        });

        // Click anywhere on map to drop / move pin
        map.on('click', (e) => {
            updatePinPosition(e.latlng.lat, e.latlng.lng);
            setStatusMessage('Pin placed at clicked location');
            setTimeout(() => setStatusMessage(''), 3000);
        });

        mapInstanceRef.current = map;
        markerRef.current = marker;

        if (hasExistingCoords) {
            fetchReverseAddress(initialLat, initialLon);
        }

        // Clean up on unmount
        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
                markerRef.current = null;
            }
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Re-center when external coordinates change
    useEffect(() => {
        if (
            latitude !== undefined &&
            latitude !== null &&
            !isNaN(Number(latitude)) &&
            longitude !== undefined &&
            longitude !== null &&
            !isNaN(Number(longitude))
        ) {
            const currentMarkerPos = markerRef.current?.getLatLng();
            if (
                !currentMarkerPos ||
                Math.abs(currentMarkerPos.lat - Number(latitude)) > 0.0001 ||
                Math.abs(currentMarkerPos.lng - Number(longitude)) > 0.0001
            ) {
                if (markerRef.current) {
                    markerRef.current.setLatLng([Number(latitude), Number(longitude)]);
                }
                if (mapInstanceRef.current) {
                    mapInstanceRef.current.panTo([Number(latitude), Number(longitude)]);
                }
            }
        }
    }, [latitude, longitude]);

    // Handle "Use My Current Location" (Browser Geolocation API)
    const handleUseCurrentLocation = () => {
        if (!navigator.geolocation) {
            setStatusMessage('Geolocation is not supported by your browser.');
            return;
        }

        setLocating(true);
        setStatusMessage('Acquiring high-accuracy GPS position...');

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude: gpsLat, longitude: gpsLon } = position.coords;
                updatePinPosition(gpsLat, gpsLon, 17);
                setLocating(false);
                setStatusMessage('Pin set to your device location! Click Save Settings.');
                setTimeout(() => setStatusMessage(''), 4000);
            },
            (error) => {
                setLocating(false);
                setStatusMessage(`Could not detect location: ${error.message}`);
                setTimeout(() => setStatusMessage(''), 4000);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    };

    // Handle "Find from Address / City" (Worldwide)
    const handleSearchAddress = async () => {
        const query = [address, city, state, pincode, country].filter(Boolean).join(', ');
        if (!query.trim()) {
            setStatusMessage('Please enter an address, city, or pincode above first.');
            return;
        }

        setSearching(true);
        setStatusMessage(`Searching worldwide map for: "${query}"...`);

        try {
            // Primary: Open-Meteo Geocoding (Global)
            let foundLat = null;
            let foundLon = null;

            const qTerm = [city, state, country].filter(Boolean).join(' ') || pincode || address;
            if (qTerm) {
                const omResp = await fetch(
                    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(qTerm)}&count=1&language=en&format=json`
                );
                if (omResp.ok) {
                    const omData = await omResp.json();
                    if (omData?.results && omData.results.length > 0) {
                        foundLat = Number(omData.results[0].latitude);
                        foundLon = Number(omData.results[0].longitude);
                    }
                }
            }

            // Fallback: Nominatim OSM
            if (foundLat === null || foundLon === null) {
                const osmResp = await fetch(
                    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
                    { headers: { 'User-Agent': 'InfoOS-POS/1.0 (infoos@local.dev)' } }
                );
                if (osmResp.ok) {
                    const osmData = await osmResp.json();
                    if (osmData && osmData.length > 0) {
                        foundLat = Number(osmData[0].lat);
                        foundLon = Number(osmData[0].lon);
                    }
                }
            }

            if (foundLat !== null && foundLon !== null) {
                updatePinPosition(foundLat, foundLon, 16);
                setStatusMessage(`Pin located for "${query}". You can drag the pin to your exact door!`);
            } else {
                setStatusMessage(`Could not resolve coordinates for "${query}". Please click the map manually.`);
            }
        } catch (err) {
            setStatusMessage(`Search failed: ${err.message}. You can still click or drag on the map.`);
        } finally {
            setSearching(false);
            setTimeout(() => setStatusMessage(''), 5000);
        }
    };

    // Clear coordinates
    const handleClearCoordinates = () => {
        if (onChange) {
            onChange({ latitude: null, longitude: null });
        }
        setReverseAddress('');
        setStatusMessage('Location pin cleared. Will use automatic city geocoding.');
        setTimeout(() => setStatusMessage(''), 3000);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
            {/* Action Bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                        type="button"
                        onClick={handleUseCurrentLocation}
                        disabled={locating}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '7px 12px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: locating ? 'not-allowed' : 'pointer',
                            background: 'rgba(59, 130, 246, 0.12)',
                            color: '#3b82f6',
                            border: '1px solid rgba(59, 130, 246, 0.25)',
                            transition: 'all 0.15s ease',
                        }}
                    >
                        <IoLocateOutline size={15} />
                        {locating ? 'Detecting GPS...' : 'Use Current Device Location'}
                    </button>

                    <button
                        type="button"
                        onClick={handleSearchAddress}
                        disabled={searching}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '7px 12px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: searching ? 'not-allowed' : 'pointer',
                            background: 'rgba(249, 115, 22, 0.12)',
                            color: '#f97316',
                            border: '1px solid rgba(249, 115, 22, 0.25)',
                            transition: 'all 0.15s ease',
                        }}
                    >
                        <IoSearchOutline size={14} />
                        {searching ? 'Locating...' : 'Locate from Address / City'}
                    </button>
                </div>

                {hasExistingCoords && (
                    <button
                        type="button"
                        onClick={handleClearCoordinates}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '5px 10px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            background: 'transparent',
                            color: '#ef4444',
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                        }}
                    >
                        <IoRefreshOutline size={12} />
                        Reset Pin
                    </button>
                )}
            </div>

            {/* Status Message Alert */}
            {statusMessage && (
                <div style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    background: 'var(--bg-secondary, rgba(255,255,255,0.04))',
                    border: '1px solid var(--border-primary, rgba(255,255,255,0.1))',
                    color: 'var(--primary, #f97316)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                }}>
                    <IoAlertCircleOutline size={16} />
                    <span>{statusMessage}</span>
                </div>
            )}

            {/* Interactive Leaflet Map Container */}
            <div
                style={{
                    position: 'relative',
                    width: '100%',
                    height: '280px',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    border: '1.5px solid var(--border-primary, rgba(255, 255, 255, 0.15))',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.15)',
                    background: '#1a1d24',
                }}
            >
                <div
                    ref={mapContainerRef}
                    style={{ width: '100%', height: '100%', zIndex: 1 }}
                />

                {/* Map Floating Instruction Overlay */}
                <div style={{
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    zIndex: 400,
                    padding: '5px 10px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 600,
                    background: 'rgba(15, 23, 42, 0.85)',
                    color: '#e2e8f0',
                    backdropFilter: 'blur(4px)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    pointerEvents: 'none',
                }}>
                    <IoPinOutline size={13} color="#f97316" />
                    <span>Click or drag pin to your shop</span>
                </div>
            </div>

            {/* Coordinates Badge Footer */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
                padding: '8px 12px',
                borderRadius: '8px',
                background: 'var(--bg-secondary, rgba(255,255,255,0.03))',
                border: '1px solid var(--border-primary, rgba(255,255,255,0.08))',
                fontSize: '12px',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: 'var(--text-muted, #94a3b8)', fontWeight: 500 }}>Pinned Coordinates:</span>
                    {hasExistingCoords ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{
                                padding: '2px 8px',
                                borderRadius: '4px',
                                background: 'rgba(34, 197, 94, 0.15)',
                                color: '#22c55e',
                                fontWeight: 700,
                                fontFamily: 'monospace',
                                fontSize: '12px',
                            }}>
                                Lat: {Number(latitude).toFixed(5)}, Lon: {Number(longitude).toFixed(5)}
                            </span>
                            <IoCheckmarkCircleOutline size={16} color="#22c55e" title="Coordinates Saved" />
                        </div>
                    ) : (
                        <span style={{ color: 'var(--text-muted, #94a3b8)', fontStyle: 'italic' }}>
                            Not pinned yet (using automatic city geocoding)
                        </span>
                    )}
                </div>

                {reverseAddress && (
                    <div style={{
                        maxWidth: '400px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: 'var(--text-muted, #94a3b8)',
                        fontSize: '11px',
                    }} title={reverseAddress}>
                        📍 {reverseAddress}
                    </div>
                )}
            </div>
        </div>
    );
};

export default LocationMapPicker;
