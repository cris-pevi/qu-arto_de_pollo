/* ============================================================================
   config.js — DATOS QUE EL EQUIPO COMPLETA
   Edita solo este archivo para personalizar el sitio (no hay que tocar el HTML).
   Todo valor que quede vacío o entre corchetes, p. ej. "[completar]", se muestra
   como "—" en el sitio y se avisa en la consola del navegador (F12).
   ============================================================================ */
window.CONFIG = {
  // Nombre del equipo y del evento (el evento va solo como texto, sin logos).
  team: "Qu-arto de pollo",
  event: "IBM Quantum Hackathon 2026 · Lima",
  organizers: "IEEE CS PUCP · Qiskit Fall Fest",

  // Integrantes: { name: "Nombre Apellido", role: "Rol" }. Agrega una línea por persona.
  members: [
    // { name: "[completar]", role: "[completar]" },
  ],

  // URL del repositorio (GitHub, GitLab…). También genera el código QR.
  repoUrl: "[completar]",

  // Contacto: texto libre (correo, usuario…). Si es un correo, se vuelve enlace.
  contact: "[completar]",

  // Agradecimientos: lista de textos. Ej.: ["Mentores del hackathon", "IEEE CS PUCP"]
  thanks: [
    // "[completar]",
  ],

  // Criterios del jurado, si se conocen. section = id de la sección que los responde
  // (problema, datos, modelo, laboratorio, resultados, limites, reproducir, equipo).
  // Ej.: { name: "Rigor técnico", section: "reproducir" }
  criteria: [
    // { name: "[completar]", section: "modelo" },
  ],

  // Convención del canal 2 en data.js (dbt):
  //   true  -> dbt = BT(ahora) − BT(hace 30 min): valores NEGATIVOS = se enfrió.
  //   false -> dbt ya viene como "cuánto se enfrió": valores POSITIVOS = se enfrió.
  dbtEsCambio: true,

  // URL pública del sitio (opcional; solo para el texto del README/QR de respaldo).
  siteUrl: ""
};
