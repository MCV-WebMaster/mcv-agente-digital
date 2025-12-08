import { supabase } from '@/lib/supabaseClient';

const STATUS_ID_ACTIVA = 158;

// Mapeo de Categorías
const CATEGORY_IDS = {
  VENTA: 198,
  ALQUILER_TEMPORAL: 196,
  ALQUILER_TEMPORAL_VERANO: 197,
  ALQUILER_ANUAL: 194,
  ALQUILER_ANUAL_AMUEBLADO: 193,
};

// Mapeo de Tipos de Propiedad
const TYPE_IDS = {
  CASA: 162,
  DEPARTAMENTO: 163,
  LOTE: 167,
  LOCAL: 166,
  DEPOSITO: 164,
  HOTEL: 348,
  PH: 269
};

// Palabras clave para coincidencia difusa (Fuzzy Matching)
const PERIOD_KEYWORDS = {
  'ID_NAV': 'navidad',
  'ID_AN': 'año nuevo', 
  'ID_COMBINED': 'año nuevo c/1er', 
  'ID_ENE1': 'ene 1er',
  'ID_ENE2': 'ene 2da',
  'ID_FEB1': 'feb 1er',
  'ID_FEB2': 'feb 2da'
};

// Función de limpieza de texto para comparar sin errores
const normalizeText = (text) => {
  if (!text) return '';
  return text.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Quitar tildes
    .replace(/[^a-z0-9]/g, ''); // Solo letras y números
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

  // 1. QUERY BASE
  let query = supabase.from('properties').select('*');
  
  // Filtro de Estado
  query = query.or(`status_ids.cs.{${STATUS_ID_ACTIVA}},status_ids.eq.{}`);

  // Filtros SQL
  if (zona) query = query.eq('zona', zona);
  if (tipo && TYPE_IDS[tipo.toUpperCase()]) {
      query = query.contains('type_ids', [TYPE_IDS[tipo.toUpperCase()]]);
  }

  const { data: props, error } = await query;
  if (error) throw error;
  if (!props?.length) return { count: 0, results: [] };

  // 2. FILTRADO EN MEMORIA
  let filtered = props.filter(p => {
      // Filtro Operación
      const catIds = p.category_ids || [];
      if (operacion === 'venta') {
          if (!catIds.includes(CATEGORY_IDS.VENTA)) return false;
      } else if (operacion === 'alquiler_temporal') {
           const esTemporal = catIds.includes(CATEGORY_IDS.ALQUILER_TEMPORAL) || catIds.includes(CATEGORY_IDS.ALQUILER_TEMPORAL_VERANO);
           if (!esTemporal) return false;
      } else if (operacion === 'alquiler_anual') {
          const esAnual = catIds.includes(CATEGORY_IDS.ALQUILER_ANUAL) || catIds.includes(CATEGORY_IDS.ALQUILER_ANUAL_AMUEBLADO);
          if (!esAnual) return false;
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
          const searchLower = normalizeText(searchText);
          const title = normalizeText(p.title);
          const desc = normalizeText(p.description);
          const barrio = normalizeText(p.barrio);
          if (!title.includes(searchLower) && !desc.includes(searchLower) && !barrio.includes(searchLower)) return false;
      }

      return true;
  });

  // 3. LÓGICA DE PERIODOS (Corrección del bug)
  if (operacion === 'alquiler_temporal' && !showOtherDates && selectedPeriod) {
      
      const keyword = PERIOD_KEYWORDS[selectedPeriod];
      if (!keyword) return { count: 0, results: [] }; 

      const targetClean = normalizeText(keyword);
      const matchedProperties = [];

      filtered.forEach(p => {
          let foundPeriod = null;

          // Buscar en el JSON raw_periods_data
          if (p.raw_periods_data && Array.isArray(p.raw_periods_data)) {
              foundPeriod = p.raw_periods_data.find(per => {
                 const isAvailable = !per.status || per.status === 'Disponible';
                 const nameClean = normalizeText(per.period_name);
                 return isAvailable && nameClean.includes(targetClean);
              });
          }

          if (foundPeriod) {
              let price = parseInt(String(foundPeriod.price || foundPeriod.raw_value || '0').replace(/[^0-9]/g, ''));
              if (price > 0 && price < 100) price = 0; // Sanity check
              
              matchedProperties.push({
                  ...p,
                  final_display_price: price,
                  found_period_name: foundPeriod.period_name
              });
          }
      });

      filtered = matchedProperties;

      if (sortBy === 'price_asc') {
          filtered.sort((a, b) => (a.final_display_price || 99999999) - (b.final_display_price || 99999999));
      } else if (sortBy === 'price_desc') {
          filtered.sort((a, b) => (b.final_display_price || 0) - (a.final_display_price || 0));
      }

  } else {
    // Lógica standard
    filtered = filtered.map(p => {
        let price = p.price;
        if (!price && p.price_note) price = parsePriceFromNote(p.price_note);
        return { ...p, final_display_price: price };
    });

    if (minPrice || maxPrice) {
        filtered = filtered.filter(p => {
             const pr = p.final_display_price;
             if (!pr) return true;
             if (minPrice && pr < parseInt(minPrice)) return false;
             if (maxPrice && pr > parseInt(maxPrice)) return false;
             return true;
        });
    }
    
    if (sortBy === 'price_asc') {
        filtered.sort((a, b) => (a.final_display_price || 99999999) - (b.final_display_price || 99999999));
    } else if (sortBy === 'price_desc') {
        filtered.sort((a, b) => (b.final_display_price || 0) - (a.final_display_price || 0));
    }
  }

  const total = filtered.length;
  const paginated = filtered.slice(offset, offset + limit);

  return { count: total, results: paginated };
}