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

// --- PALABRAS CLAVE PARA EL MATCHING ---
// Buscamos que el nombre en la DB *contenga* este texto.
// Usamos las fechas numéricas para evitar errores de tipeo.
const PERIOD_KEYWORDS = {
  'Navidad': '19 al 26',
  'Año Nuevo': '26/12',            // 26/12 al 2/1
  'Año Nuevo Combinado': '30/12',  // 30/12 al 15/1 (La clave de las 3 propiedades)
  'Enero 1ra': '2 al 15',
  'Enero 2da': '16 al 31',
  'Febrero 1ra': '1 al 17',        // Carnaval
  'Febrero 2da': '18/2'            // 18/2 al 1/3
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

  // 1. TRAER TODAS LAS PROPIEDADES ACTIVAS
  // No filtramos nada complejo en SQL, solo lo básico.
  let query = supabase.from('properties').select('*');
  query = query.or(`status_ids.cs.{${STATUS_ID_ACTIVA}},status_ids.eq.{}`);

  // Filtros "Baratos" (SQL)
  if (tipo) query = query.contains('type_ids', [TYPE_IDS[tipo.toUpperCase()]]);
  if (zona) query = query.eq('zona', zona);
  
  const { data: allProps, error } = await query;
  if (error) throw error;
  
  if (!allProps || allProps.length === 0) return { count: 0, results: [] };

  // 2. FILTRADO EN JAVASCRIPT (MUCHO MÁS ROBUSTO)
  let filtered = allProps.filter(p => {
      // Filtro Texto
      if (searchText) {
          const text = (p.title + ' ' + p.description + ' ' + p.barrio).toLowerCase();
          if (!text.includes(searchText.toLowerCase())) return false;
      }

      // Filtro Operación / Categoría
      if (operacion === 'venta') {
          if (!p.category_ids.includes(CATEGORY_IDS.VENTA)) return false;
      } else if (operacion === 'alquiler_temporal') {
          const isVerano = !showOtherDates;
          const requiredCat = isVerano ? CATEGORY_IDS.ALQUILER_TEMPORAL_VERANO : CATEGORY_IDS.ALQUILER_TEMPORAL;
          if (!p.category_ids.includes(requiredCat)) return false;
      } else {
          // Anual
          if (!p.category_ids.includes(CATEGORY_IDS.ALQUILER_ANUAL) && 
              !p.category_ids.includes(CATEGORY_IDS.ALQUILER_ANUAL_AMUEBLADO)) return false;
      }

      // Filtros Específicos
      if (barrios && barrios.length > 0 && !barrios.includes(p.barrio)) return false;
      if (pool && !p.tiene_piscina) return false;
      if (pets && !p.acepta_mascota) return false;

      // Numéricos (No aplican a Lotes)
      if (tipo !== 'lote') {
          if (bedrooms) {
              const bd = parseInt(bedrooms);
              if (bedrooms_or_more ? p.bedrooms < bd : p.bedrooms !== bd) return false;
          }
          if (pax) {
              const px = parseInt(pax);
              if (pax_or_more ? p.pax < px : p.pax !== px) return false;
          }
      }
      if (minMts && p.mts_cubiertos < parseInt(minMts)) return false;

      return true;
  });

  // 3. LOGICA DE PERIODOS Y PRECIOS (CRÍTICO)
  // Ahora cruzamos las propiedades que pasaron el filtro 1 con la tabla periods
  if (operacion === 'alquiler_temporal' && !showOtherDates) {
      const propIds = filtered.map(p => p.property_id);
      
      // Traer periodos SOLO de estas propiedades
      const { data: periods } = await supabase
          .from('periods')
          .select('*')
          .in('property_id', propIds)
          .eq('status', 'Disponible');

      const keyword = selectedPeriod ? PERIOD_KEYWORDS[selectedPeriod] : null;
      const validIds = new Set();
      const priceMap = new Map(); // Guardará el precio a mostrar (del periodo o el min)

      // Analizamos periodos
      (periods || []).forEach(per => {
          let pPrice = 0;
          if (per.price) pPrice = parseInt(per.price.toString().replace(/\D/g, '')) || 0;

          // Si el usuario eligió periodo, buscamos coincidencia parcial (INCLUDES)
          if (keyword) {
              // AQUÍ ESTÁ LA MAGIA: Buscamos "30/12" dentro de "Año Nuevo c/1er..."
              if (per.period_name && per.period_name.includes(keyword)) {
                  validIds.add(per.property_id);
                  // Guardamos este precio específico para mostrarlo
                  priceMap.set(per.property_id, { price: pPrice, name: per.period_name });
              }
          } else {
              // Si no eligió periodo, la propiedad es válida si tiene CUALQUIER periodo disponible
              validIds.add(per.property_id);
              // Guardamos el precio más bajo encontrado
              const current = priceMap.get(per.property_id);
              if (!current || (pPrice > 0 && pPrice < current.price)) {
                  priceMap.set(per.property_id, { price: pPrice, name: "Desde" });
              }
          }
      });

      // Filtro final de disponibilidad
      filtered = filtered.filter(p => {
          // Si buscamos por periodo, tiene que haber hecho match
          if (selectedPeriod && !validIds.has(p.property_id)) return false;
          // Si no buscamos periodo, tiene que tener al menos uno disponible
          if (!selectedPeriod && !validIds.has(p.property_id)) return false; 
          return true;
      });

      // Asignar precios y filtrar por rango de precio
      filtered = filtered.map(p => {
          const info = priceMap.get(p.property_id) || { price: 0, name: '' };
          return { 
              ...p, 
              final_display_price: info.price, 
              found_period_name: info.name 
          };
      });

  } else {
      // Lógica de precios para Venta/Anual
      filtered = filtered.map(p => {
          let price = p.price;
          if (operacion.includes('alquiler') && !price && p.price_note) {
              price = parsePriceFromNote(p.price_note);
          }
          return { ...p, final_display_price: price };
      });
  }

  // 4. FILTRO DE PRECIO FINAL
  if (minPrice || maxPrice) {
      filtered = filtered.filter(p => {
          const pr = p.final_display_price || 0;
          // Si es 0 (Consultar) y se pide filtro, se oculta.
          if (minPrice && pr < parseInt(minPrice)) return false;
          if (maxPrice && pr > parseInt(maxPrice)) return false;
          return true;
      });
  }

  // 5. ORDENAR Y PAGINAR
  if (sortBy === 'price_asc') {
      filtered.sort((a, b) => (a.final_display_price || 9e9) - (b.final_display_price || 9e9));
  } else if (sortBy === 'price_desc') {
      filtered.sort((a, b) => (b.final_display_price || 0) - (a.final_display_price || 0));
  }

  return { 
      count: filtered.length, 
      results: filtered.slice(offset, offset + limit) 
  };
}