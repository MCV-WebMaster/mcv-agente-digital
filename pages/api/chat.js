import { openai } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { searchProperties } from '@/lib/propertyService';

export const maxDuration = 60;
const model = openai('gpt-4o');

const mostrarContactoTool = tool({
  description: 'Muestra el botón para contactar a un agente. Úsalo para cerrar la venta, cuando el cliente elija una propiedad, o si pide fechas fuera de temporada.',
  parameters: z.object({ motivo: z.string().optional() }),
  execute: async ({ motivo }) => ({ showButton: true, motivo }),
});

const buscarPropiedadesTool = tool({
  description: 'Busca propiedades en la base de datos. ÚSALA SOLO CUANDO TENGAS TODOS LOS DATOS REQUERIDOS.',
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

        // Warning si hay muchas (>10) y no hay filtro de precio
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
                // Mapeamos las propiedades de rescate
                const safeRescue = mapProperties(resRescue.results);
                
                // Calculamos el precio mínimo real encontrado para decírselo al usuario
                const minFound = Math.min(...safeRescue.map(p => p.price)); // Usamos el precio numérico limpio

                return {
                    count: resRescue.count,
                    showing: safeRescue.length,
                    warning: "price_ignored", 
                    minFoundPrice: minFound, // Le pasamos este dato al bot
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
        console.error(error);
        return { count: 0, properties: [], error: "Error interno." };
    }
  },
});

function mapProperties(props) {
    return (props || []).map(p => {
        let displayPrice = "Consultar";
        let numericPrice = p.price; // Valor por defecto

        if (p.found_period_price) {
            displayPrice = `USD ${p.found_period_price} (Total)`;
            numericPrice = p.found_period_price;
        }
        else if (p.min_rental_price) {
            displayPrice = `USD ${p.min_rental_price} (Desde)`;
            numericPrice = p.min_rental_price;
        }
        else if (p.price) {
            displayPrice = `USD ${p.price}`;
        }

        return { 
            ...p, 
            price: numericPrice || 0, // Precio numérico para lógica
            displayPrice, // String para mostrar
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
      
      --- 🎯 PROTOCOLO DE RECOLECCIÓN DE DATOS (ESTRICTO) ---
      Antes de ejecutar la búsqueda 'buscar_propiedades', DEBES tener confirmados:
      1. **FECHA/PERIODO:** (Ej: "Enero 2da Quincena"). Si dice solo "Enero", PREGUNTA qué quincena.
      2. **PASAJEROS:** Cantidad de personas.
      3. **MASCOTAS:** Si el usuario NO mencionó si trae mascotas, **PREGUNTA: "¿Vienen con mascotas?"**.
         *Solo busca sin preguntar mascotas si el usuario ya lo aclaró.*

      --- 🚫 REGLAS DE FORMATO (ANTIRROBOT) ---
      1. **CERO ASTERISCOS:** No uses negritas (**texto**). Escribe plano.
      2. **CERO LISTAS DE TEXTO:** Si muestras fichas visuales (tool result), **TU BOCA SE CIERRA**. 
         NO escribas "1. Casa tal - $Precio". NO repitas la info.
         Solo di: "Te dejo arriba las opciones. ¿Qué te parecen?"

      --- 🚨 MANEJO DE RESULTADOS ---
      * Si tool devuelve **warning: "price_ignored"**:
        DILE: "No encontré nada por debajo de tu presupuesto (es temporada alta). Te muestro opciones disponibles desde USD [minFoundPrice]."
        CIERRE: "¿Querés que busquemos en otra fecha más económica (como Febrero o Navidad)?"
      
      * Si tool devuelve **warning: "too_many_results"**:
        DILE: "Encontré [count] opciones. Para no marearte, ¿me decís tu presupuesto máximo aproximado?"

      --- 🧠 BASE DE CONOCIMIENTO (Reglas) ---
      1. HONORARIOS: Alquiler Temporal: Inquilino NO paga. Venta: 3-4%.
      2. LIMPIEZA: Obligatoria a cargo inquilino.
      3. ROPA BLANCA: NO incluida. Hay alquiler externo para CONTINGENCIAS.
      4. MASCOTAS: Se aceptan (Máx 3, NO cachorros).
      5. DEPÓSITO: E-Cheq (Recomendado), Efectivo (ANTES de entrar) o Transferencia (gastos a cargo inquilino).
      
      --- 🔗 FUENTE ---
      SOLO si preguntan por reglas/gastos:
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