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
      system: `Eres 'Asistente Digital MCV', un vendedor inmobiliario experto.
      
      --- 🌍 CONOCIMIENTO GEOGRÁFICO ---
      * "El Carmen" -> GBA Sur, Barrio "Club El Carmen".
      * "Fincas" -> GBA Sur, Barrio "Fincas de Iraola".
      * "Fincas 2" -> GBA Sur, Barrio "Fincas de Iraola II".
      * "Abril" -> GBA Sur, Barrio "Club de Campo Abril".
      * "Costa" -> Costa Esmeralda.

      --- 🧠 ESTRATEGIA DE VENTA (CRÍTICO) ---
      
      1. **NO SEAS PASIVO:** Si el usuario dice "comprar en el carmen", NO busques todavía. Hay demasiadas casas (49+).
         - PREGUNTA: "¿Qué tipo de casa buscas? ¿Cuántos dormitorios o qué presupuesto máximo tienes?"
         - Solo busca cuando tengas un filtro que reduzca la lista.

      2. **ALQUILER TEMPORAL (COSTA):**
         - Periodos Fijos: Navidad, Año Nuevo, Año Nuevo c/1ra Enero, Enero 1ra, Enero 2da, Febrero 1ra/Carnaval, Febrero 2da.
         - Siempre confirma PAX y MASCOTAS antes de dar la lista final.
      
      3. **MANEJO DE RESULTADOS:**
         - **0 Resultados:** PROHIBIDO decir solo "0 opciones".
           - Di: "No tengo casas de [X] dormitorios en ese barrio exacto, pero..."
           - SUGIERE: "¿Te gustaría ver en [Barrio Vecino]?" o "¿Vemos opciones de [X-1] dormitorios con playroom?".
         - **+10 Resultados (VENTA):** NO LOS MUESTRES.
           - Di: "Tengo [X] opciones en esa zona. Para no marearte, ¿cuál es tu presupuesto máximo aproximado?".
         - **+10 Resultados (ALQUILER):** Puedes mostrarlos, pero sugiere filtrar por "Con Pileta" o "Precio".

      --- HERRAMIENTAS ---
      Usa 'buscar_propiedades' para consultar. Recuerda mantener el contexto (filtros anteriores) si el usuario sigue la charla.
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
            pets: z.boolean().optional().describe('True si tienen mascota.'),
            pool: z.boolean().optional(),
            bedrooms: z.string().optional().describe('Calculado: Ambientes - 1'),
            minPrice: z.string().optional(),
            maxPrice: z.string().optional().describe('Presupuesto máximo.'),
            searchText: z.string().optional(),
            selectedPeriod: z.enum([
              'Navidad', 'Año Nuevo', 'Año Nuevo con 1ra Enero',
              'Enero 1ra Quincena', 'Enero 2da Quincena', 
              'Febrero 1ra Quincena', 'Febrero 2da Quincena', 'Diciembre 2da Quincena'
            ]).optional(),
          }),
          execute: async (filtros) => {
            console.log("🤖 IA Input:", filtros);
            
            if (filtros.pax) filtros.pax_or_more = true;
            
            if (filtros.maxPrice) {
                const originalMax = parseInt(filtros.maxPrice.replace(/\D/g, ''));
                if (!isNaN(originalMax)) {
                    filtros.maxPrice = (originalMax * 1.30).toString(); 
                }
            }

            filtros.sortBy = 'price_asc';

            const resultados = await searchProperties(filtros);
            
            // Si hay muchos resultados de venta, la IA decidirá no mostrarlos todos
            // Le pasamos solo los primeros 10 para que tenga contexto
            
            return {
              count: resultados.count,
              appliedFilters: filtros, 
              properties: resultados.results.slice(0, 10).map(p => ({
                ...p,
                summary: `${p.title} (${p.barrio || p.zona}). ${p.bedrooms ? p.bedrooms + ' Dorm. ' : ''}Precio: ${p.min_rental_price ? 'USD '+p.min_rental_price : (p.found_period_price ? 'USD '+p.found_period_price : (p.price ? 'USD '+p.price : 'Consultar'))}.`
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