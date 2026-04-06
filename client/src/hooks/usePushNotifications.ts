/**
 * Hook React per gestionar subscripcions push notifications.
 *
 * Funcionalitat:
 * - Demanar permís al navegador
 * - Subscriure's (WebPush via Service Worker)
 * - Enviar la subscripció al servidor
 * - Dessubscriure's
 *
 * Ús:
 *   const { isSupported, permission, isSubscribed, subscribe, unsubscribe } = usePushNotifications(userId)
 */

import { useState, useEffect, useCallback } from 'react';

interface PushState {
  /** Push és suportat en aquest navegador? */
  isSupported: boolean;
  /** Permís actual: 'default' | 'granted' | 'denied' */
  permission: NotificationPermission;
  /** L'usuari està subscrit a push? */
  isSubscribed: boolean;
  /** S'està processant una acció? */
  loading: boolean;
  /** Error actual, si n'hi ha */
  error: string | null;
  /** Subscriure's a push notifications */
  subscribe: () => Promise<void>;
  /** Dessubscriure's de push */
  unsubscribe: () => Promise<void>;
}

export function usePushNotifications(userId?: string): PushState {
  const [isSupported] = useState(() =>
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  );
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Comprovar si ja estem subscrits
  useEffect(() => {
    if (!isSupported) return;

    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        setIsSubscribed(!!sub);
      });
    });
  }, [isSupported]);

  const subscribe = useCallback(async () => {
    if (!isSupported || !userId) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Demanar permís
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        setError('Permís denegat per les notificacions');
        setLoading(false);
        return;
      }

      // 2. Obtenir clau VAPID del servidor
      const vapidRes = await fetch('/api/push/vapid-key');
      const vapidData = await vapidRes.json();
      if (!vapidData.ok || !vapidData.data?.publicKey) {
        setError('Push no disponible al servidor');
        setLoading(false);
        return;
      }

      // 3. Subscriure al PushManager del Service Worker
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidData.data.publicKey),
      });

      // 4. Enviar la subscripció al servidor
      const saveRes = await fetch(`/api/usuaris/${userId}/push-subscription`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });

      if (!saveRes.ok) {
        throw new Error('Error guardant la subscripció al servidor');
      }

      setIsSubscribed(true);
    } catch (err: any) {
      setError(err.message || 'Error desconegut');
    } finally {
      setLoading(false);
    }
  }, [isSupported, userId]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported) return;
    setLoading(true);
    setError(null);

    try {
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
      }
      setIsSubscribed(false);
    } catch (err: any) {
      setError(err.message || 'Error desconegut');
    } finally {
      setLoading(false);
    }
  }, [isSupported]);

  return {
    isSupported,
    permission,
    isSubscribed,
    loading,
    error,
    subscribe,
    unsubscribe,
  };
}

// ─── Utilitat: convertir base64url a Uint8Array ──────────────
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
