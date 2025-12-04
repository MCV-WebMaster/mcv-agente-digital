import { openai } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { searchProperties } from '@/lib/propertyService';

export const maxDuration = 60;
const model = openai('gpt-4o');

const mostrarContactoTool = tool({
  description: 'Muestra el botón para contactar a un agente.',
  parameters: z.object({ motivo: z.string().optional() }),
  execute: async ({ motivo }) => ({ showButton: true, motivo }),
});

const buscarPropiedadesTool = tool({
  description: 'Busca propiedades en la base de datos. ÚSALA SOLO CUANDO TENGAS TODOS LOS DATOS REQUERIDOS.',
  parameters: z.object({
    operacion: z.enum(['venta', 'alquiler_temporal', 'alquiler_anual']).optional(),
    zona: z.enum(['GBA Sur', 'Costa Esmeralda', 'Arelauquen (BRC)']).optional(),
    barrios: z.array(z.string()).optional(),
    tipo: z.enum(['casa', 'departamento', 'lote']).optional(),
    pax: z.string().optional(),
    pax_or_more: z.boolean().optional().describe('Siempre True.'),
    pets: z.boolean().optional(),
    pool: z.boolean().optional(),
    bedrooms: z.string().optional(),
    minPrice: z.string().optional(),
    maxPrice: z.string().optional().describe('Presupuesto.'),
    searchText: z.string().optional(),
    forceShow: z.boolean().optional().describe('True si el usuario pide ver resultados aunque sean muchos.'),
    limit: z.number().optional().describe('Cantidad a mostrar (Default 3).'),
    offset: z.number().optional().describe('Desde dónde mostrar.'),
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

        // 1. BÚSQUEDA INICIAL
        let resultados = await searchProperties(filtros);
        let isRescue = false; // Flag para saber si estamos en modo rescate

        // 2. PROTOCOLO DE RESCATE
        if (resultados.count === 0) {
            // Rescate A: Precio
            if (originalMaxPrice) {
                let rescueFilters = {...filtros, maxPrice: null, offset: 0};
                let resRescue = await searchProperties(rescueFilters);
                if (resRescue.count > 0) {
                    resultados = resRescue;
                    resultados.warning = `precio_bajo|${originalMaxPrice}`;
                    resultados.originalMaxPrice = originalMaxPrice;
                    isRescue = true; // Activamos modo rescate
                }
            } 
            // Rescate B: Barrio
            else if (filtros.barrios && filtros.barrios.length > 0) {
                let rescueFilters = {...filtros, offset: 0};
                delete rescueFilters.barrios; 
                let resRescue = await searchProperties(rescueFilters);
                if (resRescue.count > 0) {
                    resultados = resRescue;
                    resultados.warning = "barrio_ampliado";
                    isRescue = true; // Activamos modo rescate
                }
            }
        }

        // 3. PROTOCOLO DE SOBRECARGA (CORREGIDO)
        // Bloqueamos SOLO si:
        // a) Hay más de 6 resultados
        // b) NO es un rescate (si es rescate, mostramos sí o sí para enganchar)
        // c) NO tenemos filtros específicos fuertes (precio/pileta/bedrooms)
        // d) El usuario NO forzó la vista (forceShow)
        
        const hasSpecificFilters = filtros.maxPrice || filtros.pool || filtros.bedrooms;
        const shouldBlock = resultados.count > 6 && !hasSpecificFilters && !filtros.forceShow && !isRescue;

        if (shouldBlock && filtros.offset === 0) {
            return {
                count: resultados.count,
                warning: "too_many",
                properties: [] // Ocultamos
            };
        }

        // 4. MAPEO DE PROPIEDADES
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
                summary: `${p.title} (${p.barrio || p.zona}). ${p.bedrooms ? p.bedrooms + ' dorm. ' : ''}Precio: ${displayPrice}.`
            };
        });

        return {
          count: resultados.count || 0,
          showing: safeProperties.length,
          nextOffset: filtros.offset + safeProperties.length,
          warning: resultados.warning || null,
          originalMaxPrice: resultados.originalMaxPrice || null,
          appliedFilters: filtros, 
          properties: safeProperties // Ahora sí enviamos las propiedades en el rescate
        };

    } catch (error) {
        console.error("Error en tool buscar_propiedades:", error);
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
      system: `Eres 'MaCA', la asistente comercial experta de MCV Propiedades.
      
      --- 🚦 FLUJO DE PENSAMIENTO ---
      1. **SI HAY PROPIEDADES (Tarjetas Visibles):**
         - Tu única tarea es cerrar.
         - Di: *"Acá te muestro [showing] opciones de las [count] que encontré. ¿Qué te parecen?"*
         - **NO** escribas listas de texto.

      2. **SI HAY MUCHOS RESULTADOS ("too_many"):**
         - Di: *"Encontré [count] opciones. Para filtrar las mejores, ¿cuál es tu presupuesto tope? ¿O buscás con pileta?"*.
         - Si el usuario responde "mostrame igual", llama de nuevo con \`forceShow: true\`.

      3. **SI HAY 0 RESULTADOS (RESCATE):**
         - Si la herramienta devuelve propiedades con warning "barrio_ampliado" o "precio_bajo":
           - Di: *"En esa búsqueda exacta no encontré, pero mirá estas opciones similares que sí están disponibles:"*
           - (Las tarjetas se mostrarán solas, no las listes en texto).
         - Si la herramienta devuelve 0 absoluto:
           - Sugiere cambio de fecha o zona.

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