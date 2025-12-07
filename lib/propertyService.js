import { supabase } from '@/lib/supabaseClient';

// --- CONSTANTES DE NEGOCIO ---
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

// --- DICCIONARIO DE TRADUCCIÓN (CRÍTICO) ---
const PERIOD_MAPPING = {
  'Navidad': 'navidad',
  'Año Nuevo': 'ano-nuevo',
  'Año Nuevo con 1ra Enero': 'enero-1ra-quincena',
  'Enero 1ra Quincena': 'enero-2da-quincena',
  'Enero 2da Quincena': 'febrero-1ra-quincena',
  'Febrero 1ra Quincena': 'febrero-2da-quincena', 
  'Febrero 2da Quincena': 'diciembre-2da-quincena'
};

// --- HELPERS ---
function formatFTSQuery(text) {
  if (!text) return null;
  return text.trim().split(' ').filter(Boolean).join(' & ');
}

function parsePriceFromNote(note) {
    if (!note || typeof note !== 'string') return 0;
    const priceRegex = /(?:u\$s|usd|\$|ARS|ar)\s*([\d\.,]+)/i;
    const match = note.match(priceRegex);
    if (match) {
        const cleanNumberStr = match[1].replace(/[\.,]/g, ''); 
        const priceInt = parseInt(cleanNumberStr, 10);
        if (!isNaN(priceInt) && priceInt > 0) {
            return priceInt;
        }
    }
    return 0;
}

// --- FUNCIÓN PRINCIPAL ---
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

  // 1. Query Base
  let query = supabase.from('properties').select('*');
  query = query.or(`status_ids.cs.{${STATUS_ID_ACTIVA}},status_ids.eq.{}`);

  // 2. Búsqueda por Texto
  if (searchText) {
    const ftsQuery = formatFTSQuery(searchText);
    if (ftsQuery) {
      query = query.textSearch('fts', ftsQuery, { config: 'spanish' });
    }
  }

  // 3. Filtros de Tipo
  if (tipo) {
      const typeId = TYPE_IDS[tipo.toUpperCase()];
      if (typeId) query = query.contains('type_ids', [typeId]);
  }

  // 4. Lógica de Operación
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
    
    // EXCEPCIÓN LOTE: No filtramos por dormitorios ni pax si es lote
    if (bedrooms && tipo !== 'lote') {
        const bedroomsNum = parseInt(bedrooms, 10);
        query = bedrooms_or_more ? query.gte('bedrooms', bedroomsNum) : query.eq('bedrooms', bedroomsNum);
    }
    if (pax && tipo !== 'lote') {
      const paxNum = parseInt(pax, 10);
      query = pax_or_more ? query.gte('pax', paxNum) : query.eq('pax', paxNum);
    }
    
    const { data: propertiesData, error: propertiesError } = await query;
    if (propertiesError) throw propertiesError;
    
    if (!propertiesData || propertiesData.length === 0) return { count: 0, results: [] };

    const propertyIds = propertiesData.map(p => p.property_id);

    // Precios y Disponibilidad
    const { data: allPeriodsData, error: allPeriodsError } = await supabase
      .from('periods')
      .select('*')
      .in('property_id', propertyIds)
      .eq('status', 'Disponible');
    
    if (allPeriodsError) throw allPeriodsError;

    const minPriceMap = new Map();
    const periodDetailsMap = new Map();
    const availablePropertyIds = new Set();

    const targetPeriodSlug = selectedPeriod ? PERIOD_MAPPING[selectedPeriod] : null;
    const shouldCheckAvailability = !showOtherDates; 

    for (const period of allPeriodsData || []) {
        let periodPrice = 0;
        if (period.price) {
            const cleanPrice = period.price.toString().replace(/\D/g, '');
            periodPrice = parseInt(cleanPrice, 10) || 0;
        }

        if (periodPrice > 0) {
            if (!minPriceMap.has(period.property_id) || periodPrice < minPriceMap.get(period.property_id)) {
                minPriceMap.set(period.property_id, periodPrice);
            }
        }

        // Lógica de Coincidencia (Inclusiva para arreglar el bug de Año Nuevo)
        let isMatch = false;
        if (targetPeriodSlug) {
            const dbName = period.period_name ? period.period_name.toLowerCase() : '';
            if (dbName.includes(targetPeriodSlug.toLowerCase())) {
                isMatch = true;
            }
        } else {
            isMatch = true;
        }

        if (isMatch) {
            availablePropertyIds.add(period.property_id);
            // Guardamos el detalle aunque el precio sea 0 (para mostrar "Consultar")
            periodDetailsMap.set(period.property_id, {
                price: periodPrice, // Puede ser 0
                duration: period.duration_days,
                name: period.period_name
            });
        }
    }

    let finalResults = propertiesData.map(p => ({
        ...p,
        min_rental_price: minPriceMap.get(p.property_id) || null,
        found_period_price: periodDetailsMap.get(p.property_id)?.price || null,
        found_period_name: periodDetailsMap.get(p.property_id)?.name || null,
    })).filter(p => {
        // 1. Filtro Disponibilidad
        if (shouldCheckAvailability && targetPeriodSlug) {
            if (!availablePropertyIds.has(p.property_id)) return false;
        }

        // 2. Filtro Precio
        const priceToCheck = (targetPeriodSlug && p.found_period_price) ? p.found_period_price : p.min_rental_price;
        
        if (minPrice && (!priceToCheck || priceToCheck < parseInt(minPrice))) return false;
        if (maxPrice && (!priceToCheck || priceToCheck > parseInt(maxPrice))) return false;

        return true;
    });

    if (sortBy === 'price_asc') {
        finalResults.sort((a, b) => (a.found_period_price || a.min_rental_price || 999999) - (b.found_period_price || b.min_rental_price || 999999));
    } else if (sortBy === 'price_desc') {
        finalResults.sort((a, b) => (b.found_period_price || b.min_rental_price || 0) - (a.found_period_price || a.min_rental_price || 0));
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
    }
    
    if (zona) query = query.eq('zona', zona);
    if (barrios && barrios.length > 0) query = query.in('barrio', barrios);
    if (pool === true) query = query.eq('tiene_piscina', true);

    if (bedrooms && tipo !== 'lote') {
        const bedroomsNum = parseInt(bedrooms, 10);
        query = bedrooms_or_more ? query.gte('bedrooms', bedroomsNum) : query.eq('bedrooms', bedroomsNum);
    }
    if (minMts) query = query.gte('mts_cubiertos', parseInt(minMts, 10));
    
    const { data, error } = await query;
    if (error) throw error;

    let processedData = data.map(p => {
        let finalPrice = p.price;
        if (operacion.includes('alquiler')) {
            finalPrice = p.es_property_price_ars; 
            if (!finalPrice && p.price_note) {
                finalPrice = parsePriceFromNote(p.price_note);
            }
        }
        return { ...p, final_display_price: finalPrice };
    });
    
    if (minPrice || maxPrice) {
        processedData = processedData.filter(p => {
            const price = p.final_display_price || 0;
            if (minPrice && price < parseInt(minPrice)) return false;
            if (maxPrice && price > parseInt(maxPrice)) return false;
            return true;
        });
    }
    
    if (sortBy === 'price_asc') processedData.sort((a, b) => (a.final_display_price || 999999) - (b.final_display_price || 999999));

    const totalCount = processedData.length;
    const paginatedResults = processedData.slice(offset, offset + limit);
    
    return { count: totalCount, results: paginatedResults };
  }
}