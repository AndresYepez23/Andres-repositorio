# Verificación real de Queen

`summary.json` resume las inferencias reales; `comparison-review.json` corrige las
conclusiones demasiado permisivas del primer comparador. Los informes conservan
solicitudes, respuestas, consumo, trazas y hashes. Las pruebas unitarias usan dobles
y no cuentan como inferencias reales.

El operador autenticado llama al planificador Queen en `prisma-queen-staging`, con
D1 aislada y archivos sintéticos. Chromium ejecuta los motores existentes sobre
bytes reales. Queen recibe metadatos y texto, decide herramientas y referencias;
los motores locales generan los archivos. No se ejecutó ningún especialista.
Estas llamadas forzadas no prueban activación automática en la interfaz pública.

Resultado comprobado: al extraer una página y convertir **el PDF original** a
Word, Queen conserva las tres páginas; el flujo local convierte solo la extraída.
La aclaración de dimensiones y la dependencia real entre operaciones JSON también
se verificaron después de corregirlas. `artifact-review.json` analiza los bytes
guardados. Los DOCX, PDF y TXT adjuntos permiten revisar el contenido.

Límites: la solicitud «hoja intermedia» produjo un plan inválido; forzar Queen en
DOCX→TXT también falló. La ruta ordinaria eligió correctamente Core local, con cero
inferencias. WebP conserva formato y dimensiones, pero el control de eliminación
de metadatos es parcial porque la imagen no contenía metadatos etiquetados.

`production-observation.json` registra una discrepancia del despliegue público
observada durante el trabajo. Este PR no se fusionó ni desplegó en producción.
