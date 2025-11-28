/**
 * Lógica de negocio v15 (Mapeo Definitivo)
 * - Mapea los slugs cruzados de WP a los períodos reales de 2026.
 * - Incluye lógica para extraer precio de 'es_property_price_note' si el precio normal es 0 (GBA Sur).
 */

// --- MAPEO DE DISPONIBILIDAD (Corregido según los Slugs de WP) ---
const PERIOD_MAP = [
  // 1. Navidad (WP Slug: navidad)
  { key: 'periodo_navidad', name: 'Navidad', start: '2025-12-19', end: '2025-12-26' },
  
  // 2. Año Nuevo (WP Slug: ano-nuevo)
  { key: 'periodo_ano_nuevo', name: 'Año Nuevo', start: '2025-12-26', end: '2026-01-02' },
  
  // 3. Año Nuevo c/1ra Enero (WP Slug: enero-1ra-quincena)
  { key: 'periodo_combo_an_ene1', name: 'Año Nuevo con 1ra Enero', start: '2025-12-30', end: '2026-01-15' },
  
  // 4. Enero 1ra Quincena (WP Slug: enero-2da-quincena)
  { key: 'periodo_ene_1ra', name: 'Enero 1ra Quincena', start: '2026-01-02', end: '2026-01-15' },
  
  // 5. Enero 2da Quincena (WP Slug: febrero-1ra-quincena)
  { key: 'periodo_ene_2da', name: 'Enero 2da Quincena', start: '2026-01-16', end: '2026-01-31' },
  
  // 6. Febrero 1ra / Carnaval (WP Slug: febrero-2da-quincena)
  { key: 'periodo_feb_1ra', name: 'Febrero 1ra Quincena', start: '2026-02-01', end: '2026-02-17' },
  
  // 7. Febrero 2da (WP Slug: diciembre-2da-quincena)
  { key: 'periodo_feb_2da', name: 'Febrero 2da Quincena', start: '2026-02-18', end: '2026-03-01' },

  // 8. Diciembre 2da Quincena (No está en su mapeo de slugs, usamos el slug original para casos raros)
  { key: 'periodo_dic_2da', name: 'Diciembre 2da Quincena', start: '2025-12-15', end: '2025-12-31' },
];

function getDurationInDays(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
  return diffDays + 1;
}

// Función auxiliar para parsear el precio de las Notas (ej. para GBA Sur)
function parsePriceFromNote(note) {
    if (!note || typeof note !== 'string') return null;
    // Busca: (u$s O usd O $) + espacios opcionales + números con puntos/comas
    const priceRegex = /(?:u\$s|usd|\$|ARS|ar)\s*([\d\.,]+)/i;
    const match = note.match(priceRegex);
    if (match) {
        // Asumiendo que el separador de miles es '.' o ',' y lo ignoramos
        const cleanNumberStr = match[1].replace(/[\.,]/g, ''); 
        const priceInt = parseInt(cleanNumberStr, 10);
        if (!isNaN(priceInt) && priceInt > 0) {
            return priceInt;
        }
    }
    return null;
}

function parseStatusAndPrice(value) {
  if (!value || value.trim() === '') {
    return { status: 'Ocupado', price: null };
  }
  const lowerValue = value.toLowerCase();

  // 1. Chequeo de Ocupado
  if (
    lowerValue.includes('alquilada') || lowerValue.includes('alquilado') ||
    lowerValue.includes('reservada') || lowerValue.includes('reservado') ||
    lowerValue.includes('no disponible') || lowerValue.includes('no dispo')
  ) {
    if (!lowerValue.includes('disponible')) {
        return { status: 'Ocupado', price: null };
    }
  }

  // 2. Regex Precio (para periodos temporales)
  const priceRegex = /(?:u\$s|usd|\$)\s*([\d\.,]+)/i;
  const priceMatch = value.match(priceRegex);

  if (priceMatch) {
    const cleanNumberStr = priceMatch[1].replace(/[\.,]/g, ''); 
    const priceInt = parseInt(cleanNumberStr, 10);
    if (!isNaN(priceInt) && priceInt > 0) {
        return { status: 'Disponible', price: priceInt.toString() };
    }
  }

  // 3. Disponibilidad simple
  if (lowerValue.includes('disponible') || lowerValue.includes('libre')) {
     return { status: 'Disponible', price: null }; 
  }

  // 4. Número solo
  if (lowerValue.match(/^[\d\.,\s]+$/) && !lowerValue.includes('/')) {
      const cleanVal = lowerValue.replace(/[\.,]/g, '');
      return { status: 'Disponible', price: cleanVal.trim() };
  }

  return { status: 'Ocupado', price: null };
}

export function processFullSyncData(allProperties) {
  const propertiesToInsert = [];
  const periodsToInsert = [];
  const ACTIVE_STATUS_ID = 158;

  for (const prop of allProperties) {
    
    const isActive = prop.status_ids.length === 0 || prop.status_ids.includes(ACTIVE_STATUS_ID);
    if (!isActive) continue; 

    const aceptaMascotaBool = (prop.acepta_mascota || '').trim().toUpperCase() === 'SI';
    const piscinaDetalle = prop.piscina ? prop.piscina.trim() : null;
    const tienePiscinaBool = !!piscinaDetalle;
    
    let ventaPrice = null;
    let alquilerAnualPrice = parseInt(prop.price_ars, 10) || null;
    const rawPrice = parseInt(prop.price, 10) || null;
    
    // --- LÓGICA DE CONSOLIDACIÓN DE PRECIOS ---
    if (rawPrice) {
      if (rawPrice < 10000) {
        if (!alquilerAnualPrice) {
          alquilerAnualPrice = rawPrice;
        }
      } else {
        ventaPrice = rawPrice;
      }
    }
    
    // Si todavía no tenemos precio anual pero hay una nota de precio (GBA Sur)
    if (!alquilerAnualPrice && prop.price_note) {
        alquilerAnualPrice = parsePriceFromNote(prop.price_note);
    }
    // --- FIN LÓGICA DE CONSOLIDACIÓN ---

    const propertyRecord = {
      property_id: parseInt(prop.property_id, 10),
      slug: prop.property_slug,
      title: prop.property_title,
      url: prop.property_url,
      description: prop.description,
      thumbnail_url: prop.thumbnail_url,
      
      latitude: parseFloat(prop.latitude) || null,
      longitude: parseFloat(prop.longitude) || null,
      
      category_ids: prop.category_ids || [],
      type_ids: prop.type_ids || [],
      status_ids: prop.status_ids || [],
      zona: prop.zona || null,
      barrio: prop.barrio || null,
      pax: parseInt(prop.pax, 10) || null,
      acepta_mascota: aceptaMascotaBool,
      tiene_piscina: tienePiscinaBool,
      piscina_detalle: piscinaDetalle,
      price: ventaPrice,
      es_property_price_ars: alquilerAnualPrice, 
      bedrooms: parseInt(prop.bedrooms, 10) || null,
      bathrooms: parseInt(prop.bathrooms, 10) || null,
      mts_cubiertos: parseInt(prop.construido, 10) || null,
      mts_terreno: parseInt(prop.area, 10) || null,
    };

    propertiesToInsert.push(propertyRecord);

    const isTemporal = prop.category_ids.includes(196) || prop.category_ids.includes(197);
    
    if (isTemporal) {
      for (const period of PERIOD_MAP) {
        const rawValue = prop[period.key]; 
        const { status, price } = parseStatusAndPrice(rawValue);

        if (status === 'Disponible') {
          const duration = getDurationInDays(period.start, period.end);
          periodsToInsert.push({
            property_id: propertyRecord.property_id,
            period_name: period.name,
            start_date: period.start,
            end_date: period.end,
            status: status,
            price: price,
            duration_days: duration,
          });
        }
      }
    }
  }

  return { propertiesToInsert, periodsToInsert };
}