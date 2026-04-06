/**
 * Component per activar/desactivar notificacions push.
 * Detecta automàticament si estem a Capacitor (natiu) o al navegador (web push).
 */

import { Capacitor } from '@capacitor/core'
import { usePushNotifications } from '../hooks/usePushNotifications'
import { useNativePush } from '../hooks/useNativePush'

interface Props {
  userId?: string
}

export default function PushToggle({ userId }: Props) {
  const isNative = Capacitor.isNativePlatform()

  // Web push (PWA)
  const web = usePushNotifications(isNative ? undefined : userId)
  // Native push (Capacitor — FCM/APNs)
  const native = useNativePush(isNative ? userId : undefined)

  // Unificar interfície
  const isSupported = isNative ? native.isSupported : web.isSupported
  const permission = isNative ? native.permission : web.permission
  const isActive = isNative ? native.isRegistered : web.isSubscribed
  const loading = isNative ? native.loading : web.loading
  const error = isNative ? native.error : web.error
  const toggle = isActive
    ? (isNative ? native.unregister : web.unsubscribe)
    : (isNative ? native.register : web.subscribe)

  if (!isSupported) {
    return (
      <div className="push-toggle push-toggle--unsupported">
        <span className="push-toggle__icon">🔕</span>
        <span className="push-toggle__text">
          Les notificacions push no estan disponibles en aquest navegador
        </span>
      </div>
    )
  }

  if (permission === 'denied') {
    return (
      <div className="push-toggle push-toggle--denied">
        <span className="push-toggle__icon">🚫</span>
        <span className="push-toggle__text">
          {isNative
            ? "Notificacions bloquejades. Activa-les a Configuració > Aplicacions."
            : "Notificacions bloquejades. Activa-les a la configuració del navegador."}
        </span>
      </div>
    )
  }

  return (
    <div className="push-toggle">
      <div className="push-toggle__row">
        <span className="push-toggle__icon">
          {isActive ? '🔔' : '🔕'}
        </span>
        <span className="push-toggle__text">
          {isActive
            ? 'Notificacions push activades'
            : 'Activa les notificacions push per rebre alertes'}
        </span>
        <button
          className={`push-toggle__btn ${isActive ? 'push-toggle__btn--active' : ''}`}
          onClick={toggle}
          disabled={loading || !userId}
          aria-label={isActive ? 'Desactivar notificacions' : 'Activar notificacions'}
        >
          {loading ? (
            <span className="push-toggle__spinner" />
          ) : isActive ? (
            'Desactivar'
          ) : (
            'Activar'
          )}
        </button>
      </div>
      {error && <p className="push-toggle__error">{error}</p>}
    </div>
  )
}
