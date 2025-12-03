import { openai } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { searchProperties } from '@/lib/propertyService';

export const maxDuration = 60;
const model = openai('gpt-4o');

// Herramienta para contacto humano
const mostrarContactoTool = tool({
  description: 'Muestra el botón para contactar a un agente.',
  parameters: z.object({ motivo: z.string().optional() }),
  execute: async ({ motivo }) => ({ showButton: true, motivo }),
});

// Herramienta principal de búsqueda
const buscarPropiedadesTool = tool({
  description: 'Busca propiedades. ÚSALA SOLO CUANDO TENGAS TODOS LOS DATOS.',
  parameters: z.object({
    operacion: z.enum(['venta', 'alquiler_temporal', 'alquiler_anual']).optional(),
    zona: z.enum(['GBA Sur', 'Costa Esmeralda', 'Arelauquen (BRC)']).optional(),
    barrios: z.array(z.string()).optional().describe('Nombre OFICIAL del barrio.'),
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

        // 1. BÚSQUEDA INICIAL
        let resultados = await searchProperties(filtros);

        // 2. PROTOCOLO DE RESCATE (Si da 0)
        // Intento A: Si tiene precio, quitamos el precio.
        if (resultados.count === 0 && originalMaxPrice) {
            let rescueFilters = {...filtros, maxPrice: null};
            let resRescue = await searchProperties(rescueFilters);
            if (resRescue.count > 0) {
                resultados = resRescue;
                resultados.warning = `precio_bajo|${originalMaxPrice}`;
            }
        }
        
        // Intento B: Si tiene barrio específico y dio 0, buscamos en toda la zona (Lógica "Cualquiera")
        if (resultados.count === 0 && filtros.barrios && filtros.barrios.length > 0) {
            let rescueFilters = {...filtros};
            delete rescueFilters.barrios; // Quitamos el barrio
            let resRescue = await searchProperties(rescueFilters);
            if (resRescue.count > 0) {
                resultados = resRescue;
                resultados.warning = "barrio_ampliado"; // Aviso interno
            }
        }

        // Mapeo seguro (Evita crash del frontend)
        const safeProperties = (resultados.results || []).slice(0, 6).map(p => ({
            ...p,
            summary: `${p.title} (${p.barrio || p.zona}). ${p.min_rental_price ? 'USD '+p.min_rental_price : (p.price ? 'USD '+p.price : 'Consultar')}.`
        }));

        return {
          count: resultados.count || 0,
          warning: resultados.warning || null,
          originalMaxPrice: originalMaxPrice,
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
      system: `Eres 'Asistente Comercial MCV'.
      
      --- 🌍 MAPEO GEOGRÁFICO INTELIGENTE ---
      Si el usuario menciona un barrio genérico, DEBES mapearlo a todos sus sub-barrios:
      * **"Senderos"** -> barrios: ["Senderos I", "Senderos II", "Senderos III", "Senderos IV"]
      * **"Marítimo"** -> barrios: ["Marítimo I", "Marítimo II", "Marítimo III", "Marítimo IV"]
      * **"Golf"** -> barrios: ["Golf I", "Golf II"]
      * **"Residencial"** -> barrios: ["Residencial I", "Residencial II"]
      * **"El Carmen"** -> barrios: ["Club El Carmen"]
      * **"Fincas"** -> barrios: ["Fincas de Iraola", "Fincas de Iraola II"]
      
      --- 🚦 REGLAS DE FLUJO ---
      1. **UNA COSA A LA VEZ:** Pregunta dato por dato.
      2. **"CUALQUIERA":** Si el usuario dice "cualquiera" o "otro barrio", busca sin filtro de barrio en la misma zona.
      
      --- EMBUDO DE ALQUILER (Orden Estricto) ---
      1. Periodo Exacto (Si dicen "febrero", pregunta "¿1ra o 2da quincena?").
      2. Pax (Cantidad).
      3. Mascotas (Si/No).
      
      --- MANEJO DE RESULTADOS ---
      * Si la herramienta devuelve 'barrio_ampliado', di: "En Senderos no encontré disponibilidad, pero mirá estas opciones en barrios vecinos dentro de Costa Esmeralda:".
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