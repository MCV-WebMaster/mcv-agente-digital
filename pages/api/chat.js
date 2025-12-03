import { openai } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { searchProperties } from '@/lib/propertyService';

export const maxDuration = 60;
const model = openai('gpt-4o');

const mostrarContactoTool = tool({
  description: 'Muestra el botón para contactar a un agente. Úsalo cuando el cliente elija una propiedad específica, pida reservar o quiera hablar con un humano.',
  parameters: z.object({ motivo: z.string().optional() }),
  execute: async ({ motivo }) => ({ showButton: true, motivo }),
});

const buscarPropiedadesTool = tool({
  description: 'Busca propiedades en la base de datos.',
  parameters: z.object({
    operacion: z.enum(['venta', 'alquiler_temporal', 'alquiler_anual']).optional(),
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
    searchText: z.string().optional(),
    limit: z.number().optional().describe('Cantidad a mostrar (Default 3).'),
    offset: z.number().optional().describe('Desde dónde mostrar.'),
    selectedPeriod: z.enum([
      'Navidad', 'Año Nuevo', 'Año Nuevo con 1ra Enero',
      'Enero 1ra Quincena', 'Enero 2da Quincena', 
      'Febrero 1ra Quincena', 'Febrero 2da Quincena', 'Diciembre 2da Quincena'
    ]).optional(),
  }),
  execute: async (filtros) => {
    try {
        console.log("🤖 IA Input:", filtros);
        
        if (filtros.pax) filtros.pax_or_more = true;
        if (!filtros.limit) filtros.limit = 3; 
        if (!filtros.offset) filtros.offset = 0;

        let originalMaxPrice = null;
        if (filtros.maxPrice) {
            const cleanPrice = filtros.maxPrice.replace(/[\.,kK$USD\s]/g, '');
            originalMaxPrice = parseInt(cleanPrice);
            if (!isNaN(originalMaxPrice)) {
                if (originalMaxPrice < 1000) originalMaxPrice *= 1000; 
                filtros.maxPrice = (originalMaxPrice * 1.30).toString(); 
            } else {
                delete filtros.maxPrice;
            }
        }
        filtros.sortBy = 'price_asc';

        let resultados = await searchProperties(filtros);

        // PROTOCOLO DE RESCATE (Si da 0)
        if (resultados.count === 0) {
            if (originalMaxPrice) {
                let rescueFilters = {...filtros, maxPrice: null, offset: 0};
                let resRescue = await searchProperties(rescueFilters);
                if (resRescue.count > 0) {
                    resultados = resRescue;
                    resultados.warning = `precio_bajo|${originalMaxPrice}`;
                    resultados.originalMaxPrice = originalMaxPrice;
                }
            } else if (filtros.barrios && filtros.barrios.length > 0) {
                let rescueFilters = {...filtros, offset: 0};
                delete rescueFilters.barrios; 
                let resRescue = await searchProperties(rescueFilters);
                if (resRescue.count > 0) {
                    resultados = resRescue;
                    resultados.warning = "barrio_ampliado";
                }
            }
        }

        // SOBRECARGA
        const hasSpecificFilter = filtros.maxPrice || filtros.pool || filtros.selectedPeriod;
        if (resultados.count > 10 && !hasSpecificFilter && filtros.offset === 0) {
            return {
                count: resultados.count,
                warning: "too_many",
                properties: [] 
            };
        }

        const safeProperties = (resultados.results || []).map(p => {
            let displayPrice = "Consultar";
            if (p.found_period_price) {
                displayPrice = `USD ${p.found_period_price} (Total por quincena)`;
            } else if (p.min_rental_price) {
                displayPrice = `USD ${p.min_rental_price} (Desde)`;
            } else if (p.price) {
                 displayPrice = `USD ${p.price}`;
            }

            return {
                ...p,
                price: p.price || 0, 
                min_rental_price: p.min_rental_price || 0,
                found_period_price: p.found_period_price || 0,
                title: p.title || 'Propiedad',
                summary: `${p.title} (${p.barrio || p.zona}). Precio: ${displayPrice}.`
            };
        });

        return {
          count: resultados.count || 0,
          showing: safeProperties.length,
          nextOffset: filtros.offset + safeProperties.length,
          warning: resultados.warning || null,
          originalMaxPrice: resultados.originalMaxPrice || null,
          appliedFilters: filtros, 
          properties: safeProperties 
        };

    } catch (error) {
        console.error("Error en tool buscar_propiedades:", error);
        return { count: 0, properties: [], error: "Error interno." };
    }
  },
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { messages } = req.body;

  try {
    const result = await streamText({
      model: model,
      messages: messages,
      maxSteps: 5, 
      system: `Eres 'Asistente Comercial MCV', un agente inmobiliario experto, cálido y empático. Tu objetivo es ayudar a las familias a encontrar su lugar ideal, no solo filtrar datos.
      
      --- 🗣️ TONO DE VOZ Y PERSONALIDAD ---
      * **Cálido y Servicial:** Usa frases como "¡Qué lindo plan!", "Entiendo lo que buscas", "Déjame revisar...".
      * **No Robot:** Evita respuestas secas como "No hay resultados".
      * **Proactivo:** Si hay un obstáculo, propón una solución inmediata.
      
      --- 🗺️ MAPEO GEOGRÁFICO ---
      * "Senderos" -> incluye: Senderos I, II, III y IV.
      * "Marítimo" -> incluye: Marítimo I, II, III y IV.
      * "Costa" -> Costa Esmeralda.
      
      --- 🚦 REGLAS DE FLUJO ---
      1. **INDAGACIÓN SUAVE:**
         - Si piden Venta: "¿Qué comodidades son imprescindibles para vos? ¿Cuántos dormitorios necesitas?".
         - Si piden Alquiler: "¿Para qué fecha tienen planeado venir? ¿Cuántos son en la familia?".
         - **Mascotas:** Pregunta amablemente: *"¿Viajan con mascotas?"* (No digas "¿Se permiten?").

      2. **MANEJO DE RESULTADOS VACÍOS (RESCATE EMPÁTICO):**
         - Si la búsqueda da 0 resultados:
           - **NUNCA DIGAS SOLO "No encontré nada".**
           - Di: *"Estuve revisando y para esa fecha exacta en ese barrio ya está todo reservado. ¡Pero no te preocupes! Tengo disponibilidad para [FECHA VECINA] o en [BARRIO VECINO]. ¿Te gustaría que miremos esas opciones?"*
           - Si es por mascotas: *"Para esa fecha con mascotas está difícil, pero tengo opciones hermosas si tienen quien cuide a la mascota, o en otra fecha. ¿Qué preferís?"*

      3. **MANEJO DE MUCHOS RESULTADOS:**
         - Si hay +10: *"¡Tengo muchas opciones lindas! Para no marearte con tantas, contame: ¿Tenés algún presupuesto tope o buscás algo específico como pileta climatizada?"*

      4. **PRESENTACIÓN DE PROPIEDADES:**
         - Di: *"Acá seleccioné las mejores opciones para lo que buscas:"*
         - **NO REPITAS LA LISTA EN TEXTO.** (El usuario ya ve las fotos).
         
      5. **EL CIERRE (SIEMPRE):**
         - Nunca te calles después de mostrar fichas.
         - Pregunta: *"Se ven lindas, ¿no? ¿Alguna te llama la atención para ver en detalle?"* o *"¿Querés que sigamos buscando?"*.
         - Si eligen una propiedad: *"¡Excelente elección! ¿Te gustaría que te ponga en contacto con un agente para agendar una visita o ver más detalles?"* -> Ejecuta 'mostrar_contacto'.
      
      Usa 'buscar_propiedades' para consultar.
      `,
      tools: {
        buscar_propiedades: buscarPropiedadesTool,
        mostrar_contacto: mostrarContactoTool,
      },
    });

    result.pipeDataStreamToResponse(res);

  } catch (error) {
    console.error('Error en Chat API:', error);
    res.status(500).json({ error: error.message });
  }
}