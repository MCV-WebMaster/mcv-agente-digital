/**
 * Lógica de negocio v5 (Core Alquiler Temporal)
 * Parsea el JSON del "Puente PHP" (v8)
 * Filtra por "Activa" (ID 158)
 * Interpreta "disponible carnaval" como Disponible
 */

// --- MAPEO DE DISPONIBILIDAD (Corregido con sus fechas) ---
const PERIOD_MAP = [
  { key: 'periodo_navidad', name: 'Navidad', start: '2025-12-19', end: '2025-12-26' },
  { key: 'periodo_ano_nuevo', name: 'Año Nuevo', start: '2025-12-26', end: '2026-01-02' },
  { key: 'periodo_ene_1ra', name: 'Enero 1ra Quincena', start: '2026-01-02', end: '2026-01-15' },
  { key: 'periodo_ene_2da', name: 'Enero 2da Quincena', start: '2026-01-16', end: '2026-01-31' },
  { key: 'periodo_feb_1ra', name: 'Febrero 1ra Quincena', start: '2026-02-01', end: '2026-02-17' }, // Ajustado a su ejemplo (Carnaval 17/2)
  { key: 'periodo_feb_2da', name: 'Febrero 2da Quincena', start: '2026-02-18', end: '2026-03-01' },
  { key: 'periodo_dic_2da', name: 'Diciembre 2da Quincena', start: '2025-12-15', end: '2025-12-31' },
];

/**
 * Interpreta el valor de un campo de disponibilidad.
 * @param {string | null} value - El valor del campo (ej. "Alquilada" o "$5.700" o "disponible carnaval")
 * @returns {{ status: 'Disponible' | 'Ocupado', price: string | null }}
 */
function parseStatusAndPrice(value) {
  if (!value || value.trim() === '') {
    return { status: 'Ocupado', price: null };
  }
  const lowerValue = value.toLowerCase();

  // 1. Chequeo de Ocupado (Tiene prioridad)
  if (
    lowerValue.includes('alquilada') ||
    lowerValue.includes('alquilado') ||
    lowerValue.includes('reservada') ||
    lowerValue.includes('reservado') ||
    lowerValue.includes('no disponible') ||
    lowerValue.includes('no dispo')
  ) {
    // Excepción: "Alquilada hasta el 13/2 - disponible carnaval"
    if (lowerValue.includes('disponible')) {
       return { status: 'Disponible', price: null }; // Es "Disponible" aunque no tenga precio
    }
    return { status: 'Ocupado', price: null };
  }
  
  // 2. Chequeo de Precio (Disponible)
  if (lowerValue.includes('$') || lowerValue.match(/\d/)) {
    return { status: 'Disponible', price: value.trim() };
  }
  
  // 3. Chequeo de "Disponible" (aunque no tenga precio)
  if (lowerValue.includes('disponible')) {
    return { status: 'Disponible', price: null };
  }

  // 4. Default
  return { status: 'Ocupado', price: null };
}

export function processFullSyncData(allProperties) {
  const propertiesToInsert = [];
  const periodsToInsert = [];

  const ACTIVE_STATUS_ID = 158; // ID de "Activa"

  for (const prop of allProperties) {
    
    // --- FILTRO DE PROPIEDADES ACTIVAS ---
    const isActive = prop.status_ids.length === 0 || prop.status_ids.includes(ACTIVE_STATUS_ID);
    if (!isActive) {
      continue; // Saltar esta propiedad
    }

    // --- 1. Traducir datos de 'properties' ---
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
      
      price: priceInt, // Precio Venta (USD)
      es_property_price_ars: priceArsInt, // Precio Alq Anual (ARS)
      
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
        const { status, price } = parseStatusAndPrice(rawValue); // Usando la nueva lógica

        // Solo insertamos si el traductor dijo que está Disponible
        if (status === 'Disponible') {
          periodsToInsert.push({
            property_id: propertyRecord.property_id,
            period_name: period.name,
            start_date: period.start,
            end_date: period.end,
            status: status,
            price: price, // Puede ser "$1.400" o null (si solo decía "disponible")
          });
        }
      }
    }
  }

  return { propertiesToInsert, periodsToInsert };
}