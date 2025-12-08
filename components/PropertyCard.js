import React from 'react';
import { FaBed, FaBath, FaRulerCombined, FaMapMarkerAlt, FaWhatsapp } from 'react-icons/fa';

export default function PropertyCard({ property, onContact }) {
  
  // 1. RECUPERACIÓN DE IMAGEN (Prioridad a thumbnail del JSON)
  const imageUrl = property.thumbnail || property.thumbnail_url || '/images/placeholder-house.jpg';
  
  // 2. FORMATEO DE PRECIO ROBUSTO
  const formatPrice = (price) => {
    if (!price || price === 0) return 'Consultar';
    return price.toLocaleString('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  };

  // Usamos el precio del periodo si existe, sino el precio general
  const displayPrice = property.final_display_price 
    ? formatPrice(property.final_display_price) 
    : formatPrice(property.price);

  const displayPeriodName = property.found_period_name || '';

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-shadow duration-300 border border-gray-200 flex flex-col h-full group">
      
      {/* SECCIÓN DE IMAGEN */}
      <div className="relative h-64 w-full bg-gray-200 overflow-hidden">
        <img 
          src={imageUrl} 
          alt={property.title} 
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={(e) => { e.target.onerror = null; e.target.src = 'https://via.placeholder.com/400x300?text=MCV+Propiedades'; }}
        />
        
        {/* Badge de Operación */}
        <div className="absolute top-3 right-3 bg-mcv-azul text-white px-3 py-1 rounded-full font-bold text-xs uppercase shadow-md tracking-wider">
          {property.operacion || 'Propiedad'}
        </div>

        {/* Badge de Periodo (Solo si se filtró por fecha) */}
        {displayPeriodName && (
           <div className="absolute bottom-3 left-3 bg-green-600 text-white px-3 py-1 rounded-md text-xs font-bold shadow-lg flex items-center gap-1">
             📅 {displayPeriodName}
           </div>
        )}
      </div>

      {/* SECCIÓN DE CONTENIDO */}
      <div className="p-5 flex flex-col flex-grow">
        
        {/* Ubicación */}
        <div className="flex items-center text-gray-500 text-xs font-bold uppercase tracking-wide mb-2">
          <FaMapMarkerAlt className="mr-1 text-mcv-celeste" />
          {property.zona} <span className="mx-1">•</span> {property.barrio}
        </div>

        {/* Título */}
        <h3 className="text-lg font-bold text-gray-900 mb-3 line-clamp-2 leading-snug min-h-[3rem]">
          <a href={property.url} target="_blank" rel="noopener noreferrer" className="hover:text-mcv-azul transition-colors">
            {property.title}
          </a>
        </h3>

        {/* Precio */}
        <div className="text-2xl font-extrabold text-blue-700 mb-4">
          {displayPrice}
        </div>

        {/* Iconos de características */}
        <div className="flex justify-between items-center text-sm text-gray-600 border-t border-gray-100 pt-4 mt-auto">
            <div className="flex gap-4">
                {property.bedrooms > 0 && (
                    <div className="flex items-center gap-1" title="Dormitorios">
                        <FaBed className="text-gray-400" /> 
                        <span className="font-semibold">{property.bedrooms}</span>
                    </div>
                )}
                {property.bathrooms > 0 && (
                    <div className="flex items-center gap-1" title="Baños">
                        <FaBath className="text-gray-400" /> 
                        <span className="font-semibold">{property.bathrooms}</span>
                    </div>
                )}
                {property.mts_cubiertos > 0 && (
                    <div className="flex items-center gap-1" title="Metros Cubiertos">
                        <FaRulerCombined className="text-gray-400" /> 
                        <span className="font-semibold">{property.mts_cubiertos}m²</span>
                    </div>
                )}
            </div>
        </div>

        {/* Botones de Acción */}
        <div className="grid grid-cols-2 gap-3 mt-5">
           <a 
             href={property.url} 
             target="_blank" 
             rel="noopener noreferrer"
             className="flex items-center justify-center w-full py-2.5 border-2 border-gray-200 text-gray-700 font-bold rounded-lg hover:border-mcv-azul hover:text-mcv-azul transition-colors text-sm"
           >
             Ver Ficha
           </a>
           <button 
             onClick={() => onContact(property)}
             className="flex items-center justify-center w-full py-2.5 bg-green-500 text-white font-bold rounded-lg hover:bg-green-600 transition-colors shadow-sm text-sm"
           >
             <FaWhatsapp className="mr-2 text-lg" /> Consultar
           </button>
        </div>
      </div>
    </div>
  );
}