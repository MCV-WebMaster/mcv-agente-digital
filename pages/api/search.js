import { supabase } from '@/lib/supabaseClient';

// Esta función ahora calcula el precio mínimo
function getMinPrice(propertyPeriods) {
  let minPrice = Infinity;
  let hasPrice = false;

  propertyPeriods.forEach(period => {
    if (period.price) {
      // Extraer el número del precio (ej. "$5.700" -> 5700)
      const priceNum = parseInt(period.price.replace(/[^0-9]/g, ''), 10);
      if (!isNaN(priceNum) && priceNum < minPrice) {
        minPrice = priceNum;
        hasPrice = true;
      }
    }
  });

  return hasPrice ? minPrice : null;
}


export default async function handler(req, res) {
  try {
    const { startDate, endDate, pax, pets, pool, barrio } = req.query;

    let query = supabase
      .from('property_availability')
      .select(`
        property_id, 
        property_slug, 
        property_title, 
        property_url, 
        pax, 
        accepts_pets, 
        has_pool, 
        barrio_costa,
        price 
      `) // ¡AÑADIMOS 'price'!
      .eq('status', 'Disponible');

    // Aplicar filtros
    if (startDate) query = query.lte('start_date', startDate); 
    if (endDate) query = query.gte('end_date', endDate);
    if (pax) query = query.gte('pax', parseInt(pax, 10)); 
    if (pets === 'true') query = query.eq('accepts_pets', true);
    if (pool === 'true') query = query.eq('has_pool', true);
    if (barrio) query = query.eq('barrio_costa', barrio);

    const { data, error } = await query;
    if (error) throw error;

    // --- CORRECCIÓN LÓGICA DE PRECIOS ---
    // Agrupamos todos los períodos por propiedad
    const propertiesMap = new Map();
    data.forEach(period => {
      if (!propertiesMap.has(period.property_id)) {
        // Si es la primera vez que vemos esta propiedad, la guardamos
        propertiesMap.set(period.property_id, {
          ...period, // Guardamos todos los datos (slug, título, etc.)
          periods: [] // Creamos un array para sus períodos
        });
      }
      // Añadimos el período (con su precio) al array
      propertiesMap.get(period.property_id).periods.push(period);
    });

    // Ahora, calculamos el precio mínimo para cada propiedad
    const resultsWithMinPrice = [];
    propertiesMap.forEach(prop => {
      const minPrice = getMinPrice(prop.periods);
      resultsWithMinPrice.push({
        ...prop, // Todos los datos (slug, título, etc.)
        min_price: minPrice, // Añadimos el nuevo campo 'min_price'
        periods: undefined // Ya no necesitamos enviar los períodos
      });
    });
    // --- FIN DE LA CORRECCIÓN ---

    res.status(200).json({ 
      status: 'OK',
      filters: req.query,
      count: resultsWithMinPrice.length,
      results: resultsWithMinPrice 
    });

  } catch (error) {
    console.error('Error en API Search:', error.message);
    res.status(500).json({ status: 'Error', error: error.message });
  }
}