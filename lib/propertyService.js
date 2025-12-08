import { supabase } from '@/lib/supabaseClient';

// --- CONSTANTES ---
const STATUS_ID_ACTIVA = 158;
const SEASON_START_DATE = '2025-12-19';
const SEASON_END_DATE = '2026-03-01';

const CATEGORY_IDS = {
  ALQUILER_TEMPORAL: 196,
  ALQUILER_TEMPORAL_VERANO: 197,
  VENTA: 198
};

const TYPE_IDS = {
  CASA: 162, DEPARTAMENTO: 163, DEPOSITO: 164, DUPLEX: 165,
  HOTEL: 348, LOCAL: 166, LOTE: 167, PH: 269
};

// --- MAPEO EXACTO (BASE DE DATOS VS FRONTEND) ---
// Key: Lo que viene del Dropdown. Value: Lo que está LITERAL en tu DB.
const DB_PERIOD_NAMES = {
  'Navidad': 'Navidad del 19 al 26/12/25',
  'Año Nuevo': 'Año Nuevo 26/12/25 al 2/1/26',
  'Año Nuevo Combinado': 'Año Nuevo c/1er q de enero del 30/12/25 al 15/1/26', // <--- AQUÍ ESTÁN TUS 3 PROPIEDADES
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
    const priceRegex = /(?:u\$s|usd|\$|ARS|ar)\s*([\d\.,]+)/i;
    const match = note.match(priceRegex);
    if (match) {
        const cleanNumberStr = match[1].replace(/[\.,]/g, ''); 
        return parseInt(cleanNumberStr, 10) || 0;
    }
    return 0;
}

export async function searchProperties(filters) {
  const { 
    operacion, zona, tipo, barrios, 
    pax, pax_or_more, pets, pool, 
    bedrooms, bedrooms_or_more,
    minPrice, maxPrice, 
    startDate, endDate, selectedPeriod, 
    searchText, showOtherDates, 
    sortBy = 'default', limit = 100, offset = 0
  } = filters;

  // 1. Query Base
  let query = supabase.from('properties').select('*');
  
  // Filtro de Estado (Activa)
  query = query.or(`status_ids.cs.{${STATUS_ID_ACTIVA}},status_ids.eq.{}`);

  // 2. Filtro de Texto
  if (searchText) {
    const fts = formatFTSQuery(searchText);
    if (fts) query = query.textSearch('fts', fts, { config: 'spanish' });
  }

  // 3. Filtro Tipo
  if (tipo) {
      const typeId = TYPE_IDS[tipo.toUpperCase()];
      if (typeId) query = query.contains('type_ids', [typeId]);
  }

  // 4. Lógica Operación
  if (operacion === 'alquiler_temporal') {
      const isHighSeason = selectedPeriod || (startDate && endDate && !(endDate < SEASON_START_DATE || startDate > SEASON_END_DATE));
      
      // Categorías
      if (showOtherDates) {
          query = query.contains('category_ids', [CATEGORY_IDS.ALQUILER_TEMPORAL]);
      } else if (isHighSeason || !startDate) {
          // Por defecto busca verano si no se especifica "Otras fechas"
          query = query.contains('category_ids', [CATEGORY_IDS.ALQUILER_TEMPORAL_VERANO]);
      }

      // Filtros básicos
      if (zona) query = query.eq('zona', zona);
      if (barrios && barrios.length > 0) query = query.in('barrio', barrios);
      if (pool) query = query.eq('tiene_piscina', true);
      if (pets) query = query.eq('acepta_mascota', true);

      // Filtros numéricos (Ignorar si es Lote)
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

      // Ejecutar Query de Propiedades
      const { data: props, error } = await query;
      if (error) throw error;
      if (!props || props.length === 0) return { count: 0, results: [] };

      // --- FILTRADO DE PERIODOS Y PRECIOS ---
      const propIds = props.map(p => p.property_id);
      
      // Traer periodos disponibles para estas propiedades
      const { data: periodsData } = await supabase
          .from('periods')
          .select('*')
          .in('property_id', propIds)
          .eq('status', 'Disponible');

      const targetDBName = selectedPeriod ? DB_PERIOD_NAMES[selectedPeriod] : null;
      const checkAvailability = !showOtherDates && targetDBName;

      // Mapa de precios mínimos
      const minPriceMap = new Map();
      const periodInfoMap = new Map();
      const availableIds = new Set();

      (periodsData || []).forEach(p => {
          // Limpieza de precio
          let price = 0;
          if (p.price) price = parseInt(p.price.toString().replace(/\D/g, '')) || 0;

          // Guardar mínimo global
          if (price > 0) {
              if (!minPriceMap.has(p.property_id) || price < minPriceMap.get(p.property_id)) {
                  minPriceMap.set(p.property_id, price);
              }
          }

          // Chequear coincidencia exacta con el periodo seleccionado
          if (targetDBName && p.period_name === targetDBName) {
              availableIds.add(p.property_id);
              periodInfoMap.set(p.property_id, {
                  price: price, // Puede ser 0
                  name: p.period_name
              });
          }
      });

      // Filtrado Final en Memoria
      let finalResults = props.map(p => ({
          ...p,
          min_rental_price: minPriceMap.get(p.property_id) || null,
          found_period_price: periodInfoMap.get(p.property_id)?.price || null,
          found_period_name: periodInfoMap.get(p.property_id)?.name || null,
      })).filter(p => {
          // 1. Disponibilidad (Si eligió periodo, TIENE que estar en availableIds)
          if (checkAvailability && !availableIds.has(p.property_id)) return false;

          // 2. Filtro de Precio de Usuario
          // Si encontró periodo, usa ese precio. Si no, usa el mínimo global ("Desde").
          const price = checkAvailability ? p.found_period_price : p.min_rental_price;
          
          // Importante: Si price es 0 (Consultar), y el usuario NO puso minPrice, pasa.
          if (minPrice && (!price || price < parseInt(minPrice))) return false;
          if (maxPrice && (!price || price > parseInt(maxPrice))) return false;

          return true;
      });

      // Ordenar
      if (sortBy === 'price_asc') finalResults.sort((a, b) => (a.found_period_price || a.min_rental_price || 999999) - (b.found_period_price || b.min_rental_price || 999999));
      
      return { 
          count: finalResults.length, 
          results: finalResults.slice(offset, offset + limit) 
      };

  } else {
      // --- VENTA Y ALQUILER ANUAL ---
      if (operacion === 'venta') {
          query = query.contains('category_ids', [CATEGORY_IDS.VENTA]);
          if (minPrice) query = query.gte('price', parseInt(minPrice));
          if (maxPrice) query = query.lte('price', parseInt(maxPrice));
          query = query.order('price', { ascending: true });
      } else {
          query = query.or(`category_ids.cs.{${CATEGORY_IDS.ALQUILER_ANUAL}}, category_ids.cs.{${CATEGORY_IDS.ALQUILER_ANUAL_AMUEBLADO}}`);
      }

      if (zona) query = query.eq('zona', zona);
      if (barrios && barrios.length > 0) query = query.in('barrio', barrios);
      if (pool) query = query.eq('tiene_piscina', true);

      if (tipo !== 'lote') {
          if (bedrooms) query = bedrooms_or_more ? query.gte('bedrooms', bedrooms) : query.eq('bedrooms', bedrooms);
      }
      
      const { data, error } = await query;
      if (error) throw error;

      // Procesar precios (Venta es directo, Alquiler Anual puede estar en notas)
      let finalResults = data.map(p => {
          let displayPrice = p.price;
          if (operacion.includes('alquiler') && !displayPrice && p.price_note) {
              displayPrice = parsePriceFromNote(p.price_note);
          }
          return { ...p, final_display_price: displayPrice };
      });

      // Filtro manual de precio para Anual (si vino de nota)
      if (!operacion.includes('venta') && (minPrice || maxPrice)) {
          finalResults = finalResults.filter(p => {
              const pr = p.final_display_price || 0;
              if (minPrice && pr < parseInt(minPrice)) return false;
              if (maxPrice && pr > parseInt(maxPrice)) return false;
              return true;
          });
      }

      if (sortBy === 'price_asc') finalResults.sort((a, b) => (a.final_display_price || 999999) - (b.final_display_price || 999999));

      return { 
          count: finalResults.length, 
          results: finalResults.slice(offset, offset + limit) 
      };
  }
}