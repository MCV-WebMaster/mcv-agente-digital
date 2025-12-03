import { openai } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { searchProperties } from '@/lib/propertyService';

export const maxDuration = 60;
const model = openai('gpt-4o');

const mostrarContactoTool = tool({
  description: 'Muestra el botón para contactar a un agente. Úsalo para cerrar.',
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
    maxPrice: z.string().optional(),
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
            if (!isNaN(clean)) filtros.maxPrice = (clean < 1000 ? clean * 1000 : clean).toString();
        }
        filtros.sortBy = 'price_asc';

        let resultados = await searchProperties(filtros);

        // Rescate
        if (resultados.count === 0) {
            if (originalMaxPrice) {
                let resRescue = await searchProperties({...filtros, maxPrice: null});
                if (resRescue.count > 0) {
                    resultados = resRescue;
                    resultados.warning = "precio_bajo";
                }
            } else if (filtros.barrios) {
                 let resRescue = await searchProperties({...filtros, barrios: undefined});
                 if (resRescue.count > 0) {
                    resultados = resRescue;
                    resultados.warning = "barrio_ampliado";
                 }
            }
        }

        // Sobrecarga (Si > 10 y es página 1 y no hay filtro fuerte)
        const hasFilter = filtros.maxPrice || filtros.pool || filtros.selectedPeriod;
        if (resultados.count > 10 && !hasFilter && filtros.offset === 0) {
             return { count: resultados.count, warning: "too_many", properties: [] };
        }

        const safeProperties = (resultados.results || []).map(p => ({
            ...p,
            price: p.price || 0, 
            min_rental_price: p.min_rental_price || 0,
            found_period_price: p.found_period_price || 0,
            title: p.title,
            // Summary mínimo para que la IA no se tiente a describir
            summary: `ID: ${p.property_id}` 
        }));

        return {
          count: resultados.count || 0,
          showing: safeProperties.length,
          nextOffset: filtros.offset + safeProperties.length,
          warning: resultados.warning || null,
          appliedFilters: filtros, 
          properties: safeProperties 
        };

    } catch (error) {
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
      
      --- 🛑 REGLAS DE SALIDA ESTRICTAS 🛑 ---
      
      1. **SI LA HERRAMIENTA MUESTRA PROPIEDADES:**
         - TU RESPUESTA DEBE SER EXACTAMENTE ESTA PLANTILLA (NO AGREGUES NADA MÁS):
         "Estas son **[showing]** opciones de **[count]** encontradas para [Criterio].
         ¿Te gusta alguna de estas opciones? ¿Te gustaría ver más o contactar a un agente?"
         
         - **PROHIBIDO:** Listar las casas, repetir precios, describir características. ¡YA SE VEN EN LAS TARJETAS!

      2. **SI LA HERRAMIENTA DICE "too_many":**
         - Di: "¡Tengo [count] opciones! Para filtrar las mejores, ¿cuál es tu presupuesto tope o buscás con pileta?".

      3. **SI LA HERRAMIENTA DICE 0 (Cero):**
         - Di: "Para esa fecha exacta no encontré, pero tengo opciones en la quincena siguiente (o barrios vecinos). ¿Las miramos?".

      --- 🚦 FLUJO ---
      - **ALQUILER:** 1. Fecha Exacta -> 2. Pax -> 3. "¿Llevan mascotas?".
      - **VENTA:** 1. "¿Dormitorios?" -> 2. "¿Presupuesto?".
      
      --- 🗺️ MAPEO ---
      - "Costa" = Costa Esmeralda.
      - "Senderos" = Senderos I, II, III, IV.
      - "Carnaval" = Febrero 1ra.
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