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
      
      --- 🧠 REGLAS DE CONVERSACIÓN (CRÍTICO) ---
      1. **UNA PREGUNTA A LA VEZ:** Es la regla más importante. Pregunta por un dato y espera la respuesta.
      2. **SECUENCIA OBRIGATORIA (ALQUILER TEMPORAL):** Debes obtener los datos en esta orden estricta. Si el usuario salta un paso, DEBES volver a él.
         - 1. Periodo Exacto (Fecha)
         - 2. PAX (Personas)
         - 3. MASCOTAS (Sí/No)
         - 4. PRESUPUESTO (Máximo)

      --- 🎯 FILTRO ESTRATÉGICO (EL EMBUDO) ---
      
      * **CRITERIOS MÍNIMOS OBLIGATORIOS ANTES DE BUSCAR:** Zona, Operación, Periodo, PAX, MASCOTAS.
      
      * **MANEJO DE RESULTADOS (+10):**
         - Si encuentras más de 10 opciones, NO las muestres todas. Debes decir: "Encontré [X] opciones disponibles. Para darte la IDEAL, ¿buscas con pileta o algún requisito adicional?". 
         - Muestra las primeras 6 más baratas (que la herramienta te devuelve).
      
      * **CERO RESULTADOS (RECUPERACIÓN):**
         - Si da 0, aplica el protocolo de rescate (busca sin presupuesto, sugiere otro barrio). No te rindas.

      --- HERRAMIENTAS ---
      Usa 'buscar_propiedades' solo cuando cumplas los Criterios Mínimos.
      `,
      tools: {
        buscar_propiedades: tool({
          description: 'Ejecuta la búsqueda en la base de datos.',
          parameters: z.object({
            operacion: z.enum(['venta', 'alquiler_temporal', 'alquiler_anual']).optional(),
            zona: z.enum(['GBA Sur', 'Costa Esmeralda', 'Arelauquen (BRC)']).optional(),
            barrios: z.array(z.string()).optional().describe('Nombre OFICIAL del barrio (ej. "Club El Carmen", "Fincas de Iraola II").'),
            tipo: z.enum(['casa', 'departamento', 'lote']).optional(),
            pax: z.string().optional(),
            pax_or_more: z.boolean().optional().describe('Siempre True.'),
            pets: z.boolean().optional().describe('True si tienen mascota. False si NO tienen.'),
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
            
            // 1. Lógica de Venta Automática
            if (filtros.pax) filtros.pax_or_more = true;
            
            // 2. Lógica de Presupuesto Flexible (+30%)
            let originalMaxPrice = null;
            if (filtros.maxPrice) {
                originalMaxPrice = parseInt(filtros.maxPrice.replace(/\D/g, ''));
                if (!isNaN(originalMaxPrice)) {
                    filtros.maxPrice = (originalMaxPrice * 1.30).toString(); 
                }
            }

            filtros.sortBy = 'price_asc';
            
            // --- 3. EJECUCIÓN (Lógica de Rescate si hay 0) ---
            let resultados = await searchProperties(filtros);

            if (resultados.count === 0 && originalMaxPrice) {
                console.log("⚠️ 0 Resultados. Reintentando sin límite de precio...");
                let rescueFilters = {...filtros, maxPrice: null};
                let resRescue = await searchProperties(rescueFilters);
                
                if (resRescue.count > 0) {
                    resultados = resRescue;
                    resultados.warning = `precio_bajo|${originalMaxPrice}`;
                    resultados.originalMaxPrice = originalMaxPrice;
                }
            }
            
            // 4. PROTOCOLO DE EMBALAR (Respuesta al usuario)
            return {
              count: resultados.count,
              warning: resultados.warning || null,
              originalMaxPrice: resultados.originalMaxPrice || null,
              appliedFilters: filtros, 
              // Slice 6 para que el chat no se sature, pero la IA sabe que hay 30.
              properties: resultados.results.slice(0, 6).map(p => ({
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
    
    // Si la IA ejecutó la herramienta, procesamos el resultado para el texto final
    if (finalResult.toolInvocations && finalResult.toolInvocations.length > 0) {
        const toolResult = finalResult.toolInvocations[0].result;
        let finalResponseText = finalResult.text;

        if (toolResult) {
            const count = toolResult.count;
            const appliedFilters = toolResult.appliedFilters;
            
            // Lógica de Venta (Override del texto simple de la IA)
            if (count > 0) {
                if (count > 10 && !appliedFilters.pool && !appliedFilters.maxPrice) {
                    // Caso 1: Sobrecarga de Resultados
                    finalResponseText = `¡Excelente! Encontré ${count} opciones disponibles. Son muchas para ver aquí. Para ayudarte a encontrar la IDEAL, ¿buscas con pileta o me indicas tu presupuesto máximo?`;
                } else if (toolResult.warning && toolResult.warning.includes("precio_bajo")) {
                    // Caso 2: Rescate de Precio (Avisa que es más caro)
                    const originalPrice = toolResult.originalMaxPrice;
                    const newPrice = toolResult.properties[0].min_rental_price || toolResult.properties[0].price;
                    finalResponseText = `¡Buenas noticias! No encontré nada por debajo de USD ${originalPrice.toLocaleString('en')}, pero amplié la búsqueda y tengo ${count} excelentes opciones que arrancan en USD ${newPrice.toLocaleString('en')}. ¿Te lo muestro?`;
                } else if (count <= 10) {
                    // Caso 3: Éxito (Muestra las 6 mejores y cierra)
                    finalResponseText = `¡Perfecto! Aquí tienes ${count} opciones que cumplen tus requisitos. Son las mejores ofertas disponibles. ¿Cuál te llama más la atención?`;
                }
            } else {
                 // Caso 4: Cero resultados (El Rescate falló)
                 finalResponseText = `Lo siento, no encontré disponibilidad con esos criterios. ¿Te gustaría que probemos con otro barrio cercano o ampliemos la fecha?`;
            }
        }
    }
    
    // Devolvemos la respuesta
    const finalResponse = await streamText({
        model: model,
        messages: [{ role: 'assistant', content: finalResponseText }, ...messages],
        tools: { mostrar_contacto: tool({ ... }) },
    });

    result.pipeDataStreamToResponse(res);

  } catch (error) {
    console.error('Error en Chat API:', error);
    res.status(500).json({ error: error.message });
  }
}