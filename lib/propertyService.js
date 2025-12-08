import { supabase } from '@/lib/supabaseClient';

const STATUS_ID_ACTIVA = 158;
const SEASON_START_DATE = '2025-12-19';
const SEASON_END_DATE = '2026-03-01';

const CATEGORY_IDS = {
  VENTA: 198,
  ALQUILER_TEMPORAL: 196,
  ALQUILER_TEMPORAL_VERANO: 197,
  ALQUILER_ANUAL: 194,
  ALQUILER_ANUAL_AMUEBLADO: 193,
};

const TYPE_IDS = {
  CASA: 162, DEPARTAMENTO: 163, DEPOSITO: 164, DUPLEX: 165,
  HOTEL: 348, LOCAL: 166, LOTE: 167, PH: 269
};

// --- MAPEO SQL (FRAGMENTOS ÚNICOS) ---
// Usamos fragmentos que identifican al periodo sin ambigüedad.
// El símbolo % es un comodín para la base de datos.
const PERIOD_SQL_FILTERS = {
  'Navidad': '%Navidad%',
  'Año Nuevo': '%26/12%',       // Único periodo que tiene 26/12
  'Año Nuevo Combinado': '%30/12%', // Único periodo que tiene 30/12
  'Enero 1ra': '%Ene 1er%',
  'Enero 2da': '%Ene 2da%',
  'Febrero 1ra': '%Feb 1er%',
  'Febrero 2da': '%Feb 2da%'
};

function formatFTSQuery(text) {
  if (!text) return null;
  return text.trim().split(' ').filter(Boolean).join(' & ');
}

function parsePriceFromNote(note) {
    if (!note || typeof note !== 'string') return 0;
    const match = note.match(/(?:u\$s|usd|\$|ARS|ar)\s*([\d\.,]+)/i);
    return match ? (parseInt(match[1].replace(/[\.,]/g, '')) || 0) : 0;
}

export async function searchProperties(filters) {
  const { 
    operacion, zona, tipo, barrios, pax, pax_or_more, pets, pool, 
    bedrooms, bedrooms_or_more, minPrice, maxPrice, minMts, 
    selectedPeriod, searchText, showOtherDates, 
    sortBy = 'default', limit = 100, offset = 0
  } = filters;

  // ---------------------------------------------------------
  // PASO 1: Identificar IDs de Propiedades por PERIODO (Si aplica)
  // ---------------------------------------------------------
  let validPropertyIds = null; // Null significa "todos"

  if (operacion === 'alquiler_temporal' && selectedPeriod && !showOtherDates) {
      const sqlTerm = PERIOD_SQL_FILTERS[selectedPeriod];
      
      if (sqlTerm) {
          // Consultamos DIRECTAMENTE a la tabla periods
          // "Dame los IDs de propiedades que tengan este periodo"
          const { data: matchingPeriods, error: pError } = await supabase
              .from('periods')
              .select('property_id')
              .ilike('period_name', sqlTerm) // ILIKE ignora mayúsculas
              .eq('status', 'Disponible'); // Aseguramos disponibilidad

          if (pError) throw pError;

          // Si no hay coincidencias en la DB, devolvemos vacío inmediatamente
          if (!matchingPeriods || matchingPeriods.length === 0) {
              return { count: 0, results: [] };
          }

          // Extraemos los IDs válidos
          validPropertyIds = matchingPeriods.map(p => p.property_id);
      }
  }

  // ---------------------------------------------------------
  // PASO 2: Query Principal de Propiedades
  // ---------------------------------------------------------
  let query = supabase.from('properties').select('*');
  
  // Filtro de Estado
  query = query.or(`status_ids.cs.{${STATUS_ID_ACTIVA}},status_ids.eq.{}`);

  // Si ya filtramos por periodo, aplicamos la restricción de IDs aquí
  if (validPropertyIds !== null) {
      query = query.in('property_id', validPropertyIds);
  }

  // Filtros de Texto y Tipo
  if (searchText) query = query.textSearch('fts', formatFTSQuery(searchText), { config: 'spanish' });
  if (tipo) query = query.contains('type_ids', [TYPE_IDS[tipo.toUpperCase()]]);
  
  // Categoría
  if (operacion === 'alquiler_temporal') {
      if (showOtherDates) {
          query = query.contains('category_ids', [CATEGORY_IDS.ALQUILER_TEMPORAL]);
      } else {
          query = query.contains('category_ids', [CATEGORY_IDS.ALQUILER_TEMPORAL_VERANO]);
      }
  } else if (operacion === 'venta') {
      query = query.contains('category_ids', [CATEGORY_IDS.VENTA]);
  } else {
      query = query.or(`category_ids.cs.{${CATEGORY_IDS.ALQUILER_ANUAL}},category_ids.cs.{${CATEGORY_IDS.ALQUILER_ANUAL_AMUEBLADO}}`);
  }

  // Filtros Específicos
  if (zona) query = query.eq('zona', zona);
  if (barrios?.length > 0) query = query.in('barrio', barrios);
  if (pool) query = query.eq('tiene_piscina', true);
  if (pets) query = query.eq('acepta_mascota', true);

  if (tipo !== 'lote') {
      if (bedrooms) {
          const bd = parseInt(bedrooms);
          query = bedrooms_or_more ? query.gte('bedrooms', bd) : query.eq('bedrooms', bd);
      }
      if (pax) {
          const px = parseInt(pax);
          query = pax_or_more ? query.gte('pax', px) : query.eq('pax', px);
      }
  }
  if (minMts) query = query.gte('mts_cubiertos', parseInt(minMts));

  // EJECUTAR QUERY PROPIEDADES
  const { data: props, error } = await query;
  if (error) throw error;
  if (!props?.length) return { count: 0, results: [] };

  // ---------------------------------------------------------
  // PASO 3: Enriquecer con Precios (Display)
  // ---------------------------------------------------------
  // Ya sabemos que las propiedades tienen el periodo (por el paso 1),
  // pero necesitamos el precio específico para mostrarlo.
  
  let finalResults = props;

  if (operacion === 'alquiler_temporal' && !showOtherDates) {
      const propIds = props.map(p => p.property_id);
      
      // Traemos los periodos para ponerle precio a la tarjeta
      const { data: periods } = await supabase
          .from('periods')
          .select('*')
          .in('property_id', propIds)
          .eq('status', 'Disponible');

      const sqlTerm = selectedPeriod ? PERIOD_SQL_FILTERS[selectedPeriod] : null;
      const periodMap = new Map();
      const minPriceMap = new Map();

      (periods || []).forEach(p => {
          let price = 0;
          if (p.price) price = parseInt(p.price.toString().replace(/\D/g, '')) || 0;

          // Precio mínimo global
          if (price > 0 && (!minPriceMap.has(p.property_id) || price < minPriceMap.get(p.property_id))) {
              minPriceMap.set(p.property_id, price);
          }

          // Si coincide con el filtro seleccionado, guardamos ESTE precio
          if (sqlTerm && p.period_name && p.period_name.toLowerCase().includes(sqlTerm.replace(/%/g, '').toLowerCase())) {
              periodMap.set(p.property_id, { price, name: p.period_name });
          }
      });

      finalResults = props.map(p => ({
          ...p,
          min_rental_price: minPriceMap.get(p.property_id) || null,
          found_period_price: periodMap.get(p.property_id)?.price || null,
          found_period_name: periodMap.get(p.property_id)?.name || null
      })).filter(p => {
          // Filtro de Precio Numérico (opcional)
          // Usamos el precio del periodo si existe, sino el mínimo
          const priceToCheck = (sqlTerm && p.found_period_price) ? p.found_period_price : p.min_rental_price;
          
          if (minPrice && (!priceToCheck || priceToCheck < parseInt(minPrice))) return false;
          if (maxPrice && (!priceToCheck || priceToCheck > parseInt(maxPrice))) return false;
          return true;
      });

      if (sortBy === 'price_asc') {
          finalResults.sort((a, b) => (a.found_period_price || 9e9) - (b.found_period_price || 9e9));
      }
  } 
  else {
      // Lógica Venta/Anual
      finalResults = props.map(p => {
          let price = p.price;
          if (operacion.includes('alquiler') && !price && p.price_note) price = parsePriceFromNote(p.price_note);
          return { ...p, final_display_price: price };
      }).filter(p => {
          const pr = p.final_display_price || 0;
          if (minPrice && pr < parseInt(minPrice)) return false;
          if (maxPrice && pr > parseInt(maxPrice)) return false;
          return true;
      });
      if (sortBy === 'price_asc') finalResults.sort((a, b) => (a.final_display_price || 9e9) - (b.final_display_price || 9e9));
  }

  return { count: finalResults.length, results: finalResults.slice(offset, offset + limit) };
}