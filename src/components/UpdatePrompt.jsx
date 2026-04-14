import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshCw, X } from 'lucide-react'

const UPDATE_INTERVAL_MS = 60 * 60 * 1000 // 1h

export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      if (!r) return
      setInterval(() => { r.update() }, UPDATE_INTERVAL_MS)
    },
  })

  useEffect(() => {
    const onVis = () => {
      if (document.hidden) return
      navigator.serviceWorker?.getRegistration().then(r => { r?.update() })
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  if (!needRefresh) return null

  return (
    <div className="fixed bottom-20 md:bottom-6 left-0 right-0 z-[100] px-3">
      <div className="max-w-sm mx-auto bg-gray-900 border border-emerald-500/40 rounded-2xl p-4 shadow-xl flex items-start gap-3 animate-in">
        <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center flex-shrink-0 border border-emerald-500/30">
          <RefreshCw size={18} className="text-emerald-400"/>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">Nova versão disponível</p>
          <p className="text-xs text-gray-400 mt-0.5">Atualize agora para ver as novidades.</p>
          <div className="flex gap-2 mt-3">
            <button onClick={() => setNeedRefresh(false)} className="flex-1 text-xs text-gray-400 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 transition-colors">
              Depois
            </button>
            <button onClick={() => updateServiceWorker(true)} className="flex-1 text-xs font-semibold text-white py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 transition-colors">
              Atualizar
            </button>
          </div>
        </div>
        <button onClick={() => setNeedRefresh(false)} className="text-gray-500 hover:text-gray-300 flex-shrink-0 p-1">
          <X size={16}/>
        </button>
      </div>
    </div>
  )
}
