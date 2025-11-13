import { supabase } from '@/lib/supabaseClient';

export default async function handler(req, res) {
  try {
    const { data, error } = await supabase
      .from('properties')
      .select('zona, barrio'); // Traemos solo zona y barrio

    if (error) throw error;

    const zonasMap = new Map();
    data.forEach(item => {
      // 1. Si la zona existe (y no es nula), la agregamos al mapa
      if (item.zona) {
        if (!zonasMap.has(item.zona)) {
          zonasMap.set(item.zona, new Set()); // Crear un Set para barrios
        }
        
        // 2. Si ADEMÁS tiene un barrio (y no es nulo), lo agregamos al Set de esa zona
        if (item.barrio) {
          zonasMap.get(item.zona).add(item.barrio);
        }
      }
    });

    // 3. Convertir el Mapa a un objeto y los Sets a Arrays ordenados
    const filtros = {};
    zonasMap.forEach((barriosSet, zona) => {
      filtros[zona] = [...barriosSet].sort();
    });

    res.status(200).json({ 
      status: 'OK', 
      filtros // ej: { "GBA Sur": ["Club El Carmen", "Quilmes"], "Costa Esmeralda": ["Maritimo", "Senderos"] }
    });

  } catch (error) {
    console.error('Error en API get-filters:', error.message);
    res.status(500).json({ status: 'Error', error: error.message });
  }
}