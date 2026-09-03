// src/app.js — MyVete SPA v5.2, widget flotante standalone
//
// Distinto de interface/app.js (panel completo, ya validado E2E). Este es un
// thin client minimalista pensado para ser publicado en un bucket PUBLICO de
// Supabase Storage e inyectado en las 8 computadoras de los veterinarios
// (via bookmarklet o script tag), reemplazando la extensión de Claude.
//
// Decisiones de seguridad (ver conversación con el usuario, 2026-08-27):
// - NO lleva API Key: un valor "secreto" adentro de un archivo servido desde
//   una URL publica deja de ser secreto en el momento en que se publica.
//   Verificado contra el Webhook real (n8n/workflow_v4_current.json): hoy no
//   tiene Header Auth configurado, así que un X-API-Key del lado del cliente
//   no protegería nada — la autenticación real (Regla 3) tiene que resolverse
//   del lado de n8n (Header Auth / validación de origen), no acá.
// - La URL del webhook y el shape del payload son los que el workflow
//   "MYVETE - Ingesta Filiación & Orquestador Core" (id 5gGWXOjY2BBOAfuw)
//   efectivamente lee hoy (ver n8n/README.md), no el shape simplificado de un
//   ejemplo previo que no coincidía con ningún campo real del nodo IA.
// - Nota de alcance: el workflow desplegado (respaldo local) solo hace
//   Webhook -> IA -> Respond to Webhook. Todavía no escribe en Supabase
//   (tutores/mascotas/atenciones_cardiologia), así que esta consulta hoy
//   devuelve un borrador de IA pero no persiste nada.

(function () {
    'use strict';

    const CONFIG = {
        webhookUrl: 'https://echevanest.app.n8n.cloud/webhook/ingesta-filiacion-v4',
        botonId: 'myvete-assist-btn',
        modalId: 'myvete-modal',
        formId: 'myvete-form',
        resultadoId: 'myvete-resultado',
    };

    function crearUI() {
        const btn = document.createElement('button');
        btn.id = CONFIG.botonId;
        btn.innerHTML = '🐾 Asistente MyVete';
        btn.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 999999;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 50px;
            padding: 15px 25px;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            transition: all 0.3s ease;
        `;
        btn.onmouseenter = () => {
            btn.style.transform = 'scale(1.05)';
            btn.style.boxShadow = '0 6px 20px rgba(0,0,0,0.3)';
        };
        btn.onmouseleave = () => {
            btn.style.transform = 'scale(1)';
            btn.style.boxShadow = '0 4px 15px rgba(0,0,0,0.2)';
        };
        btn.onclick = abrirModal;
        document.body.appendChild(btn);

        const modal = document.createElement('div');
        modal.id = CONFIG.modalId;
        modal.style.cssText = `
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.6);
            z-index: 999999;
            justify-content: center;
            align-items: center;
            backdrop-filter: blur(5px);
        `;

        modal.innerHTML = `
            <div style="
                background: white;
                border-radius: 16px;
                padding: 30px;
                max-width: 650px;
                width: 95%;
                max-height: 85vh;
                overflow-y: auto;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                position: relative;
            ">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h2 style="margin: 0; color: #333; font-size: 24px;">📋 Nueva Consulta</h2>
                    <button type="button" data-accion="cerrar-modal"
                            style="background: none; border: none; font-size: 28px; cursor: pointer; color: #999; transition: transform 0.3s;">
                        ✕
                    </button>
                </div>

                <form id="${CONFIG.formId}">
                    <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                        <h3 style="margin: 0 0 15px 0; font-size: 16px; color: #555;">👤 Datos del Tutor</h3>
                        <div style="margin-bottom: 12px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #555; font-size: 14px;">Nombre Completo *</label>
                            <input type="text" id="tutorNombre" required
                                   style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px;">
                        </div>
                        <div style="margin-bottom: 12px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #555; font-size: 14px;">Email *</label>
                            <input type="email" id="tutorEmail" required
                                   style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px;">
                        </div>
                        <div style="margin-bottom: 0;">
                            <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #555; font-size: 14px;">Teléfono</label>
                            <input type="tel" id="tutorTelefono"
                                   style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px;">
                        </div>
                    </div>

                    <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                        <h3 style="margin: 0 0 15px 0; font-size: 16px; color: #555;">🐕 Datos de la Mascota</h3>
                        <div style="margin-bottom: 12px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #555; font-size: 14px;">Nombre *</label>
                            <input type="text" id="mascotaNombre" required
                                   style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px;">
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                            <div>
                                <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #555; font-size: 14px;">Especie</label>
                                <select id="mascotaEspecie" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px;">
                                    <option value="Canino">Canino</option>
                                    <option value="Felino">Felino</option>
                                    <option value="Ave">Ave</option>
                                    <option value="Exótico">Exótico</option>
                                    <option value="Otro">Otro</option>
                                </select>
                            </div>
                            <div>
                                <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #555; font-size: 14px;">Edad</label>
                                <input type="text" id="mascotaEdad"
                                       style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px;">
                            </div>
                        </div>
                        <div style="margin-bottom: 0;">
                            <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #555; font-size: 14px;">Raza</label>
                            <input type="text" id="mascotaRaza"
                                   style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px;">
                        </div>
                    </div>

                    <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                        <h3 style="margin: 0 0 15px 0; font-size: 16px; color: #555;">🏥 Dictado Médico</h3>
                        <div style="margin-bottom: 0;">
                            <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #555; font-size: 14px;">Descripción de la Consulta *</label>
                            <textarea id="dictadoMedico" rows="4" required
                                      style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-family: inherit; font-size: 14px; resize: vertical;"
                                      placeholder="Ej: Paciente presenta tos nocturna y disnea de esfuerzo..."></textarea>
                        </div>
                    </div>

                    <button type="submit" style="
                        width: 100%;
                        padding: 14px;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        border: none;
                        border-radius: 8px;
                        font-size: 16px;
                        font-weight: bold;
                        cursor: pointer;
                        transition: transform 0.3s;
                    ">
                        🚀 Procesar Consulta
                    </button>
                </form>

                <div id="${CONFIG.resultadoId}" style="margin-top: 20px; display: none; padding: 15px; background: #f0f8ff; border-radius: 8px; border-left: 4px solid #667eea;"></div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.addEventListener('click', function (e) {
            if (e.target === this || e.target.closest('[data-accion="cerrar-modal"]')) {
                this.style.display = 'none';
            }
        });
    }

    function abrirModal() {
        const modal = document.getElementById(CONFIG.modalId);
        modal.style.display = 'flex';

        // Auto-scraping best-effort: si la SPA de MyVete tiene estos campos
        // en el DOM, precarga lo que encuentre. Si no hay nada, no rompe nada
        // (los campos quedan vacíos para carga manual).
        try {
            const selectores = {
                tutorNombre: ['[data-tutor-nombre]', 'input[name="tutor"]', 'input[name="nombre"]', '#tutor'],
                tutorEmail: ['[data-tutor-email]', 'input[name="email"]', '#email'],
                tutorTelefono: ['[data-tutor-telefono]', 'input[name="telefono"]', '#telefono'],
                mascotaNombre: ['[data-mascota-nombre]', 'input[name="mascota"]', 'input[name="paciente"]'],
            };

            for (const [campo, selectoresLista] of Object.entries(selectores)) {
                for (const selector of selectoresLista) {
                    const elemento = document.querySelector(selector);
                    if (elemento && elemento.value) {
                        document.getElementById(campo).value = elemento.value;
                        break;
                    }
                }
            }

            const emailInput = document.querySelector('input[type="email"]');
            if (emailInput && !document.getElementById('tutorEmail').value) {
                document.getElementById('tutorEmail').value = emailInput.value;
            }
        } catch (e) {
            // Silencio: no hay datos para auto-completar.
        }
    }

    // Construye el payload con el shape que el workflow real de n8n
    // efectivamente lee hoy (filiacion.tutor / filiacion.mascota /
    // consulta.anamnesis / consulta.diagnostico — ver n8n/README.md y
    // n8n/workflow_v4_current.json, nodo "IA - Estructurar Anamnesis").
    function armarPayload() {
        return {
            filiacion: {
                tutor: {
                    nombre: document.getElementById('tutorNombre').value.trim(),
                    email: document.getElementById('tutorEmail').value.trim(),
                    telefono: document.getElementById('tutorTelefono').value.trim() || null,
                },
                mascota: {
                    nombre: document.getElementById('mascotaNombre').value.trim(),
                    especie: document.getElementById('mascotaEspecie').value,
                    raza: document.getElementById('mascotaRaza').value.trim() || null,
                    edad: document.getElementById('mascotaEdad').value.trim() || null,
                },
            },
            consulta: {
                anamnesis: document.getElementById('dictadoMedico').value.trim(),
                diagnostico: '',
            },
        };
    }

    function renderizarBorradorMedico(borrador) {
        if (!borrador) {
            return '<p style="color:#999;">La IA no devolvió un borrador estructurado.</p>';
        }
        const filas = [
            ['Resumen', borrador.resumen_anamnesis],
            ['Diagnóstico sugerido', borrador.diagnostico_sugerido],
            ['Indicaciones sugeridas', borrador.indicaciones_sugeridas],
            ['Síntomas detectados', Array.isArray(borrador.sintomas_detectados) ? borrador.sintomas_detectados.join(', ') : borrador.sintomas_detectados],
            ['FC / FR', [borrador.fc, borrador.fr].filter((v) => v != null).join(' / ')],
            ['PAS / PAM / PAD', [borrador.pas, borrador.pam, borrador.pad].filter((v) => v != null).join(' / ')],
            ['Mucosas', borrador.mucosas],
            ['Cumplimiento tratamiento', borrador.cumplimiento_tratamiento],
        ].filter(([, valor]) => valor != null && valor !== '');

        return filas
            .map(([etiqueta, valor]) => `<p style="margin:6px 0;"><strong>${etiqueta}:</strong> ${valor}</p>`)
            .join('');
    }

    function setupForm() {
        const form = document.getElementById(CONFIG.formId);
        const resultado = document.getElementById(CONFIG.resultadoId);

        form.addEventListener('submit', async function (e) {
            e.preventDefault();

            resultado.style.display = 'block';
            resultado.innerHTML = `
                <div style="text-align: center; padding: 20px;">
                    <div style="display: inline-block; width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #667eea; border-radius: 50%; animation: myvete-spin 1s linear infinite;"></div>
                    <p style="margin-top: 10px; color: #666;">Procesando consulta...</p>
                </div>
                <style>
                    @keyframes myvete-spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                </style>
            `;

            const payload = armarPayload();

            try {
                const response = await fetch(CONFIG.webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });

                if (!response.ok) {
                    throw new Error(`Error ${response.status}: ${response.statusText}`);
                }

                const data = await response.json();

                resultado.innerHTML = `
                    <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; border-left: 4px solid #4caf50;">
                        <h3 style="margin: 0 0 10px 0; color: #2e7d32;">✅ ${data.message || 'Consulta procesada'}</h3>
                        ${renderizarBorradorMedico(data.borrador_medico)}
                        <button type="button" data-accion="nueva-consulta"
                                style="margin-top: 10px; padding: 8px 20px; background: #4caf50; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            Nueva Consulta
                        </button>
                    </div>
                `;
                resultado.querySelector('[data-accion="nueva-consulta"]').addEventListener('click', () => {
                    form.reset();
                    resultado.style.display = 'none';
                });
            } catch (error) {
                resultado.innerHTML = `
                    <div style="background: #ffebee; padding: 15px; border-radius: 8px; border-left: 4px solid #f44336;">
                        <h3 style="margin: 0 0 10px 0; color: #c62828;">❌ Error</h3>
                        <p>${error.message}</p>
                        <button type="button" data-accion="cerrar-resultado"
                                style="margin-top: 10px; padding: 8px 20px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            Cerrar
                        </button>
                    </div>
                `;
                resultado.querySelector('[data-accion="cerrar-resultado"]').addEventListener('click', () => {
                    resultado.style.display = 'none';
                });
                console.error('MyVete Error:', error);
            }
        });
    }

    function inicializar() {
        crearUI();
        setupForm();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inicializar);
    } else {
        inicializar();
    }
})();
