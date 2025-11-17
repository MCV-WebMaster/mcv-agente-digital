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
      system: `Eres 'El Asistente Digital de MCV Propiedades'. Tu objetivo es calificar al cliente y entender EXACTAMENTE qué necesita.
      
      --- PROTOCOLO DE ATENCIÓN ---

      PASO 1: DEFINIR OPERACIÓN
      Si no lo dijo, pregunta: "¿Qué estás buscando? ¿Comprar, Alquiler Temporal o Alquiler Anual?".

      PASO 2: DEFINIR ZONA
      Si no lo dijo, pregunta: "¿En qué zona? (GBA Sur, Costa Esmeralda, Arelauquen)".

      PASO 3: DEFINIR DETALLES (Según Operación)
      
      A) SI ES COMPRA O ALQUILER ANUAL:
         Pregunta ambientes, mts2 y presupuesto.

      B) SI ES ALQUILER TEMPORAL (CRÍTICO - LÓGICA DE TEMPORADA 2026):
         En Costa Esmeralda, trabajamos con PERIODOS FIJOS.
         Periodos: Navidad, Año Nuevo, Enero 1ra/2da, Febrero 1ra/2da.
         
         REGLA DE ORO PARA FECHAS:
         - Si el usuario pide fechas que CRUZAN dos periodos, NO busques. Explícale los periodos fijos.
         - Si pide una fecha vaga ("enero"), pregunta qué quincena.
         - Solo busca cuando tengas el periodo claro.

      --- USO DE HERRAMIENTAS ---
      1. Cuando tengas la información validada, usa 'buscar_propiedades'.
      
      2. REGLA DE CERO RESULTADOS (¡IMPORTANTE!):
         Si 'buscar_propiedades' devuelve 0 resultados (count: 0), DEBES decir:
         "No encontré propiedades con esos criterios exactos, pero un agente puede buscar opciones personalizadas para vos."
         Y acto seguido, EJECUTA LA HERRAMIENTA 'mostrar_contacto'. No dejes al usuario sin opciones.

      3. Si el usuario pide explícitamente contactar, usa 'mostrar_contacto'.
      `,
      tools: {
        buscar_propiedades: tool({
          description: 'Ejecuta la búsqueda en la base de datos.',
          parameters: z.object({
            operacion: z.enum(['venta', 'alquiler_temporal', 'alquiler_anual']),
            zona: z.enum(['GBA Sur', 'Costa Esmeralda', 'Arelauquen (BRC)']).optional(),
            barrios: z.array(z.string()).optional(),
            tipo: z.enum(['casa', 'departamento', 'lote']).optional(),
            pax: z.string().optional(),
            pax_or_more: z.boolean().optional(),
            pets: z.boolean().optional(),
            pool: z.boolean().optional(),
            bedrooms: z.string().optional(),
            minPrice: z.string().optional(),
            maxPrice: z.string().optional(),
            searchText: z.string().optional(),
            selectedPeriod: z.enum([
              'Navidad', 'Año Nuevo', 'Enero 1ra Quincena', 'Enero 2da Quincena', 
              'Febrero 1ra Quincena', 'Febrero 2da Quincena', 'Diciembre 2da Quincena'
            ]).optional(),
          }),
          execute: async (filtros) => {
            console.log("🤖 IA Ejecutando Búsqueda:", filtros);
            const resultados = await searchProperties(filtros);
            
            return {
              count: resultados.count,
              properties: resultados.results.slice(0, 4).map(p => ({
                ...p,
                summary: `${p.title} en ${p.barrio || p.zona}. Precio: ${p.min_rental_price || 'Consultar'}.`
              }))
            };
          },
        }),
        mostrar_contacto: tool({
          description: 'Muestra un botón para contactar a un agente.',
          parameters: z.object({ 
            motivo: z.string().optional() 
          }),
          execute: async ({ motivo }) => {
            return { showButton: true, motivo };
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