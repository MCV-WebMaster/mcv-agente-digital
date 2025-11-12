import { supabase } from '@/lib/supabaseClient';

// --- Mapeo de IDs (basado en su lista de Estatik) ---
const CATEGORY_IDS = {
  VENTA: 198,
  ALQUILER_TEMPORAL: 197,
  ALQUILER_ANUAL_AMUEBLADO: 193,
  ALQUILER_ANUAL_SIN_MUEBLES: 194,
};

const TYPE_IDS = {
  CASA: 162,
  DEPARTAMENTO: 163,
  LOTE: 167,
  DUPLEX: 165,
  LOCAL: 166,
  PH: 269,
};
// --- Fin del Mapeo ---

export default async function handler(req, res) {
  // Usaremos POST para poder enviar un JSON de filtros más complejo
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 1. Obtener los filtros del body de la solicitud
    const { 
      operacion, // 'venta', 'alquiler_temporal', 'alquiler_anual'
      zona,      // 'GBA Sur', 'Costa Esmeralda', 'Arelauquen (BRC)'
      tipo,      // 'casa', 'departamento', 'lote'
      barrio,
      pax,
      pets,      // boolean (true/false)
      pool,      // boolean (true/false)
      bedrooms,
      startDate, // ej: 2026-01-05
      endDate    // ej: 2026-01-12
    } = req.body;

    // --- Lógica de Filtro de Alquiler Temporal ---
    if (operacion === 'alquiler_temporal') {
      
      // 1. Empezamos consultando los PERÍODOS disponibles
      let periodQuery = supabase
        .from('periods')
        .select(`property_id`) // Solo traemos los IDs
        .eq('status', 'Disponible');
      
      // 2. Aplicamos filtro de fecha (si existe)
      if (startDate && endDate) {
        periodQuery = periodQuery
          .lte('start_date', startDate) // La quincena debe empezar ANTES de que el usuario llegue
          .gte('end_date', endDate);   // La quincena debe terminar DESPUÉS de que el usuario se vaya
      }
      
      const { data: periodData, error: periodError } = await periodQuery;
      if (periodError) throw periodError;

      // 3. Obtenemos los IDs únicos de las propiedades que tienen disponibilidad
      const availablePropertyIds = [...new Set(periodData.map(p => p.property_id))];

      if (availablePropertyIds.length === 0) {
        // Si no hay NADA disponible en esas fechas, terminamos rápido.
        return res.status(200).json({ status: 'OK', filters: req.body, count: 0, results: [] });
      }

      // 4. Ahora, buscamos las propiedades que coinciden con esos IDs Y el resto de los filtros
      let propQuery = supabase
        .from('properties')
        .select('*') // Traemos todos los datos de la propiedad
        .in('property_id', availablePropertyIds); // ¡Filtro clave!
      
      // Aplicar filtros restantes
      if (zona) propQuery = propQuery.eq('zona', zona);
      if (barrio) propQuery = propQuery.eq('barrio', barrio);
      if (tipo === 'casa') propQuery = propQuery.contains('type_ids', [TYPE_IDS.CASA]);
      if (tipo === 'departamento') propQuery = propQuery.contains('type_ids', [TYPE_IDS.DEPARTAMENTO]);
      
      if (pets) propQuery = propQuery.eq('acepta_mascota', true);
      if (pool) propQuery = propQuery.eq('tiene_piscina', true);
      if (pax) propQuery = propQuery.gte('pax', parseInt(pax, 10));
      if (bedrooms) propQuery = propQuery.gte('bedrooms', parseInt(bedrooms, 10));
      
      const { data, error } = await propQuery;
      if (error) throw error;
      
      return res.status(200).json({ status: 'OK', filters: req.body, count: data.length, results: data });

    } 
    
    // --- Lógica de Filtro de Venta o Alquiler Anual ---
    else {
      let query = supabase.from('properties').select('*');

      // Filtro de Operación
      if (operacion === 'venta') {
        query = query.contains('category_ids', [CATEGORY_IDS.VENTA]);
      } else if (operacion === 'alquiler_anual') {
        // Buscamos cualquiera de las dos categorías de Alquiler Anual
        query = query.contains('category_ids', [CATEGORY_IDS.ALQUILER_ANUAL_AMUEBLADO, CATEGORY_IDS.ALQUILER_ANUAL_SIN_MUEBLES]);
      }
      
      // Aplicar filtros
      if (zona) query = query.eq('zona', zona);
      if (barrio) query = query.eq('barrio', barrio);
      if (tipo === 'casa') query = query.contains('type_ids', [TYPE_IDS.CASA]);
      if (tipo === 'departamento') query = query.contains('type_ids', [TYPE_IDS.DEPARTAMENTO]);
      if (tipo === 'lote') query = query.contains('type_ids', [TYPE_IDS.LOTE]);
      
      if (pets) query = query.eq('acepta_mascota', true);
      if (pool) query = query.eq('tiene_piscina', true);
      if (bedrooms) query = query.gte('bedrooms', parseInt(bedrooms, 10));
      
      const { data, error } = await query;
      if (error) throw error;
      
      return res.status(200).json({ status: 'OK', filters: req.body, count: data.length, results: data });
    }

  } catch (error) {
    console.error('Error en API Search:', error.message);
    res.status(500).json({ status: 'Error', error: error.message });
  }
}