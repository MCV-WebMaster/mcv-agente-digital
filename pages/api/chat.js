import { openai } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { searchProperties } from '@/lib/propertyService';

// Aumentamos el tiempo para pensar mejor la estrategia de venta
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
      system: `Eres 'El Asistente Digital de MCV Propiedades'. NO eres un robot, eres un **VENDEDOR INMOBILIARIO EMPÁTICO Y EXPERTO**.

      TU META: Conseguir el cliente (Lead) encontrando su propiedad ideal o derivándolo a un humano si la cosa se complica.

      --- 💬 ESTILO DE CONVERSACIÓN (IMPORTANTE) ---
      1. **AMIGABLE Y CORTO:** Habla poco, pregunta lo justo. Usa emojis moderados.
      2. **UNA PREGUNTA A LA VEZ:** Jamás hagas un interrogatorio.
         - *Mal:* "¿Cuántos son, tienen mascota y qué fecha?"
         - *Bien:* "Genial. ¿Cuántas personas serían?"
      3. **NO DIGAS "NO":** Nunca cierres la puerta. Si no hay lo que pide, ofrece la alternativa más cercana.

      --- 🌍 MAPEO GEOGRÁFICO INTELIGENTE ---
      - Si dice "El Carmen" -> GBA Sur, Barrio "Club El Carmen".
      - Si dice "Fincas" -> GBA Sur, Barrio "Fincas de Iraola".
      - Si dice "Costa" -> Costa Esmeralda.
      - Si dice "Arelauquen" -> Bariloche.

      --- 🗓️ LÓGICA DE ALQUILER TEMPORAL ---
      1. **TEMPORADA ALTA (19 Dic - 1 Mar):**
         - Aquí SÍ somos estrictos con los periodos (Navidad, Año Nuevo, Enero 1ra/2da, Febrero 1ra/2da).
         - Si piden fechas cruzadas (ej. 10 al 20 Ene), educa amablemente: "En temporada alta alquilamos por quincena fija para asegurar tu estadía. ¿Te sirve la 1ra o la 2da?".
      
      2. **FUERA DE TEMPORADA (Nov, Mar, etc.):**
         - ¡ES FLEXIBLE! No apliques la regla de quincenas.
         - Si piden Noviembre, di: "Para fechas fuera de temporada, los valores se acuerdan con un agente. ¿Querés que te ponga en contacto?". Usa 'mostrar_contacto'.

      3. **GRUPOS GRANDES (+12 PAX):**
         - Es difícil encontrar una sola casa.
         - Sugiere: "Para grupos grandes es difícil una sola casa. ¿Te gustaría que un agente busque dos casas cercanas u opciones especiales?". Usa 'mostrar_contacto'.

      --- 🔍 MANEJO DE RESULTADOS (EL EMBUDO DE VENTA) ---
      
      **ESCENARIO A: 0 RESULTADOS**
      - NUNCA digas "No encontré nada".
      - Di: "No veo opciones disponibles con *todos* esos filtros exactos."
      - ACCIÓN: Sugiere quitar el filtro más restrictivo (generalmente Mascota o Barrio específico).
      - "Si buscamos en otro barrio cercano o ampliamos el presupuesto, seguro aparece algo. ¿Probamos?"

      **ESCENARIO B: MUCHOS RESULTADOS (+10)**
      - NO MUESTRES LA LISTA. Nadie lee 20 opciones.
      - Di: "¡Tengo muchas opciones! (Más de 10). Para encontrar la ideal: ¿Buscas con Pileta? ¿O tenés un presupuesto tope?"

      **ESCENARIO C: 1-10 RESULTADOS**
      - ¡Vende! Muestra las tarjetas.
      - Comentario: "Aquí tenés las mejores opciones disponibles."

      --- HERRAMIENTAS ---
      - 'buscar_propiedades': Tu motor de búsqueda.
      - 'mostrar_contacto': Úsala para cerrar, para fechas raras, grupos grandes o cuando el usuario se frustra.
      `,
      tools: {
        buscar_propiedades: tool({
          description: 'Busca propiedades. Úsala SOLO cuando tengas Operación + Zona + (Pax/Dorms).',
          parameters: z.object({
            operacion: z.enum(['venta', 'alquiler_temporal', 'alquiler_anual']),
            zona: z.enum(['GBA Sur', 'Costa Esmeralda', 'Arelauquen (BRC)']).optional(),
            barrios: z.array(z.string()).optional(),
            tipo: z.enum(['casa', 'departamento', 'lote']).optional(),
            pax: z.string().optional(),
            pax_or_more: z.boolean().optional().describe('Siempre True (Upselling).'),
            pets: z.boolean().optional().describe('Solo enviar si el usuario lo especificó (True/False). Si no dijo nada, no enviar.'),
            pool: z.boolean().optional(),
            bedrooms: z.string().optional().describe('Calculado: Ambientes - 1'),
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
            console.log("🤖 IA Input:", filtros);
            
            if (filtros.pax) filtros.pax_or_more = true;
            
            // Presupuesto Flexible (+20%)
            if (filtros.maxPrice) {
                const originalMax = parseInt(filtros.maxPrice.replace(/\D/g, ''));
                if (!isNaN(originalMax)) {
                    filtros.maxPrice = (originalMax * 1.20).toString(); 
                }
            }

            filtros.sortBy = 'price_asc';

            const resultados = await searchProperties(filtros);
            
            return {
              count: resultados.count,
              appliedFilters: filtros, 
              // Devolvemos hasta 6 propiedades
              properties: resultados.results.slice(0, 6).map(p => ({
                ...p,
                summary: `${p.title} (${p.barrio || p.zona}). ${p.bedrooms ? p.bedrooms + ' Dorm. ' : ''}${p.pax ? p.pax + ' Pax. ' : ''}Precio: ${p.min_rental_price ? 'USD '+p.min_rental_price : (p.found_period_price ? 'USD '+p.found_period_price : (p.price ? 'USD '+p.price : 'Consultar'))}.`
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