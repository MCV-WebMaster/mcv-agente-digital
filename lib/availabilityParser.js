/**
 * Lógica de negocio para interpretar los campos de disponibilidad de Estatik.
 * Basado en el análisis del XML y el plan V4.
 */

/**
 * Mapeo de los campos meta de Estatik a rangos de fechas fijos.
 * Asumimos el año 2025-2026. 
 * TODO: Esto deberá ser actualizado manualmente cada año o 
 * mejorado para detectar el año dinámicamente si es posible.
 * * Por ahora, para el sprint, hardcodeamos los rangos de la próxima temporada.
 */
const PERIOD_MAP = {
  // Verano 2025-2026
  'es_property_navidad': { 
    name: 'Navidad', 
    start: '2025-12-19', 
    end: '2025-12-26' 
  },
  'es_property_ano-nuevo': { 
    name: 'Año Nuevo', 
    start: '2025-12-26', 
    end: '2026-01-02' 
  },
  'es_property_ano-nuevo-c1er-q-de-enero': { 
    name: 'Año Nuevo c/1ra Q Ene', 
    start: '2025-12-30', 
    end: '2026-01-15' 
  },
  'es_property_enero-1ra-quincena': { 
    name: 'Enero 1ra Quincena', 
    start: '2026-01-02', 
    end: '2026-01-15' 
  },
  'es_property_enero-2da-quincena': { 
    name: 'Enero 2da Quincena', 
    start: '2026-01-16', 
    end: '2026-01-31' 
  },
  'es_property_febrero-1ra-quincena': { 
    name: 'Febrero 1ra Quincena', 
    start: '2026-02-01', 
    end: '2026-02-15' 
  },
  'es_property_febrero-1ra-quincena-ccarnaval': { 
    name: 'Febrero 1ra Q c/Carnaval', 
    start: '2026-02-01', 
    end: '2026-02-17' 
  },
  'es_property_febrero-2da-quincena': { 
    name: 'Febrero 2da Quincena', 
    start: '2026-02-18', 
    end: '2026-03-01' 
  },
  // Agregue aquí más mapeos si es necesario (ej. Marzo)
};

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

  // Lógica de "Ocupado"
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

  // Lógica de "Disponible" (cualquier cosa con un número o $)
  if (lowerValue.includes('$') || lowerValue.match(/\d/)) {
    return { status: 'Disponible', price: value.trim() };
  }

  // Si no es ninguno, asumimos que no está disponible
  return { status: 'Ocupado', price: null };
}

/**
 * Genera la lista completa de disponibilidad para una propiedad.
 * @param {Object} propertyNode - El nodo de la propiedad de WPGraphQL
 * @returns {Array} - Un array de objetos listos para Supabase
 */
export function processPropertyAvailability(propertyNode) {
  const availabilityRecords = [];
  
  // Extraemos los datos comunes de la propiedad
  const propertyData = {
    property_id: propertyNode.databaseId,
    property_slug: propertyNode.slug,
    property_title: propertyNode.title,
    property_url: propertyNode.uri,
    property_type: propertyNode.es_property_type?.name || 'Venta', // 'Venta', 'Alquiler', 'Alquiler Temporal'
    pax: propertyNode.es_property_pax || null,
    accepts_pets: propertyNode.es_property_acepta_mascota || false,
    has_pool: propertyNode.es_property_pool || false,
    barrio_costa: propertyNode.es_property_barrios_costa_esmeralda?.name || null,
  };

  // Iteramos sobre los campos de período que conocemos
  for (const metaKey in PERIOD_MAP) {
    const periodInfo = PERIOD_MAP[metaKey];
    
    // Obtenemos el valor de ese campo en la propiedad
    // (WPGraphQL cambia 'es_property_...' a 'es_property_...')
    // (WPGraphQL cambia '-' a '_')
    const gqlKey = metaKey.replace(/-/g, '_');
    const rawValue = propertyNode[gqlKey]; 

    // Interpretamos el valor (ej. "Alquilada" o "$5.700")
    const { status, price } = parseStatusAndPrice(rawValue);

    // Creamos un hash único para esta entrada
    // Esto previene que insertemos el mismo período para la misma propiedad dos veces
    const syncHash = `${propertyData.property_id}_${periodInfo.start}_${periodInfo.end}`;

    // Creamos el registro para Supabase
    availabilityRecords.push({
      ...propertyData,
      period_name: periodInfo.name,
      start_date: periodInfo.start,
      end_date: periodInfo.end,
      status: status,
      price: price,
      sync_hash: syncHash,
    });
  }

  return availabilityRecords;
}