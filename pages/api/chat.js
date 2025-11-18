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
      system: `Eres 'El Asistente Digital de MCV Propiedades'. Tu objetivo es calificar al cliente y encontrar su propiedad ideal.

      --- CONOCIMIENTO GEOGRÁFICO (MAPEO OBLIGATORIO) ---
      Cuando el usuario mencione un lugar, USA este mapeo para definir Zona y Barrio automáticamente (no preguntes la zona si ya te dieron el barrio):

      **GBA SUR (Zona):**
      - Si dicen "El Carmen" -> Barrio: "Club El Carmen"
      - Si dicen "Fincas", "Fincas 1", "Fincas 2" -> Barrio: "Fincas de Iraola" (o busca por texto "Fincas")
      - Si dicen "Abril" -> Barrio: "Club de Campo Abril"
      - Si dicen "Hudson" o "Quilmes" -> Zona: "GBA Sur"
      - Otros: Altos de Hudson, Greenville.

      **COSTA ESMERALDA (Zona):**
      - Barrios: Senderos (I, II, III, IV), Maritimo, Golf, Deportiva, Ecuestre, Residencial (I, II), Bosque.
      - Si dicen "Costa", "La Costa", "Pinamar" -> Zona: "Costa Esmeralda"

      **BARILOCHE:**
      - Si dicen "Arelauquen" o "Sur" -> Zona: "Arelauquen (BRC)"

      --- PROTOCOLO DE ATENCIÓN ---
      1. **OPERACIÓN:** ¿Venta, Alquiler Temporal o Anual? (Si no se sabe, pregunta).
      2. **ZONA:** (Si el usuario ya nombró un barrio conocido del mapeo anterior, ASUME la zona y no preguntes).
      3. **DETALLES:**
         - Venta/Anual: Ambientes/Dormitorios.
         - Temporal: FECHAS (Navidad, Año Nuevo, Enero/Feb 1ra/2da) y PAX. (Recuerda: Costa Esmeralda son periodos fijos).

      --- MANEJO DE CERO RESULTADOS ---
      Si 'buscar_propiedades' devuelve 0:
      - NO digas "no hay nada" y te calles.
      - Sugiere variantes: "¿Buscas en este barrio específicamente o podemos ver otros en la misma zona?", "Tengo opciones para más personas, ¿te sirven?".
      - Ofrece contactar a un agente.

      --- USO DE HERRAMIENTAS ---
      - Usa 'buscar_propiedades' con los nombres de barrio OFICIALES (ej. "Club El Carmen", no "El Carmen").
      - Si tienes dudas del nombre del barrio, usa el parámetro 'searchText' para buscar por texto libre.
      `,
      tools: {
        buscar_propiedades: tool({
          description: 'Ejecuta la búsqueda en la base de datos.',
          parameters: z.object({
            operacion: z.enum(['venta', 'alquiler_temporal', 'alquiler_anual']),
            zona: z.enum(['GBA Sur', 'Costa Esmeralda', 'Arelauquen (BRC)']).optional(),
            barrios: z.array(z.string()).optional().describe('Usar nombres oficiales: "Club El Carmen", "Fincas de Iraola", etc.'),
            tipo: z.enum(['casa', 'departamento', 'lote']).optional(),
            pax: z.string().optional(),
            pax_or_more: z.boolean().optional(),
            pets: z.boolean().optional(),
            pool: z.boolean().optional(),
            bedrooms: z.string().optional(),
            minPrice: z.string().optional(),
            maxPrice: z.string().optional(),
            searchText: z.string().optional().describe('Usar esto si el barrio no es exacto o para buscar características (ej. "al golf").'),
            selectedPeriod: z.enum([
              'Navidad', 'Año Nuevo', 'Año Nuevo con 1ra Enero',
              'Enero 1ra Quincena', 'Enero 2da Quincena', 
              'Febrero 1ra Quincena', 'Febrero 2da Quincena', 'Diciembre 2da Quincena'
            ]).optional(),
          }),
          execute: async (filtros) => {
            console.log("🤖 IA Ejecutando Búsqueda:", filtros);
            
            // Lógica de venta por defecto
            if (filtros.pax) filtros.pax_or_more = true;
            filtros.sortBy = 'price_asc';

            const resultados = await searchProperties(filtros);
            
            return {
              count: resultados.count,
              properties: resultados.results.slice(0, 5).map(p => ({
                ...p,
                summary: `${p.title} (${p.barrio || p.zona}). ${p.min_rental_price ? 'USD '+p.min_rental_price : (p.found_period_price ? 'USD '+p.found_period_price : 'Consultar')}.`
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