/**
 * Hook per push notifications natives (Capacitor — Android/iOS).
 *
 * Quan l'app s'executa dins Capacitor, utilitzem el plugin natiu
 * @capacitor/push-notifications que connecta amb FCM (Android) i APNs (iOS).
 *
 * El token FCM/APNs s'envia al servidor per a que pugui enviar push
 * tant via web-push (PWA) com via FCM (natiu).
 */

import { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

interface NativePushState {
  isNative: boolean;
  isSupported: boolean;
  permission: 'default' | 'granted' | 'denied';
  isRegistered: boolean;
  loading: boolean;
  error: string | null;
  token: string | null;
  register: () => Promise<void>;
  unregister: () => Promise<void>;
}

export function useNativePush(userId?: string): NativePushState {
  const isNative = Capacitor.isNativePlatform();
  const [isSupported] = useState(() => isNative);
  const [permission, setPermission] = useState<'default' | 'granted' | 'denied'>('default');
  const [isRegistered, setIsRegistered] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // Listener per quan rebem el token
  useEffect(() => {
    if (!isNative) return;

    // Token registrat amb èxit
    const regListener = PushNotifications.addListener('registration', (tokenResult) => {
      console.log('📱 FCM/APNs token:', tokenResult.value);
      setToken(tokenResult.value);
      setIsRegistered(true);

      // Enviar token al servidor
      if (userId) {
        fetch(`/api/usuaris/${userId}/fcm-token`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: tokenResult.value }),
        }).catch((err) => console.error('Error enviant FCM token:', err));
      }
    });

    // Error durant el registre
    const errorListener = PushNotifications.addListener('registrationError', (err) => {
      console.error('❌ Error registrant push natiu:', err);
      setError(err.error || 'Error registrant push notifications');
    });

    // Notificació rebuda en primer pla
    const receivedListener = PushNotifications.addListener(
      'pushNotificationReceived',
      (notification) => {
        console.log('🔔 Push rebut (foreground):', notification);
      }
    );

    // Tap en notificació (usuari clica)
    const actionListener = PushNotifications.addListener(
      'pushNotificationActionPerformed',
      (action) => {
        console.log('👆 Push action:', action);
        // Navegar a la URL si n'hi ha
        const url = action.notification.data?.url;
        if (url && typeof url === 'string') {
          window.location.href = url;
        }
      }
    );

    // Comprovar permís actual
    PushNotifications.checkPermissions().then((result) => {
      if (result.receive === 'granted') setPermission('granted');
      else if (result.receive === 'denied') setPermission('denied');
      else setPermission('default');
    });

    return () => {
      regListener.then((l) => l.remove());
      errorListener.then((l) => l.remove());
      receivedListener.then((l) => l.remove());
      actionListener.then((l) => l.remove());
    };
  }, [isNative, userId]);

  const register = useCallback(async () => {
    if (!isNative) return;
    setLoading(true);
    setError(null);

    try {
      // Demanar permís
      const permResult = await PushNotifications.requestPermissions();
      if (permResult.receive === 'granted') {
        setPermission('granted');
        // Registrar per rebre push (dispara l'event 'registration')
        await PushNotifications.register();
      } else {
        setPermission('denied');
        setError('Permís denegat per les notificacions');
      }
    } catch (err: any) {
      setError(err.message || 'Error desconegut');
    } finally {
      setLoading(false);
    }
  }, [isNative]);

  const unregister = useCallback(async () => {
    if (!isNative) return;
    setLoading(true);
    setError(null);

    try {
      await PushNotifications.unregister();
      setIsRegistered(false);
      setToken(null);
    } catch (err: any) {
      setError(err.message || 'Error desconegut');
    } finally {
      setLoading(false);
    }
  }, [isNative]);

  return {
    isNative,
    isSupported,
    permission,
    isRegistered,
    loading,
    error,
    token,
    register,
    unregister,
  };
}
