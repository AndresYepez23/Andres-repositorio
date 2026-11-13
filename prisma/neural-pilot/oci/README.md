# Desplegar Prisma Neural en Oracle Cloud

Guía del piloto aislado Qwen3.5-2B. No conecta el modelo a Prisma Core ni modifica producción.

## 1. Crear la VM

En OCI Console:

1. Abre **Compute → Instances → Create instance**.
2. Selecciona la región principal (*home region*) de tu cuenta.
3. Nombre sugerido: `prisma-neural-qwen-pilot`.
4. Imagen: **Ubuntu 24.04 ARM64**.
5. Shape: **VM.Standard.A1.Flex**.
6. Configuración inicial: **2 OCPU y 12 GB de memoria**.
7. Verifica que OCI muestre la etiqueta **Always Free-eligible** antes de crearla.
8. Usa un volumen de arranque de 47 GB y no añadas recursos facturables.
9. Añade tu clave pública SSH.
10. Asigna IP pública para administración SSH si la necesitas.

La cuota Always Free de Ampere A1 equivale a 2 OCPU y 12 GB de memoria al mes. La capacidad puede variar por región y dominio de disponibilidad. Si aparece `Out of host capacity`, espera o prueba otro dominio de disponibilidad de la misma región. No cambies a un shape facturable para resolverlo sin revisar el coste.

Documentación: [Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) y [Creating an instance](https://docs.oracle.com/en-us/iaas/Content/Compute/Tasks/launchinginstance.htm).

## 2. Reglas de red

En la subnet/NSG de la VM:

- Permite TCP 22 (SSH) únicamente desde tu IP pública actual.
- No abras TCP 7860.
- No abras puertos adicionales para el modelo.
- Mantén la salida HTTPS necesaria para descargar la imagen Docker y los pesos desde Hugging Face.

El servicio se publica únicamente en `127.0.0.1:7860`. El endpoint no debe quedar expuesto directamente a Internet.

Documentación: [OCI security lists](https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/securitylists.htm).

## 3. Conectarse e instalar Docker

Desde tu equipo:

```bash
ssh -i RUTA_A_TU_CLAVE ubuntu@IP_PUBLICA_DE_LA_VM
```

Copia la carpeta `prisma/neural-pilot` de esta rama a la VM. Si clonas el repositorio, usa esta rama:

```bash
git clone --branch feature/prisma-neural-oci-qwen35-pilot https://github.com/AndresYepez23/PRISMA.git
cd PRISMA/prisma/neural-pilot
```

Si el repositorio requiere autenticación, usa tu método SSH habitual de GitHub; no pegues tokens en comandos ni en este archivo.

Instala Docker y el plugin oficial de Compose:

```bash
bash oci/bootstrap.sh
sudo docker compose version
```

## 4. Crear el secreto

```bash
cp .env.example .env
openssl rand -hex 32
```

Copia el valor generado dentro de `.env`:

```dotenv
LLAMA_API_KEY=PEGA_AQUI_EL_SECRETO_GENERADO
```

Protege el archivo:

```bash
chmod 600 .env
```

No compartas el secreto ni lo subas a GitHub. El archivo está excluido por `.gitignore`.

## 5. Arrancar Qwen

```bash
sudo docker compose up -d
sudo docker compose logs -f qwen
```

En el primer arranque, llama.cpp descargará el GGUF Q4_K_M al caché persistente `./models/cache`. La descarga puede tardar según la conexión. Los siguientes arranques reutilizan el archivo.

Comprueba el estado desde la propia VM:

```bash
curl -fsS http://127.0.0.1:7860/health
```

Debe responder con estado `ok` cuando el modelo haya terminado de cargar.

## 6. Ejecutar el benchmark

```bash
set -a
. ./.env
set +a
python3 benchmark.py --url http://127.0.0.1:7860
```

Evalúa las respuestas manualmente y guarda los tiempos. Repite la prueba tras el primer arranque para comparar latencia en frío y caliente.

## 7. Probar desde tu PC sin publicar el endpoint

Deja la VM activa y abre un segundo terminal en tu PC:

```bash
ssh -i RUTA_A_TU_CLAVE -L 7860:127.0.0.1:7860 ubuntu@IP_PUBLICA_DE_LA_VM
```

Mientras esa sesión SSH permanezca abierta, tu PC puede probar `http://127.0.0.1:7860`. No necesitas abrir el puerto 7860 en OCI.

## 8. Conexión futura con Prisma Space

Después de aprobar rendimiento y estabilidad:

1. Crear un Cloudflare Tunnel con un hostname de un dominio que controles en Cloudflare.
2. Publicar el servicio local `http://localhost:7860` mediante el túnel; no abrir puertos de entrada para el modelo.
3. Guardar la clave Bearer como secreto del Worker de Prisma, nunca en JavaScript del navegador.
4. Hacer que Prisma Core consulte el Worker y aplicar cuotas, timeouts, límites de tokens y rate limiting.
5. Mantener Qwen como motor opcional y aislado, con fallback a los proveedores actuales.

Cloudflare Tunnel permite conectar servicios privados sin exponer la VM con puertos de entrada: [documentación oficial](https://developers.cloudflare.com/tunnel/).

## 9. Límites del piloto

- CPU solamente; no hay GPU en esta configuración Always Free.
- Una solicitud simultánea por instancia.
- Contexto inicial de 4096 tokens y salida limitada a 256 tokens.
- No usar datos clínicos, mensajes privados ni secretos durante la evaluación.
- No habilitar herramientas, MCP ni ejecución automática de acciones.
- No integrar tráfico de usuarios hasta validar calidad, latencia, seguridad y coste.
