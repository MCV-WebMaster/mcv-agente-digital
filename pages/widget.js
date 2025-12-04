'use client';

import { useChat } from 'ai/react';
import { useEffect, useRef } from 'react';

export default function WidgetPage() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
  });
  
  const messagesEndRef = useRef(null);
  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  useEffect(() => { scrollToBottom(); }, [messages]);

  return (
    // Fondo transparente para que parezca una app nativa
    <div className="h-screen w-full flex flex-col bg-white overflow-hidden font-sans">
      
      {/* Encabezado del Widget */}
      <div className="bg-slate-900 p-3 flex items-center gap-3 shadow-md shrink-0">
        <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center border-2 border-white/20">
          <span className="text-lg">🤖</span>
        </div>
        <div>
          <h1 className="font-bold text-sm text-white">MaCA - Asistente</h1>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
            <span className="text-[10px] text-blue-200">En línea ahora</span>
          </div>
        </div>
      </div>

      {/* Área de Chat */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
        {messages.length === 0 && (
          <div className="text-center mt-10 opacity-60">
            <p className="text-sm text-slate-500">👋 ¡Hola! Soy MaCA.</p>
            <p className="text-xs text-slate-400 mt-1">¿Buscás comprar, alquilar o tenés dudas?</p>
          </div>
        )}

        {messages.map(m => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
              m.role === 'user' 
                ? 'bg-blue-600 text-white rounded-br-none' 
                : 'bg-white text-slate-700 border border-slate-200 rounded-bl-none'
            }`}>
              <div className="whitespace-pre-wrap">{m.content}</div>
              {/* Avisos de herramientas */}
              {m.toolInvocations?.map((tool) => (
                  <div key={tool.toolCallId} className="mt-2 text-xs bg-slate-100 p-2 rounded border border-slate-200 text-slate-500 italic">
                    {tool.toolName === 'buscar_propiedades' ? '🔍 Buscando...' : '⚡ Procesando...'}
                  </div>
              ))}
            </div>
          </div>
        ))}
        
        {isLoading && (
           <div className="flex justify-start">
              <div className="bg-white border border-slate-200 px-3 py-2 rounded-2xl rounded-bl-none shadow-sm">
                 <div className="flex space-x-1">
                    <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></div>
                    <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-75"></div>
                    <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-150"></div>
                 </div>
              </div>
           </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 bg-white border-t border-slate-200 shrink-0">
        <div className="relative flex items-center">
          <input
            className="w-full bg-slate-100 text-slate-800 rounded-full pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 border-none"
            value={input}
            onChange={handleInputChange}
            placeholder="Escribe tu consulta..."
          />
          <button type="submit" disabled={isLoading || !input.trim()} className="absolute right-1.5 p-1.5 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 transition">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
            </svg>
          </button>
        </div>
        <div className="text-center mt-2">
            <a href="/faq" target="_blank" className="text-[10px] text-slate-400 hover:text-blue-500 underline">
                Ver Preguntas Frecuentes
            </a>
        </div>
      </form>
    </div>
  );
}