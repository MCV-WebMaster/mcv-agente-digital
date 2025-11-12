import { supabase } from '@/lib/supabaseClient';

export default async function handler(req, res) {
  try {
    // 1. Pedir a Supabase la columna 'barrio_costa'
    const { data, error } = await supabase
      .from('property_availability')
      .select('barrio_costa');

    if (error) throw error;

    // 2. Filtrar los duplicados y los nulos
    const barriosUnicos = [
      ...new Set(data.map(item => item.barrio_costa).filter(Boolean))
    ].sort(); // .filter(Boolean) quita los null/undefined. .sort() los ordena.

    // 3. Devolver la lista
    res.status(200).json({ status: 'OK', barrios: barriosUnicos });

  } catch (error) {
    console.error('Error en API get-barrios:', error.message);
    res.status(500).json({ status: 'Error', error: error.message });
  }
}