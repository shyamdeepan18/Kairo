import React, { useState, useRef } from 'react';
import { Typography, theme as antTheme } from 'antd';
import { useWorkspaceStore } from '../store/workspace';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';

const { Text } = Typography;

export function SwipeToCloseLogo({ collapsed, isDesktop, onDoubleClick }: { collapsed: boolean, isDesktop: boolean, onDoubleClick: () => void }) {
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const currentXRef = useRef(0);
  const closeAllTabs = useWorkspaceStore((s) => s.closeAll);
  const navigate = useNavigate();
  const { token: dt } = antTheme.useToken();
  const maxDrag = 140; // How far it can be dragged
  const threshold = 90; // Distance to trigger action

  const handlePointerDown = (e: React.PointerEvent) => {
    if (collapsed && isDesktop) return; // Don't drag if sidebar is collapsed
    setIsDragging(true);
    startXRef.current = e.clientX;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const delta = e.clientX - startXRef.current;
    
    // Only allow dragging to the right (positive delta)
    if (delta > 0 && delta < maxDrag + 20) {
      // Add some friction after maxDrag
      const pull = delta > maxDrag ? maxDrag + (delta - maxDrag) * 0.2 : delta;
      setOffsetX(pull);
      currentXRef.current = pull;
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    
    if (currentXRef.current >= threshold) {
      // Trigger the close all action!
      closeAllTabs();
      navigate('/dashboard');
    }
    
    // Snap back to original position
    setOffsetX(0);
    currentXRef.current = 0;
  };

  return (
    <div
      onDoubleClick={onDoubleClick}
      style={{
        position: 'relative',
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed && isDesktop ? 'center' : 'flex-start',
        borderBottom: `1px solid ${dt.colorBorderSecondary}`,
        overflow: 'hidden',
        flexShrink: 0,
        userSelect: 'none',
        touchAction: 'none' // Prevent scrolling while dragging on mobile
      }}
    >
      {/* Background Hidden Action Layer */}
      {(!collapsed || !isDesktop) && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'linear-gradient(90deg, #f43f5e, #e11d48)',
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 24,
          color: 'white',
          fontWeight: 600,
          fontSize: 13,
          gap: 8,
          opacity: offsetX / threshold, // Fade in as you drag
          transition: isDragging ? 'none' : 'opacity 0.3s ease',
        }}>
          <Trash2 size={16} /> CLEAR DESK
        </div>
      )}

      {/* Foreground Logo Layer */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          height: '100%',
          padding: collapsed && isDesktop ? 0 : '0 20px',
          background: dt.colorBgContainer,
          transform: `translateX(${offsetX}px)`,
          transition: isDragging ? 'none' : 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          cursor: isDragging ? 'grabbing' : 'grab',
          position: 'relative',
          zIndex: 2,
        }}
      >
        {/* Logo icon — hexagon */}
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'linear-gradient(135deg, #4F46E5, #818CF8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 800,
            fontSize: 16,
            boxShadow: '0 2px 8px rgba(79, 70, 229, 0.4)',
            flexShrink: 0,
            pointerEvents: 'none',
          }}
        >
          K
        </div>
        {(!collapsed || !isDesktop) && (
          <Text strong style={{ fontSize: 15, whiteSpace: 'nowrap', pointerEvents: 'none', letterSpacing: '0.5px' }}>
            KAIRO ERP
          </Text>
        )}
      </div>
    </div>
  );
}
