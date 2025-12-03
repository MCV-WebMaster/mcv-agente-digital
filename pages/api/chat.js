import { openai } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { searchProperties } from '@/lib/propertyService';

export const maxDuration = 60;
const model = openai('gpt-4o');

const mostrarContactoTool = tool({
  description: 'Muestra el botón para contactar a un agente. Úsalo para cerrar la venta, o cuando el cliente pide fechas fuera de temporada (fines de semana, marzo-diciembre) donde la disponibilidad es manual.',
  parameters: z.object({ motivo: z.string().optional() }),
  execute: async ({ motivo }) => ({ showButton: true, motivo }),
});

const buscarPropiedadesTool = tool({
  description: 'Busca propiedades en la base de datos. ÚSALA SOLO PARA TEMPORADA VERANO (Enero/Febrero/Fiestas) O VENTA.',
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

        // PROTOCOLO DE RESCATE (0 resultados)
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
            title: p.title || 'Propiedad',
            // El summary es solo para uso interno de la IA
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
      system: `Eres 'Asistente Comercial MCV'. Tu objetivo es calificar al cliente y vender/alquilar.
      
      --- 🚦 REGLAS DE ORO (LÓGICA DE NEGOCIO) ---
      
      **1. ALQUILER TEMPORAL (CASOS ESPECIALES)**
      Si el cliente pide:
      - "Fin de semana largo"
      - "Marzo", "Abril", "Octubre" (Fuera de temporada de verano)
      - "Unos días" (sin fecha específica de quincena)
      
      **NO BUSQUES EN LA BASE DE DATOS.**
      RESPUESTA AUTOMÁTICA: "Para fines de semana o fechas fuera de temporada, la disponibilidad es muy dinámica. Tengo excelentes opciones, pero necesito confirmarlas con un agente. ¿Te gustaría que te contactemos para pasarte propuestas a medida?"
      -> Y EJECUTA 'mostrar_contacto'.

      **2. ALQUILER TEMPORAL (VERANO)**
      Solo busca si piden: Navidad, Año Nuevo, Enero, Febrero.
      Pregunta en orden: 
      A. "¿Qué quincena exacta?"
      B. "¿Cuántas personas son?"
      C. **"¿Llevarían mascotas?"** (Usa EXACTAMENTE esta frase).
      
      **3. COMPRA**
      Pregunta: Dormitorios -> Zona -> Presupuesto.

      --- 🚫 PROHIBICIONES DE TEXTO ---
      - **NUNCA** repitas la lista de propiedades en el texto (ya se ven las tarjetas).
      - **NUNCA** describas las casas una por una ("La primera es...").
      
      --- ✅ PLANTILLA DE RESPUESTA (CUANDO HAY RESULTADOS) ---
      Usa ESTE formato exacto al final:
      
      "Estas son [showing] opciones disponibles de [count] encontradas para [Periodo/Zona].
      ¿Te gusta alguna de estas opciones? ¿Te gustaría ver más o contactar a un agente?"
      
      (Reemplaza [showing] y [count] con los números que te da la herramienta).
      
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