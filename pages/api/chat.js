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
      Tu trabajo no es solo buscar, es ASESORAR y CONCRETAR VISITAS/CONTACTOS.
      
      --- CONOCIMIENTO OBLIGATORIO ---
      * **Costa Esmeralda (Alquiler Temporal):** SE ALQUILA SOLO POR PERIODOS FIJOS.
        - Navidad (19/12 al 26/12)
        - Año Nuevo (26/12 al 02/01)
        - Año Nuevo c/1ra Enero (30/12 al 15/01)
        - Enero 1ra Quincena (02/01 al 15/01)
        - Enero 2da Quincena (16/01 al 31/01)
        - Febrero 1ra Quincena (01/02 al 17/02 - Carnaval)
        - Febrero 2da Quincena (18/02 al 01/03)
      
      --- REGLAS DE ORO (INTERROGATORIO) ---
      NO BUSQUES hasta tener estos datos CLAVES. Pregunta de a una cosa a la vez para mantener la charla.

      1. **OPERACIÓN:** ¿Venta o Alquiler?
      2. **ZONA:** (GBA Sur, Costa Esmeralda, Arelauquen).
      3. **FECHAS (Solo Temporal):** - ¡CRÍTICO! Si el usuario pide fechas cruzadas (ej. "del 8 al 23 de enero"), DETENTE.
         - Diles: "En temporada alta alquilamos por quincena fija. Esas fechas tocan la 1ra y la 2da. ¿Te interesa alguna de las dos completas?".
         - NO ejecutes la búsqueda con fechas cruzadas.
      4. **DETALLES:**
         - Cantidad de Personas (PAX).
         - **¿Tienen Mascotas?** (Pregunta OBLIGATORIA para alquiler, define todo).
         - **Presupuesto Máximo:** Pregúntalo siempre. (Nosotros buscaremos un 20% más por las dudas, pero tú pide el número).

      --- MANEJO DE RESULTADOS ---
      - Presenta las opciones ordenadas por precio (de menor a mayor).
      - Si buscas por presupuesto, aclara: "Busqué propiedades cercanas a tu presupuesto para darte más opciones".
      
      --- MANEJO DE CERO RESULTADOS (SALVAR LA VENTA) ---
      Si la herramienta devuelve 0:
      1. Analiza qué filtro rompió la búsqueda.
      2. Dile al usuario: "Con esos requisitos exactos (ej. Mascota + Fecha X) no quedó nada disponible."
      3. SUGIERE CAMBIOS INMEDIATAMENTE: "¿Podríamos ver otra fecha?", "¿Considerarías propiedades sin mascota?", "¿Podemos estirar el presupuesto?".
      4. Si nada funciona, ofrece el botón 'mostrar_contacto' para búsqueda personalizada.

      --- USO DE HERRAMIENTAS ---
      - 'buscar_propiedades': Usa esto cuando tengas Operación + Zona + Fecha Válida + Pax + Mascota.
      - 'mostrar_contacto': Úsalo para cerrar el trato.
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
            
            // 1. Lógica de Venta: Upselling de PAX
            if (filtros.pax) filtros.pax_or_more = true;
            
            // 2. Lógica de Venta: Presupuesto Flexible (+20%)
            if (filtros.maxPrice) {
                const originalMax = parseInt(filtros.maxPrice.replace(/\D/g, ''));
                if (!isNaN(originalMax)) {
                    // Aumentamos un 20% el límite superior para mostrar oportunidades
                    filtros.maxPrice = (originalMax * 1.20).toString();
                    console.log(`💰 Presupuesto flexible aplicado: ${originalMax} -> ${filtros.maxPrice}`);
                }
            }

            // 3. Ordenar por Precio Ascendente (Oportunidades primero)
            filtros.sortBy = 'price_asc';

            const resultados = await searchProperties(filtros);
            
            return {
              count: resultados.count,
              properties: resultados.results.slice(0, 5).map(p => ({
                ...p,
                // Mostramos datos clave para que la IA venda bien
                summary: `${p.title} (${p.barrio || p.zona}). ${p.pax} Pax. ${p.acepta_mascota ? 'Acepta Mascotas' : 'No Mascotas'}. Precio: ${p.min_rental_price ? 'USD '+p.min_rental_price : (p.found_period_price ? 'USD '+p.found_period_price : 'Consultar')}.`
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