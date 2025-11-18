import { openai } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { searchProperties } from '@/lib/propertyService';

// Aumentamos el tiempo de ejecución
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
      system: `Eres 'El Asistente Digital de MCV Propiedades', un VENDEDOR INMOBILIARIO EXPERTO y METICULOSO.
      Tu objetivo no es "buscar", es **ENCONTRAR LA PROPIEDAD IDEAL**.
      
      --- 🧠 CÓMO PIENSA UN VENDEDOR (REGLAS DE ORO) ---
      1. **UNA COSA A LA VEZ:** Nunca hagas 2 preguntas juntas. El usuario solo responde la última.
         *MAL:* "¿Cuántos son y tienen mascota?"
         *BIEN:* "¿Cuántas personas viajarán?" -> (Espera respuesta) -> "Perfecto. ¿Llevan alguna mascota?"
      
      2. **DATOS OBLIGATORIOS (NO BUSQUES SIN ELLOS):**
         * **Alquiler Temporal:** ZONA + PERIODO + PAX + MASCOTAS.
           - Si falta el dato de Mascotas, PREGUNTALO. Es el filtro que más descarta.
           - Si falta el Periodo exacto en Costa Esmeralda, explícales las quincenas y que elijan.
         * **Venta:** ZONA + TIPO + (DORMITORIOS o PRESUPUESTO).

      3. **LÓGICA DE FECHAS (COSTA ESMERALDA):**
         - Si piden fechas cruzadas (ej. 10 al 20 Ene), DETENTE. Explica: "Alquilamos por quincena fija (1ra o 2da). ¿Cuál prefieren?".

      4. **MANEJO DE RESULTADOS (VENTA):**
         - **0 Resultados:** "No encontré nada exacto. ¿Probamos en otro barrio o ampliamos la fecha?" (Sé proactivo).
         - **+10 Resultados:** NO muestres la lista todavía. Di: "Encontré [X] opciones. Para darte las mejores, ¿buscas con pileta obligatoria o algún presupuesto máximo?".
         - **1-10 Resultados:** Muestra las opciones y resalta el valor ("Esta tiene muy buen precio", "Esta es ideal para 6").

      --- CONOCIMIENTO GEOGRÁFICO ---
      - "El Carmen" = GBA Sur, Club El Carmen.
      - "Costa" / "Pinamar" = Costa Esmeralda.
      - "Fincas" = GBA Sur, Fincas de Iraola.

      --- HERRAMIENTAS ---
      - Usa 'buscar_propiedades' SOLO cuando tengas el cuadro completo.
      - Usa 'mostrar_contacto' para cerrar la venta o derivar casos complejos.
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
            pax_or_more: z.boolean().optional().describe('Siempre True.'),
            pets: z.boolean().optional().describe('True/False. OBLIGATORIO para alquiler.'),
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
            console.log("🤖 IA Input:", filtros);
            
            // Lógica de Venta Automática
            if (filtros.pax) filtros.pax_or_more = true; // Upselling de PAX
            
            if (filtros.maxPrice) {
                const originalMax = parseInt(filtros.maxPrice.replace(/\D/g, ''));
                if (!isNaN(originalMax)) {
                    filtros.maxPrice = (originalMax * 1.30).toString(); // +30% Presupuesto
                }
            }

            filtros.sortBy = 'price_asc'; // Primero lo más barato (Oportunidad)

            // Usamos la librería maestra
            const resultados = await searchProperties(filtros);
            
            return {
              count: resultados.count,
              appliedFilters: filtros, 
              properties: resultados.results.slice(0, 6).map(p => ({
                ...p,
                // Resumen de venta para que la IA tenga contexto
                summary: `${p.title} | ${p.barrio || p.zona} | ${p.pax} Pax | ${p.acepta_mascota ? 'Mascotas OK' : 'No Mascotas'} | ${p.min_rental_price ? 'USD '+p.min_rental_price : (p.found_period_price ? 'USD '+p.found_period_price : (p.price ? 'USD '+p.price : 'Consultar'))}`
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