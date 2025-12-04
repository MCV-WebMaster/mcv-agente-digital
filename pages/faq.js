import Head from 'next/head';
import { FAQ_DATA } from '@/lib/faqData';
import Footer from '@/components/Footer'; // Asumiendo que tiene un footer, si no, borrar linea

export default function FaqPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Head>
        <title>Preguntas Frecuentes - MCV Propiedades</title>
      </Head>

      <header className="bg-white border-b p-4 shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
           <span className="text-mcv-azul font-bold text-xl">MCV Propiedades</span>
           <a href="/" className="text-sm text-gray-500 hover:text-mcv-azul">← Volver al inicio</a>
        </div>
      </header>

      <main className="flex-grow max-w-4xl mx-auto w-full p-6 md:p-12">
        <h1 className="text-3xl md:text-4xl font-bold text-mcv-azul mb-2">Preguntas Frecuentes</h1>
        <p className="text-gray-600 mb-10 text-lg">Información útil sobre nuestros procesos de alquiler y venta.</p>

        <div className="space-y-6">
          {FAQ_DATA.map((item) => (
            <div key={item.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <h3 className="text-xl font-bold text-gray-800 mb-3 flex items-center gap-2">
                <span className="text-mcv-verde">●</span> {item.title}
              </h3>
              <div className="text-gray-600 leading-relaxed whitespace-pre-line pl-5 border-l-2 border-gray-100">
                {item.content}
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-12 p-8 bg-mcv-azul rounded-2xl text-white text-center">
            <h3 className="text-2xl font-bold mb-4">¿Tenés más dudas?</h3>
            <p className="mb-6 opacity-90">Nuestra asistente virtual MaCA está lista para responderte, o podés hablar con nosotras.</p>
            <a href="/chat" className="inline-block bg-white text-mcv-azul font-bold py-3 px-8 rounded-full hover:bg-gray-100 transition-colors">
                Hablar con MaCA
            </a>
        </div>
      </main>

      {/* Si tiene componente Footer úselo, sino borrar */}
      {/* <Footer /> */}
    </div>
  );
}