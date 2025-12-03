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
            // Limpieza robusta de precio (quita puntos, comas, k, $, USD)
            const cleanPrice = filtros.maxPrice.replace(/[\.,kK$USD\s]/g, '');
            originalMaxPrice = parseInt(cleanPrice);
            if (!isNaN(originalMaxPrice)) {
                // Si el usuario puso '200' (pensando en miles), lo multiplicamos
                if (originalMaxPrice < 1000) originalMaxPrice *= 1000; 
                
                filtros.maxPrice = (originalMaxPrice * 1.30).toString(); 
            } else {
                delete filtros.maxPrice; // Si no es numero, lo ignoramos
            }
        }
        filtros.sortBy = 'price_asc';

        // 1. BÚSQUEDA INICIAL
        let resultados = await searchProperties(filtros);

        // 2. PROTOCOLO DE RESCATE
        if (resultados.count === 0) {
            // Intento A: Quitar precio
            if (originalMaxPrice) {
                let rescueFilters = {...filtros, maxPrice: null};
                let resRescue = await searchProperties(rescueFilters);
                if (resRescue.count > 0) {
                    resultados = resRescue;
                    resultados.warning = `precio_bajo|${originalMaxPrice}`;
                    resultados.originalMaxPrice = originalMaxPrice;
                }
            }
            // Intento B: Quitar barrio (si no funcionó el precio)
            if (resultados.count === 0 && filtros.barrios && filtros.barrios.length > 0) {
                let rescueFilters = {...filtros};
                delete rescueFilters.barrios; 
                let resRescue = await searchProperties(rescueFilters);
                if (resRescue.count > 0) {
                    resultados = resRescue;
                    resultados.warning = "barrio_ampliado";
                }
            }
        }

        // 3. Sobrecarga (+10 resultados)
        if (resultados.count > 10 && !filtros.maxPrice && !filtros.pool) {
            return {
                count: resultados.count,
                warning: "too_many",
                properties: [] 
            };
        }

        // Mapeo seguro para frontend
        const safeProperties = (resultados.results || []).slice(0, 6).map(p => ({
            ...p,
            price: p.price || 0, 
            min_rental_price: p.min_rental_price || 0,
            title: p.title || 'Propiedad',
            summary: `${p.title} (${p.barrio || p.zona}). ${p.min_rental_price ? 'USD '+p.min_rental_price : (p.price ? 'USD '+p.price : 'Consultar')}.`
        }));

        return {
          count: resultados.count || 0,
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
      system: `Eres 'Asistente Comercial MCV'.
      
      --- 🌍 MAPEO GEOGRÁFICO ---
      * "Senderos" -> barrios: ["Senderos I", "Senderos II", "Senderos III", "Senderos IV"]
      * "Marítimo" -> barrios: ["Marítimo I", "Marítimo II", "Marítimo III", "Marítimo IV"]
      * "Golf" -> barrios: ["Golf I", "Golf II"]
      * "Residencial" -> barrios: ["Residencial I", "Residencial II"]
      * "El Carmen" -> barrios: ["Club El Carmen"]
      
      --- REGLAS ---
      1. Si el usuario pide ALQUILER, pregunta en orden: Periodo -> Pax -> Mascotas.
      2. Si el usuario dice "Cualquiera" (barrio), busca sin filtro de barrio.
      3. Si el resultado tiene "warning: too_many", pregunta presupuesto.
      4. Si el resultado tiene "warning: precio_bajo", avisa que son más caras y muéstralas.
      
      Usa 'buscar_propiedades' cuando tengas los datos necesarios.
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