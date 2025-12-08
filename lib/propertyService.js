import { supabase } from '@/lib/supabaseClient';

const STATUS_ID_ACTIVA = 158;

// --- MAPEO SIMPLE DE PALABRAS CLAVE ---
// Si seleccionan 'ID_COMBINED', buscaremos que el nombre del periodo en la DB incluya estas palabras.
const PERIOD_KEYWORDS = {
  'ID_NAV': 'Navidad',
  'ID_AN': 'Año Nuevo 26/12',
  'ID_COMBINED': 'Año Nuevo c/1er', // Esto matcheará "Año Nuevo c/1er q de enero..."
  'ID_ENE1': 'Ene 1er',
  'ID_ENE2': 'Ene 2da',
  'ID_FEB1': 'Feb 1er',
  'ID_FEB2': 'Feb 2da'
};

const TYPE_IDS = {
  CASA: 162, DEPARTAMENTO: 163, LOTE: 167, LOCAL: 166, DEPOSITO: 164, HOTEL: 348, PH: 269
};

const CATEGORY_IDS = {
  VENTA: 198, ALQUILER_TEMPORAL: 196, ALQUILER_TEMPORAL_VERANO: 197,
  ALQUILER_ANUAL: 194,
};

export async function searchProperties(filters) {
  const { 
    operacion, zona, tipo, barrios, pets, pool, 
    minPrice, maxPrice, bedrooms,
    selectedPeriod, searchText, showOtherDates, 
    limit = 100, offset = 0
  } = filters;

  // 1. QUERY BASE
  let query = supabase.from('properties').select('*');
  
  // Filtro base: Activas o sin status
  query = query.or(`status_ids.cs.{${STATUS_ID_ACTIVA}},status_ids.eq.{}`);

  // Filtros SQL Directos
  if (zona) query = query.eq('zona', zona);
  if (tipo && TYPE_IDS[tipo.toUpperCase()]) {
      query = query.contains('type_ids', [TYPE_IDS[tipo.toUpperCase()]]);
  }
  
  const { data: props, error } = await query;
  if (error) throw error;
  if (!props?.length) return { count: 0, results: [] };

  // 2. FILTRADO EN MEMORIA (Javascript)
  let filtered = props.filter(p => {
      // Filtro Operación
      const catIds = p.category_ids || [];
      if (operacion === 'venta' && !catIds.includes(CATEGORY_IDS.VENTA)) return false;
      if (operacion === 'alquiler_temporal') {
         if (!catIds.includes(CATEGORY_IDS.ALQUILER_TEMPORAL) && !catIds.includes(CATEGORY_IDS.ALQUILER_TEMPORAL_VERANO)) return false;
      }
      if (operacion === 'alquiler_anual' && !catIds.includes(CATEGORY_IDS.ALQUILER_ANUAL)) return false;

      // Filtros básicos
      if (barrios?.length > 0 && !barrios.includes(p.barrio)) return false;
      if (pool && !p.tiene_piscina) return false;
      if (pets && !p.acepta_mascota) return false;
      if (bedrooms && p.bedrooms < parseInt(bedrooms)) return false;

      // Filtro texto
      if (searchText) {
          const searchLower = searchText.toLowerCase();
          const title = p.title?.toLowerCase() || '';
          const desc = p.description?.toLowerCase() || '';
          const barrio = p.barrio?.toLowerCase() || '';
          if (!title.includes(searchLower) && !desc.includes(searchLower) && !barrio.includes(searchLower)) return false;
      }

      return true;
  });

  // 3. LÓGICA DE PERIODOS (SOLUCIÓN DE EMERGENCIA)
  if (operacion === 'alquiler_temporal' && !showOtherDates && selectedPeriod) {
      
      const keyword = PERIOD_KEYWORDS[selectedPeriod]; // Ej: "Año Nuevo c/1er"
      if (!keyword) return { count: 0, results: [] }; // Si no hay keyword válida, devuelve vacío por seguridad

      // Buscar periodos en la tabla 'periods' para las propiedades filtradas
      const propIds = filtered.map(p => p.property_id);
      
      // Optimizacion: Traemos solo los periodos que contengan el texto clave (ILike de Supabase o filtro en JS)
      const { data: periods } = await supabase
          .from('periods')
          .select('*')
          .in('property_id', propIds)
          .eq('status', 'Disponible'); // Solo disponibles

      // Mapa de Propiedad -> Periodo Encontrado
      const validMap = new Map();

      (periods || []).forEach(per => {
          // Normalizamos para comparar (lowercase)
          const pName = (per.period_name || '').toLowerCase();
          const target = keyword.toLowerCase();

          // BUSQUEDA PARCIAL (CONTAINS) - Esto soluciona el problema de espacios o caracteres raros al final
          if (pName.includes(target)) {
               // Limpiamos precio
               let price = parseInt(String(per.price).replace(/[^0-9]/g, '')) || 0;
               validMap.set(String(per.property_id), { price, name: per.period_name });
          }
      });

      // Filtramos las propiedades que NO tienen el periodo
      filtered = filtered.filter(p => validMap.has(String(p.property_id)));

      // Inyectamos el precio del periodo
      filtered = filtered.map(p => {
          const info = validMap.get(String(p.property_id));
          return { ...p, found_period_price: info.price, found_period_name: info.name };
      });
  }

  // 4. FILTRO DE PRECIO (Se aplica al final, ya sea precio de venta o precio de periodo)
  if (minPrice || maxPrice) {
      filtered = filtered.filter(p => {
          // Si encontramos precio de periodo, usamos ese. Si no, el de la propiedad.
          const finalPrice = p.found_period_price || p.price || 0;
          if (finalPrice === 0) return true; // Mostrar si es "Consultar"
          if (minPrice && finalPrice < parseInt(minPrice)) return false;
          if (maxPrice && finalPrice > parseInt(maxPrice)) return false;
          return true;
      });
  }

  return { 
    count: filtered.length, 
    results: filtered.slice(offset, offset + limit) 
  };
}