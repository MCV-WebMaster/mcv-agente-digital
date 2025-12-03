import { openai } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { searchProperties } from '@/lib/propertyService';

export const maxDuration = 60;
const model = openai('gpt-4o');

const mostrarContactoTool = tool({
  description: 'Muestra el botón para contactar a un agente humano.',
  parameters: z.object({ motivo: z.string().optional() }),
  execute: async ({ motivo }) => ({ showButton: true, motivo }),
});

const buscarPropiedadesTool = tool({
  description: 'Busca propiedades en la base de datos.',
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
        
        let originalMaxPrice = null;
        if (filtros.maxPrice) {
            originalMaxPrice = parseInt(filtros.maxPrice.replace(/\D/g, ''));
            if (!isNaN(originalMaxPrice)) {
                filtros.maxPrice = (originalMaxPrice * 1.30).toString(); 
            }
        }
        filtros.sortBy = 'price_asc';

        // Ejecución segura
        let resultados = await searchProperties(filtros);

        // Protocolo de Rescate (0 resultados)
        if (resultados.count === 0) {
            if (originalMaxPrice) {
                let rescueFilters = {...filtros, maxPrice: null};
                let resRescue = await searchProperties(rescueFilters);
                if (resRescue.count > 0) {
                    resultados = resRescue;
                    resultados.warning = `precio_bajo|${originalMaxPrice}`;
                    resultados.originalMaxPrice = originalMaxPrice;
                }
            }
        }

        // Mapeo seguro de propiedades
        const safeProperties = (resultados.results || []).slice(0, 6).map(p => ({
            ...p,
            summary: `${p.title} (${p.barrio || p.zona}). ${p.min_rental_price ? 'USD '+p.min_rental_price : (p.price ? 'USD '+p.price : 'Consultar')}.`
        }));

        return {
          count: resultados.count || 0,
          warning: resultados.warning || null,
          originalMaxPrice: resultados.originalMaxPrice || null,
          appliedFilters: filtros, 
          properties: safeProperties // Siempre devuelve array
        };

    } catch (error) {
        console.error("Error en tool buscar_propiedades:", error);
        // Fallback para no romper el chat
        return { count: 0, properties: [], error: "Hubo un error interno en la búsqueda." };
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
      system: `Eres 'Asistente Comercial MCV'.
      
      --- REGLAS DE FLUJO ---
      1. **UNA PREGUNTA A LA VEZ:** No preguntes todo junto.
      2. **SIEMPRE RESPONDE:** Nunca te quedes en silencio. Si la herramienta tarda, di "Estoy buscando...".
      3. **MAPEO:** "El Carmen" -> "Club El Carmen". "Deportiva" -> "Costa Esmeralda".

      --- EMBUDO DE ALQUILER ---
      Orden estricto de preguntas:
      1. Periodo (Quincena exacta).
      2. Pax (Cantidad).
      3. Mascotas (Si/No).
      4. Presupuesto (Solo si hay muchas opciones).

      --- MANEJO DE ERRORES ---
      Si la búsqueda da 0, ofrece alternativas proactivamente.

      Usa 'buscar_propiedades' cuando tengas los datos.
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