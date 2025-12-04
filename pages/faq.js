import Head from 'next/head';

export default function FAQ() {
  return (
    <div className="bg-slate-50 text-slate-800 min-h-screen font-sans">
      <Head>
        <title>Preguntas Frecuentes | MCV Propiedades</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script src="https://cdn.tailwindcss.com"></script>
      </Head>

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

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-8">

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
          
          <div className="space-y-5 text-slate-600 leading-relaxed">
            <div>
                <h4 className="font-bold text-slate-800 text-lg">Operaciones de Compraventa</h4>
                <p className="mt-1">
                Según Ley Provincial N° 10.973 (y modif. Ley 14.085):
                </p>
                <ul className="list-disc list-inside pl-2 space-y-1 mt-1">
                <li><strong className="text-slate-800">Porcentaje:</strong> del <strong className="text-slate-800">3% al 4%</strong> sobre el valor final.</li>
                <li><strong className="text-slate-800">Partes:</strong> Abonado por ambas partes (compradora y vendedora).</li>
                </ul>
            </div>

            <div className="pt-5 border-t border-slate-100">
              <h4 className="font-bold text-slate-800 text-lg">Alquileres Temporarios</h4>
              <ul className="list-disc list-inside pl-2 mt-2 space-y-3">
                <li>
                    <strong className="text-slate-800">Inquilinos:</strong> En MCV Propiedades, el inquilino <strong className="text-slate-800">no abona honorarios</strong>. El valor publicado es neto.
                </li>
                <li>
                    <strong className="text-slate-800">Propietarios:</strong> Los honorarios son absorbidos por el propietario en concepto de <strong className="text-slate-800">Gestión Integral</strong>, que incluye:
                    <ul className="list-circle pl-6 mt-1 text-sm text-slate-500 space-y-1">
                        <li>• Difusión en redes (Instagram, Facebook, WhatsApp).</li>
                        <li>• Gestión administrativa y confección de contratos.</li>
                        <li>• Recepción y Check-in de inquilinos.</li>
                        <li>• Coordinación de limpieza y gremios (técnicos) de ser necesario.</li>
                    </ul>
                </li>
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
                El inquilino abona la limpieza final para garantizar higiene perfecta al siguiente huésped.
              </p>
              <div className="bg-yellow-50 text-yellow-800 text-sm p-3 rounded mt-2 border border-yellow-100">
                <strong className="block mb-1">Aclaración Importante:</strong>
                Esto no invalida que no debe dejar la parrilla sucia o una pila de vajilla para lavar.
              </div>
            </div>
            <div className="pt-4 border-t border-slate-100">
              <h4 className="font-bold text-slate-800">B. Consumo Energético y Gas</h4>
              <ul className="list-disc list-inside pl-2 mt-2 space-y-1">
                <li><strong className="text-slate-800">Franquicia incluida:</strong> Pack básico de consumo.</li>
                <li><strong className="text-slate-800">Excedentes:</strong> Si se supera, se abona la diferencia.</li>
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
              Requisito obligatorio para cubrir roturas, faltantes, multas o incumplimientos (ej: limpieza extraordinaria).
            </p>
            
            <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                <h4 className="font-bold text-indigo-900 text-sm uppercase mb-3">Formas de Integración</h4>
                <ul className="space-y-3 text-sm">
                    <li className="flex items-start gap-2">
                        <span className="text-lg">⭐</span>
                        <div>
                            <strong className="text-slate-900 block">Cheque Electrónico (E-Cheq) - Recomendado</strong>
                            <span className="text-slate-600">Es la mejor opción por su facilidad y agilidad en la devolución.</span>
                        </div>
                    </li>
                    <li className="flex items-start gap-2">
                        <span className="text-lg">💵</span>
                        <div>
                            <strong className="text-slate-900 block">Efectivo</strong>
                            <span className="text-slate-600">Se coordina la entrega con el propietario <strong>antes de ingresar</strong>.</span>
                        </div>
                    </li>
                    <li className="flex items-start gap-2">
                        <span className="text-lg">🏦</span>
                        <div>
                            <strong className="text-slate-900 block">Transferencia Bancaria</strong>
                            <span className="text-slate-600">A cuenta del propietario. <strong className="text-indigo-900">Atención:</strong> Los gastos bancarios o retenciones corren exclusivamente por cuenta del inquilino.</span>
                        </div>
                    </li>
                </ul>
            </div>

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
              Gestionamos el reclamo al instante, pero la resolución efectiva depende de los tiempos de los técnicos de la zona, especialmente compleja durante fines de semana y feriados.
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
            <p>Sujeto a reglamento y decisión del propietario.</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Máximo 3 mascotas.</li>
              <li>Prohibidas razas peligrosas.</li>
              <li>NO se aceptan cachorros (-2 años).</li>
              <li>Posible recargo en limpieza final.</li>
            </ul>
          </div>
        </section>

        {/* 6. ROPA BLANCA */}
        <section className="bg-white rounded-2xl shadow-sm p-6 md:p-8 border border-slate-100">
          <div className="flex items-center gap-3 mb-4">
            <span className="bg-indigo-100 text-indigo-700 p-2 rounded-lg text-xl">🛏️</span>
            <h3 className="text-xl font-bold text-slate-900">6. Ropa Blanca</h3>
          </div>
          <p className="text-slate-600">
             Las propiedades <strong>NO incluyen</strong> sábanas ni toallas. Hay servicios externos de alquiler de sábanas para contingencias y también disponemos de practicunas.
          </p>
        </section>

        {/* 7. HORARIOS */}
        <section className="bg-white rounded-2xl shadow-sm p-6 md:p-8 border border-slate-100">
          <div className="flex items-center gap-3 mb-4">
            <span className="bg-red-100 text-red-700 p-2 rounded-lg text-xl">⏰</span>
            <h3 className="text-xl font-bold text-slate-900">7. Horarios (Estrictos)</h3>
          </div>
          <div className="grid md:grid-cols-2 gap-4 text-slate-600 mb-4">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center">
              <span className="block text-xs font-bold text-slate-400 uppercase">Check-in</span>
              <strong className="text-2xl text-slate-900">16:00 hs</strong>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center">
              <span className="block text-xs font-bold text-slate-400 uppercase">Check-out</span>
              <strong className="text-2xl text-slate-900">10:00 hs</strong>
            </div>
          </div>
          <p className="text-sm text-red-700 bg-red-50 p-4 rounded border border-red-100">
            <strong>Importante:</strong> El incumplimiento del horario de salida genera multas severas.
          </p>
        </section>

      </main>

      <footer className="bg-slate-900 text-slate-400 py-8 mt-12 text-center">
        <div className="max-w-4xl mx-auto px-6">
          <p className="font-semibold text-white">MCV Propiedades</p>
          <p className="text-sm mt-1">Costa Esmeralda</p>
        </div>
      </footer>
    </div>
  );
}