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
      system: `Eres 'El Asistente Comercial de MCV Propiedades', un VENDEDOR PROACTIVO y METÓDICO.
      
      --- REGLAS DE CONVERSACIÓN (CLAVE) ---
      1. **UNA PREGUNTA A LA VEZ:** Siempre haz una pregunta y espera la respuesta. No hagas "preguntas ametralladora".
      2. **VENTA RÁPIDA:** Si hay opciones disponibles, muéstralas de inmediato (máximo 6) y luego haz una pregunta de cierre (presupuesto/pileta/contacto).
      3. **Ambientes/Dormitorios:** Si dicen "X ambientes", asume "X-1 dormitorios".
      
      --- 🎯 FILTRO Y RECUPERACIÓN ---
      
      **CRITERIOS MÍNIMOS OBLIGATORIOS ANTES DE BUSCAR:**
      - Operación, Zona, Periodo (si es Temporal), PAX (si es Temporal).
      
      **PROTOCOLO DE RECUPERACIÓN (SI HAY 0):**
      - NO digas "No encontré nada". Ejecuta la lógica de rescate (busca sin precio o en barrio vecino).
      - Si el rescate funciona, di: "No tenía opciones por [Presupuesto original], pero tengo estas opciones que arrancan en [Precio Mínimo Real]." (Es una venta asistida).

      **MANEJO DE RESULTADOS (+10):**
      - Si encuentras más de 10, muestra las primeras 6, y luego haz una pregunta para forzar un nuevo filtro (Ej: "¿Con pileta? ¿O cuál es el presupuesto que manejas?").
      
      --- HERRAMIENTAS ---
      Usa 'buscar_propiedades' solo cuando cumplas los Criterios Mínimos.
      `,
      tools: {
        buscar_propiedades: tool({
          description: 'Ejecuta la búsqueda en la base de datos.',
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
            
            // 1. Pre-procesamiento
            if (filtros.pax) filtros.pax_or_more = true;
            let originalMaxPrice = null;
            if (filtros.maxPrice) {
                originalMaxPrice = parseInt(filtros.maxPrice.replace(/\D/g, ''));
                if (!isNaN(originalMaxPrice)) {
                    filtros.maxPrice = (originalMaxPrice * 1.30).toString(); 
                }
            }

            filtros.sortBy = 'price_asc';

            // --- 2. BÚSQUEDA INICIAL ---
            let resultados = await searchProperties(filtros);

            // --- 3. PROTOCOLO DE RESCATE (SI HAY 0) ---
            if (resultados.count === 0) {
                // Intento 1: Eliminar filtro de precio
                if (originalMaxPrice) {
                    let rescueFilters = {...filtros, maxPrice: null};
                    let resRescue = await searchProperties(rescueFilters);
                    
                    if (resRescue.count > 0) {
                        // Rescate exitoso: notificamos a la IA y pasamos el rescate
                        resultados = resRescue;
                        // Añadimos el warning para que la IA sepa que debe disculparse por el precio
                        resultados.warning = `precio_bajo|${originalMaxPrice}`;
                        resultados.originalMaxPrice = originalMaxPrice; 
                    }
                }
            }

            // 4. Devolvemos los resultados (la IA decide si bloquear o mostrar)
            return {
              count: resultados.count,
              warning: resultados.warning || null,
              originalMaxPrice: resultados.originalMaxPrice || null,
              appliedFilters: filtros, 
              // Mostramos más de 10 para que la IA tenga contexto, pero solo 6 se renderizarán en el chat
              properties: resultados.results.slice(0, 15).map(p => ({ 
                ...p,
                summary: `${p.title} (${p.barrio || p.zona}). ${p.pax ? p.pax + ' Pax. ' : ''}Precio: ${p.min_rental_price ? 'USD '+p.min_rental_price : (p.found_period_price ? 'USD '+p.found_period_price : (p.price ? 'USD '+p.price : 'Consultar'))}.`
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

    // --- MANEJO DEL OUTPUT FINAL (EL VENDEDOR HABLA) ---
    const finalResult = await result.response;
    
    // Si la IA devolvió una advertencia, la modificamos para que el texto sea persuasivo
    if (finalResult.toolInvocations && finalResult.toolInvocations.length > 0) {
        const toolResult = finalResult.toolInvocations[0].result;
        
        if (toolResult && toolResult.warning) {
            let initialText = finalResult.text;
            let count = toolResult.count;
            let originalPrice = toolResult.originalMaxPrice;
            let newPrice = toolResult.properties[0]?.min_rental_price || toolResult.properties[0]?.price || 'Consultar';

            if (toolResult.warning.includes("precio_bajo") && count > 0) {
                const newResponse = `¡Buenas noticias! No encontré opciones por debajo de USD ${originalPrice.toLocaleString('en')}, pero amplié la búsqueda y tengo ${count} excelentes opciones que arrancan en ${newPrice}. ¿Te lo muestro? O, ¿hay algún otro requisito como pileta?`;
                finalResult.text = newResponse;
            } else if (count > 10) {
                finalResult.text = `Encontré ${count} opciones. Son muchas para ver aquí. Para encontrar la IDEAL, ¿buscas algo específico (ej. pileta climatizada, o más dormitorios) o miramos el presupuesto?`;
            } else if (count === 0 && !toolResult.warning) {
                 finalResult.text = `Lo siento, no encontré disponibilidad con esos criterios. ¿Te gustaría que probemos con otro barrio cercano o ampliemos la fecha?`;
            }
        } else if (toolResult && toolResult.count > 0 && toolResult.count <= 10) {
            // Si es el caso IDEAL (1-10 opciones)
             finalResult.text = `¡Perfecto! Encontré ${toolResult.count} opciones que cumplen con tus requisitos. Aquí te muestro las mejores ofertas. ¿Cuál te llama más la atención?`;
        } else if (toolResult && toolResult.count > 10) {
            // Caso B - Muchos Resultados
            finalResult.text = `¡Excelente! Encontré ${toolResult.count} opciones disponibles. Son muchas para revisar. Para encontrar la IDEAL, ¿quieres que busquemos propiedades con pileta o me indicas tu presupuesto máximo?`;
        } else if (toolResult && toolResult.count === 0) {
             finalResult.text = `Lo siento, no encontré disponibilidad con esos criterios. ¿Te gustaría que probemos con otro barrio cercano o ampliemos la fecha?`;
        }
    }
    
    // Devolvemos la respuesta
    const finalResponse = await streamText({
        model: model,
        messages: [{ role: 'assistant', content: finalResult.text }, ...messages],
        tools: { mostrar_contacto: tool({ ... }) },
        // NO llamamos al tool de nuevo, solo devolvemos el texto.
    });

    result.pipeDataStreamToResponse(res);

  } catch (error) {
    console.error('Error en Chat API:', error);
    res.status(500).json({ error: error.message });
  }
}