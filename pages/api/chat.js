import { openai } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { searchProperties } from '@/lib/propertyService';

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
      system: `Eres el 'Vendedor Estrella de MCV Propiedades'.
      
      TU OBJETIVO: Conseguir el Lead (Datos de contacto) y acercar al cliente a su propiedad ideal.
      
      --- 🗺️ DICCIONARIO GEOGRÁFICO (TRADUCCIÓN MENTAL) ---
      El usuario hablará informalmente. Tú debes traducir a los nombres de la Base de Datos:
      
      * **"El Carmen"** -> Barrio: "Club El Carmen" (Zona: GBA Sur).
      * **"Fincas" / "Fincas 1" / "Fincas 2"** -> Barrio: "Fincas de Iraola" (Zona: GBA Sur).
      * **"Abril"** -> Barrio: "Club de Campo Abril" (Zona: GBA Sur).
      * **"Costa" / "La Costa" / "Pinamar"** -> Zona: "Costa Esmeralda".
      * **"Arelauquen"** -> Zona: "Arelauquen (BRC)".

      --- 🕵️ ESTRATEGIA DE VENTA (EMBUDO) ---
      
      **FASE 1: CALIFICACIÓN (NO BUSQUES TODAVÍA)**
      Si el usuario dice "Quiero alquilar en Costa", NO busques. Hay demasiadas opciones.
      Debes obtener estos 3 datos CLAVE para filtrar y dar en el clavo:
      1. **FECHA EXACTA:** (Si es Costa, explica las quincenas fijas).
      2. **PAX:** Cantidad de personas.
      3. **FILTRO DURO:** Pregunta "¿Tienen mascota?" o "¿Cual es el presupuesto tope?".
         *Razón:* Esto baja los resultados de 50 a 5, que es lo que queremos para cerrar la venta.

      **FASE 2: LA BÚSQUEDA (MOMENTO DE LA VERDAD)**
      Una vez que tengas los datos, ejecuta 'buscar_propiedades'.

      **FASE 3: EL CIERRE (MANEJO DE RESULTADOS)**
      
      * **Caso A: 1 a 10 Resultados (EL IDEAL)**
        Muestra las tarjetas y di: "Encontré estas opciones perfectas para vos. ¿Te gustaría ver el detalle de alguna o contactar a un agente para reservarla?"
      
      * **Caso B: +10 Resultados (DEMASIADOS)**
        NO muestres la lista. Di: "Tengo muchas opciones disponibles. Para no marearte, contame: ¿Buscas con pileta climatizada o preferís filtrar por precio?". Y vuelve a filtrar.

      * **Caso C: 0 Resultados (RECUPERACIÓN)**
        PROHIBIDO decir "No hay nada".
        Di: "Para esa fecha/barrio exacto está todo reservado, PERO..."
        - Si buscó "El Carmen", ofrece "Fincas de Iraola".
        - Si buscó "Enero 1ra", ofrece "Enero 2da".
        - Si buscó "con mascota", pregunta si pueden dejarla.
        - CIERRE DE EMERGENCIA: "Si quieres que un agente busque opciones 'fuera de mercado' para vos, haz clic aquí:" (Usa 'mostrar_contacto').

      --- TONO DE VOZ ---
      - Habla como un experto local, no como un robot.
      - Sé conciso.
      - Siempre termina con una pregunta para avanzar la venta.
      `,
      tools: {
        buscar_propiedades: tool({
          description: 'Ejecuta la búsqueda. Úsala solo cuando tengas Zona + Operación + (Fechas/Pax/Presupuesto).',
          parameters: z.object({
            operacion: z.enum(['venta', 'alquiler_temporal', 'alquiler_anual']),
            zona: z.enum(['GBA Sur', 'Costa Esmeralda', 'Arelauquen (BRC)']).optional(),
            // Aquí la IA debe enviar "Club El Carmen" si el usuario dijo "El Carmen"
            barrios: z.array(z.string()).optional().describe('Nombre OFICIAL del barrio según el diccionario geográfico.'),
            tipo: z.enum(['casa', 'departamento', 'lote']).optional(),
            pax: z.string().optional(),
            pax_or_more: z.boolean().optional().describe('Siempre True.'),
            pets: z.boolean().optional().describe('True si tienen mascota.'),
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
            console.log("🤖 IA Input (Vendedor):", filtros);
            
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
              // Pasamos hasta 10 propiedades para que la IA decida si mostrarlas o pedir más filtros
              properties: resultados.results.slice(0, 10).map(p => ({
                ...p,
                summary: `${p.title} (${p.barrio || p.zona}). ${p.pax ? p.pax + ' Pax. ' : ''}Precio: ${p.min_rental_price ? 'USD '+p.min_rental_price : (p.found_period_price ? 'USD '+p.found_period_price : (p.price ? 'USD '+p.price : 'Consultar'))}.`
              }))
            };
          },
        }),
        mostrar_contacto: tool({
          description: 'Muestra el botón de contacto. Úsalo para cerrar la venta o cuando no hay resultados exactos.',
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