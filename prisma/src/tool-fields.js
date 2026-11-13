// Shared field definitions for the existing UI and machine-readable contracts.
export function renderToolFields(t,{field,textareaField,selectField,pollinationsAuthFields=()=>'',textStudioModelSettings=()=>''}={}){
  switch(t.id){
    case 'json-compare-local':return textareaField('JSON original','textA','{"estado":"borrador","version":1}','Primera versión de los datos.')+textareaField('JSON modificado','textB','{"estado":"publicado","version":2}','Segunda versión de los datos.');
    case 'citation-ids-local':return textareaField('Texto de un artículo, bibliografía o apuntes','text','','Identifica DOI, PMID y arXiv. Los enlaces no se verifican por internet.');
    case 'ai-compare-options':return textareaField('Opciones que quieres comparar','prompt','','Describe alternativas y criterios, por ejemplo costos, privacidad, velocidad y límites.')+textStudioModelSettings();
    case 'ai-action-plan':return textareaField('Objetivo que quieres conseguir','prompt','','Describe el resultado esperado, restricciones y recursos disponibles.')+textStudioModelSettings();
    case 'ai-text-review':return textareaField('Texto que quieres revisar','prompt','','Pega el borrador e indica si quieres detectar errores, mejorar claridad o reescribirlo.')+textStudioModelSettings();
    case 'pdf-form-fields':return '<div class="tool-hint">Muestra únicamente el nombre y tipo de los campos del formulario. Por privacidad no extrae respuestas ni datos personales.</div>';
    case 'pdf-form-flatten':return '<div class="tool-hint">Fija los campos existentes como contenido visual. Después de esta operación ya no se podrán editar como formulario. Guarda una copia del PDF original.</div>';
    case 'pdf-add-blank':return field('Cuántas páginas añadir','count','number','1','Entre 1 y 10 páginas.','min="1" max="10"')+selectField('Ubicación','position',[['end','Al final'],['start','Al principio']],'end');
    case 'image-identify-local':return '<div class="tool-hint">Modelo gratuito ViT ONNX de Hugging Face ejecutado en el dispositivo. La primera vez descarga un modelo de aproximadamente 50–90 MB. Puede tardar en móviles y sus etiquetas están en inglés. No identifica personas.</div>';
    case 'csv-profile-local':return selectField('Separador CSV','delimiter',[['auto','Detectar automáticamente'],[',','Coma'],[';','Punto y coma'],['\t','Tabulación']],'auto')+'<div class="tool-hint">Revisa celdas vacías, cantidad de valores únicos, tipos probables y filas duplicadas sin enviar el archivo.</div>';
    case 'json-schema-validate':return textareaField('Datos JSON','text','{"id":1,"nombre":"Prisma"}','Pega el contenido JSON que quieres validar.')+textareaField('JSON Schema','schema','{"type":"object","required":["id"],"properties":{"id":{"type":"integer"}}}','AJV comprueba los datos con las reglas de tu esquema. Todo ocurre en el navegador.');
    case 'table-file-convert':return selectField('Formato de destino','output',[['auto','Automático según origen'],['csv','CSV'],['json','JSON'],['xlsx','Excel (.xlsx)']],'auto')+
      selectField('Hoja de Excel','sheet',[['0','Primera hoja'],['all','Todas las hojas (solo JSON)']],'0')+
      '<div class="tool-hint">Acepta CSV, JSON y Excel XLS/XLSX. Procesa los datos en el navegador y genera el archivo convertido.</div>';
    case 'text-file-convert':return selectField('Formato de destino','output',[['pdf','PDF de texto'],['docx','Word editable (.docx)'],['txt','Texto (.txt)'],['html','Página HTML (.html)']],'pdf')+
      '<div class="tool-hint">TXT, Markdown, HTML y Word DOCX. Conserva el texto; el diseño y las imágenes del original pueden simplificarse.</div>';
    case 'pdf-split':return selectField('Cómo quieres dividir el PDF','mode',[
      ['all','Cada página por separado'],
      ['selected','Elegir páginas concretas'],
      ['ranges','Crear un PDF por rango'],
      ['parts','Dividir en un número de partes'],
      ['chunk','Agrupar cada N páginas']
     ],'all')+
      field('Páginas específicas','pages','text','','Ejemplo: 2, 4-6. Se crea un PDF por página.')+
      field('Rangos independientes','ranges','text','','Ejemplo: 1-3; 4-6; 8-10. Cada rango es un PDF.')+
      field('Número de partes','parts','number','2','Entre 2 y 20, sin superar el número de páginas.','min="2" max="20" step="1"')+
      field('Páginas por bloque','chunkSize','number','3','Cada bloque contiene páginas consecutivas.','min="1" max="200" step="1"')+
      '<div class="tool-hint" id="pdf-split-preview" aria-live="polite">Selecciona un PDF para revisar las páginas y preparar la división.</div>'+
      '<div class="tool-hint">Funciona sin API. Los archivos seleccionados se descargan como PDF o en un ZIP. El original se conserva.</div>';
    case 'pdf-compress':return '<div class="tool-hint">Optimiza la estructura interna del PDF sin convertir las páginas en imágenes. No necesita API y conserva el texto seleccionable. La reducción depende del documento; si el peso está en fotografías, esta técnica puede no reducirlo. La compresión avanzada de imágenes se incorporará por separado.</div>';
    case 'pdf-to-word':return '<div class="tool-hint">Convierte PDF digitales con texto seleccionable en un archivo DOCX editable. No requiere cuenta ni API: el procesamiento ocurre en tu navegador. Los PDFs escaneados necesitan OCR y la maquetación compleja puede requerir ajustes en Word.</div>';
    case 'docx-pdf':return '<div class="tool-hint">Prisma Space convertirá el documento a una vista HTML de impresión. Desde la ventana que se abre, selecciona <strong>Guardar como PDF</strong> en el diálogo de impresión del navegador. El diseño puede variar respecto a Microsoft Word.</div>';
    case 'image-blur':return field('Intensidad del desenfoque (px)','blur','number','5','','min="1" max="30"');
    case 'image-adjust':return '<div class="inline-fields">'+field('Brillo (%)','brightness','number','110','','min="10" max="200"')+field('Contraste (%)','contrast','number','110','','min="10" max="200"')+'</div>';
    case 'image-rounded':return field('Radio de esquina (px)','radius','number','48','','min="0" max="500"')+field('Tamaño máximo (px)','maxSize','number','1600','Limita el tamaño del PNG exportado.','min="128" max="5000"');
    case 'image-metadata':return '<div class="tool-hint">Lee dimensiones y metadatos EXIF que estén presentes. Algunas plataformas eliminan estos datos al compartir imágenes.</div>';
    case 'audio-waveform':return selectField('Color de la onda','color',[['#9adbd2','Turquesa'],['#a9a0ee','Lavanda'],['#ffffff','Blanco'],['#f0b77a','Ámbar']],'#9adbd2');
    case 'hash-file':return '<div class="tool-hint">Calcula SHA-256 directamente en tu navegador. El archivo no se sube a Prisma Space.</div>';
    case 'github-discover':return textareaField('¿Qué tipo de proyecto buscas?','query','open source AI tools','Describe la tecnología o el problema que quieres resolver.')+
      selectField('Lenguaje','language',[['any','Cualquier lenguaje'],['javascript','JavaScript'],['typescript','TypeScript'],['python','Python'],['rust','Rust'],['go','Go']],'any')+
      selectField('Ordenar resultados','sort',[['stars','Más estrellas'],['updated','Actualizados recientemente'],['forks','Más bifurcaciones']],'stars')+
      selectField('Cantidad de resultados','limit',[['5','5 proyectos'],['10','10 proyectos'],['20','20 proyectos']],'10')+
      '<div class="tool-hint">Consulta repositorios públicos de GitHub. No necesita token para búsquedas públicas, pero GitHub aplica límites por IP.</div>';
    case 'api-explorer':return selectField('Ejemplo para probar','preset',[['github-repo','GitHub · repositorio público'],['github-search','GitHub · proyectos open source'],['jsonplaceholder','JSONPlaceholder · datos de prueba'],['open-meteo','Open-Meteo · datos meteorológicos'],['custom','Mi propia API pública']],'github-repo')+
      field('URL pública (solo lectura)','url','url','https://api.github.com/repos/AndresYepez23/PRISMA','Solo HTTPS y endpoints públicos. No pegues claves API, contraseñas ni datos privados.')+
      selectField('Cómo mostrar la respuesta','format',[['json','JSON organizado'],['text','Texto sin formato'],['raw','Respuesta original']],'json')+
      '<div class="tool-hint">Prisma intentará consultar la API directamente. Si el navegador bloquea el acceso por CORS, probará cors.dev para una lectura pública GET. No se envían credenciales ni cookies.</div>';
    case 'jwt-decode':return textareaField('Token JWT','token','','Pega el token completo. Prisma Space solo decodifica su contenido: no valida firma, emisor ni vencimiento.');
    case 'regex-test':return field('Expresión regular','pattern','text','\\bPrisma Space\\b','No incluyas las barras /.../.','maxlength="200"')+field('Flags','flags','text','gi','Flags permitidos: g, i, m, s, u.','maxlength="5"')+textareaField('Texto de prueba','text','Prisma Space reúne herramientas. Prisma es un espacio digital.');
    case 'json-yaml':return textareaField('Contenido','text','nombre: Prisma Space\\nversion: 1','Pega JSON o YAML.')+selectField('Conversión','mode',[['json-to-yaml','JSON a YAML'],['yaml-to-json','YAML a JSON']],'json-to-yaml');
    case 'excel-json':return selectField('Hoja','sheet',[['0','Primera hoja'],['all','Todas las hojas']],'0')+selectField('Formato de salida','format',[['json','JSON'],['csv','CSV']],'json');
    case 'css-gradient':return '<div class="inline-fields">'+field('Color inicial','color1','color','#9adbd2')+field('Color final','color2','color','#a9a0ee')+'</div>'+field('Ángulo (grados)','angle','number','135','','min="0" max="360"')+selectField('Tipo','type',[['linear','Lineal'],['radial','Radial']],'linear');
    case 'text-diff':return textareaField('Texto original','textA','','Pega aquí la primera versión.')+textareaField('Texto modificado','textB','','Pega aquí la segunda versión.');
    case 'pdf-extract':return field('Páginas que deseas conservar','pages','text','1-3','Ejemplos: 1, 3, 5-8. La numeración comienza en 1.');
    case 'pdf-remove-pages':return field('Páginas que deseas eliminar','pages','text','2, 4-5','Ejemplos: 2, 4-5. Las páginas restantes se conservarán.');
    case 'pdf-page-numbers':return selectField('Ubicación de la numeración','position',[['bottom','Inferior'],['top','Superior']],'bottom');
    case 'pdf-to-image':return field('Páginas (opcional)','pages','text','','Vacío = todas las páginas. Ejemplo: 1-3, 5.')+
      selectField('Formato','format',[['png','PNG · sin pérdida'],['jpeg','JPG · menor tamaño']],'png')+
      selectField('Resolución','scale',[['1','Estándar'],['1.5','Alta (recomendada)'],['2','Muy alta']],'1.5')+
      '<div class="tool-hint">Descarga un ZIP con una imagen por página.</div>';
    case 'pdf-text':return '<div class="tool-hint">Extrae texto de PDFs digitales. Si el documento es un escaneo o una fotografía, utiliza OCR en la categoría Imágenes.</div>';
    case 'pdf-rotate':return selectField('Rotación','degrees',[['90','90° a la derecha'],['180','180°'],['270','90° a la izquierda']],'90');
    case 'pdf-watermark':return field('Texto de la marca de agua','watermark','text','Prisma Space','Se aplicará en diagonal y con transparencia.');
    case 'image-pdf':return selectField('Tamaño de página','pageSize',[['a4','A4'],['letter','Carta'],['fit','Ajustar a la imagen']],'a4');
    case 'image-compress':return '<div class="inline-fields">'+field('Calidad','quality','number','78','Entre 10 y 100.','min="10" max="100"')+selectField('Formato de salida','format',[['image/webp','WebP (recomendado)'],['image/jpeg','JPG']],'image/webp')+'</div>';
    case 'image-resize':return '<div class="inline-fields">'+field('Ancho (px)','width','number','1200','Ancho final.','min="1" max="12000"')+field('Alto (px)','height','number','800','Alto final.','min="1" max="12000"')+'</div><label class="check-line"><input type="checkbox" name="keep" checked> Mantener proporción original</label>';
    case 'image-convert':return selectField('Formato de salida','format',[['image/png','PNG'],['image/jpeg','JPG'],['image/webp','WebP']],'image/webp');
    case 'image-crop':return '<div class="inline-fields">'+field('Ancho del recorte (%)','widthPct','number','80','Porcentaje del ancho.','min="10" max="100"')+field('Alto del recorte (%)','heightPct','number','80','Porcentaje del alto.','min="10" max="100"')+'</div><div class="tool-hint">Se realiza un recorte centrado. Para edición libre con selección visual añadiremos un editor dedicado.</div>';
    case 'image-gen':return selectField('Motor de imagen','provider',[['auto','Automático · recomendado'],['cloudflare','Cloudflare FLUX · gratis con límite'],['pollinations','Pollinations · cuenta personal'],['huggingface','Hugging Face · créditos limitados']],'auto')+
      selectField('Modelo de imagen','model',[['','Automático · modelo recomendado']],'')+
      selectField('Calidad','qualityProfile',[['fast','Más rápido'],['balanced','Equilibrado'],['high','Mayor detalle']],'balanced')+
      textareaField('Describe la imagen que quieres crear','prompt','','Describe sujeto, ambiente, composición, iluminación y estilo.')+
      selectField('Estilo visual','style',[['photo','Fotografía realista'],['cinematic','Cinematográfico'],['illustration','Ilustración editorial'],['3d','Render 3D'],['anime','Anime'],['product','Fotografía de producto']],'photo')+
      selectField('Formato','ratio',[['square','Cuadrado · 1:1'],['landscape','Horizontal · 4:3'],['portrait','Vertical · 3:4'],['wide','Panorámico · 16:9']],'square')+
      field('Semilla (opcional)','seed','number','','Usa el mismo número para intentar reproducir una composición.','min="0" step="1"')+
      textareaField('Elementos que quieres evitar (opcional)','negativePrompt','','Elementos que prefieres evitar.')+
      '<div class="tool-hint workflow-provider-notice" id="tool-provider-notice"></div><button type="button" class="mini-button" id="open-ai-settings">Gestionar conexiones</button>';
    case 'ai-youtube-kit':return textareaField('Tema de tu vídeo o publicación','prompt','','Describe tu idea, público objetivo y plataforma.')+
      selectField('Motor de texto','provider',[['auto','Automático'],['gemini','Gemini'],['groq','Groq'],['cloudflare','Cloudflare'],['pollinations','Pollinations']],'auto')+
      selectField('Detalle','reasoning',[['balanced','Equilibrado'],['smart','Avanzado']],'balanced')+
      selectField('Modelo específico (opcional)','model',[['','Automático · recomendado']],'')+
      '<div class="tool-hint workflow-provider-notice" id="tool-provider-notice"></div><button type="button" class="mini-button" id="open-ai-settings">Gestionar conexiones</button>';
    case 'ai-prompt-lab':return textareaField('Qué quieres conseguir con la IA','prompt','','Escribe una idea y para qué motor o formato quieres el prompt.')+
      selectField('Motor de texto','provider',[['auto','Automático'],['gemini','Gemini'],['groq','Groq'],['cloudflare','Cloudflare'],['pollinations','Pollinations']],'auto')+
      selectField('Modelo específico (opcional)','model',[['','Automático · recomendado']],'')+
      '<div class="tool-hint workflow-provider-notice" id="tool-provider-notice"></div><button type="button" class="mini-button" id="open-ai-settings">Gestionar conexiones</button>';
    case 'ai-study-notes':return textareaField('Tema o apuntes de estudio','prompt','','Pega tus apuntes o describe el tema para obtener guía y preguntas de repaso.')+
      selectField('Motor de texto','provider',[['auto','Automático'],['gemini','Gemini'],['groq','Groq'],['cloudflare','Cloudflare'],['pollinations','Pollinations']],'auto')+
      selectField('Modelo específico (opcional)','model',[['','Automático · recomendado']],'')+
      '<div class="tool-hint workflow-provider-notice" id="tool-provider-notice"></div><button type="button" class="mini-button" id="open-ai-settings">Gestionar conexiones</button>';
    case 'ai-code-helper':return textareaField('Código o tarea de programación','prompt','','Pega código, describe el error o explica qué función necesitas.')+
      selectField('Motor de texto','provider',[['auto','Automático'],['gemini','Gemini'],['groq','Groq'],['cloudflare','Cloudflare'],['pollinations','Pollinations']],'auto')+
      selectField('Modelo específico (opcional)','model',[['','Automático · recomendado']],'')+
      '<div class="tool-hint workflow-provider-notice" id="tool-provider-notice"></div><button type="button" class="mini-button" id="open-ai-settings">Gestionar conexiones</button>';
    case 'music-lyrics':return textareaField('Idea, tema o historia de la canción','prompt','','Describe el mensaje, género musical, emoción, idioma y detalles que quieras incluir.')+
      selectField('Motor de texto','provider',[['auto','Automático · recomendado'],['gemini','Google Gemini'],['cloudflare','Cloudflare Workers AI'],['groq','Groq'],['huggingface','Hugging Face'],['pollinations','Pollinations · personal']],'auto')+
      selectField('Modelo específico','model',[['','Automático · según la tarea']],'')+
      selectField('Capacidad de composición','reasoning',[['balanced','Equilibrada'],['smart','Avanzada · recomendada']],'smart')+
      '<div class="tool-hint">Entrega letra original, estructura y dirección musical. No genera todavía un archivo de audio; el motor de música se conectará en una siguiente fase.</div><div class="tool-hint workflow-provider-notice" id="tool-provider-notice"></div><button type="button" class="mini-button" id="open-ai-settings">Gestionar conexiones</button>';
    case 'ai-assistant':return textareaField('¿Qué necesitas crear o resolver?','prompt','','Ejemplo: redacta una descripción profesional para un producto...')+
      selectField('Motor de texto','provider',[['auto','Automático · recomendado'],['gemini','Google Gemini'],['cloudflare','Cloudflare Workers AI'],['groq','Groq'],['huggingface','Hugging Face'],['pollinations','Pollinations · personal']],'auto')+
      selectField('Modelo específico','model',[['','Automático · según complejidad']],'')+
      selectField('Capacidad del modelo','reasoning',[['fast','Rápido · menor latencia'],['balanced','Equilibrado · recomendado'],['smart','Avanzado · mejor razonamiento']],'balanced')+
      selectField('Tono','tone',[['professional','Profesional'],['friendly','Cercano'],['creative','Creativo'],['academic','Académico'],['concise','Directo y breve']],'professional')+
      selectField('Extensión','length',[['short','Breve'],['medium','Media'],['long','Detallada']],'medium')+
      textareaField('Contexto adicional (opcional)','context','','Añade datos que el modelo deba tener en cuenta.')+
      '<div class="tool-hint workflow-provider-notice" id="tool-provider-notice"></div><button type="button" class="mini-button" id="open-ai-settings">Gestionar conexiones</button>';
    case 'ai-voice':return textareaField('Texto que quieres convertir en voz','prompt','','Escribe hasta 1.500 caracteres. Prisma generará un archivo reproducible y descargable.')+
      selectField('Motor de voz','provider',[['auto','Automático · conexión central y respaldo personal'],['personal','Mi cuenta Pollinations']],'auto')+
      selectField('Modelo de voz','model',[['openai/tts-1','TTS estándar · recomendado'],['openai/tts-1-hd','TTS alta calidad · puede gastar más saldo']],'openai/tts-1')+
      selectField('Voz','voice',[['nova','Nova · femenina'],['alloy','Alloy · neutra'],['echo','Echo · masculina'],['shimmer','Shimmer · femenina'],['onyx','Onyx · masculina'],['fable','Fable']],'nova')+
      selectField('Formato de audio','format',[['mp3','MP3 · recomendado'],['wav','WAV'],['opus','Opus']],'mp3')+
      '<div class="tool-hint" id="voice-provider-notice">Automático utiliza primero la conexión central de Prisma, con cuotas gratuitas estrictas. Si falla, puede utilizar tu cuenta de Pollinations autorizada; su saldo solo se consume dentro del presupuesto que configuraste.</div>'+
      pollinationsAuthFields();
    case 'ai-transcribe':return selectField('Motor de transcripción','provider',[['auto','Automático · recomendado'],['groq','Groq Whisper Turbo · central'],['cloudflare','Cloudflare Whisper · respaldo limitado'],['huggingface','Hugging Face · créditos limitados'],['pollinations','Pollinations · cuenta personal']],'auto')+
      selectField('Modelo de transcripción','model',[['','Automático · según motor']],'')+
      selectField('Idioma','language',[['es','Español'],['en','Inglés'],['auto','Detectar automáticamente']],'es')+
      '<div class="tool-hint">Automático: usa Groq Whisper y luego Cloudflare Whisper como respaldo de hasta tres audios compartidos al día. Hugging Face requiere activar créditos multimedia y Pollinations usa una cuenta autorizada.</div>';
    case 'image-watermark':return field('Texto de la marca','watermark','text','Prisma Space','Puedes usar tu nombre, marca o sitio web.')+selectField('Ubicación','position',[['bottom-right','Abajo a la derecha'],['bottom-left','Abajo a la izquierda'],['top-right','Arriba a la derecha'],['top-left','Arriba a la izquierda'],['center','Centro']],'bottom-right')+field('Tamaño (px)','size','number','36','','min="12" max="180"')+field('Opacidad (%)','opacity','number','45','Entre 8 y 90.','min="8" max="90"')+selectField('Color','color',[['#ffffff','Blanco'],['#111827','Negro'],['#9adbd2','Turquesa'],['#ffffff','Blanco']],'#ffffff');
    case 'image-flip':return selectField('Dirección','direction',[['horizontal','Horizontal'],['vertical','Vertical']],'horizontal');
    case 'image-collage':return selectField('Fondo del mosaico','background',[['#ffffff','Blanco'],['#101218','Oscuro'],['#9adbd2','Turquesa claro']],'#ffffff');
    case 'image-ocr':return selectField('Idioma del documento','language',[['spa','Español'],['eng','Inglés'],['spa+eng','Español e inglés']],'spa','La primera ejecución descarga los datos de idioma.');
    case 'video-trim':return '<div class="inline-fields">'+field('Inicio (segundos)','start','number','0','Desde qué segundo iniciar.','min="0" step="0.1"')+field('Duración (segundos)','duration','number','10','Duración del fragmento.','min="0.1" step="0.1"')+'</div>';
    case 'video-thumbnail':return field('Segundo del video','second','number','1','Elige el instante que quieres capturar.','min="0" step="0.1"');
    case 'video-gif':case 'audio-trim':return '<div class="inline-fields">'+field('Inicio (segundos)','start','number','0','Punto de inicio.','min="0" step="0.1"')+field('Duración (segundos)','duration','number',t.id==='video-gif'?'5':'10','GIF: máximo 12 segundos.','min="0.1" max="12" step="0.1"')+'</div><div class="tool-hint">El motor multimedia se descarga al ejecutar la primera vez. Los archivos se procesan en tu navegador.</div>';
    case 'qr-scan':return '<div class="tool-hint">Sube una imagen que contenga un código QR. Prisma Space intentará leerlo en tu navegador.</div>';
    case 'barcode':return field('Contenido','value','text','123456789012','Para EAN-13 utiliza exactamente 12 o 13 dígitos.')+selectField('Formato','format',[['CODE128','Code 128'],['EAN13','EAN-13'],['CODE39','Code 39']],'CODE128');
    case 'json-format':return textareaField('Contenido JSON','text','{\n  "prisma": "listo"\n}','Valida y organiza el contenido con la indentación seleccionada.')+selectField('Indentación','indent',[['2','2 espacios'],['4','4 espacios'],['tab','Tabulación']],'2');
    case 'base64':return textareaField('Texto','text','','Admite caracteres especiales y tildes.')+selectField('Operación','mode',[['encode','Codificar a Base64'],['decode','Decodificar Base64']],'encode');
    case 'word-count':return textareaField('Texto para analizar','text','','El análisis se realiza localmente.');
    case 'password':return '<div class="inline-fields">'+field('Longitud','length','number','20','Entre 8 y 128 caracteres.','min="8" max="128"')+selectField('Complejidad','complexity',[['strong','Alta'],['medium','Media'],['easy','Fácil de escribir']],'strong')+'</div><label class="check-line"><input type="checkbox" name="symbols" checked> Incluir símbolos</label>';
    case 'qr':return textareaField('Texto o enlace','text','https://','El código QR se genera en tu navegador.');
    case 'currency':return '<div class="inline-fields">'+field('Cantidad','amount','number','1','','min="0" step="any"')+selectField('Moneda de origen','from',[['USD','USD · Dólar'],['COP','COP · Peso colombiano'],['EUR','EUR · Euro'],['MXN','MXN · Peso mexicano'],['BRL','BRL · Real'],['GBP','GBP · Libra']],'USD')+'</div>'+selectField('Moneda de destino','to',[['COP','COP · Peso colombiano'],['USD','USD · Dólar'],['EUR','EUR · Euro'],['MXN','MXN · Peso mexicano'],['BRL','BRL · Real'],['GBP','GBP · Libra']],'COP','Consulta tasas de referencia. No es una cotización financiera en tiempo real.');
    case 'units':return selectField('Tipo de conversión','kind',[['length','Longitud'],['mass','Masa'],['area','Área'],['volume','Volumen'],['speed','Velocidad'],['data','Datos digitales'],['temperature','Temperatura']],'length')+field('Valor','value','number','1','','step="any"')+selectField('De','from',[['m','Metros'],['km','Kilómetros'],['cm','Centímetros'],['mm','Milímetros'],['mi','Millas'],['ft','Pies'],['in','Pulgadas'],['yd','Yardas']],'m')+selectField('A','to',[['km','Kilómetros'],['m','Metros'],['cm','Centímetros'],['mm','Milímetros'],['mi','Millas'],['ft','Pies'],['in','Pulgadas'],['yd','Yardas']],'km');
    case 'timestamp':return selectField('Conversión','mode',[['unix-to-date','Unix a fecha'],['date-to-unix','Fecha a Unix']],'unix-to-date')+field('Valor','value','text','1762550400','Acepta segundos, milisegundos o una fecha ISO.');
    case 'url-code':return textareaField('Texto o URL','text','','')+selectField('Operación','mode',[['encode','Codificar'],['decode','Decodificar']],'encode');
    case 'text-case':return textareaField('Texto','text','')+selectField('Transformación','mode',[['upper','MAYÚSCULAS'],['lower','minúsculas'],['title','Tipo título'],['sentence','Tipo oración']],'upper');
    case 'text-remove-empty-lines':return textareaField('Texto','text','','Se eliminan las líneas vacías y se conservan las líneas con contenido.');
    case 'text-prefix-lines':return textareaField('Texto','text','','Cada línea recibirá el prefijo y sufijo indicados.')+'<div class="inline-fields">'+field('Prefijo','prefix','text','','')+field('Sufijo','suffix','text','','')+'</div>';
    case 'text-replace':return textareaField('Texto original','text','','')+'<div class="inline-fields">'+field('Buscar','search','text','','')+field('Reemplazar por','replacement','text','','')+'</div><label class="check-line"><input type="checkbox" name="caseSensitive"> Distinguir mayúsculas y minúsculas</label><label class="check-line"><input type="checkbox" name="replaceAll" checked> Reemplazar todas las coincidencias</label>';
    case 'text-extract-hashtags':return textareaField('Publicación o texto','text','','Se extraen hashtags únicos respetando tildes y caracteres Unicode.');
    case 'text-extract-phones':return textareaField('Texto de origen','text','','Se detectan posibles teléfonos; verifica cada resultado antes de usarlo.');
    case 'json-flatten':return textareaField('Contenido JSON','text','{\n  "usuario": { "nombre": "Ana", "ciudad": "Chinú" },\n  "activo": true\n}','Convierte objetos anidados en rutas como usuario.nombre.');
    case 'text-remove-accents':return textareaField('Texto','text','','Se eliminan las marcas diacríticas sin cambiar el resto del contenido.');
    case 'text-reverse':return textareaField('Texto','text','','Invierte los caracteres o las líneas.')+selectField('Qué invertir','mode',[['characters','Caracteres'],['lines','Orden de líneas']],'characters');
    case 'text-extract-emails':return textareaField('Texto de origen','text','','Se extraerán correos únicos sin enviar el texto a ningún servidor.');
    case 'text-extract-urls':return textareaField('Texto de origen','text','','Se extraerán enlaces HTTP y HTTPS únicos.');
    case 'json-minify':return textareaField('Contenido JSON','text','{\n  "prisma": "listo"\n}','Valida el JSON antes de eliminar espacios.');
    case 'html-to-text':return textareaField('Código HTML','text','<h1>Hola</h1><p>Texto de ejemplo</p>','El contenido HTML se analiza como documento inerte; no se ejecutan scripts.');
    case 'markdown':return textareaField('Markdown','text','# Prisma Space\n\nEscribe **Markdown** aquí.','La vista previa básica se genera en tu navegador.');
    case 'color-palette':return selectField('Armonía','harmony',[['analogous','Análogos'],['complementary','Complementarios'],['triadic','Triádicos']],'analogous');
    case 'csv-json':return textareaField('Contenido CSV','text','nombre,ciudad\nAna,Chinú\nLuis,Cartagena','La primera fila se utiliza como encabezado.')+selectField('Separador','delimiter',[[',','Coma'],[';','Punto y coma'],['\\t','Tabulación']],',');
    case 'json-csv':return textareaField('Lista JSON','text','[{"nombre":"Ana","ciudad":"Chinú"},{"nombre":"Luis","ciudad":"Cartagena"}]','El JSON debe ser una lista de objetos.');
    case 'slug':return textareaField('Título o texto','text','Mi primera página en Prisma Space','Se eliminan tildes, símbolos y espacios repetidos.');
    case 'dedupe-lines':return textareaField('Lista de líneas','text','','Se conservará la primera aparición de cada línea.')+'<label class="check-line"><input type="checkbox" name="caseSensitive"> Distinguir mayúsculas y minúsculas</label>';
    case 'clean-text':return textareaField('Texto para limpiar','text','','Se normalizan espacios y saltos de línea.');
    case 'html-entities':return textareaField('Contenido','text','<h1>Hola Prisma Space</h1>','Escapa HTML o recupera el texto original.')+selectField('Operación','mode',[['encode','Codificar / escapar'],['decode','Decodificar']],'encode');
    case 'uuid':return field('Cantidad','count','number','5','Genera hasta 50 UUID v4.','min="1" max="50"');
    case 'lorem':return '<div class="inline-fields">'+field('Palabras','words','number','120','','min="10" max="1500"')+field('Párrafos','paragraphs','number','3','','min="1" max="12"')+'</div>';
    case 'random':return '<div class="inline-fields">'+field('Mínimo','min','number','1')+field('Máximo','max','number','100')+'</div>'+field('Cantidad','count','number','10','','min="1" max="100"');
    case 'calculator':return field('Expresión matemática','expression','text','(125 * 1.19) + 5000','Admite +, -, *, /, %, ^ y paréntesis.');
    case 'percentage':return selectField('Operación','mode',[['of','Calcular porcentaje de una cantidad'],['change','Variación porcentual entre dos valores']],'of')+'<div class="inline-fields">'+field('Cantidad / valor inicial','a','number','250','','step="any"')+field('Porcentaje / valor final','b','number','19','','step="any"')+'</div>';
    case 'date-diff':return '<div class="inline-fields">'+field('Fecha inicial','start','date','2026-01-01')+field('Fecha final','end','date',new Date().toISOString().slice(0,10))+'</div>';
    case 'timezone':return field('Fecha y hora','datetime','datetime-local',new Date().toISOString().slice(0,16))+selectField('Zona de destino','zone',[['America/Bogota','Bogotá'],['America/Mexico_City','Ciudad de México'],['America/New_York','Nueva York'],['America/Los_Angeles','Los Ángeles'],['Europe/Madrid','Madrid'],['Europe/London','Londres'],['Asia/Tokyo','Tokio'],['Australia/Sydney','Sídney']],'America/Bogota');
    case 'contrast':return '<div class="inline-fields">'+field('Color del texto','foreground','text','#111827')+field('Color del fondo','background','text','#ffffff')+'</div><div class="tool-hint">Introduce colores HEX de 3 o 6 dígitos. Se calcula la relación de contraste WCAG.</div>';
    case 'text-sort':return textareaField('Líneas para ordenar','text','','Cada línea se ordenará alfabéticamente.')+'<label class="check-line"><input type="checkbox" name="caseSensitive"> Orden sensible a mayúsculas</label>';
    case 'word-frequency':return textareaField('Texto para analizar','text','','Se mostrarán hasta 30 palabras por frecuencia.');
    case 'html-format':case 'css-format':case 'js-format':case 'sql-format':return textareaField('Código fuente','text','','Pega aquí el código que quieres organizar.')+selectField('Indentación','indent',[['2','2 espacios'],['4','4 espacios'],['tab','Tabulación']],'2')+(t.id==='sql-format'?selectField('Dialecto SQL','dialect',[['sql','SQL estándar'],['postgresql','PostgreSQL'],['mysql','MySQL'],['sqlite','SQLite'],['bigquery','BigQuery']],'sql'):'');
    case 'xml-format':return textareaField('Documento XML','text','<prisma><estado>listo</estado></prisma>','El documento se valida antes de formatearlo.');
    case 'json-schema':return textareaField('JSON que quieres validar','data','{\\n  "nombre": "Prisma",\\n  "activo": true\\n}','Introduce el contenido que quieres comprobar.')+textareaField('Esquema JSON','schema','{\\n  "type": "object",\\n  "required": ["nombre", "activo"],\\n  "properties": { "nombre": { "type": "string" }, "activo": { "type": "boolean" } }\\n}','Define los campos y tipos permitidos.');
    case 'csv-stats':return textareaField('Datos CSV','text','producto,ventas,precio\\nA,120,10.5\\nB,90,8.2\\nC,,12','Pega una tabla CSV con encabezados.')+selectField('Separador','delimiter',[[',','Coma'],[';','Punto y coma'],['\\\\t','Tabulación']],',');
    case 'json-xlsx':return textareaField('Lista JSON','text','[{\\n  "producto": "A", "ventas": 120\\n}, {\\n  "producto": "B", "ventas": 90\\n}]','Cada objeto se convertirá en una fila de Excel.');
    case 'file-inspector':return '<div class="tool-hint">Selecciona cualquier archivo para revisar su tamaño, tipo declarado y firma binaria. El análisis ocurre en este navegador.</div>';
    case 'image-strip-metadata':return '<div class="tool-hint">Reexporta JPEG, PNG o WebP para descartar metadatos EXIF habituales, incluidos datos de ubicación cuando estén presentes. La imagen se procesa en tu dispositivo.</div>';
    case 'pdf-metadata':return '<div class="tool-hint">Consulta título, autor, creador, productor, fechas y número de páginas sin modificar el documento.</div>';
    case 'pdf-metadata-clean':return '<div class="tool-hint">Genera una copia del PDF limpiando los campos habituales de autoría y metadatos. Revisa el archivo resultante antes de compartirlo.</div>';
    case 'image-pixelate':return field('Tamaño de bloque (px)','block','number','16','Cuanto mayor sea el número, más pixelado será el resultado.','min="4" max="80"');
    case 'image-sepia':return '<div class="tool-hint">Aplica un tono sepia clásico y exporta una copia PNG sin modificar el original.</div>';
    case 'image-social-kit':return '<div class="tool-hint">Genera cuatro recortes centrados: publicación cuadrada, retrato 4:5, historia/Reel 9:16 y miniatura horizontal 16:9. Descarga todo en un ZIP.</div>';
    case 'text-redact-sensitive':return textareaField('Texto con datos que quieres ocultar','text','','Trabaja solo en tu navegador. Puede detectar claves, correos y teléfonos; revisa la copia antes de compartirla.')+
      '<div class="tool-hint">Los datos no se envían a un servicio de IA. El resultado puede requerir ocultar otros datos manualmente.</div>';
    case 'utm-builder':return field('URL de destino','url','url','https://ejemplo.com','URL completa HTTP o HTTPS.')+
      '<div class="inline-fields">'+field('Origen (utm_source)','source','text','instagram')+field('Medio (utm_medium)','medium','text','social')+'</div>'+
      field('Campaña (utm_campaign)','campaign','text','lanzamiento')+
      '<div class="inline-fields">'+field('Contenido (opcional)','content','text','')+field('Término (opcional)','term','text','')+'</div>'+
      '<div class="tool-hint">Crea un enlace rastreable sin pedir acceso a cuentas externas. Conserva parámetros existentes.</div>';
    case 'subtitle-srt-local':return textareaField('Guion o frases','text','','Una frase por línea o pega un texto completo. Los tiempos son aproximados.')+
      '<div class="inline-fields">'+field('Segundos por subtítulo','secondsPerCue','number','4','Duración estimada, entre 1 y 12 segundos.','min="1" max="12" step="0.5"')+
      field('Caracteres máximos por subtítulo','charactersPerCue','number','72','','min="35" max="110"')+'</div>'+
      '<div class="tool-hint">Descarga un archivo .srt real, compatible con CapCut y otros editores. Revisa la sincronía con el audio.</div>';
    case 'citation-generator':return field('Autor o autores','author','text','Apellido, N.','Usa los datos tal como aparecen en la publicación.')+field('Año','year','text','2026')+field('Título','title','text','','Título del artículo, libro o recurso.')+field('Revista, editorial o sitio','source','text','','Nombre de la fuente.')+field('DOI (opcional)','doi','text','','Puedes pegar el DOI o su URL.')+field('URL (opcional)','url','url','','Enlace directo a la fuente.')+selectField('Formato de salida principal','style',[['apa','APA 7'],['vancouver','Vancouver'],['mla','MLA 9']],'apa');
    case 'flashcards-export':return textareaField('Conceptos y definiciones','text','Caries | Enfermedad multifactorial que afecta los tejidos duros del diente.\\nPulpa | Tejido conectivo vascularizado e inervado del diente.','Una tarjeta por línea. Separa el concepto y la definición con |, tabulación o ::. Descarga CSV compatible con Anki.');
    case 'qr-vcard':return field('Nombre completo','name','text','Andrés Simón Yépez')+field('Teléfono','phone','tel','','Incluye el indicativo del país.')+field('Correo electrónico','email','email','','')+field('Empresa u organización','organization','text','','Opcional.');
    case 'video-compress':return selectField('Nivel de compresión','quality',[[ 'small','Archivo pequeño · máximo 720 px'],['balanced','Equilibrado · máximo 960 px'],['quality','Mayor calidad · máximo 1280 px']],'balanced')+'<div class="tool-hint">Se vuelve a codificar el vídeo localmente (puede tardar aproximadamente lo mismo que su duración en iPhone). Se intenta conservar el audio. Solo se ofrece el archivo si realmente pesa menos; ningún vídeo se envía a una API.</div>';
    case 'video-speed':return selectField('Velocidad de reproducción','speed',[['0.5','0,5× · Cámara lenta'],['0.75','0,75×'],['1.25','1,25×'],['1.5','1,5×'],['2','2× · Rápido']],'1.5')+'<div class="tool-hint">El video se vuelve a codificar para sincronizar imagen y audio. La duración final cambiará.</div>';
    case 'video-resize':return selectField('Formato de salida','resolution',[['vertical','Vertical · 1080 × 1920'],['portrait','Retrato · 1080 × 1350'],['square','Cuadrado · 1080 × 1080'],['landscape','Horizontal · 1920 × 1080'],['hd','HD · 1280 × 720']],'vertical')+'<div class="tool-hint">Conserva la proporción del video y completa el espacio sobrante con bandas. No estira la imagen.</div>';
    case 'video-rotate':return selectField('Orientación','direction',[['cw','90° a la derecha'],['ccw','90° a la izquierda'],['180','180°']],'cw');
    case 'audio-convert':return selectField('Formato de salida','format',[['mp3','MP3'],['wav','WAV'],['ogg','OGG']],'mp3');
    case 'audio-normalize':return '<div class="tool-hint">Ajusta la sonoridad hacia un nivel objetivo aproximado de -16 LUFS para voz y contenido digital. Exporta M4A.</div>';
    default:return '';
  }
}
