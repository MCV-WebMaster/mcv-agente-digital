import Slider from 'react-slick';

export default function WelcomeCarousel() {
  const settings = {
    dots: true,
    infinite: true,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1,
    autoplay: true,
    autoplaySpeed: 5000,
    fade: true,
    cssEase: 'linear'
  };

  const slides = [
    {
      text: "Por ALQUILERES en COSTA ESMERALDA Escribinos al Cel. +5491165517385 Lunes a Sábado de 8:00hs a 19:00hs",
      style: "bg-mcv-azul text-white"
    },
    {
      text: "Brindamos asesoramiento responsable de intermediación en la compra, venta y alquiler de inmuebles, buscando satisfacer al cliente atendiendo, comprendiendo y trabajando sobre sus necesidades inmobiliarias específicas.",
      style: "bg-mcv-verde text-white"
    },
    {
      text: "Nos caracteriza la experiencia en las zonas de influencia, la atención personalizada, y nuestros valores: el compromiso, la integridad y el profesionalismo.",
      style: "bg-mcv-gris text-white"
    }
  ];

  return (
    <div className="w-full max-w-2xl mx-auto">
      <Slider {...settings}>
        {slides.map((slide, index) => (
          <div key={index}>
            <div className={`p-8 rounded-lg shadow-lg ${slide.style} min-h-[150px] flex items-center justify-center`}>
              <p className="text-center text-lg font-medium">{slide.text}</p>
            </div>
          </div>
        ))}
      </Slider>
    </div>
  );
}