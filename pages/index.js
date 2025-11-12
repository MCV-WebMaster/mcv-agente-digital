import { useState, useEffect } from 'react';
import PropertyCard from '@/components/PropertyCard';
import Spinner from '@/components/Spinner';

// --- IDs de Categoría (de su lista de Estatik) ---
const CATEGORIA_VENTA = 198;
const CATEGORIA_ALQUILER_TEMPORAL = 197;
const CATEGORIA_ALQUILER_ANUAL = [193, 194]; // Amueblado o Sin Muebles

// --- IDs de Tipo (de su lista de Estatik) ---
const TIPO_CASA = 162;
const TIPO_DEPARTAMENTO = 163;
const TIPO_LOTE = 167;


export default function SearchPage() {
  
  // --- ESTADO PRINCIPAL ---
  const [step, setStep] = useState(1); // 1: Operación, 2: Zona, 3: Filtros, 4: Resultados
  
  // Guardamos todos los filtros en un solo objeto
  const [filters, setFilters] = useState({
    operacion: null, // 'venta', 'alquiler_temporal', 'alquiler_anual'
    zona: null,      // 'GBA Sur', 'Costa Esmeralda'
    tipo: null,      // 'casa', 'departamento', 'lote'
    pax: '',
    pets: false,
    pool: false,
    bedrooms: '',
    startDate: '',
    endDate: '',
  });

  // --- ESTADO DE RESULTADOS ---
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // --- LÓGICA DE BÚSQUEDA ---
  const handleSearch = async () => {
    setIsLoading(true);
    setError(null);
    setStep(4); // Mover a la página de resultados

    // 1. Limpiar filtros irrelevantes
    const finalFilters = { ...filters };
    if (filters.operacion === 'venta') {
      delete finalFilters.pax;
      delete finalFilters.pets;
      delete finalFilters.startDate;
      delete finalFilters.endDate;
    }
    if (filters.operacion === 'alquiler_temporal') {
      delete finalFilters.bedrooms;
    }

    try {
      // 2. Llamar a nuestra API (¡usando POST!)
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(finalFilters), // Enviamos los filtros en el body
      });

      if (!response.ok) {
        throw new Error('La respuesta de la red no fue OK');
      }
      
      const data = await response.json();
      
      if (data.status === 'OK') {
        setResults(data.results);
      } else {
        throw new Error(data.error || 'Error en la API');
      }
    } catch (err) {
      console.error('Error al buscar propiedades:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // --- MANEJADORES DE EVENTOS ---
  const handleFilterChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  // Funciones para manejar los pasos del "Asistente"
  const selectOperacion = (op) => {
    setFilters(prev => ({ ...prev, operacion: op }));
    setStep(2); // Ir al paso 2 (Zona)
  };
  
  const selectZona = (zona) => {
    setFilters(prev => ({ ...prev, zona: zona }));
    setStep(3); // Ir al paso 3 (Filtros)
  };

  const resetSearch = () => {
    setFilters({
      operacion: null, zona: null, tipo: null,
      pax: '', pets: false, pool: false, bedrooms: '',
      startDate: '', endDate: '',
    });
    setResults([]);
    setError(null);
    setIsLoading(false);
    setStep(1); // Volver al inicio
  };

  // --- RENDERIZADO (El HTML) ---

  const renderStep = () => {
    switch (step) {
      // --- PASO 1: ¿QUÉ BUSCAS? ---
      case 1:
        return (
          <div className="text-center">
            <h2 className="text-3xl font-bold mb-8">¿Qué estás buscando?</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <button onClick={() => selectOperacion('venta')} className="p-8 bg-mcv-azul text-white rounded-lg shadow-lg hover:bg-opacity-80 transition-all text-2xl font-bold">
                Comprar
              </button>
              <button onClick={() => selectOperacion('alquiler_temporal')} className="p-8 bg-mcv-verde text-white rounded-lg shadow-lg hover:bg-opacity-80 transition-all text-2xl font-bold">
                Alquiler Temporal
              </button>
              <button onClick={() => selectOperacion('alquiler_anual')} className="p-8 bg-mcv-gris text-white rounded-lg shadow-lg hover:bg-opacity-80 transition-all text-2xl font-bold">
                Alquiler Anual
              </button>
            </div>
          </div>
        );

      // --- PASO 2: ¿DÓNDE BUSCAS? ---
      case 2:
        return (
          <div className="text-center">
            <button onClick={() => setStep(1)} className="text-mcv-azul mb-6">&larr; Volver</button>
            <h2 className="text-3xl font-bold mb-8">¿En qué zona?</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <button onClick={() => selectZona('Costa Esmeralda')} className="p-8 bg-gray-100 border border-gray-300 text-mcv-gris rounded-lg shadow-lg hover:bg-gray-200 transition-all text-2xl font-bold">
                Costa Atlántica
              </button>
              <button onClick={() => selectZona('GBA Sur')} className="p-8 bg-gray-100 border border-gray-300 text-mcv-gris rounded-lg shadow-lg hover:bg-gray-200 transition-all text-2xl font-bold">
                GBA Zona Sur
              </button>
              {/* Añadir más zonas si es necesario */}
            </div>
          </div>
        );
        
      // --- PASO 3: FILTROS ESPECÍFICOS ---
      case 3:
        return (
          <div>
            <button onClick={() => setStep(2)} className="text-mcv-azul mb-6">&larr; Volver</button>
            <h2 className="text-3xl font-bold mb-6 text-center">Afiná tu búsqueda</h2>
            <div className="p-6 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Filtro: Tipo de Propiedad */}
                <div>
                  <label htmlFor="tipo" className="block text-sm font-medium text-gray-700 mb-1">Tipo de Propiedad</label>
                  <select
                    id="tipo"
                    name="tipo"
                    value={filters.tipo || ''}
                    onChange={handleFilterChange}
                    className="w-full p-2 rounded-md bg-white border border-gray-300 focus:border-mcv-azul focus:ring-mcv-azul"
                  >
                    <option value="">Cualquiera</option>
                    <option value="casa">Casa</option>
                    <option value="departamento">Departamento</option>
                    {filters.operacion === 'venta' && <option value="lote">Lote</option>}
                  </select>
                </div>

                {/* Filtros de VENTA */}
                {filters.operacion === 'venta' && (
                  <div>
                    <label htmlFor="bedrooms" className="block text-sm font-medium text-gray-700 mb-1">Dormitorios (mínimo)</label>
                    <input
                      type="number"
                      id="bedrooms"
                      name="bedrooms"
                      value={filters.bedrooms}
                      onChange={handleFilterChange}
                      placeholder="Ej: 3"
                      className="w-full p-2 rounded-md bg-white border border-gray-300"
                    />
                  </div>
                )}
                
                {/* Filtros de ALQUILER TEMPORAL */}
                {filters.operacion === 'alquiler_temporal' && (
                  <>
                    <div>
                      <label htmlFor="pax" className="block text-sm font-medium text-gray-700 mb-1">Personas (mínimo)</label>
                      <input
                        type="number"
                        id="pax"
                        name="pax"
                        value={filters.pax}
                        onChange={handleFilterChange}
                        placeholder="Ej: 6"
                        className="w-full p-2 rounded-md bg-white border border-gray-300"
                      />
                    </div>
                    {/* Filtro: Fechas (Placeholder) */}
                    <div className="flex gap-2">
                      <div>
                        <label htmlFor="startDate" className="block text-sm font-medium text-gray-700">Desde</label>
                        <input 
                          type="date" id="startDate" name="startDate"
                          value={filters.startDate} onChange={handleFilterChange}
                          className="w-full p-2 rounded-md bg-white border border-gray-300"
                        />
                      </div>
                      <div>
                        <label htmlFor="endDate" className="block text-sm font-medium text-gray-700">Hasta</label>
                        <input 
                          type="date" id="endDate" name="endDate"
                          value={filters.endDate} onChange={handleFilterChange}
                          className="w-full p-2 rounded-md bg-white border border-gray-300"
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Filtros Comunes (Mascotas y Pileta) */}
                {filters.tipo !== 'lote' && (
                  <div className="flex flex-col gap-2 pt-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        name="pets"
                        checked={filters.pets}
                        onChange={handleFilterChange}
                        className="h-5 w-5 rounded border-gray-300 text-mcv-azul focus:ring-mcv-azul"
                      />
                      <span className="text-gray-700">Acepta Mascotas</span>
                    </label>
                    
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        name="pool"
                        checked={filters.pool}
                        onChange={handleFilterChange}
                        className="h-5 w-5 rounded border-gray-300 text-mcv-azul focus:ring-mcv-azul"
                      />
                      <span className="text-gray-700">Con Pileta</span>
                    </label>
                  </div>
                )}
              </div>
              
              {/* Botón de Búsqueda */}
              <div className="text-center mt-8">
                <button
                  onClick={handleSearch}
                  className="w-full md:w-1/2 p-3 bg-mcv-verde text-white font-bold rounded-lg shadow-lg text-xl hover:bg-opacity-90"
                >
                  Buscar
                </button>
              </div>
            </div>
          </div>
        );

      // --- PASO 4: RESULTADOS ---
      case 4:
        return (
          <div>
            <button onClick={resetSearch} className="text-mcv-azul mb-6">&larr; Empezar Nueva Búsqueda</button>
            <h2 className="text-3xl font-bold mb-6 text-center">Propiedades Encontradas ({results.length})</h2>
            
            {isLoading ? (
              <Spinner />
            ) : error ? (
              <div className="text-center text-red-600 bg-red-100 p-4 rounded-lg">
                <p className="font-bold">Error al cargar propiedades</p>
                <p>{error}</p>
              </div>
            ) : results.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {results.map(prop => (
                  <PropertyCard key={prop.property_id} property={prop} />
                ))}
              </div>
            ) : (
              <div className="text-center text-gray-500 p-10 bg-gray-50 rounded-lg">
                <p className="text-xl">No se encontraron propiedades.</p>
                <p>Intente ajustar sus filtros o <button onClick={resetSearch} className="text-mcv-azul hover:underline">empezar de nuevo</button>.</p>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  // --- RENDERIZADO PRINCIPAL DE LA PÁGINA ---
  return (
    <div className="min-h-screen bg-white text-gray-800 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        
        {/* Encabezado y Logo */}
        <header className="flex flex-col md:flex-row justify-between items-center mb-8 pb-4 border-b border-gray-200">
          <img 
            src="/logo_mcv_rectangular.png" 
            alt="Logo MCV Propiedades" 
            className="w-48 md:w-64"
          />
          <div className="text-center md:text-right mt-4 md:mt-0">
            <h1 className="text-3xl font-bold text-mcv-azul">Agente Digital</h1>
            <p className="text-lg text-gray-500">Encuentre su propiedad ideal</p>
          </div>
        </header>

        {/* Contenido principal (el Asistente) */}
        <main>
          {renderStep()}
        </main>
        
        {/* (Aquí podríamos añadir el Asistente de Chat en el futuro) */}

      </div>
    </div>
  );
}