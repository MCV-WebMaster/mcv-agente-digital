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
  description: 'Busca propiedades. ÚSALA SOLO CUANDO TENGAS TODOS LOS DATOS.',
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
    // PAGINACIÓN PARA EL CHAT
    limit: z.number().optional().describe('Cantidad a mostrar (Default 3).'),
    offset: z.number().optional().describe('Desde dónde mostrar (para ver más).'),
    
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
        // Forzamos límite de 3 para el chat si no viene definido
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

        // 1. BÚSQUEDA (Ahora propertyService soporta limit/offset)
        let resultados = await searchProperties(filtros);

        // 2. PROTOCOLO DE RESCATE (Si da 0 total)
        if (resultados.count === 0) {
            // Rescate A: Quitar precio
            if (originalMaxPrice) {
                let rescueFilters = {...filtros, maxPrice: null, offset: 0};
                let resRescue = await searchProperties(rescueFilters);
                if (resRescue.count > 0) {
                    resultados = resRescue;
                    resultados.warning = `precio_bajo|${originalMaxPrice}`;
                    resultados.originalMaxPrice = originalMaxPrice;
                }
            }
            // Rescate B: Quitar barrio
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

        // 3. PROTOCOLO "MUCHOS RESULTADOS" (El Vendedor Experto)
        // Si es la primera página (offset 0), hay más de 5 resultados totales y NO hay filtro de precio ni pileta...
        // ... BLOQUEAMOS y pedimos filtro.
        if (filtros.offset === 0 && resultados.count > 5 && !filtros.maxPrice && !filtros.pool) {
            return {
                count: resultados.count,
                warning: "too_many",
                properties: [] 
            };
        }

        // 4. Mapeo seguro
        const safeProperties = (resultados.results || []).map(p => ({
            ...p,
            price: p.price || 0, 
            min_rental_price: p.min_rental_price || 0,
            title: p.title || 'Propiedad',
            summary: `${p.title} (${p.barrio || p.zona}). ${p.min_rental_price ? 'USD '+p.min_rental_price : (p.price ? 'USD '+p.price : 'Consultar')}.`
        }));

        return {
          count: resultados.count || 0, // Total disponible en DB
          showing: safeProperties.length, // Cantidad que enviamos ahora (3)
          nextOffset: filtros.offset + safeProperties.length, // Para que la IA sepa qué pedir después
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
      system: `Eres 'Asistente Comercial MCV', el mejor vendedor de la inmobiliaria.
      
      --- TU PERSONALIDAD DE VENTA ---
      1. **CORTÉS PERO DIRECTO:** No saludes dos veces. Ve al grano.
      2. **EL EMBUDO:** Nunca muestres propiedades sin filtrar.
         - Si piden Alquiler en Costa: 1. Periodo? -> 2. Pax? -> 3. Mascotas?
      3. **MANEJO DE VOLUMEN:**
         - Si la herramienta dice "warning: too_many", NO MUESTRES NADA. Pregunta: *"Encontré muchas opciones. Para darte las mejores, ¿cuál es tu presupuesto tope?"* o *"¿Buscas con pileta?"*.
      4. **LA REGLA DEL 3:**
         - Solo muestra 3 propiedades a la vez (la herramienta ya lo limita).
         - Después de mostrar las 3, **SIEMPRE** pregunta: *"¿Te gusta alguna de estas o quieres ver 3 opciones más?"* o *"¿Quieres refinar con palabras clave como 'Lavavajillas'?"*.
         - Si el usuario dice "ver más", llama a la herramienta con el \`offset\` que te dio la respuesta anterior.
      
      --- CIERRE ---
      Siempre intenta llevar al usuario a contactar a un humano cuando muestre interés real.
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