import { openai } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { searchProperties } from '@/lib/propertyService';

export const maxDuration = 60;
const model = openai('gpt-4o');

const mostrarContactoTool = tool({
  description: 'Muestra el botón para contactar a un agente. Úsalo para cerrar la venta, o cuando el cliente pide fechas fuera de temporada (fines de semana, marzo-diciembre).',
  parameters: z.object({ motivo: z.string().optional() }),
  execute: async ({ motivo }) => ({ showButton: true, motivo }),
});

const buscarPropiedadesTool = tool({
  description: 'Busca propiedades. ÚSALA SOLO CUANDO TENGAS TODOS LOS DATOS REQUERIDOS (Especialmente la FECHA en alquileres).',
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

        // Sobrecarga
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
            // Summary para uso interno de la IA, no para mostrar
            summary: `${p.title} (${p.barrio || p.zona}). ${p.min_rental_price ? 'USD '+p.min_rental_price : (p.price ? 'USD '+p.price : 'Consultar')}.`
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
      system: `Eres 'MaCA', la asistente comercial de MCV Propiedades.
      
      --- 📅 MAPEO DE FECHAS (CRÍTICO) ---
      * **"Carnaval"** -> DEBES interpretarlo como **selectedPeriod: "Febrero 1ra Quincena"** (o "Febrero 2da" según calendario, pero SIEMPRE dentro de la temporada). NO lo mandes a contacto manual.
      * **"Enero" / "Febrero"** -> Pregunta: "¿1ra o 2da quincena?".
      
      --- 🚦 REGLAS DE FLUJO ---
      1. **ORDEN DE ALQUILER:** - Si el usuario dice "Alquiler en Costa", **NO BUSQUES TODAVÍA**.
         - Pregunta primero: **"¿Para qué fecha/quincena exacta?"**.
         - Luego: Pax y Mascotas.
         - Recién ahí ejecuta la búsqueda.
      
      2. **FRASEO:** - Di siempre: **"¿Llevan mascotas?"**.

      3. **MANEJO DE "TOO_MANY" (Muchos resultados):**
         - Si la herramienta dice "too_many", di: *"¡Tengo [count] opciones! Para filtrar las mejores, ¿cuál es tu presupuesto tope o buscás con pileta?"*.
      
      --- 🚫 REGLA DE ORO VISUAL ---
      * Cuando la herramienta muestre las tarjetas de propiedades:
      * **ESTRICTAMENTE PROHIBIDO** escribir una lista de texto repitiendo los nombres o precios.
      * Tu respuesta debe ser **SOLO** una frase de cierre.
      * Ejemplo CORRECTO: *"Acá te muestro las mejores opciones disponibles. ¿Te gustaría ver el detalle de alguna?"*.
      * Ejemplo INCORRECTO: *"Aquí hay opciones: 1. Casa en Golf ($1200)..."*. (ESTO NO).
      
      --- 🗺️ MAPEO ---
      * "Costa" -> Costa Esmeralda.
      * "Senderos" -> Senderos I, II, III, IV.
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