# Prisma Neural Engine — OCI Qwen Pilot

**Estado:** piloto aislado; no conectado a Prisma Core ni a producción.  
**Rama:** `feature/prisma-neural-oci-qwen35-pilot`  
**Modelo:** Qwen3.5-2B GGUF Q4_K_M, desde `unsloth/Qwen3.5-2B-GGUF`.  
**Runtime:** llama.cpp, CPU ARM64.  
**Objetivo inicial:** validar inferencia real, latencia, memoria y estabilidad en Oracle Cloud Infrastructure.

## Decisiones de arquitectura

- El modelo se descarga y permanece en el servidor OCI. Los visitantes de Prisma Space nunca descargan pesos ni instalan software.
- Primera configuración objetivo: OCI Ampere A1 Always Free, 2 OCPU y 12 GB de RAM, si la consola muestra la etiqueta Always Free y existe capacidad en la región principal.
- GGUF Q4_K_M ocupa aproximadamente 1,28 GB. Se ejecuta en CPU; no necesita GPU.
- llama.cpp expone una API compatible con OpenAI en `/v1/chat/completions`.
- Una sola ranura de inferencia (`--parallel 1`) para limitar consumo y evitar sobrecargar la VM.
- El puerto 7860 queda enlazado a `127.0.0.1`; no debe abrirse al Internet desde las reglas de red de OCI.
- La autenticación Bearer es obligatoria mediante `LLAMA_API_KEY`.
- El caché del modelo se conserva en `./models/cache`, fuera del contenedor.
- Este piloto es solo texto. No activa visión, herramientas, MCP ni ejecución de acciones.

## Despliegue

Consulta [oci/README.md](oci/README.md) para crear la VM, instalar Docker, configurar la clave y arrancar el servidor.

## Pruebas

En la VM, desde esta carpeta:

```bash
cp .env.example .env
# Edita .env y sustituye la clave de ejemplo por una clave aleatoria larga.
chmod 600 .env
sudo docker compose up -d
sudo docker compose logs -f qwen
```

Comprueba el estado:

```bash
curl -fsS http://127.0.0.1:7860/health
```

Ejecuta el benchmark:

```bash
set -a
. ./.env
set +a
python3 benchmark.py --url http://127.0.0.1:7860
```

El benchmark mide latencia y muestra las respuestas para evaluación manual. No produce una puntuación automática de inteligencia.

## Antes de integrar con Prisma Core

No se debe fusionar ni enviar tráfico real hasta completar:

1. Arranque real en OCI ARM64 y descarga persistente del modelo.
2. Benchmark de latencia en frío y en caliente.
3. Pruebas de memoria y estabilidad durante varias horas.
4. Pruebas de concurrencia, límites de tokens y timeouts.
5. Pasarela servidor-servidor con secreto guardado en Cloudflare, nunca en el navegador.
6. Cuotas por usuario, rate limiting, validación de payloads y observabilidad sin registrar prompts privados.
7. Evaluación de calidad en español y comparación contra los proveedores existentes.

Las propuestas de herramientas que genere el modelo nunca son permisos para ejecutarlas. La autorización y ejecución determinista siguen perteneciendo a Prisma Core.

## Licencia y atribución

Este piloto no es un modelo entrenado por Prisma. Conserva los avisos de licencia y atribución del modelo y de llama.cpp, y revisa sus términos antes de redistribuir pesos o imágenes.

## Referencias

- [Oracle Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
- [Qwen3.5-2B GGUF](https://huggingface.co/unsloth/Qwen3.5-2B-GGUF)
- [llama.cpp Docker images](https://github.com/ggml-org/llama.cpp/blob/master/docs/docker.md)
- [llama.cpp server options](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)
- [Cloudflare Tunnel](https://developers.cloudflare.com/tunnel/)
