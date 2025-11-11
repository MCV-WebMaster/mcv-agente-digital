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
      .distinct('property_id') // <-- CORRECCIÓN: .distinct() va aquí
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

    // 4. Ejecutar la consulta
    const { data, error } = await query; // <-- CORRECCIÓN: Se quitó .distinct() de aquí

    if (error) {
      throw error;
    }

    // 5. Devolver los resultados
    res.status(200).json({ 
      status: 'OK',
      filters: req.query,
      count: data.length,
      results: data 
    });

  } catch (error) {
    console.error('Error en API Search:', error.message);
    res.status(500).json({ status: 'Error', error: error.message });
  }
}