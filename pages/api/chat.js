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
    tipo: z.enum(['casa', 'departamento', 'lote', 'local', 'deposito']).optional(),
    pax: z.string().optional(),
    pax_or_more: z.boolean().optional(),
    pets: z.boolean().optional(),
    pool: z.boolean().optional(),
    bedrooms: z.string().optional(),
    minPrice: z.string().optional(),
    maxPrice: z.string().optional(),
    searchText: z.string().optional(),
    limit: z.number().optional(),
    offset: z.number().optional(),
    selectedPeriod: z.enum([
      'Navidad', 'Año Nuevo', 'Año Nuevo con 1ra Enero',
      'Enero 1ra Quincena', 'Enero 2da Quincena', 
      'Febrero 1ra Quincena', 'Febrero 2da Quincena', 'Diciembre 2da Quincena'
    ]).optional(),
  }),
  execute: async (filtros) => {
    try {
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
            } else { delete filtros.maxPrice; }
        }
        filtros.sortBy = 'price_asc';

        let resultados = await searchProperties(filtros);

        if (resultados.count > 10 && !filtros.maxPrice && !filtros.minPrice && filtros.offset === 0) {
            return {
                count: resultados.count,
                warning: "too_many_results",
                properties: [] 
            };
        }

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
      
      --- 👥 EQUIPO MCV ---
      * Cecilia Vidal (Martillera). Cel: +5491165517385.
      * Andrea Diaz (Costa Esmeralda). Cel: +5491123868006.
      * Marcela Cacace (GBA Sur). Cel: +5491154113729.
      * Roxana Caputo (GBA Sur). Cel: +5491140395111.

      --- 📅 FECHAS CRÍTICAS ---
      1. **CARNAVAL 2026:** Es 16/17 Febrero. Si piden "Carnaval", busca en **Febrero 1ra Quincena**.
      2. **MESES:** Si dice "Enero" o "Febrero", PREGUNTA QUINCENA.

      --- 🧠 BASE DE CONOCIMIENTO ---
      1. HORARIOS: Ingreso 16:00 hs | Salida 10:00 hs.
      2. HONORARIOS: Alquiler Temporal 0%. Venta 3-4%.
      3. LIMPIEZA: Obligatoria (cargo inquilino).
      4. ROPA BLANCA: NO incluida.
      5. MASCOTAS: Se aceptan (Máx 3).
      6. DEPÓSITO: E-Cheq, Efectivo (antes), Transferencia (cargo inquilino).

      --- 🚫 FORMATO VISUAL ---
      1. **CERO ASTERISCOS.**
      2. **CERO LISTAS DE TEXTO** si mostrás fichas visuales.
      3. **CIERRE:** Siempre: "Acá te muestro [showing] de las [count] opciones encontradas. ¿Querés ver más o contactar a un agente?"

      --- 🚨 MANEJO DE RESULTADOS ---
      * Si warning "price_ignored": "No encontré nada por debajo de tu presupuesto. Lo más económico arranca en USD [minFoundPrice]."
      * Si warning "too_many_results": "Encontré [count] opciones. ¿Me decís tu presupuesto máximo?"

      --- 🔗 FUENTE ---
      SOLO si preguntan reglas: 👉 Fuente: https://mcv-agente-digital.vercel.app/faq
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