/**
 * Lógica de negocio para interpretar los campos de disponibilidad de Estatik.
 * VERSIÓN FINAL: Basado en el análisis de phpMyAdmin (Tarea 2.25/2.26).
 * - Usa guiones medios (-)
 * - Espera valores 'SI'/'NO'
 * - CORRECCIÓN (Tarea 2.39): Conversión de booleano robusta.
 */

/**
 * Mapeo de los campos meta de Estatik a rangos de fechas fijos.
 */
const PERIOD_MAP = {
  // Verano 2025-2026 (Nombres 100% verificados con guión medio)
  'es_property_navidad': { name: 'Navidad', start: '2025-12-19', end: '2025-12-26' },
  'es_property_ano-nuevo': { name: 'Año Nuevo', start: '2025-12-26', end: '2026-01-02' },
  'es_property_ano-nuevo-c1er-q-de-enero': { name: 'Año Nuevo c/1ra Q Ene', start: '2025-12-30', end: '2026-01-15' },
  'es_property_enero-1ra-quincena': { name: 'Enero 1ra Quincena', start: '2026-01-02', end: '2026-01-15' },
  'es_property_enero-2da-quincena': { name: 'Enero 2da Quincena', start: '2026-01-16', end: '2026-01-31' },
  'es_property_febrero-1ra-quincena': { name: 'Febrero 1ra Quincena', start: '2026-02-01', end: '2026-02-15' },
  'es_property_febrero-1ra-quincena-ccarnaval': { name: 'Febrero 1ra Q c/Carnaval', start: '2026-02-01', end: '2026-02-17' },
  'es_property_febrero-2da-quincena': { name: 'Febrero 2da Quincena', start: '2026-02-18', end: '2026-03-01' },
  'es_property_diciembre-2da-quincena': { name: 'Diciembre 2da Quincena', start: '2025-12-15', end: '2025-12-31' }
};

/**
 * Interpreta el valor de un campo de disponibilidad.
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
 * Genera la lista completa de disponibilidad para una propiedad.
 */
export function processPropertyAvailability(propertyRow) {
  const availabilityRecords = [];
  
  // --- LÓGICA DE CONVERSIÓN CORREGIDA ---
  // (propertyRow['es_...'] || '') -> previene errores si el valor es NULL
  // .trim() -> quita espacios en blanco (ej. "SI ")
  // .toUpperCase() -> convierte "si" en "SI"
  // === 'SI' -> Compara y devuelve true o false
  const acceptsPetsBool = (propertyRow['es_property_acepta-mascota'] || '').trim().toUpperCase() === 'SI';
  const hasPoolBool = (propertyRow['es_property_pool'] || '').trim().toUpperCase() === 'SI';
  // --- FIN DE LA CORRECCIÓN ---

  const propertyData = {
    property_id: propertyRow.property_id,
    property_slug: propertyRow.property_slug,
    property_title: propertyRow.property_title,
    property_url: propertyRow.property_url,
    property_type: null,
    
    pax: parseInt(propertyRow.pax, 10) || null,
    accepts_pets: acceptsPetsBool, // Usa el booleano corregido
    has_pool: hasPoolBool,         // Usa el booleano corregido
    barrio_costa: propertyRow['es_property_barrios-costa-esmeralda'] || null,
  };

  // Iteramos sobre los campos de período que conocemos
  for (const metaKey in PERIOD_MAP) {
    const periodInfo = PERIOD_MAP[metaKey];
    
    const rawValue = propertyRow[metaKey]; 
    const { status, price } = parseStatusAndPrice(rawValue);
    const syncHash = `${propertyData.property_id}_${periodInfo.start}_${periodInfo.end}`;

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