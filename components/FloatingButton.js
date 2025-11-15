import { FaWhatsapp } from 'react-icons/fa';

export default function FloatingButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 bg-green-500 text-white w-16 h-16 rounded-full shadow-lg flex items-center justify-center z-50 hover:bg-green-600 transition-all"
      aria-label="Contactar por WhatsApp"
    >
      <FaWhatsapp size={36} />
    </button>
  );
}