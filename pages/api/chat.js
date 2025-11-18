import { openai } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { searchProperties } from '@/lib/propertyService';

export const maxDuration = 60;
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
      system: `Eres 'El Asistente Comercial de MCV Propiedades'. No eres un robot de soporte, eres un VENDEDOR PROACTIVO.

      --- 🗺️ TU MAPA MENTAL (CONOCIMIENTO OBLIGATORIO) ---
      Si el usuario menciona cualquier barrio de esta lista, YA SABES la ZONA. No la preguntes.
      
      **ZONA: COSTA ESMERALDA (La Costa, Pinamar)**
      * Barrios: "Deportiva", "Ecuestre", "Golf" (I y II), "Marítimo" (I, II, III, IV), "Residencial" (I y II), "Senderos" (I, II, III, IV), "Bosque".
      * *Tip:* Si dicen "Deportiva", es Costa Esmeralda.

      **ZONA: GBA SUR (Berazategui, Hudson)**
      * "El Carmen" -> Barrio: "Club El Carmen".
      * "Fincas", "Fincas de Iraola" -> Barrios: "Fincas de Iraola" Y "Fincas de Iraola II".
      * "Abril" -> Barrio: "Club de Campo Abril".
      * "Altos" -> Barrio: "Altos de Hudson".
      * "Greenville", "Maldonado", "San Eliseo".

      **ZONA: BARILOCHE**
      * "Arelauquen".

      --- 🧠 INTELIGENCIA DE VENTA ---
      
      1. **EL CLIENTE IMPACIENTE:**
         - Si el usuario dice "dame opciones", "lo que tengas", "mostrame": **OBEDECE**.
         - Busca con los datos que tengas. Si son pocos, muestra una selección variada y di: *"Aquí tengo algunas opciones destacadas para empezar. ¿Alguna se acerca a lo que buscas?"*.
      
      2. **MANEJO DE "NO HAY":**
         - JAMÁS digas "No hay opciones".
         - Si la búsqueda exacta da 0, **CAMBIA LA ESTRATEGIA** automáticamente:
           - Si buscó por precio, busca sin precio y di: *"Por 200k exactos no entró nada, pero mirá estas opciones desde 220k que valen la pena."*
           - Si buscó "Fincas 2", busca en "Fincas 1" también.
      
      3. **LÓGICA DE ALQUILER (COSTA):**
         - Fechas: Manejamos quincenas (Ene 1ra, Ene 2da, etc.). Si piden fechas raras, ofrece la quincena completa.
         - Mascotas: Si no lo sabes, asume que NO tienen para mostrar más opciones, pero avisa: *"Te muestro todo. Si traen mascota avísame para filtrar."*

      4. **PRECIOS (K = MIL):**
         - Si escriben "200k", entiende "200000".
         - Si escriben "3 mil", entiende "3000".

      --- CIERRE ---
      Siempre intenta llevar al usuario a ver la ficha o contactar.
      `,
      tools: {
        buscar_propiedades: tool({
          description: 'Motor de búsqueda.',
          parameters: z.object({
            operacion: z.enum(['venta', 'alquiler_temporal', 'alquiler_anual']).optional(),
            zona: z.enum(['GBA Sur', 'Costa Esmeralda', 'Arelauquen (BRC)']).optional(),
            // La IA debe identificar si el usuario dijo un barrio específico
            barrio_input: z.string().optional().describe('El nombre del barrio tal cual lo dijo el usuario (ej. "el carmen", "fincas").'),
            tipo: z.enum(['casa', 'departamento', 'lote']).optional(),
            pax: z.string().optional(),
            pets: z.boolean().optional(),
            pool: z.boolean().optional(),
            bedrooms: z.string().optional(),
            maxPrice: z.string().optional().describe('Presupuesto máximo (ej. "200000").'),
            selectedPeriod: z.enum([
              'Navidad', 'Año Nuevo', 'Año Nuevo con 1ra Enero',
              'Enero 1ra Quincena', 'Enero 2da Quincena', 
              'Febrero 1ra Quincena', 'Febrero 2da Quincena', 'Diciembre 2da Quincena'
            ]).optional(),
          }),
          execute: async (filtros) => {
            console.log("🤖 IA Raw Input:", filtros);
            
            // --- 1. TRADUCCIÓN DE BARRIOS (La IA nos pasa el string, nosotros lo convertimos al array oficial) ---
            // Esto soluciona el problema de "Fincas" vs "Fincas de Iraola"
            let barriosArray = [];
            if (filtros.barrio_input) {
                const b = filtros.barrio_input.toLowerCase();
                
                // GBA SUR
                if (b.includes('carmen')) barriosArray = ['Club El Carmen'];
                else if (b.includes('abril')) barriosArray = ['Club de Campo Abril'];
                else if (b.includes('fincas')) {
                    if (b.includes('2') || b.includes('dos')) barriosArray = ['Fincas de Iraola II'];
                    else if (b.includes('1') || b.includes('uno')) barriosArray = ['Fincas de Iraola'];
                    else barriosArray = ['Fincas de Iraola', 'Fincas de Iraola II']; // Si dice "Fincas" a secas, buscamos en los dos
                }
                else if (b.includes('altos')) barriosArray = ['Altos de Hudson', 'Altos de Hudson I', 'Altos de Hudson II'];
                
                // COSTA ESMERALDA
                else if (b.includes('deportiva')) barriosArray = ['Deportiva I', 'Deportiva II']; // Asumiendo nombres en DB
                else if (b.includes('ecuestre')) barriosArray = ['Ecuestre'];
                else if (b.includes('senderos')) barriosArray = ['Senderos I', 'Senderos II', 'Senderos III', 'Senderos IV'];
                else if (b.includes('maritimo')) barriosArray = ['Maritimo I', 'Maritimo II', 'Maritimo III', 'Maritimo IV'];
                else if (b.includes('golf')) barriosArray = ['Golf I', 'Golf II'];
                else if (b.includes('residencial')) barriosArray = ['Residencial I', 'Residencial II'];
                
                // Si detectamos barrio, forzamos la zona
                if (barriosArray.length > 0) {
                    filtros.barrios = barriosArray;
                    if (!filtros.zona) {
                        if (b.includes('deportiva') || b.includes('ecuestre') || b.includes('senderos')) filtros.zona = 'Costa Esmeralda';
                        else filtros.zona = 'GBA Sur';
                    }
                }
            }

            // --- 2. LÓGICA DE PRECIO (Anti-Frustración) ---
            let searchFilters = { ...filtros };
            
            // Limpieza de números (k, millones, puntos)
            if (searchFilters.maxPrice) {
                let cleanPrice = searchFilters.maxPrice.toLowerCase().replace(/k/g, '000').replace(/\D/g, '');
                searchFilters.maxPrice = (parseInt(cleanPrice) * 1.25).toString(); // +25% de tolerancia oculta
            }

            // --- 3. EJECUCIÓN ---
            searchFilters.sortBy = 'price_asc';
            // Upselling automático
            if (searchFilters.pax) searchFilters.pax_or_more = true;

            let resultados = await searchProperties(searchFilters);

            // --- 4. ESTRATEGIA DE RECUPERACIÓN (Si da 0) ---
            if (resultados.count === 0) {
                console.log("⚠️ 0 Resultados. Intentando recuperación...");
                
                // Intento 1: Quitar filtro de precio (mostrar lo que hay, aunque sea caro)
                if (searchFilters.maxPrice) {
                    delete searchFilters.maxPrice;
                    const resRescue = await searchProperties(searchFilters);
                    if (resRescue.count > 0) {
                        resultados = resRescue;
                        // Marcamos para que la IA sepa que ignoramos el precio
                        resultados.warning = "ignore_price"; 
                    }
                }
            }

            return {
              count: resultados.count,
              warning: resultados.warning, // La IA leerá esto y dirá "No hay por 200k, pero mira..."
              properties: resultados.results.slice(0, 6).map(p => ({
                ...p,
                summary: `${p.title} (${p.barrio || p.zona}). ${p.min_rental_price ? 'USD '+p.min_rental_price : (p.price ? 'USD '+p.price : 'Consultar')}.`
              }))
            };
          },
        }),
        mostrar_contacto: tool({
          description: 'Muestra el botón para contactar.',
          parameters: z.object({ motivo: z.string().optional() }),
          execute: async ({ motivo }) => ({ showButton: true, motivo }),
        }),
      },
    });

    result.pipeDataStreamToResponse(res);

  } catch (error) {
    console.error('Error en Chat API:', error);
    res.status(500).json({ error: error.message });
  }
}