import { openai } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { searchProperties } from '@/lib/propertyService';

export const maxDuration = 60;
const model = openai('gpt-4o');

const mostrarContactoTool = tool({
  description: 'Muestra el botón para contactar a un agente. Úsalo para cerrar la venta.',
  parameters: z.object({ motivo: z.string().optional() }),
  execute: async ({ motivo }) => ({ showButton: true, motivo }),
});

const buscarPropiedadesTool = tool({
  description: 'Busca propiedades. REGLA: Solo ejecuta si tienes los datos de calificación completos.',
  parameters: z.object({
    operacion: z.enum(['venta', 'alquiler_temporal', 'alquiler_anual']).optional(),
    zona: z.enum(['GBA Sur', 'Costa Esmeralda', 'Arelauquen (BRC)']).optional(),
    barrios: z.array(z.string()).optional(),
    tipo: z.enum(['casa', 'departamento', 'lote']).optional(),
    pax: z.string().optional(),
    pax_or_more: z.boolean().optional().describe('True'),
    pets: z.boolean().optional(),
    pool: z.boolean().optional(),
    bedrooms: z.string().optional(),
    minPrice: z.string().optional(),
    maxPrice: z.string().optional().describe('Presupuesto Tope.'),
    searchText: z.string().optional(),
    // Paginación de 3 en 3
    limit: z.number().optional().describe('Siempre 3.'),
    offset: z.number().optional().describe('0 para inicio, sumar 3 para ver más.'),
    selectedPeriod: z.enum([
      'Navidad', 'Año Nuevo', 'Año Nuevo con 1ra Enero',
      'Enero 1ra Quincena', 'Enero 2da Quincena', 
      'Febrero 1ra Quincena', 'Febrero 2da Quincena', 'Diciembre 2da Quincena'
    ]).optional(),
  }),
  execute: async (filtros) => {
    try {
        console.log("🤖 MaCA Input:", filtros);
        
        if (filtros.pax) filtros.pax_or_more = true;
        if (!filtros.limit) filtros.limit = 3; 
        if (!filtros.offset) filtros.offset = 0;

        // Sanitización de precio
        let originalMaxPrice = null;
        if (filtros.maxPrice) {
            const cleanPrice = filtros.maxPrice.replace(/[\.,kK$USD\s]/g, '');
            originalMaxPrice = parseInt(cleanPrice);
            if (!isNaN(originalMaxPrice)) {
                if (originalMaxPrice < 1000) originalMaxPrice *= 1000; 
                filtros.maxPrice = (originalMaxPrice * 1.30).toString(); 
            } else {
                delete filtros.maxPrice;
            }
        }
        filtros.sortBy = 'price_asc';

        // 1. BÚSQUEDA
        let resultados = await searchProperties(filtros);

        // 2. PROTOCOLO DE RESCATE (Si da 0)
        if (resultados.count === 0) {
            // Intento A: Quitar precio
            if (originalMaxPrice) {
                let rescueFilters = {...filtros, maxPrice: null, offset: 0};
                let resRescue = await searchProperties(rescueFilters);
                if (resRescue.count > 0) {
                    resultados = resRescue;
                    resultados.warning = `precio_bajo|${originalMaxPrice}`;
                    resultados.originalMaxPrice = originalMaxPrice;
                }
            } 
            // Intento B: Quitar barrio
            else if (filtros.barrios && filtros.barrios.length > 0) {
                let rescueFilters = {...filtros, offset: 0};
                delete rescueFilters.barrios; 
                let resRescue = await searchProperties(rescueFilters);
                if (resRescue.count > 0) {
                    resultados = resRescue;
                    resultados.warning = "barrio_ampliado";
                }
            }
        }

        // 3. PROTOCOLO DE SOBRECARGA (> 6 resultados en pág 0)
        const hasHardFilters = filtros.maxPrice || filtros.pool || filtros.bedrooms;
        if (resultados.count > 6 && !hasHardFilters && filtros.offset === 0) {
            return {
                count: resultados.count,
                warning: "too_many",
                properties: [] // No enviamos data para forzar a MaCA a preguntar
            };
        }

        // 4. Mapeo
        const safeProperties = (resultados.results || []).map(p => {
            let displayPrice = "Consultar";
            if (p.found_period_price) {
                displayPrice = `USD ${p.found_period_price} (Total)`;
            } else if (p.min_rental_price) {
                displayPrice = `USD ${p.min_rental_price} (Desde)`;
            } else if (p.price) {
                 displayPrice = `USD ${p.price}`;
            }

            return {
                ...p,
                price: p.price || 0, 
                min_rental_price: p.min_rental_price || 0,
                found_period_price: p.found_period_price || 0,
                title: p.title || 'Propiedad',
                summary: `ID: ${p.property_id}` 
            };
        });

        return {
          count: resultados.count || 0,
          showing: safeProperties.length,
          nextOffset: filtros.offset + safeProperties.length,
          warning: resultados.warning || null,
          originalMaxPrice: resultados.originalMaxPrice || null,
          appliedFilters: filtros, 
          properties: safeProperties 
        };

    } catch (error) {
        console.error("Error tool:", error);
        return { count: 0, properties: [], error: "Error interno." };
    }
  },
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  const { messages } = req.body;

  try {
    const result = await streamText({
      model: model,
      messages: messages,
      maxSteps: 5, 
      system: `Eres 'MaCA', la vendedora experta de MCV Propiedades.
      
      --- 🛑 EMBUDO OBLIGATORIO ---
      1. **ALQUILER:** No busques hasta tener: **Fecha** + **Pax** + **Mascotas**. (Pregunta lo que falte).
      2. **VENTA:** No busques hasta tener: **Zona** + **Dormitorios** + **Presupuesto**.
      
      --- 🚦 MANEJO DE RESULTADOS ---
      * **Caso "too_many" (>6):** "Encontré [count] opciones. Para afinar: ¿Cuál es tu presupuesto tope? ¿O buscás con pileta climatizada?".
      * **Caso "precio_bajo" (Rescate):** "Por [originalMaxPrice] no hay disponibilidad, pero si estiramos el presupuesto, mirá estas opciones:".
      * **Caso 0 (Sin rescate):** "Para esa fecha exacta está todo completo. ¿Te gustaría ver disponibilidad para la quincena siguiente?".
      * **Caso Éxito (1-6):** "Acá te muestro **[showing]** opciones de las **[count]** encontradas. ¿Qué te parecen? ¿Vemos más?"

      --- 🚫 REGLA VISUAL ---
      * **PROHIBIDO** escribir listas de propiedades. El usuario ya ve las tarjetas.
      * Tu respuesta debe ser SOLO la frase de presentación y la pregunta de cierre.
      
      --- 🗺️ MAPEO ---
      * "Costa" -> Costa Esmeralda.
      * "Senderos" -> Senderos I, II, III, IV.
      * "Carnaval" -> Febrero 1ra.
      `,
      tools: {
        buscar_propiedades: buscarPropiedadesTool,
        mostrar_contacto: mostrarContactoTool,
      },
    });
    result.pipeDataStreamToResponse(res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}