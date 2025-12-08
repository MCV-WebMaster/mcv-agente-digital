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

// Mapeo de Periodos (Clave del Frontend -> Texto parcial a buscar en la DB)
// Usamos textos parciales únicos para evitar problemas con espacios o caracteres ocultos
const PERIOD_KEYWORDS = {
  'ID_NAV': 'Navidad',
  'ID_AN': 'Año Nuevo', // Matchea "Año Nuevo" y "Año Nuevo c/1er..."
  'ID_COMBINED': 'Año Nuevo c/1er', // Específico para el combinado
  'ID_ENE1': 'Ene 1er',
  'ID_ENE2': 'Ene 2da',
  'ID_FEB1': 'Feb 1er',
  'ID_FEB2': 'Feb 2da'
};

// Función para limpiar textos (quita acentos, espacios extra, mayúsculas)
const normalizeText = (text) => {
  if (!text) return '';
  return text.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Quitar tildes
    .replace(/[^a-z0-9]/g, ''); // Dejar solo letras y números
};

function parsePriceFromNote(note) {
    if (!note || typeof note !== 'string') return 0;
    // Busca números formateados como dinero
    const match = note.match(/(?:u\$s|usd|\$|ARS|ar)\s*([\d\.,]+)/i);
    if (!match) return 0;
    // Elimina puntos y comas para obtener un entero limpio
    return parseInt(match[1].replace(/\./g, '').replace(/,/g, '')) || 0;
}

export async function searchProperties(filters) {
  const { 
    operacion, zona, tipo, barrios, pax, pets, pool, 
    bedrooms, minPrice, maxPrice, 
    selectedPeriod, searchText, showOtherDates, 
    sortBy = 'default', limit = 100, offset = 0
  } = filters;

  // 1. CONSTRUCCIÓN DE QUERY BASE
  let query = supabase.from('properties').select('*');
  
  // Filtro de Estado (Activas o sin estado)
  query = query.or(`status_ids.cs.{${STATUS_ID_ACTIVA}},status_ids.eq.{}`);

  // Filtros SQL Directos (Optimizan la carga)
  if (zona) query = query.eq('zona', zona);
  if (tipo && TYPE_IDS[tipo.toUpperCase()]) {
      query = query.contains('type_ids', [TYPE_IDS[tipo.toUpperCase()]]);
  }

  const { data: props, error } = await query;
  if (error) throw error;
  if (!props?.length) return { count: 0, results: [] };

  // 2. FILTRADO EN MEMORIA (Lógica compleja de JS)
  let filtered = props.filter(p => {
      // -- Filtro Categoría (Operación) --
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

      // -- Filtros Generales --
      if (barrios && barrios.length > 0 && !barrios.includes(p.barrio)) return false;
      if (pool && !p.tiene_piscina) return false;
      if (pets && !p.acepta_mascota) return false;
      
      // Filtros Numéricos (Solo si no es lote)
      if (tipo !== 'lote') {
         if (pax && p.pax < parseInt(pax)) return false;
         if (bedrooms && p.bedrooms < parseInt(bedrooms)) return false;
      }

      // Filtro de Texto (Búsqueda global)
      if (searchText) {
          const searchLower = normalizeText(searchText);
          const title = normalizeText(p.title);
          const desc = normalizeText(p.description);
          const barrio = normalizeText(p.barrio);
          
          if (!title.includes(searchLower) && !desc.includes(searchLower) && !barrio.includes(searchLower)) return false;
      }

      return true;
  });

  // 3. LÓGICA DE PERIODOS (CRÍTICA - Aquí estaba el fallo)
  if (operacion === 'alquiler_temporal' && !showOtherDates && selectedPeriod) {
      
      const keyword = PERIOD_KEYWORDS[selectedPeriod]; // Ej: "Año Nuevo c/1er"
      if (!keyword) return { count: 0, results: [] }; 

      const targetClean = normalizeText(keyword);
      
      // Filtramos y transformamos las propiedades
      const matchedProperties = [];

      filtered.forEach(p => {
          let foundPeriod = null;

          // Buscamos dentro del JSON 'raw_periods_data' que viene de Supabase
          if (p.raw_periods_data && Array.isArray(p.raw_periods_data)) {
              foundPeriod = p.raw_periods_data.find(per => {
                 // Debe estar "Disponible" (o sin status definido)
                 const isAvailable = !per.status || per.status === 'Disponible';
                 const nameClean = normalizeText(per.period_name);
                 // Usamos 'includes' para matchear aunque haya caracteres extra al final
                 return isAvailable && nameClean.includes(targetClean);
              });
          }

          if (foundPeriod) {
              // Limpieza del precio (sacar símbolos)
              let price = parseInt(String(foundPeriod.price || foundPeriod.raw_value || '0').replace(/[^0-9]/g, ''));
              // Corrección por si el precio viene mal formateado (ej. muy bajo)
              if (price > 0 && price < 100) price = 0; 
              
              matchedProperties.push({
                  ...p,
                  final_display_price: price, // Precio específico del periodo
                  found_period_name: foundPeriod.period_name
              });
          }
      });

      filtered = matchedProperties;

      // Ordenar por precio del periodo encontrado
      if (sortBy === 'price_asc') {
          filtered.sort((a, b) => (a.final_display_price || 99999999) - (b.final_display_price || 99999999));
      } else if (sortBy === 'price_desc') {
          filtered.sort((a, b) => (b.final_display_price || 0) - (a.final_display_price || 0));
      }

  } else {
    // LÓGICA ESTÁNDAR (Venta / Anual / Sin fecha específica)
    filtered = filtered.map(p => {
        let price = p.price;
        // Si precio es 0, intentar leer de la nota interna
        if (!price && p.price_note) price = parsePriceFromNote(p.price_note);
        return { ...p, final_display_price: price };
    });

    // Filtros de Precio Globales
    if (minPrice || maxPrice) {
        filtered = filtered.filter(p => {
             const pr = p.final_display_price;
             if (!pr) return true; // Si es "Consultar", pasa el filtro
             if (minPrice && pr < parseInt(minPrice)) return false;
             if (maxPrice && pr > parseInt(maxPrice)) return false;
             return true;
        });
    }
    
    // Ordenamiento Estándar
    if (sortBy === 'price_asc') {
        filtered.sort((a, b) => (a.final_display_price || 99999999) - (b.final_display_price || 99999999));
    } else if (sortBy === 'price_desc') {
        filtered.sort((a, b) => (b.final_display_price || 0) - (a.final_display_price || 0));
    }
  }

  // 4. PAGINACIÓN
  const total = filtered.length;
  const paginated = filtered.slice(offset, offset + limit);

  return { count: total, results: paginated };
}