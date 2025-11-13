import { supabase } from '@/lib/supabaseClient';

// --- IDs de Taxonomía ---
const CATEGORY_IDS = {
  VENTA: 198,
  ALQUILER_TEMPORAL: 197,
  ALQUILER_ANUAL: 194,
  ALQUILER_ANUAL_AMUEBLADO: 193,
};
const STATUS_ID_ACTIVA = 158;
// --- Fin del Mapeo ---


export default async function handler(req, res) {
  try {
    const { operacion } = req.query;

    if (!operacion) {
      return res.status(400).json({ status: 'Error', error: 'Operación no especificada' });
    }

    let query = supabase
      .from('properties')
      .select('zona, barrio')
      .or(`status_ids.cs.{${STATUS_ID_ACTIVA}},status_ids.eq.{}`); 

    if (operacion === 'venta') {
      query = query.contains('category_ids', [CATEGORY_IDS.VENTA]);
    } else if (operacion === 'alquiler_anual') {
      query = query.or(`category_ids.cs.{${CATEGORY_IDS.ALQUILER_ANUAL}}, category_ids.cs.{${CATEGORY_IDS.ALQUILER_ANUAL_AMUEBLADO}}`);
    } else if (operacion === 'alquiler_temporal') {
      query = query.contains('category_ids', [CATEGORY_IDS.ALQUILER_TEMPORAL]);
    }

    const { data, error } = await query;
    if (error) throw error;

    const zonasMap = new Map();
    data.forEach(item => {
      if (item.zona) {
        if (!zonasMap.has(item.zona)) {
          zonasMap.set(item.zona, new Set()); 
        }
        if (item.barrio) {
          zonasMap.get(item.zona).add(item.barrio);
        }
      }
    });

    const filtros = {};
    zonasMap.forEach((barriosSet, zona) => {
      filtros[zona] = [...barriosSet].sort();
    });

    res.status(200).json({ 
      status: 'OK', 
      filtros
    });

  } catch (error) {
    console.error('Error en API get-filters:', error.message);
    res.status(500).json({ status: 'Error', error: error.message });
  }
}