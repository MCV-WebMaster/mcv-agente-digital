import { openai } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { searchProperties } from '@/lib/propertyService';

export const maxDuration = 60;
const model = openai('gpt-4o');

const mostrarContactoTool = tool({
  description: 'Muestra el botón para contactar a un agente. Úsalo SIEMPRE al final si el usuario duda, si la búsqueda falla, o si pide hablar con un humano.',
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
    pax_or_more: z.boolean().optional(),
    pets: z.boolean().optional(),
    pool: z.boolean().optional(),
    bedrooms: z.string().optional(),
    minPrice: z.string().optional(),
    maxPrice: z.string().optional(),
    searchText: z.string().optional(),
    limit: z.number().optional().describe('Cantidad a mostrar (Default 3).'), // REGLA: Max 3
    offset: z.number().optional(),
    selectedPeriod: z.enum([
      'Navidad', 'Año Nuevo', 'Año Nuevo con 1ra Enero',
      'Enero 1ra Quincena', 'Enero 2da Quincena', 
      'Febrero 1ra Quincena', 'Febrero 2da Quincena', 'Diciembre 2da Quincena'
    ]).optional(),
  }),
  execute: async (filtros) => {
    try {
        console.log("🤖 MaCA Input:", filtros);
        
        if (filtros.pax) filtros.pax_or_more = true;
        if (!filtros.limit) filtros.limit = 3; // FORZAMOS EL LÍMITE A 3
        if (!filtros.offset) filtros.offset = 0;

        let originalMaxPrice = null;
        if (filtros.maxPrice) {
            const cleanPrice = filtros.maxPrice.replace(/[\.,kK$USD\s]/g, '');
            originalMaxPrice = parseInt(cleanPrice);
            if (!isNaN(originalMaxPrice)) {
                if (originalMaxPrice < 1000) originalMaxPrice *= 1000; 
                filtros.maxPrice = (originalMaxPrice * 1.30).toString(); 
            } else { delete filtros.maxPrice; }
        }
        filtros.sortBy = 'price_asc';

        let resultados = await searchProperties(filtros);

        // CASO 1: Demasiados resultados (>10) y sin precio definido
        if (resultados.count > 10 && !filtros.maxPrice && !filtros.minPrice && filtros.offset === 0) {
            return {
                count: resultados.count,
                warning: "too_many_results",
                properties: [] 
            };
        }

        // CASO 2: Sin resultados exactos -> Búsqueda de Rescate (ignorando precio)
        if (resultados.count === 0 && originalMaxPrice) {
            let rescueFilters = {...filtros, maxPrice: null, offset: 0};
            let resRescue = await searchProperties(rescueFilters);
            if (resRescue.count > 0) {
                const safeRescue = mapProperties(resRescue.results);
                const minFound = Math.min(...safeRescue.map(p => p.price));
                return {
                    count: resRescue.count,
                    showing: safeRescue.length,
                    warning: "price_ignored", 
                    minFoundPrice: minFound,
                    appliedFilters: rescueFilters,
                    properties: safeRescue
                };
            }
        }

        const safeProperties = mapProperties(resultados.results);

        return {
          count: resultados.count || 0,
          showing: safeProperties.length,
          nextOffset: filtros.offset + safeProperties.length,
          warning: resultados.warning || null,
          appliedFilters: filtros, 
          properties: safeProperties 
        };

    } catch (error) {
        return { count: 0, properties: [], error: "Error interno." };
    }
  },
});

function mapProperties(props) {
    return (props || []).map(p => {
        let displayPrice = "Consultar";
        let numericPrice = p.price;
        if (p.found_period_price) {
            displayPrice = `USD ${p.found_period_price} (Total)`;
            numericPrice = p.found_period_price;
        } else if (p.min_rental_price) {
            displayPrice = `USD ${p.min_rental_price} (Desde)`;
            numericPrice = p.min_rental_price;
        } else if (p.price) {
            displayPrice = `USD ${p.price}`;
        }
        return { 
            ...p, 
            price: numericPrice || 0, 
            displayPrice, 
            summary: `ID: ${p.property_id}. ${p.barrio || p.zona}.` 
        };
    });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  const { messages } = req.body;

  try {
    const result = await streamText({
      model: model,
      messages: messages,
      maxSteps: 5, 
      system: `Eres 'MaCA', la asistente experta de MCV Propiedades.
      
      --- 👥 INFORMACIÓN DEL EQUIPO (SI PREGUNTAN) ---
      * Maria Cecilia Vidal: Martillera Pública.
      * Andrea Diaz: Equipo Costa Esmeralda (Recepción/Ventas).
      * Marcela Cacace: Equipo GBA Sur.
      * Roxana Caputo: Equipo GBA Sur.
      (Si preguntan por ellas, muestra el botón de contacto).

      --- 🧠 BASE DE CONOCIMIENTO (REGLAS OBLIGATORIAS) ---
      1. HORARIOS: Ingreso 16:00 hs | Salida 10:00 hs (Estricto). (JAMÁS DIGAS 15HS).
      2. HONORARIOS: Alquiler Temporal: Inquilino NO paga. Venta: 3-4%.
      3. LIMPIEZA: Obligatoria a cargo inquilino.
      4. ROPA BLANCA: NO incluida. Hay alquiler externo para CONTINGENCIAS.
      5. MASCOTAS: Se aceptan (Máx 3, NO cachorros).
      6. DEPÓSITO: E-Cheq (Recomendado), Efectivo (ANTES de entrar) o Transferencia (gastos a cargo inquilino).

      --- 🎯 PROTOCOLO DE BÚSQUEDA ---
      1. FECHAS: Si dice "Enero", PREGUNTA QUINCENA. No asumas.
      2. MASCOTAS: Si no lo dijo, PREGUNTA antes de buscar.

      --- 🚫 REGLAS DE FORMATO (ANTIRROBOT) ---
      1. **CERO ASTERISCOS:** Escribe texto plano. No uses **negritas**.
      2. **CERO LISTAS DE TEXTO:** Si muestras fichas visuales (tool result), **TU BOCA SE CIERRA**.
         NO repitas "1. Casa tal...". Solo di: "Te dejo arriba las opciones."
      
      --- 🚨 MANEJO DE RESULTADOS ---
      * Si warning "price_ignored":
        DILE: "No encontré nada por debajo de tu presupuesto. Lo más económico arranca en USD [minFoundPrice]. Te muestro [showing] opciones:"
        CIERRE: "¿Querés que busquemos en otra fecha más económica?"
      
      * Si warning "too_many_results":
        DILE: "Encontré [count] opciones. Para no marearte, ¿me decís tu presupuesto máximo aproximado?"

      --- 🔗 FUENTE ---
      SOLO si preguntan reglas/gastos:
      👉 Fuente: https://mcv-agente-digital.vercel.app/faq
      `,
      tools: {
        buscar_propiedades: buscarPropiedadesTool,
        mostrar_contacto: mostrarContactoTool,
      },
    });

    result.pipeDataStreamToResponse(res);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}