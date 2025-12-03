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
  description: 'Busca propiedades en la base de datos. ÚSALA SOLO CUANDO TENGAS TODOS LOS DATOS.',
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
        console.log("🤖 IA Input:", filtros);
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

        let resultados = await searchProperties(filtros);

        if (resultados.count === 0) {
            if (originalMaxPrice) {
                let rescueFilters = {...filtros, maxPrice: null, offset: 0};
                let resRescue = await searchProperties(rescueFilters);
                if (resRescue.count > 0) {
                    resultados = resRescue;
                    resultados.warning = `precio_bajo|${originalMaxPrice}`;
                    resultados.originalMaxPrice = originalMaxPrice;
                }
            } else if (filtros.barrios && filtros.barrios.length > 0) {
                let rescueFilters = {...filtros, offset: 0};
                delete rescueFilters.barrios; 
                let resRescue = await searchProperties(rescueFilters);
                if (resRescue.count > 0) {
                    resultados = resRescue;
                    resultados.warning = "barrio_ampliado";
                }
            }
        }

        if (resultados.count > 10 && !filtros.maxPrice && !filtros.pool && !filtros.bedrooms && filtros.offset === 0) {
            return {
                count: resultados.count,
                warning: "too_many",
                properties: [] 
            };
        }

        const safeProperties = (resultados.results || []).map(p => ({
            ...p,
            price: p.price || 0, 
            min_rental_price: p.min_rental_price || 0,
            found_period_price: p.found_period_price || 0,
            title: p.title || 'Propiedad',
            summary: `${p.title} (${p.barrio || p.zona}).` 
        }));

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
        console.error("Error en tool buscar_propiedades:", error);
        return { count: 0, properties: [], error: "Error interno." };
    }
  },
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { messages } = req.body;

  try {
    const result = await streamText({
      model: model,
      messages: messages,
      maxSteps: 5, 
      system: `Eres 'Asistente Comercial MCV'.

      --- 🗺️ MAPEO DE BARRIOS Y ZONAS ---
      * **"Senderos"** -> barrios: ["Senderos I", "Senderos II", "Senderos III", "Senderos IV"]
      * **"Marítimo"** -> barrios: ["Marítimo I", "Marítimo II", "Marítimo III", "Marítimo IV"]
      * **"Golf"** -> barrios: ["Golf I", "Golf II"]
      * **"Residencial"** -> barrios: ["Residencial I", "Residencial II"]
      * **"El Carmen"** -> barrios: ["Club El Carmen"]
      * **"Costa"** -> zona: "Costa Esmeralda"
      
      --- 📅 MAPEO DE FECHAS (2026) ---
      * **"Carnaval"** -> "Febrero 1ra Quincena" (o pregunta si prefieren febrero completo).
      * **"Enero"** -> Pregunta: "¿1ra o 2da quincena?".
      * **"Febrero"** -> Pregunta: "¿1ra o 2da quincena?".
      
      --- 🚦 REGLAS DE CONVERSACIÓN ---
      1. **UNA PREGUNTA A LA VEZ:** No ametralles al usuario.
      2. **PREGUNTA DE MASCOTAS:** Di siempre: **"¿Llevan mascotas?"** o **"¿Viajan con mascotas?"**. NUNCA digas "¿Se permiten mascotas?" (eso confunde).
      
      --- 🚫 PROHIBICIÓN ABSOLUTA DE TEXTO ---
      * Si la herramienta devuelve resultados, **NO ESCRIBAS LA LISTA EN TEXTO**.
      * El usuario YA VE las tarjetas visuales. Tu texto debe ser SOLO:
        *"Aquí tienes las [X] mejores opciones. ¿Cuál te gusta más?"* o *"¿Te gustaría ver más?"*.
      * **Bajo ninguna circunstancia repitas títulos o precios en tu respuesta de texto.**
      
      --- 🛠️ MANEJO DE RESULTADOS ---
      * **0 Resultados:** "Para esa fecha exacta está difícil, pero tengo disponibilidad para [Fecha Alternativa]. ¿Te gustaría verlas?".
      * **Muchos Resultados:** "Tengo muchas opciones. Para filtrar las mejores: ¿Cuál es tu presupuesto tope?".
      
      Usa 'buscar_propiedades' cuando tengas Periodo, Pax y Mascotas.
      `,
      tools: {
        buscar_propiedades: buscarPropiedadesTool,
        mostrar_contacto: mostrarContactoTool,
      },
    });

    result.pipeDataStreamToResponse(res);

  } catch (error) {
    console.error('Error en Chat API:', error);
    res.status(500).json({ error: error.message });
  }
}