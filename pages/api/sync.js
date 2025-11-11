import { supabase } from '@/lib/supabaseClient';
import { processPropertyAvailability } from '@/lib/availabilityParser'; // Importa la lógica (sin cambios)

// --- CONFIGURACIÓN DEL PUENTE PHP ---
const SYNC_BRIDGE_URL = `https://mcvpropiedades.com.ar/vidal/sync-bridge.php?secret=${process.env.SYNC_SECRET}`;

// --- EL HANDLER PRINCIPAL DE LA API (Plan D) ---

export default async function handler(req, res) {
  // 1. Proteger el Endpoint (Doble chequeo, aunque el puente ya lo hace)
  if (req.query.secret !== process.env.SYNC_SECRET) {
    return res.status(401).json({ error: 'Acceso no autorizado.' });
  }

  try {
    console.log('Iniciando Sincronización (Plan D - Puente PHP)...');

    // 2. Llamar al Puente PHP en su servidor
    console.log(`Paso 1: Llamando al puente PHP en ${SYNC_BRIDGE_URL.split('?')[0]}...`);
    const bridgeResponse = await fetch(SYNC_BRIDGE_URL, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      cache: 'no-store', // No usar cache
    });

    if (!bridgeResponse.ok) {
      // Si el puente PHP da un 401 (secreto malo) o 500 (error de PHP)
      throw new Error(`Error del Puente PHP: ${bridgeResponse.status} ${bridgeResponse.statusText}`);
    }

    const bridgeData = await bridgeResponse.json();

    if (bridgeData.status !== 'OK') {
      throw new Error(`Error devuelto por el Puente PHP: ${bridgeData.error || 'Error desconocido'}`);
    }

    const rows = bridgeData.data;
    console.log(`Paso 2: Exitoso. ${rows.length} propiedades encontradas por el puente.`);

    if (rows.length === 0) {
      throw new Error('El Puente PHP devolvió 0 propiedades.');
    }

    // 3. Procesar y Transformar Datos (Esta lógica no cambia)
    console.log('Paso 3: Procesando y transformando datos...');
    let allAvailabilityRecords = [];
    for (const prop of rows) {
      // Usamos el mismo parser, ya que el formato JSON es el mismo
      const records = processPropertyAvailability(prop);
      allAvailabilityRecords = allAvailabilityRecords.concat(records);
    }
    console.log(`Paso 3: Exitoso. ${allAvailabilityRecords.length} registros de disponibilidad generados.`);

    // 4. Limpiar y Cargar Supabase (Esta lógica no cambia)
    console.log('Paso 4: Limpiando datos antiguos en Supabase...');
    const { error: deleteError } = await supabase.from('property_availability').delete().neq('property_id', 0);
    if (deleteError) throw deleteError;
    console.log('Paso 4: Exitoso. Tabla limpiada.');

    console.log('Paso 5: Insertando nuevos datos en Supabase...');
    const { data, error: insertError } = await supabase
      .from('property_availability')
      .upsert(allAvailabilityRecords, { onConflict: 'sync_hash', ignoreDuplicates: true });
      
    if (insertError) throw insertError;
    console.log(`Paso 5: Exitoso. ${data ? data.length : 0} registros procesados por Supabase.`);

    // 6. Éxito
    console.log('Sincronización Completada.');
    res.status(200).json({ 
      status: 'OK', 
      properties_found: rows.length,
      records_generated: allAvailabilityRecords.length,
      records_processed: data ? data.length : 0
    });

  } catch (error) {
    console.error('Error fatal durante la sincronización:', error);
    res.status(500).json({ status: 'Error', error: error.message });
  }
}