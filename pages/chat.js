import { useChat } from 'ai/react';
import { useState, useEffect, useRef } from 'react';
import PropertyCard from '@/components/PropertyCard';
import Spinner from '@/components/Spinner';
import Modal from 'react-modal';
import ContactModal from '@/components/ContactModal';

Modal.setAppElement('#__next');

export default function ChatPage() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
    onError: (error) => {
      console.error("Error en el chat:", error);
    }
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [contactPayload, setContactPayload] = useState({
    whatsappMessage: '',
    adminEmailHtml: '',
    propertyCount: 0,
    filteredProperties: [],
    currentFilters: {}
  });
  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!isLoading) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isLoading]);

  const handleContactSingleProperty = (property) => {
    const whatsappMessage = `Hola...! Vengo del chat y me interesa esta propiedad: ${property.title} (${property.url})`;
    const adminEmailHtml = `<ul><li><strong>${property.title}</strong><br><a href="${property.url}">${property.url}</a></li></ul>`;
    
    let targetAgent = process.env.NEXT_PUBLIC_WHATSAPP_AGENT_NUMBER;
    if (property.zona === 'Costa Esmeralda' && (!property.min_rental_price)) { 
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
  
  const handleGeneralContact = () => {
      const whatsappMessage = `Hola...! Necesito asesoramiento personalizado.`;
      const adminEmailHtml = `<p>Contacto general desde el Chat.</p>`;
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
      
      <ContactModal
        isOpen={isModalOpen}
        onRequestClose={() => setIsModalOpen(false)}
        whatsappMessage={contactPayload.whatsappMessage}
        adminEmailHtml={contactPayload.adminEmailHtml}
        propertyCount={contactPayload.propertyCount}
        filteredProperties={contactPayload.filteredProperties}
        targetAgentNumber={contactPayload.targetAgentNumber}
      />

      <header className="bg-white border-b border-gray-200 p-4 shadow-sm flex-none z-10">
        <div className="max-w-3xl mx-auto flex justify-between items-center">
           <span className="text-mcv-azul font-bold text-lg">Asistente MCV</span>
        </div>
      </header>

      <div className="flex-grow overflow-y-auto p-4 pb-24">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="bg-white p-6 rounded-lg shadow text-center mt-10">
              <h2 className="text-2xl font-bold text-mcv-azul mb-2">¡Hola! Soy tu Asistente.</h2>
              <p className="text-gray-600">
                Puedo ayudarte a buscar propiedades. <br/>
                Prueba decir: <em>"Busco alquiler en Costa Esmeralda"</em> o <em>"Quiero comprar en El Carmen"</em>.
              </p>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div 
                className={`max-w-[90%] md:max-w-[80%] rounded-lg p-4 shadow-sm ${
                  m.role === 'user' 
                    ? 'bg-mcv-azul text-white' 
                    : 'bg-white text-gray-800 border border-gray-200'
                }`}
              >
                <div className="whitespace-pre-wrap">{m.content}</div>

                {m.toolInvocations?.map((toolInvocation) => {
                  const { toolName, toolCallId, state, result } = toolInvocation;

                  if (state === 'result' && toolName === 'buscar_propiedades') {
                    const properties = Array.isArray(result?.properties) ? result.properties : [];
                    
                    if (result?.warning === 'too_many') {
                        return null; 
                    }
                    
                    return (
                      <div key={toolCallId} className="mt-4 grid gap-4">
                         {properties.length > 0 ? (
                             properties.map(prop => {
                                if (!prop || !prop.property_id) return null;
                                return (
                                    <PropertyCard 
                                        key={prop.property_id} 
                                        property={prop} 
                                        filters={result?.appliedFilters || {}} 
                                        onContact={handleContactSingleProperty}
                                        small 
                                    />
                                );
                             })
                         ) : (
                             <div className="text-sm italic text-gray-500 p-2 bg-gray-50 rounded border border-gray-200">
                                (Sin resultados exactos para mostrar en tarjetas)
                             </div>
                         )}
                      </div>
                    );
                  }
                  
                  if (state === 'result' && toolName === 'mostrar_contacto') {
                      return (
                          <div key={toolCallId} className="mt-4">
                            <button 
                                onClick={handleGeneralContact}
                                className="w-full bg-green-600 text-white py-2 px-4 rounded font-bold hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                            >
                                <span>💬</span> Contactar por WhatsApp
                            </button>
                          </div>
                      );
                  }

                  return <div key={toolCallId} className="mt-2 italic text-gray-500 text-sm flex items-center gap-2"><Spinner /> Buscando...</div>;
                })}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

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