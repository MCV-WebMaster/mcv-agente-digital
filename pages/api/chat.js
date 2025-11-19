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
      system: `Eres 'Asistente Digital MCV', un vendedor inmobiliario experto y persuasivo.
      
      --- 🧠 MEMORIA Y CONTEXTO ---
      * MANTÉN el contexto (fechas, pax).
      * PERO sé flexible: Si el usuario cambia de barrio (ej. "y en Senderos?") y la búsqueda da 0 con el presupuesto anterior, IGNORA el presupuesto y muestra lo que hay, avisando: "En Senderos los precios son un poco más altos, pero mirá estas opciones:".

      --- 📅 LÓGICA TEMPORAL (COSTA ESMERALDA) ---
      * **Carnaval** = "Febrero 1ra Quincena" (01/02 al 17/02). SIEMPRE.
      * **Enero** = Pregunta 1ra (2-15) o 2da (16-31).

      --- 🔍 MANEJO DE "NO HAY RESULTADOS" ---
      Si la búsqueda devuelve 0:
      1. **Auto-Corrección:** Si estabas filtrando por precio o mascota, quita ese filtro internamente y busca de nuevo.
      2. **Respuesta:** "Con el tope de precio que pusimos no encontré en ese barrio, pero si nos estiramos un poco tengo estas opciones disponibles:".
      
      --- 🏘️ MAPEO DE BARRIOS ---
      * "El Carmen" -> GBA Sur, "Club El Carmen".
      * "Fincas", "Fincas 1" -> GBA Sur, "Fincas de Iraola".
      * "Fincas 2" -> GBA Sur, "Fincas de Iraola II".
      * "Senderos" -> Costa, "Senderos I", "Senderos II", "Senderos III", "Senderos IV".
      * "Deportiva" -> Costa, "Deportiva I", "Deportiva II".
      
      --- HERRAMIENTAS ---
      Usa 'buscar_propiedades'. Si el usuario pide una casa específica por nombre, usa el parámetro 'searchText' con el nombre de la casa y MANTÉN el 'selectedPeriod' para darle el precio correcto.
      `,
      tools: {
        buscar_propiedades: tool({
          description: 'Busca propiedades.',
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
            maxPrice: z.string().optional().describe('Presupuesto.'),
            searchText: z.string().optional().describe('Nombre de propiedad o característica.'),
            selectedPeriod: z.enum([
              'Navidad', 'Año Nuevo', 'Año Nuevo con 1ra Enero',
              'Enero 1ra Quincena', 'Enero 2da Quincena', 
              'Febrero 1ra Quincena', 'Febrero 2da Quincena', 'Diciembre 2da Quincena'
            ]).optional(),
          }),
          execute: async (filtros) => {
            console.log("🤖 IA Input (Intento 1):", filtros);
            
            if (filtros.pax) filtros.pax_or_more = true;
            filtros.sortBy = 'price_asc';

            // 1. Búsqueda Inicial
            let resultados = await searchProperties(filtros);

            // 2. Estrategia de Recuperación (Si da 0 y hay precio límite)
            if (resultados.count === 0 && filtros.maxPrice) {
                console.log("⚠️ 0 Resultados. Reintentando sin límite de precio...");
                delete filtros.maxPrice; // Quitamos el filtro de precio
                resultados = await searchProperties(filtros);
                // Marcamos para que la IA sepa que ignoramos el precio
                if (resultados.count > 0) resultados.warning = "ignore_price";
            }

            // 3. Estrategia de Recuperación de Barrio (Si da 0 y hay barrio específico)
            // Ej: Buscó "Senderos IV" y no hay. Buscamos en todo "Costa Esmeralda".
            if (resultados.count === 0 && filtros.barrios && filtros.barrios.length > 0) {
                 console.log("⚠️ 0 Resultados. Reintentando en toda la zona...");
                 delete filtros.barrios;
                 const resZona = await searchProperties(filtros);
                 if (resZona.count > 0) {
                     resultados = resZona;
                     resultados.warning = "ignore_barrio";
                 }
            }

            return {
              count: resultados.count,
              warning: resultados.warning,
              appliedFilters: filtros,
              properties: resultados.results.slice(0, 6).map(p => ({
                ...p,
                summary: `${p.title} (${p.barrio}). Precio: ${p.min_rental_price ? 'USD '+p.min_rental_price : (p.found_period_price ? 'USD '+p.found_period_price : 'Consultar')}.`
              }))
            };
          },
        }),
        mostrar_contacto: tool({
          description: 'Muestra el botón de contacto.',
          parameters: z.object({ motivo: z.string().optional() }),
          execute: async ({ motivo }) => ({ showButton: true, motivo }),
        }),
      },
    });

    result.pipeDataStreamToResponse(res);

  } catch (error) {
    console.error('Error en Chat API:', error);
    res.status(500).json({ error: error.message });
  }
}