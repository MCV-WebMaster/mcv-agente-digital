import Link from 'next/link';

// Helper para formatear precio (USD o ARS)
function formatPrice(value, currency = 'USD') {
  if (!value || isNaN(Number(value))) {
    return null;
  }
  const priceNum = Number(value);

  return new Intl.NumberFormat(currency === 'ARS' ? 'es-AR' : 'en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(priceNum);
}

// Helper para calcular días
function getDaysBetween(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 inclusive
}

// Fechas de la Temporada 2026
const SEASON_START_DATE = '2025-12-19';
const SEASON_END_DATE = '2026-03-01';

export default function PropertyCard({ property, filters }) {
  const {
    slug, title, url, thumbnail_url,
    price, es_property_price_ars, min_rental_price,
    found_period_price, found_period_duration, 
    pax, acepta_mascota, tiene_piscina, piscina_detalle,
    barrio, zona, bedrooms, mts_cubiertos
  } = property;

  const imageUrl = thumbnail_url && thumbnail_url.endsWith('.pdf') 
    ? "/logo_mcv_rectangular.png"
    : thumbnail_url;

  // --- Lógica de Precios ---
  const ventaPrice = formatPrice(price, 'USD');
  const alquilerAnualPrice = formatPrice(es_property_price_ars, 'ARS');
  let alquilerTempDisplay;
  let leyendaFecha = null;

  const isTemporal = property.category_ids.includes(197) || property.category_ids.includes(196);
  
  if (isTemporal) {
    const userSelectedDates = filters.startDate && filters.endDate;
    const userSelectedPeriod = filters.selectedPeriod;
    const isOffSeason = userSelectedDates && (filters.endDate < SEASON_START_DATE || filters.startDate > SEASON_END_DATE);

    if (userSelectedPeriod) {
        // 1. Usuario seleccionó un PERÍODO 2026
        alquilerTempDisplay = found_period_price ? (
          <div>
            <h4 className="text-xl font-bold text-mcv-verde">{formatPrice(found_period_price, 'USD')}</h4>
            <p className="text-xs text-gray-500">{filters.selectedPeriod}</p>
          </div>
        ) : (
          // Si la API lo devolvió pero no tiene precio (ej. solo disponible)
          <div>
            <h4 className="text-lg font-bold text-mcv-verde">Consultar</h4>
            <p className="text-xs text-gray-500">{filters.selectedPeriod}</p>
          </div>
        );
    } else if (userSelectedDates && isOffSeason) {
      // 2. Usuario seleccionó "OTRAS FECHAS" (Fuera de temporada)
      alquilerTempDisplay = (
        <div>
          <h4 className="text-lg font-bold text-mcv-verde">Consultar</h4>
          <p className="text-xs text-gray-500">Disponibilidad</p> 
        </div>
      );
    } else if (userSelectedDates && !isOffSeason) {
      // 3. Usuario seleccionó "OTRAS FECHAS" (DENTRO de temporada)
      alquilerTempDisplay = found_period_price ? (
        <div>
          <h4 className="text-xl font-bold text-mcv-verde">{formatPrice(found_period_price, 'USD')}</h4>
          <p className="text-xs text-gray-500">Valor Período</p>
        </div>
      ) : (
         <div>
            <h4 className="text-lg font-bold text-mcv-verde">Consultar</h4>
            <p className="text-xs text-gray-500">Disponibilidad</p>
        </div>
      );
      
      if (found_period_price) {
        const userDuration = getDaysBetween(filters.startDate, filters.endDate);
        if (userDuration < found_period_duration) {
          leyendaFecha = "Preguntar por disponibilidad de fecha";
        }
      }
      
    } else {
      // 4. SIN FECHAS (Default View)
      alquilerTempDisplay = min_rental_price ? (
        <div>
          <h4 className="text-xl font-bold text-mcv-verde">{formatPrice(min_rental_price, 'USD')}</h4>
          <p className="text-xs text-gray-500">Alquiler desde</p>
        </div>
      ) : (
        <div>
            <h4 className="text-lg font-bold text-mcv-verde">Consultar</h4>
            <p className="text-xs text-gray-500">Disponibilidad</p>
        </div>
      );
    }
  }
  
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden shadow-lg bg-white transition-transform duration-300 hover:shadow-xl flex flex-col justify-between">
      
      <a href={url} target="_blank" rel="noopener noreferrer" className="block">
        <img 
          src={imageUrl || '/logo_mcv_rectangular.png'}
          alt={title} 
          className="w-full h-48 object-cover bg-gray-100"
          onError={(e) => { e.target.onerror = null; e.target.src='/logo_mcv_rectangular.png'; }}
        />
      </a>

      <div className="p-4 flex-grow">
        
        {/* --- BLOQUE DE PRECIOS (2 Columnas) --- */}
        <div className="flex justify-between items-start mb-2 min-h-[50px]">
          <div className="flex-1 pr-2">
            {(ventaPrice || alquilerAnualPrice) ? (
              <>
                {ventaPrice && (
                  <div>
                    <h4 className="text-xl font-bold text-mcv-verde">{ventaPrice}</h4>
                    <p className="text-xs text-gray-500">Venta</p>
                  </div>
                )}
                {alquilerAnualPrice && (
                  <div>
                    <h4 className="text-xl font-bold text-mcv-verde">{alquilerAnualPrice}</h4>
                    <p className="text-xs text-gray-500">Alquiler Anual</p>
                  </div>
                )}
              </>
            ) : (
              !isTemporal && <div className="min-h-[40px]"></div>
            )}
          </div>
          
          {isTemporal && (
            <div className="flex-1 pl-2 border-l border-gray-200">
              {alquilerTempDisplay}
            </div>
          )}
        </div>
        
        {/* --- Leyenda de Disponibilidad --- */}
        {leyendaFecha && (
            <p className="text-xs text-red-600 font-bold mb-2">
                {leyendaFecha}
            </p>
        )}
        
        <h3 className="text-lg font-bold text-mcv-azul mb-2 h-14 overflow-hidden">
          <a href={url} target="_blank" rel="noopener noreferrer" className="hover:underline">
            {title}
          </a>
        </h3>
        
        <p className="text-sm text-mcv-gris mb-4">{barrio || zona || 'Ubicación no especificada'}</p>

        <div className="flex flex-wrap gap-2 text-sm">
          {bedrooms ? (
            <span className="bg-gray-200 text-mcv-gris px-2 py-1 rounded-full">
              {bedrooms} Dorm.
            </span>
          ) : null}
          {mts_cubiertos ? (
             <span className="bg-gray-200 text-mcv-gris px-2 py-1 rounded-full">
              {mts_cubiertos} mts²
            </span>
          ) : null}
          {pax ? (
            <span className="bg-gray-200 text-mcv-gris px-2 py-1 rounded-full">
              {pax} Pax
            </span>
          ) : null}
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