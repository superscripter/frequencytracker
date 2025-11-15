import { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface NotificationState {
  permission: NotificationPermission;
  subscription: PushSubscription | null;
  isSupported: boolean;
  isSubscribed: boolean;
}

export function useNotifications() {
  const [state, setState] = useState<NotificationState>({
    permission: 'default',
    subscription: null,
    isSupported: false,
    isSubscribed: false,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if notifications are supported
    const isSupported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;

    setState(prev => ({
      ...prev,
      isSupported,
      permission: isSupported ? Notification.permission : 'denied',
    }));

    if (isSupported) {
      // Check if already subscribed
      checkSubscription();
    }
  }, []);

  const checkSubscription = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      setState(prev => ({
        ...prev,
        subscription,
        isSubscribed: subscription !== null,
      }));
    } catch (err) {
      console.error('Error checking subscription:', err);
    }
  };

  const requestPermission = async (): Promise<NotificationPermission> => {
    if (!state.isSupported) {
      setError('Notifications are not supported in this browser');
      return 'denied';
    }

    try {
      const permission = await Notification.requestPermission();
      setState(prev => ({ ...prev, permission }));
      return permission;
    } catch (err) {
      setError('Error requesting notification permission');
      console.error(err);
      return 'denied';
    }
  };

  const subscribe = async (): Promise<PushSubscription | null> => {
    if (!state.isSupported) {
      setError('Push notifications are not supported');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      // Request permission if not granted
      let permission = state.permission;
      if (permission !== 'granted') {
        permission = await requestPermission();
      }

      if (permission !== 'granted') {
        setError('Notification permission denied');
        setLoading(false);
        return null;
      }

      // Get the service worker registration
      const registration = await navigator.serviceWorker.ready;

      // Check if already subscribed
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        // Get VAPID public key from environment or backend
        const response = await fetch(`${API_URL}/api/notifications/vapid-public-key`);
        const { publicKey } = await response.json();

        // Subscribe to push notifications
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });

        // Send subscription to backend
        const token = localStorage.getItem('token');
        await fetch(`${API_URL}/api/notifications/subscribe`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token && { Authorization: `Bearer ${token}` }),
          },
          body: JSON.stringify(subscription),
        });
      }

      setState(prev => ({
        ...prev,
        subscription,
        isSubscribed: true,
      }));

      setLoading(false);
      return subscription;
    } catch (err) {
      setError('Error subscribing to push notifications');
      console.error(err);
      setLoading(false);
      return null;
    }
  };

  const unsubscribe = async (): Promise<boolean> => {
    if (!state.subscription) {
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      // Unsubscribe from push
      await state.subscription.unsubscribe();

      // Notify backend
      const token = localStorage.getItem('token');
      await fetch(`${API_URL}/api/notifications/unsubscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({ endpoint: state.subscription.endpoint }),
      });

      setState(prev => ({
        ...prev,
        subscription: null,
        isSubscribed: false,
      }));

      setLoading(false);
      return true;
    } catch (err) {
      setError('Error unsubscribing from push notifications');
      console.error(err);
      setLoading(false);
      return false;
    }
  };

  return {
    ...state,
    loading,
    error,
    requestPermission,
    subscribe,
    unsubscribe,
  };
}

// Helper function to convert VAPID key
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray as Uint8Array<ArrayBuffer>;
}
