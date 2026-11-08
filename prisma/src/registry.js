export const categories = [
  { id: 'all', name: 'Todas', icon: 'grid' },
  { id: 'pdf', name: 'PDF y documentos', icon: 'file-text' },
  { id: 'image', name: 'Imágenes', icon: 'image' },
  { id: 'media', name: 'Audio y video', icon: 'film' },
  { id: 'text', name: 'Texto y datos', icon: 'code' },
  { id: 'utility', name: 'Utilidades', icon: 'sliders' }
];

export const tools = [
  { id:'pdf-merge', name:'Unir PDF', description:'Combina varios documentos en un solo archivo.', category:'pdf', icon:'files', status:'ready', mode:'local', file:true, multiple:true, accept:'.pdf,application/pdf', tag:'Sin subir archivos' },
  { id:'pdf-extract', name:'Extraer páginas', description:'Selecciona páginas y crea un PDF independiente.', category:'pdf', icon:'file-output', status:'ready', mode:'local', file:true, accept:'.pdf,application/pdf', tag:'Control preciso' },
  { id:'pdf-rotate', name:'Rotar PDF', description:'Corrige la orientación de las páginas de un documento.', category:'pdf', icon:'rotate-cw', status:'ready', mode:'local', file:true, accept:'.pdf,application/pdf', tag:'En tu dispositivo' },
  { id:'pdf-watermark', name:'Marca de agua', description:'Añade una marca de agua de texto a tus páginas.', category:'pdf', icon:'stamp', status:'ready', mode:'local', file:true, accept:'.pdf,application/pdf', tag:'Personalizable' },
  { id:'image-pdf', name:'Imágenes a PDF', description:'Convierte fotografías JPG y PNG en un documento PDF.', category:'pdf', icon:'images', status:'ready', mode:'local', file:true, multiple:true, accept:'image/jpeg,image/png,.jpg,.jpeg,.png', tag:'Varias imágenes' },
  { id:'docx-html', name:'Word a HTML', description:'Extrae el contenido de DOCX como HTML limpio.', category:'pdf', icon:'file-code', status:'ready', mode:'local', file:true, accept:'.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document', tag:'Conversión local' },
  { id:'image-compress', name:'Comprimir imagen', description:'Reduce el peso de una imagen ajustando su calidad.', category:'image', icon:'file-archive', status:'ready', mode:'local', file:true, accept:'image/*', tag:'Menor tamaño' },
  { id:'image-resize', name:'Redimensionar', description:'Cambia las dimensiones sin perder la proporción.', category:'image', icon:'maximize', status:'ready', mode:'local', file:true, accept:'image/*', tag:'Tamaño a medida' },
  { id:'image-convert', name:'Convertir formato', description:'Transforma imágenes entre PNG, JPG y WebP.', category:'image', icon:'refresh-cw', status:'ready', mode:'local', file:true, accept:'image/*', tag:'PNG · JPG · WebP' },
  { id:'image-crop', name:'Recorte inteligente', description:'Recorta una imagen desde el centro con proporciones definidas.', category:'image', icon:'crop', status:'ready', mode:'local', file:true, accept:'image/*', tag:'En tu dispositivo' },
  { id:'image-bg', name:'Eliminar fondo', description:'Obtén un PNG transparente mediante IA en tu navegador.', category:'image', icon:'scan', status:'beta', mode:'browser', file:true, accept:'image/png,image/jpeg,image/webp,.heic,.heif', tag:'IA local · BiRefNet' },
  { id:'image-ocr', name:'Extraer texto (OCR)', description:'Reconoce texto en fotografías y documentos escaneados.', category:'image', icon:'scan-text', status:'beta', mode:'browser', file:true, accept:'image/*', tag:'Motor Tesseract' },
  { id:'pdf-to-image', name:'PDF a imágenes', description:'Exporta las páginas de un PDF como archivos de imagen.', category:'pdf', icon:'image-down', status:'soon', mode:'planned', file:true, accept:'.pdf,application/pdf', tag:'En preparación' },
  { id:'pdf-compress', name:'Comprimir PDF', description:'Optimiza el peso de documentos conservando su legibilidad.', category:'pdf', icon:'file-archive', status:'soon', mode:'planned', file:true, accept:'.pdf,application/pdf', tag:'En preparación' },
  { id:'pdf-protect', name:'Proteger PDF', description:'Añade contraseña y restricciones a tus documentos.', category:'pdf', icon:'shield', status:'soon', mode:'planned', file:true, accept:'.pdf,application/pdf', tag:'En preparación' },
  { id:'video-audio', name:'Extraer audio', description:'Separa la pista de audio de un video y guárdala como WAV.', category:'media', icon:'audio-lines', status:'beta', mode:'browser', file:true, accept:'video/*,.mp4,.mov,.mkv,.webm', tag:'FFmpeg WebAssembly' },
  { id:'video-trim', name:'Recortar video', description:'Extrae un fragmento de video indicando inicio y duración.', category:'media', icon:'scissors', status:'beta', mode:'browser', file:true, accept:'video/*,.mp4,.mov,.mkv,.webm', tag:'FFmpeg WebAssembly' },
  { id:'video-transcribe', name:'Transcribir audio', description:'Convierte voz en texto con reconocimiento automático.', category:'media', icon:'mic', status:'soon', mode:'planned', file:true, accept:'audio/*,video/*', tag:'Motor por seleccionar' },
  { id:'json-format', name:'Formatear JSON', description:'Ordena, valida y embellece estructuras JSON.', category:'text', icon:'braces', status:'ready', mode:'local', file:false, tag:'Instantáneo' },
  { id:'base64', name:'Codificar Base64', description:'Codifica o decodifica texto con soporte Unicode.', category:'text', icon:'binary', status:'ready', mode:'local', file:false, tag:'Instantáneo' },
  { id:'word-count', name:'Contador de palabras', description:'Cuenta palabras, caracteres, líneas y tiempo de lectura.', category:'text', icon:'text-cursor', status:'ready', mode:'local', file:false, tag:'Instantáneo' },
  { id:'password', name:'Generador de contraseñas', description:'Crea claves aleatorias con opciones de seguridad.', category:'text', icon:'key-round', status:'ready', mode:'local', file:false, tag:'Generación segura' },
  { id:'qr', name:'Generador QR', description:'Crea códigos QR descargables a partir de texto o enlaces.', category:'utility', icon:'qr-code', status:'ready', mode:'local', file:false, tag:'PNG descargable' },
  { id:'currency', name:'Conversor de monedas', description:'Consulta tipos de cambio de referencia actualizados.', category:'utility', icon:'arrow-left-right', status:'ready', mode:'online', file:false, tag:'Frankfurter API' },
  { id:'units', name:'Conversor de unidades', description:'Convierte longitud, masa y temperatura.', category:'utility', icon:'ruler', status:'ready', mode:'local', file:false, tag:'Instantáneo' },
  { id:'timestamp', name:'Conversor de fechas', description:'Convierte marcas de tiempo Unix y fechas legibles.', category:'utility', icon:'calendar-clock', status:'ready', mode:'local', file:false, tag:'Instantáneo' },
  { id:'url-code', name:'Codificar URL', description:'Codifica o decodifica caracteres especiales de una URL.', category:'text', icon:'link', status:'ready', mode:'local', file:false, tag:'Instantáneo' },
  { id:'text-case', name:'Cambiar mayúsculas', description:'Transforma textos a mayúsculas, minúsculas o título.', category:'text', icon:'case-sensitive', status:'ready', mode:'local', file:false, tag:'Instantáneo' },
  { id:'markdown', name:'Vista Markdown', description:'Previsualiza Markdown y exporta el resultado como HTML.', category:'text', icon:'file-code-2', status:'ready', mode:'local', file:false, tag:'Vista previa' },
  { id:'color-palette', name:'Paleta de colores', description:'Genera combinaciones de color para tus proyectos.', category:'utility', icon:'palette', status:'ready', mode:'local', file:false, tag:'Diseño' }
];

export const statusLabels = { ready:'Disponible', beta:'Beta', soon:'Próximamente' };
