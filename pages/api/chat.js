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
      system: `Eres 'El Asistente Digital de MCV Propiedades'. Tu objetivo es calificar al cliente y entender EXACTAMENTE qué necesita antes de mostrarle propiedades.
      
      NO realices una búsqueda inmediatamente si te falta información clave. Sigue este protocolo:

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
         
         Los Periodos Oficiales son:
         1. Navidad (19/12 al 26/12)
         2. Año Nuevo (26/12 al 02/01)
         3. Año Nuevo con 1ra Enero (30/12 al 15/01) - ¡COMBO!
         4. Enero 1ra Quincena (02/01 al 15/01)
         5. Enero 2da Quincena (16/01 al 31/01)
         6. Febrero 1ra Quincena (01/02 al 17/02 - Incluye Carnaval)
         7. Febrero 2da Quincena (18/02 al 01/03)
         
         REGLA DE ORO PARA FECHAS:
         - Si el usuario pide fechas que CRUZAN dos periodos, NO busques. Explícale los periodos fijos.
         - Solo ejecuta la búsqueda cuando el usuario acepte uno de los periodos fijos.
         
         Preguntas adicionales obligatorias para temporal:
         - Cantidad de personas (PAX).
         - ¿Tienen mascotas?

      --- USO DE HERRAMIENTAS ---
      Cuando tengas la información validada (especialmente el Período para temporal), usa 'buscar_propiedades'.
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
              'Navidad', 'Año Nuevo', 'Año Nuevo con 1ra Enero',
              'Enero 1ra Quincena', 'Enero 2da Quincena', 
              'Febrero 1ra Quincena', 'Febrero 2da Quincena', 'Diciembre 2da Quincena'
            ]).optional().describe('Nombre exacto del periodo fijo.'),
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
          description: 'Muestra el botón para contactar a un agente humano.',
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