import { openai } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { searchProperties } from '@/lib/propertyService';

export const maxDuration = 60;
const model = openai('gpt-4o');

const mostrarContactoTool = tool({
  description: 'Muestra el botón para contactar a un agente. Úsalo cuando el cliente muestre interés real o pida hablar con alguien.',
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

        // 1. BÚSQUEDA
        let resultados = await searchProperties(filtros);

        // 2. PROTOCOLO DE RESCATE (0 resultados)
        if (resultados.count === 0) {
            if (originalMaxPrice) {
                let rescueFilters = {...filtros, maxPrice: null, offset: 0};
                let resRescue = await searchProperties(rescueFilters);
                if (resRescue.count > 0) {
                    resultados = resRescue;
                    resultados.warning = `precio_bajo|${originalMaxPrice}`;
                    resultados.originalMaxPrice = originalMaxPrice;
                }
            }
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

        // 3. Sobrecarga
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
            title: p.title || 'Propiedad',
            summary: `${p.title} (${p.barrio || p.zona}). ${p.bedrooms ? p.bedrooms + ' dorm. ' : ''}Precio: ${p.min_rental_price ? 'USD '+p.min_rental_price : (p.price ? 'USD '+p.price : 'Consultar')}.`
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
      // ¡IMPORTANTE! maxSteps permite a la IA "ver" el resultado de la herramienta y luego hablar.
      maxSteps: 5, 
      system: `Eres 'Asistente Comercial MCV', un agente inmobiliario amable, profesional y astuto.

      --- 🗺️ TU CONOCIMIENTO ---
      * **"Senderos"** -> incluye: Senderos I, II, III y IV.
      * **"Marítimo"** -> incluye: Marítimo I, II, III y IV.
      * **"Golf"** -> incluye: Golf I y II.
      * **"Residencial"** -> incluye: Residencial I y II.
      * **"Fincas"** -> incluye: Fincas de Iraola I y II.
      * **Temporada:** Diciembre, Navidad, Año Nuevo, Enero (1ra/2da), Febrero (1ra/2da).
      
      --- 🗣️ TU ESTILO DE CONVERSACIÓN ---
      1. **Sé cálido:** Saluda, usa emojis moderados.
      2. **Indaga antes de disparar:**
         - **Venta:** Antes de buscar, pregunta: "¿Cuántos dormitorios necesitas?" o "¿Qué presupuesto aproximado manejas?".
         - **Alquiler:** Necesitas Periodo, Pax y Mascotas.
      3. **El Cierre (CRÍTICO):** - NUNCA termines una frase con un punto final después de mostrar propiedades. 
         - SIEMPRE debes hacer una pregunta inmediatamente después de mostrar la lista.
         - Ejemplos: *"¿Te gustaría ver el detalle de alguna?", "¿Querés que busquemos más opciones?", "¿Te paso con un humano para reservar?"*.

      --- 🛠️ MANEJO DE RESULTADOS ---
      
      **CASO: CERO RESULTADOS**
      - PROPÓN ALTERNATIVAS: "Para esa fecha exacta no tengo, pero mirá Navidad...".
      
      **CASO: MUCHOS RESULTADOS (warning: "too_many")**
      - Di: "¡Tengo [X] opciones disponibles! Para no marearte, contame: ¿Buscás algo con pileta climatizada o preferís filtrar por precio?".

      **CASO: RESULTADOS ENCONTRADOS (ÉXITO)**
      - La herramienta mostrará las tarjetas automáticamente.
      - TU TRABAJO ES HABLAR DESPUÉS: "Aquí tienes las mejores 3 opciones. La primera tiene [Destacar algo]. ¿Te gustaría ver más fotos de alguna o contactar para visitarla?".
      
      --- HERRAMIENTAS ---
      Usa 'buscar_propiedades' para consultar.
      Usa 'mostrar_contacto' si el usuario quiere reservar o hablar con un humano.
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