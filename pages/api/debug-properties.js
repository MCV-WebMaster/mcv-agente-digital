import { supabase } from '@/lib/supabaseClient';

export default async function handler(req, res) {
  try {
    // 1. Buscamos las 3 propiedades por su título (o parte de él)
    const { data: properties, error: propError } = await supabase
      .from('properties')
      .select('property_id, title, category_ids')
      .or('title.ilike.%SENDEROS II 140%,title.ilike.%ECUESTRE 310%,title.ilike.%LOS ALAMOS%');

    if (propError) throw propError;

    if (!properties || properties.length === 0) {
      return res.status(200).json({ error: "No encontré las propiedades en la DB" });
    }

    const propIds = properties.map(p => p.property_id);

    // 2. Traemos TODOS los periodos asociados a estas propiedades
    // Sin filtros de estado ni precio, queremos ver TODO lo que hay.
    const { data: periods, error: periodError } = await supabase
      .from('periods')
      .select('*')
      .in('property_id', propIds);

    if (periodError) throw periodError;

    // 3. Análisis de coincidencias
    // Probamos contra la cadena que estamos buscando
    const BUSQUEDA_OBJETIVO = "Año Nuevo c/1er q de enero del 30/12/25 al 15/1/26";
    const BUSQUEDA_DNA = "30/12";

    const analisis = periods.map(p => {
        const nombreDB = p.period_name || "(VACÍO)";
        return {
            propiedad_id: p.property_id,
            nombre_en_db: nombreDB,
            precio: p.price,
            status: p.status,
            // Pruebas de coincidencia
            coincide_exacto: nombreDB === BUSQUEDA_OBJETIVO,
            coincide_dna: nombreDB.includes(BUSQUEDA_DNA),
            longitud_texto: nombreDB.length
        };
    });

    res.status(200).json({
        propiedades_encontradas: properties,
        total_periodos: periods.length,
        detalle_periodos: analisis
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}