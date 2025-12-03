import { openai } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { searchProperties } from '@/lib/propertyService';

export const maxDuration = 60;
const model = openai('gpt-4o');

const mostrarContactoTool = tool({
  description: 'Muestra el botón para contactar a un agente. Úsalo para cerrar la venta, cuando el cliente elija una propiedad, o si pide fechas fuera de temporada.',
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
    maxPrice: z.string().optional().describe('Presupuesto Tope.'),
    searchText: z.string().optional(),
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

        // Sanitización de precios (Ej. "200k" -> 200000)
        let originalMaxPrice = null;
        if (filtros.maxPrice) {
            const cleanPrice = filtros.maxPrice.replace(/[\.,kK$USD\s]/g, '');
            originalMaxPrice = parseInt(cleanPrice);
            if (!isNaN(originalMaxPrice)) {
                if (originalMaxPrice < 1000) originalMaxPrice *= 1000; 
                filtros.maxPrice = (originalMaxPrice * 1.30).toString(); // +30% tolerancia interna
            } else {
                delete filtros.maxPrice;
            }
        }
        filtros.sortBy = 'price_asc';

        let resultados = await searchProperties(filtros);

        // PROTOCOLO DE RESCATE
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
            // Intento B: Quitar barrio (si no fue precio)
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

        // PROTOCOLO DE SOBRECARGA (El Vendedor Experto)
        // Si hay > 6 resultados en la primera página y no es un rescate... bloqueamos.
        if (resultados.count > 6 && !resultados.warning && filtros.offset === 0) {
            return {
                count: resultados.count,
                warning: "too_many",
                properties: [] // No enviamos propiedades para forzar la pregunta
            };
        }

        // Mapeo seguro
        const safeProperties = (resultados.results || []).map(p => {
            let displayPrice = "Consultar";
            if (p.found_period_price) {
                displayPrice = `USD ${p.found_period_price} (Total)`;
            } else if (p.min_rental_price) {
                displayPrice = `USD ${p.min_rental_price} (Desde)`;
            } else if (p.price) {
                 displayPrice = `USD ${p.price}`;
            } else if (p.final_display_price) {
                 displayPrice = `USD ${p.final_display_price}`; // GBA
            }

            return {
                ...p,
                price: p.price || 0, 
                min_rental_price: p.min_rental_price || 0,
                found_period_price: p.found_period_price || 0,
                title: p.title || 'Propiedad',
                // Summary para uso INTERNO de la IA (no para mostrar)
                summary: `ID: ${p.property_id}. ${p.barrio || p.zona}.` 
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
      system: `Eres 'MaCA', la asistente comercial experta de MCV Propiedades.
      
      --- 👩‍💼 IDENTIDAD ---
      * Nombre: MaCA.
      * Tono: Cálido, profesional, resolutivo.
      
      --- 🚦 REGLAS DE ORO (ESTRICTAS) ---
      1. **NO REPITAS LISTAS:** Si la herramienta muestra tarjetas, TU NO ESCRIBAS LA LISTA EN TEXTO.
         * MAL: "Aquí están: 1. Casa X..."
         * BIEN: "Acá te muestro [showing] opciones de las [count] encontradas."
      2. **FRASEO:** Pregunta SIEMPRE: **"¿Llevan mascotas?"**.
      3. **MEMORIA:** Si el usuario refina la búsqueda, MANTÉN los filtros anteriores.
      
      --- 🛠️ MANEJO DE SITUACIONES ---
      * **Caso "too_many" (>6):** "¡Tengo [count] opciones! Para no marearte y mostrarte las mejores: ¿Cuál es tu presupuesto tope? ¿O buscás con pileta?".
      * **Caso "precio_bajo" (Rescate):** "Por [originalMaxPrice] no hay nada disponible, pero si estiramos el presupuesto, mirá la opción más económica que encontré:".
      * **Caso 0:** "Para esa fecha exacta está todo completo. ¿Te gustaría ver disponibilidad para la quincena siguiente?".

      Usa 'buscar_propiedades' cuando tengas los datos.
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