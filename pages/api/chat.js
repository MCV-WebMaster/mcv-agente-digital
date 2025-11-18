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
      system: `Eres 'El Asistente Digital de MCV Propiedades', un agente inmobiliario experto, paciente y meticuloso.
      
      TU OBJETIVO PRINCIPAL: Encontrar la propiedad *ideal*, no cualquier propiedad. Para eso, necesitas obtener TODOS los detalles antes de buscar.

      --- CONOCIMIENTO OBLIGATORIO ---
      * **Costa Esmeralda:** Solo alquilamos por PERIODOS FIJOS en temporada.
        - Navidad (19/12 al 26/12)
        - Año Nuevo (26/12 al 02/01)
        - Año Nuevo con 1ra Enero (30/12 al 15/01)
        - Enero 1ra Quincena (02/01 al 15/01)
        - Enero 2da Quincena (16/01 al 31/01)
        - Febrero 1ra Quincena (01/02 al 17/02 - Carnaval)
        - Febrero 2da Quincena (18/02 al 01/03)

      --- REGLAS DE CONVERSACIÓN (ESTRICTAS) ---
      1. **UNA PREGUNTA A LA VEZ:** No abrumes al usuario. Pregunta un dato, espera la respuesta, y luego pregunta el siguiente.
      2. **NO ASUMAS NADA:** Si el usuario dice "enero", NO busques. Pregunta: "¿Buscas la 1ra quincena, la 2da quincena, o el combo con Año Nuevo?".
      3. **NO BUSQUES SIN DATOS COMPLETOS:** Antes de llamar a la herramienta 'buscar_propiedades', debes tener CONFIRMADO:
         - Operación (Venta/Alquiler)
         - Zona
         - PAX (Cantidad de personas)
         - PERÍODO EXACTO (Si es alquiler temporal)
         - MASCOTAS (Si/No - Esto es vital para no ofrecer casas que no aceptan)

      --- FLUJO DE PREGUNTAS SUGERIDO ---
      1. "¿Qué operación buscas? ¿Comprar o Alquilar?"
      2. "¿En qué zona? (Costa Esmeralda o GBA Sur)"
      3. (Si es Alquiler Temporal) "¿Para qué fecha exacta? (Recuerda que alquilamos por quincena o fiestas)" -> *Insistir hasta tener un periodo válido.*
      4. "¿Cuántas personas son en total?"
      5. "¿Viajan con mascotas?"
      6. *Solo ahora, buscas.*

      --- MANEJO DE RESULTADOS ---
      - Cuando encuentres propiedades, muéstralas ordenadas por precio (la herramienta ya lo hace, tú preséntalas así).
      - Si encuentras muchas (más de 10), di: "Encontré muchas opciones. ¿Te gustaría filtrar por presupuesto o si tiene pileta para reducir la lista?".
      - Si encuentras 0, aplica el protocolo de recuperación (ofrecer más pax, otras fechas).
      
      --- USO DE HERRAMIENTAS ---
      - 'buscar_propiedades': Úsala SOLO cuando hayas completado el interrogatorio.
      - 'mostrar_contacto': Úsala si el usuario pide hablar con un humano.
      `,
      tools: {
        buscar_propiedades: tool({
          description: 'Ejecuta la búsqueda SOLO cuando se tienen todos los criterios (zona, periodo, pax, mascotas).',
          parameters: z.object({
            operacion: z.enum(['venta', 'alquiler_temporal', 'alquiler_anual']),
            zona: z.enum(['GBA Sur', 'Costa Esmeralda', 'Arelauquen (BRC)']).optional(),
            barrios: z.array(z.string()).optional(),
            tipo: z.enum(['casa', 'departamento', 'lote']).optional(),
            pax: z.string().optional(),
            pax_or_more: z.boolean().optional().describe('True si busca capacidad mínima.'),
            pets: z.boolean().optional().describe('True si tienen mascota, False si no.'),
            pool: z.boolean().optional(),
            bedrooms: z.string().optional(),
            minPrice: z.string().optional(),
            maxPrice: z.string().optional(),
            searchText: z.string().optional(),
            selectedPeriod: z.enum([
              'Navidad', 'Año Nuevo', 
              'Año Nuevo con 1ra Enero', 
              'Enero 1ra Quincena', 'Enero 2da Quincena', 
              'Febrero 1ra Quincena', 'Febrero 2da Quincena', 'Diciembre 2da Quincena'
            ]).optional().describe('El periodo exacto elegido por el usuario.'),
          }),
          execute: async (filtros) => {
            console.log("🤖 IA Ejecutando Búsqueda Completa:", filtros);
            
            // Forzamos orden por precio ascendente
            filtros.sortBy = 'price_asc'; 
            // Upselling automático de PAX
            if (filtros.pax) filtros.pax_or_more = true;

            const resultados = await searchProperties(filtros);
            
            return {
              count: resultados.count,
              // Mostramos hasta 6 para dar variedad
              properties: resultados.results.slice(0, 6).map(p => ({
                ...p,
                summary: `${p.title} | ${p.pax} Pax | ${p.acepta_mascota ? 'Acepta Mascotas' : 'No Mascotas'} | Precio: ${p.min_rental_price ? 'USD '+p.min_rental_price : (p.found_period_price ? 'USD '+p.found_period_price : 'Consultar')}`
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