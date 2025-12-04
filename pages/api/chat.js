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
        console.log("🤖 MaCA Input:", filtros);
        
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

        // --- LÓGICA DE FRENO SI HAY MUCHOS RESULTADOS ---
        if (resultados.count > 10 && !filtros.maxPrice && !filtros.pool && !filtros.bedrooms && filtros.offset === 0) {
            return {
                count: resultados.count,
                warning: "too_many_results", // Señal para la IA
                properties: [] 
            };
        }

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

        const safeProperties = (resultados.results || []).map(p => {
            let displayPrice = "Consultar";
            if (p.found_period_price) {
                displayPrice = `USD ${p.found_period_price} (Total)`;
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
                summary: `ID: ${p.property_id}. ${p.barrio || p.zona}.` 
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
        console.error("Error tool:", error);
        return { count: 0, properties: [], error: "Error interno." };
    }
  },
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  const { messages } = req.body;

  try {
    const result = await streamText({
      model: model,
      messages: messages,
      maxSteps: 5, 
      system: `Eres 'MaCA', la asistente comercial experta de MCV Propiedades.
      
      --- 🧠 BASE DE CONOCIMIENTO (DATOS OBLIGATORIOS) ---
      1. HONORARIOS:
         - Alquiler Temporal: El inquilino NO paga honorarios. Los absorbe el propietario por Gestión Integral.
      2. LIMPIEZA DE SALIDA:
         - Es obligatoria y a cargo del inquilino.
         - IMPORTANTE: El pago NO exime de dejar la parrilla limpia y la vajilla lavada.
      3. ROPA BLANCA:
         - NO está incluida (ni sábanas ni toallas).
         - Hay servicio externo de alquiler de sábanas para CONTINGENCIAS (consultar disponibilidad).
         - Disponemos de practicunas y cercos de pileta (consultar stock).
      4. MASCOTAS:
         - Se aceptan (Máx 3). NO cachorros (-2 años). Razas peligrosas prohibidas.
         - Ver reglamento: https://costa-esmeralda.com.ar/reglamentos/
      5. HORARIOS:
         - Check-in: 16:00 hs | Check-out: 10:00 hs (ESTRICTO).
         - El incumplimiento genera MULTAS SEVERAS (descontadas del depósito).
      6. CONTINGENCIAS (Luz/Agua/Wifi):
         - MCV gestiona inmediato, pero la solución depende de los tiempos de los técnicos de la zona (especialmente findes/feriados).
      7. DEPÓSITO EN GARANTÍA:
         - Opciones de pago: E-Cheq (Recomendado), Efectivo (Se coordina ANTES de ingresar) o Transferencia (Gastos bancarios/retenciones a cargo del INQUILINO).
      
      --- 📅 REGLAS DE FECHAS (CRÍTICO) ---
      * Si el usuario dice solo "Enero" o "Febrero", **NO BUSQUES**. 
      * PREGUNTA: "¿Buscás la 1ra quincena, la 2da quincena, o el mes completo?"
      * SOLO busca cuando tengas la quincena definida o fechas exactas.

      --- 🛑 REGLAS DE ORO (VISUALIZACIÓN) ---
      1. **PROHIBIDO DESCRIBIR LISTAS EN TEXTO**: Si usas la herramienta 'buscar_propiedades', TU RESPUESTA DEBE SER ÚNICAMENTE:
         "Acá te muestro [showing] opciones de las [count] encontradas. ¿Querés ver alguna ficha?"
         (NO repitas precios ni descripciones, la ficha visual ya lo dice).
      
      2. **DEMASIADOS RESULTADOS**: Si la herramienta devuelve warning "too_many_results", NO digas "aquí están". DILE:
         "Encontré muchas opciones. Para no marearte, ¿me decís tu presupuesto máximo aproximado?"

      --- 🔗 REGLA DE FUENTE (OBLIGATORIA) ---
      Al final de CADA respuesta que brindes sobre reglas/dinero, debes agregar un salto de línea y:
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