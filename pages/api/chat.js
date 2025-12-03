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
  description: 'Busca propiedades.',
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
    limit: z.number().optional(),
    offset: z.number().optional(),
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
            const clean = parseInt(filtros.maxPrice.replace(/\D/g, ''));
            if (!isNaN(clean)) {
                originalMaxPrice = (clean < 1000) ? clean * 1000 : clean;
                filtros.maxPrice = originalMaxPrice.toString();
            } else {
                delete filtros.maxPrice;
            }
        }
        filtros.sortBy = 'price_asc';

        let resultados = await searchProperties(filtros);

        // --- LOGICA DE NEGOCIO (MAQUINA DE ESTADOS) ---

        // CASO 1: CERO RESULTADOS (RESCATE)
        if (resultados.count === 0) {
            // Si falló por precio, buscamos el más barato disponible
            if (originalMaxPrice) {
                let rescueFilters = {...filtros, maxPrice: null, limit: 1, offset: 0}; // Solo traer el más barato
                let resRescue = await searchProperties(rescueFilters);
                
                if (resRescue.count > 0) {
                    // Encontramos algo más caro
                    resultados = resRescue;
                    resultados.warning = `price_low`; // Aviso a la IA
                    resultados.minAvailablePrice = resRescue.results[0].final_display_price;
                }
            }
            // Si no fue precio, probamos quitando barrio
            else if (filtros.barrios && filtros.barrios.length > 0) {
                let rescueFilters = {...filtros, barrios: undefined, limit: 3};
                let resRescue = await searchProperties(rescueFilters);
                if (resRescue.count > 0) {
                    resultados = resRescue;
                    resultados.warning = "barrio_ampliado";
                }
            }
        }

        // CASO 2: SOBRECARGA (> 6)
        // Si hay muchos resultados y NO es un rescate de precio, bloqueamos.
        if (resultados.count > 6 && !resultados.warning) {
             return {
                count: resultados.count,
                warning: "too_many",
                properties: [] // BLOQUEO: No mandamos data para que no la muestre.
             };
        }

        // CASO 3: ÉXITO (1 a 6 resultados, o Rescate)
        const safeProperties = (resultados.results || []).map(p => {
            const priceVal = p.final_display_price || 0;
            // Formateo U$S 1.500
            const formattedPrice = priceVal > 0 
                ? `U$S ${priceVal.toLocaleString('es-AR')}` 
                : 'Consultar';

            return {
                property_id: p.property_id,
                title: p.title,
                url: p.url,
                zona: p.zona,
                min_rental_price: p.min_rental_price, // Para routing
                // Summary para la IA
                summary: `ID: ${p.property_id}. Precio: ${formattedPrice}.`
            };
        });

        return {
          count: resultados.count, // Total real
          showing: safeProperties.length,
          warning: resultados.warning || null,
          minAvailablePrice: resultados.minAvailablePrice || null,
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
      system: `Eres MaCA, asistente de MCV Propiedades.
      
      --- 🚦 MANEJO DE RESPUESTAS (LÓGICA ESTRICTA) ---
      
      1. **SI LA HERRAMIENTA DICE 'too_many' (Más de 6):**
         - Di: "Encontré [count] opciones. Para mostrarte las mejores, ¿cuál es tu presupuesto tope? ¿O buscás con pileta climatizada?".
         - **NO muestres nada más.**

      2. **SI LA HERRAMIENTA DICE 'price_low' (Rescate):**
         - Di: "Por ese presupuesto no quedó nada disponible. La opción más económica arranca en **U$S [minAvailablePrice]**. ¿Te gustaría verla?".
         - La herramienta ya te pasó esa propiedad, muéstrala si el usuario dice sí.

      3. **SI LA HERRAMIENTA DICE 'barrio_ampliado':**
         - Di: "En ese barrio no encontré, pero mirá estas opciones en la zona:".

      4. **SI MUESTRA PROPIEDADES (Caso Normal):**
         - Di: "Estas son **[showing]** opciones de las **[count]** encontradas. ¿Qué te parecen? ¿Te gustaría ver el detalle de alguna?".
         - **PROHIBIDO:** Escribir listas, precios o descripciones en texto.

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