/**
 * Lógica de negocio v6 (Core Pro-Rata)
 * Parsea el JSON del "Puente PHP" (v8)
 * Filtra por "Activa" (ID 158)
 * Interpreta "disponible carnaval" como Disponible
 * Calcula y guarda 'duration_days' para cada período
 */

// --- MAPEO DE DISPONIBILIDAD (Corregido con sus fechas) ---
const PERIOD_MAP = [
  { key: 'periodo_navidad', name: 'Navidad', start: '2025-12-19', end: '2025-12-26' }, // 8 dias
  { key: 'periodo_ano_nuevo', name: 'Año Nuevo', start: '2025-12-26', end: '2026-01-02' }, // 8 dias
  { key: 'periodo_ene_1ra', name: 'Enero 1ra Quincena', start: '2026-01-02', end: '2026-01-15' }, // 14 dias
  { key: 'periodo_ene_2da', name: 'Enero 2da Quincena', start: '2026-01-16', end: '2026-01-31' }, // 16 dias
  { key: 'periodo_feb_1ra', name: 'Febrero 1ra Quincena', start: '2026-02-01', end: '2026-02-17' }, // 17 dias (Carnaval)
  { key: 'periodo_feb_2da', name: 'Febrero 2da Quincena', start: '2026-02-18', end: '2026-03-01' }, // 12 dias
  { key: 'periodo_dic_2da', name: 'Diciembre 2da Quincena', start: '2025-12-15', end: '2025-12-31' }, // 17 dias
];

// Función para calcular días (inclusive)
function getDurationInDays(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
  return diffDays + 1; // +1 para incluir el día de inicio y fin
}

function parseStatusAndPrice(value) {
  if (!value || value.trim() === '') {
    return { status: 'Ocupado', price: null };
  }
  const lowerValue = value.toLowerCase();

  if (
    lowerValue.includes('alquilada') ||
    lowerValue.includes('alquilado') ||
    lowerValue.includes('reservada') ||
    lowerValue.includes('reservado') ||
    lowerValue.includes('no disponible') ||
    lowerValue.includes('no dispo')
  ) {
    if (lowerValue.includes('disponible')) {
       return { status: 'Disponible', price: null }; 
    }
    return { status: 'Ocupado', price: null };
  }
  
  if (lowerValue.includes('$') || lowerValue.match(/\d/)) {
    return { status: 'Disponible', price: value.trim() };
  }
  
  if (lowerValue.includes('disponible')) {
    return { status: 'Disponible', price: null };
  }

  return { status: 'Ocupado', price: null };
}

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
    const priceInt = parseInt(prop.price, 10) || null;
    const priceArsInt = parseInt(prop.price_ars, 10) || null;

    const propertyRecord = {
      property_id: parseInt(prop.property_id, 10),
      slug: prop.property_slug,
      title: prop.property_title,
      url: prop.property_url,
      thumbnail_url: prop.thumbnail_url,
      category_ids: prop.category_ids || [],
      type_ids: prop.type_ids || [],
      status_ids: prop.status_ids || [],
      zona: prop.zona || null,
      barrio: prop.barrio || null, // ¡Ahora con datos!
      pax: parseInt(prop.pax, 10) || null,
      acepta_mascota: aceptaMascotaBool,
      tiene_piscina: tienePiscinaBool,
      piscina_detalle: piscinaDetalle,
      price: priceInt,
      es_property_price_ars: priceArsInt,
      bedrooms: parseInt(prop.bedrooms, 10) || null,
      bathrooms: parseInt(prop.bathrooms, 10) || null,
      mts_cubiertos: parseInt(prop.construido, 10) || null,
      mts_terreno: parseInt(prop.area, 10) || null,
    };

    propertiesToInsert.push(propertyRecord);

    // --- 2. Traducir datos de 'periods' ---
    const isTemporal = prop.category_ids.includes(196) || prop.category_ids.includes(197);
    
    if (isTemporal) {
      for (const period of PERIOD_MAP) {
        const rawValue = prop[period.key]; 
        const { status, price } = parseStatusAndPrice(rawValue);

        if (status === 'Disponible') {
          // ¡NUEVO! Calcular duración
          const duration = getDurationInDays(period.start, period.end);
          
          periodsToInsert.push({
            property_id: propertyRecord.property_id,
            period_name: period.name,
            start_date: period.start,
            end_date: period.end,
            status: status,
            price: price, 
            duration_days: duration, // ¡Guardamos la duración!
          });
        }
      }
    }
  }

  return { propertiesToInsert, periodsToInsert };
}