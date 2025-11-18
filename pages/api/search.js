import { supabase } from '@/lib/supabaseClient';

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

const SEASON_START_DATE = '2025-12-19';
const SEASON_END_DATE = '2026-03-01';

function formatFTSQuery(text) {
  if (!text) return null;
  return text.trim().split(' ').filter(Boolean).join(' & ');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { 
      operacion, zona, tipo, 
      barrios, pax, pax_or_more,
      pets, pool, bedrooms,
      minPrice, maxPrice, minMts, maxMts,
      startDate, endDate,
      selectedPeriod, 
      sortBy = 'default',
      searchText
    } = req.body;

    let query = supabase.from('properties').select('*');
    query = query.or(`status_ids.cs.{${STATUS_ID_ACTIVA}},status_ids.eq.{}`);

    if (searchText) {
      const ftsQuery = formatFTSQuery(searchText);
      if (ftsQuery) {
        query = query.textSearch('fts', ftsQuery, { config: 'spanish' });
      }
    }

    // --- ALQUILER TEMPORAL ---
    if (operacion === 'alquiler_temporal') {
      query = query.contains('category_ids', [CATEGORY_IDS.ALQUILER_TEMPORAL]);

      if (zona) query = query.eq('zona', zona);
      if (barrios && barrios.length > 0) query = query.in('barrio', barrios);
      if (tipo === 'casa') query = query.contains('type_ids', [TYPE_IDS.CASA]);
      if (pool) query = query.eq('tiene_piscina', true);
      
      // Lógica de Mascotas: Solo filtrar si es explícito True o False. Si es undefined, no filtrar.
      if (pets === true) query = query.eq('acepta_mascota', true);
      if (pets === false) query = query.eq('acepta_mascota', false);
      
      if (bedrooms) query = query.gte('bedrooms', parseInt(bedrooms, 10));

      if (pax) {
        const paxNum = parseInt(pax, 10);
        query = pax_or_more ? query.gte('pax', paxNum) : query.eq('pax', paxNum);
      }
      
      let { data: propertiesData, error: propertiesError } = await query;
      if (propertiesError) throw propertiesError;
      
      const propertyIds = propertiesData.map(p => p.property_id);
      if (propertyIds.length === 0) return res.status(200).json({ status: 'OK', count: 0, results: [] });

      // Buscar TODOS los períodos para calcular "desde"
      const { data: allPeriodsData, error: allPeriodsError } = await supabase
        .from('periods')
        .select('property_id, price')
        .in('property_id', propertyIds)
        .eq('status', 'Disponible');
      if (allPeriodsError) throw allPeriodsError;

      const minPriceMap = new Map();
      for (const period of allPeriodsData) {
        let periodPrice = 0;
        if (period.price && (typeof period.price === 'string') && (period.price.includes('$') || period.price.match(/^[\d\.,\s]+$/))) {
           periodPrice = parseInt(period.price.replace(/[^0-9]/g, ''), 10) || 0;
        }
        if (periodPrice > 0) {
            if (!minPriceMap.has(period.property_id) || periodPrice < minPriceMap.get(period.property_id)) {
              minPriceMap.set(period.property_id, periodPrice);
            }
        }
      }
      
      // Lógica de Fechas/Períodos
      let availablePropertyIds = new Set(propertyIds); 
      const periodDetailsMap = new Map();
      const userSelectedDates = startDate && endDate;
      const userSelectedPeriod = selectedPeriod;
      
      // Determinamos si estamos buscando DENTRO de la temporada alta
      // Si NO hay fechas, asumimos temporada alta para mostrar disponibilidad general
      // Si SÍ hay fechas, chequeamos si caen en el rango
      const isSearchingInHighSeason = userSelectedPeriod || (userSelectedDates && !(endDate < SEASON_START_DATE || startDate > SEASON_END_DATE));

      if (isSearchingInHighSeason) {
        let filteredPeriodQuery = supabase
          .from('periods')
          .select('property_id, price, duration_days, period_name')
          .in('property_id', propertyIds)
          .eq('status', 'Disponible');
        
        if (userSelectedPeriod) {
          const periodsToSearch = [selectedPeriod]; // (Ya no necesitamos RELATED_PERIODS complejo si usamos nombres exactos)
          filteredPeriodQuery = filteredPeriodQuery
            .in('period_name', periodsToSearch)
            .not('price', 'is', null); 
        } else if (userSelectedDates) {
           filteredPeriodQuery = filteredPeriodQuery.lte('start_date', startDate).gte('end_date', endDate);
        }
        // Si no hay fechas seleccionadas (vista general), NO filtramos por período, mostramos todas las disponibles "desde"
          
        // Ejecutar solo si hay un filtro de fecha activo
        if (userSelectedPeriod || userSelectedDates) {
            const { data: filteredPeriodsData, error: filteredPeriodsError } = await filteredPeriodQuery;
            if (filteredPeriodsError) throw filteredPeriodsError;
            
            availablePropertyIds = new Set(); 
            for (const period of filteredPeriodsData) {
                let periodPrice = 0;
                if (period.price && (typeof period.price === 'string') && (period.price.includes('$') || period.price.match(/^[\d\.,\s]+$/))) {
                   periodPrice = parseInt(period.price.replace(/[^0-9]/g, ''), 10) || 0;
                }
                if (userSelectedPeriod && periodPrice === 0) continue; 
    
                availablePropertyIds.add(period.property_id);
                
                periodDetailsMap.set(period.property_id, {
                    price: periodPrice > 0 ? periodPrice : null,
                    duration: period.duration_days,
                    name: period.period_name
                });
            }
        }
      } 
      // Si es FUERA de temporada (isSearchingInHighSeason = false), availablePropertyIds sigue teniendo TODAS las propiedades, que es lo correcto.

      let finalResults = propertiesData
        .map(p => ({
          ...p,
          min_rental_price: minPriceMap.get(p.property_id) || null,
          found_period_price: periodDetailsMap.get(p.property_id)?.price || null,
          found_period_duration: periodDetailsMap.get(p.property_id)?.duration || null,
          found_period_name: periodDetailsMap.get(p.property_id)?.name || null
        }))
        .filter(p => { 
            // Filtro de Rango de Precio
            // Si buscamos período específico, usamos ese precio. Si no, usamos el "desde".
            const priceToFilter = userSelectedPeriod ? p.found_period_price : p.min_rental_price;
            
            // Si es fuera de temporada, el precio es "Consultar" (null), así que NO filtramos por precio numérico
            if (!isSearchingInHighSeason) return true;

            if (!minPrice && !maxPrice) return true;
            const passesMinPrice = !minPrice || (priceToFilter && priceToFilter >= minPrice);
            const passesMaxPrice = !maxPrice || (priceToFilter && priceToFilter <= maxPrice);
            if ((minPrice || maxPrice) && !priceToFilter) return false;
            return passesMinPrice && passesMaxPrice;
        });

      // Filtro final de Disponibilidad
      if (isSearchingInHighSeason && (userSelectedPeriod || userSelectedDates)) {
         finalResults = finalResults.filter(p => availablePropertyIds.has(p.property_id));
      }
      
      if (sortBy === 'price_asc' || sortBy === 'default') {
        const priceKey = userSelectedPeriod ? 'found_period_price' : 'min_rental_price';
        finalResults.sort((a, b) => (a[priceKey] || 9999999) - (b[priceKey] || 9999999));
      }

      return res.status(200).json({ status: 'OK', count: finalResults.length, results: finalResults });
    } 
    
    // --- VENTA / ANUAL ---
    else {
      // (Código Venta/Anual sin cambios)
      if (operacion === 'venta') {
        query = query.contains('category_ids', [CATEGORY_IDS.VENTA]);
        if (minPrice) query = query.gte('price', parseInt(minPrice, 10));
        if (maxPrice) query = query.lte('price', parseInt(maxPrice, 10));
        if (sortBy === 'price_asc' || sortBy === 'default') query = query.order('price', { ascending: true, nullsFirst: false });
      } else if (operacion === 'alquiler_anual') {
        query = query.or(`category_ids.cs.{${CATEGORY_IDS.ALQUILER_ANUAL}}, category_ids.cs.{${CATEGORY_IDS.ALQUILER_ANUAL_AMUEBLADO}}`);
        if (minPrice) query = query.gte('es_property_price_ars', parseInt(minPrice, 10));
        if (maxPrice) query = query.lte('es_property_price_ars', parseInt(maxPrice, 10));
        if (sortBy === 'price_asc' || sortBy === 'default') query = query.order('es_property_price_ars', { ascending: true, nullsFirst: false });
      }
      
      if (zona) query = query.eq('zona', zona);
      if (barrios && barrios.length > 0) query = query.in('barrio', barrios);
      if (tipo === 'casa') query = query.contains('type_ids', [TYPE_IDS.CASA]);
      if (pool) query = query.eq('tiene_piscina', true);
      if (bedrooms) query = query.gte('bedrooms', parseInt(bedrooms, 10));
      if (minMts) query = query.gte('mts_cubiertos', parseInt(minMts, 10));
      
      const { data, error } = await query;
      if (error) throw error;
      
      return res.status(200).json({ status: 'OK', count: data.length, results: data });
    }

  } catch (error) {
    res.status(500).json({ status: 'Error', error: error.message });
  }
}