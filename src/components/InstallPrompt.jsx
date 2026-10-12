// ─── InstallPrompt — banner de "instalar PWA" (com instruções iOS) ───────────
import { useState, useEffect } from 'react'
import { Download, X, Share } from 'lucide-react'

const DISMISSED_KEY = 'pwa-install-dismissed'

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream
}

function isInStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showAndroid, setShowAndroid] = useState(false)
  const [showIOS, setShowIOS] = useState(false)

  useEffect(() => {
    // Não mostrar se já está instalado ou se foi dispensado
    if (isInStandaloneMode()) return
    if (sessionStorage.getItem(DISMISSED_KEY)) return

    if (isIOS()) {
      setShowIOS(true)
      return
    }

    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShowAndroid(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  function dismiss() {
    sessionStorage.setItem(DISMISSED_KEY, '1')
    setShowAndroid(false)
    setShowIOS(false)
  }

  async function install() {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setShowAndroid(false)
    setDeferredPrompt(null)
  }

  if (!showAndroid && !showIOS) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] p-3 md:p-4">
      <div className="max-w-sm mx-auto bg-gray-900 border border-emerald-500/30 rounded-2xl p-4 shadow-xl animate-in">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center flex-shrink-0 border border-emerald-500/30">
            <Download size={18} className="text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">Instalar FinançasFamília</p>
            {showAndroid && (
              <p className="text-xs text-gray-400 mt-0.5">Adicione à tela inicial para acesso rápido, sem abrir o navegador.</p>
            )}
            {showIOS && (
              <p className="text-xs text-gray-400 mt-0.5">
                Toque em <Share size={11} className="inline mb-0.5 mx-0.5" /> <strong>Compartilhar</strong> e depois em <strong>"Adicionar à Tela de Início"</strong>.
              </p>
            )}
          </div>
          <button onClick={dismiss} className="text-gray-500 hover:text-gray-300 flex-shrink-0 p-1">
            <X size={16} />
          </button>
        </div>

        {showAndroid && (
          <div className="flex gap-2 mt-3">
            <button onClick={dismiss} className="flex-1 text-xs text-gray-400 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 transition-colors">
              Agora não
            </button>
            <button onClick={install} className="flex-1 text-xs font-semibold text-onaccent py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 transition-colors">
              Instalar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
