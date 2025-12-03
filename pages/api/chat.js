import { openai } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { searchProperties } from '@/lib/propertyService';

export const maxDuration = 60;
const model = openai('gpt-4o');

// Herramienta para contacto humano
const mostrarContactoTool = tool({
  description: 'Muestra el botón para contactar a un agente. Úsalo al final, o si el usuario lo pide.',
  parameters: z.object({ motivo: z.string().optional() }),
  execute: async ({ motivo }) => ({ showButton: true, motivo }),
});

// Herramienta principal de búsqueda
const buscarPropiedadesTool = tool({
  description: 'Busca propiedades. ÚSALA SOLO CUANDO TENGAS TODOS LOS DATOS REQUERIDOS.',
  parameters: z.object({
    operacion: z.enum(['venta', 'alquiler_temporal', 'alquiler_anual']),
    zona: z.enum(['GBA Sur', 'Costa Esmeralda', 'Arelauquen (BRC)']).optional(),
    barrios: z.array(z.string()).optional(),
    tipo: z.enum(['casa', 'departamento', 'lote']).optional(),
    pax: z.string().optional(),
    pax_or_more: z.boolean().optional().describe('True para alquiler.'),
    pets: z.boolean().optional().describe('OBLIGATORIO para Alquiler.'),
    pool: z.boolean().optional(),
    bedrooms: z.string().optional(),
    minPrice: z.string().optional(),
    maxPrice: z.string().optional().describe('OBLIGATORIO antes de mostrar lista larga.'),
    showOtherDates: z.boolean().optional().describe('True si el usuario pide fechas fuera de temporada (marzo-diciembre).'),
    selectedPeriod: z.enum([
      'Navidad', 'Año Nuevo', 'Año Nuevo con 1ra Enero',
      'Enero 1ra Quincena', 'Enero 2da Quincena', 
      'Febrero 1ra Quincena', 'Febrero 2da Quincena', 'Diciembre 2da Quincena'
    ]).optional(),
  }),
  execute: async (filtros) => {
    console.log("🤖 IA Buscando...", filtros);
    
    if (filtros.pax) filtros.pax_or_more = true;
    
    let originalMaxPrice = null;
    if (filtros.maxPrice) {
        originalMaxPrice = parseInt(filtros.maxPrice.replace(/\D/g, ''));
        if (!isNaN(originalMaxPrice)) {
            filtros.maxPrice = (originalMaxPrice * 1.30).toString(); // +30% Tolerancia
        }
    }
    filtros.sortBy = 'price_asc';

    // 1. Búsqueda
    let resultados = await searchProperties(filtros);

    // 2. Rescate (0 resultados)
    if (resultados.count === 0) {
        if (originalMaxPrice) {
            let rescueFilters = {...filtros, maxPrice: null};
            let resRescue = await searchProperties(rescueFilters);
            if (resRescue.count > 0) {
                resultados = resRescue;
                resultados.warning = `precio_bajo|${originalMaxPrice}`;
                resultados.originalMaxPrice = originalMaxPrice;
            }
        }
    }
    
    // 3. Sobrecarga (+10 resultados)
    // Si hay muchos, no devolvemos la lista completa, forzamos a la IA a pedir más filtros
    if (resultados.count > 10 && !filtros.maxPrice && !filtros.pool) {
        return {
            count: resultados.count,
            warning: "too_many",
            properties: [] 
        };
    }

    return {
      count: resultados.count,
      warning: resultados.warning || null,
      originalMaxPrice: resultados.originalMaxPrice || null,
      appliedFilters: filtros, 
      properties: resultados.results.slice(0, 6).map(p => ({
        ...p,
        summary: `${p.title} (${p.barrio || p.zona}). ${p.min_rental_price ? 'USD '+p.min_rental_price : (p.price ? 'USD '+p.price : 'Consultar')}.`
      }))
    };
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
      system: `Eres 'Asistente Comercial MCV', un vendedor experto.
      
      --- 🚦 TU REGLA DE ORO: EL EMBUDO ---
      No puedes recomendar nada si no conoces al cliente.
      
      **PASO 1: MAPEO MENTAL**
      * "El Carmen" -> GBA Sur, Barrio "Club El Carmen".
      * "Costa" -> Costa Esmeralda.
      * "Fincas" -> GBA Sur, Barrio "Fincas de Iraola".
      
      **PASO 2: RECOLECCIÓN DE DATOS (UNO POR UNO)**
      Si el usuario pide "Alquiler en Costa", NO BUSQUES. Pregunta en orden:
      1. **Periodo:** "¿Qué quincena buscas? (Enero 1ra, Enero 2da, Febrero...)".
      2. **Pax:** "¿Cuántas personas son?".
      3. **Mascotas:** "¿Viajan con mascotas? (Esto es clave)".
      
      *Si el usuario responde solo uno, pregunta el siguiente.*
      
      **PASO 3: LA BÚSQUEDA**
      Solo ejecuta 'buscar_propiedades' cuando tengas Periodo + Pax + Mascotas.
      
      **PASO 4: EL CIERRE**
      * **0 Opciones:** "No tengo disponibilidad exacta, pero..." (Ofrece rescate).
      * **+10 Opciones:** "Tengo muchas opciones. ¿Cuál es tu presupuesto tope para filtrar las mejores?"
      * **1-10 Opciones:** Muestra y ofrece contacto.

      --- HERRAMIENTAS ---
      Usa 'buscar_propiedades' y 'mostrar_contacto'.
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