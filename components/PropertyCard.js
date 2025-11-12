import Link from 'next/link';

// Helper para formatear el precio (si lo tenemos)
function formatPrice(price) {
  if (!price) return null;
  // Extraer solo números
  const priceNum = parseInt(price.replace(/[^0-9]/g, ''), 10);
  if (isNaN(priceNum)) return null;

  // Asumimos USD para precios de temporada
  const currency = price.includes('U$S') || price.includes('$') ? 'USD' : 'ARS';
  
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(priceNum);
}

export default function PropertyCard({ property }) {
  const {
    property_slug,
    property_title,
    property_url,
    thumbnail_url, // ¡NUEVO!
    pax,
    acepta_mascota,
    tiene_piscina,
    piscina_detalle, // ¡NUEVO!
    barrio,
    bedrooms,
    bathrooms,
    // min_price (lo calcularemos después si es necesario)
  } = property;

  // Si la imagen es un PDF (para lotes), mostramos un placeholder
  const imageUrl = thumbnail_url && thumbnail_url.endsWith('.pdf') 
    ? "/logo_mcv_rectangular.png" // Usa el logo como placeholder
    : thumbnail_url; // Usa la imagen real

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden shadow-lg bg-white transition-transform duration-300 hover:shadow-xl flex flex-col justify-between">
      
      {/* --- IMAGEN --- */}
      <a
        href={property_url}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        <img 
          src={imageUrl || '/logo_mcv_rectangular.png'} // Fallback al logo si no hay imagen
          alt={property_title} 
          className="w-full h-48 object-cover bg-gray-100"
          onError={(e) => { e.target.onerror = null; e.target.src='/logo_mcv_rectangular.png'; }} // Fallback si la imagen está rota
        />
      </a>

      {/* --- CUERPO DE LA TARJETA --- */}
      <div className="p-4 flex-grow">
        <h3 className="text-lg font-bold text-mcv-azul mb-2 h-16">
          <a
            href={property_url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            {property_title}
          </a>
        </h3>
        
        <p className="text-sm text-mcv-gris mb-4">{barrio || 'Sin barrio'}</p>

        <div className="flex flex-wrap gap-2 text-sm">
          {bedrooms && (
            <span className="bg-gray-200 text-mcv-gris px-2 py-1 rounded-full">
              {bedrooms} Dorm.
            </span>
          )}
          {bathrooms && (
            <span className="bg-gray-200 text-mcv-gris px-2 py-1 rounded-full">
              {bathrooms} Baños
            </span>
          )}
          {pax && (
            <span className="bg-gray-200 text-mcv-gris px-2 py-1 rounded-full">
              {pax} Pax
            </span>
          )}
          {acepta_mascota && (
            <span className="bg-mcv-verde text-white px-2 py-1 rounded-full">
              Mascotas
            </span>
          )}
          {/* ¡CORREGIDO! Ahora 'tiene_piscina' es un booleano basado en el texto */}
          {tiene_piscina && (
            <span className="bg-mcv-azul text-white px-2 py-1 rounded-full">
              {piscina_detalle || 'Pileta'}
            </span>
          )}
        </div>
      </div>
      
      {/* --- PIE DE TARJETA (Link) --- */}
      <div className="p-4 bg-gray-50 border-t border-gray-200">
         <a
            href={property_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-mcv-azul font-bold hover:underline"
          >
            Ver más detalles &rarr;
          </a>
      </div>
    </div>
  );
}