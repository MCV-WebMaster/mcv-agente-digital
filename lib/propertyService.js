import { supabase } from '@/lib/supabaseClient';

const CATEGORY_IDS = {
  VENTA: 198,
  ALQUILER_TEMPORAL: 196,
  ALQUILER_TEMPORAL_VERANO: 197,
  ALQUILER_ANUAL: 194,
  ALQUILER_ANUAL_AMUEBLADO: 193,
};

const TYPE_IDS = {
  CASA: 162,
  DEPARTAMENTO: 163,
  DEPOSITO: 164,
  DUPLEX: 165,
  HOTEL: 348,
  LOCAL: 166,
  LOTE: 167,
  PH: 269
};
const STATUS_ID_ACTIVA = 158;

const SEASON_START_DATE = '2025-12-19';
const SEASON_END_DATE = '2026-03-01';

function formatFTSQuery(text) {
  if (!text) return null;
  return text.trim().split(' ').filter(Boolean).join(' & ');
}

export async function searchProperties(filters) {
  const { 
    operacion, zona, tipo, 
    barrios, pax, pax_or_more,
    pets, pool, bedrooms, bedrooms_or_more,
    minPrice, maxPrice, minMts, maxMts,
    startDate, endDate,
    selectedPeriod, 
    sortBy = 'default',
    searchText,
    showOtherDates,
    limit = 100, 
    offset = 0
  } = filters;

  let query = supabase.from('properties').select('*');
  query = query.or(`status_ids.cs.{${STATUS_ID_ACTIVA}},status_ids.eq.{}`);

  if (searchText) {
    const ftsQuery = formatFTSQuery(searchText);
    if (ftsQuery) {
      query = query.textSearch('fts', ftsQuery, { config: 'spanish' });
    }
  }

  // --- FILTROS DE TIPO ---
  if (tipo === 'casa') query = query.contains('type_ids', [TYPE_IDS.CASA]);
  if (tipo === 'departamento') query = query.contains('type_ids', [TYPE_IDS.DEPARTAMENTO]);
  if (tipo === 'lote') query = query.contains('type_ids', [TYPE_IDS.LOTE]);
  if (tipo === 'local') query = query.contains('type_ids', [TYPE_IDS.LOCAL]);
  if (tipo === 'deposito') query = query.contains('type_ids', [TYPE_IDS.DEPOSITO]);
  if (tipo === 'duplex') query = query.contains('type_ids', [TYPE_IDS.DUPLEX]);
  if (tipo === 'ph') query = query.contains('type_ids', [TYPE_IDS.PH]);

  // --- ALQUILER TEMPORAL ---
  if (operacion === 'alquiler_temporal') {
    const isSearchingInHighSeason = selectedPeriod || (startDate && endDate && !(endDate < SEASON_START_DATE || startDate > SEASON_END_DATE));
    const hasDateSelected = selectedPeriod || startDate || endDate;

    if (showOtherDates) {
        query = query.contains('category_ids', [CATEGORY_IDS.ALQUILER_TEMPORAL]);
    } else if (isSearchingInHighSeason || !hasDateSelected) {
        query = query.contains('category_ids', [CATEGORY_IDS.ALQUILER_TEMPORAL_VERANO]);
    }

    if (zona) query = query.eq('zona', zona);
    if (barrios && barrios.length > 0) query = query.in('barrio', barrios);
    if (pool === true) query = query.eq('tiene_piscina', true);
    if (pets === true) query = query.eq('acepta_mascota', true);
    
    if (bedrooms) {
        const bedroomsNum = parseInt(bedrooms, 10);
        if (bedrooms_or_more === true) {
            query = query.gte('bedrooms', bedroomsNum);
        } else {
            query = query.eq('bedrooms', bedroomsNum);
        }
    }

    if (pax) {
      const paxNum = parseInt(pax, 10);
      query = pax_or_more ? query.gte('pax', paxNum) : query.eq('pax', paxNum);
    }
    
    let { data: propertiesData, error: propertiesError } = await query;
    if (propertiesError) throw propertiesError;
    
    const propertyIds = propertiesData.map(p => p.property_id);
    if (propertyIds.length === 0) return { count: 0, results: [] };

    // Precios base
    const { data: allPeriodsData } = await supabase
      .from('periods')
      .select('property_id, price')
      .in('property_id', propertyIds)
      .eq('status', 'Disponible');

    const minPriceMap = new Map();
    for (const period of allPeriodsData || []) {
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
    
    // Disponibilidad y Precio Específico
    let availablePropertyIds = new Set(propertyIds); 
    const periodDetailsMap = new Map();
    
    const userSelectedPeriod = selectedPeriod;
    const shouldCheckAvailability = !showOtherDates; // Si es otras fechas, no filtramos estricto

    if (shouldCheckAvailability && userSelectedPeriod) {
      let filteredPeriodQuery = supabase
        .from('periods')
        .select('property_id, price, duration_days, period_name')
        .in('property_id', propertyIds)
        .eq('status', 'Disponible');
      
      if (userSelectedPeriod) {
        filteredPeriodQuery = filteredPeriodQuery
          .in('period_name', [selectedPeriod])
          .not('price', 'is', null); 
      }
        
      const { data: filteredPeriodsData } = await filteredPeriodQuery;
      
      availablePropertyIds = new Set(); 
      for (const period of filteredPeriodsData || []) {
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

    let finalResults = propertiesData
      .map(p => ({
        ...p,
        min_rental_price: minPriceMap.get(p.property_id) || null,
        found_period_price: periodDetailsMap.get(p.property_id)?.price || null,
        found_period_name: periodDetailsMap.get(p.property_id)?.name || null
      }))
      .filter(p => { 
          if (showOtherDates) return true;
          const priceToFilter = userSelectedPeriod ? p.found_period_price : p.min_rental_price;
          
          if (!minPrice && !maxPrice) return true;
          if (!priceToFilter) return false;
          const passesMin = !minPrice || (priceToFilter >= minPrice);
          const passesMax = !maxPrice || (priceToFilter <= maxPrice);
          return passesMin && passesMax;
      });

    if (shouldCheckAvailability && userSelectedPeriod) {
       finalResults = finalResults.filter(p => availablePropertyIds.has(p.property_id));
    }
    
    // Ordenar
    if (sortBy === 'price_asc' || sortBy === 'default') {
      const priceKey = userSelectedPeriod ? 'found_period_price' : 'min_rental_price';
      finalResults.sort((a, b) => (a[priceKey] || 9999999) - (b[priceKey] || 9999999));
    }

    const totalCount = finalResults.length;
    const paginatedResults = finalResults.slice(offset, offset + limit);

    return { count: totalCount, results: paginatedResults };
  } 
  
  // --- VENTA / ANUAL ---
  else {
    if (operacion === 'venta') {
      query = query.contains('category_ids', [CATEGORY_IDS.VENTA]);
      if (minPrice) query = query.gte('price', parseInt(minPrice, 10));
      if (maxPrice) query = query.lte('price', parseInt(maxPrice, 10));
      query = query.order('price', { ascending: true, nullsFirst: false });
    } else {
      query = query.or(`category_ids.cs.{${CATEGORY_IDS.ALQUILER_ANUAL}}, category_ids.cs.{${CATEGORY_IDS.ALQUILER_ANUAL_AMUEBLADO}}`);
      if (minPrice) query = query.gte('es_property_price_ars', parseInt(minPrice, 10));
      if (maxPrice) query = query.lte('es_property_price_ars', parseInt(maxPrice, 10));
      query = query.order('es_property_price_ars', { ascending: true, nullsFirst: false });
    }
    
    if (zona) query = query.eq('zona', zona);
    if (barrios && barrios.length > 0) query = query.in('barrio', barrios);
    
    if (tipo === 'casa') query = query.contains('type_ids', [TYPE_IDS.CASA]);
    if (tipo === 'departamento') query = query.contains('type_ids', [TYPE_IDS.DEPARTAMENTO]);
    if (tipo === 'lote') query = query.contains('type_ids', [TYPE_IDS.LOTE]);
    if (tipo === 'local') query = query.contains('type_ids', [TYPE_IDS.LOCAL]); 
    if (tipo === 'deposito') query = query.contains('type_ids', [TYPE_IDS.DEPOSITO]);

    if (pool === true) query = query.eq('tiene_piscina', true);
    
    if (bedrooms) {
        const bedroomsNum = parseInt(bedrooms, 10);
        if (bedrooms_or_more === true) {
            query = query.gte('bedrooms', bedroomsNum);
        } else {
            query = query.eq('bedrooms', bedroomsNum); 
        }
    }
    if (minMts) query = query.gte('mts_cubiertos', parseInt(minMts, 10));
    
    const { data, error } = await query;
    if (error) throw error;

    const totalCount = data.length;
    const paginatedResults = data.slice(offset, offset + limit);
    
    return { count: totalCount, results: paginatedResults };
  }
}