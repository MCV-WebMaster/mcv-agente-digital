// components/PropertyCard.js
import React from 'react';
import { FaBed, FaBath, FaRulerCombined, FaMapMarkerAlt, FaCamera, FaWhatsapp } from 'react-icons/fa';

export default function PropertyCard({ property, onContact }) {
  // 1. LÓGICA DE IMAGEN A PRUEBA DE FALLOS
  // El JSON muestra 'thumbnail', pero por las dudas chequeamos ambos.
  const imageUrl = property.thumbnail || property.thumbnail_url || '/images/placeholder-house.jpg';
  
  // Formateo de precio seguro
  const formatPrice = (price) => {
    if (!price) return 'Consultar';
    return price.toLocaleString('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  };

  // Detectar si hay precio de periodo específico encontrado por el buscador
  const displayPrice = property.found_period_price 
    ? formatPrice(property.found_period_price) 
    : formatPrice(property.price);

  const displayPeriodName = property.found_period_name || '';

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-shadow duration-300 border border-gray-200 flex flex-col h-full">
      {/* IMAGEN */}
      <div className="relative h-64 w-full bg-gray-200">
        <img 
          src={imageUrl} 
          alt={property.title} 
          className="w-full h-full object-cover"
          onError={(e) => { e.target.onerror = null; e.target.src = 'https://via.placeholder.com/400x300?text=No+Imagen'; }}
        />
        <div className="absolute top-0 right-0 bg-mcv-azul text-white px-3 py-1 m-2 rounded-md font-bold text-sm">
          {property.operacion || 'Venta / Alquiler'}
        </div>
        {displayPeriodName && (
           <div className="absolute bottom-0 left-0 bg-green-600 text-white px-2 py-1 m-2 rounded text-xs font-bold shadow">
             🗓 {displayPeriodName}
           </div>
        )}
      </div>

      {/* CONTENIDO */}
      <div className="p-4 flex flex-col flex-grow">
        <div className="flex items-center text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2">
          <FaMapMarkerAlt className="mr-1" />
          {property.zona} &bull; {property.barrio}
        </div>

        <h3 className="text-lg font-bold text-gray-900 mb-2 line-clamp-2 leading-tight">
          <a href={property.url} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600">
            {property.title}
          </a>
        </h3>

        {/* PRECIO */}
        <div className="text-2xl font-bold text-blue-700 mb-4">
          {displayPrice}
        </div>

        {/* CARACTERÍSTICAS */}
        <div className="flex justify-between items-center text-sm text-gray-600 border-t border-gray-100 pt-4 mt-auto">
            <div className="flex gap-4">
                {property.bedrooms > 0 && (
                    <span className="flex items-center" title="Dormitorios">
                        <FaBed className="mr-1" /> {property.bedrooms}
                    </span>
                )}
                {property.bathrooms > 0 && (
                    <span className="flex items-center" title="Baños">
                        <FaBath className="mr-1" /> {property.bathrooms}
                    </span>
                )}
                {property.mts_cubiertos > 0 && (
                    <span className="flex items-center" title="Metros Cubiertos">
                        <FaRulerCombined className="mr-1" /> {property.mts_cubiertos}m²
                    </span>
                )}
            </div>
        </div>

        {/* BOTONES */}
        <div className="grid grid-cols-2 gap-2 mt-4">
           <a 
             href={property.url} 
             target="_blank" 
             rel="noopener noreferrer"
             className="flex items-center justify-center w-full py-2 border border-blue-600 text-blue-600 font-bold rounded hover:bg-blue-50 transition"
           >
             Ver Ficha
           </a>
           <button 
             onClick={() => onContact(property)}
             className="flex items-center justify-center w-full py-2 bg-green-500 text-white font-bold rounded hover:bg-green-600 transition"
           >
             <FaWhatsapp className="mr-2" /> Consultar
           </button>
        </div>
      </div>
    </div>
  );
}