import { supabase } from '@/lib/supabaseClient';

export default async function handler(req, res) {
  try {
    const { data, error } = await supabase
      .from('properties')
      .select('zona, barrio'); 

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