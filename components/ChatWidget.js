import { useState, useEffect } from 'react';
import { FaCommentDots, FaTimes } from 'react-icons/fa';
import ChatInterface from './ChatInterface';

const MESSAGES = [
  "👋 ¡Hola! Soy tu asistente virtual. 👋",
  "🆘 ¿En qué te puedo ayudar? 🆘",
  "🕑 ¡Disponible las 24hs...! 🕑",
  "🙋‍♀️ ¡No dudes en consultarme...! 🙋‍♀️",
  "🏠 ¿Buscas casa en Costa Esmeralda? 🌊",
  "🔑 Encontremos tu propiedad ideal.",
  "💬 Estoy aquí para responder tus dudas.",
  "🏖️ ¡Planifica tus vacaciones 2026! ☀️",
  "💼 ¿Querés comprar o alquilar?",
  "🔍 Te ayudo a filtrar las mejores opciones.",
  "⚡ Respuestas inmediatas con IA.",
  "🌲 ¿Te interesa GBA Sur o Arelauquen?",
  "📅 Consulta disponibilidad en segundos.",
  "🤝 ¿Preferís hablar con un Agente? Te conecto."
];

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [showBubble, setShowBubble] = useState(false);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setShowBubble(false);
      return;
    }

    const delayBeforeShow = currentMessageIndex === 0 ? 5000 : 30000;

    const timerShow = setTimeout(() => {
      setShowBubble(true);

      const timerHide = setTimeout(() => {
        setShowBubble(false);
        setTimeout(() => {
          setCurrentMessageIndex((prev) => (prev + 1) % MESSAGES.length);
        }, 500);
      }, 10000); 

      return () => clearTimeout(timerHide);
    }, delayBeforeShow);

    return () => clearTimeout(timerShow);
  }, [currentMessageIndex, isOpen]);


  return (
    <>
      <div 
        className={`fixed bottom-24 right-4 w-[90vw] md:w-[400px] h-[600px] max-h-[80vh] z-50 transition-all duration-300 transform origin-bottom-right shadow-2xl rounded-xl border border-gray-200 ${
          isOpen ? 'scale-100 opacity-100' : 'scale-0 opacity-0 pointer-events-none'
        }`}
      >
        {isOpen && <ChatInterface onClose={() => setIsOpen(false)} />}
      </div>

      <div 
        className={`fixed bottom-24 right-6 z-40 transition-all duration-500 transform ${
          showBubble ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
      >
        <div className="bg-white text-gray-800 px-4 py-3 rounded-lg shadow-lg border border-gray-200 relative max-w-[250px]">
          <p className="text-sm font-medium leading-tight text-center">
            {MESSAGES[currentMessageIndex]}
          </p>
          <div className="absolute -bottom-2 right-6 w-4 h-4 bg-white transform rotate-45 border-r border-b border-gray-200"></div>
          <button 
            onClick={() => setShowBubble(false)}
            className="absolute -top-2 -right-2 bg-gray-200 rounded-full p-1 hover:bg-gray-300 text-gray-600"
          >
            <FaTimes size={10} />
          </button>
        </div>
      </div>

      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`${
          isOpen ? 'bg-gray-600' : 'bg-mcv-azul'
        } fixed bottom-6 right-6 w-16 h-16 rounded-full shadow-lg flex items-center justify-center z-50 hover:brightness-110 transition-all text-white text-3xl animate-bounce-slow`}
        aria-label="Abrir Asistente Virtual"
        style={{ animationDuration: '3s' }} 
      >
        {isOpen ? <FaTimes size={24} /> : <FaCommentDots />}
      </button>
    </>
  );
}