import React, { useMemo } from 'react';
import '../../styles/OrderCelebration.css';

/**
 * CelebrationAvatar — Pure SVG Animated Cartoon Avatar Mascot
 *
 * Visual Features:
 * - Dynamic SVG character mascot ("Cheery Chef & Milestone Hero")
 * - Standard Tier: Cheerful chef mascot waving a golden milestone star with animated chef hat
 * - Grand Tier: Triumphant crowned champion holding a gleaming golden trophy with radiant sunburst
 * - Pure SVG vectors with CSS animations:
 *   - Mascot joyful bouncing & breathing
 *   - Natural periodic eye blinking with shiny star catchlights
 *   - Cheering / waving arms
 *   - Rotating sunburst rays behind avatar
 *   - Orbiting floating stars & confetti sparkles
 *   - Soft responsive pedestal shadow
 */
const CelebrationAvatar = ({
    count = 50,
    isGrand = false,
    size = 170
}) => {
    // Unique gradient IDs to prevent collisions
    const uid = useMemo(() => Math.random().toString(36).substring(2, 8), []);

    return (
        <div className={`oc-avatar-stage ${isGrand ? 'oc-avatar-grand' : 'oc-avatar-standard'}`} style={{ width: size, height: size }}>
            {/* Background Rotating Sunburst Rays */}
            <svg
                className="oc-avatar-sunburst"
                viewBox="0 0 200 200"
                xmlns="http://www.w3.org/2000/svg"
            >
                <g transform="translate(100, 100)">
                    {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((angle, idx) => (
                        <path
                            key={idx}
                            d="M -9 -100 L 9 -100 L 0 0 Z"
                            fill={isGrand ? 'rgba(245, 158, 11, 0.18)' : 'rgba(249, 115, 22, 0.14)'}
                            transform={`rotate(${angle})`}
                        />
                    ))}
                </g>
            </svg>

            {/* Orbiting Sparkles & Floating Star Burst */}
            <div className="oc-orbit-sparkle oc-sparkle-1">✦</div>
            <div className="oc-orbit-sparkle oc-sparkle-2">★</div>
            <div className="oc-orbit-sparkle oc-sparkle-3">✦</div>
            <div className="oc-orbit-sparkle oc-sparkle-4">★</div>

            {/* Main Character SVG */}
            <svg
                className="oc-avatar-svg"
                viewBox="0 0 200 210"
                width={size}
                height={size * 1.05}
                xmlns="http://www.w3.org/2000/svg"
            >
                <defs>
                    {/* Primary Orange Gradient */}
                    <linearGradient id={`grad_primary_${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#ff8a3d" />
                        <stop offset="100%" stopColor="#f97316" />
                    </linearGradient>

                    {/* Gold Gradient (for Grand tier & stars/trophy) */}
                    <linearGradient id={`grad_gold_${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#fde047" />
                        <stop offset="45%" stopColor="#f59e0b" />
                        <stop offset="100%" stopColor="#d97706" />
                    </linearGradient>

                    {/* Skin Tone Gradient */}
                    <linearGradient id={`grad_skin_${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#ffe4d6" />
                        <stop offset="100%" stopColor="#fcd3be" />
                    </linearGradient>

                    {/* Chef Hat / Coat Clean White Gradient */}
                    <linearGradient id={`grad_white_${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#ffffff" />
                        <stop offset="100%" stopColor="#f1f5f9" />
                    </linearGradient>

                    {/* Soft Ground Shadow Filter */}
                    <filter id={`blur_shadow_${uid}`} x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="4" />
                    </filter>
                </defs>

                {/* ── Ground Pedestal Shadow (Pulsing with jump) ── */}
                <ellipse
                    className="oc-pedestal-shadow"
                    cx="100"
                    cy="196"
                    rx="46"
                    ry="8"
                    fill="rgba(15, 23, 42, 0.22)"
                    filter={`url(#blur_shadow_${uid})`}
                />

                {/* ── Animated Character Root (Bouncing / Cheering) ── */}
                <g className="oc-mascot-body-group">

                    {/* ── LEFT ARM (Waving Golden Star) ── */}
                    <g className="oc-arm-left">
                        {/* Arm Sleeve */}
                        <path
                            d="M 68 135 C 50 128, 38 116, 32 98 C 30 92, 38 88, 43 93 C 48 106, 56 117, 72 124 Z"
                            fill={`url(#grad_white_${uid})`}
                            stroke="#e2e8f0"
                            strokeWidth="1.5"
                        />
                        {/* Cute Hand */}
                        <circle cx="31" cy="95" r="9" fill={`url(#grad_skin_${uid})`} />
                        <circle cx="28" cy="91" r="4.5" fill={`url(#grad_skin_${uid})`} />

                        {/* Sparkling Golden Milestone Star in Hand */}
                        <g className="oc-hand-star" transform="translate(24, 76)">
                            <path
                                d="M 12 0 L 15.5 8 L 24 9.5 L 18 15.5 L 19.5 24 L 12 20 L 4.5 24 L 6 15.5 L 0 9.5 L 8.5 8 Z"
                                fill={`url(#grad_gold_${uid})`}
                                stroke="#b45309"
                                strokeWidth="0.75"
                            />
                            {/* Star Sparkle Glint */}
                            <circle cx="12" cy="12" r="3" fill="#ffffff" opacity="0.85" />
                        </g>
                    </g>

                    {/* ── RIGHT ARM (Cheering Thumbs Up or Trophy for Grand) ── */}
                    <g className="oc-arm-right">
                        {isGrand ? (
                            /* Grand Tier: Raising Golden Milestone Trophy */
                            <g>
                                <path
                                    d="M 132 135 C 148 128, 160 114, 164 96 C 166 90, 158 86, 153 91 C 147 104, 140 115, 126 124 Z"
                                    fill={`url(#grad_white_${uid})`}
                                    stroke="#e2e8f0"
                                    strokeWidth="1.5"
                                />
                                <circle cx="165" cy="93" r="9" fill={`url(#grad_skin_${uid})`} />

                                {/* Champion Golden Trophy */}
                                <g className="oc-hand-trophy" transform="translate(150, 58)">
                                    {/* Cup Body */}
                                    <path
                                        d="M 6 0 L 26 0 C 26 14, 22 22, 16 26 C 10 22, 6 14, 6 0 Z"
                                        fill={`url(#grad_gold_${uid})`}
                                        stroke="#b45309"
                                        strokeWidth="1"
                                    />
                                    {/* Left Handle */}
                                    <path
                                        d="M 6 4 C 0 4, 0 14, 6 16"
                                        fill="none"
                                        stroke={`url(#grad_gold_${uid})`}
                                        strokeWidth="2.5"
                                        strokeLinecap="round"
                                    />
                                    {/* Right Handle */}
                                    <path
                                        d="M 26 4 C 32 4, 32 14, 26 16"
                                        fill="none"
                                        stroke={`url(#grad_gold_${uid})`}
                                        strokeWidth="2.5"
                                        strokeLinecap="round"
                                    />
                                    {/* Trophy Stem & Base */}
                                    <rect x="14" y="26" width="4" height="6" fill={`url(#grad_gold_${uid})`} />
                                    <rect x="9" y="32" width="14" height="4" rx="2" fill={`url(#grad_gold_${uid})`} stroke="#b45309" strokeWidth="0.5" />
                                    {/* Shimmer Light */}
                                    <path d="M 9 3 L 13 20" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
                                </g>
                            </g>
                        ) : (
                            /* Standard Tier: Cheering Hand with Thumbs-up / Wave */
                            <g>
                                <path
                                    d="M 132 135 C 148 128, 160 114, 166 94 C 168 88, 160 84, 155 89 C 149 104, 142 115, 128 124 Z"
                                    fill={`url(#grad_white_${uid})`}
                                    stroke="#e2e8f0"
                                    strokeWidth="1.5"
                                />
                                <circle cx="167" cy="91" r="9" fill={`url(#grad_skin_${uid})`} />
                                {/* Thumbs Up / Open celebration finger */}
                                <ellipse cx="166" cy="83" rx="4" ry="7" fill={`url(#grad_skin_${uid})`} transform="rotate(15, 166, 83)" />
                                {/* Pop Sparkle near hand */}
                                <path d="M 178 78 L 182 82 M 182 78 L 178 82" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
                            </g>
                        )}
                    </g>

                    {/* ── BODY (Cute Round Chef / Mascot Torso) ── */}
                    <g className="oc-mascot-torso">
                        {/* Main Body Jacket */}
                        <path
                            d="M 66 128 C 62 148, 64 180, 78 186 C 92 190, 108 190, 122 186 C 136 180, 138 148, 134 128 Z"
                            fill={`url(#grad_white_${uid})`}
                            stroke="#e2e8f0"
                            strokeWidth="2"
                        />

                        {/* Orange Brand Apron / Lapel Trim */}
                        <path
                            d="M 80 130 L 100 152 L 120 130 L 115 178 C 105 181, 95 181, 85 178 Z"
                            fill={`url(#grad_primary_${uid})`}
                            opacity="0.95"
                        />

                        {/* Brand Star Badge on Apron */}
                        <circle cx="100" cy="162" r="7" fill="#ffffff" />
                        <path
                            d="M 100 157 L 101.5 160.5 L 105 161 L 102.5 163.5 L 103 167 L 100 165.5 L 97 167 L 97.5 163.5 L 95 161 L 98.5 160.5 Z"
                            fill={`url(#grad_primary_${uid})`}
                        />

                        {/* Jacket Chef Buttons */}
                        <circle cx="92" cy="142" r="2.5" fill="#f97316" />
                        <circle cx="108" cy="142" r="2.5" fill="#f97316" />

                        {/* Cute Orange Neckerchief Scarf */}
                        <path
                            d="M 82 126 C 94 133, 106 133, 118 126 C 114 136, 86 136, 82 126 Z"
                            fill={`url(#grad_primary_${uid})`}
                        />
                        {/* Scarf knot */}
                        <circle cx="100" cy="131" r="4.5" fill="#ea580c" />
                    </g>

                    {/* ── HEAD (Smooth Cute Face with Expressive Features) ── */}
                    <g className="oc-mascot-head">
                        {/* Ears */}
                        <circle cx="63" cy="88" r="9" fill={`url(#grad_skin_${uid})`} />
                        <circle cx="63" cy="88" r="5" fill="#fbcfe8" opacity="0.6" />
                        <circle cx="137" cy="88" r="9" fill={`url(#grad_skin_${uid})`} />
                        <circle cx="137" cy="88" r="5" fill="#fbcfe8" opacity="0.6" />

                        {/* Round Head Contour */}
                        <ellipse
                            cx="100"
                            cy="88"
                            rx="38"
                            ry="36"
                            fill={`url(#grad_skin_${uid})`}
                            stroke="#fed7aa"
                            strokeWidth="1.5"
                        />

                        {/* Cute Rosy Blushing Cheeks */}
                        <ellipse className="oc-blush-left" cx="75" cy="98" rx="8" ry="4.5" fill="#f43f5e" opacity="0.35" />
                        <ellipse className="oc-blush-right" cx="125" cy="98" rx="8" ry="4.5" fill="#f43f5e" opacity="0.35" />

                        {/* Expressive Big Cartoon Eyes (With Natural Blinking) */}
                        <g className="oc-cartoon-eyes">
                            {/* Left Eye */}
                            <g className="oc-eye oc-eye-left">
                                <ellipse cx="80" cy="84" rx="7.5" ry="10.5" fill="#1e293b" />
                                <ellipse cx="80" cy="88" rx="5" ry="3" fill="#ea580c" opacity="0.8" />
                                <circle cx="77.5" cy="80.5" r="3" fill="#ffffff" />
                                <circle cx="82.5" cy="87" r="1.4" fill="#ffffff" />
                            </g>

                            {/* Right Eye */}
                            <g className="oc-eye oc-eye-right">
                                <ellipse cx="120" cy="84" rx="7.5" ry="10.5" fill="#1e293b" />
                                <ellipse cx="120" cy="88" rx="5" ry="3" fill="#ea580c" opacity="0.8" />
                                <circle cx="117.5" cy="80.5" r="3" fill="#ffffff" />
                                <circle cx="122.5" cy="87" r="1.4" fill="#ffffff" />
                            </g>

                            {/* Happy Eyebrows */}
                            <path d="M 72 68 Q 80 63 88 68" stroke="#7c2d12" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                            <path d="M 112 68 Q 120 63 128 68" stroke="#7c2d12" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                        </g>

                        {/* Cute Nose */}
                        <ellipse cx="100" cy="91" rx="2.5" ry="2" fill="#ea580c" opacity="0.7" />

                        {/* Joyful Open Smiling Mouth */}
                        <g className="oc-mouth" transform="translate(100, 101)">
                            {/* Mouth Cavity */}
                            <path
                                d="M -14 -2 Q 0 16 14 -2 Z"
                                fill="#991b1b"
                                stroke="#7c2d12"
                                strokeWidth="1"
                            />
                            {/* Cute Pink Tongue */}
                            <path
                                d="M -8 7 Q 0 2 8 7 Q 0 15 -8 7 Z"
                                fill="#fb7185"
                            />
                            {/* Upper White Smile Edge */}
                            <path
                                d="M -13 -1 Q 0 5 13 -1"
                                stroke="#ffffff"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                fill="none"
                            />
                        </g>

                        {/* ── HEADWEAR: Chef Hat or Champion Crown ── */}
                        {isGrand ? (
                            /* Grand Tier: Sparkling Golden Champion Crown */
                            <g className="oc-headwear-crown" transform="translate(100, 52)">
                                {/* Crown Base Ribbon */}
                                <path
                                    d="M -26 2 L 26 2 L 22 10 L -22 10 Z"
                                    fill="#b45309"
                                />
                                {/* Golden Crown Points */}
                                <path
                                    d="M -26 2 L -28 -18 L -12 -6 L 0 -26 L 12 -6 L 28 -18 L 26 2 Z"
                                    fill={`url(#grad_gold_${uid})`}
                                    stroke="#92400e"
                                    strokeWidth="1.5"
                                />
                                {/* Crown Inset Jewels */}
                                <circle cx="-28" cy="-18" r="3.5" fill="#ef4444" stroke="#ffffff" strokeWidth="1" />
                                <circle cx="0" cy="-26" r="4.5" fill={`url(#grad_primary_${uid})`} stroke="#ffffff" strokeWidth="1" />
                                <circle cx="28" cy="-18" r="3.5" fill="#ef4444" stroke="#ffffff" strokeWidth="1" />
                                {/* Center Gem */}
                                <polygon points="0,-10 5,-5 0,0 -5,-5" fill="#fde047" stroke="#ffffff" strokeWidth="0.75" />
                                {/* Shimmer Gleam */}
                                <path d="M -8 -10 L -4 -2" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
                            </g>
                        ) : (
                            /* Standard Tier: Cute Puffy Chef Hat with Brand Ribbon */
                            <g className="oc-headwear-hat" transform="translate(100, 56)">
                                {/* Puffy Hat Cloud Top */}
                                <path
                                    d="M -26 0 C -38 -8, -36 -28, -20 -32 C -22 -44, 2 -52, 14 -42 C 28 -50, 42 -36, 36 -22 C 44 -12, 38 0, 26 0 Z"
                                    fill={`url(#grad_white_${uid})`}
                                    stroke="#cbd5e1"
                                    strokeWidth="2"
                                />
                                {/* Hat Folds / Volume Lines */}
                                <path d="M -12 -30 C -8 -16, -6 -6, -6 0" stroke="#e2e8f0" strokeWidth="2" strokeLinecap="round" fill="none" />
                                <path d="M 10 -36 C 8 -20, 8 -8, 8 0" stroke="#e2e8f0" strokeWidth="2" strokeLinecap="round" fill="none" />
                                <path d="M 22 -24 C 20 -14, 18 -6, 18 0" stroke="#e2e8f0" strokeWidth="2" strokeLinecap="round" fill="none" />

                                {/* Orange Brand Ribbon Band */}
                                <rect
                                    x="-26"
                                    y="0"
                                    width="52"
                                    height="10"
                                    rx="4"
                                    fill={`url(#grad_primary_${uid})`}
                                    stroke="#ea580c"
                                    strokeWidth="1"
                                />
                                {/* Ribbon Center Star Badge */}
                                <circle cx="0" cy="5" r="4" fill="#ffffff" />
                                <polygon points="0,2 1,4 3,4.5 1.8,6 2.2,8 0,7 2.2,8 1.8,6 3,4.5 1,4" fill="#f97316" transform="scale(0.8) translate(0, 1)" />
                            </g>
                        )}
                    </g>
                </g>
            </svg>

            {/* Floating Milestone Count Badge */}
            <div className={`oc-avatar-count-badge ${isGrand ? 'oc-badge-grand' : 'oc-badge-standard'}`}>
                <span className="oc-avatar-count-hash">#</span>
                <span className="oc-avatar-count-number">{count}</span>
            </div>
        </div>
    );
};

export default CelebrationAvatar;
