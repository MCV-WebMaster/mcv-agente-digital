import Head from 'next/head';

export default function FAQ() {
  return (
    <div className="bg-slate-50 text-slate-800 min-h-screen font-sans">
      <Head>
        <title>Preguntas Frecuentes | MCV Propiedades</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* Cargamos Tailwind vía CDN para asegurar el estilo rápido */}
        <script src="https://cdn.tailwindcss.com"></script>
      </Head>

      {/* Encabezado */}
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 py-5 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">MCV Propiedades</h1>
            <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold mt-1">Centro de Ayuda</p>
          </div>
          <a href="/" className="text-sm font-medium text-blue-600 hover:text-blue-800 transition">
            &larr; Volver
          </a>
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="max-w-4xl mx-auto px-6 py-10 space-y-8">

        {/* Título */}
        <div className="text-center pb-6 border-b border-slate-200">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Preguntas Frecuentes</h2>
          <p className="text-lg text-slate-600">
            Información detallada sobre políticas de alquiler y reglamentos en Costa Esmeralda.
          </p>
        </div>

        {/* 1. HONORARIOS */}
        <section className="bg-white rounded-2xl shadow-sm p-6 md:p-8 border border-slate-100">
          <div className="flex items-center gap-3 mb-4">
            <span className="bg-blue-100 text-blue-700 p-2 rounded-lg text-xl">💰</span>
            <h3 className="text-xl font-bold text-slate-900">1. Honorarios y Comisiones</h3>
          </div>
          
          <div className="space-y-4 text-slate-600 leading-relaxed">
            <h4 className="font-bold text-slate-800 text-lg">Operaciones de Compraventa</h4>
            <p>
              Nuestra política de honorarios se rige por la Ley Provincial N° 10.973 y su modificatoria Ley 14.085:
            </p>
            <ul className="list-disc list-inside pl-2 space-y-2">
              <li><strong className="text-slate-800">Porcentaje:</strong> Se estipula del <strong className="text-slate-800">3% al 4%</strong> sobre el valor final de la operación.</li>
              <li><strong className="text-slate-800">Partes:</strong> Abonado por <strong className="text-slate-800">ambas partes</strong> por separado (compradora y vendedora).</li>
            </ul>

            <div className="mt-6 pt-6 border-t border-slate-100">
              <h4 className="font-bold text-slate-800 text-lg">Alquileres Temporarios</h4>
              <p className="mt-2">
                MCV brinda un servicio a propietarios hasta poner en contacto a ambas partes.
              </p>
              <ul className="list-disc list-inside pl-2 mt-2 space-y-2">
                <li><strong className="text-slate-800">Inquilinos:</strong> En MCV Propiedades, el inquilino <strong className="text-slate-800">no abona honorarios</strong>. El valor publicado es neto.</li>
                <li><strong className="text-slate-800">Propietarios:</strong> Los honorarios son absorbidos por el propietario por la gestión comercial.</li>
              </ul>
            </div>
          </div>
        </section>

        {/* 2. GASTOS EXTRAS */}
        <section className="bg-white rounded-2xl shadow-sm p-6 md:p-8 border border-slate-100">
          <div className="flex items-center gap-3 mb-4">
            <span className="bg-green-100 text-green-700 p-2 rounded-lg text-xl">⚡</span>
            <h3 className="text-xl font-bold text-slate-900">2. Gastos Adicionales</h3>
          </div>
          
          <div className="space-y-6 text-slate-600 leading-relaxed">
            <div>
              <h4 className="font-bold text-slate-800">A. Servicio de Limpieza de Salida (Obligatorio)</h4>
              <p className="mt-1">
                El inquilino debe abonar el servicio de limpieza final. Esto garantiza que la casa sea entregada en perfectas condiciones de higiene (del mismo modo que usted la recibió impecable gracias a la limpieza que abonó el inquilino anterior). Es un ciclo de calidad que mantenemos estrictamente.
              </p>
              <div className="bg-yellow-50 text-yellow-800 text-sm p-3 rounded mt-3 border border-yellow-100">
                <strong className="block mb-1">Aclaración Importante:</strong>
                Esto no invalida que no debe dejar la parrilla sucia o una pila de vajilla para lavar.
              </div>
            </div>
            <div className="pt-4 border-t border-slate-100">
              <h4 className="font-bold text-slate-800">B. Consumo Energético y Gas</h4>
              <p className="mt-1">
                Para promover el uso racional de la energía:
              </p>
              <ul className="list-disc list-inside pl-2 mt-2 space-y-1">
                <li><strong className="text-slate-800">Franquicia incluida:</strong> El contrato incluye un pack de consumo básico.</li>
                <li><strong className="text-slate-800">Excedentes:</strong> Si se supera la franquicia, se abona la diferencia según tarifario vigente.</li>
              </ul>
            </div>
          </div>
        </section>

        {/* 3. DEPÓSITO EN GARANTÍA */}
        <section className="bg-white rounded-2xl shadow-sm p-6 md:p-8 border border-slate-100">
          <div className="flex items-center gap-3 mb-4">
            <span className="bg-purple-100 text-purple-700 p-2 rounded-lg text-xl">🛡️</span>
            <h3 className="text-xl font-bold text-slate-900">3. Depósito en Garantía</h3>
          </div>
          
          <div className="space-y-4 text-slate-600 leading-relaxed">
            <p>
              El depósito en garantía es un requisito obligatorio para cubrir posibles roturas o faltantes. También incumplimientos del contrato como limpieza mínima, multas o infracciones.
            </p>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <h4 className="font-bold text-slate-800 text-sm uppercase mb-2">Filosofía de Resolución</h4>
              <p className="text-sm">
                Si existiera alguna rotura, faltante, multas o infracciones, los costos correspondientes serán descontados de este depósito al finalizar la estadía.
              </p>
            </div>
          </div>
        </section>

        {/* 4. CONTINGENCIAS */}
        <section className="bg-white rounded-2xl shadow-sm p-6 md:p-8 border border-slate-100">
          <div className="flex items-center gap-3 mb-4">
            <span className="bg-cyan-100 text-cyan-700 p-2 rounded-lg text-xl">🔧</span>
            <h3 className="text-xl font-bold text-slate-900">4. Asistencia y Contingencias</h3>
          </div>
          
          <div className="space-y-3 text-slate-600 leading-relaxed">
            <p>
              Durante la estadía, para resolver contingencias (plomería, electricidad, wifi) nos ocupamos de manera inmediata.
            </p>
            <p className="text-sm bg-cyan-50 text-cyan-800 p-3 rounded border border-cyan-100">
              <strong className="block mb-1">Tiempos de Respuesta:</strong>
              Dentro de los tiempos posibles, entendiendo la complejidad de los fines de semana y los feriados, los técnicos tienen sus tiempos. Nosotros gestionamos el reclamo al instante, pero la resolución efectiva depende de la disponibilidad técnica de la zona.
            </p>
          </div>
        </section>

        {/* 5. MASCOTAS */}
        <section className="bg-white rounded-2xl shadow-sm p-6 md:p-8 border border-slate-100">
          <div className="flex items-center gap-3 mb-4">
            <span className="bg-orange-100 text-orange-700 p-2 rounded-lg text-xl">🐾</span>
            <h3 className="text-xl font-bold text-slate-900">5. Política de Mascotas</h3>
          </div>
          
          <div className="space-y-3 text-slate-600 leading-relaxed">
            <p>La admisión está sujeta al reglamento del barrio y decisión del propietario.</p>
            <ul className="list-disc list-inside space-y-2">
              <li><strong className="text-slate-800">Cantidad:</strong> Máximo tres (3) mascotas.</li>
              <li><strong className="text-slate-800">Razas:</strong> Prohibidas razas peligrosas o de guardia sin consulta previa.</li>
              <li><strong className="text-slate-800">Edad:</strong> No se aceptan cachorros (menos de 2 años).</li>
              <li><strong className="text-slate-800">Costo:</strong> Puede haber un recargo en la limpieza final.</li>
            </ul>
          </div>
        </section>

        {/* 6. ROPA BLANCA */}
        <section className="bg-white rounded-2xl shadow-sm p-6 md:p-8 border border-slate-100">
          <div className="flex items-center gap-3 mb-4">
            <span className="bg-indigo-100 text-indigo-700 p-2 rounded-lg text-xl">🛏️</span>
            <h3 className="text-xl font-bold text-slate-900">6. Ropa Blanca y Accesorios</h3>
          </div>
          
          <div className="space-y-3 text-slate-600 leading-relaxed">
            <p>
              Las propiedades <strong className="text-slate-800">NO incluyen</strong> sábanas ni toallas, salvo especificación contraria en propiedades de lujo.
            </p>
            <div className="bg-indigo-50 p-4 rounded-lg mt-2">
              <h5 className="font-bold text-indigo-900 text-sm uppercase mb-2">Servicios Opcionales</h5>
              <ul className="list-disc list-inside text-indigo-800 text-sm space-y-1">
                <li>Alquiler de Ropa Blanca (emergencia).</li>
                <li>Alquiler de Practicunas para bebés.</li>
              </ul>
            </div>
          </div>
        </section>

        {/* 7. HORARIOS */}
        <section className="bg-white rounded-2xl shadow-sm p-6 md:p-8 border border-slate-100">
          <div className="flex items-center gap-3 mb-4">
            <span className="bg-red-100 text-red-700 p-2 rounded-lg text-xl">⏰</span>
            <h3 className="text-xl font-bold text-slate-900">7. Horarios de Ingreso y Egreso</h3>
          </div>
          
          <div className="grid md:grid-cols-2 gap-4 text-slate-600">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center">
              <span className="block text-xs font-bold text-slate-400 uppercase">Check-in (Entrada)</span>
              <strong className="text-3xl text-slate-900 block mt-1">16:00 hs</strong>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center">
              <span className="block text-xs font-bold text-slate-400 uppercase">Check-out (Salida)</span>
              <strong className="text-3xl text-slate-900 block mt-1">10:00 hs</strong>
            </div>
          </div>
          <p className="mt-4 text-sm text-red-700 bg-red-50 p-4 rounded border border-red-100">
            <strong className="block mb-1">Importante:</strong> 
            El incumplimiento del horario de salida genera <strong className="text-red-800">multas severas</strong> que se descontarán del depósito, debido a los problemas operativos que causa al siguiente ingreso.
          </p>
        </section>

      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-8 mt-12 text-center">
        <div className="max-w-4xl mx-auto px-6">
          <p className="font-semibold text-white">MCV Propiedades</p>
          <p className="text-sm mt-1">Costa Esmeralda</p>
        </div>
      </footer>
    </div>
  );
}