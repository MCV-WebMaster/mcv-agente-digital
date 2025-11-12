import { supabase } from '@/lib/supabaseClient';

// --- Mapeo de IDs (basado en su lista de Estatik) ---
const CATEGORY_IDS = {
  VENTA: 198,
  ALQUILER_TEMPORAL: 197,
  ALQUILER_ANUAL: [193, 194], // Array: Amueblado o Sin Muebles
};

const TYPE_IDS = {
  CASA: 162,
  DEPARTAMENTO: 163,
  LOTE: 167,
};

const STATUS_ID_ACTIVA = 158;
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
      zona,      // 'GBA Sur', 'Costa Esmeralda'
      tipo,      // 'casa', 'departamento', 'lote'
      barrio,
      pax,
      pets,      // boolean (true/false)
      pool,      // boolean (true/false)
      bedrooms,
      startDate, 
      endDate,
      minPrice,  // ¡NUEVO!
      maxPrice   // ¡NUEVO!
    } = req.body;

    // --- Lógica de Filtro de Alquiler Temporal ---
    if (operacion === 'alquiler_temporal') {
      
      // 1. Empezamos consultando los PERÍODOS disponibles
      let periodQuery = supabase
        .from('periods')
        .select(`property_id, price`) // Traemos el precio del período
        .eq('status', 'Disponible');
      
      // 2. Aplicamos filtro de fecha (si existe)
      // (Implementaremos el calendario avanzado en el Día 7)
      if (startDate && endDate) {
        periodQuery = periodQuery
          .lte('start_date', startDate)
          .gte('end_date', endDate);
      }
      
      const { data: periodData, error: periodError } = await periodQuery;
      if (periodError) throw periodError;

      // 3. Filtrar por precio ANTES de buscar propiedades
      const priceFilteredPropertyIds = new Set();
      for (const period of periodData) {
        let periodPrice = 0;
        if (period.price) {
          // Extraer solo números (ej. "$5.700" -> 5700)
          periodPrice = parseInt(period.price.replace(/[^0-9]/g, ''), 10) || 0;
        }

        const passesMinPrice = !minPrice || periodPrice >= minPrice;
        const passesMaxPrice = !maxPrice || periodPrice <= maxPrice;

        if (passesMinPrice && passesMaxPrice) {
          priceFilteredPropertyIds.add(period.property_id);
        }
      }

      const availablePropertyIds = [...priceFilteredPropertyIds];

      if (availablePropertyIds.length === 0) {
        return res.status(200).json({ status: 'OK', filters: req.body, count: 0, results: [] });
      }

      // 4. Ahora, buscamos las propiedades que coinciden con esos IDs Y el resto de los filtros
      let propQuery = supabase
        .from('properties')
        .select('*')
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
      let query = supabase.from('properties')
        .select('*')
        // ¡FILTRO CRÍTICO! Solo mostrar propiedades "Activas"
        .contains('status_ids', [STATUS_ID_ACTIVA]); 

      // Filtro de Operación
      if (operacion === 'venta') {
        query = query.contains('category_ids', [CATEGORY_IDS.VENTA]);
      } else if (operacion === 'alquiler_anual') {
        query = query.contains('category_ids', CATEGORY_IDS.ALQUILER_ANUAL);
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
      
      // Filtros de Venta (Mts2 y Precio)
      if (minPrice) query = query.gte('price', parseInt(minPrice, 10));
      if (maxPrice) query = query.lte('price', parseInt(maxPrice, 10));
      if (minMts) query = query.gte('mts_cubiertos', parseInt(minMts, 10));
      if (maxMts) query = query.lte('mts_cubiertos', parseInt(maxMts, 10));
      
      const { data, error } = await query;
      if (error) throw error;
      
      return res.status(200).json({ status: 'OK', filters: req.body, count: data.length, results: data });
    }

  } catch (error) {
    console.error('Error en API Search:', error.message);
    res.status(500).json({ status: 'Error', error: error.message });
  }
}