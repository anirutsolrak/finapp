import { useState, useEffect, useRef, useCallback } from 'react'
import { format } from 'date-fns'
import { Send, Plus, Loader2, Bot, User, CheckCircle, Edit2, Trash2, Sparkles } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { sendToClaudeAPI, buildSystemPrompt, extractAction, cleanText } from '../lib/claude'
import { getAIContext, saveChatMessage, getChatMessages, clearChat, addTransaction, upsertBill, upsertGoal } from '../lib/db'

function TypingDot() {
  return (
    <div className="flex gap-1 px-4 py-3 bg-gray-800 rounded-2xl rounded-tl-sm w-fit">
      {[0,1,2].map(i => (
        <div key={i} className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: `${i*0.15}s` }}/>
      ))}
    </div>
  )
}

function ActionCard({ action, onApprove, onDismiss, approved }) {
  if (!action) return null
  const typeLabels = { add_transaction: 'Lançamento', add_goal: 'Meta', add_bill: 'Conta', update_budget: 'Orçamento' }
  return (
    <div className="chat-action-card mt-2">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles size={14} className="text-emerald-400"/>
        <p className="text-xs font-bold text-emerald-400 uppercase tracking-wide">Ação sugerida pela IA</p>
        <span className="badge bg-emerald-500/20 text-emerald-400">{typeLabels[action.type] || action.type}</span>
      </div>
      <p className="text-sm text-gray-200 mb-3">{action.description}</p>
      {action.data && (
        <div className="bg-black/20 rounded-lg p-2 mb-3 text-xs font-mono text-gray-300 overflow-x-auto">
          {Object.entries(action.data).map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className="text-gray-500">{k}:</span>
              <span className="text-emerald-300">{String(v)}</span>
            </div>
          ))}
        </div>
      )}
      {!approved ? (
        <div className="flex gap-2">
          <button onClick={onApprove} className="btn-primary flex-1 text-sm flex items-center justify-center gap-1.5">
            <CheckCircle size={14}/> Aprovar e Salvar
          </button>
          <button onClick={onDismiss} className="btn-ghost text-sm px-3">Ignorar</button>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-emerald-400 text-sm">
          <CheckCircle size={14}/> <span>Salvo com sucesso!</span>
        </div>
      )}
    </div>
  )
}

function Message({ msg, onApproveAction, onDismissAction, actionApproved }) {
  const isUser = msg.role === 'user'
  const action = msg.metadata?.action || null
  const text = msg.metadata?.cleanText || msg.content

  return (
    <div className={`flex flex-col animate-in ${isUser ? 'items-end' : 'items-start'}`}>
      <div className={`flex items-end gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${isUser ? 'bg-emerald-600' : 'bg-gray-700'}`}>
          {isUser ? <User size={14} className="text-white"/> : <Bot size={14} className="text-gray-300"/>}
        </div>
        <div className={`max-w-xs md:max-w-md lg:max-w-lg px-4 py-3 rounded-2xl text-sm leading-relaxed ${isUser ? 'bubble-user rounded-br-sm' : 'bubble-ai rounded-bl-sm'}`}>
          <p className="whitespace-pre-wrap">{text}</p>
        </div>
      </div>
      {action && !isUser && (
        <div className="ml-9 w-full max-w-xs md:max-w-md">
          <ActionCard action={action} onApprove={onApproveAction} onDismiss={onDismissAction} approved={actionApproved}/>
        </div>
      )}
      <p className="text-xs text-gray-600 mt-1 mx-9">{format(new Date(msg.created_at), 'HH:mm')}</p>
    </div>
  )
}

const QUICK_PROMPTS = [
  '💰 Registrar um gasto',
  '📊 Como estou esse mês?',
  '🎯 Planejar uma compra',
  '📅 Distribuição semanal',
  '💡 Onde posso economizar?',
]

export default function ChatPage() {
  const { user, profile } = useAuth()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [approvedActions, setApprovedActions] = useState({})
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)

  const apiKey = localStorage.getItem('claude_api_key') || ''

  // Load history
  useEffect(() => {
    if (!user) return
    getChatMessages(user.id, 40).then(({ data }) => {
      if (data && data.length > 0) {
        setMessages(data.map(m => ({ ...m, metadata: m.metadata || {} })))
      } else {
        // Welcome message
        setMessages([{
          id: 'welcome',
          role: 'assistant',
          content: `Olá, ${profile?.full_name?.split(' ')[0] || 'usuário'}! 👋 Sou seu assistente financeiro. Posso ajudar a:\n• Registrar gastos e receitas\n• Analisar seu orçamento\n• Planejar metas e compras\n• Redistribuir gastos para objetivos\n\nO que vamos fazer hoje?`,
          metadata: {},
          created_at: new Date().toISOString()
        }])
      }
      setHistoryLoaded(true)
    })
  }, [user, profile])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function sendMessage(text) {
    const msgText = text || input.trim()
    if (!msgText || loading) return
    if (!apiKey) {
      alert('Configure sua Claude API Key nas Configurações antes de usar o chat.')
      return
    }

    setInput('')

    const userMsg = { id: Date.now() + 'u', role: 'user', content: msgText, metadata: {}, created_at: new Date().toISOString() }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    // Save user message
    saveChatMessage({ user_id: user.id, role: 'user', content: msgText, metadata: {} })

    try {
      // Build context snapshot
      const context = await getAIContext()
      const systemPrompt = buildSystemPrompt(context, profile?.full_name)

      // Build conversation history (last 10 pairs)
      const historyMsgs = messages.slice(-20).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))
      const apiMessages = [...historyMsgs, { role: 'user', content: msgText }]

      const responseText = await sendToClaudeAPI(apiMessages, systemPrompt, apiKey)
      const action = extractAction(responseText)
      const cleanedText = cleanText(responseText)

      const aiMsg = {
        id: Date.now() + 'a',
        role: 'assistant',
        content: cleanedText,
        metadata: { action, cleanText: cleanedText },
        created_at: new Date().toISOString()
      }
      setMessages(prev => [...prev, aiMsg])

      // Save AI message
      saveChatMessage({ user_id: user.id, role: 'assistant', content: cleanedText, metadata: { action } })

    } catch (err) {
      const errMsg = {
        id: Date.now() + 'e',
        role: 'assistant',
        content: `Erro ao conectar com a IA: ${err.message}. Verifique sua API Key nas configurações.`,
        metadata: {},
        created_at: new Date().toISOString()
      }
      setMessages(prev => [...prev, errMsg])
    }
    setLoading(false)
  }

  async function approveAction(msgId, action) {
    try {
      const { type, data } = action
      if (type === 'add_transaction') {
        await addTransaction({ ...data, user_id: user.id, date: data.date || format(new Date(), 'yyyy-MM-dd') })
      } else if (type === 'add_bill') {
        await upsertBill({ ...data, user_id: user.id })
      } else if (type === 'add_goal') {
        await upsertGoal({ ...data, user_id: user.id })
      }
      setApprovedActions(prev => ({ ...prev, [msgId]: true }))
    } catch (err) {
      alert('Erro ao salvar: ' + err.message)
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  async function handleClearChat() {
    if (!confirm('Limpar histórico da conversa?')) return
    await clearChat(user.id)
    setMessages([])
    setApprovedActions({})
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] md:h-[calc(100vh-2rem)] -mt-4 md:-mt-6 -mx-4 md:-mx-6">
      {/* Header */}
      <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-gray-800 bg-gray-950">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-emerald-500/20 rounded-xl flex items-center justify-center border border-emerald-500/30">
            <Bot size={16} className="text-emerald-400"/>
          </div>
          <div>
            <p className="text-sm font-bold text-white">Assistente Financeiro</p>
            <p className="text-xs text-emerald-400">• online</p>
          </div>
        </div>
        <button onClick={handleClearChat} className="text-xs text-gray-600 hover:text-gray-400">
          <Trash2 size={14}/>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-4">
        {!apiKey && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-center">
            <p className="text-sm text-amber-400">⚠️ Configure sua Claude API Key em <strong>Configurações</strong> para usar o chat.</p>
          </div>
        )}

        {messages.map(msg => (
          <Message
            key={msg.id}
            msg={msg}
            onApproveAction={() => approveAction(msg.id, msg.metadata?.action)}
            onDismissAction={() => setApprovedActions(prev => ({ ...prev, [msg.id]: 'dismissed' }))}
            actionApproved={approvedActions[msg.id] === true}
          />
        ))}

        {loading && (
          <div className="flex items-end gap-2">
            <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
              <Bot size={14} className="text-gray-300"/>
            </div>
            <TypingDot/>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>

      {/* Quick prompts */}
      {messages.length <= 1 && (
        <div className="px-4 md:px-6 pb-2 flex gap-2 overflow-x-auto scrollbar-none">
          {QUICK_PROMPTS.map(p => (
            <button key={p} onClick={() => sendMessage(p)}
              className="flex-shrink-0 text-xs px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-full border border-gray-700 transition-all whitespace-nowrap">
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-4 md:px-6 py-3 border-t border-gray-800 bg-gray-950">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            rows={1}
            className="input resize-none flex-1 max-h-32 overflow-y-auto"
            placeholder="Escreva um gasto, intenção de compra..."
            value={input}
            onChange={e => {
              setInput(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px'
            }}
            onKeyDown={handleKey}
          />
          <button onClick={() => sendMessage()} disabled={loading || !input.trim()}
            className="btn-primary p-2.5 flex-shrink-0 disabled:opacity-40">
            {loading ? <Loader2 size={18} className="animate-spin"/> : <Send size={18}/>}
          </button>
        </div>
        <p className="text-xs text-gray-600 mt-1.5 text-center">Enter para enviar • Shift+Enter para quebrar linha</p>
      </div>
    </div>
  )
}
