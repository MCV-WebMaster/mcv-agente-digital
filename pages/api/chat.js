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
      system: `Eres 'Asistente Comercial MCV', un VENDEDOR PROACTIVO y METÓDICO.
      
      --- 🧠 CONVERSACIÓN PASO A PASO (REGLAS DE ORO) ---
      1. **UNA COSA A LA VEZ:** Si recibes una respuesta parcial (ej. solo PAX), DEBES preguntar SOLAMENTE por el siguiente dato FALTANTE.
      2. **MAPEO OBLIGATORIO:** Traduce El Carmen/Deportiva al nombre oficial y Zona.

      --- 🔎 REGLAS DE BÚSQUEDA Y FILTRO (EL EMBUDO) ---
      
      **CRITERIOS MÍNIMOS OBLIGATORIOS ANTES DE BUSCAR:**
      - Operación (Venta/Alquiler)
      - Zona
      - PAX (para Alquiler)
      - PERIODO (para Alquiler)

      **LÍMITE DE RESULTADOS:**
      - Si la búsqueda devuelve más de 10 propiedades, NO las muestres.
      - Debes decir: "Tengo muchas opciones. Para encontrar la ideal, ¿buscas con pileta, pileta climatizada, o cuál es tu presupuesto máximo?" (Fuerza un filtro nuevo).
      
      **CERO RESULTADOS (RECUPERACIÓN):**
      - Si da 0, aplica la lógica de rescate: busca sin presupuesto o sugiere cambiar de barrio.

      --- HERRAMIENTAS ---
      Usa 'buscar_propiedades' SOLO cuando cumplas los Criterios Mínimos O cuando el usuario lo pida explícitamente (ej. "dame opciones").
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
            pets: z.boolean().optional(),
            pool: z.boolean().optional(),
            bedrooms: z.string().optional(),
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
            console.log("🤖 IA Input (Vendedor):", filtros);
            
            // 1. Lógica de Venta Automática
            if (filtros.pax) filtros.pax_or_more = true;
            
            // 2. Lógica de Presupuesto Flexible (+30%)
            let originalMaxPrice = null;
            if (filtros.maxPrice) {
                originalMaxPrice = parseInt(filtros.maxPrice.replace(/\D/g, ''));
                if (!isNaN(originalMaxPrice)) {
                    filtros.maxPrice = (originalMaxPrice * 1.30).toString(); 
                }
            }

            filtros.sortBy = 'price_asc';

            // --- EJECUCIÓN ---
            let resultados = await searchProperties(filtros);

            // --- 3. PROTOCOLO DE RECUPERACIÓN (SI HAY 0) ---
            if (resultados.count === 0) {
                // Intento 1: Eliminar filtro de precio
                if (originalMaxPrice) {
                    let rescueFilters = {...filtros, maxPrice: null};
                    let resRescue = await searchProperties(rescueFilters);
                    
                    if (resRescue.count > 0) {
                        resultados = resRescue;
                        // Marcamos para que la IA sepa que debe mostrar este aviso
                        resultados.warning = `precio_bajo|${originalMaxPrice}`;
                        return resultados; 
                    }
                }
                // (Si el rescate falla, devuelve 0)
            }
            
            return {
              count: resultados.count,
              warning: resultados.warning || null,
              appliedFilters: filtros, 
              // Devolvemos hasta 10 para que la IA decida
              properties: resultados.results.slice(0, 10).map(p => ({
                ...p,
                summary: `${p.title} (${p.barrio || p.zona}). ${p.pax ? p.pax + ' Pax. ' : ''}Precio: ${p.min_rental_price ? 'USD '+p.min_rental_price : (p.found_period_price ? 'USD '+p.found_period_price : (p.price ? 'USD '+p.price : 'Consultar'))}.`
              }))
            };
          },
        }),
        mostrar_contacto: tool({
          description: 'Muestra el botón de contacto.',
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