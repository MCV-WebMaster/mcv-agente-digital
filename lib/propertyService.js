import { supabase } from '@/lib/supabaseClient';

const STATUS_ID_ACTIVA = 158;

const CATEGORY_IDS = {
  VENTA: 198,
  ALQUILER_TEMPORAL: 196,
  ALQUILER_TEMPORAL_VERANO: 197,
  ALQUILER_ANUAL: 194,
  ALQUILER_ANUAL_AMUEBLADO: 193,
};

const TYPE_IDS = {
  CASA: 162, DEPARTAMENTO: 163, LOTE: 167, LOCAL: 166, DEPOSITO: 164, HOTEL: 348, PH: 269
};

// Palabras clave parciales para asegurar coincidencia con la DB
const PERIOD_KEYWORDS = {
  'ID_NAV': 'navidad',
  'ID_AN': 'año nuevo', 
  'ID_COMBINED': 'año nuevo c/', // Coincide con "Año Nuevo c/1er..."
  'ID_ENE1': 'ene 1er',
  'ID_ENE2': 'ene 2da',
  'ID_FEB1': 'feb 1er',
  'ID_FEB2': 'feb 2da'
};

// Normalizador seguro: quita acentos y pasa a minúsculas, pero MANTIENE espacios
const normalizeText = (text) => {
  if (!text) return '';
  return text.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim();
};

function parsePriceFromNote(note) {
    if (!note || typeof note !== 'string') return 0;
    const match = note.match(/(?:u\$s|usd|\$|ARS|ar)\s*([\d\.,]+)/i);
    if (!match) return 0;
    return parseInt(match[1].replace(/\./g, '').replace(/,/g, '')) || 0;
}

export async function searchProperties(filters) {
  const { 
    operacion, zona, tipo, barrios, pax, pets, pool, 
    bedrooms, minPrice, maxPrice, 
    selectedPeriod, searchText, showOtherDates, 
    sortBy = 'default', limit = 100, offset = 0
  } = filters;

  let query = supabase.from('properties').select('*');
  
  // Filtros SQL
  query = query.or(`status_ids.cs.{${STATUS_ID_ACTIVA}},status_ids.eq.{}`);
  if (zona) query = query.eq('zona', zona);
  if (tipo && TYPE_IDS[tipo.toUpperCase()]) {
      query = query.contains('type_ids', [TYPE_IDS[tipo.toUpperCase()]]);
  }

  const { data: props, error } = await query;
  if (error) throw error;
  if (!props?.length) return { count: 0, results: [] };

  // FILTRADO EN MEMORIA
  let filtered = props.filter(p => {
      const catIds = p.category_ids || [];
      
      // Filtro Operación
      if (operacion === 'venta') {
          if (!catIds.includes(CATEGORY_IDS.VENTA)) return false;
      } else if (operacion === 'alquiler_temporal') {
           if (!catIds.includes(CATEGORY_IDS.ALQUILER_TEMPORAL) && !catIds.includes(CATEGORY_IDS.ALQUILER_TEMPORAL_VERANO)) return false;
      } else if (operacion === 'alquiler_anual') {
          if (!catIds.includes(CATEGORY_IDS.ALQUILER_ANUAL) && !catIds.includes(CATEGORY_IDS.ALQUILER_ANUAL_AMUEBLADO)) return false;
      }

      // Filtros Generales
      if (barrios && barrios.length > 0 && !barrios.includes(p.barrio)) return false;
      if (pool && !p.tiene_piscina) return false;
      if (pets && !p.acepta_mascota) return false;
      
      if (tipo !== 'lote') {
         if (pax && p.pax < parseInt(pax)) return false;
         if (bedrooms && p.bedrooms < parseInt(bedrooms)) return false;
      }

      // Filtro Texto
      if (searchText) {
          const searchClean = normalizeText(searchText);
          const content = normalizeText(`${p.title} ${p.description} ${p.barrio}`);
          if (!content.includes(searchClean)) return false;
      }

      return true;
  });

  // --- LÓGICA DE PERIODOS 2026 ---
  if (operacion === 'alquiler_temporal' && !showOtherDates && selectedPeriod) {
      const keyword = PERIOD_KEYWORDS[selectedPeriod];
      if (!keyword) return { count: 0, results: [] }; 

      const targetClean = normalizeText(keyword);
      const matchedProperties = [];

      filtered.forEach(p => {
          let periodsData = p.raw_periods_data;

          // FIX CRÍTICO: Asegurar que sea array, a veces viene como string desde DB
          if (typeof periodsData === 'string') {
              try { periodsData = JSON.parse(periodsData); } catch (e) { periodsData = []; }
          }

          if (Array.isArray(periodsData)) {
              // Buscar periodo disponible que coincida con la palabra clave
              const foundPeriod = periodsData.find(per => {
                 const isAvailable = !per.status || per.status === 'Disponible';
                 const nameClean = normalizeText(per.period_name);
                 return isAvailable && nameClean.includes(targetClean);
              });

              if (foundPeriod) {
                  let price = parseInt(String(foundPeriod.price || foundPeriod.raw_value || '0').replace(/[^0-9]/g, ''));
                  if (price > 0 && price < 100) price = 0; // Ignorar precios basura
                  
                  matchedProperties.push({
                      ...p,
                      final_display_price: price,
                      found_period_name: foundPeriod.period_name
                  });
              }
          }
      });

      filtered = matchedProperties;

      // Ordenar por precio del periodo
      if (sortBy === 'price_asc') filtered.sort((a, b) => (a.final_display_price || 99999999) - (b.final_display_price || 99999999));
      else if (sortBy === 'price_desc') filtered.sort((a, b) => (b.final_display_price || 0) - (a.final_display_price || 0));

  } else {
    // Lógica Venta/Anual
    filtered = filtered.map(p => {
        let price = p.price;
        if (!price && p.price_note) price = parsePriceFromNote(p.price_note);
        return { ...p, final_display_price: price };
    });

    if (minPrice) filtered = filtered.filter(p => !p.final_display_price || p.final_display_price >= parseInt(minPrice));
    if (maxPrice) filtered = filtered.filter(p => !p.final_display_price || p.final_display_price <= parseInt(maxPrice));
    
    if (sortBy === 'price_asc') filtered.sort((a, b) => (a.final_display_price || 99999999) - (b.final_display_price || 99999999));
    else if (sortBy === 'price_desc') filtered.sort((a, b) => (b.final_display_price || 0) - (a.final_display_price || 0));
  }

  return { count: filtered.length, results: filtered.slice(offset, offset + limit) };
}