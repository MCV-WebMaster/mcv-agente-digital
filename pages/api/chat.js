import { openai } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { searchProperties } from '@/lib/propertyService';

// Definimos que el modelo use GPT-4o (o gpt-3.5-turbo si prefiere ahorrar, pero 4o es mejor para herramientas)
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
      system: `Eres 'El Asistente Digital de MCV Propiedades', un experto inmobiliario amable y profesional.
      
      Tu objetivo es ayudar a los usuarios a encontrar propiedades en venta o alquiler (anual o temporal).
      
      REGLAS IMPORTANTES:
      1. SIEMPRE usa la herramienta 'buscar_propiedades' cuando el usuario pregunte por casas, departamentos o lotes. NO inventes propiedades.
      2. Si el usuario no especifica operación (venta/alquiler), pregúntale amablemente.
      3. Si el usuario no especifica zona (GBA Sur, Costa Esmeralda, etc.), pregúntale o asume "Costa Esmeralda" si menciona playa/mar, o "GBA Sur" si menciona barrios privados de esa zona.
      4. Cuando la herramienta te devuelva resultados, resúmelos de forma atractiva y menciona que pueden ver los detalles en las tarjetas.
      5. Si no hay resultados, ofrece buscar con criterios más amplios.
      6. Responde siempre en español rioplatense (Argentina), de forma cordial pero profesional.
      `,
      tools: {
        buscar_propiedades: tool({
          description: 'Busca propiedades en la base de datos de MCV basándose en criterios como zona, operación, precio, fechas, etc.',
          parameters: z.object({
            operacion: z.enum(['venta', 'alquiler_temporal', 'alquiler_anual']).optional().describe('El tipo de operación.'),
            zona: z.string().optional().describe('La zona (ej. "Costa Esmeralda", "GBA Sur", "Arelauquen (BRC)").'),
            barrios: z.array(z.string()).optional().describe('Lista de barrios específicos.'),
            tipo: z.enum(['casa', 'departamento', 'lote']).optional(),
            pax: z.string().optional().describe('Cantidad de personas (para alquiler).'),
            minPrice: z.string().optional(),
            maxPrice: z.string().optional(),
            searchText: z.string().optional().describe('Palabras clave (ej. "pileta", "quincho", "polo").'),
            // Nota: Para fechas exactas, la IA intentará pasar strings YYYY-MM-DD si se lo pedimos, 
            // pero por ahora dejemos que busque por texto o general.
          }),
          execute: async (filtros) => {
            console.log("🤖 IA Buscando con filtros:", filtros);
            // Llamamos a nuestro motor (la misma lógica que la Web)
            const resultados = await searchProperties(filtros);
            // Limitamos a 5 para no saturar el chat
            return {
              count: resultados.count,
              properties: resultados.results.slice(0, 5) 
            };
          },
        }),
      },
    });

    // Conectar el stream de la IA a la respuesta HTTP
    result.pipeDataStreamToResponse(res);

  } catch (error) {
    console.error('Error en Chat API:', error);
    res.status(500).json({ error: error.message });
  }
}
