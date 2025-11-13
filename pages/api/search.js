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

// Fechas de la Temporada 2026
const SEASON_START_DATE = '2025-12-19';
const SEASON_END_DATE = '2026-03-01';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { 
      operacion, zona, tipo, barrio, 
      pax, pax_or_more,
      pets, pool, bedrooms,
      minPrice, maxPrice, minMts, maxMts,
      startDate, endDate,
      sortBy = 'default'
    } = req.body;

    let query = supabase.from('properties').select('*');
    
    query = query.or(`status_ids.cs.{${STATUS_ID_ACTIVA}},status_ids.eq.{}`);

    // --- Lógica de Alquiler Temporal ---
    if (operacion === 'alquiler_temporal') {
      
      query = query.contains('category_ids', [CATEGORY_IDS.ALQUILER_TEMPORAL]);

      // 1. Filtrar propiedades por filtros base
      if (zona) query = query.eq('zona', zona);
      if (barrio) query = query.eq('barrio', barrio);
      if (tipo === 'casa') query = query.contains('type_ids', [TYPE_IDS.CASA]);
      if (tipo === 'departamento') query = query.contains('type_ids', [TYPE_IDS.DEPARTAMENTO]);
      if (pool) query = query.eq('tiene_piscina', true);
      if (pets) query = query.eq('acepta_mascota', true);
      if (bedrooms) query = query.gte('bedrooms', parseInt(bedrooms, 10));

      if (pax) {
        const paxNum = parseInt(pax, 10);
        query = pax_or_more ? query.gte('pax', paxNum) : query.eq('pax', paxNum);
      }
      
      let { data: propertiesData, error: propertiesError } = await query;
      if (propertiesError) throw propertiesError;
      
      const propertyIds = propertiesData.map(p => p.property_id);
      if (propertyIds.length === 0) {
        return res.status(200).json({ status: 'OK', count: 0, results: [] });
      }

      // 2. Buscar en la tabla 'periods'
      let periodQuery = supabase
        .from('periods')
        .select('property_id, price')
        .in('property_id', propertyIds)
        .eq('status', 'Disponible'); 

      // 3. Lógica de Fechas (Core)
      const userSelectedDates = startDate && endDate;
      const isOffSeason = userSelectedDates && (endDate < SEASON_START_DATE || startDate > SEASON_END_DATE);

      // Si la fecha está DENTRO de la temporada, filtramos por períodos
      if (userSelectedDates && !isOffSeason) {
        periodQuery = periodQuery
          .lte('start_date', startDate)
          .gte('end_date', endDate);
      }
      
      const { data: periodsData, error: periodsError } = await periodQuery;
      if (periodsError) throw periodsError;

      // 4. Mapear precios y filtrar
      const availablePropertyIds = new Set();
      const minPriceMap = new Map(); // Mapa para guardar el precio más bajo

      for (const period of periodsData) {
        let periodPrice = 0;
        if (period.price) {
          periodPrice = parseInt(period.price.replace(/[^0-9]/g, ''), 10) || 0;
        }

        const passesMinPrice = !minPrice || (periodPrice > 0 && periodPrice >= minPrice);
        const passesMaxPrice = !maxPrice || (periodPrice > 0 && periodPrice <= maxPrice);
        
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
      let finalResults = propertiesData
        .map(p => ({
          ...p,
          // Inyectar el precio mínimo (NO pro-rata)
          min_rental_price: minPriceMap.get(p.property_id) || null
        }));

      // --- ¡LÓGICA "NO DISPONIBLE" CORREGIDA! ---
      if (userSelectedDates && !isOffSeason) {
         // Si el usuario seleccionó fechas en temporada,
         // filtramos la lista de propiedades y mostramos SOLO las que tienen disponibilidad.
         finalResults = finalResults.filter(p => availablePropertyIds.has(p.property_id));
      }
      // Si no hay fechas (Default) o es Fuera de Temporada (isOffSeason),
      // mostramos TODAS las propiedades (Arelauquen, etc.).

      // 6. Ordenar por Precio
      if (sortBy === 'price_asc') {
        finalResults.sort((a, b) => (a.min_rental_price || 9999999) - (b.min_rental_price || 9999999));
      } else if (sortBy === 'price_desc') {
        finalResults.sort((a, b) => (b.min_rental_price || 0) - (a.min_rental_price || 0));
      }

      return res.status(200).json({ status: 'OK', count: finalResults.length, results: finalResults });
    
    } 
    
    // --- Lógica de Venta o Alquiler Anual ---
    else {
      
      if (operacion === 'venta') {
        query = query.contains('category_ids', [CATEGORY_IDS.VENTA]);
        if (minPrice) query = query.gte('price', parseInt(minPrice, 10));
        if (maxPrice) query = query.lte('price', parseInt(maxPrice, 10));
        if (sortBy === 'price_asc') query = query.order('price', { ascending: true, nullsFirst: false });
        if (sortBy === 'price_desc') query = query.order('price', { ascending: false, nullsFirst: false });

      } else if (operacion === 'alquiler_anual') {
        query = query.or(`category_ids.cs.{${CATEGORY_IDS.ALQUILER_ANUAL}}, category_ids.cs.{${CATEGORY_IDS.ALQUILER_ANUAL_AMUEBLADO}}`);
        if (minPrice) query = query.gte('es_property_price_ars', parseInt(minPrice, 10));
        if (maxPrice) query = query.lte('es_property_price_ars', parseInt(maxPrice, 10));
        if (sortBy === 'price_asc') query = query.order('es_property_price_ars', { ascending: true, nullsFirst: false });
        if (sortBy === 'price_desc') query = query.order('es_property_price_ars', { ascending: false, nullsFirst: false });
      }
      
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
      
      return res.status(200).json({ status: 'OK', count: data.length, results: data });
    }

  } catch (error) {
    console.error('Error en API Search:', error.message);
    res.status(500).json({ status: 'Error', error: error.message });
  }
}