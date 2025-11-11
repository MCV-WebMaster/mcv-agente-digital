import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
      <div className="text-center p-8 border border-mcv-gris rounded-lg">
        <img 
          src="/logo_mcv_rectangular.png" 
          alt="Logo MCV Propiedades" 
          className="w-64 mb-6"
        />
        <h1 className="text-3xl font-bold mb-2">MCV Agente Digital</h1>
        <p className="text-lg text-gray-300">
          Entorno configurado y desplegado en Vercel.
        </p>
        
        <div className="mt-8">
          <Link href="/test-conexion" legacyBehavior>
            <a className="px-4 py-2 bg-mcv-azul text-white font-bold rounded-lg hover:bg-mcv-verde transition-colors">
              Ejecutar Pruebas de Conexión
            </a>
          </Link>
        </div>

        <p className="mt-8 text-sm text-green-500">Día 1: Completado.</p>
      </div>
    </div>
  );
}