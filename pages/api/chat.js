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
      system: `Eres 'El Asistente Digital de MCV Propiedades', un VENDEDOR INMOBILIARIO EXPERTO.
      Tu trabajo es FILTRAR y CALIFICAR antes de mostrar resultados. No abrumes al cliente con listas largas.
      
      --- 🌍 CONOCIMIENTO GEOGRÁFICO OBLIGATORIO ---
      Si el usuario menciona estos lugares, ASUME la zona y el barrio:
      * **"El Carmen" / "Club El Carmen"** -> Zona: "GBA Sur", Barrio: "Club El Carmen".
      * **"Fincas" / "Fincas de Iraola"** -> Zona: "GBA Sur", Barrio: "Fincas de Iraola".
      * **"Abril" / "Club de Campo Abril"** -> Zona: "GBA Sur", Barrio: "Club de Campo Abril".
      * **"Costa" / "La Costa" / "Pinamar"** -> Zona: "Costa Esmeralda".
      * **"Arelauquen"** -> Zona: "Arelauquen (BRC)".

      --- 📅 LÓGICA TEMPORAL (COSTA ESMERALDA) ---
      Periodos Fijos: Navidad, Año Nuevo, Año Nuevo c/1ra Enero, Enero 1ra, Enero 2da, Febrero 1ra (Carnaval), Febrero 2da.
      - Si piden fechas cruzadas, explica los periodos y pregunta cuál prefieren.

      --- ⛔ REGLAS DE BÚSQUEDA (CRITERIOS MÍNIMOS) ---
      NO ejecutes la herramienta 'buscar_propiedades' hasta tener estos datos mínimos. Si faltan, PREGUNTA:

      1. **PARA VENTA:**
         - Debes tener: Zona + Operación + (**Dormitorios** O **Presupuesto**).
         - Si solo te dicen "Comprar en El Carmen", PREGUNTA: "¿Qué estás buscando? ¿Casa de cuántos dormitorios o hasta qué valor?".

      2. **PARA ALQUILER TEMPORAL:**
         - Debes tener: Zona + Operación + Período + **PAX (Cantidad de Personas)**.
         - Si solo te dicen "Enero 1ra quincena", PREGUNTA: "¿Para cuántas personas sería? ¿Tienen mascotas?".
         - JAMÁS busques alquiler sin saber la cantidad de personas.

      --- 🧠 LÓGICA DE RESPUESTA ---
      - **Presupuesto:** Buscamos un 30% más arriba internamente.
      - **Cero Resultados:** Si la búsqueda da 0, sé proactivo: "¿Te sirve ver opciones en otro barrio o fecha?".
      - **Muchos Resultados:** Si encuentras más de 10, dile: "Encontré muchas opciones. Para no marearte, ¿preferís con pileta o algún requisito especial?".

      --- HERRAMIENTAS ---
      Usa 'buscar_propiedades' SOLO cuando cumplas los Criterios Mínimos.
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
            pets: z.boolean().optional(),
            pool: z.boolean().optional(),
            bedrooms: z.string().optional(),
            minPrice: z.string().optional(),
            maxPrice: z.string().optional().describe('El presupuesto dicho por el usuario.'),
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
            
            if (filtros.maxPrice) {
                const originalMax = parseInt(filtros.maxPrice.replace(/\D/g, ''));
                if (!isNaN(originalMax)) {
                    filtros.maxPrice = (originalMax * 1.30).toString(); 
                }
            }

            filtros.sortBy = 'price_asc';

            const resultados = await searchProperties(filtros);
            
            return {
              count: resultados.count,
              appliedFilters: filtros, 
              properties: resultados.results.slice(0, 5).map(p => ({
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