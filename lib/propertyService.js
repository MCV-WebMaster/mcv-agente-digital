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

// --- LA VERDAD DE LA BASE DE DATOS ---
// Copiado y pegado LITERAL del JSON que me diste.
const DB_PERIODS_EXACT = {
  'Navidad': 'Navidad del 19 al 26/12/25',
  'Año Nuevo': 'Año Nuevo 26/12/25 al 2/1/26',
  'Año Nuevo Combinado': 'Año Nuevo c/1er q de enero del 30/12/25 al 15/1/26', // <--- TUS 3 PROPIEDADES ESTÁN AQUÍ
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

  // 1. TRAEMOS TODAS LAS PROPIEDADES (Sin filtros SQL complejos para evitar errores)
  let query = supabase.from('properties').select('*');
  query = query.or(`status_ids.cs.{${STATUS_ID_ACTIVA}},status_ids.eq.{}`);

  // Filtros "seguros"
  if (tipo) query = query.contains('type_ids', [TYPE_IDS[tipo.toUpperCase()]]);
  if (zona) query = query.eq('zona', zona);
  
  const { data: allProps, error } = await query;
  if (error) throw error;
  
  if (!allProps || allProps.length === 0) return { count: 0, results: [] };

  // 2. FILTRADO EN MEMORIA (JAVASCRIPT)
  let filtered = allProps.filter(p => {
      // Filtro Texto
      if (searchText) {
          const text = (p.title + ' ' + p.description + ' ' + p.barrio).toLowerCase();
          if (!text.includes(searchText.toLowerCase())) return false;
      }

      // Filtro Categoría
      const catIds = p.category_ids || [];
      if (operacion === 'venta') {
          if (!catIds.includes(CATEGORY_IDS.VENTA)) return false;
      } else if (operacion === 'alquiler_temporal') {
           // Aceptamos cualquiera de las dos categorías de temporal
           if (!catIds.includes(CATEGORY_IDS.ALQUILER_TEMPORAL) && !catIds.includes(CATEGORY_IDS.ALQUILER_TEMPORAL_VERANO)) return false;
      } else {
          if (!catIds.includes(CATEGORY_IDS.ALQUILER_ANUAL) && !catIds.includes(CATEGORY_IDS.ALQUILER_ANUAL_AMUEBLADO)) return false;
      }

      // Filtros Específicos
      if (barrios && barrios.length > 0 && !barrios.includes(p.barrio)) return false;
      if (pool && !p.tiene_piscina) return false;
      if (pets && !p.acepta_mascota) return false;

      // Numéricos
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

  // 3. LOGICA DE PERIODOS (LA PARTE CLAVE)
  if (operacion === 'alquiler_temporal' && !showOtherDates) {
      const propIds = filtered.map(p => p.property_id);
      
      // Traemos SOLO los periodos de estas propiedades
      const { data: periods } = await supabase
          .from('periods')
          .select('*')
          .in('property_id', propIds)
          .eq('status', 'Disponible');

      // Obtenemos el nombre EXACTO de la DB usando el mapa
      const exactDBName = selectedPeriod ? DB_PERIODS_EXACT[selectedPeriod] : null;
      
      const validIds = new Set();
      const priceMap = new Map();

      (periods || []).forEach(per => {
          let price = 0;
          if (per.price) price = parseInt(per.price.toString().replace(/\D/g, '')) || 0;

          // Si el usuario eligió un periodo, BUSCAMOS COINCIDENCIA EXACTA
          if (exactDBName) {
              // Usamos trim() por seguridad, pero buscamos igualdad
              if (per.period_name && per.period_name.trim() === exactDBName.trim()) {
                  validIds.add(per.property_id);
                  priceMap.set(per.property_id, { price: price, name: per.period_name });
              }
          } else {
              // Si no eligió, cualquier periodo sirve
              validIds.add(per.property_id);
              // Guardamos el precio más bajo
              const current = priceMap.get(per.property_id);
              if (!current || (price > 0 && price < current.price)) {
                  priceMap.set(per.property_id, { price: price, name: "Desde" });
              }
          }
      });

      // Filtro Final
      filtered = filtered.filter(p => {
          // Si hay periodo seleccionado, TIENE que estar en validIds
          if (selectedPeriod && !validIds.has(p.property_id)) return false;
          // Si no hay periodo, TIENE que tener al menos uno (estar en validIds)
          if (!selectedPeriod && !validIds.has(p.property_id)) return false;

          return true;
      });

      // Asignar precios
      filtered = filtered.map(p => {
          const info = priceMap.get(p.property_id) || { price: 0, name: '' };
          return { ...p, final_display_price: info.price, found_period_name: info.name };
      });

      // Filtro de Precio Numérico
      if (minPrice || maxPrice) {
          filtered = filtered.filter(p => {
              const pr = p.final_display_price || 0;
              if (minPrice && (!pr || pr < parseInt(minPrice))) return false;
              if (maxPrice && (!pr || pr > parseInt(maxPrice))) return false;
              return true;
          });
      }
      
      if (sortBy === 'price_asc') filtered.sort((a, b) => (a.final_display_price || 9e9) - (b.final_display_price || 9e9));

  } else {
      // Venta/Anual
      filtered = filtered.map(p => {
          let price = p.price;
          if (operacion.includes('alquiler') && !price && p.price_note) price = parsePriceFromNote(p.price_note);
          return { ...p, final_display_price: price };
      });

      if (minPrice || maxPrice) {
          filtered = filtered.filter(p => {
              const pr = p.final_display_price || 0;
              if (minPrice && pr < parseInt(minPrice)) return false;
              if (maxPrice && pr > parseInt(maxPrice)) return false;
              return true;
          });
      }
      if (sortBy === 'price_asc') filtered.sort((a, b) => (a.final_display_price || 9e9) - (b.final_display_price || 9e9));
  }

  return { 
      count: filtered.length, 
      results: filtered.slice(offset, offset + limit) 
  };
}