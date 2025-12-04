'use client';

import { useState, useRef, useEffect } from 'react';
import { useChat } from 'ai/react';

export default function FloatingChatButton() {
  const [isOpen, setIsOpen] = useState(false);
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
  });
  
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col items-end gap-2 font-sans">
      
      {/* --- VENTANA DEL CHAT (WIDGET) --- */}
      {isOpen && (
        // CAMBIO AQUÍ: Usamos h-[70vh] para que ocupe el 70% de la altura visible del iframe
        <div className="bg-white w-[90vw] md:w-[400px] h-[70vh] max-h-[600px] rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden mb-1 animate-in slide-in-from-bottom-5 fade-in duration-300">
          
          {/* Encabezado */}
          <div className="bg-slate-900 p-3 flex justify-between items-center text-white shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center border-2 border-white/20">
                <span className="text-lg">🤖</span>
              </div>
              <div>
                <h3 className="font-bold text-sm">MaCA - Asistente</h3>
                <p className="text-[10px] text-blue-200 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
                  En línea
                </p>
              </div>
            </div>
            <button 
              onClick={() => setIsOpen(false)}
              className="text-white/70 hover:text-white transition"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Área de Mensajes */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50">
            {messages.length === 0 && (
              <div className="text-center mt-8 opacity-60">
                <p className="text-sm text-slate-500">👋 ¡Hola! Soy MaCA.</p>
                <p className="text-xs text-slate-400 mt-1">Consultame lo que necesites.</p>
              </div>
            )}

            {messages.map((m) => (
              <div 
                key={m.id} 
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div 
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                    m.role === 'user' 
                      ? 'bg-blue-600 text-white rounded-br-none' 
                      : 'bg-white text-slate-700 border border-slate-200 rounded-bl-none'
                  }`}
                >
                  <div className="whitespace-pre-wrap">
                    {m.content}
                  </div>
                  
                  {m.toolInvocations?.map((tool) => (
                     <div key={tool.toolCallId} className="mt-2 text-xs bg-slate-100 p-2 rounded border border-slate-200 text-slate-500">
                        {tool.toolName === 'buscar_propiedades' && '🔍 Buscando...'}
                        {tool.toolName === 'mostrar_contacto' && '📞 Contacto...'}
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
          <form onSubmit={handleSubmit} className="p-2 bg-white border-t border-slate-200 shrink-0">
            <div className="relative flex items-center">
              <input
                className="w-full bg-slate-100 text-slate-800 rounded-full pl-3 pr-10 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 border-none"
                value={input}
                onChange={handleInputChange}
                placeholder="Escribe aquí..."
              />
              <button 
                type="submit"
                disabled={isLoading || !input.trim()}
                className="absolute right-1 p-1.5 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 transition"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
                  <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                </svg>
              </button>
            </div>
            <div className="text-center mt-1">
                <a href="/faq" target="_blank" className="text-[10px] text-slate-400 hover:text-blue-500 underline">
                    Ver FAQ
                </a>
            </div>
          </form>

        </div>
      )}

      {/* --- BOTÓN FLOTANTE --- */}
      <div className="flex items-center gap-3 group">
        {!isOpen && (
          <div className="bg-white px-3 py-1.5 rounded-full shadow-lg border border-slate-100 transform transition-all duration-300 opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 hidden md:block">
            <span className="text-xs font-bold text-slate-800">Hablar con MaCA</span>
          </div>
        )}

        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="relative transition-transform duration-300 hover:scale-110 focus:outline-none"
        >
          {!isOpen && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
          )}
          
          <div className={`relative flex h-12 w-12 md:h-14 md:w-14 items-center justify-center rounded-full shadow-xl transition-colors duration-300 ${isOpen ? 'bg-slate-800' : 'bg-blue-600 text-white'}`}>
            {isOpen ? (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="white" className="w-5 h-5 md:w-6 md:h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 md:w-7 md:h-7 text-white">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
              </svg>
            )}
          </div>

          {!isOpen && (
            <span className="absolute top-0 right-0 flex h-3 w-3">
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 border border-white"></span>
            </span>
          )}
        </button>
      </div>
    </div>
  );
}