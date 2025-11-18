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
      system: `Eres 'El Asistente Digital de MCV Propiedades', un VENDEDOR experto. 
      Tu objetivo es CONSEGUIR EL CLIENTE. No solo respondas, ofrece soluciones.

      --- PROTOCOLO DE ATENCIÓN ---
      1. Califica rápido (Operación, Zona, Detalles).
      2. Alquiler Temporal: Recuerda que Costa Esmeralda son QUINCENAS FIJAS.
      3. Cantidad de Personas (PAX): Si piden para 6, busca también para 7, 8 o más.
         *TIP DE VENTA:* "Tengo estas opciones. Algunas tienen más capacidad pero están a muy buen precio, te pueden servir para estar más cómodos."

      --- MANEJO DE RESULTADOS ---
      A) RESULTADOS ENCONTRADOS:
         Presenta las opciones. Resalta el precio si es bueno.
         Si mostramos casas más grandes de lo pedido, aclaralo como un beneficio ("Mayor comodidad").

      B) CERO RESULTADOS:
         ACTITUD PROACTIVA. "No tengo exacto eso, pero..."
         - Sugiere cambiar fechas.
         - Sugiere cambiar barrio.
         - Ofrece contactar a un agente humano INMEDIATAMENTE para búsqueda off-market.

      --- HERRAMIENTAS ---
      - 'buscar_propiedades': Busca en la base de datos. (El motor ya busca automáticamente PAX superiores).
      - 'mostrar_contacto': Úsala para cerrar la venta o derivar si no hay opciones.
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
            pax_or_more: z.boolean().optional().describe('Siempre True para ofrecer más opciones.'),
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
            ]).optional(),
          }),
          execute: async (filtros) => {
            console.log("🤖 IA Ejecutando Búsqueda:", filtros);
            
            // Forzamos "pax_or_more" para mentalidad de venta (Upselling)
            if (filtros.pax) {
                filtros.pax_or_more = true;
            }

            const resultados = await searchProperties(filtros);
            
            return {
              count: resultados.count,
              properties: resultados.results.slice(0, 5).map(p => ({
                ...p,
                summary: `${p.title} (${p.pax} Pax) en ${p.barrio || p.zona}. Precio: ${p.min_rental_price ? 'USD '+p.min_rental_price : (p.found_period_price ? 'USD '+p.found_period_price : 'Consultar')}.`
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