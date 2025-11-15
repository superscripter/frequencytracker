import { useEffect, useState } from 'react';
import { useNotifications } from '../hooks/useNotifications';

export function NotificationPrompt() {
  const { isSupported, permission, isSubscribed, subscribe, loading, error } = useNotifications();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if user has previously dismissed the prompt
    const dismissedTime = localStorage.getItem('notification-prompt-dismissed');
    if (dismissedTime) {
      const dismissedDate = new Date(dismissedTime);
      const daysSinceDismissed = (Date.now() - dismissedDate.getTime()) / (1000 * 60 * 60 * 24);

      // Show again after 7 days
      if (daysSinceDismissed < 7) {
        setDismissed(true);
      }
    }
  }, []);

  const handleEnable = async () => {
    await subscribe();
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('notification-prompt-dismissed', new Date().toISOString());
  };

  // Don't show if:
  // - Not supported
  // - Already subscribed
  // - Permission denied
  // - User dismissed
  if (!isSupported || isSubscribed || permission === 'denied' || dismissed) {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      backgroundColor: '#3b82f6',
      color: 'white',
      padding: '16px 24px',
      borderRadius: '12px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      zIndex: 1000,
      maxWidth: '90%',
      width: '400px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
    }}>
      <div>
        <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: '600' }}>
          Stay on track with daily reminders
        </h3>
        <p style={{ margin: 0, fontSize: '14px', opacity: 0.9 }}>
          Get notified every morning about your activity recommendations
        </p>
      </div>

      {error && (
        <div style={{
          padding: '8px 12px',
          backgroundColor: 'rgba(255, 255, 255, 0.2)',
          borderRadius: '6px',
          fontSize: '13px',
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px' }}>
        <button
          onClick={handleEnable}
          disabled={loading}
          style={{
            flex: 1,
            padding: '10px 20px',
            backgroundColor: 'white',
            color: '#3b82f6',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Enabling...' : 'Enable Notifications'}
        </button>
        <button
          onClick={handleDismiss}
          disabled={loading}
          style={{
            padding: '10px 20px',
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
          }}
        >
          Not now
        </button>
      </div>
    </div>
  );
}
