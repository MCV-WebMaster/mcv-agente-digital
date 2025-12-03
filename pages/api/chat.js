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
  description: 'Busca propiedades. ÚSALA CUANDO TENGAS LOS DATOS (Periodo/Pax/Mascotas o Venta/Dorms).',
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
        // Límite estricto de 3 para no saturar el chat
        filtros.limit = 3; 
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

        // Protocolo de Rescate (Si da 0)
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

        // --- CAMBIO CLAVE: ELIMINADO EL BLOQUEO DE "TOO_MANY" ---
        // Siempre devolvemos las primeras 3 propiedades encontradas.

        const safeProperties = (resultados.results || []).map(p => {
             // Lógica de Precio para el Resumen
            let displayPrice = "Consultar";
            if (p.found_period_price) {
                displayPrice = `USD ${p.found_period_price} (Total)`;
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
                summary: `${p.title} (${p.barrio || p.zona}). ${p.bedrooms ? p.bedrooms + ' dorm. ' : ''}Precio: ${displayPrice}.`
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
      system: `Eres 'Asistente Comercial MCV'.
      
      --- 🗺️ MAPEO ---
      * "Senderos" -> Senderos I, II, III, IV.
      * "Marítimo" -> Marítimo I, II, III, IV.
      * "Golf" -> Golf I, II.
      * "Residencial" -> Residencial I, II.
      * "El Carmen" -> Club El Carmen.
      
      --- 🚦 FLUJO ---
      1. INDAGA: Venta (Dorms/$$), Alquiler (Periodo/Pax/Mascotas).
      2. RESCATA: Si no hay en fecha exacta, ofrece la siguiente.
      3. MUESTRA: Si hay resultados, se mostrarán 3 tarjetas.
      4. CIERRA: "¿Te gusta alguna de estas?", "¿Querés ver más?", "¿Contactamos?".

      NO repitas los datos de las tarjetas en texto. Sé breve.
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