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

// Esta función ahora puede ser llamada por la Web Y por el Chatbot
export async function searchProperties(filters) {
  const { 
    operacion, zona, tipo, 
    barrios, // Array
    pax, pax_or_more,
    pets, pool, bedrooms,
    minPrice, maxPrice, minMts, maxMts,
    startDate, endDate,
    selectedPeriod, 
    sortBy = 'default',
    searchText
  } = filters;

  let query = supabase.from('properties').select('*');
  query = query.or(`status_ids.cs.{${STATUS_ID_ACTIVA}},status_ids.eq.{}`);

  if (searchText) {
    const ftsQuery = formatFTSQuery(searchText);
    if (ftsQuery) {
      query = query.textSearch('fts', ftsQuery, { config: 'spanish' });
    }
  }

  // --- Lógica de Alquiler Temporal ---
  if (operacion === 'alquiler_temporal') {
    
    query = query.contains('category_ids', [CATEGORY_IDS.ALQUILER_TEMPORAL]);

    if (zona) query = query.eq('zona', zona);
    if (barrios && barrios.length > 0) query = query.in('barrio', barrios);
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
      return { count: 0, results: [] };
    }

    const { data: allPeriodsData, error: allPeriodsError } = await supabase
      .from('periods')
      .select('property_id, price')
      .in('property_id', propertyIds)
      .eq('status', 'Disponible');
    if (allPeriodsError) throw allPeriodsError;

    const minPriceMap = new Map();
    for (const period of allPeriodsData) {
      let periodPrice = 0;
      if (period.price) {
        if (typeof period.price === 'string' && (period.price.includes('$') || period.price.match(/^[\d\.,\s]+$/))) {
           periodPrice = parseInt(period.price.replace(/[^0-9]/g, ''), 10) || 0;
        }
      }
      if (periodPrice > 0) {
          if (!minPriceMap.has(period.property_id) || periodPrice < minPriceMap.get(period.property_id)) {
            minPriceMap.set(period.property_id, periodPrice);
          }
      }
    }
    
    let availablePropertyIds = new Set(propertyIds); 
    const periodDetailsMap = new Map();
    const userSelectedDates = startDate && endDate;
    const userSelectedPeriod = selectedPeriod;
    const isOffSeason = userSelectedDates && (endDate < SEASON_START_DATE || startDate > SEASON_END_DATE);

    if (userSelectedPeriod || (userSelectedDates && !isOffSeason)) {
      let filteredPeriodQuery = supabase
        .from('periods')
        .select('property_id, price, duration_days')
        .in('property_id', propertyIds)
        .eq('status', 'Disponible');
      
      if (userSelectedPeriod) {
        filteredPeriodQuery = filteredPeriodQuery.eq('period_name', selectedPeriod).not('price', 'is', null);
      } else {
         filteredPeriodQuery = filteredPeriodQuery.lte('start_date', startDate).gte('end_date', endDate);
      }
        
      const { data: filteredPeriodsData, error: filteredPeriodsError } = await filteredPeriodQuery;
      if (filteredPeriodsError) throw filteredPeriodsError;
      
      availablePropertyIds = new Set(); 
      for (const period of filteredPeriodsData) {
          availablePropertyIds.add(period.property_id);
          let periodPrice = null;
          if (period.price) {
            if (typeof period.price === 'string' && (period.price.includes('$') || period.price.match(/^[\d\.,\s]+$/))) {
               periodPrice = parseInt(period.price.replace(/[^0-9]/g, ''), 10) || null;
            }
          }
          periodDetailsMap.set(period.property_id, {
              price: periodPrice,
              duration: period.duration_days
          });
      }
    }

    let finalResults = propertiesData
      .map(p => ({
        ...p,
        min_rental_price: minPriceMap.get(p.property_id) || null,
        found_period_price: periodDetailsMap.get(p.property_id)?.price || null,
        found_period_duration: periodDetailsMap.get(p.property_id)?.duration || null
      }))
      .filter(p => { 
          const price = p.min_rental_price;
          if (!minPrice && !maxPrice) return true; 
          const passesMinPrice = !minPrice || (price && price >= minPrice);
          const passesMaxPrice = !maxPrice || (price && price <= maxPrice);
          if ((minPrice || maxPrice) && !price) return false;
          return passesMinPrice && passesMaxPrice;
      });

    if (userSelectedPeriod || (userSelectedDates && !isOffSeason)) {
       finalResults = finalResults.filter(p => availablePropertyIds.has(p.property_id));
    }
    
    if (sortBy === 'price_asc') {
      const priceKey = userSelectedPeriod ? 'found_period_price' : 'min_rental_price';
      finalResults.sort((a, b) => (a[priceKey] || 9999999) - (b[priceKey] || 9999999));
    } else if (sortBy === 'price_desc') {
      const priceKey = userSelectedPeriod ? 'found_period_price' : 'min_rental_price';
      finalResults.sort((a, b) => (b[priceKey] || 0) - (a[priceKey] || 0));
    }

    return { count: finalResults.length, results: finalResults };
  
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
    if (barrios && barrios.length > 0) query = query.in('barrio', barrios);
    if (tipo === 'casa') query = query.contains('type_ids', [TYPE_IDS.CASA]);
    if (tipo === 'departamento') query = query.contains('type_ids', [TYPE_IDS.DEPARTAMENTO]);
    if (tipo === 'lote') query = query.contains('type_ids', [TYPE_IDS.LOTE]);
    if (pool) query = query.eq('tiene_piscina', true);
    if (bedrooms) query = query.gte('bedrooms', parseInt(bedrooms, 10));
    if (minMts) query = query.gte('mts_cubiertos', parseInt(minMts, 10));
    if (maxMts) query = query.lte('mts_cubiertos', parseInt(maxMts, 10));
    
    const { data, error } = await query;
    if (error) throw error;
    
    return { count: data.length, results: data };
  }
}