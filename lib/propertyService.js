// lib/availabilityParser.js

// --- MAPEO DE TRADUCCIÓN (PHP Variables -> Nombre Real DB 2026) ---
// Aquí conectamos la variable que viene del PHP (que usa slugs viejos)
// con el Nombre Real que queremos ver en el Frontend y en la Base de Datos.
const PERIOD_NAMES_MAP = {
  'periodo_navidad':      'Navidad del 19 al 26/12/25',
  'periodo_ano_nuevo':    'Año Nuevo 26/12/25 al 2/1/26',
  
  // El campo que en WP se llama 'enero-1ra-quincena' (PHP: periodo_combo_an_e1) 
  // corresponde REALMENTE a 'Año Nuevo c/1er q...'
  'periodo_combo_an_e1':  'Año Nuevo c/1er q de enero del 30/12/25 al 15/1/26',
  
  // El campo 'enero-2da-quincena' (PHP: periodo_ene_1ra) corresponde a 'Ene 1er q'
  'periodo_ene_1ra':      'Ene 1er q del 2 al 15/1/26',
  
  // El campo 'febrero-1ra-quincena' (PHP: periodo_ene_2da) corresponde a 'Ene 2da q'
  'periodo_ene_2da':      'Ene 2da q del 16 al 31/1/26',
  
  // El campo 'febrero-2da-quincena' (PHP: periodo_feb_1ra) corresponde a 'Feb 1er q c/CARNAVAL'
  'periodo_feb_1ra':      'Feb 1er q c/CARNAVAL del 1 al 17/2/26',
  
  // El campo 'diciembre-2da-quincena' (PHP: periodo_feb_2da) corresponde a 'Feb 2da q'
  'periodo_feb_2da':      'Feb 2da q del 18/2/26 al 1/3/26'
};

export function processFullSyncData(wpProperties) {
  const propertiesToInsert = [];
  const periodsToInsert = [];

  wpProperties.forEach(p => {
    // 1. Procesar Propiedad
    // (Asegúrate de que category_ids sea un array de números)
    let catIds = [];
    if (Array.isArray(p.category_ids)) catIds = p.category_ids.map(Number);
    else if (p.category_ids) catIds = [Number(p.category_ids)];

    let typeIds = [];
    if (Array.isArray(p.type_ids)) typeIds = p.type_ids.map(Number);
    else if (p.type_ids) typeIds = [Number(p.type_ids)];
    
    let statusIds = [];
    if (Array.isArray(p.status_ids)) statusIds = p.status_ids.map(Number);
    else if (p.status_ids) statusIds = [Number(p.status_ids)];

    // Limpieza de datos numéricos
    const priceVal = parseInt(p.price) || 0;
    const bedroomsVal = parseInt(p.bedrooms) || 0;
    const paxVal = parseInt(p.pax) || 0;
    const builtVal = parseInt(p.construido) || 0;

    // Insertar en array de propiedades
    propertiesToInsert.push({
      property_id: parseInt(p.property_id),
      title: p.property_title || '',
      description: p.description || '',
      slug: p.property_slug || '',
      price: priceVal,
      price_note: p.price_note || '', // Importante para GBA
      es_property_price_ars: parseInt(p.price_ars) || 0,
      zona: p.zona || '',
      barrio: p.barrio || '',
      bedrooms: bedroomsVal,
      bathrooms: parseInt(p.bathrooms) || 0,
      pax: paxVal,
      mts_cubiertos: builtVal,
      acepta_mascota: p.acepta_mascota === '1', // WP suele mandar '1' o '0'
      tiene_piscina: p.piscina === '1',
      category_ids: catIds,
      type_ids: typeIds,
      status_ids: statusIds,
      thumbnail: p.thumbnail_url || '',
      url: p.property_url || '',
      // Generamos un campo de búsqueda de texto simple
      fts: `${p.property_title} ${p.barrio} ${p.zona} ${p.description}`.trim()
    });

    // 2. Procesar Periodos (Aquí ocurre la magia de la traducción)
    Object.keys(PERIOD_NAMES_MAP).forEach(phpKey => {
      const rawValue = p[phpKey]; // Ej: p['periodo_combo_an_e1']
      
      // Si el valor existe y no está vacío/reservado
      if (rawValue && rawValue !== 'no disponible' && rawValue !== 'alquilada' && rawValue !== 'reservada') {
        
        let status = 'Disponible';
        let price = 0;

        // Limpiar el precio (sacar $, puntos, u$s)
        const cleanPrice = rawValue.toString().replace(/[^0-9]/g, '');
        if (cleanPrice) {
            price = parseInt(cleanPrice, 10);
        }

        // Si hay un valor (aunque sea texto como "consultar" o un precio), lo guardamos.
        // Usamos el NOMBRE REAL del mapa (PERIOD_NAMES_MAP)
        periodsToInsert.push({
          property_id: parseInt(p.property_id),
          period_name: PERIOD_NAMES_MAP[phpKey], // <--- ESTO GUARDA EL NOMBRE CORRECTO EN LA DB
          price: price, // Guardamos el número limpio
          status: status,
          raw_value: rawValue // Guardamos el original por las dudas
        });
      }
    });
  });

  return { propertiesToInsert, periodsToInsert };
}