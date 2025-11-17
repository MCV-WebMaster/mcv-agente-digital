/**
 * Lógica de negocio v10 (Parser Inteligente)
 * Parsea el JSON del "Puente PHP"
 * CORRIGE el bug de "Precios Gigantes" (ignora fechas como 30/1/26)
 * Usa Regex para encontrar precios reales ($ 3.500)
 */

// --- MAPEO DE DISPONIBILIDAD ---
const PERIOD_MAP = [
  { key: 'periodo_navidad', name: 'Navidad', start: '2025-12-19', end: '2025-12-26' },
  { key: 'periodo_ano_nuevo', name: 'Año Nuevo', start: '2025-12-26', end: '2026-01-02' },
  { key: 'periodo_ano_nuevo_ene1', name: 'Año Nuevo con 1ra Enero', start: '2025-12-30', end: '2026-01-15' },
  { key: 'periodo_ene_1ra', name: 'Enero 1ra Quincena', start: '2026-01-02', end: '2026-01-15' },
  { key: 'periodo_ene_2da', name: 'Enero 2da Quincena', start: '2026-01-16', end: '2026-01-31' },
  { key: 'periodo_feb_1ra', name: 'Febrero 1ra Quincena', start: '2026-02-01', end: '2026-02-17' },
  { key: 'periodo_feb_2da', name: 'Febrero 2da Quincena', start: '2026-02-18', end: '2026-03-01' },
  { key: 'periodo_dic_2da', name: 'Diciembre 2da Quincena', start: '2025-12-15', end: '2025-12-31' },
];

function getDurationInDays(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
  return diffDays + 1;
}

/**
 * Parser Inteligente de Precios
 * Evita mezclar fechas (30/1/26) con precios.
 */
function parseStatusAndPrice(value) {
  if (!value || value.trim() === '') {
    return { status: 'Ocupado', price: null };
  }
  const lowerValue = value.toLowerCase();

  // 1. Primero chequeamos si está explícitamente Ocupado
  if (
    lowerValue.includes('alquilada') || 
    lowerValue.includes('alquilado') ||
    lowerValue.includes('reservada') || 
    lowerValue.includes('reservado') ||
    lowerValue.includes('no disponible') || 
    lowerValue.includes('no dispo')
  ) {
    // Excepción: "Alquilada X pero disponible Y"
    if (!lowerValue.includes('disponible')) {
        return { status: 'Ocupado', price: null };
    }
  }

  // 2. BÚSQUEDA DE PRECIO POR REGEX (La Solución al Bug)
  // Busca: (u$s O usd O $) + espacios opcionales + numeros con puntos/comas
  // Ej: "U$S 3.500" -> Captura "3.500"
  // Ej: "$ 1.700" -> Captura "1.700"
  const priceRegex = /(?:u\$s|usd|\$)\s*([\d\.,]+)/i;
  const priceMatch = value.match(priceRegex);

  if (priceMatch) {
    // Limpiamos el número encontrado (quitamos puntos y comas para tener un entero)
    // Ojo: asumiendo que el punto es separador de miles.
    const cleanNumberStr = priceMatch[1].replace(/[\.,]/g, ''); 
    const priceInt = parseInt(cleanNumberStr, 10);

    if (!isNaN(priceInt) && priceInt > 0) {
        return { status: 'Disponible', price: priceInt.toString() };
    }
  }

  // 3. Chequeo de "Disponible" sin precio (ej. "disponible carnaval")
  if (lowerValue.includes('disponible') || lowerValue.includes('libre')) {
     return { status: 'Disponible', price: null }; 
  }

  // 4. Fallback: Si solo hay números y nada de texto (ej. "1500")
  // Esto evita que "30/1/26" pase, porque tiene "/"
  if (lowerValue.match(/^[\d\.,\s]+$/)) {
      const cleanVal = lowerValue.replace(/[\.,]/g, '');
      return { status: 'Disponible', price: cleanVal.trim() };
  }

  // Si tiene texto y números mezclados pero sin signo $, asumimos que es fecha o texto informativo
  // y NO un precio seguro. Lo marcamos como Ocupado o Consultar (Disponible sin precio).
  // Ante la duda de texto mezclado ("del 10 al 20"), mejor no inventar precio.
  return { status: 'Ocupado', price: null };
}

export function processFullSyncData(allProperties) {
  const propertiesToInsert = [];
  const periodsToInsert = [];
  const ACTIVE_STATUS_ID = 158;

  for (const prop of allProperties) {
    
    const isActive = prop.status_ids.length === 0 || prop.status_ids.includes(ACTIVE_STATUS_ID);
    if (!isActive) {
      continue; 
    }

    const aceptaMascotaBool = (prop.acepta_mascota || '').trim().toUpperCase() === 'SI';
    const piscinaDetalle = prop.piscina ? prop.piscina.trim() : null;
    const tienePiscinaBool = !!piscinaDetalle;
    
    let ventaPrice = null;
    let alquilerAnualPrice = parseInt(prop.price_ars, 10) || null;
    const rawPrice = parseInt(prop.price, 10) || null;
    if (rawPrice) {
      if (rawPrice < 10000) {
        if (!alquilerAnualPrice) {
          alquilerAnualPrice = rawPrice;
        }
      } else {
        ventaPrice = rawPrice;
      }
    }

    const propertyRecord = {
      property_id: parseInt(prop.property_id, 10),
      slug: prop.property_slug,
      title: prop.property_title,
      url: prop.property_url,
      description: prop.description,
      thumbnail_url: prop.thumbnail_url,
      category_ids: prop.category_ids || [],
      type_ids: prop.type_ids || [],
      status_ids: prop.status_ids || [],
      zona: prop.zona || null,
      barrio: prop.barrio || null,
      pax: parseInt(prop.pax, 10) || null,
      acepta_mascota: aceptaMascotaBool,
      tiene_piscina: tienePiscinaBool,
      piscina_detalle: piscinaDetalle,
      price: ventaPrice,
      es_property_price_ars: alquilerAnualPrice,
      bedrooms: parseInt(prop.bedrooms, 10) || null,
      bathrooms: parseInt(prop.bathrooms, 10) || null,
      mts_cubiertos: parseInt(prop.construido, 10) || null,
      mts_terreno: parseInt(prop.area, 10) || null,
    };

    propertiesToInsert.push(propertyRecord);

    const isTemporal = prop.category_ids.includes(196) || prop.category_ids.includes(197);
    
    if (isTemporal) {
      for (const period of PERIOD_MAP) {
        const rawValue = prop[period.key]; 
        const { status, price } = parseStatusAndPrice(rawValue); // ¡Lógica Regex!

        if (status === 'Disponible') {
          const duration = getDurationInDays(period.start, period.end);
          periodsToInsert.push({
            property_id: propertyRecord.property_id,
            period_name: period.name,
            start_date: period.start,
            end_date: period.end,
            status: status,
            price: price,
            duration_days: duration,
          });
        }
      }
    }
  }

  return { propertiesToInsert, periodsToInsert };
}