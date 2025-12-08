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

// --- EL ADN DE LOS PERIODOS ---
// En lugar de comparar textos largos, buscamos la fecha numérica que hace único al periodo.
// Esto evita errores de tildes (Año vs Ano) o espacios dobles.
const PERIOD_DNA = {
  'Navidad': '19 al 26',
  'Año Nuevo': '26/12', // Del 26/12...
  'Año Nuevo Combinado': '30/12', // ÚNICO periodo que arranca el 30/12
  'Enero 1ra Quincena': '2 al 15',
  'Enero 2da Quincena': '16 al 31',
  'Febrero 1ra Quincena': '1 al 17', // Carnaval
  'Febrero 2da Quincena': '18/2'     // Del 18/2...
};

function formatFTSQuery(text) {
  if (!text) return null;
  return text.trim().split(' ').filter(Boolean).join(' & ');
}

function parsePriceFromNote(note) {
    if (!note || typeof note !== 'string') return 0;
    const match = note.match(/(?:u\$s|usd|\$|ARS|ar)\s*([\d\.,]+)/i);
    if (match) return parseInt(match[1].replace(/[\.,]/g, '')) || 0;
    return 0;
}

export async function searchProperties(filters) {
  const { 
    operacion, zona, tipo, barrios, pax, pax_or_more, pets, pool, 
    bedrooms, bedrooms_or_more, minPrice, maxPrice, minMts, 
    selectedPeriod, searchText, showOtherDates, 
    sortBy = 'default', limit = 100, offset = 0
  } = filters;

  // 1. Query Base (Propiedades Activas)
  let query = supabase.from('properties').select('*');
  query = query.or(`status_ids.cs.{${STATUS_ID_ACTIVA}},status_ids.eq.{}`);

  // 2. Filtros Generales
  if (searchText) {
      query = query.textSearch('fts', formatFTSQuery(searchText), { config: 'spanish' });
  }
  
  if (tipo) {
      query = query.contains('type_ids', [TYPE_IDS[tipo.toUpperCase()]]);
  }

  // 3. Operación
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

  // --- 5. LOGICA DE PERIODOS (CRÍTICO) ---
  let finalResults = props;

  if (operacion === 'alquiler_temporal' && !showOtherDates) {
      const propIds = props.map(p => p.property_id);
      
      // Traemos SOLO los periodos de estas propiedades
      const { data: periods } = await supabase
          .from('periods')
          .select('*')
          .in('property_id', propIds)
          .eq('status', 'Disponible');

      // Obtenemos el fragmento numérico único (ADN)
      const targetDNA = selectedPeriod ? PERIOD_DNA[selectedPeriod] : null;
      
      const availableIds = new Set();
      const periodInfoMap = new Map();
      const minPriceMap = new Map();

      (periods || []).forEach(p => {
          // Normalizar precio
          let price = 0;
          if (p.price) price = parseInt(p.price.toString().replace(/\D/g, '')) || 0;

          // Guardar precio mínimo global ("Desde")
          if (price > 0) {
              if (!minPriceMap.has(p.property_id) || price < minPriceMap.get(p.property_id)) {
                  minPriceMap.set(p.property_id, price);
              }
          }

          // COINCIDENCIA POR ADN (Includes)
          // Si el nombre en la DB contiene "30/12", es el combo. No falla.
          let isMatch = false;
          if (targetDNA) {
              if (p.period_name && p.period_name.includes(targetDNA)) {
                  isMatch = true;
              }
          } else {
              isMatch = true; // Si no seleccionó periodo, machea todo lo disponible
          }

          if (isMatch) {
              availableIds.add(p.property_id);
              periodInfoMap.set(p.property_id, {
                  price: price, // Puede ser 0
                  name: p.period_name
              });
          }
      });

      // Filtrado Final en JS
      finalResults = props.map(p => ({
          ...p,
          min_rental_price: minPriceMap.get(p.property_id) || null,
          found_period_price: periodInfoMap.get(p.property_id)?.price || null,
          found_period_name: periodInfoMap.get(p.property_id)?.name || null
      })).filter(p => {
          // A. Si hay periodo seleccionado, la propiedad TIENE que estar en availableIds
          if (targetDNA && !availableIds.has(p.property_id)) return false;

          // B. Filtro Precio
          const price = targetDNA ? p.found_period_price : p.min_rental_price;
          // Si el precio es 0 (Consultar) y no hay filtro de precio, PASA.
          if (minPrice && (!price || price < parseInt(minPrice))) return false;
          if (maxPrice && (!price || price > parseInt(maxPrice))) return false;

          return true;
      });

      // Ordenar
      if (sortBy === 'price_asc') {
          finalResults.sort((a, b) => (a.found_period_price || a.min_rental_price || 9e9) - (b.found_period_price || b.min_rental_price || 9e9));
      }
  } 
  
  // --- LÓGICA VENTA / ANUAL ---
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