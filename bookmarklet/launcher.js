/**
 * Bookmarklet — Cargador síncrono.
 * Ver INFORME-ARQUITECTURA-MYVETE-V2.7.md, Sección 3 (SECCIÓN 5), punto 3.2, pasos 1-2.
 *
 * Responsabilidad de este archivo: correr en el contexto de la pestaña de MyVete,
 * extraer lo mínimo indispensable de la pantalla activa y abrir la ventana flotante
 * definida en /interface/index.html. No contiene lógica de formulario ni de negocio —
 * eso vive del lado de /interface/app.js.
 *
 * Contrato del mensaje (debe calzar con el listener de interface/app.js Sección 2):
 *   { type: 'MYVETE_FILIACION', payload: { tutor: {...}, mascota: {...} } }
 * `tutor` todavía no tiene selector real confirmado en el DOM de MyVete — viaja
 * con sus 3 campos en null (raspado de mejor esfuerzo, ver Contrato de Datos V2.7
 * Sección 1.2). `mascota` sí tiene selectores confirmados (24/08/2026, ver abajo).
 */
(function () {
  "use strict";

  // Paso 1 — Activación y raspado de entrada (Sección 3.2, punto 1)
  // Selectores reales confirmados sobre el DOM de la ficha clínica (div.patient-info):
  //   - Mascota:            '.patient-info h1' -> ej. "Baco"
  //   - Especie/Raza/Color: div interno con texto combinado por comas,
  //                         ej. "Canino, ovejero suizo, BLANCO" (color se descarta,
  //                         no forma parte del contrato de datos de mascota).
  // TODO: extraer el ID del paciente desde window.location.href (no usado todavía
  //       por interface/app.js — no hay query param que lo consuma del otro lado).
  // TODO: selector real de tutor (nombre/teléfono/email) — no confirmado aún sobre
  //       el DOM de MyVete, viaja en null hasta poder verificarlo en pantalla.
  function rasparFiliacion() {
    const vacio = {
      tutor: { nombre: null, telefono: null, email: null },
      mascota: { nombre: null, especie: null, raza: null, pesoActual: null },
    };

    try {
      const root = document.querySelector(".patient-info");
      if (!root) return vacio;

      const nombreMascota = root.querySelector("h1")?.innerText.trim() || null;

      const divCombinado = Array.from(root.querySelectorAll("div")).find(
        (d) => d.innerText && d.innerText.includes(",")
      );
      const partes = divCombinado
        ? divCombinado.innerText.split(",").map((s) => s.trim())
        : [];

      return {
        tutor: vacio.tutor,
        mascota: {
          nombre: nombreMascota,
          especie: partes[0] || null,
          raza: partes[1] || null,
          pesoActual: null,
        },
      };
    } catch (error) {
      console.error("MyVete Bookmarklet: error al raspar filiación.", error);
      return vacio;
    }
  }

  // Paso 2 — Despliegue del panel externo (Sección 3.2, punto 2)
  // IMPORTANTE (Sección 4.1 — bloqueadores de pop-ups): window.open() debe dispararse
  // en el mismo hilo de ejecución del clic sobre el bookmarklet, sin pasos asíncronos
  // intermedios (fetch, await, setTimeout) entre el clic y la apertura. El raspado de
  // arriba es 100% síncrono, así que no rompe esta regla.
  const datosFiliacion = rasparFiliacion();
  const ventana = window.open(
    "http://localhost:8080/interface/index.html",
    "MYVETE_PANEL"
  );

  if (!ventana) {
    console.error("MyVete Bookmarklet: window.open() bloqueado por el navegador.");
    return;
  }

  // Todavía no existe handshake de "ventana lista" (Sección 0.1 del Contrato de
  // Datos V2.7 / pendiente #6 de STATUS.md) — interface/app.js hoy solo escucha
  // pasivamente 'message', sin emitir señal de carga. Mientras tanto, se reintenta
  // el envío del mismo mensaje varias veces a intervalo corto: interface/app.js
  // solo asigna valores a campos (idempotente), así que recibir el mensaje más de
  // una vez no tiene efecto colateral.
  const mensaje = { type: "MYVETE_FILIACION", payload: datosFiliacion };
  let intentosRestantes = 5;
  const intervaloEnvio = setInterval(() => {
    ventana.postMessage(mensaje, "*");
    intentosRestantes -= 1;
    if (intentosRestantes <= 0) clearInterval(intervaloEnvio);
  }, 400);

  // Paso 5 — Escucha de retorno (Sección 3.2, punto 5)
  // TODO: registrar listener de "message" para recibir el resumen clínico compacto
  //       devuelto por la ventana flotante
  // TODO: al recibir el mensaje, localizar el campo de evolución en el DOM de MyVete,
  //       asignar el valor y disparar evento nativo con bubbling (ver Sección 4.3)
})();
