import Link from 'next/link';

export default function FloatingChatButton() {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 group">
      
      {/* Etiqueta de Texto "Hablar con MaCA" (Aparece a la izquierda) */}
      <div className="bg-white px-4 py-2 rounded-full shadow-lg border border-slate-100 transform transition-all duration-300 opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 hidden md:block">
        <span className="text-sm font-bold text-slate-800">Hablar con MaCA</span>
      </div>

      {/* Botón Circular Principal */}
      <Link href="/chat" className="relative">
        {/* Círculo con efecto de pulso (Onda expansiva) */}
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
        
        {/* El Botón en sí */}
        <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-white shadow-xl transition-transform duration-300 hover:scale-110 hover:bg-blue-600 cursor-pointer">
          {/* Icono de Robot/Chat (SVG) */}
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            fill="none" 
            viewBox="0 0 24 24" 
            strokeWidth={1.5} 
            stroke="currentColor" 
            className="w-7 h-7"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
          </svg>
        </div>

        {/* Badge de "Notificación" (Puntito rojo) */}
        <span className="absolute top-0 right-0 flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
        </span>
      </Link>
    </div>
  );
}