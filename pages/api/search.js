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
// --- Fin del Mapeo ---

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { 
      operacion, zona, tipo, barrio, pax, pets, pool, bedrooms,
      startDate, endDate,
      minPrice, maxPrice, 
      minMts, maxMts
    } = req.body;

    // --- Lógica de Alquiler Temporal ---
    if (operacion === 'alquiler_temporal') {
      
      let periodQuery = supabase
        .from('periods')
        .select(`property_id, price`)
        .eq('status', 'Disponible');
      
      if (startDate && endDate) {
        periodQuery = periodQuery
          .lte('start_date', startDate)
          .gte('end_date', endDate);
      }
      
      const { data: periodData, error: periodError } = await periodQuery;
      if (periodError) throw periodError;

      const priceFilteredPropertyIds = new Set();
      for (const period of periodData) {
        let periodPrice = 0;
        if (period.price) {
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

      let propQuery = supabase
        .from('properties')
        .select('*')
        .in('property_id', availablePropertyIds); // Filtro clave
      
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
    
    // --- Lógica de Venta o Alquiler Anual ---
    else {
      let query = supabase.from('properties').select('*');

      // ¡FILTRO CORREGIDO! El filtro de 'status_ids' se ha eliminado
      // porque la tabla 'properties' ya está pre-filtrada por "Activa".

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