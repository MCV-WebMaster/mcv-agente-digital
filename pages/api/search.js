import { supabase } from '@/lib/supabaseClient';

export default async function handler(req, res) {
  try {
    // 1. Obtener los filtros de la URL (req.query)
    const { 
      startDate, // ej: 2026-01-05
      endDate,   // ej: 2026-01-12
      pax,       // ej: 4
      pets,      // ej: "true"
      pool,      // ej: "true"
      barrio     // ej: "Maritimo III"
    } = req.query;

    // 2. Empezar a construir la consulta en Supabase
    let query = supabase
      .from('property_availability')
      .select(`
        property_id, 
        property_slug, 
        property_title, 
        property_url, 
        pax, 
        accepts_pets, 
        has_pool, 
        barrio_costa
      `)
      .eq('status', 'Disponible'); // ¡Solo traer propiedades "Disponibles"!

    // 3. Aplicar los filtros que el usuario envió

    // --- Filtro de Fechas (El "Gran Desafío") ---
    if (startDate) {
      query = query.lte('start_date', startDate); 
    }
    if (endDate) {
      query = query.gte('end_date', endDate);
    }

    // --- Otros Filtros ---
    if (pax) {
      query = query.gte('pax', parseInt(pax, 10)); 
    }
    if (pets === 'true') {
      query = query.eq('accepts_pets', true);
    }
    if (pool === 'true') {
      query = query.eq('has_pool', true);
    }
    if (barrio) {
      query = query.eq('barrio_costa', barrio);
    }

    // 4. Ejecutar la consulta (traerá duplicados)
    const { data, error } = await query;

    if (error) {
      throw error;
    }

    // --- INICIO DE LA CORRECCIÓN (Tarea 3.5) ---
    // 'data' tiene 356 filas (con duplicados).
    // Vamos a filtrarlas por 'property_id' usando JavaScript.
    
    const uniquePropertiesMap = new Map();
    
    data.forEach(property => {
      // Si la propiedad NO está en el mapa, la añadimos.
      // Si ya está, la ignoramos.
      if (!uniquePropertiesMap.has(property.property_id)) {
        uniquePropertiesMap.set(property.property_id, property);
      }
    });

    // Convertimos el mapa de vuelta a un array
    const uniqueResults = Array.from(uniquePropertiesMap.values());
    // 'uniqueResults' ahora solo tiene una entrada por property_id
    // --- FIN DE LA CORRECCIÓN ---


    // 5. Devolver los resultados ÚNICOS
    res.status(200).json({ 
      status: 'OK',
      filters: req.query,
      count: uniqueResults.length, // Devolvemos el count corregido
      results: uniqueResults      // Devolvemos los resultados únicos
    });

  } catch (error) {
    console.error('Error en API Search:', error.message);
    res.status(500).json({ status: 'Error', error: error.message });
  }
}