export default function Footer() {
  return (
    <footer className="bg-gray-800 text-gray-300 pt-12 pb-6 mt-16">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex flex-wrap -mx-4">

          {/* --- Columna 1: Nosotras --- */}
          <div className="w-full md:w-1/3 px-4 mb-8">
            <h5 className="text-lg font-bold text-white mb-4">Nosotras</h5>
            <div className="mb-4">
              <p className="font-bold">Maria Cecilia Vidal</p>
              <p className="text-sm">Martillera Pública Col. Nº1172</p>
              <p className="text-sm">Cel. +5491165517385</p>
              <p className="text-sm">cecilia@mcvpropiedades.com.ar</p>
            </div>
            <div className="mb-4">
              <p className="font-bold">Andrea Diaz - Equipo Costa Esmeralda</p>
              <p className="text-sm">Recepción: +5491123868006</p>
              <p className="text-sm">Reservas: +5491165517385</p>
              <p className="text-sm">andrea@mcvpropiedades.com.ar</p>
            </div>
            <div className="mb-4">
              <p className="font-bold">Marcela Cacace - Equipo GBA Sur</p>
              <p className="text-sm">Cel +5491154113729</p>
              <p className="text-sm">marcela@mcvpropiedades.com.ar</p>
            </div>
            <div>
              <p className="font-bold">Roxana Caputo - Equipo GBA Sur</p>
              <p className="text-sm">Cel +5491140395111</p>
              <p className="text-sm">roxana@mcvpropiedades.com.ar</p>
            </div>
          </div>

          {/* --- Columna 2: Mapa del Sitio --- */}
          <div className="w-full md:w-1/3 px-4 mb-8">
            <h5 className="text-lg font-bold text-white mb-4">Mapa del Sitio</h5>
            <ul className="space-y-2 text-sm">
              <li><a href="https://mcvpropiedades.com.ar/vidal/" className="hover:text-white">Inicio</a></li>
              <li><a href="https://mcvpropiedades.com.ar/vidal/category/gran-buenos-aires-sur/" className="hover:text-white">Gran Buenos Aires Sur</a></li>
              <li><a href="https://mcvpropiedades.com.ar/vidal/category/costa-esmeralda/" className="hover:text-white">Costa Esmeralda y Pinamar</a></li>
              <li><a href="/" className="hover:text-white">Buscador</a></li>
            </ul>
            <h5 className="text-lg font-bold text-white mt-6 mb-4">Nuestras Redes</h5>
            <ul className="space-y-2 text-sm">
              <li><a href="https://www.facebook.com/mcvvidalpropiedades/" target="_blank" rel="noopener noreferrer" className="hover:text-white">Facebook GBA Sur</a></li>
              <li><a href="https://www.instagram.com/mcvvidalpropiedades/" target="_blank" rel="noopener noreferrer" className="hover:text-white">Instagram GBA Sur</a></li>
              <li><a href="https://www.facebook.com/mcvcostaesmeralda/" target="_blank" rel="noopener noreferrer" className="hover:text-white">Facebook Costa Esmeralda</a></li>
              <li><a href="https://www.instagram.com/mcvcostaesmeralda/" target="_blank" rel="noopener noreferrer" className="hover:text-white">Instagram Costa Esmeralda</a></li>
              <li><a href="https://www.zonaprop.com.ar/inmobiliarias/mcv-vidal-propiedades_46039511-inmuebles.html" target="_blank" rel="noopener noreferrer" className="hover:text-white">ZonaProp</a></li>
            </ul>
          </div>

          {/* --- Columna 3: Recomendamos --- */}
          <div className="w-full md:w-1/3 px-4 mb-8">
            <h5 className="text-lg font-bold text-white mb-4">Recomendamos</h5>
            <p className="text-sm">(Contenido para definir)</p>
          </div>

        </div>

        {/* --- Copyright --- */}
        <div className="text-center border-t border-gray-700 pt-6 mt-8">
          <p className="text-sm">© 2025 MCV – Vidal Propiedades</p>
        </div>
      </div>
    </footer>
  );
}