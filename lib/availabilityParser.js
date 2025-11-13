/**
 * Lógica de negocio v10 (Nombres de Período)
 * Parsea el JSON del "Puente PHP" (v9)
 * ¡NUEVO! Simplifica los period_name para el dropdown
 */

// --- MAPEO DE DISPONIBILIDAD (¡NOMBRES SIMPLIFICADOS!) ---
const PERIOD_MAP = [
  { key: 'periodo_navidad', name: 'Navidad', start: '2025-12-19', end: '2025-12-26' },
  { key: 'periodo_ano_nuevo', name: 'Año Nuevo', start: '2025-12-26', end: '2026-01-02' },
  { key: 'periodo_ene_1ra', name: 'Enero 1ra Quincena', start: '2026-01-02', end: '2026-01-15' },
  { key: 'periodo_ene_2da', name: 'Enero 2da Quincena', start: '2026-01-16', end: '2026-01-31' },
  { key: 'periodo_feb_1ra', name: 'Febrero 1ra Quincena', start: '2026-02-01', end: '2026-02-17' },
  { key: 'periodo_feb_2da', name: 'Febrero 2da Quincena', start: '2026-02-18', end: '2026-03-01' },
  { key: 'periodo_dic_2da', name: 'Diciembre 2da Quincena', start: '2025-12-15', end: '2025-12-31' },
];

// Función para calcular días (inclusive)
function getDurationInDays(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
  return diffDays + 1;
}

// Función de Parseo de Precio (v7)
function parseStatusAndPrice(value) {
  if (!value || value.trim() === '') {
    return { status: 'Ocupado', price: null };
  }
  const lowerValue = value.toLowerCase();
  if (lowerValue.includes('$') && lowerValue.match(/\d/)) {
     return { status: 'Disponible', price: value.trim() };
  }
  if (lowerValue.includes('disponible')) {
     return { status: 'Disponible', price: null }; 
  }
  if (
    lowerValue.includes('alquilada') || lowerValue.includes('alquilado') ||
    lowerValue.includes('reservada') || lowerValue.includes('reservado') ||
    lowerValue.includes('no disponible') || lowerValue.includes('no dispo')
  ) {
    return { status: 'Ocupado', price: null };
  }
  if (lowerValue.match(/^[\d\.,\s]+$/) && !lowerValue.includes('/')) {
     return { status: 'Disponible', price: value.trim() };
  }
  return { status: 'Ocupado', price: null };
}
// --- Fin del código copiado ---

export function processFullSyncData(allProperties) {
  const propertiesToInsert = [];
  const periodsToInsert = [];
  const ACTIVE_STATUS_ID = 158;

  for (const prop of allProperties) {
    
    const isActive = prop.status_ids.length === 0 || prop.status_ids.includes(ACTIVE_STATUS_ID);
    if (!isActive) {
      continue; 
    }

    const aceptaMascotaBool = (prop.acepta_mascota || '').trim().toUpperCase() === 'SI';
    const piscinaDetalle = prop.piscina ? prop.piscina.trim() : null;
    const tienePiscinaBool = !!piscinaDetalle;
    
    let ventaPrice = null;
    let alquilerAnualPrice = parseInt(prop.price_ars, 10) || null;
    const rawPrice = parseInt(prop.price, 10) || null;
    if (rawPrice) {
      if (rawPrice < 10000) {
        if (!alquilerAnualPrice) {
          alquilerAnualPrice = rawPrice;
        }
      } else {
        ventaPrice = rawPrice;
      }
    }

    const propertyRecord = {
      property_id: parseInt(prop.property_id, 10),
      slug: prop.property_slug,
      title: prop.property_title,
      url: prop.property_url,
      description: prop.description,
      thumbnail_url: prop.thumbnail_url,
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
            period_name: period.name, // ¡NUEVO! Nombre simple (ej. "Navidad")
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