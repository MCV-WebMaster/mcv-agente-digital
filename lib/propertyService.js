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

// --- HELPER DE NORMALIZACIÓN ---
// Convierte "Año Nuevo  c/1er" en "anonuevoc/1er" para comparar sin errores
function normalize(str) {
    if (!str) return '';
    return str.toLowerCase()
        .replace(/\s+/g, '') // Quita espacios
        .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Quita tildes
}

// --- MAPEO DE HUELLAS DIGITALES ---
// En lugar de texto completo, usamos fragmentos únicos que identifican al periodo
const PERIOD_KEY_FRAGMENTS = {
    'Navidad': 'navidad',
    'Año Nuevo': 'anonuevo26', // Coincide con "Año Nuevo 26..."
    'Año Nuevo Combinado': '30/12', // ÚNICO que tiene 30/12
    'Enero 1ra': 'ene1erq',
    'Enero 2da': 'ene2daq',
    'Febrero 1ra': 'feb1erq',
    'Febrero 2da': 'feb2daq'
};

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
  query = query.or(`status_ids.cs.{${STATUS_ID_ACTIVA}},status_ids.eq.{}`);

  // 2. Filtros Básicos
  if (searchText) query = query.textSearch('fts', searchText.trim().split(' ').join(' & '), { config: 'spanish' });
  if (tipo) query = query.contains('type_ids', [TYPE_IDS[tipo.toUpperCase()]]);
  
  if (operacion === 'alquiler_temporal') {
      if (showOtherDates) {
          query = query.contains('category_ids', [CATEGORY_IDS.ALQUILER_TEMPORAL]);
      } else {
          // Asumimos verano si no dice "otras fechas"
          query = query.contains('category_ids', [CATEGORY_IDS.ALQUILER_TEMPORAL_VERANO]);
      }
  } else if (operacion === 'venta') {
      query = query.contains('category_ids', [CATEGORY_IDS.VENTA]);
  } else {
      query = query.or(`category_ids.cs.{${CATEGORY_IDS.ALQUILER_ANUAL}},category_ids.cs.{${CATEGORY_IDS.ALQUILER_ANUAL_AMUEBLADO}}`);
  }

  if (zona) query = query.eq('zona', zona);
  if (barrios?.length > 0) query = query.in('barrio', barrios);
  if (pool) query = query.eq('tiene_piscina', true);
  if (pets) query = query.eq('acepta_mascota', true);

  if (tipo !== 'lote') {
      if (bedrooms) query = bedrooms_or_more ? query.gte('bedrooms', bedrooms) : query.eq('bedrooms', bedrooms);
      if (pax) query = pax_or_more ? query.gte('pax', pax) : query.eq('pax', pax);
  }
  if (minMts) query = query.gte('mts_cubiertos', minMts);

  // Ejecutar Query
  const { data: props, error } = await query;
  if (error) throw error;
  if (!props?.length) return { count: 0, results: [] };

  // --- LOGICA DE PERIODOS (SOLO ALQUILER TEMPORAL) ---
  let finalResults = props;

  if (operacion === 'alquiler_temporal' && !showOtherDates) {
      const propIds = props.map(p => p.property_id);
      const { data: periods } = await supabase
          .from('periods')
          .select('*')
          .in('property_id', propIds)
          .eq('status', 'Disponible');

      // Detectar fragmento clave a buscar
      const targetFragment = selectedPeriod ? PERIOD_KEY_FRAGMENTS[selectedPeriod] : null;
      
      const availableIds = new Set();
      const periodMap = new Map();
      const minPriceMap = new Map();

      (periods || []).forEach(p => {
          // Precio
          let price = 0;
          if (p.price) price = parseInt(p.price.toString().replace(/\D/g, '')) || 0;
          
          // Guardar mínimo global
          if (price > 0 && (!minPriceMap.has(p.property_id) || price < minPriceMap.get(p.property_id))) {
              minPriceMap.set(p.property_id, price);
          }

          // Chequeo de coincidencia
          if (targetFragment) {
              // Normalizamos ambos lados para comparar
              const pNameNorm = normalize(p.period_name);
              // Buscamos si el nombre normalizado de la DB contiene el fragmento clave
              if (pNameNorm.includes(targetFragment)) {
                  availableIds.add(p.property_id);
                  periodMap.set(p.property_id, { price, name: p.period_name });
              }
          }
      });

      finalResults = props.map(p => ({
          ...p,
          min_rental_price: minPriceMap.get(p.property_id) || null,
          found_period_price: periodMap.get(p.property_id)?.price || null,
          found_period_name: periodMap.get(p.property_id)?.name || null
      })).filter(p => {
          // 1. Disponibilidad: Si hay periodo seleccionado, TIENE que estar en la lista de encontrados
          if (targetFragment && !availableIds.has(p.property_id)) return false;

          // 2. Filtro Precio
          const price = targetFragment ? p.found_period_price : p.min_rental_price;
          // Si precio es 0 (Consultar) y usuario no filtra precio, pasa.
          if (minPrice && (!price || price < parseInt(minPrice))) return false;
          if (maxPrice && (!price || price > parseInt(maxPrice))) return false;
          return true;
      });
      
      // Ordenamiento Temporal
      if (sortBy === 'price_asc') finalResults.sort((a, b) => (a.found_period_price || 9e9) - (b.found_period_price || 9e9));
  } else {
      // Lógica Venta/Anual (Precios)
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