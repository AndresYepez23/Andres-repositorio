---
title: Prisma Neural ZeroGPU Pilot
emoji: 🧠
colorFrom: purple
colorTo: indigo
sdk: gradio
app_file: app.py
pinned: false
license: apache-2.0
---

# Prisma Neural — prueba ZeroGPU sin APIs de inferencia

Este proyecto es **solo una prueba interactiva**, sin integración con el chat público de Prisma y sin capacidades de ejecutar herramientas. Ejecuta el modelo abierto `Qwen/Qwen3.5-2B` en el servidor de Hugging Face (PyTorch + ZeroGPU), no en el dispositivo del usuario.

## Activación gratis

Solo cuentas personales en buen estado (email verificado, antigüedad superior a 30 días) pueden alojar hasta 2 ZeroGPU Spaces gratis. Crear un Space Gradio CPU Basic ordinario requiere suscripción, aunque diga coste horario cero. En Settings > Hardware elige **ZeroGPU** antes de ejecutarlo. **No actives GPU dedicada ni facturación.**

ZeroGPU está limitado por cuotas de usuario, colas y tiempos máximos. No es un backend de producción gratuito, continuo e ilimitado para Prisma Core.

## Cómo desplegar el piloto

Crea un Space Gradio en tu propia cuenta con hardware ZeroGPU y copia aquí estos tres archivos (`README.md`, `app.py` y `requirements.txt`) a la raíz del Space. La versión Docker de la carpeta superior NO funciona en ZeroGPU, que exige Gradio/PyTorch.

En el primer uso Hugging Face descargará los pesos del modelo a **su servidor**, no a los dispositivos de los visitantes. El modelo completo en BF16 utiliza más RAM que el GGUF cuantizado del piloto Docker. La aplicación limita tokens, contexto y uso por llamada para controlar latencia y cuota; no garantiza completar todos los turnos dentro del tiempo permitido.

Si no se puede obtener ZeroGPU gratis, no pagues ni sustituyas el backend de Prisma; usa la versión Docker solamente en hardware propio o donado y conserva la PR en borrador.

## Seguridad

Es un demo público. No pegues claves, datos clínicos, mensajes privados ni información sensible en este prototipo. Las salidas no son instrucciones ejecutables. Para producción habría que implementar autenticación, aislamiento, límites, verificación de acciones y una pasarela servidor-servidor.
