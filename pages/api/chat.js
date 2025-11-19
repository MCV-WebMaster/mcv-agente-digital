import { openai } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { searchProperties } from '@/lib/propertyService';

export const maxDuration = 60;
const model = openai('gpt-4o');

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
      
      --- REGLAS DE CONVERSACIÓN Y VENTA (OBLIGATORIAS) ---
      1. **UNA PREGUNTA A LA VEZ (CRÍTICO):** No hagas preguntas compuestas. Espera la respuesta de un dato antes de preguntar el siguiente.
      2. **MAPEO/SINÓNIMOS:** Siempre traduce "el carmen" a "Club El Carmen" o "fincas 2" a "Fincas de Iraola II" (usando tu conocimiento geográfico).
      
      --- 🎯 FILTRO ESTRATÉGICO (EL EMBUDO) ---
      
      **CRITERIOS MÍNIMOS OBLIGATORIOS ANTES DE BUSCAR:**
      - Operación, Zona, Periodo (si es Temporal), PAX.
      - Si tienes todos los datos y aun así el resultado es **>10**, DEBES preguntar un filtro adicional (Pileta/Presupuesto) antes de mostrar.
      
      **RESPUESTA DE CERO RESULTADOS:**
      - Si da 0, intenta la estrategia de rescate (quitar presupuesto, cambiar barrio) y avisa al cliente de forma proactiva.
      
      --- HERRAMIENTAS ---
      Usa 'buscar_propiedades' solo cuando creas que el resultado será conciso (idealmente <= 10).
      `,
      tools: {
        buscar_propiedades: tool({
          description: 'Ejecuta la búsqueda en la base de datos.',
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
            console.log("🤖 IA Input (Vendedor):", filtros);
            
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
            
            // --- INICIO DE BÚSQUEDA ---
            let resultados = await searchProperties(filtros);
            
            // 1. PROTOCOLO DE RECUPERACIÓN (Si da 0)
            if (resultados.count === 0) {
                if (originalMaxPrice) {
                    let rescueFilters = {...filtros, maxPrice: null};
                    let resRescue = await searchProperties(rescueFilters);
                    
                    if (resRescue.count > 0) {
                        // Rescate exitoso: notificamos a la IA y pasamos el rescate
                        resultados = resRescue;
                        return {
                          count: resultados.count,
                          appliedFilters: filtros, 
                          originalMaxPrice: originalMaxPrice,
                          warning: `No encontré nada por debajo de ${originalMaxPrice}, pero tengo estas opciones que arrancan en ${resultados.properties[0].min_rental_price || resultados.properties[0].price}.`,
                          properties: resultados.results.slice(0, 10).map(p => ({
                            ...p,
                            summary: `${p.title} (${p.barrio || p.zona}). ${p.pax ? p.pax + ' Pax. ' : ''}Precio: ${p.min_rental_price ? 'USD '+p.min_rental_price : (p.found_period_price ? 'USD '+p.found_period_price : (p.price ? 'USD '+p.price : 'Consultar'))}.`
                          }))
                        };
                    }
                }
            }
            
            // 2. PROTOCOLO DE EMBALAR (Si hay muchos resultados)
            if (resultados.count > 10) {
                // Devolvemos el conteo y un mensaje especial para que la IA sepa qué preguntar
                return {
                    count: resultados.count,
                    appliedFilters: filtros,
                    properties: [], // No mostramos la lista para no abrumar
                    warning: "too_many_results"
                };
            }


            return {
              count: resultados.count,
              appliedFilters: filtros, 
              properties: resultados.results.slice(0, 10).map(p => ({
                ...p,
                summary: `${p.title} (${p.barrio || p.zona}). Precio: ${p.min_rental_price ? 'USD '+p.min_rental_price : (p.found_period_price ? 'USD '+p.found_period_price : (p.price ? 'USD '+p.price : 'Consultar'))}.`
              }))
            };
          },
        }),
        mostrar_contacto: tool({
          description: 'Muestra el botón de contacto.',
          parameters: z.object({ motivo: z.string().optional() }),
          execute: async ({ motivo }) => ({ showButton: true, motivo }),
        }),
      },
    });

    result.pipeDataStreamToResponse(res);

  } catch (error) {
    console.error('Error en Chat API:', error);
    res.status(500).json({ error: error.message });
  }
}