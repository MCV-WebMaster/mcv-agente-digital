import { useChat } from 'ai/react';
import { useState, useEffect, useRef } from 'react';
import PropertyCard from '@/components/PropertyCard';
import Spinner from '@/components/Spinner';
import ContactModal from '@/components/ContactModal';
import { FaPaperPlane, FaTimes } from 'react-icons/fa';

export default function ChatInterface({ onClose }) {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [contactPayload, setContactPayload] = useState({
    whatsappMessage: '',
    adminEmailHtml: '',
    propertyCount: 0
  });

  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Foco automático
  useEffect(() => {
    if (!isLoading) {
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [isLoading]);

  // Manejadores de Contacto (Internos del Chat)
  const handleContactSingleProperty = (property) => {
    setContactPayload({
      whatsappMessage: `Hola...! Vi esta propiedad en el Chat y me interesa:\n\n${property.title}\n${property.url}`,
      adminEmailHtml: `<ul><li><strong>${property.title}</strong><br><a href="${property.url}">${property.url}</a></li></ul>`,
      propertyCount: 1
    });
    setIsModalOpen(true);
  };

  const handleGeneralContact = () => {
    setContactPayload({
      whatsappMessage: `Hola...! Hablé con el Asistente Digital y quiero atención personalizada.`,
      adminEmailHtml: `<p>Contacto derivado del Chatbot.</p>`,
      propertyCount: 0
    });
    setIsModalOpen(true);
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 rounded-lg overflow-hidden">
      
      {/* Header del Widget */}
      <div className="bg-mcv-azul text-white p-4 flex justify-between items-center shadow-md shrink-0">
        <div>
          <h3 className="font-bold text-lg">Asistente MCV</h3>
          <p className="text-xs opacity-90">En línea | IA</p>
        </div>
        <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-full transition">
          <FaTimes />
        </button>
      </div>

      {/* Área de Mensajes */}
      <div ref={scrollRef} className="flex-grow p-4 overflow-y-auto space-y-4">
        {messages.length === 0 && (
          <div className="bg-white p-4 rounded-lg shadow-sm text-sm text-gray-600 text-center mt-4">
            <p>👋 ¡Hola! Soy tu asistente virtual.</p>
            <p className="mt-2">Preguntame por alquileres en <strong>Costa Esmeralda</strong> (ej. para enero) o ventas en <strong>GBA Sur</strong>.</p>
          </div>
        )}

        {messages.map(m => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div 
              className={`max-w-[90%] rounded-lg p-3 text-sm shadow-sm ${
                m.role === 'user' 
                  ? 'bg-mcv-azul text-white' 
                  : 'bg-white text-gray-800 border border-gray-200'
              }`}
            >
              <p className="whitespace-pre-wrap">{m.content}</p>

              {m.toolInvocations?.map((toolInvocation) => {
                const { toolName, toolCallId, state, args } = toolInvocation;

                if (state === 'result') {
                  const { result } = toolInvocation;
                  
                  if (toolName === 'buscar_propiedades') {
                    return (
                      <div key={toolCallId} className="mt-3 space-y-3">
                        <p className="text-xs text-gray-500 border-b pb-1">
                           {result.count} opciones encontradas:
                        </p>
                        {result.properties.map(prop => (
                          // Renderizamos tarjetas compactas para el chat
                          <div key={prop.property_id} className="transform scale-95 -ml-2">
                             <PropertyCard 
                                property={prop} 
                                filters={args} 
                                onContact={handleContactSingleProperty} 
                              />
                          </div>
                        ))}
                      </div>
                    );
                  }

                  if (toolName === 'mostrar_contacto') {
                    return (
                      <button
                        key={toolCallId}
                        onClick={handleGeneralContact}
                        className="mt-3 w-full px-3 py-2 bg-mcv-verde text-white font-bold rounded shadow hover:bg-opacity-90 text-xs"
                      >
                        💬 Contactar Agente
                      </button>
                    );
                  }
                } 
                return (
                  <div key={toolCallId} className="mt-2 flex items-center gap-2 text-gray-400 italic text-xs">
                    <Spinner /> Buscando...
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
             <div className="bg-gray-200 text-gray-500 rounded-lg p-2 text-xs flex items-center gap-1">
                <span className="animate-bounce">●</span>
                <span className="animate-bounce delay-100">●</span>
                <span className="animate-bounce delay-200">●</span>
             </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="bg-white border-t border-gray-200 p-3 shrink-0">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            ref={inputRef}
            className="flex-grow p-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-mcv-azul"
            value={input}
            onChange={handleInputChange}
            placeholder="Escribí tu consulta..."
            disabled={isLoading}
          />
          <button 
            type="submit"
            disabled={isLoading || !input.trim()} 
            className="bg-mcv-azul text-white p-2 rounded-md hover:bg-opacity-90 disabled:opacity-50"
          >
            <FaPaperPlane />
          </button>
        </form>
      </div>

      {/* Modal Interno (Para que funcione sobre el chat) */}
      <ContactModal
        isOpen={isModalOpen}
        onRequestClose={() => setIsModalOpen(false)}
        whatsappMessage={contactPayload.whatsappMessage}
        adminEmailHtml={contactPayload.adminEmailHtml}
        propertyCount={contactPayload.propertyCount}
      />
    </div>
  );
}