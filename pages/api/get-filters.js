import { supabase } from '@/lib/supabaseClient';

export default async function handler(req, res) {
  try {
    // 1. Pedimos a Supabase *todas* las Zonas y Barrios
    const { data, error } = await supabase
      .from('properties')
      .select('zona, barrio');

    if (error) throw error;

    // 2. Filtramos duplicados y nulos
    const zonasUnicas = [
      ...new Set(data.map(item => item.zona).filter(Boolean))
    ].sort();
    
    const barriosUnicos = [
      ...new Set(data.map(item => item.barrio).filter(Boolean))
    ].sort();

    // 3. Devolvemos las listas
    res.status(200).json({ 
      status: 'OK', 
      zonas: zonasUnicas,
      barrios: barriosUnicos
    });

  } catch (error) {
    console.error('Error en API get-filters:', error.message);
    res.status(500).json({ status: 'Error', error: error.message });
  }
}