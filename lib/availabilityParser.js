/**
 * Lógica de negocio v3 (COMPLETA)
 * Parsea el JSON del "Puente PHP" (v5) y lo divide para las tablas 'properties' y 'periods'.
 * Basado en el mapeo de datos de Estatik (IDs de Categoría, meta_keys, etc.).
 */

// --- MAPEO DE DISPONIBILIDAD ---
// (Basado en Tarea 2.25 y 4.3)
const PERIOD_MAP = [
  { key: 'periodo_navidad', name: 'Navidad', start: '2025-12-19', end: '2025-12-26' },
  { key: 'periodo_ano_nuevo', name: 'Año Nuevo', start: '2025-12-26', end: '2026-01-02' },
  { key: 'periodo_ene_1ra', name: 'Enero 1ra Quincena', start: '2026-01-02', end: '2026-01-15' },
  { key: 'periodo_ene_2da', name: 'Enero 2da Quincena', start: '2026-01-16', end: '2026-01-31' },
  { key: 'periodo_feb_1ra', name: 'Febrero 1ra Quincena', start: '2026-02-01', end: '2026-02-15' },
  { key: 'periodo_feb_2da', name: 'Febrero 2da Quincena', start: '2026-02-18', end: '2026-03-01' },
  { key: 'periodo_dic_2da', name: 'Diciembre 2da Quincena', start: '2025-12-15', end: '2025-12-31' },
  // (Añadí los prefijos 'periodo_' que pusimos en el Puente PHP)
];

/**
 * Interpreta el valor de un campo de disponibilidad.
 * @param {string | null} value - El valor del campo (ej. "Alquilada" o "$5.700")
 * @returns {{ status: 'Disponible' | 'Ocupado', price: string | null }}
 */
function parseStatusAndPrice(value) {
  if (!value || value.trim() === '') {
    return { status: 'Ocupado', price: null };
  }
  const lowerValue = value.toLowerCase();
  if (
    lowerValue.includes('alquilada') ||
    lowerValue.includes('alquilado') ||
    lowerValue.includes('no disponible') ||
    lowerValue.includes('no dispo') ||
    lowerValue.includes('reservada') ||
    lowerValue.includes('reservado')
  ) {
    return { status: 'Ocupado', price: null };
  }
  if (lowerValue.includes('$') || lowerValue.match(/\d/)) {
    return { status: 'Disponible', price: value.trim() };
  }
  return { status: 'Ocupado', price: null };
}

/**
 * Función principal que procesa el JSON de WordPress.
 * @param {Array} allProperties - El array 'data' del Puente PHP.
 * @returns {{ propertiesToInsert: Array, periodsToInsert: Array }}
 */
export function processFullSyncData(allProperties) {
  const propertiesToInsert = [];
  const periodsToInsert = [];

  // ID de estado "Activa"
  const ACTIVE_STATUS_ID = 158;

  for (const prop of allProperties) {
    
    // --- 1. Traducir datos de 'properties' ---
    
    // Convertir 'acepta_mascota' (ej. "SI") a booleano
    const aceptaMascotaBool = (prop.acepta_mascota || '').trim().toUpperCase() === 'SI';
    
    // Convertir 'piscina' (ej. "Piscina Cercada") a booleano + detalle
    const piscinaDetalle = prop.piscina ? prop.piscina.trim() : null;
    const tienePiscinaBool = !!piscinaDetalle; // true si no es null o vacío
    
    // Convertir precio de venta a número
    const priceInt = parseInt(prop.price, 10) || null;
    
    // Verificar si la propiedad está Activa (ID 158)
    // Si status_ids está vacío, asumimos que está activa por defecto.
    const isActive = prop.status_ids.length === 0 || prop.status_ids.includes(ACTIVE_STATUS_ID);
    
    // Si no está activa, NO la agregamos y saltamos al siguiente loop
    if (!isActive) {
      continue;
    }

    const propertyRecord = {
      property_id: parseInt(prop.property_id, 10),
      slug: prop.slug,
      title: prop.title,
      url: prop.property_url,
      thumbnail_url: prop.thumbnail_url,
      
      // Taxonomías (IDs)
      category_ids: prop.category_ids || [],
      type_ids: prop.type_ids || [],
      status_ids: prop.status_ids || [],
      
      // Ubicación
      zona: prop.zona || null,
      barrio: prop.barrio || null,
      
      // Filtros Alquiler
      pax: parseInt(prop.pax, 10) || null,
      acepta_mascota: aceptaMascotaBool,
      
      // Filtros Piscina (Corregido)
      tiene_piscina: tienePiscinaBool,
      piscina_detalle: piscinaDetalle,
      
      // Filtros Venta
      price: priceInt,
      bedrooms: parseInt(prop.bedrooms, 10) || null,
      bathrooms: parseInt(prop.bathrooms, 10) || null,
      mts_cubiertos: parseInt(prop.construido, 10) || null,
      mts_terreno: parseInt(prop.area, 10) || null,
    };

    propertiesToInsert.push(propertyRecord);

    // --- 2. Traducir datos de 'periods' ---
    
    // IDs de Alquiler Temporal
    const isTemporal = prop.category_ids.includes(196) || prop.category_ids.includes(197);
    
    if (isTemporal) {
      for (const period of PERIOD_MAP) {
        // 'period.key' es ej. 'periodo_ene_1ra'
        // 'prop[period.key]' es el valor ej. "$5.700"
        const rawValue = prop[period.key]; 
        
        const { status, price } = parseStatusAndPrice(rawValue);

        // Solo insertamos el período si el agente le puso un valor
        if (rawValue && rawValue.trim() !== '') {
          periodsToInsert.push({
            property_id: propertyRecord.property_id,
            period_name: period.name,
            start_date: period.start,
            end_date: period.end,
            status: status,
            price: price,
          });
        }
      }
    }
  }

  return { propertiesToInsert, periodsToInsert };
}