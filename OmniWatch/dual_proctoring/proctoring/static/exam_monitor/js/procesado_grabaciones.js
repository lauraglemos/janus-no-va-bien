const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');

// Promisify para usar async/await
const execPromise = util.promisify(exec);
const mkdirPromise = util.promisify(fs.mkdir);
const readdirPromise = util.promisify(fs.readdir);
const unlinkPromise = util.promisify(fs.unlink);
const statPromise = util.promisify(fs.stat);
const copyFilePromise = util.promisify(fs.copyFile);

// Configuración
const CONFIG = {
  // Directorio donde Janus en WSL está guardando las grabaciones
  // Usamos la ruta mapeada de Windows a WSL 
  janusDir: process.env.JANUS_DIR || '\\\\wsl$\\Ubuntu\\opt\\janus\\bin\\janus_gateway',
  
  // Directorio temporal para procesar archivos
  tempDir: process.env.TEMP_DIR || path.join(__dirname, 'temp_recordings'),
  
  // Directorio final donde se guardarán las grabaciones procesadas (en el servidor Django)
  outputDir: process.env.RECORDINGS_DIR || path.join(__dirname, '..', 'recordings'),
  
  // Tiempo en milisegundos para esperar antes de procesar un archivo
  processingDelay: 5000,
  
  // IP del servidor Django
  djangoServerIP: process.env.DJANGO_SERVER_IP || '',
  
  // URL base para acceder a las grabaciones desde la aplicación web
  baseUrl: process.env.BASE_URL || 'http://192.168.1.142/media/recordings'
};

/**
 * Extrae información del nombre del archivo
 * @param {string} filename - Nombre del archivo
 * @returns {Object} Información extraída
 */
function parseFilename(filename) {
  // Formato esperado: examen_estudiante_[feedId]_[timestamp]
  try {
    const parts = filename.split('_');
    
    // Para formatos antiguos compatibles con tu script de shell
    if (parts.length < 4) {
      const roomMatch = filename.match(/\d+/);
      return {
        exam: 'unknown',
        studentId: roomMatch ? roomMatch[0] : 'unknown',
        timestamp: Date.now(),
        isAudio: filename.includes('-audio-'),
        isVideo: filename.includes('-video-')
      };
    }
    
    return {
      exam: parts[0],
      studentId: parts[2],
      timestamp: parts[3].split('.')[0],
      isAudio: filename.includes('-audio-'),
      isVideo: filename.includes('-video-')
    };
  } catch (error) {
    console.error(`Error al parsear nombre de archivo ${filename}:`, error);
    return {
      exam: 'unknown',
      studentId: 'unknown',
      timestamp: Date.now(),
      isAudio: filename.includes('audio'),
      isVideo: filename.includes('video')
    };
  }
}

/**
 * Copia archivos desde el directorio de WSL mapeado a local
 * @returns {Promise<Array>} Lista de archivos copiados
 */
async function copyFilesFromJanus() {
  try {
    console.log(`🔍 Buscando archivos MJR en ${CONFIG.janusDir}...`);
    
    // Crear directorio temporal si no existe
    await mkdirPromise(CONFIG.tempDir, { recursive: true });
    
    try {
      // Listar archivos MJR en el directorio mapeado de WSL
      const files = await readdirPromise(CONFIG.janusDir);
      const mjrFiles = files.filter(file => file.endsWith('.mjr'));
      
      if (mjrFiles.length === 0) {
        console.log('No hay nuevos archivos para procesar.');
        return [];
      }
      
      console.log(`🔍 Encontrados ${mjrFiles.length} archivos MJR para procesar.`);
      
      // Copiar cada archivo MJR a temporal
      const copiedFiles = [];
      for (const file of mjrFiles) {
        const sourcePath = path.join(CONFIG.janusDir, file);
        const destPath = path.join(CONFIG.tempDir, file);
        
        console.log(`📥 Copiando ${file} al directorio temporal...`);
        
        try {
          // Copiar archivo
          await copyFilePromise(sourcePath, destPath);
          copiedFiles.push(destPath);
          
          // Eliminar archivo original (opcional - elimina según necesidad)
          await unlinkPromise(sourcePath);
          console.log(`🗑️ Eliminado archivo original: ${sourcePath}`);
        } catch (err) {
          console.error(`Error al copiar ${file}: ${err.message}`);
        }
      }
      
      return copiedFiles;
    } catch (err) {
      // Intenta con acceso directo a WSL usando wsl.exe command
      console.log('Intentando acceder a los archivos mediante comando WSL...');
      
      // Ejecutar comando WSL para listar archivos
      const { stdout } = await execPromise('wsl -d Ubuntu ls -la /opt/janus/bin/janus_gateway/*.mjr');
      
      if (!stdout.trim()) {
        console.log('No hay nuevos archivos para procesar (vía WSL).');
        return [];
      }
      
      // Parsear la salida para obtener nombres de archivos
      const fileLines = stdout.split('\n').filter(line => line.trim().endsWith('.mjr'));
      const mjrFiles = fileLines.map(line => {
        const parts = line.trim().split(' ');
        return parts[parts.length - 1].split('/').pop();
      });
      
      console.log(`🔍 Encontrados ${mjrFiles.length} archivos MJR para procesar (vía WSL).`);
      
      // Copiar cada archivo usando wsl.exe
      const copiedFiles = [];
      for (const file of mjrFiles) {
        const destPath = path.join(CONFIG.tempDir, file);
        
        console.log(`📥 Copiando ${file} al directorio temporal (vía WSL)...`);
        
        try {
          // Copiar usando WSL command
          await execPromise(`wsl -d Ubuntu cp /opt/janus/bin/janus_gateway/${file} $(wslpath '${destPath.replace(/\\/g, "\\\\")}')`);
          copiedFiles.push(destPath);
          
          // Eliminar archivo original
          await execPromise(`wsl -d Ubuntu rm /opt/janus/bin/janus_gateway/${file}`);
          console.log(`🗑️ Eliminado archivo original: ${file} (vía WSL)`);
        } catch (err) {
          console.error(`Error al copiar ${file} vía WSL: ${err.message}`);
        }
      }
      
      return copiedFiles;
    }
  } catch (error) {
    console.error('❌ Error al copiar archivos desde WSL:', error);
    return [];
  }
}

/**
 * Procesa un archivo MJR y lo convierte a formato adecuado
 * @param {string} filePath - Ruta completa al archivo MJR
 */
async function processFile(filePath) {
  try {
    const filename = path.basename(filePath);
    const fileInfo = parseFilename(filename);
    
    console.log(`🔄 Procesando ${filename}...`);
    
    // Crear directorio de estudiante si no existe
    const studentDir = path.join(CONFIG.outputDir, fileInfo.studentId);
    await mkdirPromise(studentDir, { recursive: true });
    
    // Ruta temporal para archivo RTP
    const rtpFile = path.join(CONFIG.tempDir, `${path.parse(filename).name}.rtp`);
    
    try {
      // Intentar convertir MJR a RTP usando janus-pp-rec instalado localmente
      await execPromise(`janus-pp-rec "${filePath}" "${rtpFile}"`);
    } catch (err) {
      // Si falla, intentar usando WSL
      console.log('Intentando procesar con janus-pp-rec en WSL...');
      await execPromise(`wsl -d Ubuntu janus-pp-rec $(wslpath '${filePath.replace(/\\/g, "\\\\")}') $(wslpath '${rtpFile.replace(/\\/g, "\\\\")}')`);
    }
    
    console.log(`✅ Convertido a RTP: ${rtpFile}`);
    
    let outputFile;
    
    // Determinar tipo y procesar con ffmpeg
    if (fileInfo.isAudio || filename.includes('audio')) {
      outputFile = path.join(studentDir, `${fileInfo.exam}_${fileInfo.studentId}_${fileInfo.timestamp}.wav`);
      try {
        await execPromise(`ffmpeg -i "${rtpFile}" -acodec pcm_s16le -ar 48000 -ac 2 "${outputFile}"`);
      } catch (err) {
        // Si falla, intentar usando WSL
        await execPromise(`wsl -d Ubuntu ffmpeg -i $(wslpath '${rtpFile.replace(/\\/g, "\\\\")}'}) -acodec pcm_s16le -ar 48000 -ac 2 $(wslpath '${outputFile.replace(/\\/g, "\\\\")}')`);
      }
    } else if (fileInfo.isVideo || filename.includes('video')) {
      outputFile = path.join(studentDir, `${fileInfo.exam}_${fileInfo.studentId}_${fileInfo.timestamp}.webm`);
      try {
        await execPromise(`ffmpeg -i "${rtpFile}" -c:v libvpx -b:v 1M -c:a libvorbis "${outputFile}"`);
      } catch (err) {
        // Si falla, intentar usando WSL
        await execPromise(`wsl -d Ubuntu ffmpeg -i $(wslpath '${rtpFile.replace(/\\/g, "\\\\")}'}) -c:v libvpx -b:v 1M -c:a libvorbis $(wslpath '${outputFile.replace(/\\/g, "\\\\")}')`);
      }
    } else {
      // Si no podemos determinar el tipo, intentar procesar como video
      outputFile = path.join(studentDir, `${fileInfo.exam}_${fileInfo.studentId}_${fileInfo.timestamp}.webm`);
      try {
        await execPromise(`ffmpeg -i "${rtpFile}" -c:v libvpx -b:v 1M -c:a libvorbis "${outputFile}"`);
      } catch (err) {
        // Si falla, intentar usando WSL
        await execPromise(`wsl -d Ubuntu ffmpeg -i $(wslpath '${rtpFile.replace(/\\/g, "\\\\")}'}) -c:v libvpx -b:v 1M -c:a libvorbis $(wslpath '${outputFile.replace(/\\/g, "\\\\")}')`);
      }
    }
    
    console.log(`✅ Archivo procesado: ${outputFile}`);
    
    // Eliminar archivos temporales
    try {
      await unlinkPromise(rtpFile);
      await unlinkPromise(filePath);
    } catch (err) {
      console.error(`Error al eliminar archivos temporales: ${err.message}`);
    }
    
    // Generar archivo de metadatos para la interfaz web
    updateRecordingMetadata(fileInfo, outputFile);
    
    return {
      success: true,
      outputFile,
      studentId: fileInfo.studentId
    };
  } catch (error) {
    console.error(`❌ Error al procesar ${filePath}:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Actualiza el archivo de metadatos para la interfaz web
 * @param {Object} fileInfo - Información del archivo
 * @param {string} outputFile - Ruta del archivo procesado
 */
function updateRecordingMetadata(fileInfo, outputFile) {
  const metadataPath = path.join(CONFIG.outputDir, 'recordings.json');
  let metadata = [];
  
  // Leer metadatos existentes si existen
  if (fs.existsSync(metadataPath)) {
    try {
      const data = fs.readFileSync(metadataPath, 'utf8');
      metadata = JSON.parse(data);
    } catch (error) {
      console.error('Error al leer metadata:', error);
    }
  }
  
  // Crear URL relativa para acceder desde Django
  const relativePath = outputFile.replace(CONFIG.outputDir, '').replace(/\\/g, '/');
  // Asegurarse de que la ruta comienza con '/'
  const normalizedPath = relativePath.startsWith('/') ? relativePath : '/' + relativePath;
  const accessUrl = `${CONFIG.baseUrl}${normalizedPath}`;
  
  // Obtener tamaño del archivo
  let fileSize = 'Desconocido';
  try {
    const stats = fs.statSync(outputFile);
    fileSize = formatFileSize(stats.size);
  } catch (err) {
    console.error(`Error al obtener tamaño del archivo: ${err.message}`);
  }
  
  // Añadir nueva información
  metadata.push({
    id: `${fileInfo.studentId}_${fileInfo.timestamp}`,
    exam: fileInfo.exam,
    studentId: fileInfo.studentId,
    timestamp: parseInt(fileInfo.timestamp),
    date: new Date(parseInt(fileInfo.timestamp)).toLocaleString(),
    type: fileInfo.isAudio ? 'audio' : 'video',
    filename: path.basename(outputFile),
    path: normalizedPath,
    url: accessUrl,
    size: fileSize
  });
  
  // Guardar metadatos actualizados
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
  console.log(`✅ Metadata actualizada en: ${metadataPath}`);
}

/**
 * Formatea el tamaño del archivo en forma legible
 * @param {number} bytes - Tamaño en bytes
 * @returns {string} Tamaño formateado
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Verifica si el archivo está completo y listo para procesarse
 * @param {string} filePath - Ruta al archivo
 * @param {number} waitTime - Tiempo en ms a esperar
 * @returns {Promise<boolean>} True si el archivo está listo
 */
async function isFileReady(filePath, waitTime = 5000) {
  try {
    const initialStat = await statPromise(filePath);
    
    // Esperar un tiempo
    await new Promise(resolve => setTimeout(resolve, waitTime));
    
    // Verificar si el tamaño ha cambiado
    const newStat = await statPromise(filePath);
    return initialStat.size === newStat.size;
  } catch (err) {
    console.error(`Error al verificar si el archivo está listo: ${err.message}`);
    return false; // En caso de error, asumimos que no está listo
  }
}

/**
 * Función principal que observa y procesa grabaciones de Janus
 */
async function watchJanusFolder() {
  try {
    console.log(`🔍 Iniciando verificación de grabaciones de Janus...`);
    
    // Verificar que las carpetas existan
    await mkdirPromise(CONFIG.outputDir, { recursive: true });
    await mkdirPromise(CONFIG.tempDir, { recursive: true });
    
    // Copiar archivos desde el directorio mapeado de WSL
    const mjrFiles = await copyFilesFromJanus();
    
    if (mjrFiles.length === 0) {
      console.log('No hay nuevos archivos para procesar.');
      return;
    }
    
    console.log(`🔄 Procesando ${mjrFiles.length} archivos MJR...`);
    
    // Procesar cada archivo
    for (const filePath of mjrFiles) {
      try {
        // Verificar si el archivo está listo para procesarse
        if (await isFileReady(filePath, CONFIG.processingDelay)) {
          await processFile(filePath);
        } else {
          console.log(`⏳ Archivo ${path.basename(filePath)} todavía está siendo escrito. Se procesará en la próxima ejecución.`);
        }
      } catch (err) {
        console.error(`Error al procesar archivo ${filePath}: ${err.message}`);
      }
    }
    
    console.log('✅ Procesamiento completado.');
  } catch (error) {
    console.error('❌ Error en watchJanusFolder:', error);
  }
}

/**
 * Función para asegurarse de que las herramientas necesarias estén instaladas
 */
async function checkRequirements() {
  try {
    console.log('Verificando requisitos...');
    
    // Intentar ejecutar janus-pp-rec directamente
    try {
      await execPromise('janus-pp-rec --help');
      console.log('✅ janus-pp-rec está instalado localmente');
    } catch (error) {
      // Verificar si está disponible en WSL
      try {
        await execPromise('wsl -d Ubuntu janus-pp-rec --help');
        console.log('✅ janus-pp-rec está disponible en WSL');
      } catch (wslError) {
        console.error('❌ janus-pp-rec no está instalado ni en local ni en WSL');
        console.error('Por favor, instala las herramientas de Janus:');
        console.error('sudo apt-get install janus-tools');
        process.exit(1);
      }
    }
    
    // Verificar ffmpeg
    try {
      await execPromise('ffmpeg -version');
      console.log('✅ ffmpeg está instalado localmente');
    } catch (error) {
      // Verificar si está disponible en WSL
      try {
        await execPromise('wsl -d Ubuntu ffmpeg -version');
        console.log('✅ ffmpeg está disponible en WSL');
      } catch (wslError) {
        console.error('❌ ffmpeg no está instalado ni en local ni en WSL');
        console.error('Por favor, instala ffmpeg:');
        console.error('sudo apt-get install ffmpeg');
        process.exit(1);
      }
    }
    
    // Verificar acceso a directorio de Janus en WSL
    try {
      if (fs.existsSync(CONFIG.janusDir)) {
        console.log(`✅ El directorio de Janus es accesible: ${CONFIG.janusDir}`);
      } else {
        // Intentar verificar con WSL
        await execPromise('wsl -d Ubuntu ls -la /opt/janus/bin/janus_gateway');
        console.log('✅ El directorio de Janus es accesible a través de WSL');
      }
    } catch (error) {
      console.warn(`⚠️ No se puede acceder al directorio de Janus: ${error.message}`);
      console.warn('Esto puede causar problemas al procesar las grabaciones.');
    }
  } catch (error) {
    console.error('❌ Error al verificar requisitos:', error);
    process.exit(1);
  }
}

// Para ser utilizado como script
if (require.main === module) {
  // Verificar requisitos antes de iniciar
  checkRequirements().then(() => {
    // Ejecutar el proceso inmediatamente
    watchJanusFolder();
    
    // Configurar un intervalo para revisar cada minuto
    setInterval(watchJanusFolder, 60000);
  });
} else {
  // Exportar funciones para ser utilizadas como módulo
  module.exports = {
    processFile,
    watchJanusFolder,
    CONFIG
  };
}