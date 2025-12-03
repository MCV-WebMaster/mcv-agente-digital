import { supabase } from '@/lib/supabaseClient';

const CATEGORY_IDS = {
  VENTA: 198,
  ALQUILER_TEMPORAL: 196,     // General (GBA)
  ALQUILER_TEMPORAL_VERANO: 197, // Verano (Costa)
  ALQUILER_ANUAL: 194,
  ALQUILER_ANUAL_AMUEBLADO: 193,
};

const TYPE_IDS = {
  CASA: 162, DEPARTAMENTO: 163, DEPOSITO: 164, DUPLEX: 165,
  HOTEL: 348, LOCAL: 166, LOTE: 167, PH: 269
};
const STATUS_ID_ACTIVA = 158;

const SEASON_START_DATE = '2025-12-19';
const SEASON_END_DATE = '2026-03-01';

function formatFTSQuery(text) {
  if (!text) return null;
  return text.trim().split(' ').filter(Boolean).join(' & ');
}

function parsePriceFromNote(note) {
    if (!note || typeof note !== 'string') return 0;
    // Busca números con puntos o comas después de símbolos de moneda
    const priceRegex = /(?:u\$s|usd|\$|ARS|ar)\s*([\d\.,]+)/i;
    const match = note.match(priceRegex);
    if (match) {
        // Elimina puntos y deja solo números
        const cleanNumberStr = match[1].replace(/[\.,]/g, ''); 
        const priceInt = parseInt(cleanNumberStr, 10);
        return (!isNaN(priceInt) && priceInt > 0) ? priceInt : 0;
    }
    return 0;
}

export async function searchProperties(filters) {
  const { 
    operacion, zona, tipo, barrios, pax, pax_or_more,
    pets, pool, bedrooms, bedrooms_or_more,
    minPrice, maxPrice, minMts, maxMts,
    startDate, endDate, selectedPeriod, 
    sortBy = 'default', searchText, showOtherDates,
    limit = 100, offset = 0
  } = filters;

  let query = supabase.from('properties').select('*');
  query = query.or(`status_ids.cs.{${STATUS_ID_ACTIVA}},status_ids.eq.{}`);

  if (searchText) {
    const ftsQuery = formatFTSQuery(searchText);
    if (ftsQuery) query = query.textSearch('fts', ftsQuery, { config: 'spanish' });
  }

  if (tipo) {
      const typeId = TYPE_IDS[tipo.toUpperCase()];
      if (typeId) query = query.contains('type_ids', [typeId]);
  }

  // --- LÓGICA DE OPERACIÓN ---
  // ALQUILER TEMPORAL
  if (operacion === 'alquiler_temporal') {
    const isSearchingInHighSeason = selectedPeriod || (startDate && endDate && !(endDate < SEASON_START_DATE || startDate > SEASON_END_DATE));
    const hasDateSelected = selectedPeriod || startDate || endDate;

    // Lógica de Categoría (Costa vs GBA/Resto)
    if (showOtherDates) {
        query = query.contains('category_ids', [CATEGORY_IDS.ALQUILER_TEMPORAL]);
    } else if (isSearchingInHighSeason || !hasDateSelected) {
        query = query.contains('category_ids', [CATEGORY_IDS.ALQUILER_TEMPORAL_VERANO]);
    }

    if (zona) query = query.eq('zona', zona);
    if (barrios && barrios.length > 0) query = query.in('barrio', barrios);
    if (pool) query = query.eq('tiene_piscina', true);
    if (pets) query = query.eq('acepta_mascota', true);
    
    if (bedrooms) {
        const bNum = parseInt(bedrooms);
        query = bedrooms_or_more ? query.gte('bedrooms', bNum) : query.eq('bedrooms', bNum);
    }
    if (pax) {
        const pNum = parseInt(pax);
        query = pax_or_more ? query.gte('pax', pNum) : query.eq('pax', pNum);
    }
    
    const { data: propertiesData, error } = await query;
    if (error) throw error;
    if (!propertiesData || propertiesData.length === 0) return { count: 0, results: [] };

    const propertyIds = propertiesData.map(p => p.property_id);

    // Traer periodos para precios de temporada
    const { data: periodsData } = await supabase
      .from('periods')
      .select('*')
      .in('property_id', propertyIds)
      .eq('status', 'Disponible');

    const periodDetailsMap = new Map();
    const availableIds = new Set();
    
    // Si es "Otras Fechas" (GBA/Resto), no usamos la tabla periods para disponibilidad estricta
    // Usamos price_note
    const usePeriodsTable = !showOtherDates;

    periodsData?.forEach(period => {
        // Precio del periodo
        let pPrice = 0;
        if (period.price) pPrice = parseInt(period.price.toString().replace(/\D/g, ''), 10) || 0;
        
        if (usePeriodsTable && selectedPeriod) {
            if (period.period_name === selectedPeriod && pPrice > 0) {
                availableIds.add(period.property_id);
                periodDetailsMap.set(period.property_id, { price: pPrice, name: period.period_name });
            }
        }
    });

    let finalResults = propertiesData.map(p => {
        let finalPrice = 0;
        let finalSource = '';

        if (usePeriodsTable && selectedPeriod) {
             // Precio de Temporada (Tabla Periods)
             finalPrice = periodDetailsMap.get(p.property_id)?.price || 0;
             finalSource = 'period';
        } else {
             // Precio General (Nota o Base)
             if (p.price_note) {
                 finalPrice = parsePriceFromNote(p.price_note);
                 finalSource = 'note';
             } else {
                 // Fallback a precio base si existe
                 finalPrice = p.price || 0;
                 finalSource = 'base';
             }
        }

        return {
            ...p,
            final_display_price: finalPrice,
            price_source: finalSource
        };
    }).filter(p => {
        // Filtro Disponibilidad (Solo si es Temporada)
        if (usePeriodsTable && selectedPeriod && !availableIds.has(p.property_id)) return false;

        // Filtro Precio
        const price = p.final_display_price;
        if (!price) return false; // Si no hay precio, no se muestra (salvo que se quiera "Consultar")
        
        if (minPrice && price < parseInt(minPrice)) return false;
        if (maxPrice && price > parseInt(maxPrice)) return false;

        return true;
    });

    // Ordenar
    if (sortBy === 'price_asc') finalResults.sort((a, b) => (a.final_display_price || 999999) - (b.final_display_price || 999999));
    
    const totalCount = finalResults.length;
    const paginated = finalResults.slice(offset, offset + limit);

    return { count: totalCount, results: paginated };
  } 
  
  // --- VENTA / ANUAL ---
  else {
    if (operacion === 'venta') {
        query = query.contains('category_ids', [CATEGORY_IDS.VENTA]);
    } else {
        query = query.or(`category_ids.cs.{${CATEGORY_IDS.ALQUILER_ANUAL}}, category_ids.cs.{${CATEGORY_IDS.ALQUILER_ANUAL_AMUEBLADO}}`);
    }
    
    if (zona) query = query.eq('zona', zona);
    if (barrios && barrios.length > 0) query = query.in('barrio', barrios);
    if (pool) query = query.eq('tiene_piscina', true);
    if (bedrooms) {
        const bNum = parseInt(bedrooms);
        query = bedrooms_or_more ? query.gte('bedrooms', bNum) : query.eq('bedrooms', bNum);
    }
    if (minMts) query = query.gte('mts_cubiertos', parseInt(minMts));
    
    const { data, error } = await query;
    if (error) throw error;

    // Procesamiento de precios
    let processedData = data.map(p => {
        let finalPrice = p.price; // Venta usa precio base
        if (operacion.includes('alquiler') && !finalPrice && p.price_note) {
            finalPrice = parsePriceFromNote(p.price_note); // Anual usa nota
        }
        return { ...p, final_display_price: finalPrice };
    });

    // Filtro Precio
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
    const paginated = processedData.slice(offset, offset + limit);
    
    return { count: totalCount, results: paginated };
  }
}