import '@/styles/globals.css';
import Head from 'next/head';
import 'react-datepicker/dist/react-datepicker.css';
import "slick-carousel/slick/slick.css"; // ¡NUEVO!
import "slick-carousel/slick/slick-theme.css"; // ¡NUEVO!
import FloatingChatButton from '@/components/FloatingChatButton'; // <--- 1. Importar

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>MCV Agente Digital</title>
        <link rel="icon" href="/favico_blanco.png" type="image/png" />
      </Head>
      <Component {...pageProps} />
      {/* 2. Agregar el componente aquí abajo */}
     {/* 3. comentamos <FloatingChatButton /> */}
    </>
  );
}