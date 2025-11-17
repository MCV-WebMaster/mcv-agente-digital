import { useState } from 'react';
import { FaRobot, FaCommentDots } from 'react-icons/fa'; // Iconos de Chat
import ChatInterface from './ChatInterface';

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* --- VENTANA DEL CHAT (Solo visible si isOpen es true) --- */}
      <div 
        className={`fixed bottom-24 right-4 w-[90vw] md:w-[400px] h-[600px] max-h-[80vh] z-50 transition-all duration-300 transform origin-bottom-right shadow-2xl rounded-xl border border-gray-200 ${
          isOpen ? 'scale-100 opacity-100' : 'scale-0 opacity-0 pointer-events-none'
        }`}
      >
        {/* Renderizamos el chat solo si se abrió alguna vez para preservar estado, o condicionalmente para resetear. 
            Aquí usamos condicional para que se resetee al cerrar/abrir (opcional). 
            Para persistir, quitar la condición `isOpen &&`. 
        */}
        {isOpen && <ChatInterface onClose={() => setIsOpen(false)} />}
      </div>

      {/* --- BOTÓN FLOTANTE --- */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`${
          isOpen ? 'bg-gray-600' : 'bg-mcv-azul'
        } fixed bottom-6 right-6 w-16 h-16 rounded-full shadow-lg flex items-center justify-center z-50 hover:brightness-110 transition-all text-white text-3xl`}
        aria-label="Abrir Asistente Virtual"
      >
        {isOpen ? <FaTimesIcon /> : <FaCommentDots />}
      </button>
    </>
  );
}

// Icono simple de X para no importar otra libreria si no hace falta, 
// o usamos FaTimes de react-icons
import { FaTimes } from 'react-icons/fa';
const FaTimesIcon = () => <FaTimes size={24} />;