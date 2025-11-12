/**
 * Lógica de negocio v4 (Definitiva)
 * Parsea el JSON del "Puente PHP" (v7)
 * Filtra por "Activa" (ID 158)
 */

// --- MAPEO DE DISPONIBILIDAD ---
const PERIOD_MAP = [
  { key: 'periodo_navidad', name: 'Navidad', start: '2025-12-19', end: '2025-12-26' },
  { key: 'periodo_ano_nuevo', name: 'Año Nuevo', start: '2025-12-26', end: '2026-01-02' },
  { key: 'periodo_ene_1ra', name: 'Enero 1ra Quincena', start: '2026-01-02', end: '2026-01-15' },
  { key: 'periodo_ene_2da', name: 'Enero 2da Quincena', start: '2026-01-16', end: '2026-01-31' },
  { key: 'periodo_feb_1ra', name: 'Febrero 1ra Quincena', start: '2026-02-01', end: '2026-02-15' },
  { key: 'periodo_feb_2da', name: 'Febrero 2da Quincena', start: '2026-02-18', end: '2026-03-01' },
  { key: 'periodo_dic_2da', name: 'Diciembre 2da Quincena', start: '2025-12-15', end: '2025-12-31' },
];

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

export function processFullSyncData(allProperties) {
  const propertiesToInsert = [];
  const periodsToInsert = [];

  // ID de estado "Activa" de su WordPress
  const ACTIVE_STATUS_ID = 158;

  for (const prop of allProperties) {

    // --- FILTRO DE PROPIEDADES ACTIVAS ---
    // Verificamos si la propiedad está Activa (ID 158)
    // Si status_ids está vacío, asumimos que está activa (es el default).
    const isActive = prop.status_ids.length === 0 || prop.status_ids.includes(ACTIVE_STATUS_ID);

    // Si NO está activa (ej. Vendida 161, Reservada 159), saltamos al siguiente loop
    if (!isActive) {
      continue;
    }

    // --- 1. Traducir datos de 'properties' ---
    const aceptaMascotaBool = (prop.acepta_mascota || '').trim().toUpperCase() === 'SI';
    const piscinaDetalle = prop.piscina ? prop.piscina.trim() : null;
    const tienePiscinaBool = !!piscinaDetalle;
    const priceInt = parseInt(prop.price, 10) || null;

    const propertyRecord = {
      property_id: parseInt(prop.property_id, 10),
      slug: prop.slug,
      title: prop.title,
      url: prop.property_url,
      thumbnail_url: prop.thumbnail_url,

      category_ids: prop.category_ids || [],
      type_ids: prop.type_ids || [],
      status_ids: prop.status_ids || [],

      // ¡DATOS CORREGIDOS!
      zona: prop.zona || null,
      barrio: prop.barrio || null,

      pax: parseInt(prop.pax, 10) || null,
      acepta_mascota: aceptaMascotaBool,

      tiene_piscina: tienePiscinaBool,
      piscina_detalle: piscinaDetalle,

      price: priceInt,
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