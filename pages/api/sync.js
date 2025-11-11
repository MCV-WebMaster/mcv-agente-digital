import { processPropertyAvailability } from '@/lib/availabilityParser';
import { supabase } from '@/lib/supabaseClient';

// Esta es la consulta GraphQL que trae todas las propiedades
// y los campos de disponibilidad que definimos en el parser.
const GET_ALL_PROPERTIES_QUERY = `
  query GetAllPropertiesForSync {
    es_properties(first: 1000) {
      nodes {
        databaseId
        slug
        title
        uri
        es_property_type {
          name
        }
        es_property_pax
        es_property_acepta_mascota
        es_property_pool
        es_property_barrios_costa_esmeralda {
          name
        }
        
        # --- CAMPOS DE DISPONIBILIDAD (Añadir más si es necesario) ---
        es_property_navidad
        es_property_ano_nuevo
        es_property_ano_nuevo_c1er_q_de_enero
        es_property_enero_1ra_quincena
        es_property_enero_2da_quincena
        es_property_febrero_1ra_quincena
        es_property_febrero_1ra_quincena_ccarnaval
        es_property_febrero_2da_quincena
      }
    }
  }
`;


export default async function handler(req, res) {
  // 1. Proteger el Endpoint
  // Solo permitimos que se ejecute si se provee el secreto correcto.
  // Esto evita que cualquiera pueda ejecutar esta API costosa.
  const { secret } = req.query;
  if (secret !== process.env.SYNC_SECRET) {
    return res.status(401).json({ error: 'Acceso no autorizado.' });
  }

  try {
    console.log('Iniciando Sincronización...');

    // 2. Obtener datos de WordPress (WPGraphQL)
    console.log('Paso 1: Obteniendo datos de WordPress...');
    const wpResponse = await fetch(process.env.WORDPRESS_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: GET_ALL_PROPERTIES_QUERY }),
      cache: 'no-store',
    });

    if (!wpResponse.ok) {
      throw new Error(`Error de red con WordPress: ${wpResponse.statusText}`);
    }

    const wpData = await wpResponse.json();
    const properties = wpData.data?.es_properties?.nodes;

    if (!properties || properties.length === 0) {
      throw new Error('No se encontraron propiedades en WordPress.');
    }
    
    console.log(`Paso 1: Exitoso. ${properties.length} propiedades encontradas.`);

    // 3. Procesar y Transformar Datos
    console.log('Paso 2: Procesando y transformando datos...');
    let allAvailabilityRecords = [];
    for (const prop of properties) {
      const records = processPropertyAvailability(prop);
      allAvailabilityRecords = allAvailabilityRecords.concat(records);
    }
    console.log(`Paso 2: Exitoso. ${allAvailabilityRecords.length} registros de disponibilidad generados.`);

    // 4. Limpiar la tabla de Supabase (Borrado completo)
    // Borramos todos los datos viejos para reemplazarlos con los nuevos.
    console.log('Paso 3: Limpiando datos antiguos en Supabase...');
    const { error: deleteError } = await supabase
      .from('property_availability')
      .delete()
      .neq('property_id', 0); // Borra todo (es un truco para no poner 'true')

    if (deleteError) {
      console.error('Error limpiando Supabase:', deleteError.message);
      throw new Error(`Error en Supabase (delete): ${deleteError.message}`);
    }
    console.log('Paso 3: Exitoso. Tabla limpiada.');


    // 5. Insertar Datos Nuevos en Supabase
    console.log('Paso 4: Insertando nuevos datos en Supabase...');
    const { data, error: insertError } = await supabase
      .from('property_availability')
      .insert(allAvailabilityRecords)
      .select();

    if (insertError) {
      console.error('Error insertando en Supabase:', insertError.message);
      throw new Error(`Error en Supabase (insert): ${insertError.message}`);
    }

    console.log(`Paso 4: Exitoso. ${data.length} registros insertados.`);

    // 6. Éxito
    console.log('Sincronización Completada.');
    res.status(200).json({ 
      status: 'OK', 
      properties_found: properties.length,
      records_generated: allAvailabilityRecords.length,
      records_inserted: data.length 
    });

  } catch (error) {
    console.error('Error fatal durante la sincronización:', error.message);
    res.status(500).json({ status: 'Error', error: error.message });
  }
}