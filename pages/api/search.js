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
    // Pedimos solo los datos principales de la propiedad.
    // Usaremos .distinct() para no repetir la misma propiedad
    // si está disponible en múltiples quincenas.
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
    // Esta lógica busca períodos de alquiler (ej. una quincena)
    // que "envuelvan" completamente las fechas del usuario.
    // Período DB: [--- start_date --- (Usuario) --- (Usuario) end_date --- end_date ---]
    if (startDate) {
      query = query.lte('start_date', startDate); // La quincena debe empezar ANTES de que el usuario llegue
    }
    if (endDate) {
      query = query.gte('end_date', endDate); // La quincena debe terminar DESPUÉS de que el usuario se vaya
    }

    // --- Otros Filtros ---
    if (pax) {
      // Traer propiedades con capacidad >= a la solicitada
      query = query.gte('pax', parseInt(pax, 10)); 
    }
    if (pets === 'true') {
      // Traer propiedades que aceptan mascotas
      query = query.eq('accepts_pets', true);
    }
    if (pool === 'true') {
      // Traer propiedades que tienen pileta
      query = query.eq('has_pool', true);
    }
    if (barrio) {
      // Traer propiedades de un barrio específico
      query = query.eq('barrio_costa', barrio);
    }

    // 4. Ejecutar la consulta (pidiendo que no repita propiedades)
    const { data, error } = await query.distinct('property_id');

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