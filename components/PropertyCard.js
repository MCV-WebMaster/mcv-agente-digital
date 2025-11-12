import Link from 'next/link';

// Helper para formatear el precio
function formatPrice(price) {
  if (!price || isNaN(Number(price))) {
    return null;
  }
  
  const priceNum = Number(price);
  
  // Asumimos que si el precio es menor a 10,000 es Alquiler (ej. 4500 USD)
  // y si es mayor, es Venta (ej. 390000 USD).
  const currency = 'USD'; // Asumimos USD para todo
  
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(priceNum);
}

export default function PropertyCard({ property }) {
  const {
    slug,
    title,
    url,
    thumbnail_url,
    price, // ¡NUEVO!
    pax,
    acepta_mascota,
    tiene_piscina,
    piscina_detalle,
    barrio,
    zona,
    bedrooms,
    bathrooms,
    mts_cubiertos,
  } = property;

  const imageUrl = thumbnail_url && thumbnail_url.endsWith('.pdf') 
    ? "/logo_mcv_rectangular.png"
    : thumbnail_url;

  const formattedPrice = formatPrice(price);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden shadow-lg bg-white transition-transform duration-300 hover:shadow-xl flex flex-col justify-between">
      
      {/* --- IMAGEN --- */}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        <img 
          src={imageUrl || '/logo_mcv_rectangular.png'}
          alt={title} 
          className="w-full h-48 object-cover bg-gray-100"
          onError={(e) => { e.target.onerror = null; e.target.src='/logo_mcv_rectangular.png'; }}
        />
      </a>

      {/* --- CUERPO DE LA TARJETA --- */}
      <div className="p-4 flex-grow">
        
        {/* --- PRECIO (¡NUEVO!) --- */}
        {formattedPrice && (
          <h4 className="text-xl font-bold text-mcv-verde mb-2">
            {formattedPrice}
          </h4>
        )}
        
        <h3 className="text-lg font-bold text-mcv-azul mb-2 h-14 overflow-hidden">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            {title}
          </a>
        </h3>
        
        {/* Usamos barrio o zona como fallback */}
        <p className="text-sm text-mcv-gris mb-4">{barrio || zona || 'Ubicación no especificada'}</p>

        <div className="flex flex-wrap gap-2 text-sm">
          {bedrooms && (
            <span className="bg-gray-200 text-mcv-gris px-2 py-1 rounded-full">
              {bedrooms} Dorm.
            </span>
          )}
          {mts_cubiertos && (
             <span className="bg-gray-200 text-mcv-gris px-2 py-1 rounded-full">
              {mts_cubiertos} mts²
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
            href={url}
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