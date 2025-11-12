import Link from 'next/link';

export default function PropertyCard({ property }) {
  // Extraemos los datos de la propiedad
  const {
    property_slug,
    property_title,
    property_url,
    pax,
    accepts_pets,
    has_pool,
    barrio_costa,
  } = property;

  return (
    <div className="border border-mcv-gris rounded-lg overflow-hidden shadow-lg bg-gray-800 transition-transform duration-300 hover:scale-[1.02]">
      {/* (Opcional) Aquí se podría poner una imagen si la tuviéramos */}
      {/* <img src={property.imageUrl} alt={property_title} className="w-full h-48 object-cover" /> */}
      
      <div className="p-4">
        <h3 className="text-xl font-bold text-mcv-azul mb-2">
          {/* Hacemos que el título sea un link a la propiedad en el sitio de WordPress */}
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
          {/* ¡IMPORTANTE! El campo 'has_pool' siempre es 'false' en sus datos actuales.
            Cuando sus agentes lo actualicen en WordPress, aparecerá aquí.
            Puede forzarlo a 'true' para probar cómo se ve.
          */}
          {has_pool && (
            <span className="bg-mcv-azul text-white px-2 py-1 rounded-full">
              Pileta
            </span>
          )}
        </div>
      </div>
    </div>
  );
}