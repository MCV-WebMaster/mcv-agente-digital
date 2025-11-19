import { openai } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';
// Importamos searchProperties desde la librería (como usted lo tenía)
import { searchProperties } from '@/lib/propertyService'; 

export const maxDuration = 60;
const model = openai('gpt-4o');

// 1. Definir la herramienta de contacto de forma separada y clara
const mostrarContactoTool = tool({
    description: 'Muestra el botón para contactar a un agente humano.',
    parameters: z.object({ 
        motivo: z.string().optional() 
    }),
    execute: async ({ motivo }) => ({ showButton: true, motivo }),
});

// 2. Definir la herramienta de búsqueda de forma separada y clara
const buscarPropiedadesTool = tool({
    description: 'Ejecuta la búsqueda en la base de datos. Úsala solo cuando tengas Zona + Operación + (Fechas/Pax/Presupuesto).',
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
        maxPrice: z.string().optional().describe('Presupuesto máximo.'),
        searchText: z.string().optional(),
        selectedPeriod: z.enum([
            'Navidad', 'Año Nuevo', 'Año Nuevo con 1ra Enero',
            'Enero 1ra Quincena', 'Enero 2da Quincena', 
            'Febrero 1ra Quincena', 'Febrero 2da Quincena', 'Diciembre 2da Quincena'
        ]).optional(),
    }),
    execute: async (filtros) => {
        console.log("🤖 IA Input:", filtros);
        
        // Lógica de Venta Automática
        if (filtros.pax) filtros.pax_or_more = true;
        
        let originalMaxPrice = null;
        if (filtros.maxPrice) {
            originalMaxPrice = parseInt(filtros.maxPrice.replace(/\D/g, ''));
            if (!isNaN(originalMaxPrice)) {
                filtros.maxPrice = (originalMaxPrice * 1.30).toString(); 
            }
        }
        filtros.sortBy = 'price_asc';

        let resultados = await searchProperties(filtros);
        
        // PROTOCOLO DE RESCATE (si da 0)
        if (resultados.count === 0) {
            if (originalMaxPrice) {
                let rescueFilters = {...filtros, maxPrice: null};
                let resRescue = await searchProperties(rescueFilters);
                
                if (resRescue.count > 0) {
                    resultados = resRescue;
                    resultados.warning = "ignore_price";
                    resultados.originalMaxPrice = originalMaxPrice;
                }
            }
        }

        return {
            count: resultados.count,
            warning: resultados.warning || null,
            originalMaxPrice: resultados.originalMaxPrice || null,
            appliedFilters: filtros, 
            properties: resultados.results.slice(0, 10).map(p => ({
                ...p,
                summary: `${p.title} (${p.barrio || p.zona}). Precio: ${p.min_rental_price ? 'USD '+p.min_rental_price : (p.found_period_price ? 'USD '+p.found_period_price : (p.price ? 'USD '+p.price : 'Consultar'))}.`
            }))
        };
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
      system: `Eres 'Asistente Comercial MCV', un VENDEDOR PROACTIVO y METÓDICO.
      
      --- REGLAS DE CONVERSACIÓN (CLAVE) ---
      1. **UNA PREGUNTA A LA VEZ:** Si recibes una respuesta parcial (ej. solo PAX), DEBES preguntar SOLAMENTE por el siguiente dato FALTANTE.
      2. **MAPEO OBLIGATORIO:** Traduce "el carmen" a "Club El Carmen", etc.
      
      --- 🎯 FILTRO ESTRATÉGICO (EL EMBUDO) ---
      
      **CRITERIOS MÍNIMOS OBLIGATORIOS ANTES DE BUSCAR:**
      - Operación, Zona, Periodo (si es Temporal), PAX (si es Temporal).
      
      **LÍMITE DE RESULTADOS:**
      - Si la búsqueda devuelve más de 10 propiedades, NO las muestres.
      - Debes decir: "Tengo muchas opciones. Para encontrar la ideal, ¿buscas con pileta, pileta climatizada, o presupuesto?" (Fuerza un filtro nuevo).
      
      **CERO RESULTADOS (RECUPERACIÓN):**
      - Si da 0, aplica el protocolo de rescate (busca sin presupuesto, cambia barrio) y avisa de forma proactiva.

      --- HERRAMIENTAS ---
      Usa 'buscar_propiedades' solo cuando cumplas los Criterios Mínimos.
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