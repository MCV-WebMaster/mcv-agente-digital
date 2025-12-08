// lib/availabilityParser.js

// CONFIGURACIÓN: Mapeo de la variable PHP -> Nombre REAL que se guardará en la DB
const VARIABLE_TO_DB_NAME = {
  'raw_navidad':                'Navidad del 19 al 26/12/25',
  'raw_ano_nuevo':              'Año Nuevo 26/12/25 al 2/1/26',
  
  // Aquí corregimos el desfasaje histórico.
  // Lo que viene en 'raw_enero_1ra_quincena' SE GUARDA COMO 'Año Nuevo c/1er q...'
  'raw_enero_1ra_quincena':     'Año Nuevo c/1er q de enero del 30/12/25 al 15/1/26',
  
  'raw_enero_2da_quincena':     'Ene 1er q del 2 al 15/1/26',
  'raw_febrero_1ra_quincena':   'Ene 2da q del 16 al 31/1/26',
  'raw_febrero_2da_quincena':   'Feb 1er q c/CARNAVAL del 1 al 17/2/26',
  'raw_diciembre_2da_quincena': 'Feb 2da q del 18/2/26 al 1/3/26'
};

export function processFullSyncData(wpProperties) {
  const propertiesToInsert = [];
  const periodsToInsert = [];

  wpProperties.forEach(p => {
    // --- 1. PROCESAR PROPIEDAD ---
    // Asegurar arrays de IDs
    const toIntArray = (val) => {
        if (Array.isArray(val)) return val.map(Number);
        if (val) return [Number(val)];
        return [];
    };

    propertiesToInsert.push({
      property_id: parseInt(p.property_id),
      title: p.property_title || 'Sin Título',
      description: p.description || '',
      slug: p.property_slug || '',
      price: parseInt(p.price) || 0,
      price_note: p.price_note || '', 
      es_property_price_ars: parseInt(p.price_ars) || 0,
      zona: p.zona || '',
      barrio: p.barrio || '',
      bedrooms: parseInt(p.bedrooms) || 0,
      bathrooms: parseInt(p.bathrooms) || 0,
      pax: parseInt(p.pax) || 0,
      mts_cubiertos: parseInt(p.construido) || 0,
      acepta_mascota: p.acepta_mascota === '1', 
      tiene_piscina: p.piscina === '1',
      category_ids: toIntArray(p.category_ids),
      type_ids: toIntArray(p.type_ids),
      status_ids: toIntArray(p.status_ids),
      thumbnail: p.thumbnail_url || '',
      url: p.property_url || '',
      fts: `${p.property_title} ${p.barrio} ${p.zona}`.toLowerCase()
    });

    // --- 2. PROCESAR PERIODOS ---
    // Recorremos el mapa de traducción
    Object.keys(VARIABLE_TO_DB_NAME).forEach(phpVar => {
      const rawValue = p[phpVar]; // El valor que vino de WordPress (ej: "$5.300", "alquilada", null)

      // Solo guardamos si hay dato y no está bloqueado
      if (rawValue && typeof rawValue === 'string') {
          const valLower = rawValue.toLowerCase();
          if (valLower.includes('no disponible') || valLower.includes('alquilada') || valLower.includes('reservada')) {
              return; // No insertar
          }

          // Limpiar precio
          let price = 0;
          const cleanPrice = rawValue.replace(/[^0-9]/g, '');
          if (cleanPrice) price = parseInt(cleanPrice, 10);

          // INSERTAR EN LA LISTA DE PERIODOS
          // Usamos el nombre REAL (dbName)
          periodsToInsert.push({
            property_id: parseInt(p.property_id),
            period_name: VARIABLE_TO_DB_NAME[phpVar], // <--- ESTO ES LO IMPORTANTE
            price: price,
            status: 'Disponible',
            raw_value: rawValue
          });
      }
    });
  });

  return { propertiesToInsert, periodsToInsert };
}