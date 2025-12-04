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
    onError: (error) => console.error("Chat Error:", error)
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [contactPayload, setContactPayload] = useState({});
  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!isLoading) setTimeout(() => inputRef.current?.focus(), 50);
  }, [isLoading]);

  const handleContact = (property) => {
    let agent = process.env.NEXT_PUBLIC_WHATSAPP_AGENT_NUMBER;
    if (property?.zona === 'Costa Esmeralda' && !property.min_rental_price) {
         agent = process.env.NEXT_PUBLIC_WHATSAPP_AGENT2_NUMBER;
    }
    setContactPayload({ 
        whatsappMessage: `Hola MaCA! Me interesa: ${property.title}`,
        adminEmailHtml: `<p>Interés en: ${property.title}</p>`,
        propertyCount: 1, 
        filteredProperties: [property],
        targetAgentNumber: agent
    });
    setIsModalOpen(true);
  };
  
  const handleGeneralContact = () => {
      setContactPayload({ 
          whatsappMessage: `Hola MaCA! Necesito asesoramiento.`,
          adminEmailHtml: `<p>Contacto general.</p>`,
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
        {...contactPayload}
      />

      <header className="bg-white border-b p-4 shadow-sm z-10 flex justify-between">
        <span className="text-mcv-azul font-bold text-lg">MaCA - MCV Propiedades</span>
      </header>

      <div className="flex-grow overflow-y-auto p-4 pb-24">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="bg-white p-6 rounded text-center mt-10">
              <h2 className="text-2xl font-bold text-mcv-azul">¡Hola! Soy MaCA.</h2>
              <p className="text-gray-600">Soy parte del equipo de Cecilia, Marcela y Andrea.<br/>¿Buscas comprar o alquilar?</p>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[90%] md:max-w-[80%] rounded-lg p-4 shadow-sm ${m.role === 'user' ? 'bg-mcv-azul text-white' : 'bg-white text-gray-800 border'}`}>
                <div className="whitespace-pre-wrap">{m.content}</div>
                {m.toolInvocations?.map((tool) => {
                  if (tool.state === 'result' && tool.toolName === 'buscar_propiedades') {
                    const props = tool.result?.properties || [];
                    // Si hay warning y no props, no mostramos nada (la IA hablará)
                    if (tool.result?.warning === 'too_many') return null;
                    if (props.length === 0) return null;

                    return (
                      <div key={tool.toolCallId} className="mt-4 grid gap-4">
                         {props.map(p => (
                            <PropertyCard 
                                key={p.property_id} 
                                property={p} 
                                filters={tool.result?.appliedFilters || {}} 
                                onContact={handleContact} 
                                small 
                            />
                         ))}
                      </div>
                    );
                  }
                  if (tool.state === 'result' && tool.toolName === 'mostrar_contacto') {
                      return (
                          <div key={tool.toolCallId} className="mt-4">
                            <button onClick={handleGeneralContact} className="w-full bg-green-600 text-white py-2 rounded font-bold">
                                💬 Contactar Agente
                            </button>
                          </div>
                      );
                  }
                  return <div key={tool.toolCallId} className="mt-2 italic text-gray-400 text-sm"><Spinner /></div>;
                })}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="fixed bottom-0 left-0 w-full bg-white border-t p-4">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex gap-2">
          <input ref={inputRef} className="flex-grow p-3 border rounded-lg" value={input} onChange={handleInputChange} placeholder="Escribí tu consulta..." disabled={isLoading} />
          <button type="submit" disabled={isLoading || !input.trim()} className="bg-mcv-azul text-white px-6 py-3 rounded-lg font-bold">Enviar</button>
        </form>
      </div>
    </div>
  );
}