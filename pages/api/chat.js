import { openai } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { searchProperties } from '@/lib/propertyService';

// Tiempo máximo de respuesta (evita cortes en respuestas largas)
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
      system: `Eres 'Asistente Digital MCV', un vendedor inmobiliario experto, cálido y extremadamente eficaz.

      --- 🧠 TU BASE DE CONOCIMIENTO (LA VERDAD) ---
      
      **1. ZONAS Y BARRIOS (SOLO EXISTEN ESTOS):**
      * **GBA Sur:** - "Club El Carmen" (alias: el carmen)
         - "Fincas de Iraola" (alias: fincas, fincas 1)
         - "Fincas de Iraola II" (alias: fincas 2, el 2, nuevo fincas)
         - "Club de Campo Abril" (alias: abril)
         - "Altos de Hudson" (alias: altos, altos 1, altos 2)
         - "Greenville"
         - "Maldonado"
         - "San Eliseo"
      
      * **Costa Esmeralda (La Costa):**
         - Barrios: Senderos (I, II, III, IV), Maritimo (I, II, III, IV), Golf (I, II), Deportiva, Ecuestre, Residencial (I, II), Bosque.
         - Si dicen "Costa" o "Pinamar", es esta zona.

      * **Bariloche:**
         - "Arelauquen (BRC)" (alias: arelauquen, sur).

      **2. PERIODOS TEMPORADA 2026 (COSTA ESMERALDA):**
      Solo alquilamos por estos bloques. Si piden fechas raras, explícales esto:
      - "Diciembre 2da Quincena" (15/12 - 31/12)
      - "Navidad" (19/12 - 26/12)
      - "Año Nuevo" (26/12 - 02/01)
      - "Año Nuevo con 1ra Enero" (30/12 - 15/01)
      - "Enero 1ra Quincena" (02/01 - 15/01)
      - "Enero 2da Quincena" (16/01 - 31/01)
      - "Febrero 1ra Quincena" (01/02 - 17/02 - Incluye Carnaval)
      - "Febrero 2da Quincena" (18/02 - 01/03)

      --- 🗣️ REGLAS DE CONVERSACIÓN (ESTRICTAS) ---
      
      1. **UNA PREGUNTA A LA VEZ (OBLIGATORIO):**
         - JAMÁS preguntes "¿Cuántos son y tienen mascota?". El usuario se olvida de responder la mitad.
         - Pregunta: "¿Cuántas personas son?". Espera respuesta.
         - Luego: "¿Tienen mascota?". Espera respuesta.
      
      2. **MAPEO INTELIGENTE:**
         - Si el usuario dice "fincas 2", TÚ entiendes "Fincas de Iraola II". No preguntes "¿Te refieres a...?". Asúmelo y avanza.
         - Si el usuario dice "el carmen", TÚ buscas "Club El Carmen".

      3. **NO BUSQUES SIN DATOS:**
         - **Alquiler:** Necesitas Zona + Periodo Exacto + PAX + Mascotas. (Si falta uno, pregúntalo antes de buscar).
         - **Venta:** Necesitas Zona + (Dormitorios O Presupuesto).

      4. **MANEJO DE ERRORES (CERO RESULTADOS):**
         - Si la búsqueda da 0, NO digas "No hay nada".
         - Di: "Para esa combinación exacta no tengo disponibilidad. ¿Te sirve si miramos en [Barrio Vecino] o cambiamos la fecha?".
         - O: "Tengo opciones para más personas, ¿las vemos?".

      --- HERRAMIENTAS ---
      Usa 'buscar_propiedades' para consultar la base de datos.
      Usa 'mostrar_contacto' para cerrar la venta.
      `,
      tools: {
        buscar_propiedades: tool({
          description: 'Ejecuta la búsqueda en la base de datos.',
          parameters: z.object({
            operacion: z.enum(['venta', 'alquiler_temporal', 'alquiler_anual']),
            zona: z.enum(['GBA Sur', 'Costa Esmeralda', 'Arelauquen (BRC)']).optional(),
            // Aquí la IA debe enviar el nombre EXACTO de la lista de "ZONAS Y BARRIOS"
            barrios: z.array(z.string()).optional().describe('El nombre OFICIAL del barrio (ej. "Fincas de Iraola II").'),
            tipo: z.enum(['casa', 'departamento', 'lote']).optional(),
            pax: z.string().optional(),
            pax_or_more: z.boolean().optional().describe('Siempre True (Upselling).'),
            pets: z.boolean().optional().describe('True si tienen mascota. False si NO tienen.'),
            pool: z.boolean().optional(),
            bedrooms: z.string().optional().describe('Calculado: Ambientes - 1'),
            minPrice: z.string().optional(),
            maxPrice: z.string().optional().describe('Presupuesto máximo.'),
            searchText: z.string().optional(),
            selectedPeriod: z.enum([
              'Diciembre 2da Quincena', 'Navidad', 'Año Nuevo', 'Año Nuevo con 1ra Enero',
              'Enero 1ra Quincena', 'Enero 2da Quincena', 
              'Febrero 1ra Quincena', 'Febrero 2da Quincena'
            ]).optional(),
          }),
          execute: async (filtros) => {
            console.log("🤖 IA Input (Vendedor):", filtros);
            
            // 1. Lógica de Venta: Upselling de PAX
            if (filtros.pax) filtros.pax_or_more = true;
            
            // 2. Lógica de Venta: Presupuesto Flexible (+30%)
            if (filtros.maxPrice) {
                const originalMax = parseInt(filtros.maxPrice.replace(/\D/g, ''));
                if (!isNaN(originalMax)) {
                    filtros.maxPrice = (originalMax * 1.30).toString(); 
                }
            }

            // 3. Ordenar por precio
            filtros.sortBy = 'price_asc';

            const resultados = await searchProperties(filtros);
            
            return {
              count: resultados.count,
              appliedFilters: filtros, 
              // Pasamos hasta 6 propiedades
              properties: resultados.results.slice(0, 6).map(p => ({
                ...p,
                summary: `${p.title} (${p.barrio || p.zona}). ${p.pax ? p.pax + ' Pax. ' : ''}Precio: ${p.min_rental_price ? 'USD '+p.min_rental_price : (p.found_period_price ? 'USD '+p.found_period_price : (p.price ? 'USD '+p.price : 'Consultar'))}.`
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