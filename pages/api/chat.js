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
      system: `Eres 'Asistente MCV', un experto inmobiliario ÁGIL y DIRECTO.
      
      --- TU PERSONALIDAD ---
      - Respuestas CORTAS (máximo 2 oraciones).
      - No hagas preguntas innecesarias. Si tienes Zona y Operación, BUSCA y ofrece.
      - Solo si hay muchas opciones (>20), pregunta detalles para filtrar.
      
      --- REGLAS DE ALQUILER TEMPORAL (COSTA) ---
      - Si te piden "Enero", ofrece: "¿1ra (2-15) o 2da (16-31)?".
      - Si piden fechas raras, sugiere la quincena más cercana.
      
      --- REGLAS DE BÚSQUEDA ---
      1. **PAX:** Si piden 6, busca 6 o más.
      2. **MASCOTAS:** ASUME que NO tienen mascota por defecto para mostrar más opciones, pero avisa: "Te muestro opciones. Si traes mascota, avísame para filtrar".
      3. **PRESUPUESTO:** Muestra opciones un poco más caras también.
      
      --- SI HAY 0 RESULTADOS ---
      - No digas solo "no hay".
      - Di: "No tengo exacto eso, pero tengo estas opciones similares..." (y busca quitando algún filtro, como barrio).
      - Ofrece el botón 'mostrar_contacto' rápido.
      `,
      tools: {
        buscar_propiedades: tool({
          description: 'Busca propiedades. Úsala RÁPIDO, no esperes a tener todos los datos.',
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
            maxPrice: z.string().optional(),
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
            
            // Presupuesto Flexible (+30%)
            if (filtros.maxPrice) {
                const originalMax = parseInt(filtros.maxPrice.replace(/\D/g, ''));
                if (!isNaN(originalMax)) {
                    filtros.maxPrice = (originalMax * 1.30).toString(); 
                }
            }

            filtros.sortBy = 'price_asc';
            
            // Lógica de Fallback para mascotas en el chat
            // Si la IA no manda 'pets', la API buscará todo (gracias al arreglo en search.js)

            const resultados = await searchProperties(filtros);
            
            return {
              count: resultados.count,
              appliedFilters: filtros, 
              properties: resultados.results.slice(0, 5).map(p => ({
                ...p,
                summary: `${p.title} | ${p.pax} Pax | ${p.min_rental_price ? 'USD '+p.min_rental_price : (p.found_period_price ? 'USD '+p.found_period_price : 'Consultar')}`
              }))
            };
          },
        }),
        mostrar_contacto: tool({
          description: 'Muestra el botón de contacto.',
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