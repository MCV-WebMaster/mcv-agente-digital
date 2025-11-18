import { openai } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { searchProperties } from '@/lib/propertyService';

export const maxDuration = 60;
const model = openai('gpt-4o');

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
      
      --- 🧠 MEMORIA Y CONTEXTO (CRÍTICO) ---
      * **MANTÉN EL CONTEXTO:** Si el usuario ya definió una fecha (ej. Enero 2da), una zona o una cantidad de personas, **NO LOS OLVIDES** en la siguiente búsqueda.
      * Si el usuario dice "con lavavajillas", debes buscar: Fecha Anterior + Zona Anterior + Pax Anterior + "lavavajillas".
      * Solo cambia un filtro si el usuario lo pide explícitamente.

      --- 🌍 MAPEO GEOGRÁFICO ---
      * "El Carmen" -> GBA Sur, Barrio: "Club El Carmen".
      * "Fincas", "Fincas 1" -> GBA Sur, Barrio: "Fincas de Iraola".
      * **"Fincas 2", "El 2" (si hablan de Fincas)** -> GBA Sur, Barrio: "Fincas de Iraola II".
      * "Abril" -> GBA Sur, Barrio: "Club de Campo Abril".
      * "Costa" -> Costa Esmeralda.

      --- 📅 LÓGICA TEMPORAL ---
      * Costa Esmeralda: Solo periodos fijos (Navidad, Año Nuevo, Enero 1ra/2da, Febrero 1ra/2da).
      * **Fechas Cruzadas:** Si piden fechas que rompen quincenas, explica y ofrece las quincenas completas.

      --- 🗣️ ESTRATEGIA DE VENTA (CÓMO RESPONDER) ---
      
      **ESCENARIO A: 0 RESULTADOS**
      * Nunca digas "no hay". Di: "Para esos requisitos exactos está todo reservado/vendido, PERO..."
      * **Propón alternativas:** "¿Te sirve ver en el barrio de al lado?", "¿Si buscamos para más personas?", "¿Y si miramos la quincena siguiente?".
      * Si el filtro fue precio, di: "Por ese valor no quedó nada, lo más económico arranca en [Precio Mínimo Real]. ¿Te lo muestro?".

      **ESCENARIO B: MUCHOS RESULTADOS (+10)**
      * Di: "Tengo muchas opciones. Para ayudarte a elegir la mejor: ¿Buscas con pileta climatizada? ¿O tenés un presupuesto máximo?" (Si no lo dio).

      **ESCENARIO C: RESULTADOS ENCONTRADOS**
      * Muestra las tarjetas.
      * Vende el valor: "Mirá estas opciones. La primera tiene muy buen precio para la zona".

      --- HERRAMIENTAS ---
      Usa 'buscar_propiedades' acumulando los filtros de la conversación.
      Usa 'mostrar_contacto' si el usuario quiere reservar o atención humana.
      `,
      tools: {
        buscar_propiedades: tool({
          description: 'Busca propiedades. ACUMULA los filtros anteriores si el usuario no los cambia.',
          parameters: z.object({
            operacion: z.enum(['venta', 'alquiler_temporal', 'alquiler_anual']),
            zona: z.enum(['GBA Sur', 'Costa Esmeralda', 'Arelauquen (BRC)']).optional(),
            barrios: z.array(z.string()).optional(),
            tipo: z.enum(['casa', 'departamento', 'lote']).optional(),
            pax: z.string().optional(),
            pax_or_more: z.boolean().optional().describe('Siempre True.'),
            pets: z.boolean().optional(),
            pool: z.boolean().optional(),
            bedrooms: z.string().optional(),
            minPrice: z.string().optional(),
            maxPrice: z.string().optional().describe('El presupuesto dicho por el usuario.'),
            searchText: z.string().optional().describe('Para características como "lavavajillas", "losa radiante", etc.'),
            selectedPeriod: z.enum([
              'Navidad', 'Año Nuevo', 'Año Nuevo con 1ra Enero',
              'Enero 1ra Quincena', 'Enero 2da Quincena', 
              'Febrero 1ra Quincena', 'Febrero 2da Quincena', 'Diciembre 2da Quincena'
            ]).optional(),
          }),
          execute: async (filtros) => {
            console.log("🤖 IA Input:", filtros);
            
            if (filtros.pax) filtros.pax_or_more = true;
            
            // Presupuesto Flexible (+30%)
            if (filtros.maxPrice) {
                const originalMax = parseInt(filtros.maxPrice.replace(/\D/g, ''));
                if (!isNaN(originalMax)) {
                    filtros.maxPrice = (originalMax * 1.30).toString(); 
                }
            }

            filtros.sortBy = 'price_asc';

            const resultados = await searchProperties(filtros);
            
            return {
              count: resultados.count,
              appliedFilters: filtros, 
              properties: resultados.results.slice(0, 6).map(p => ({
                ...p,
                summary: `${p.title} (${p.barrio || p.zona}). Precio: ${p.min_rental_price ? 'USD '+p.min_rental_price : (p.found_period_price ? 'USD '+p.found_period_price : (p.price ? 'USD '+p.price : 'Consultar'))}.`
              }))
            };
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