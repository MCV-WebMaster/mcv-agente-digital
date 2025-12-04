export const FAQ_DATA = [
  {
    id: 'honorarios-venta-alquiler',
    title: 'Honorarios, Ley y Usos y Costumbres (Compra-Venta y Alquiler Anual)',
    content: `
      **Marco Legal:** Según la Ley Provincial N° 10.973 (y su modificatoria, Ley 14.085) que regula el ejercicio del corretaje inmobiliario en la Provincia de Buenos Aires, los honorarios sugeridos para operaciones de compraventa pueden ser de hasta el **3% a 4%** a cargo de cada parte (compradora y vendedora). En alquileres anuales, la ley estipula un porcentaje del valor total del contrato.

      **Usos y Costumbres:** Más allá del marco legal, en el mercado inmobiliario de la Provincia de Buenos Aires (especialmente en zonas de barrios cerrados y Costa Esmeralda), la costumbre comercial estila que la **parte compradora asume la totalidad de los gastos de escrituración** y, en ocasiones, se negocian los honorarios profesionales en base a la complejidad de la operación. Siempre se busca un acuerdo transparente entre las partes antes de la reserva.
    `
  },
  {
    id: 'servicio-temporal',
    title: 'Modelo de Gestión en Alquiler Temporal (Sin Costo para Inquilino)',
    content: `
      En MCV Propiedades, nuestra política para alquileres temporales y de verano es que **el inquilino NO abona honorarios inmobiliarios**. 
      
      Los honorarios son abonados exclusivamente por el propietario, cubriendo nuestro **Servicio de Gestión Integral** que incluye:
      1. **Difusión Multicanal:** Publicación destacada en portales inmobiliarios líderes (ZonaProp, Argenprop), campañas en redes sociales (Instagram/Facebook Ads), marketing directo en nuestra base de datos de WhatsApp y red de colegas.
      2. **Gestión Administrativa:** Redacción de contratos temporales, control de inventarios y gestión de cobros.
      3. **Operativa en Sitio:** Servicio de limpieza pre-ingreso (Check-in) para garantizar la excelencia, recepción presencial de los huéspedes y servicio de **Guardia Técnica** durante la estadía para resolver contingencias (plomería, electricidad, wifi) de manera inmediata.
    `
  },
  {
    id: 'forma-pago',
    title: 'Política de Pagos (Alquiler Temporal)',
    content: `
      **Cancelación Total:** El valor total del alquiler temporal debe estar cancelado **antes de tomar posesión** de la propiedad (antes del inicio de la temporada o fecha de ingreso).
      
      **¿Por qué?** Esta política es indispensable para brindar seguridad jurídica al contrato y permitir, ante cualquier eventualidad o cancelación de fuerza mayor, tener el margen de tiempo necesario para volver a ofrecer la propiedad al mercado.
      
      **Importante:** El contrato de alquiler es un acuerdo directo entre el Locador (Propietario) y el Locatario. MCV Propiedades actúa como intermediario y gestor, pero no es quien "cobra" el alquiler para sí mismo, sino que gestiona los fondos en nombre del propietario.
    `
  },
  {
    id: 'depositos-garantia',
    title: 'Depósitos en Garantía: Modalidad y Devolución',
    content: `
      El depósito en garantía es un requisito obligatorio para cubrir posibles roturas o faltantes.
      
      **Modalidades Aceptadas:**
      * **E-Cheq (Recomendado):** Aceptamos cheque electrónico diferido. Esta es la opción ideal ya que se pesifica al valor del momento de ingreso, evitando el manejo de efectivo físico.
      * **Dólar Billete:** En efectivo al momento del ingreso.
      
      **Proceso de Devolución:** La devolución del depósito (o la anulación del E-Cheq) se realiza **posterior a la finalización del contrato**, una vez recibidas las liquidaciones de servicios (luz/gas) y verificado el estado del inmueble. 
      *Filosofía de Resolución:* Si existiera alguna rotura o faltante, nuestra política es resolver el costo específico de reposición de manera individual para no retener la totalidad del depósito y poder liberar el saldo restante al inquilino a la brevedad.
    `
  },
  {
    id: 'costos-adicionales',
    title: 'Costos Adicionales: Limpieza de Salida y Consumos',
    content: `
      Al finalizar la estadía, existen dos conceptos variables a tener en cuenta:
      
      1. **Limpieza de Salida (Obligatoria):** El inquilino debe abonar el servicio de limpieza final. Esto garantiza que la casa sea entregada en perfectas condiciones de higiene (del mismo modo que usted la recibió impecable gracias a la limpieza que abonó el inquilino anterior). Es un ciclo de calidad que mantenemos estrictamente.
      
      2. **Consumo de Energía:** La mayoría de los contratos incluyen una franquicia o "pack básico" de consumo de luz y gas suficiente para un uso racional. Si el consumo medido en los medidores excede esa franquicia, el inquilino abonará la diferencia al costo tarifario vigente, promoviendo así el uso responsable de la energía.
    `
  }
];

// Helper para convertir esto en texto plano para la IA (No tocar)
export function getFaqString() {
    return FAQ_DATA.map(item => `### ${item.title}\n${item.content}`).join('\n\n');
}