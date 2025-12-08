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

// --- MAPEO LITERAL (VALIDADO CON DIAGNÓSTICO) ---
const EXACT_PERIOD_NAMES = {
  'Navidad': 'Navidad del 19 al 26/12/25',
  'Año Nuevo': 'Año Nuevo 26/12/25 al 2/1/26',
  'Año Nuevo Combinado': 'Año Nuevo c/1er q de enero del 30/12/25 al 15/1/26', // VALIDADO: coincide_exacto = true
  'Enero 1ra': 'Ene 1er q del 2 al 15/1/26',
  'Enero 2da': 'Ene 2da q del 16 al 31/1/26',
  'Febrero 1ra': 'Feb 1er q c/CARNAVAL del 1 al 17/2/26',
  'Febrero 2da': 'Feb 2da q del 18/2/26 al 1/3/26'
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

  // 1. Query Base
  let query = supabase.from('properties').select('*');
  
  // Filtro de Estado: Activa (158) o Sin estado definido
  query = query.or(`status_ids.cs.{${STATUS_ID_ACTIVA}},status_ids.eq.{}`);

  // 2. Filtros Básicos
  if (searchText) query = query.textSearch('fts', formatFTSQuery(searchText), { config: 'spanish' });
  if (tipo) query = query.contains('type_ids', [TYPE_IDS[tipo.toUpperCase()]]);
  
  // 3. Operación y Categoría
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

  // 4. Filtros Específicos
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

  // --- 5. LOGICA DE PERIODOS (CRÍTICO: TEXTO EXACTO) ---
  let finalResults = props;

  if (operacion === 'alquiler_temporal' && !showOtherDates) {
      const propIds = props.map(p => p.property_id);
      
      const { data: periods } = await supabase
          .from('periods')
          .select('*')
          .in('property_id', propIds)
          .eq('status', 'Disponible');

      // Obtenemos el nombre EXACTO de la DB
      const targetExactName = selectedPeriod ? EXACT_PERIOD_NAMES[selectedPeriod] : null;
      
      const availableIds = new Set();
      const periodInfoMap = new Map();
      const minPriceMap = new Map();

      (periods || []).forEach(p => {
          let price = 0;
          if (p.price) price = parseInt(p.price.toString().replace(/\D/g, '')) || 0;

          // Mínimo Global
          if (price > 0 && (!minPriceMap.has(p.property_id) || price < minPriceMap.get(p.property_id))) {
              minPriceMap.set(p.property_id, price);
          }

          // COINCIDENCIA EXACTA (Validada por diagnóstico)
          let isMatch = false;
          if (targetExactName) {
              if (p.period_name === targetExactName) { // IGUALDAD STRICTA
                  isMatch = true;
              }
          } else {
              isMatch = true;
          }

          if (isMatch) {
              availableIds.add(p.property_id);
              periodInfoMap.set(p.property_id, {
                  price: price,
                  name: p.period_name
              });
          }
      });

      // Filtrado Final
      finalResults = props.map(p => ({
          ...p,
          min_rental_price: minPriceMap.get(p.property_id) || null,
          found_period_price: periodInfoMap.get(p.property_id)?.price || null,
          found_period_name: periodInfoMap.get(p.property_id)?.name || null
      })).filter(p => {
          // Si eligió periodo, TIENE que estar en la lista de encontrados
          if (targetExactName && !availableIds.has(p.property_id)) return false;

          // Filtro de Precio (si el usuario lo puso)
          const price = targetExactName ? p.found_period_price : p.min_rental_price;
          if (minPrice && (!price || price < parseInt(minPrice))) return false;
          if (maxPrice && (!price || price > parseInt(maxPrice))) return false;

          return true;
      });

      if (sortBy === 'price_asc') {
          finalResults.sort((a, b) => (a.found_period_price || 9e9) - (b.found_period_price || 9e9));
      }
  } 
  
  // --- VENTA / ANUAL ---
  else {
      finalResults = props.map(p => {
          let price = p.price;
          if (operacion.includes('alquiler') && !price && p.price_note) {
              price = parsePriceFromNote(p.price_note);
          }
          return { ...p, final_display_price: price };
      }).filter(p => {
          const pr = p.final_display_price || 0;
          if (minPrice && pr < parseInt(minPrice)) return false;
          if (maxPrice && pr > parseInt(maxPrice)) return false;
          return true;
      });

      if (sortBy === 'price_asc') {
          finalResults.sort((a, b) => (a.final_display_price || 9e9) - (b.final_display_price || 9e9));
      }
  }

  return { 
      count: finalResults.length, 
      results: finalResults.slice(offset, offset + limit) 
  };
}