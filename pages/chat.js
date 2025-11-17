import { useChat } from 'ai/react';
import { useState, useEffect } from 'react';
import PropertyCard from '@/components/PropertyCard';
import Spinner from '@/components/Spinner';
import Modal from 'react-modal';
import ContactModal from '@/components/ContactModal';

// Configuración del Modal
Modal.setAppElement('#__next');

export default function ChatPage() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
  });

  // Estado para el Modal de Contacto
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [contactPayload, setContactPayload] = useState({
    whatsappMessage: '',
    adminEmailHtml: '',
    propertyCount: 0
  });

  // Auto-scroll al fondo
  useEffect(() => {
    window.scrollTo(0, document.body.scrollHeight);
  }, [messages]);

  // Manejador de Contacto (Idéntico al del Buscador)
  const handleContactSingleProperty = (property) => {
    const whatsappMessage = `Hola...! Te escribo porque vi esta propiedad en el Chat del Asistente Digital y me interesa:\n\n${property.title}\n${property.url}`;
    const adminEmailHtml = `<ul><li><strong>${property.title}</strong><br><a href="${property.url}">${property.url}</a></li></ul>`;

    setContactPayload({
      whatsappMessage,
      adminEmailHtml,
      propertyCount: 1
    });
    setIsModalOpen(true);
  };

  return (
    // ID __next necesario para el Modal
    <div id="__next" className="min-h-screen bg-gray-50 flex flex-col">
      
      {/* Modal de Contacto */}
      <ContactModal
        isOpen={isModalOpen}
        onRequestClose={() => setIsModalOpen(false)}
        whatsappMessage={contactPayload.whatsappMessage}
        adminEmailHtml={contactPayload.adminEmailHtml}
        propertyCount={contactPayload.propertyCount}
      />

      {/* Header */}
      <header className="bg-white border-b border-gray-200 p-4 shadow-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex justify-between items-center">
           <a href="/" className="text-mcv-azul font-bold text-lg hover:underline">&larr; Volver al Buscador</a>
           <h1 className="text-xl font-bold text-gray-800">Chat con Asistente MCV</h1>
        </div>
      </header>

      {/* Área de Chat */}
      <div className="flex-grow p-4 pb-24">
        <div className="max-w-3xl mx-auto space-y-6">
          
          {/* Mensaje de Bienvenida */}
          {messages.length === 0 && (
            <div className="bg-white p-6 rounded-lg shadow text-center">
              <h2 className="text-2xl font-bold text-mcv-azul mb-2">¡Hola! Soy tu Asistente Virtual.</h2>
              <p className="text-gray-600">
                Puedo ayudarte a encontrar propiedades en venta o alquiler. <br/>
                Probá preguntarme: <em>"Busco una casa en Costa Esmeralda con pileta para enero"</em> o <em>"Quiero comprar un lote en GBA Sur".</em>
              </p>
            </div>
          )}

          {messages.map(m => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div 
                className={`max-w-[90%] md:max-w-[80%] rounded-lg p-4 shadow-sm ${
                  m.role === 'user' 
                    ? 'bg-mcv-azul text-white' 
                    : 'bg-white text-gray-800 border border-gray-200'
                }`}
              >
                <p className="whitespace-pre-wrap">{m.content}</p>

                {/* --- RENDERIZADO DE HERRAMIENTAS (Propiedades) --- */}
                {m.toolInvocations?.map((toolInvocation) => {
                  const { toolName, toolCallId, state } = toolInvocation;

                  if (state === 'result') {
                    const { result } = toolInvocation;
                    
                    if (toolName === 'buscar_propiedades') {
                      return (
                        <div key={toolCallId} className="mt-4">
                          <div className="text-sm text-gray-500 mb-2">
                             Encontré {result.count} propiedades (mostrando las primeras {result.properties.length}):
                          </div>
                          <div className="grid grid-cols-1 gap-4">
                            {result.properties.map(prop => (
                              <PropertyCard 
                                key={prop.property_id} 
                                property={prop} 
                                filters={{}} // Sin filtros de fecha específicos en el chat por ahora
                                onContact={handleContactSingleProperty} // ¡Conectado!
                              />
                            ))}
                          </div>
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
        </div>
      </div>

      {/* Input Fijo Abajo */}
      <div className="fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 p-4">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex gap-2">
          <input
            className="flex-grow p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-mcv-azul"
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