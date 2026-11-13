# Prompt portátil para la cuenta nueva de Codex

Copiar el bloque siguiente. Los documentos del repositorio son la fuente de estado; no necesita la conversación anterior ni contiene secretos.

```text
Continúa la misión de finalización de Queen, inteligencia coordinadora de Prisma Core en Prisma Space. Esta es una transferencia de trabajo, no un reinicio, cierre ni declaración de que Queen está terminada.

Repositorio AndresYepez23/PRISMA, rama feature/prisma-neural-genixnode-qwen35-pilot, PR #125 abierto y draft, sin fusionar. Verifica HEAD remoto y cambios locales antes de actuar; el checkpoint de código/evidencia previo al handoff es 732bce69297a092008b68f1a0439592cb90173ed. Recupera el commit de transferencia desde el historial de prisma/docs/QUEEN-HANDOFF.md y el PR; no fuerces un SHA antiguo si la rama avanzó.

Lee primero prisma/docs/QUEEN-HANDOFF.md, luego el bloque vigente de QUEEN-CONTINUITY.md y QUEEN-INDEX.md. Lee los informes queen-genix-residency-2026-11-13.md y queen-genix-diagnosis-2026-11-13.md; después consulta únicamente archivos necesarios para el siguiente problema. Las capturas originales y análisis ya están publicados. No repetir auditorías, instalaciones, capturas pasivas, sonda fallida ni baterías ya conservadas sin motivo concreto.

Los datos del VPS confirman RAM3.824GiB, anónimoQwen2.915GiB, RSS3.142GiB, disponible mínimo pasivo436.55MiB y candidato mapeado1.183GiB con RSS/PSS228.98MiB. Historial:26,241,301 refaults,83,210 fallos mayores,54,820,431 pgscan,26,556,371 pgsteal. No hay límite explícito local de memoria que levantar. El timeout local histórico55,060ms se asoció a iowait hasta81% y ~5.792GiB de lecturas; los contadores posteriores acumulados no prueban por sí solos su causalidad ni cronología. Otra captura pasiva no resuelve esa brecha. No se aplicó intervención ni se demostró recuperación.

Tu primer trabajo es preparar una intervención técnica concreta y reversible para recuperar generación conservando Qwen3.5-2B-Q4_K_M y calidad si resulta viable: configuración, consumo estimado/supuestos, coste si procede, riesgos, reversión y validación. Solicita aprobación explícita del usuario ANTES de modificar/reiniciar/reinstalar GenixNode. No ejecutes inferencias mientras siga la pausa expresa; una prueba posterior debe estar autorizada. No hagas de la investigación un fin: después de recuperar generación, completa las pruebas operativas pendientes.

Mantén inicialmente contexto2048, salida256, concurrencia1, inferencia55s, tarea120s, ocho pasos/dos inferencias Queen; especialistas contabilizados aparte. No eludas presupuestos con checkpoints artificiales. Último despliegue aislado16436df0 corresponde a ed94e25 limpio, NO al HEAD corregido.

Después de aprobación/recuperación: snapshot limpio del HEAD solo en Production de prisma-queen-staging, D1 aislada980bad8f-0356-48b9-87bc-56bcf363f69a; prueba pequeña autorizada,19casos preparados y cadenas auténticas PDF→página concreta→Word, escaneo→OCR→extracción→Excel, JSON, reparación y delegación. Comprueba contenido y artefactos intermedios; conserva fallos/parciales y consumo desconocido. Separa inferencias reales, motores con planes deterministas, fixtures y preparación offline. El 8/8 histórico de intención no es prueba de finalización ni calidad general.

No fusionar PR125, escribir main, desplegar/configurar prismaspace ni escribir/migrar D1principal e02104b5-0861-475a-a60f-7658439d4fe0. No cambiar modelo sin comparación justificada. No modificar motores/proveedores para pasar benchmarks. No trabajar en Prisma Developer ni plugin de ChatGPT. Los tres secretos Queen ya están en Production aislado: no pedir duplicarlos en Preview ni solicitar valores por chat. OAuth/SSH/clave privada de operador no se transfieren por Git: sigue el procedimiento de acceso del handoff. Antes/después de push controla únicamente Previews propios de rama/SHA, nunca canonical/producción/trabajo ajeno; el prefijo de omisión no garantiza nada.

Conserva checkpoints verificables en la misma rama, documentación/PR draft y la misión hasta demostrar coordinación útil, recuperación y límites reales. No declarar Queen terminada mientras falten esas pruebas.
```
