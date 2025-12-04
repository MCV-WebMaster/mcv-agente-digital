import { openai } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { searchProperties } from '@/lib/propertyService';

export const maxDuration = 60;
const model = openai('gpt-4o');

const mostrarContactoTool = tool({
  description: 'Muestra el botón para contactar a un agente.',
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
    limit: z.number().optional().describe('Cantidad a mostrar (Default 6).'),
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
        if (!filtros.limit) filtros.limit = 6; 
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

        // Warning si hay muchas
        if (resultados.count > 10 && !filtros.maxPrice && !filtros.minPrice && filtros.offset === 0) {
            return {
                count: resultados.count,
                warning: "too_many_results",
                properties: [] 
            };
        }

        // Lógica de rescate (si no hay resultados por precio)
        if (resultados.count === 0 && originalMaxPrice) {
            let rescueFilters = {...filtros, maxPrice: null, offset: 0};
            let resRescue = await searchProperties(rescueFilters);
            if (resRescue.count > 0) {
                // Devolvemos resultados PERO con aviso de que ignoramos el precio
                // para que el bot sepa qué decir.
                const safeRescue = mapProperties(resRescue.results);
                return {
                    count: resRescue.count,
                    showing: safeRescue.length,
                    warning: "price_ignored", // <--- SEÑAL CLAVE
                    originalMaxPrice: originalMaxPrice,
                    properties: safeRescue
                };
            }
        } else if (resultados.count === 0 && filtros.barrios && filtros.barrios.length > 0) {
             let rescueFilters = {...filtros, offset: 0};
             delete rescueFilters.barrios;
             let resRescue = await searchProperties(rescueFilters);
             if (resRescue.count > 0) {
                 return {
                     count: resRescue.count,
                     showing: mapProperties(resRescue.results).length,
                     warning: "barrio_ignored",
                     properties: mapProperties(resRescue.results)
                 };
             }
        }

        const safeProperties = mapProperties(resultados.results);

        return {
          count: resultados.count || 0,
          showing: safeProperties.length,
          nextOffset: filtros.offset + safeProperties.length,
          warning: resultados.warning || null,
          properties: safeProperties 
        };

    } catch (error) {
        console.error(error);
        return { count: 0, properties: [], error: "Error interno." };
    }
  },
});

// Helper para mapear propiedades
function mapProperties(props) {
    return (props || []).map(p => {
        let displayPrice = "Consultar";
        if (p.found_period_price) displayPrice = `USD ${p.found_period_price} (Total)`;
        else if (p.min_rental_price) displayPrice = `USD ${p.min_rental_price} (Desde)`;
        else if (p.price) displayPrice = `USD ${p.price}`;
        return { ...p, price: p.price || 0, displayPrice, summary: `ID: ${p.property_id}. ${p.barrio || p.zona}.` };
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
      
      --- 🚫 REGLAS DE FORMATO (IMPORTANTE) ---
      1. **NO USES ASTERISCOS (**) NI MARKDOWN**. Escribe texto plano limpio.
      2. **NO describas las propiedades en texto** (ej: "Casa con 3 dorms..."). La ficha visual ya muestra esa info.
      3. **Tu respuesta debe ser MUY BREVE**.

      --- 🚨 MANEJO DE RESULTADOS ---
      * Si la herramienta devuelve **warning: "price_ignored"**:
        DILE AL USUARIO: "No encontré nada por debajo de [precio_usuario]. Lo más económico disponible para esa fecha arranca en estos valores:" (y muestra las fichas).
        Sugiérele buscar en otra fecha (ej: Febrero o Navidad) para mejores precios.
      
      * Si devuelve **warning: "too_many_results"**:
        DILE: "Encontré muchas opciones. Para no marearte, ¿me decís tu presupuesto máximo aproximado?" (NO digas "aquí están").

      --- 📅 REGLAS DE FECHAS ---
      * Si el usuario dice solo "Enero" o "Febrero", **NO BUSQUES**. Pregunta qué quincena prefiere.

      --- 🧠 BASE DE CONOCIMIENTO (Reglas) ---
      1. HONORARIOS: Alquiler Temporal: Inquilino NO paga. Venta: 3-4%.
      2. LIMPIEZA: Obligatoria a cargo inquilino.
      3. ROPA BLANCA: NO incluida. Hay alquiler externo para CONTINGENCIAS.
      4. MASCOTAS: Se aceptan (Máx 3, NO cachorros).
      5. DEPÓSITO: E-Cheq (Recomendado), Efectivo (ANTES de entrar) o Transferencia (gastos a cargo inquilino).
      
      --- 🔗 FUENTE ---
      SOLO si el usuario pregunta explícitamente por reglas, gastos o condiciones legales, agrega al final:
      👉 Fuente: https://mcv-agente-digital.vercel.app/faq
      (NO lo agregues en búsquedas de propiedades).
      
      --- CIERRE ---
      Si no hay resultados o el precio es alto, ofrece contactar a un agente (usa la herramienta mostrar_contacto).
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