import '@/styles/globals.css';
import Head from 'next/head';
import 'react-datepicker/dist/react-datepicker.css';
import "slick-carousel/slick/slick.css"; // ¡NUEVO!
import "slick-carousel/slick/slick-theme.css"; // ¡NUEVO!


export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>MCV Agente Digital</title>
        <link rel="icon" href="/favico_blanco.png" type="image/png" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}