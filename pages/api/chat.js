import { openai } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { supabase } from '@/lib/supabaseClient'; // Importamos Supabase directamente aquí

// --- CONFIGURACIÓN ---
export const maxDuration = 60; // Evitar timeouts

const model = openai('gpt-4o');

const CATEGORY_IDS = {
  VENTA: 198,
  ALQUILER_TEMPORAL: 197,
  ALQUILER_ANUAL: 194,
  ALQUILER_ANUAL_AMUEBLADO: 193,
};
const STATUS_ID_ACTIVA = 158;
const TYPE_IDS = {
  CASA: 162,
  DEPARTAMENTO: 163,
  LOTE: 167,
};

const SEASON_START_DATE = '2025-12-19';
const SEASON_END_DATE = '2026-03-01';

// Lógica de Períodos Relacionados (Para que "Año Nuevo" encuentre el Combo)
const RELATED_PERIODS = {
  'Navidad': ['Navidad'],
  'Año Nuevo': ['Año Nuevo', 'Año Nuevo con 1ra Enero'], 
  'Año Nuevo con 1ra Enero': ['Año Nuevo con 1ra Enero'],
  'Enero 1ra Quincena': ['Enero 1ra Quincena', 'Año Nuevo con 1ra Enero'],
  'Enero 2da Quincena': ['Enero 2da Quincena'],
  'Febrero 1ra Quincena': ['Febrero 1ra Quincena'],
  'Febrero 2da Quincena': ['Febrero 2da Quincena'],
  'Diciembre 2da Quincena': ['Diciembre 2da Quincena']
};

function formatFTSQuery(text) {
  if (!text) return null;
  return text.trim().split(' ').filter(Boolean).join(' & ');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { messages } = req.body;

  try {
    const result = await streamText({
      model: model,
      messages: messages,
      system: `Eres 'El Asistente Digital de MCV Propiedades', un VENDEDOR INMOBILIARIO EXPERTO.
      
      --- 🌍 MAPEO GEOGRÁFICO (SOLUCIÓN DE ERRORES) ---
      Si el usuario menciona estos lugares, ASUME la zona y el barrio:
      * **"El Carmen" / "Club El Carmen"** -> Zona: "GBA Sur", Barrio: "Club El Carmen".
      * **"Fincas" (1 o 2) / "Fincas de Iraola"** -> Zona: "GBA Sur", Barrios: ["Fincas de Iraola", "Fincas de Iraola II"].
      * **"Abril"** -> Zona: "GBA Sur", Barrio: "Club de Campo Abril".
      * **"Costa" / "Pinamar"** -> Zona: "Costa Esmeralda".
      * **"Arelauquen"** -> Zona: "Arelauquen (BRC)".

      --- 🧮 LÓGICA DE AMBIENTES vs DORMITORIOS ---
      * Si el usuario dice **"X ambientes"**, significa **"X-1 dormitorios"**.
        (Ej: "4 ambientes" -> busca 'bedrooms: 3'. "3 ambientes" -> 'bedrooms: 2').

      --- 📅 LÓGICA DE ALQUILER TEMPORAL (COSTA ESMERALDA) ---
      **REGLA DE ORO (PRIORIDAD MÁXIMA):**
      Si el usuario pide fechas que **CRUZAN** dos quincenas (ej. "25 de enero al 10 de febrero"), **DETENTE**.
      NO busques. Explica los periodos fijos y pregunta cuál prefieren.
      
      Periodos Fijos: Navidad, Año Nuevo, Año Nuevo c/1ra Enero, Enero 1ra, Enero 2da, Febrero 1ra/Carnaval, Febrero 2da.

      --- 🧠 LÓGICA DE VENTA ---
      1. **PRESUPUESTO:** Busca un 30% más arriba de lo que piden.
      2. **CERO RESULTADOS:** Si da 0, sugiere cambios activamente ("¿Probamos sin mascota?", "¿Vemos 3 dormitorios en lugar de 4?").
      3. **PAX:** Siempre busca la capacidad pedida Y SUPERIOR (upselling).

      --- HERRAMIENTAS ---
      Usa 'buscar_propiedades' SOLO cuando tengas: Operación + Zona + Fecha Válida (si es temp) + Pax (si es temp).
      `,
      tools: {
        buscar_propiedades: tool({
          description: 'Ejecuta la búsqueda en la base de datos.',
          parameters: z.object({
            operacion: z.enum(['venta', 'alquiler_temporal', 'alquiler_anual']),
            zona: z.enum(['GBA Sur', 'Costa Esmeralda', 'Arelauquen (BRC)']).optional(),
            barrios: z.array(z.string()).optional(),
            tipo: z.enum(['casa', 'departamento', 'lote']).optional(),
            pax: z.string().optional(),
            pax_or_more: z.boolean().optional().describe('Siempre True.'),
            pets: z.boolean().optional(),
            pool: z.boolean().optional(),
            bedrooms: z.string().optional().describe('Calculado: Ambientes - 1'),
            minPrice: z.string().optional(),
            maxPrice: z.string().optional().describe('El presupuesto dicho por el usuario.'),
            searchText: z.string().optional(),
            selectedPeriod: z.enum([
              'Navidad', 'Año Nuevo', 'Año Nuevo con 1ra Enero',
              'Enero 1ra Quincena', 'Enero 2da Quincena', 
              'Febrero 1ra Quincena', 'Febrero 2da Quincena', 'Diciembre 2da Quincena'
            ]).optional(),
          }),
          execute: async (filtros) => {
            console.log("🤖 IA Input:", filtros);
            
            // --- PRE-PROCESAMIENTO DE FILTROS (Lógica de Venta) ---
            if (filtros.pax) filtros.pax_or_more = true;
            
            if (filtros.maxPrice) {
                const originalMax = parseInt(filtros.maxPrice.replace(/\D/g, ''));
                if (!isNaN(originalMax)) {
                    filtros.maxPrice = (originalMax * 1.30).toString(); // +30%
                }
            }

            // --- INICIO DE LA BÚSQUEDA (Logic Internal) ---
            const { 
              operacion, zona, tipo, barrios, pax, pax_or_more,
              pets, pool, bedrooms, minPrice, maxPrice,
              searchText, selectedPeriod
            } = filtros;

            let query = supabase.from('properties').select('*');
            query = query.or(`status_ids.cs.{${STATUS_ID_ACTIVA}},status_ids.eq.{}`);

            // FTS
            if (searchText) {
              const ftsQuery = formatFTSQuery(searchText);
              if (ftsQuery) query = query.textSearch('fts', ftsQuery, { config: 'spanish' });
            }

            // ALQUILER TEMPORAL
            if (operacion === 'alquiler_temporal') {
                query = query.contains('category_ids', [CATEGORY_IDS.ALQUILER_TEMPORAL]);
                if (zona) query = query.eq('zona', zona);
                if (barrios && barrios.length > 0) query = query.in('barrio', barrios);
                if (tipo === 'casa') query = query.contains('type_ids', [TYPE_IDS.CASA]);
                if (pool) query = query.eq('tiene_piscina', true);
                if (pets) query = query.eq('acepta_mascota', true);
                if (bedrooms) query = query.gte('bedrooms', parseInt(bedrooms, 10));
                
                if (pax) {
                    const paxNum = parseInt(pax, 10);
                    query = pax_or_more ? query.gte('pax', paxNum) : query.eq('pax', paxNum);
                }

                let { data: propertiesData, error } = await query;
                if (error) throw error;

                const propertyIds = propertiesData.map(p => p.property_id);
                if (propertyIds.length === 0) return { count: 0, properties: [] };

                // Buscar TODOS los períodos para precios "desde"
                const { data: allPeriodsData } = await supabase
                    .from('periods')
                    .select('property_id, price')
                    .in('property_id', propertyIds)
                    .eq('status', 'Disponible');

                const minPriceMap = new Map();
                for (const period of allPeriodsData || []) {
                    let periodPrice = 0;
                    if (period.price && (typeof period.price === 'string') && (period.price.includes('$') || period.price.match(/^[\d\.,\s]+$/))) {
                        periodPrice = parseInt(period.price.replace(/[^0-9]/g, ''), 10) || 0;
                    }
                    if (periodPrice > 0) {
                        if (!minPriceMap.has(period.property_id) || periodPrice < minPriceMap.get(period.property_id)) {
                            minPriceMap.set(period.property_id, periodPrice);
                        }
                    }
                }

                // Lógica Específica de Fechas/Períodos
                let availablePropertyIds = new Set(propertyIds);
                const periodDetailsMap = new Map();
                
                // Si se seleccionó un período, filtramos estricto
                if (selectedPeriod) {
                    const periodsToSearch = RELATED_PERIODS[selectedPeriod] || [selectedPeriod];
                    
                    const { data: filteredPeriods } = await supabase
                        .from('periods')
                        .select('property_id, price, duration_days, period_name')
                        .in('property_id', propertyIds)
                        .in('period_name', periodsToSearch) // Buscar en el período o sus combos
                        .eq('status', 'Disponible')
                        .not('price', 'is', null); // ¡Solo si tiene precio!

                    availablePropertyIds = new Set();
                    for (const period of filteredPeriods || []) {
                        let periodPrice = 0;
                        if (period.price && (typeof period.price === 'string') && (period.price.includes('$') || period.price.match(/^[\d\.,\s]+$/))) {
                            periodPrice = parseInt(period.price.replace(/[^0-9]/g, ''), 10) || 0;
                        }
                        if (periodPrice === 0) continue; // Ocultar "Consultar"

                        availablePropertyIds.add(period.property_id);
                        
                        // Guardar precio específico para mostrar
                        periodDetailsMap.set(period.property_id, {
                            price: periodPrice,
                            duration: period.duration_days,
                            name: period.period_name
                        });
                    }
                }

                // Mapeo Final
                let finalResults = propertiesData
                    .map(p => ({
                        ...p,
                        min_rental_price: minPriceMap.get(p.property_id) || null,
                        found_period_price: periodDetailsMap.get(p.property_id)?.price || null
                    }))
                    .filter(p => {
                        const priceToFilter = selectedPeriod ? p.found_period_price : p.min_rental_price;
                        if (!minPrice && !maxPrice) return true;
                        const passesMin = !minPrice || (priceToFilter && priceToFilter >= minPrice);
                        const passesMax = !maxPrice || (priceToFilter && priceToFilter <= maxPrice);
                        if ((minPrice || maxPrice) && !priceToFilter) return false;
                        return passesMin && passesMax;
                    });

                if (selectedPeriod) {
                    finalResults = finalResults.filter(p => availablePropertyIds.has(p.property_id));
                }

                // Ordenar por precio ascendente
                finalResults.sort((a, b) => {
                    const pA = selectedPeriod ? a.found_period_price : a.min_rental_price;
                    const pB = selectedPeriod ? b.found_period_price : b.min_rental_price;
                    return (pA || 9999999) - (pB || 9999999);
                });

                return {
                    count: finalResults.length,
                    // Mapeo para la IA
                    properties: finalResults.slice(0, 5).map(p => ({
                        ...p,
                        summary: `${p.title} (${p.barrio || p.zona}). ${p.bedrooms ? p.bedrooms + ' Dorm. ' : ''}${p.pax ? p.pax + ' Pax. ' : ''}Precio: ${p.min_rental_price ? 'USD '+p.min_rental_price : (p.found_period_price ? 'USD '+p.found_period_price : (p.price ? 'USD '+p.price : 'Consultar'))}.`
                    }))
                };
            } 
            
            // --- VENTA / ANUAL (Simplificado para el Chat) ---
            else {
                if (operacion === 'venta') {
                    query = query.contains('category_ids', [CATEGORY_IDS.VENTA]);
                    if (minPrice) query = query.gte('price', parseInt(minPrice, 10));
                    if (maxPrice) query = query.lte('price', parseInt(maxPrice, 10));
                    query = query.order('price', { ascending: true, nullsFirst: false });
                } else { // Anual
                     query = query.or(`category_ids.cs.{${CATEGORY_IDS.ALQUILER_ANUAL}}, category_ids.cs.{${CATEGORY_IDS.ALQUILER_ANUAL_AMUEBLADO}}`);
                     if (maxPrice) query = query.lte('es_property_price_ars', parseInt(maxPrice, 10));
                     query = query.order('es_property_price_ars', { ascending: true, nullsFirst: false });
                }

                if (zona) query = query.eq('zona', zona);
                if (barrios && barrios.length > 0) query = query.in('barrio', barrios);
                if (bedrooms) query = query.gte('bedrooms', parseInt(bedrooms, 10));

                const { data, error } = await query;
                if (error) throw error;

                return {
                    count: data.length,
                    properties: data.slice(0, 5).map(p => ({
                        ...p,
                        summary: `${p.title}. ${operacion === 'venta' ? 'Venta USD '+p.price : 'Alquiler $'+p.es_property_price_ars}. ${p.bedrooms} Dorm.`
                    }))
                };
            }
          },
        }),
        mostrar_contacto: tool({
          description: 'Muestra el botón para contactar a un agente humano.',
          parameters: z.object({ 
            motivo: z.string().optional() 
          }),
          execute: async ({ motivo }) => {
            return { showButton: true, motivo };
          },
        }),
      },
    });

    result.pipeDataStreamToResponse(res);

  } catch (error) {
    console.error('Error en Chat API:', error);
    res.status(500).json({ error: error.message });
  }
}