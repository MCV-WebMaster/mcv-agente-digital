import { openai } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { searchProperties } from '@/lib/propertyService';

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
      // --- AQUÍ ESTÁ LA MAGIA: EL PROTOCOLO DE ATENCIÓN ---
      system: `Eres 'El Asistente Digital de MCV Propiedades'. Tu objetivo es calificar al cliente y entender EXACTAMENTE qué necesita antes de mostrarle propiedades.
      
      NO realices una búsqueda inmediatamente si te falta información clave. Sigue este protocolo de preguntas paso a paso:

      PASO 1: DEFINIR OPERACIÓN
      Si el usuario no lo dijo, pregunta: "¿Qué estás buscando? ¿Comprar, Alquiler Temporal o Alquiler Anual?".

      PASO 2: DEFINIR ZONA
      Si el usuario no lo dijo, pregunta: "¿En qué zona te gustaría buscar? (Trabajamos en GBA Sur, Costa Esmeralda y Arelauquen)".

      PASO 3: DEFINIR DETALLES (Según el Paso 1)
      
      A) SI ES COMPRA (VENTA):
         Pregunta por:
         - Cantidad de ambientes o dormitorios.
         - Metros cuadrados aproximados.
         - Presupuesto máximo estimado.

      B) SI ES ALQUILER TEMPORAL:
         Pregunta OBLIGATORIAMENTE por:
         - **Fechas exactas o período** (Ej: "Enero 2da quincena", "Carnaval"). Esto es crítico para ver disponibilidad.
         - **Cantidad de personas (PAX)**.
         - ¿Tienen mascotas?
         - ¿Buscan con pileta?

      C) SI ES ALQUILER ANUAL:
         Pregunta por requisitos básicos (dormitorios, zona).

      REGLAS DE COMPORTAMIENTO:
      - Sé amable, profesional y conciso.
      - Ve paso a paso. No hagas todas las preguntas juntas. Haz una o dos preguntas a la vez para mantener la conversación fluida.
      - SOLO cuando tengas la Operación, la Zona y al menos un detalle clave (como Fechas para alquiler o Ambientes para venta), ejecuta la herramienta 'buscar_propiedades'.
      - Si el usuario pregunta algo vago como "quiero una casa", responde con las opciones del Paso 1 y 2.
      - Habla siempre en español rioplatense (Argentina).
      `,
      tools: {
        buscar_propiedades: tool({
          description: 'Ejecuta la búsqueda en la base de datos de MCV cuando ya se tienen los criterios claros.',
          parameters: z.object({
            operacion: z.enum(['venta', 'alquiler_temporal', 'alquiler_anual']).describe('Tipo de operación.'),
            zona: z.enum(['GBA Sur', 'Costa Esmeralda', 'Arelauquen (BRC)']).optional().describe('Zona estandarizada.'),
            barrios: z.array(z.string()).optional(),
            tipo: z.enum(['casa', 'departamento', 'lote']).optional(),
            pax: z.string().optional(),
            pax_or_more: z.boolean().optional().describe('True si el usuario dice "o más" o busca capacidad mínima.'),
            pets: z.boolean().optional(),
            pool: z.boolean().optional(),
            bedrooms: z.string().optional(),
            minPrice: z.string().optional(),
            maxPrice: z.string().optional(),
            minMts: z.string().optional(),
            maxMts: z.string().optional(),
            searchText: z.string().optional().describe('Palabras clave como "quincho", "polo", "golf".'),
            // La IA intentará inferir fechas si el usuario dice "Enero 2da quincena" pasando 'selectedPeriod'
            // O fechas exactas en startDate/endDate si el usuario dice "del 10 al 20".
            selectedPeriod: z.string().optional().describe('Nombre exacto del período (Ej: "Enero 2da Quincena", "Navidad").'),
            startDate: z.string().optional().describe('Formato YYYY-MM-DD'),
            endDate: z.string().optional().describe('Formato YYYY-MM-DD'),
          }),
          execute: async (filtros) => {
            console.log("🤖 IA Ejecutando Búsqueda:", filtros);
            const resultados = await searchProperties(filtros);
            
            // Devolvemos un resumen para que la IA sepa qué decir
            return {
              count: resultados.count,
              // Limitamos a 4 para no saturar el chat visualmente, aunque la IA sabrá el total
              properties: resultados.results.slice(0, 4).map(p => ({
                ...p,
                // Le damos a la IA datos clave para que los comente si quiere
                summary: `${p.title} en ${p.barrio || p.zona}. Precio: ${p.min_rental_price || p.price || 'Consultar'}.`
              }))
            };
          },
        }),
      },
    });

    result.pipeDataStreamToResponse(res);

  } catch (error) {
    console.error('Error en Chat API:', error);
    res.status(500).json({ error: error.message });
  }
}