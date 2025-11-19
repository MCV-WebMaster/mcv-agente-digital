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
      system: `Eres 'El Asistente Comercial de MCV Propiedades'. Tu trabajo es ser un vendedor experto y metódico.
      
      --- 🧠 TU ESTRATEGIA (CONVERSACIÓN PASO A PASO) ---
      1. **UNA PREGUNTA A LA VEZ:** Si pides 3 datos, espera las 3 respuestas. No te adelantes.
      2. **MAPEO OBLIGATORIO:** Traduce "el carmen" a "Club El Carmen", etc.
      3. **REGLA DE AMBIENTES:** Si dicen "X ambientes", busca 'bedrooms: X-1'.
      
      --- REGLAS DE EJECUCIÓN (CUANDO BUSCAR) ---
      * **Si la búsqueda inicial devuelve más de 10 resultados, DEBES hacer una pregunta de filtro adicional** (ej. Pileta, Presupuesto) antes de mostrar las tarjetas. No abrumes al cliente con una lista larga.
      * **CERO RESULTADOS:** Si da 0, aplica el protocolo de recuperación (ver código de la herramienta).

      --- HERRAMIENTAS ---
      Usa 'buscar_propiedades' para consultar la base de datos.
      `,
      tools: {
        buscar_propiedades: tool({
          description: 'Ejecuta la búsqueda en la base de datos.',
          parameters: z.object({
            operacion: z.enum(['venta', 'alquiler_temporal', 'alquiler_anual']).optional(),
            zona: z.enum(['GBA Sur', 'Costa Esmeralda', 'Arelauquen (BRC)']).optional(),
            barrios: z.array(z.string()).optional().describe('Nombre OFICIAL del barrio (ej. "Club El Carmen", "Fincas de Iraola II").'),
            tipo: z.enum(['casa', 'departamento', 'lote']).optional(),
            pax: z.string().optional(),
            pax_or_more: z.boolean().optional().describe('Siempre True.'),
            pets: z.boolean().optional().describe('True si tienen mascota.'),
            pool: z.boolean().optional(),
            bedrooms: z.string().optional().describe('Calculado: Ambientes - 1.'),
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
            
            // Lógica de Ambientes (Traducción de X ambientes -> X-1 dormitorios)
            if (filtros.bedrooms && !isNaN(parseInt(filtros.bedrooms, 10)) && parseInt(filtros.bedrooms, 10) > 1) {
              filtros.bedrooms = (parseInt(filtros.bedrooms, 10) - 1).toString();
            }

            // Lógica de Upselling y Presupuesto Flexible (+30%)
            if (filtros.pax) filtros.pax_or_more = true;
            
            let originalMaxPrice = null;
            if (filtros.maxPrice) {
                originalMaxPrice = parseInt(filtros.maxPrice.replace(/\D/g, ''));
                if (!isNaN(originalMaxPrice)) {
                    filtros.maxPrice = (originalMaxPrice * 1.30).toString(); 
                }
            }

            filtros.sortBy = 'price_asc';
            
            // --- INICIO DE BÚSQUEDA ---
            let resultados = await searchProperties(filtros);
            
            // --- PROTOCOLO DE RECUPERACIÓN (SI HAY 0) ---
            if (resultados.count === 0) {
                console.log("⚠️ 0 Resultados. Intentando recuperación...");
                // Intento 1: Eliminar filtro más restrictivo (Presupuesto)
                if (originalMaxPrice) {
                    let rescueFilters = {...filtros};
                    delete rescueFilters.maxPrice;
                    let resRescue = await searchProperties(rescueFilters);
                    
                    if (resRescue.count > 0) {
                        resultados = resRescue;
                        // Marcamos para que la IA sepa que ignoramos el precio
                        resultados.warning = "ignore_price";
                        resultados.originalMaxPrice = originalMaxPrice;
                        return resultados; // Devolver los resultados de rescate
                    }
                }
                // Si el rescate falla o no es relevante, devolver 0.
            }

            return {
              count: resultados.count,
              warning: resultados.warning || null,
              originalMaxPrice: originalMaxPrice,
              appliedFilters: filtros, 
              properties: resultados.results.slice(0, 10).map(p => ({
                ...p,
                summary: `${p.title} (${p.barrio || p.zona}). Precio: ${p.min_rental_price ? 'USD '+p.min_rental_price : (p.found_period_price ? 'USD '+p.found_period_price : (p.price ? 'USD '+p.price : 'Consultar'))}.`
              }))
            };
          },
        }),
        mostrar_contacto: tool({
          description: 'Muestra el botón para contactar a un agente humano.',
          parameters: z.object({ motivo: z.string().optional() }),
          execute: async ({ motivo }) => ({ showButton: true, motivo }),
        }),
      },
    });

    result.pipeDataStreamToResponse(res);

  } catch (error) {
    console.error('Error en Chat API:', error);
    res.status(500).json({ error: error.message });
  }
}