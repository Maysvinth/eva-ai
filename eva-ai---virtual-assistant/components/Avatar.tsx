
import React, { useMemo } from 'react';

interface AvatarProps {
  variant: 'EVA' | 'CORE' | 'SENTINEL';
  color: string;
  isSpeaking: boolean;
  volume: number; // 0 to 1
  isConnecting: boolean;
}

export const Avatar: React.FC<AvatarProps> = ({ variant, color, isSpeaking, volume, isConnecting }) => {
  // Calculate dynamic parts based on volume
  const mouthScale = isSpeaking ? 0.3 + volume * 1.5 : 0.1;
  const pulseScale = 1 + (isConnecting ? Math.sin(Date.now() / 200) * 0.05 : volume * 0.2);

  return (
    <div className="relative w-64 h-64 flex items-center justify-center">
      {/* Background Glow */}
      <div 
        className="absolute inset-0 rounded-full opacity-20 blur-3xl transition-colors duration-1000"
        style={{ backgroundColor: color }}
      />
      
      {/* Main Avatar SVG */}
      <svg 
        viewBox="0 0 200 200" 
        className="w-full h-full relative z-10 drop-shadow-2xl"
        style={{ transform: `scale(${pulseScale})` }}
      >
        <defs>
          <radialGradient id="grad" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
            <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.8 }} />
            <stop offset="100%" style={{ stopColor: '#000', stopOpacity: 0.1 }} />
          </radialGradient>
        </defs>

        {variant === 'EVA' && (
          <g className="eva-glow">
            {/* Outer Ring */}
            <circle cx="100" cy="100" r="80" fill="none" stroke={color} strokeWidth="1" strokeDasharray="10 5" className="animate-[spin_10s_linear_infinite]" />
            <circle cx="100" cy="100" r="75" fill="none" stroke={color} strokeWidth="4" opacity="0.3" />
            
            {/* Head Shape */}
            <path d="M60 70 Q100 40 140 70 L140 130 Q100 160 60 130 Z" fill="rgba(0,0,0,0.8)" stroke={color} strokeWidth="2" />
            
            {/* Eyes */}
            <circle cx="80" cy="90" r="5" fill={color} />
            <circle cx="120" cy="90" r="5" fill={color} />
            
            {/* Mouth (Animated) */}
            <rect 
              x="85" 
              y="115" 
              width="30" 
              height={5 + (mouthScale * 15)} 
              rx="2" 
              fill={color} 
              className="transition-all duration-75"
            />
            
            {/* HUD Elements */}
            <line x1="40" y1="100" x2="60" y2="100" stroke={color} strokeWidth="1" />
            <line x1="140" y1="100" x2="160" y2="100" stroke={color} strokeWidth="1" />
          </g>
        )}

        {variant === 'CORE' && (
          <g className="eva-glow">
            {/* Geometric Core */}
            <rect x="50" y="50" width="100" height="100" rx="10" fill="rgba(0,0,0,0.9)" stroke={color} strokeWidth="2" className="animate-[pulse_4s_ease-in-out_infinite]" />
            <circle cx="100" cy="100" r="30" fill="none" stroke={color} strokeWidth="1" />
            
            {/* Central "Eye" */}
            <circle 
              cx="100" 
              cy="100" 
              r={10 + (volume * 15)} 
              fill={color} 
              className="transition-all duration-75"
            />
            
            {/* Orbiting Particles */}
            <circle cx="100" cy="100" r="60" fill="none" stroke={color} strokeWidth="0.5" strokeDasharray="1 10" className="animate-[spin_20s_linear_infinite]" />
          </g>
        )}

        {variant === 'SENTINEL' && (
          <g className="eva-glow">
            {/* Aggressive Helmet Shape */}
            <path d="M50 80 L100 40 L150 80 L140 140 L100 160 L60 140 Z" fill="rgba(0,0,0,0.9)" stroke={color} strokeWidth="3" />
            
            {/* Visor */}
            <rect 
              x="65" 
              y="85" 
              width="70" 
              height={5 + (volume * 10)} 
              fill={color} 
              className="transition-all duration-75"
            />
            
            {/* Side Detail */}
            <path d="M40 90 L60 110 M160 90 L140 110" stroke={color} strokeWidth="2" />
          </g>
        )}
      </svg>
    </div>
  );
};
