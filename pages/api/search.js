import { supabase } from '@/lib/supabaseClient';

// --- IDs de Taxonomía ---
const CATEGORY_IDS = {
  VENTA: 198,
  ALQUILER_TEMPORAL: 197,
  ALQUILER_ANUAL: 194,
  ALQUILER_ANUAL_AMUEBLADO: 193,
};
const TYPE_IDS = {
  CASA: 162,
  DEPARTAMENTO: 163,
  LOTE: 167,
};
const STATUS_ID_ACTIVA = 158;
// --- Fin del Mapeo ---

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { 
      operacion, zona, tipo, barrio, pax, pets, pool, bedrooms,
      minPrice, maxPrice, minMts, maxMts,
      startDate, endDate // ¡AHORA LOS USAMOS!
    } = req.body;

    // --- Lógica de Alquiler Temporal ---
    if (operacion === 'alquiler_temporal') {
      
      // 1. Primero, buscar en la tabla 'periods'
      let periodQuery = supabase
        .from('periods')
        .select(`property_id, price`)
        .eq('status', 'Disponible');
      
      // --- ¡LÓGICA DE FILTRADO DE FECHAS (EL CORE)! ---
      if (startDate && endDate) {
        periodQuery = periodQuery
          .lte('start_date', startDate) // El período (ej. Ene 16) debe empezar ANTES de la llegada (ej. Ene 20)
          .gte('end_date', endDate);   // El período (ej. Ene 31) debe terminar DESPUÉS de la salida (ej. Ene 25)
      }
      
      const { data: periodData, error: periodError } = await periodQuery;
      if (periodError) throw periodError;

      // 2. Filtrar por precio de alquiler temporal
      const priceFilteredPropertyIds = new Set();
      const minPriceMap = new Map(); // Mapa para guardar el precio mínimo

      for (const period of periodData) {
        let periodPrice = 0;
        if (period.price) {
          periodPrice = parseInt(period.price.replace(/[^0-9]/g, ''), 10) || 0;
        }

        const passesMinPrice = !minPrice || periodPrice >= minPrice;
        const passesMaxPrice = !maxPrice || periodPrice <= maxPrice;

        if (passesMinPrice && passesMaxPrice) {
          priceFilteredPropertyIds.add(period.property_id);
          
          // Guardar el precio más bajo para esta propiedad
          if (!minPriceMap.has(period.property_id) || periodPrice < minPriceMap.get(period.property_id)) {
            minPriceMap.set(period.property_id, periodPrice);
          }
        }
      }

      const availablePropertyIds = [...priceFilteredPropertyIds];

      if (availablePropertyIds.length === 0) {
        return res.status(200).json({ status: 'OK', filters: req.body, count: 0, results: [] });
      }

      // 3. Ahora, buscar las propiedades que coinciden con esos IDs Y el resto de los filtros
      let propQuery = supabase
        .from('properties')
        .select('*')
        .in('property_id', availablePropertyIds);
      
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
      
      // 4. Inyectar el precio mínimo en los resultados finales
      const finalResults = data.map(p => ({
        ...p,
        min_rental_price: minPriceMap.get(p.property_id) || null
      }));
      
      return res.status(200).json({ status: 'OK', filters: req.body, count: finalResults.length, results: finalResults });

    } 
    
    // --- Lógica de Venta o Alquiler Anual ---
    else {
      let query = supabase.from('properties')
        .select('*')
        // Filtro de "Activa" (ID 158) o "Vacía" []
        .or(`status_ids.cs.{${STATUS_ID_ACTIVA}},status_ids.eq.{}`); 

      if (operacion === 'venta') {
        query = query.contains('category_ids', [CATEGORY_IDS.VENTA]);
        if (minPrice) query = query.gte('price', parseInt(minPrice, 10));
        if (maxPrice) query = query.lte('price', parseInt(maxPrice, 10));

      } else if (operacion === 'alquiler_anual') {
        query = query.or(`category_ids.cs.{${CATEGORY_IDS.ALQUILER_ANUAL}}, category_ids.cs.{${CATEGORY_IDS.ALQUILER_ANUAL_AMUEBLADO}}`);
        // (Nota: El precio de Alq. Anual no está en el 'price' numérico, sino en el texto. Se puede añadir si es necesario)
        if (minPrice) query = query.gte('price', parseInt(minPrice, 10));
        if (maxPrice) query = query.lte('price', parseInt(maxPrice, 10));
      }
      
      // Aplicar filtros
      if (zona) query = query.eq('zona', zona);
      if (barrio) query = query.eq('barrio', barrio);
      if (tipo === 'casa') query = query.contains('type_ids', [TYPE_IDS.CASA]);
      if (tipo === 'departamento') query = query.contains('type_ids', [TYPE_IDS.DEPARTAMENTO]);
      if (tipo === 'lote') query = query.contains('type_ids', [TYPE_IDS.LOTE]);
      if (pool) query = query.eq('tiene_piscina', true);
      if (bedrooms) query = query.gte('bedrooms', parseInt(bedrooms, 10));
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