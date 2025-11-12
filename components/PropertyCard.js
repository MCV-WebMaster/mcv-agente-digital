import Link from 'next/link';

// Helper para formatear el precio
function formatPrice(price) {
  if (!price) return null;
  // Asumimos que todos los precios de temporada son en USD
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

export default function PropertyCard({ property }) {
  const {
    property_slug,
    property_title,
    property_url,
    pax,
    accepts_pets,
    has_pool,
    barrio_costa,
    min_price, // ¡NUEVO DATO!
  } = property;

  return (
    <div className="border border-mcv-gris rounded-lg overflow-hidden shadow-lg bg-gray-800 transition-transform duration-300 hover:scale-[1.02] flex flex-col justify-between">
      
      <div className="p-4">
        <h3 className="text-xl font-bold text-mcv-azul mb-2 h-20">
          <a
            href={property_url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            {property_title}
          </a>
        </h3>
        
        <p className="text-sm text-gray-400 mb-4">{barrio_costa || 'Sin barrio'}</p>

        <div className="flex flex-wrap gap-2 text-sm">
          {pax && (
            <span className="bg-mcv-gris text-white px-2 py-1 rounded-full">
              {pax} Pax
            </span>
          )}
          {accepts_pets && (
            <span className="bg-mcv-verde text-white px-2 py-1 rounded-full">
              Mascotas
            </span>
          )}
          {has_pool && (
            <span className="bg-mcv-azul text-white px-2 py-1 rounded-full">
              Pileta
            </span>
          )}
        </div>
      </div>
      
      {/* --- SECCIÓN DE PRECIO (NUEVA) --- */}
      <div className="p-4 bg-gray-700">
        {min_price ? (
          <>
            <span className="text-xs text-gray-400">Desde</span>
            <p className="text-2xl font-bold text-mcv-azul">
              {formatPrice(min_price)}
            </p>
          </>
        ) : (
          <p className="text-lg font-bold text-gray-400">Consultar</p>
        )}
      </div>
    </div>
  );
}