import { useEffect, useRef } from 'react';
import './ContextMenu.css';

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onCompletedToday: () => void;
}

export default function ContextMenu({ x, y, onClose, onCompletedToday }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    // Use capture phase to ensure we get the event before it bubbles
    // Add a small delay to prevent immediate closure from the double-tap
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside as EventListener, true);
      document.addEventListener('touchstart', handleClickOutside as EventListener, true);
      document.addEventListener('keydown', handleEscape);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside as EventListener, true);
      document.removeEventListener('touchstart', handleClickOutside as EventListener, true);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const handleCompletedToday = () => {
    onCompletedToday();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{
        position: 'fixed',
        top: `${y}px`,
        left: `${x}px`,
      }}
    >
      <button className="context-menu-item" onClick={handleCompletedToday}>
        Completed Today
      </button>
    </div>
  );
}
