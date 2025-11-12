import { supabase } from '@/lib/supabaseClient';
import { processFullSyncData } from '@/lib/availabilityParser'; // Importa la NUEVA lógica

// --- CONFIGURACIÓN DEL PUENTE PHP ---
const SYNC_BRIDGE_URL = `https://mcvpropiedades.com.ar/vidal/sync-bridge.php?secret=${process.env.SYNC_SECRET}`;

// --- EL HANDLER PRINCIPAL DE LA API (Plan D v3 - COMPLETO) ---

export default async function handler(req, res) {
  // 1. Proteger el Endpoint
  if (req.query.secret !== process.env.SYNC_SECRET) {
    return res.status(401).json({ error: 'Acceso no autorizado.' });
  }

  try {
    console.log('Iniciando Sincronización (v3 - Completa)...');

    // 2. Llamar al Puente PHP en su servidor
    console.log(`Paso 1: Llamando al puente PHP...`);
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
    console.log(`Paso 1: Exitoso. ${propertiesFromWP.length} propiedades encontradas por el puente.`);

    // 3. Procesar y Transformar Datos (Usando el nuevo Parser)
    console.log('Paso 2: Procesando y transformando datos...');
    const { propertiesToInsert, periodsToInsert } = processFullSyncData(propertiesFromWP);
    console.log(`Paso 2: Exitoso. ${propertiesToInsert.length} propiedades y ${periodsToInsert.length} períodos generados.`);

    // 4. Limpiar Tablas Viejas en Supabase
    // ¡IMPORTANTE! Borramos 'periods' primero, porque depende de 'properties'.
    console.log('Paso 3: Limpiando datos antiguos en Supabase...');
    
    // Borrar todos los períodos viejos
    const { error: deletePeriodsError } = await supabase.from('periods').delete().neq('id', 0);
    if (deletePeriodsError) throw new Error(`Error Supabase (borrando periods): ${deletePeriodsError.message}`);
    
    // Borrar todas las propiedades viejas
    const { error: deletePropsError } = await supabase.from('properties').delete().neq('id', 0);
    if (deletePropsError) throw new Error(`Error Supabase (borrando properties): ${deletePropsError.message}`);
    
    console.log('Paso 3: Exitoso. Tablas limpiadas.');

    // 5. Insertar Datos Nuevos en Supabase
    // ¡IMPORTANTE! Insertamos 'properties' primero.
    console.log('Paso 4: Insertando nuevas propiedades...');
    const { data: propertiesData, error: insertPropsError } = await supabase
      .from('properties')
      .insert(propertiesToInsert)
      .select('property_id'); // Solo devolvemos el ID para ahorrar ancho de banda
      
    if (insertPropsError) {
      throw new Error(`Error Supabase (insertando properties): ${insertPropsError.message}`);
    }
    console.log(`Paso 4: Exitoso. ${propertiesData.length} propiedades insertadas.`);

    // ¡IMPORTANTE! Insertamos 'periods' después.
    console.log('Paso 5: Insertando nuevos períodos...');
    const { data: periodsData, error: insertPeriodsError } = await supabase
      .from('periods')
      .insert(periodsToInsert)
      .select('id'); // Solo devolvemos el ID

    if (insertPeriodsError) {
      throw new Error(`Error Supabase (insertando periods): ${insertPeriodsError.message}`);
    }
    console.log(`Paso 5: Exitoso. ${periodsData.length} períodos insertados.`);

    // 6. Éxito
    console.log('Sincronización Completa (v3).');
    res.status(200).json({ 
      status: 'OK', 
      properties_found: propertiesFromWP.length,
      properties_inserted: propertiesData.length,
      periods_inserted: periodsData.length
    });

  } catch (error) {
    console.error('Error fatal durante la sincronización:', error);
    res.status(500).json({ status: 'Error', error: error.message });
  }
}