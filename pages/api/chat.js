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
      
      --- 🌍 CONOCIMIENTO GEOGRÁFICO OBLIGATORIO ---
      Si el usuario menciona estos lugares, NO preguntes la zona, ASÚMELA:
      * **"El Carmen" / "Club El Carmen"** -> Zona: "GBA Sur", Barrio: "Club El Carmen".
      * **"Fincas" / "Fincas de Iraola"** -> Zona: "GBA Sur", Barrio: "Fincas de Iraola".
      * **"Abril" / "Club de Campo Abril"** -> Zona: "GBA Sur", Barrio: "Club de Campo Abril".
      * **"Costa" / "La Costa" / "Pinamar"** -> Zona: "Costa Esmeralda".
      * **"Arelauquen"** -> Zona: "Arelauquen (BRC)".

      --- 📅 CONOCIMIENTO DE TEMPORADA (COSTA ESMERALDA) ---
      Periodos Fijos: Navidad, Año Nuevo, Año Nuevo c/1ra Enero, Enero 1ra, Enero 2da, Febrero 1ra (Carnaval), Febrero 2da.
      - Si piden fechas cruzadas (ej. 8 al 23 de Enero), explica los periodos fijos y pregunta cuál prefieren.

      --- 🧠 LÓGICA DE VENTA ---
      1. **PRESUPUESTO:** Si el usuario da un tope, busca opciones cercanas (nosotros internamente buscamos un 30% más arriba). Si encuentras opciones por encima de su presupuesto, avísale: "Encontré opciones excelentes un poco por encima de tu presupuesto".
      2. **CERO RESULTADOS:** Si no hay nada, sugiere cambios proactivamente ("¿Vemos otro barrio?", "¿Otra fecha?"). No te rindas.
      3. **CONTACTO:** Ofrece el botón si el usuario quiere hablar con un humano.

      --- HERRAMIENTAS ---
      Usa 'buscar_propiedades' cuando tengas los datos mínimos (Operación + Zona).
      `,
      tools: {
        buscar_propiedades: tool({
          description: 'Ejecuta la búsqueda en la base de datos.',
          parameters: z.object({
            operacion: z.enum(['venta', 'alquiler_temporal', 'alquiler_anual']),
            zona: z.enum(['GBA Sur', 'Costa Esmeralda', 'Arelauquen (BRC)']).optional(),
            barrios: z.array(z.string()).optional().describe('Usar nombres oficiales si es posible.'),
            tipo: z.enum(['casa', 'departamento', 'lote']).optional(),
            pax: z.string().optional(),
            pax_or_more: z.boolean().optional().describe('Siempre True para upselling.'),
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
            
            // 1. Upselling de PAX automático
            if (filtros.pax) filtros.pax_or_more = true;
            
            // 2. Presupuesto Flexible (+30%)
            if (filtros.maxPrice) {
                const originalMax = parseInt(filtros.maxPrice.replace(/\D/g, ''));
                if (!isNaN(originalMax)) {
                    filtros.maxPrice = (originalMax * 1.30).toString(); 
                }
            }

            // 3. Ordenar por precio ascendente (Oportunidades primero)
            filtros.sortBy = 'price_asc';

            const resultados = await searchProperties(filtros);
            
            return {
              count: resultados.count,
              // Devolvemos los filtros que se usaron para poder generar el link "Ver Todo"
              appliedFilters: filtros, 
              properties: resultados.results.slice(0, 5).map(p => ({
                ...p,
                summary: `${p.title} (${p.barrio || p.zona}). Precio: ${p.min_rental_price ? 'USD '+p.min_rental_price : (p.found_period_price ? 'USD '+p.found_period_price : 'Consultar')}.`
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