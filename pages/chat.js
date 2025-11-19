import { useChat } from 'ai/react';
import { useState, useEffect, useRef } from 'react';
import PropertyCard from '@/components/PropertyCard';
import Spinner from '@/components/Spinner';
import Modal from 'react-modal';
import ContactModal from '@/components/ContactModal';
import Link from 'next/link';

Modal.setAppElement('#__next');

export default function ChatPage() {
  const { messages, input, handleInputChange, handleSubmit, isLoading, reload } = useChat({
    api: '/api/chat',
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [contactPayload, setContactPayload] = useState({
    whatsappMessage: '',
    adminEmailHtml: '',
    propertyCount: 0
  });
  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'user') {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      } 
    }
  }, [messages]);

  useEffect(() => {
    if (!isLoading) {
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [isLoading]);

  const handleContactSingleProperty = (property) => {
    const whatsappMessage = `Hola...! Te escribo porque vi esta propiedad en el Chat del Asistente Digital y me interesa:\n\n${property.title}\n${property.url}`;
    const adminEmailHtml = `<ul><li><strong>${property.title}</strong><br><a href="${property.url}">${property.url}</a></li></ul>`;
    setContactPayload({ whatsappMessage, adminEmailHtml, propertyCount: 1 });
    setIsModalOpen(true);
  };

  const handleGeneralContact = () => {
    const whatsappMessage = `Hola...! Te escribo desde el Chat del Asistente Digital. Quisiera recibir asesoramiento personalizado.`;
    const adminEmailHtml = `<p>Contacto derivado del Chatbot.</p>`;
    setContactPayload({ whatsappMessage, adminEmailHtml, propertyCount: 0 });
    setIsModalOpen(true);
  };

  const buildSearchUrl = (filters) => {
    const params = new URLSearchParams();
    if (filters.operacion) params.set('operacion', filters.operacion);
    if (filters.zona) params.set('zona', filters.zona);
    if (filters.barrios && filters.barrios.length) params.set('barrios', filters.barrios.join(','));
    if (filters.tipo) params.set('tipo', filters.tipo);
    if (filters.pax) params.set('pax', filters.pax);
    if (filters.selectedPeriod) params.set('selectedPeriod', filters.selectedPeriod);
    if (filters.searchText) params.set('searchText', filters.searchText);
    if (filters.minPrice) params.set('minPrice', filters.minPrice);
    if (filters.maxPrice) params.set('maxPrice', filters.maxPrice);
    return `/?${params.toString()}`;
  };

  return (
    <div id="__next" className="min-h-screen bg-gray-50 flex flex-col">
      
      <ContactModal
        isOpen={isModalOpen}
        onRequestClose={() => setIsModalOpen(false)}
        whatsappMessage={contactPayload.whatsappMessage}
        adminEmailHtml={contactPayload.adminEmailHtml}
        propertyCount={contactPayload.propertyCount}
      />

      <header className="bg-white border-b border-gray-200 p-4 shadow-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex justify-between items-center">
           <a href="/" className="text-mcv-azul font-bold text-lg hover:underline">&larr; Volver al Buscador</a>
           <h1 className="text-xl font-bold text-gray-800">Chat con Asistente MCV</h1>
        </div>
      </header>

      <div className="flex-grow p-4 pb-24">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="bg-white p-6 rounded-lg shadow text-center">
              <h2 className="text-2xl font-bold text-mcv-azul mb-2">¡Hola! Soy tu Asistente Virtual.</h2>
              <p className="text-gray-600">
                Puedo ayudarte a encontrar propiedades en venta o alquiler.
              </p>
            </div>
          )}

          {messages.map((m, index) => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div 
                className={`max-w-[90%] md:max-w-[80%] rounded-lg p-4 shadow-sm ${
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
                      const seeAllUrl = buildSearchUrl(result.appliedFilters || args);
                      
                      const showResultCards = result.count > 0 && result.count <= 10; // Condición para mostrar tarjetas

                      return (
                        <div key={toolCallId} className="mt-4">
                          <div className="text-sm text-gray-500 mb-2">
                             Encontré {result.count} propiedades (mostrando las primeras {result.properties.length}):
                          </div>
                          
                          {/* --- TARJETAS (SOLO SI NO SON MUCHAS) --- */}
                          {showResultCards && (
                            <div className="grid grid-cols-1 gap-4 mb-4">
                              {result.properties.map(prop => (
                                <PropertyCard 
                                  key={prop.property_id} 
                                  property={prop} 
                                  filters={args} 
                                  onContact={handleContactSingleProperty}
                                />
                              ))}
                            </div>
                          )}

                          {/* --- ACCIONES POST-RESULTADO --- */}
                          <div className="flex flex-col gap-2">
                            {/* Botón 1: Contactar (Cierre) */}
                            <button
                              onClick={handleGeneralContact}
                              className="w-full px-4 py-3 bg-mcv-verde text-white font-bold rounded-lg shadow hover:bg-opacity-90 transition-all flex items-center justify-center gap-2"
                            >
                              <span>💬</span> Contactar con un Agente
                            </button>
                            
                            {/* Botón 2: Ver Todo / Volver a Empezar */}
                            <a 
                              href={seeAllUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block w-full text-center py-3 bg-gray-100 text-mcv-azul font-bold rounded-lg border border-gray-300 hover:bg-gray-200 transition-all text-sm"
                              // Si hay resultados (ej. 40), ofrece ver todo. Si hay 0, ofrece empezar de nuevo.
                            >
                              {result.count > 0 
                                ? `🔍 Ver las ${result.count} opciones en el Buscador` 
                                : `🔁 Empezar una Nueva Búsqueda`
                              }
                            </a>
                          </div>
                        </div>
                      );
                    }

                    if (toolName === 'mostrar_contacto') {
                      return (
                        <div key={toolCallId} className="mt-4">
                          <button
                            onClick={handleGeneralContact}
                            className="w-full px-4 py-3 bg-mcv-verde text-white font-bold rounded-lg shadow hover:bg-opacity-90 transition-all flex items-center justify-center gap-2"
                          >
                            <span>💬</span> Contactar con un Agente
                          </button>
                        </div>
                      );
                    }
                  } 
                  return (
                    <div key={toolCallId} className="mt-2 flex items-center gap-2 text-gray-500 italic text-sm">
                      <Spinner /> Buscando propiedades...
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {isLoading && <div className="text-center text-gray-500"><Spinner /> Escribiendo...</div>}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 p-4">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex gap-2">
          <input
            ref={inputRef}
            className="flex-grow p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-mcv-azul disabled:opacity-50"
            value={input}
            onChange={handleInputChange}
            placeholder="Escribí tu consulta aquí..."
            disabled={isLoading}
          />
          <button 
            type="submit"
            disabled={isLoading || !input.trim()} 
            className="bg-mcv-azul text-white px-6 py-3 rounded-lg font-bold hover:bg-opacity-90 disabled:opacity-50"
          >
            Enviar
          </button>
        </form>
      </div>
    </div>
  );
}