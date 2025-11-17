import Slider from 'react-slick';

export default function WelcomeCarousel() {
  const settings = {
    dots: true,
    infinite: true,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1,
    autoplay: true,
    autoplaySpeed: 6000, // Un poco más lento para leer
    fade: true,
    cssEase: 'linear'
  };

  // Link de WhatsApp pre-configurado
  const whatsappLink = "https://wa.me/5491165517385?text=Hola...!%20Te%20escribo%20por%20alquileres%20en%20Costa%20Esmeralda";

  const slides = [
    {
      content: (
        <span className="text-center text-lg font-medium">
          Por ALQUILERES en COSTA ESMERALDA Escribinos al <br/>
          <a 
            href={whatsappLink} 
            target="_blank" 
            rel="noopener noreferrer"
            className="underline font-bold hover:text-gray-200 transition-colors"
          >
            Cel. +5491165517385
          </a> 
          <br/> Lunes a Sábado de 8:00hs a 19:00hs
        </span>
      ),
      style: "bg-mcv-azul text-white"
    },
    {
      content: (
        <span className="text-center text-lg font-medium">
          Brindamos asesoramiento responsable de intermediación en la compra, venta y alquiler de inmuebles, buscando satisfacer al cliente atendiendo, comprendiendo y trabajando sobre sus necesidades inmobiliarias específicas.
        </span>
      ),
      style: "bg-mcv-verde text-white"
    },
    {
      content: (
        <span className="text-center text-lg font-medium">
          Nos caracteriza la experiencia en las zonas de influencia, la atención personalizada, y nuestros valores: el compromiso, la integridad y el profesionalismo.
        </span>
      ),
      style: "bg-mcv-gris text-white"
    }
  ];

  return (
    <div className="w-full max-w-3xl mx-auto">
      <Slider {...settings}>
        {slides.map((slide, index) => (
          <div key={index}>
            <div className={`p-8 rounded-lg shadow-lg ${slide.style} min-h-[180px] flex items-center justify-center`}>
              {slide.content}
            </div>
          </div>
        ))}
      </Slider>
    </div>
  );
}