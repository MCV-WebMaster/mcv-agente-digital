import { supabase } from '@/lib/supabaseClient';

export default async function handler(req, res) {
  try {
    const { data, error } = await supabase
      .from('properties')
      .select('zona, barrio'); // Traemos solo zona y barrio

    if (error) throw error;

    // Crear un mapa de Zonas -> [Barrios]
    const zonasMap = new Map();
    data.forEach(item => {
      if (item.zona && item.barrio) {
        if (!zonasMap.has(item.zona)) {
          zonasMap.set(item.zona, new Set()); // Usar un Set para evitar duplicados
        }
        zonasMap.get(item.zona).add(item.barrio);
      }
    });

    // Convertir el Mapa a un objeto y los Sets a Arrays ordenados
    const filtros = {};
    zonasMap.forEach((barriosSet, zona) => {
      filtros[zona] = [...barriosSet].sort();
    });

    res.status(200).json({ 
      status: 'OK', 
      filtros // ej: { "GBA Sur": ["Quilmes", "Hudson"], "Costa Esmeralda": ["Maritimo", "Senderos"] }
    });

  } catch (error) {
    console.error('Error en API get-filters:', error.message);
    res.status(500).json({ status: 'Error', error: error.message });
  }
}