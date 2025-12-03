import { useChat } from 'ai/react';
import { useState, useEffect, useRef } from 'react';
import PropertyCard from '@/components/PropertyCard';
import Spinner from '@/components/Spinner';
import Modal from 'react-modal';
import ContactModal from '@/components/ContactModal';

Modal.setAppElement('#__next');

export default function ChatPage() {
  // Hook del chat con manejo de errores
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
    onError: (error) => {
      console.error("Error en el chat:", error);
    }
  });

  // Estados locales para el modal y contacto
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [contactPayload, setContactPayload] = useState({
    whatsappMessage: '',
    adminEmailHtml: '',
    propertyCount: 0,
    filteredProperties: [],
    currentFilters: {},
    targetAgentNumber: ''
  });
  
  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Scroll automático al fondo
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Foco automático en el input al terminar de responder
  useEffect(() => {
    if (!isLoading) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isLoading]);

  // Handler: Contactar por una propiedad específica (Tarjeta)
  const handleContactSingleProperty = (property) => {
    // Mensaje personalizado para MaCA
    const whatsappMessage = `Hola MaCA! Vengo del chat y me interesa esta propiedad: ${property.title} (${property.url})`;
    const adminEmailHtml = `<ul><li><strong>${property.title}</strong><br><a href="${property.url}">${property.url}</a></li></ul>`;
    
    // Lógica de Routing de Agente (F)
    let targetAgent = process.env.NEXT_PUBLIC_WHATSAPP_AGENT_NUMBER;
    // Si es Costa Esmeralda y NO tiene precio de alquiler (asumimos venta o anual), va al Agente 2
    if (property.zona === 'Costa Esmeralda' && (!property.min_rental_price && !property.found_period_price)) { 
         targetAgent = process.env.NEXT_PUBLIC_WHATSAPP_AGENT2_NUMBER;
    }

    setContactPayload({ 
        whatsappMessage, 
        adminEmailHtml, 
        propertyCount: 1, 
        filteredProperties: [property],
        targetAgentNumber: targetAgent
    });
    setIsModalOpen(true);
  };
  
  // Handler: Contacto General (Botón de la IA)
  const handleGeneralContact = () => {
      const whatsappMessage = `Hola MaCA! Necesito asesoramiento personalizado sobre lo que hablamos.`;
      const adminEmailHtml = `<p>Contacto general desde el Chat con MaCA.</p>`;
      setContactPayload({ 
          whatsappMessage, 
          adminEmailHtml, 
          propertyCount: 0, 
          targetAgentNumber: process.env.NEXT_PUBLIC_WHATSAPP_AGENT_NUMBER
      });
      setIsModalOpen(true);
  };

  return (
    <div id="__next" className="flex flex-col h-screen bg-gray-50">
      
      {/* Modal de Contacto Reutilizable */}
      <ContactModal
        isOpen={isModalOpen}
        onRequestClose={() => setIsModalOpen(false)}
        whatsappMessage={contactPayload.whatsappMessage}
        adminEmailHtml={contactPayload.adminEmailHtml}
        propertyCount={contactPayload.propertyCount}
        filteredProperties={contactPayload.filteredProperties}
        targetAgentNumber={contactPayload.targetAgentNumber}
      />

      {/* Encabezado Fijo */}
      <header className="bg-white border-b border-gray-200 p-4 shadow-sm flex-none z-10">
        <div className="max-w-3xl mx-auto flex justify-between items-center">
           <span className="text-mcv-azul font-bold text-lg">MaCA - MCV Propiedades</span>
        </div>
      </header>

      {/* Área de Mensajes (Scrollable) */}
      <div className="flex-grow overflow-y-auto p-4 pb-24">
        <div className="max-w-3xl mx-auto space-y-6">
          
          {/* Mensaje de Bienvenida (Empty State) */}
          {messages.length === 0 && (
            <div className="bg-white p-6 rounded-lg shadow text-center mt-10 animate-fade-in">
              <h2 className="text-2xl font-bold text-mcv-azul mb-2">¡Hola! Soy MaCA.</h2>
              <p className="text-gray-600 leading-relaxed">
                Soy tu asistente virtual. Trabajo junto a Cecilia, Marcela y Andrea.<br/>
                ¿Buscas <strong>comprar</strong> o <strong>alquilar</strong>?
              </p>
            </div>
          )}

          {/* Lista de Mensajes */}
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div 
                className={`max-w-[90%] md:max-w-[80%] rounded-lg p-4 shadow-sm ${
                  m.role === 'user' 
                    ? 'bg-mcv-azul text-white' 
                    : 'bg-white text-gray-800 border border-gray-200'
                }`}
              >
                {/* Texto del Mensaje */}
                <div className="whitespace-pre-wrap">{m.content}</div>

                {/* Renderizado de Herramientas (Tarjetas/Botones) */}
                {m.toolInvocations?.map((toolInvocation) => {
                  const { toolName, toolCallId, state, result } = toolInvocation;

                  // Caso: Mostrar Propiedades
                  if (state === 'result' && toolName === 'buscar_propiedades') {
                    const properties = Array.isArray(result?.properties) ? result.properties : [];
                    const appliedFilters = result?.appliedFilters || {};
                    
                    // Si la IA decidió no mostrar nada (too_many), retornamos null
                    if (result?.warning === 'too_many') {
                        return null; 
                    }
                    
                    // Si el array está vacío pero no es too_many, no mostramos grid vacío
                    if (properties.length === 0) return null;

                    return (
                      <div key={toolCallId} className="mt-4 grid gap-4">
                         {properties.map(prop => {
                            // Protección contra objetos inválidos
                            if (!prop || !prop.property_id) return null;
                            
                            return (
                                <PropertyCard 
                                    key={prop.property_id} 
                                    property={prop} 
                                    filters={appliedFilters} // Pasamos filtros para calcular precio correcto
                                    onContact={handleContactSingleProperty}
                                    small // Estilo compacto para chat
                                />
                            );
                         })}
                      </div>
                    );
                  }
                  
                  // Caso: Botón de Contacto General
                  if (state === 'result' && toolName === 'mostrar_contacto') {
                      return (
                          <div key={toolCallId} className="mt-4">
                            <button 
                                onClick={handleGeneralContact}
                                className="w-full bg-green-600 text-white py-2 px-4 rounded font-bold hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                            >
                                <span>💬</span> Hablar con una Agente
                            </button>
                          </div>
                      );
                  }

                  // Estado de carga de la herramienta
                  return <div key={toolCallId} className="mt-2 italic text-gray-400 text-sm flex items-center gap-2"><Spinner /> Buscando...</div>;
                })}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Fijo Abajo */}
      <div className="fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 p-4 flex-none">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex gap-2">
          <input
            ref={inputRef}
            className="flex-grow p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-mcv-azul text-black"
            value={input}
            onChange={handleInputChange}
            placeholder="Escribí tu consulta..."
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