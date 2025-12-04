import { supabase } from '@/lib/supabaseClient';

// --- CONSTANTES DE NEGOCIO ---
const CATEGORY_IDS = {
  VENTA: 198,
  ALQUILER_TEMPORAL: 196,     // General / Fuera de Temporada
  ALQUILER_TEMPORAL_VERANO: 197, // Verano / Alta Temporada
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

// --- HELPERS ---
function formatFTSQuery(text) {
  if (!text) return null;
  return text.trim().split(' ').filter(Boolean).join(' & ');
}

// Parser vital para GBA Sur (precios en notas)
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
    showOtherDates, // Flag crítico para diferenciar categorías
    limit = 100,    // Paginación
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

  // 3. Filtros de Tipo (Mapeo explícito)
  if (tipo) {
      const typeId = TYPE_IDS[tipo.toUpperCase()];
      if (typeId) query = query.contains('type_ids', [typeId]);
  }

  // 4. Lógica de Operación
  // --- ALQUILER TEMPORAL ---
  if (operacion === 'alquiler_temporal') {
    const isSearchingInHighSeason = selectedPeriod || (startDate && endDate && !(endDate < SEASON_START_DATE || startDate > SEASON_END_DATE));
    const hasDateSelected = selectedPeriod || startDate || endDate;

    // Lógica A: Categorías Estrictas
    if (showOtherDates) {
        // Si es "Otras Fechas", busca SOLO General (196)
        query = query.contains('category_ids', [CATEGORY_IDS.ALQUILER_TEMPORAL]);
    } else if (isSearchingInHighSeason || !hasDateSelected) {
        // Si es Temporada o Default, busca SOLO Verano (197)
        query = query.contains('category_ids', [CATEGORY_IDS.ALQUILER_TEMPORAL_VERANO]);
    }

    // Filtros comunes
    if (zona) query = query.eq('zona', zona);
    if (barrios && barrios.length > 0) query = query.in('barrio', barrios);
    if (pool === true) query = query.eq('tiene_piscina', true);
    if (pets === true) query = query.eq('acepta_mascota', true);
    
    // Lógica C: Dormitorios
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
    
    // Ejecución de Query
    const { data: propertiesData, error: propertiesError } = await query;
    if (propertiesError) throw propertiesError;
    
    if (!propertiesData || propertiesData.length === 0) return { count: 0, results: [] };

    const propertyIds = propertiesData.map(p => p.property_id);

    // 5. Precios y Disponibilidad (Tabla Periods)
    const { data: allPeriodsData, error: allPeriodsError } = await supabase
      .from('periods')
      .select('*')
      .in('property_id', propertyIds)
      .eq('status', 'Disponible');
    
    if (allPeriodsError) throw allPeriodsError;

    // Mapa de precios
    const minPriceMap = new Map();
    const periodDetailsMap = new Map();
    const availablePropertyIds = new Set();

    const userSelectedPeriod = selectedPeriod;
    // Si es "Otras fechas", NO filtramos disponibilidad estricta (es A Consultar)
    const shouldCheckAvailability = !showOtherDates; 

    for (const period of allPeriodsData || []) {
        let periodPrice = 0;
        if (period.price) {
            const cleanPrice = period.price.toString().replace(/\D/g, '');
            periodPrice = parseInt(cleanPrice, 10) || 0;
        }

        // Precio "Desde"
        if (periodPrice > 0) {
            if (!minPriceMap.has(period.property_id) || periodPrice < minPriceMap.get(period.property_id)) {
                minPriceMap.set(period.property_id, periodPrice);
            }
        }

        // Coincidencia de Periodo Específico
        let isMatch = false;
        if (userSelectedPeriod) {
            if (period.period_name === userSelectedPeriod) isMatch = true;
        } else {
            isMatch = true; // Si no hay periodo seleccionado, cuenta como disponible
        }

        if (isMatch && periodPrice > 0) {
            availablePropertyIds.add(period.property_id);
            // Guardamos el detalle para mostrar este precio específico
            periodDetailsMap.set(period.property_id, {
                price: periodPrice,
                duration: period.duration_days,
                name: period.period_name
            });
        }
    }

    // 6. Filtrado Final en Memoria
    let finalResults = propertiesData.map(p => ({
        ...p,
        min_rental_price: minPriceMap.get(p.property_id) || null,
        found_period_price: periodDetailsMap.get(p.property_id)?.price || null,
        found_period_name: periodDetailsMap.get(p.property_id)?.name || null,
    })).filter(p => {
        // Filtro de Disponibilidad
        if (shouldCheckAvailability && userSelectedPeriod) {
            if (!availablePropertyIds.has(p.property_id)) return false;
        }

        // Filtro de Precio (Manual)
        // Priorizamos el precio del periodo encontrado, sino el precio base
        const priceToCheck = (userSelectedPeriod && p.found_period_price) ? p.found_period_price : p.min_rental_price;
        
        if (minPrice && (!priceToCheck || priceToCheck < parseInt(minPrice))) return false;
        if (maxPrice && (!priceToCheck || priceToCheck > parseInt(maxPrice))) return false;

        return true;
    });

    // Ordenamiento
    if (sortBy === 'price_asc') {
        finalResults.sort((a, b) => (a.found_period_price || a.min_rental_price || 999999) - (b.found_period_price || b.min_rental_price || 999999));
    } else if (sortBy === 'price_desc') {
        finalResults.sort((a, b) => (b.found_period_price || b.min_rental_price || 0) - (a.found_period_price || a.min_rental_price || 0));
    }

    // PAGINACIÓN REAL
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
      // Alquiler Anual
      query = query.or(`category_ids.cs.{${CATEGORY_IDS.ALQUILER_ANUAL}}, category_ids.cs.{${CATEGORY_IDS.ALQUILER_ANUAL_AMUEBLADO}}`);
    }
    
    if (zona) query = query.eq('zona', zona);
    if (barrios && barrios.length > 0) query = query.in('barrio', barrios);
    if (pool === true) query = query.eq('tiene_piscina', true);

    // Lógica C: Dormitorios
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

    // Procesamiento de precios especiales (GBA Sur - Nota de precio)
    let processedData = data.map(p => {
        let finalPrice = p.price;
        if (operacion.includes('alquiler')) {
            finalPrice = p.es_property_price_ars; // Intentamos precio ARS primero
            if (!finalPrice && p.price_note) {
                finalPrice = parsePriceFromNote(p.price_note); // Si no, parseamos la nota
            }
        }
        return { ...p, final_display_price: finalPrice };
    });
    
    // Filtro manual de precio si usamos la nota
    if (minPrice || maxPrice) {
        processedData = processedData.filter(p => {
            const price = p.final_display_price || 0;
            if (minPrice && price < parseInt(minPrice)) return false;
            if (maxPrice && price > parseInt(maxPrice)) return false;
            return true;
        });
    }
    
    // Ordenar
    if (sortBy === 'price_asc') processedData.sort((a, b) => (a.final_display_price || 999999) - (b.final_display_price || 999999));

    const totalCount = processedData.length;
    const paginatedResults = processedData.slice(offset, offset + limit);
    
    return { count: totalCount, results: paginatedResults };
  }
}