import { openai } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { searchProperties } from '@/lib/propertyService';

export const maxDuration = 60;
const model = openai('gpt-4o');

// Herramienta para mostrar botón de contacto
const mostrarContactoTool = tool({
  description: 'Muestra el botón para contactar a un agente. Úsalo SIEMPRE si el usuario pide hablar con alguien, pregunta por una persona específica (Cecilia, Andrea, Marcela, Roxana), o si la consulta requiere atención humana.',
  parameters: z.object({ motivo: z.string().optional() }),
  execute: async ({ motivo }) => ({ showButton: true, motivo }),
});

// Herramienta de búsqueda
const buscarPropiedadesTool = tool({
  description: 'Busca propiedades en la base de datos.',
  parameters: z.object({
    operacion: z.enum(['venta', 'alquiler_temporal', 'alquiler_anual']).optional(),
    zona: z.enum(['GBA Sur', 'Costa Esmeralda', 'Arelauquen (BRC)']).optional(),
    barrios: z.array(z.string()).optional(),
    tipo: z.enum(['casa', 'departamento', 'lote', 'local', 'deposito']).optional(), // Agregados tipos comerciales
    pax: z.string().optional(),
    pax_or_more: z.boolean().optional(),
    pets: z.boolean().optional(),
    pool: z.boolean().optional(),
    bedrooms: z.string().optional(),
    minPrice: z.string().optional(),
    maxPrice: z.string().optional(),
    searchText: z.string().optional(),
    limit: z.number().optional().describe('Cantidad a mostrar (Default 3).'),
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
        
        // Ajustes por defecto
        if (filtros.pax) filtros.pax_or_more = true;
        if (!filtros.limit) filtros.limit = 3; // Regla de 3 miniaturas máx
        if (!filtros.offset) filtros.offset = 0;

        // Limpieza de precio (Puntos y Comas)
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

        // Caso: Muchos resultados (>10) y sin precio -> Pedir filtro
        if (resultados.count > 10 && !filtros.maxPrice && !filtros.minPrice && filtros.offset === 0) {
            return {
                count: resultados.count,
                warning: "too_many_results",
                properties: [] 
            };
        }

        // Caso: Sin resultados por precio -> Búsqueda de Rescate
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

// Helper de mapeo
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
      
      --- 👥 NUESTRO EQUIPO (DATOS DE CONTACTO) ---
      Si el usuario pregunta por alguien, da el dato y MUESTRA EL BOTÓN DE CONTACTO.
      * Cecilia Vidal: Martillera Pública (Col. 1172). Cel: +5491165517385.
      * Andrea Diaz: Especialista Costa Esmeralda. Cel: +5491123868006.
      * Marcela Cacace: Especialista GBA Sur. Cel: +5491154113729.
      * Roxana Caputo: Especialista GBA Sur. Cel: +5491140395111.

      --- 📅 REGLAS DE FECHAS (CRÍTICO) ---
      1. **CARNAVAL 2026:** Cae 16 y 17 de Febrero. Si piden "Carnaval", busca en **Febrero 1ra Quincena** (o Febrero completo).
      2. **MESES:** Si dice "Enero" o "Febrero" a secas, **NO BUSQUES**. Pregunta la quincena.
      
      --- 🧠 REGLAS DE NEGOCIO ---
      1. **HORARIOS:** Check-in 16:00hs | Check-out 10:00hs.
      2. **HONORARIOS:** - Alquiler Temporal: 0% para el inquilino.
         - Venta: 3% a 4%.
      3. **ROPA BLANCA:** NO incluida. Hay alquiler externo para CONTINGENCIAS.
      4. **DEPÓSITO:** E-Cheq (Recomendado), Efectivo (ANTES de entrar), Transferencia (gastos a cargo inquilino).
      5. **LOTES COMERCIALES:** Si piden alquiler de lote, busca sin restricciones de dormitorios.

      --- 🚫 FORMATO VISUAL (ANTIRROBOT) ---
      1. **CERO ASTERISCOS:** Escribe texto plano. No uses negritas (**).
      2. **CERO LISTAS:** Si muestras fichas visuales, NO repitas la lista en texto.
      3. **CIERRE:** Siempre di: "Acá te muestro [showing] de las [count] opciones encontradas." y ofrece contactar agente.

      --- 🚨 MANEJO DE RESULTADOS ---
      * Si warning "price_ignored": Avisa que no hay nada por ese precio, muestra lo más barato y sugiere cambiar fecha.
      * Si warning "too_many_results": Pide presupuesto.

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