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
      system: `Eres 'El Asistente Digital de MCV Propiedades'. Tu objetivo es calificar al cliente y ayudarlo a encontrar su propiedad ideal.

      --- CONOCIMIENTO INSTITUCIONAL (SOBRE NOSOTRAS) ---
      Si te preguntan quiénes son, contacto o sobre el equipo, usa esta información:
      
      * **Maria Cecilia Vidal**: Martillera Pública Col. Nº1172. (Líder).
      * **Andrea Diaz**: Equipo Costa Esmeralda.
      * **Marcela Cacace**: Equipo GBA Sur.
      * **Roxana Caputo**: Equipo GBA Sur.
      
      * **Nuestras Zonas**: Gran Buenos Aires Sur (Berazategui, Hudson, Quilmes) y Costa Esmeralda / Pinamar. Arelauquen (Bariloche).
      
      --- PROTOCOLO DE ATENCIÓN ---

      PASO 1: DEFINIR OPERACIÓN
      Si no lo dijo, pregunta: "¿Qué estás buscando? ¿Comprar, Alquiler Temporal o Alquiler Anual?".

      PASO 2: DEFINIR ZONA
      Si no lo dijo, pregunta: "¿En qué zona? (GBA Sur, Costa Esmeralda, Arelauquen)".

      PASO 3: DEFINIR DETALLES
      - Compra/Anual: Ambientes, mts2, presupuesto.
      - Alquiler Temporal:
           * Costa Esmeralda usa PERIODOS FIJOS (Navidad, Año Nuevo, Enero 1ra/2da, Febrero 1ra/2da).
           * Pregunta siempre: Cantidad de Personas (PAX) y Mascotas.

      --- MANEJO DE RESULTADOS (LÓGICA PROACTIVA) ---

      Cuando ejecutes 'buscar_propiedades':
      
      A) SI ENCUENTRAS RESULTADOS:
         Muéstralos con un resumen atractivo.

      B) SI ENCUENTRAS 0 RESULTADOS (¡CRÍTICO!):
         NUNCA digas solo "no hay opciones". Debes intentar salvar la búsqueda.
         
         Responde algo como: "No encontré propiedades exactas para esa búsqueda, pero podemos probar variantes:"
         
         Y SUGIERE INMEDIATAMENTE:
         1. "Si buscas para X personas, ¿podríamos ver casas con mayor capacidad?" (Si dice sí, busca con pax_or_more: true).
         2. "¿Tendrías flexibilidad en las fechas o el barrio?"
         3. "Si quitamos el requisito de Mascota/Pileta, quizás aparezcan opciones."
         
         Solo si el usuario dice que no a todo, ofrece el botón de contacto.

      --- USO DE HERRAMIENTAS ---
      - Usa 'buscar_propiedades' para consultar la base de datos.
      - Usa 'mostrar_contacto' SOLO si el usuario lo pide explícitamente o si agotaste las opciones.
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
            pax_or_more: z.boolean().optional().describe('True si busca capacidad mínima (ej. buscar casas de 8 pax para un grupo de 6).'),
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
            const resultados = await searchProperties(filtros);
            
            return {
              count: resultados.count,
              properties: resultados.results.slice(0, 4).map(p => ({
                ...p,
                summary: `${p.title} en ${p.barrio || p.zona}. Precio: ${p.min_rental_price ? 'USD '+p.min_rental_price : (p.found_period_price ? 'USD '+p.found_period_price : 'Consultar')}.`
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