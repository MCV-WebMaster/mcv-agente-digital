import { supabase } from '@/lib/supabaseClient';
import { processFullSyncData } from '@/lib/availabilityParser'; // Importa la NUEVA lógica

// --- CONFIGURACIÓN DEL PUENTE PHP ---
const SYNC_BRIDGE_URL = `https://mcvpropiedades.com.ar/vidal/sync-bridge.php?secret=${process.env.SYNC_SECRET}`;

export default async function handler(req, res) {
  // 1. Proteger el Endpoint
  if (req.query.secret !== process.env.SYNC_SECRET) {
    return res.status(401).json({ error: 'Acceso no autorizado.' });
  }

  try {
    console.log('Iniciando Sincronización (v7 - Definitiva)...');

    // 2. Llamar al Puente PHP
    console.log(`Paso 1: Llamando al puente PHP v7...`);
    const bridgeResponse = await fetch(SYNC_BRIDGE_URL, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      cache: 'no-store',
    });

    if (!bridgeResponse.ok) {
      throw new Error(`Error del Puente PHP: ${bridgeResponse.status} ${bridgeResponse.statusText}`);
    }
    const bridgeData = await bridgeResponse.json();
    if (bridgeData.status !== 'OK') {
      throw new Error(`Error devuelto por el Puente PHP: ${bridgeData.error || 'Error desconocido'}`);
    }

    const propertiesFromWP = bridgeData.data;
    console.log(`Paso 1: Exitoso. ${propertiesFromWP.length} propiedades encontradas.`);

    // 3. Procesar y Transformar Datos
    console.log('Paso 2: Procesando y transformando datos (filtrando por Activas)...');
    const { propertiesToInsert, periodsToInsert } = processFullSyncData(propertiesFromWP);
    console.log(`Paso 2: Exitoso. ${propertiesToInsert.length} propiedades ACTIVAS y ${periodsToInsert.length} períodos generados.`);

    // 4. Limpiar Tablas Viejas en Supabase
    console.log('Paso 3: Limpiando datos antiguos en Supabase...');
    const { error: deletePeriodsError } = await supabase.from('periods').delete().neq('id', 0);
    if (deletePeriodsError) throw new Error(`Error Supabase (borrando periods): ${deletePeriodsError.message}`);

    const { error: deletePropsError } = await supabase.from('properties').delete().neq('id', 0);
    if (deletePropsError) throw new Error(`Error Supabase (borrando properties): ${deletePropsError.message}`);

    console.log('Paso 3: Exitoso. Tablas limpiadas.');

    // 5. Insertar Datos Nuevos en Supabase
    console.log('Paso 4: Insertando nuevas propiedades...');
    const { data: propertiesData, error: insertPropsError } = await supabase
      .from('properties')
      .insert(propertiesToInsert)
      .select('property_id');

    if (insertPropsError) {
      throw new Error(`Error Supabase (insertando properties): ${insertPropsError.message}`);
    }
    console.log(`Paso 4: Exitoso. ${propertiesData.length} propiedades insertadas.`);

    console.log('Paso 5: Insertando nuevos períodos...');
    const { data: periodsData, error: insertPeriodsError } = await supabase
      .from('periods')
      .insert(periodsToInsert)
      .select('id'); 

    if (insertPeriodsError) {
      throw new Error(`Error Supabase (insertando periods): ${insertPeriodsError.message}`);
    }
    console.log(`Paso 5: Exitoso. ${periodsData.length} períodos insertados.`);

    // 6. Éxito
    console.log('Sincronización Completa (v7).');
    res.status(200).json({ 
      status: 'OK', 
      properties_found_total: propertiesFromWP.length,
      properties_inserted_active: propertiesData.length,
      periods_inserted: periodsData.length
    });

  } catch (error) {
    console.error('Error fatal durante la sincronización:', error);
    res.status(500).json({ status: 'Error', error: error.message });
  }
}