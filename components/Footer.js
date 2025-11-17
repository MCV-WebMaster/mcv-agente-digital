import { FaFacebook, FaInstagram, FaGlobe, FaCheckCircle } from 'react-icons/fa';

// Helper para links de WhatsApp
const WHATSAPP_BASE_URL = "https://wa.me/";
const formatPhone = (phone) => {
  return phone.replace(/[^0-9]/g, ''); 
}
const WhatsappLink = ({ phone, children }) => {
  return (
    <a 
      href={`${WHATSAPP_BASE_URL}${formatPhone(phone)}`} 
      target="_blank" 
      rel="noopener noreferrer"
      className="text-sm block hover:text-white transition-colors"
    >
      {children}
    </a>
  );
};

export default function Footer() {
  return (
    <footer className="bg-gray-800 text-gray-300 pt-16 pb-8 mt-16">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex flex-wrap -mx-4">

          {/* --- Columna 1: Nosotras (50%) --- */}
          <div className="w-full md:w-1/2 px-4 mb-8">
            <h5 className="text-lg font-bold text-white mb-4">Nosotras</h5>
            <div className="mb-4">
              <p className="font-bold">Maria Cecilia Vidal</p>
              <div className="flex items-center gap-2 mb-1">
                <a 
                  href="https://colegiodemartillerosquilmes.com.ar/user/vidal+maria+cecilia/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-sm hover:text-white transition-colors underline"
                >
                  Martillera Pública Col. Nº1172
                </a>
                <FaCheckCircle className="text-green-500 text-sm" title="Verificado" />
              </div>
              <WhatsappLink phone="+5491165517385">Cel. +5491165517385</WhatsappLink>
              <a href="mailto:cecilia@mcvpropiedades.com.ar" className="text-sm block hover:text-white transition-colors">cecilia@mcvpropiedades.com.ar</a>
            </div>
            <div className="mb-4">
              <p className="font-bold">Andrea Diaz - Equipo Costa Esmeralda</p>
              <WhatsappLink phone="+5491123868006">Recepción: +5491123868006</WhatsappLink>
              <WhatsappLink phone="+5491165517385">Reservas: +5491165517385</WhatsappLink>
              <a href="mailto:andrea@mcvpropiedades.com.ar" className="text-sm block hover:text-white transition-colors">andrea@mcvpropiedades.com.ar</a>
            </div>
            <div className="mb-4">
              <p className="font-bold">Marcela Cacace - Equipo GBA Sur</p>
              <WhatsappLink phone="+5491154113729">Cel +5491154113729</WhatsappLink>
              <a href="mailto:marcela@mcvpropiedades.com.ar" className="text-sm block hover:text-white transition-colors">marcela@mcvpropiedades.com.ar</a>
            </div>
            <div>
              <p className="font-bold">Roxana Caputo - Equipo GBA Sur</p>
              <WhatsappLink phone="+5491140395111">Cel +5491140395111</WhatsappLink>
              <a href="mailto:roxana@mcvpropiedades.com.ar" className="text-sm block hover:text-white transition-colors">roxana@mcvpropiedades.com.ar</a>
            </div>
          </div>

          {/* --- Columna 2: Mapa del Sitio (50%) --- */}
          <div className="w-full md:w-1/2 px-4 mb-8">
            <h5 className="text-lg font-bold text-white mb-4">Mapa del Sitio</h5>
            <ul className="space-y-2 text-sm">
              <li><a href="https://mcvpropiedades.com.ar/vidal/" className="hover:text-white transition-colors">Inicio</a></li>
              <li><a href="https://mcvpropiedades.com.ar/vidal/category/gran-buenos-aires-sur/" className="hover:text-white transition-colors">Gran Buenos Aires Sur</a></li>
              <li><a href="https://mcvpropiedades.com.ar/vidal/category/costa-esmeralda/" className="hover:text-white transition-colors">Costa Esmeralda y Pinamar</a></li>
              <li><a href="/" className="hover:text-white transition-colors">Asistente Digital</a></li>
              <li><a href="https://mcvpropiedades.com.ar/vidal/intranet/" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Intranet</a></li>
            </ul>
            <h5 className="text-lg font-bold text-white mt-6 mb-4">Nuestras Redes</h5>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="https://www.facebook.com/people/MCV-Propiedaes-GBA-Sur/100047579690305/" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors flex items-center gap-2">
                  <FaFacebook /> Facebook GBA Sur
                </a>
              </li>
              <li>
                <a href="https://www.instagram.com/mcv_vidal_propiedades/" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors flex items-center gap-2">
                  <FaInstagram /> Instagram GBA Sur
                </a>
              </li>
              <li>
                <a href="https://www.facebook.com/people/MCV-Costa-Esmeralda-y-Pinamar/100063525162748/" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors flex items-center gap-2">
                  <FaFacebook /> Facebook Costa Esmeralda
                </a>
              </li>
              <li>
                <a href="https://www.instagram.com/mcv_costa_esmeralda/" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors flex items-center gap-2">
                  <FaInstagram /> Instagram Costa Esmeralda
                </a>
              </li>
              <li>
                <a href="https://www.zonaprop.com.ar/inmobiliarias/maria-cecilia-vidal_30479281-inmuebles.html" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors flex items-center gap-2">
                  <FaGlobe /> ZonaProp
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* --- Copyright --- */}
        <div className="text-center border-t border-gray-700 pt-8 mt-8">
          <p className="text-sm">© 2025 MCV – Vidal Propiedades</p>
        </div>
      </div>
    </footer>
  );
}