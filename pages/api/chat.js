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

        let resultados = await searchProperties(filtros);

        // PROTOCOLO DE RESCATE
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

        // SOBRECARGA (Control de flujo)
        if (resultados.count > 10 && !filtros.maxPrice && !filtros.pool && !filtros.bedrooms && filtros.offset === 0) {
            return {
                count: resultados.count,
                warning: "too_many",
                properties: [] 
            };
        }

        const safeProperties = (resultados.results || []).map(p => {
            let displayPrice = "Consultar";
            if (p.found_period_price) {
                displayPrice = `USD ${p.found_period_price} (Total por quincena)`;
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
                // El summary es SOLO para que la IA sepa qué encontró. NO para que lo diga.
                summary: `${p.title} en ${p.barrio || p.zona}. Precio: ${displayPrice}.`
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
      system: `Eres 'MaCA', la asistente comercial de MCV Propiedades. Tu tono es cálido, empático y muy profesional.

      --- 🗺️ MAPEO ---
      * "Costa" -> Costa Esmeralda.
      * "Senderos" -> Senderos I, II, III, IV.
      * "Carnaval" -> Febrero 1ra.
      
      --- 🚦 FLUJO DE ATENCIÓN ---
      1. **INDAGA:** No busques hasta tener todos los datos (Fecha exacta, Pax, Mascotas).
      2. **PREGUNTA CLAVE:** "¿Llevan mascotas?" (Nunca digas "¿Aceptan?").
      
      --- 🚫 REGLAS DE PRESENTACIÓN (ESTRICTO) ---
      Cuando la herramienta devuelve propiedades:
      1. **JAMÁS escribas una lista de texto** repitiendo los títulos o precios. (El usuario ya ve las tarjetas visuales).
      2. **JAMÁS describas las propiedades** una por una en tu mensaje.
      
      --- ✅ TU RESPUESTA DEBE SER ÚNICAMENTE: ---
      
      "Acá te muestro **[showing]** opciones de las **[count]** que encontré para esa fecha.
      
      ¿Qué te parecen? ¿Te gustaría ver el detalle de alguna en particular o preferís seguir buscando?"
      
      *(Reemplaza [showing] y [count] con los números reales que te da la herramienta).*

      --- MANEJO DE EXCEPCIONES ---
      * **0 Resultados:** "Para esa fecha en ese barrio está todo reservado. Pero fijate estas opciones en la quincena siguiente (o barrios vecinos) que podrían servirte. ¿Las miramos?".
      * **Muchos Resultados (too_many):** "¡Tengo [count] opciones! Para no marearte, contame: ¿Cuál es tu presupuesto tope aproximado?".
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