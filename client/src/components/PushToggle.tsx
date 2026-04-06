/**
 * Component per activar/desactivar notificacions push.
 * Mostra l'estat actual i permet subscribe/unsubscribe.
 */

import { usePushNotifications } from '../hooks/usePushNotifications'

interface Props {
  userId?: string
}

export default function PushToggle({ userId }: Props) {
  const {
    isSupported,
    permission,
    isSubscribed,
    loading,
    error,
    subscribe,
    unsubscribe,
  } = usePushNotifications(userId)

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
          Notificacions bloquejades. Activa-les a la configuració del navegador.
        </span>
      </div>
    )
  }

  return (
    <div className="push-toggle">
      <div className="push-toggle__row">
        <span className="push-toggle__icon">
          {isSubscribed ? '🔔' : '🔕'}
        </span>
        <span className="push-toggle__text">
          {isSubscribed
            ? 'Notificacions push activades'
            : 'Activa les notificacions push per rebre alertes'}
        </span>
        <button
          className={`push-toggle__btn ${isSubscribed ? 'push-toggle__btn--active' : ''}`}
          onClick={isSubscribed ? unsubscribe : subscribe}
          disabled={loading || !userId}
          aria-label={isSubscribed ? 'Desactivar notificacions' : 'Activar notificacions'}
        >
          {loading ? (
            <span className="push-toggle__spinner" />
          ) : isSubscribed ? (
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
