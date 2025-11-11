import Link from 'next/link';

// Esta función se ejecuta en el servidor Vercel antes de mostrar la página.
// Aquí es donde probamos nuestras claves secretas.
export async function getServerSideProps(context) {
  let wordpressStatus = false;
  let supabaseStatus = false;
  let resendStatus = false;

  // 1. Probar WordPress (WPGraphQL)
  try {
    // Hacemos la consulta más simple posible a GraphQL
    const response = await fetch(process.env.WORDPRESS_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ __typename }' }),
      cache: 'no-store', // Asegura que no usemos cache
    });
    if (response.ok && response.status === 200) {
      wordpressStatus = true;
    }
  } catch (error) {
    console.error('Error conectando a WordPress:', error.message);
    wordpressStatus = false;
  }

  // 2. Probar Supabase (Solo si las variables existen)
  // La prueba real será en el Día 2 al crear la tabla.
  // Por ahora, solo confirmamos que las variables públicas se cargaron.
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    supabaseStatus = true;
  } else {
    supabaseStatus = false;
  }
  
  // 3. Probar Resend (Solo si la variable existe)
  if (process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.startsWith('re_')) {
    resendStatus = true;
  } else {
    resendStatus = false;
  }

  // Devolvemos los resultados a la página
  return {
    props: {
      wordpressStatus,
      supabaseStatus,
      resendStatus,
    },
  };
}


// --- Componente de la Página ---
// Esto es lo que el usuario ve en el navegador.

const StatusIcon = ({ status }) => {
  return (
    <span className={`font-bold ${status ? 'text-green-500' : 'text-red-500'}`}>
      {status ? 'CONECTADO' : 'ERROR'}
    </span>
  );
};

export default function TestConexionPage({ wordpressStatus, supabaseStatus, resendStatus }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
      <div className="w-full max-w-2xl p-8 border border-mcv-gris rounded-lg">
        
        <h1 className="text-3xl font-bold mb-8 text-center">
          Pruebas de Conexión del Entorno
        </h1>

        <div className="space-y-4">
          
          {/* Prueba de WordPress */}
          <div className="p-4 border border-gray-700 rounded-lg">
            <h2 className="text-xl font-semibold text-mcv-azul">WordPress (WPGraphQL)</h2>
            <p className="text-sm text-gray-400 mb-2">
              Prueba una conexión real con su endpoint de GraphQL.
            </p>
            <p>Estado: <StatusIcon status={wordpressStatus} /></p>
          </div>

          {/* Prueba de Supabase */}
          <div className="p-4 border border-gray-700 rounded-lg">
            <h2 className="text-xl font-semibold text-mcv-azul">Supabase</h2>
            <p className="text-sm text-gray-400 mb-2">
              Prueba si las claves públicas (URL y Anon Key) están cargadas en Vercel.
            </p>
            <p>Estado: <StatusIcon status={supabaseStatus} /></p>
          </div>

          {/* Prueba de Resend */}
          <div className="p-4 border border-gray-700 rounded-lg">
            <h2 className="text-xl font-semibold text-mcv-azul">Resend</h2>
            <p className="text-sm text-gray-400 mb-2">
              Prueba si la clave secreta (API Key) está cargada en Vercel.
            </p>
            <p>Estado: <StatusIcon status={resendStatus} /></p>
          </div>

        </div>

        <div className="mt-8 text-center">
          <Link href="/" legacyBehavior>
            <a className="px-4 py-2 bg-mcv-gris text-white font-bold rounded-lg hover:opacity-80 transition-opacity">
              Volver al Inicio
            </a>
          </Link>
        </div>

      </div>
    </div>
  );
}