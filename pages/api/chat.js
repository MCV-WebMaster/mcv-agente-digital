import { openai } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { searchProperties } from '@/lib/propertyService';

export const maxDuration = 60;
const model = openai('gpt-4o');

// --- HERRAMIENTA DE CONTACTO ---
const mostrarContactoTool = tool({
  description: 'Muestra el botón para contactar a un agente humano. Úsalo para cerrar la venta, cuando el cliente elija una propiedad, o si pide fechas fuera de temporada (marzo-diciembre).',
  parameters: z.object({ motivo: z.string().optional() }),
  execute: async ({ motivo }) => ({ showButton: true, motivo }),
});

// --- HERRAMIENTA DE BÚSQUEDA ---
const buscarPropiedadesTool = tool({
  description: 'Busca propiedades en la base de datos. ÚSALA SOLO CUANDO TENGAS TODOS LOS DATOS REQUERIDOS (Venta: Dorms/Zona | Alquiler: Periodo/Pax/Mascotas).',
  parameters: z.object({
    operacion: z.enum(['venta', 'alquiler_temporal', 'alquiler_anual']).optional(),
    zona: z.enum(['GBA Sur', 'Costa Esmeralda', 'Arelauquen (BRC)']).optional(),
    barrios: z.array(z.string()).optional(),
    tipo: z.enum(['casa', 'departamento', 'lote']).optional(),
    pax: z.string().optional(),
    pax_or_more: z.boolean().optional().describe('Siempre True para búsquedas de capacidad.'),
    pets: z.boolean().optional(),
    pool: z.boolean().optional(),
    bedrooms: z.string().optional(),
    minPrice: z.string().optional(),
    maxPrice: z.string().optional().describe('Presupuesto Tope.'),
    searchText: z.string().optional().describe('Palabras clave: lavavajillas, losa, aire, etc.'),
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
        
        // Ajustes por defecto
        if (filtros.pax) filtros.pax_or_more = true;
        if (!filtros.limit) filtros.limit = 3; 
        if (!filtros.offset) filtros.offset = 0;

        // Limpieza de precio
        let originalMaxPrice = null;
        if (filtros.maxPrice) {
            const cleanPrice = filtros.maxPrice.replace(/[\.,kK$USD\s]/g, '');
            originalMaxPrice = parseInt(cleanPrice);
            if (!isNaN(originalMaxPrice)) {
                // Corrección de miles si el usuario puso "200"
                if (originalMaxPrice < 1000) originalMaxPrice *= 1000; 
                filtros.maxPrice = (originalMaxPrice * 1.30).toString(); // +30% Tolerancia
            } else {
                delete filtros.maxPrice;
            }
        }
        filtros.sortBy = 'price_asc';

        // 1. EJECUTAR BÚSQUEDA PRINCIPAL
        let resultados = await searchProperties(filtros);

        // 2. PROTOCOLO DE RESCATE (Si da 0 resultados)
        if (resultados.count === 0) {
            // Intento A: Si tenía precio, probamos sin precio
            if (originalMaxPrice) {
                let rescueFilters = {...filtros, maxPrice: null, offset: 0};
                let resRescue = await searchProperties(rescueFilters);
                if (resRescue.count > 0) {
                    resultados = resRescue;
                    resultados.warning = `precio_bajo|${originalMaxPrice}`;
                    resultados.originalMaxPrice = originalMaxPrice;
                }
            }
            // Intento B: Si tenía barrio específico, probamos en toda la zona
            else if (filtros.barrios && filtros.barrios.length > 0) {
                let rescueFilters = {...filtros, offset: 0};
                delete rescueFilters.barrios; 
                let resRescue = await searchProperties(rescueFilters);
                if (resRescue.count > 0) {
                    resultados = resRescue;
                    resultados.warning = "barrio_ampliado";
                }
            }
        }

        // 3. PREPARAR DATOS PARA LA IA (Resumen de texto seguro)
        const safeProperties = (resultados.results || []).map(p => {
            let displayPrice = "Consultar";
            // Lógica de visualización de precio para la IA
            if (p.found_period_price) {
                displayPrice = `USD ${p.found_period_price} (Total por el periodo)`;
            } else if (p.min_rental_price) {
                displayPrice = `USD ${p.min_rental_price} (Desde)`;
            } else if (p.price) {
                 displayPrice = `USD ${p.price}`;
            }

            return {
                ...p,
                // Datos crudos para el frontend
                price: p.price || 0, 
                min_rental_price: p.min_rental_price || 0,
                found_period_price: p.found_period_price || 0,
                title: p.title || 'Propiedad sin título',
                // Resumen semántico para que la IA entienda qué encontró
                summary: `${p.title} en ${p.barrio || p.zona}. ${p.bedrooms ? p.bedrooms + ' dorm. ' : ''}Precio: ${displayPrice}.`
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
        return { count: 0, properties: [], error: "Error interno en la búsqueda." };
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
      system: `Eres 'MaCA', la asistente comercial experta de MCV Propiedades.
      
      --- 👩‍💼 TU IDENTIDAD ---
      * Nombre: MaCA.
      * Equipo: Cecilia (Martillera), Marcela (GBA), Andrea (Costa).
      * Tono: Cálido, profesional, resolutivo y empático. Nunca robótico.
      
      --- 🗺️ CONOCIMIENTO DE ZONA ---
      * "Costa" = Costa Esmeralda.
      * Barrios Costa: Senderos (I,II,III,IV), Marítimo (I,II,III,IV), Golf (I,II), Residencial (I,II), Ecuestre, Deportiva, Bosque.
      * Barrios GBA Sur: El Carmen, Fincas de Iraola, Abril.
      
      --- 🚦 FLUJO DE VENTA (EMBUDO) ---
      1. **Calificación:**
         - **Venta:** "¿Qué buscas (Casa/Lote)?", "¿Cuántos dormitorios necesitas?", "¿Qué presupuesto aproximado manejas?".
         - **Alquiler:** 1. "¿Para qué fecha exacta?" (Enero 1ra, Febrero 2da...).
             2. "¿Cuántas personas son?".
             3. **"¿Llevan mascotas?"** (Pregunta obligatoria antes de buscar).
      
      2. **Búsqueda:** Solo busca cuando tengas los datos mínimos.
      
      3. **Manejo de Resultados:**
         - **Caso Éxito:** "Acá te muestro las mejores opciones. ¿Qué te parecen?".
         - **Caso "barrio_ampliado":** "En ese barrio no encontré, pero mirá estas opciones en barrios vecinos:".
         - **Caso "precio_bajo":** "Por ese valor no hay nada disponible, pero si estiramos un poco el presupuesto, mirá estas oportunidades:".
         - **Caso 0 absoluto:** "Para esa fecha exacta está todo completo. ¿Te gustaría ver disponibilidad para la quincena siguiente?".

      --- 🚫 REGLAS DE SALIDA (CRÍTICO) ---
      * **NO repitas** la lista de propiedades en texto (el usuario ya ve las tarjetas visuales).
      * **NO inventes** datos que no estén en el summary.
      * **SIEMPRE** termina con una pregunta de cierre ("¿Vemos más?", "¿Te contacto?", "¿Te gusta alguna?").
      
      Usa las herramientas con inteligencia y pausa.
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