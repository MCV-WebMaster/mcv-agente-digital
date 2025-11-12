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
      operacion, zona, tipo, barrio, 
      pax, pax_or_more, // ¡NUEVO!
      pets, pool, bedrooms,
      minPrice, maxPrice, minMts, maxMts,
      startDate, endDate
    } = req.body;

    let query = supabase.from('properties').select('*');

    // --- 1. FILTRO DE OPERACIÓN (El más importante) ---
    if (operacion === 'venta') {
      query = query.contains('category_ids', [CATEGORY_IDS.VENTA]);
      if (minPrice) query = query.gte('es_property_price', parseInt(minPrice, 10));
      if (maxPrice) query = query.lte('es_property_price', parseInt(maxPrice, 10));

    } else if (operacion === 'alquiler_anual') {
      query = query.or(`category_ids.cs.{${CATEGORY_IDS.ALQUILER_ANUAL}}, category_ids.cs.{${CATEGORY_IDS.ALQUILER_ANUAL_AMUEBLADO}}`);
      if (minPrice) query = query.gte('es_property_price_ars', parseInt(minPrice, 10));
      if (maxPrice) query = query.lte('es_property_price_ars', parseInt(maxPrice, 10));
    
    } else if (operacion === 'alquiler_temporal') {
      query = query.contains('category_ids', [CATEGORY_IDS.ALQUILER_TEMPORAL]);
      
      // --- Lógica de Alquiler Temporal (Filtro de Precio y Fecha) ---
      let { data: propertiesData, error: propertiesError } = await query;
      if (propertiesError) throw propertiesError;

      // 1. Filtrar propiedades por filtros base (antes de chequear períodos)
      if (zona) propertiesData = propertiesData.filter(p => p.zona === zona);
      if (barrio) propertiesData = propertiesData.filter(p => p.barrio === barrio);
      if (tipo === 'casa') propertiesData = propertiesData.filter(p => p.type_ids.includes(TYPE_IDS.CASA));
      if (tipo === 'departamento') propertiesData = propertiesData.filter(p => p.type_ids.includes(TYPE_IDS.DEPARTAMENTO));
      if (pool) propertiesData = propertiesData.filter(p => p.tiene_piscina === true);
      if (pets) propertiesData = propertiesData.filter(p => p.acepta_mascota === true);

      // --- ¡NUEVA LÓGICA DE PAX! ---
      if (pax) {
        const paxNum = parseInt(pax, 10);
        if (pax_or_more) {
          // "o más" (>=)
          propertiesData = propertiesData.filter(p => p.pax >= paxNum);
        } else {
          // "exacto" (=)
          propertiesData = propertiesData.filter(p => p.pax === paxNum);
        }
      }
      // --- Fin Lógica de PAX ---

      const propertyIds = propertiesData.map(p => p.property_id);
      if (propertyIds.length === 0) {
        return res.status(200).json({ status: 'OK', filters: req.body, count: 0, results: [] });
      }

      // 2. Ahora, buscar en la tabla 'periods'
      let periodQuery = supabase
        .from('periods')
        .select('*')
        .in('property_id', propertyIds)
        .eq('status', 'Disponible'); // ¡Gracias a la Tarea 10.2, esto ahora es confiable!

      // 3. Filtrar por Fecha (Core)
      if (startDate && endDate) {
        periodQuery = periodQuery
          .lte('start_date', startDate)
          .gte('end_date', endDate);
      }

      const { data: periodsData, error: periodsError } = await periodQuery;
      if (periodsError) throw periodsError;

      // 4. Mapear precios y filtrar por precio
      const availablePropertyIds = new Set();
      const minPriceMap = new Map();

      for (const period of periodsData) {
        let periodPrice = 0;
        if (period.price) {
          periodPrice = parseInt(period.price.replace(/[^0-9]/g, ''), 10) || 0;
        }

        // Si el período no tiene precio (ej. "disponible carnaval"), no podemos filtrarlo
        // por precio, pero sí debemos mostrarlo si el usuario no puso rango de precio.
        const passesMinPrice = !minPrice || (periodPrice > 0 && periodPrice >= minPrice);
        const passesMaxPrice = !maxPrice || (periodPrice > 0 && periodPrice <= maxPrice);
        
        // Si el usuario SÍ puso rango de precio, y el período no tiene precio, se descarta.
        if (minPrice && periodPrice === 0) continue;
        if (maxPrice && periodPrice === 0) continue;

        if (passesMinPrice && passesMaxPrice) {
          availablePropertyIds.add(period.property_id);
          if (periodPrice > 0) {
            if (!minPriceMap.has(period.property_id) || periodPrice < minPriceMap.get(period.property_id)) {
              minPriceMap.set(period.property_id, periodPrice);
            }
          }
        }
      }

      // 5. Filtrar las propiedades finales
      const finalResults = propertiesData
        .filter(p => availablePropertyIds.has(p.property_id))
        .map(p => ({
          ...p,
          min_rental_price: minPriceMap.get(p.property_id) || null
        }));

      return res.status(200).json({ status: 'OK', filters: req.body, count: finalResults.length, results: finalResults });
    }

    // --- 2. FILTROS COMUNES (para Venta y Alquiler Anual) ---
    if (operacion !== 'alquiler_temporal') {
      if (zona) query = query.eq('zona', zona);
      if (barrio) query = query.eq('barrio', barrio);
      if (tipo === 'casa') query = query.contains('type_ids', [TYPE_IDS.CASA]);
      if (tipo === 'departamento') query = query.contains('type_ids', [TYPE_IDS.DEPARTAMENTO]);
      if (tipo === 'lote') query = query.contains('type_ids', [TYPE_IDS.LOTE]);
      if (pool) query = query.eq('tiene_piscina', true);
      if (bedrooms) query = query.gte('bedrooms', parseInt(bedrooms, 10));
      if (minMts) query = query.gte('mts_cubiertos', parseInt(minMts, 10));
      if (maxMts) query = query.lte('mts_cubiertos', parseInt(maxMts, 10));
    }

    // 3. Ejecutar la consulta final (para Venta y Alquiler Anual)
    const { data, error } = await query;
    if (error) throw error;
    
    return res.status(200).json({ status: 'OK', filters: req.body, count: data.length, results: data });

  } catch (error) {
    console.error('Error en API Search:', error.message);
    res.status(500).json({ status: 'Error', error: error.message });
  }
}