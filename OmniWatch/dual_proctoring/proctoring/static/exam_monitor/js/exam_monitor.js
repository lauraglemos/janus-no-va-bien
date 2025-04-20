// exam_monitor.js (versión mejorada con GoPro separada)
// ==============================================

// CONFIGURACIÓN GLOBAL
let janus = null;
let videoroom = null;           // Plugin para la webcam principal
let goProRoom = null;           // Plugin separado para la GoPro
let opaqueId = "examroom-" + Janus.randomString(12);
let goProOpaqueId = "goProRoom-" + Janus.randomString(12);
let screenOpaqueId = "screenRoom-" + Janus.randomString(12);

let myroom = null;              // ID de la sala
let myusername = null;          // Nombre de usuario
let myid = null;                // ID en el plugin
let goProId = null;             // ID de la GoPro en el plugin
let mypvtid = null;             // Private ID para identificar subscriptor
let mystream = null;            // Stream local de webcam
let goProStream = null;         // Stream local de GoPro
let isTeacher = false;          // Bandera para profesor
let remoteFeed = {};            // Feeds remotos
let feedsDetected = 0;          // Contador de feeds
let remoteTracks = {};          // Tracks remotos asociados a feeds
let remoteVideos = {};          // Elementos de video asociados

// VARIABLES DE GRABACIÓN (opcional, se mantiene en caso de que se requiera más adelante)
let recordings = {};
let isRecordingAll = false;

// VARIABLES PARA GOPro
let goProConnected = false;     // Estado de conexión
let goProPublished = false;     // Estado de publicación
let goProPublishingStarted = false;
let goProRequested = false;

// ELEMENTOS DEL DOM
const loginDiv = document.getElementById('login');
const mainAppDiv = document.getElementById('mainApp');
const startBtn = document.getElementById('startBtn');
const publishBtn = document.getElementById('publishBtn');
const leaveBtn = document.getElementById('leaveBtn');
const statusDiv = document.getElementById('status');
const localVideoDiv = document.getElementById('localVideo');
const videosGrid = document.getElementById('videosGrid');
const headerText = document.getElementById('headerText');
const myVideoElement = document.getElementById('myVideo');
const myInfoElement = document.getElementById('myInfo');
const connectionStateSpan = document.getElementById('connectionState');
const feedsCountSpan = document.getElementById('feedsCount');


let goProPublisher = null;

// Mantiene las filas ya creadas, indexadas por el nombre de usuario
const studentRows = {};

/**
 * Adjunta un plugin y define su propio onmessage.
 * @param {string} opaqueId
 * @param {(msg:object, jsep:object, handle:any)=>void} onMsgCallback
 * @returns {Promise<any>}
 */
function attachVideoRoomPlugin(opaqueId, onMsgCallback) {
    return new Promise((resolve, reject) => {
      janus.attach({
        plugin:   "janus.plugin.videoroom",
        opaqueId: opaqueId,
        success:  handle => {
          handle.onmessage = (msg, jsep) => {
            // 1) que el propio handle procese su JSEP
            if (jsep) handle.handleRemoteJsep({ jsep });
            // 2) llamar al callback pasándole también el handle
            onMsgCallback?.(msg, jsep, handle);
          };
          resolve(handle);
        },
        error: err => reject(err)
      });
    });
  }
  
  
  
  

/**
 * Crea (o devuelve si ya existe) la fila para un alumno.
 * @param {string} studentKey  Clave única (ej. nombre de usuario)
 * @param {string} displayName Lo que mostraremos en la primera celda
 * @returns {HTMLElement}  El <div class="student-row">
 */
function getOrCreateStudentRow(studentKey, displayName) {
    // Intentar encontrarla en el grid de DIVs
    let row = videosGrid.querySelector(`.student-row[data-student="${studentKey}"]`);
    if (!row) {
      row = document.createElement('div');
      row.className = 'student-row';
      row.dataset.student = studentKey;
  
      // Nombre del alumno
      const nameDiv = document.createElement('div');
      nameDiv.className = 'student-name';
      nameDiv.textContent = displayName;
      row.appendChild(nameDiv);
  
      // Celda para la webcam
      const webcamDiv = document.createElement('div');
      webcamDiv.className = 'video-cell webcam';
      row.appendChild(webcamDiv);
  
      // Celda para la GoPro
      const goproDiv = document.createElement('div');
      goproDiv.className = 'video-cell gopro';
      row.appendChild(goproDiv);
  
      // Celda para la pantalla
      const screenDiv = document.createElement('div');
      screenDiv.className = 'video-cell screen';
      row.appendChild(screenDiv);
  
      videosGrid.appendChild(row);
      console.log(`➕ Creada nueva fila DIV para estudiante: ${studentKey}`);
      console.log("DOM de la nueva fila:", row.innerHTML);

    }
    return row;
  }
  

// CREACIÓN DINÁMICA DE CONTROLES (selección de dispositivos)
// const deviceControlsDiv = document.createElement('div');
// deviceControlsDiv.id = 'deviceControls';
// deviceControlsDiv.classList.add('hidden');
// deviceControlsDiv.innerHTML = `
//   <h3>Fuentes de Video</h3>
//   <div>
//     <label for="webcamSelect">Webcam:</label>
//     <select id="webcamSelect"></select>
//     <button id="startWebcamBtn">Iniciar Webcam</button>
//   </div>
//   <div>
//     <label for="goProSelect">GoPro/Segunda Cámara:</label>
//     <select id="goProSelect"></select>
//     <button id="startGoProBtn">Conectar GoPro</button>
//   </div>
// `;

// // CONTENEDOR PARA GOPro
// const goProVideoDiv = document.createElement('div');
// goProVideoDiv.id = 'goProVideoDiv';
// goProVideoDiv.classList.add('hidden');
// goProVideoDiv.innerHTML = `
//  <div id="goProVideoDiv" class="hidden">
//   <div class="video-container">
//     <video id="goProVideo" autoplay muted playsinline></video>
//     <div class="student-info" id="goProInfo">GoPro (No conectada)</div>
//   </div>
// </div>
// `;

// Insertamos los controles justo después de localVideoDiv
// if (localVideoDiv && localVideoDiv.parentNode) {
//   localVideoDiv.parentNode.insertBefore(deviceControlsDiv, localVideoDiv.nextSibling);
//   localVideoDiv.parentNode.insertBefore(goProVideoDiv, deviceControlsDiv.nextSibling);
// }

// REFERENCIAS A CONTROLES
const webcamSelect = document.getElementById('webcamSelect');
const goProSelect = document.getElementById('goProSelect');
const startWebcamBtn = document.getElementById('startWebcamBtn');
const startGoProBtn = document.getElementById('startGoProBtn');
// startGoProBtn.textContent = "Conectar GoPro";
// startGoProBtn.onclick = toggleGoPro;

// FUNCIONES DE DEBUG
function updateDebugInfo(connectionState, feeds) {
    connectionStateSpan.textContent = connectionState;
    if (feeds !== undefined) {
        feedsDetected = feeds;
        feedsCountSpan.textContent = feeds;
    }
}

// ASIGNACIÓN DE EVENTOS A BOTONES
// startBtn.addEventListener('click', startWebcam); // Se inicia la webcam
// publishBtn.addEventListener('click', publishStream);
//leaveBtn.addEventListener('click', leaveExam);

// FUNCIONES DE INICIALIZACIÓN
function initializeExamMonitor(username, role, roomId) {
    myusername = username;

    console.log("→ initializeExamMonitor() received role:", JSON.stringify(role));

    if(typeof role === 'string' && role.toLowerCase().trim() === "teacher"){
        isTeacher = true;
        console.log("Rol asignado: Profesor");
    } else {
        isTeacher = false;
        console.log("Rol asignado: Alumno");
    }
   
    myroom = parseInt(roomId);
    if (isNaN(myroom)) {
        alert("El ID del examen debe ser un número");
        return;
    }
    updateDebugInfo("Inicializando...");
    loginDiv.classList.add('hidden');
    mainAppDiv.classList.remove('hidden');
    if (headerText) {
        headerText.textContent = isTeacher
          ? "Monitoreo de Estudiantes"
          : "Examen en Curso";
      }

    videosGrid.innerHTML = '';
    feedsDetected = 0;
    updateDebugInfo("Inicializando", 0);

    if (isTeacher) {
        // Agregar controles de grabación global (si se requiere)
        const recordingControlsDiv = document.createElement('div');
        recordingControlsDiv.style.textAlign = 'center';
        recordingControlsDiv.style.marginTop = '10px';
        const startRecordingBtn = document.createElement('button');
        startRecordingBtn.textContent = 'Grabar Todos';
        startRecordingBtn.onclick = startRecordingAllFeeds;
        startRecordingBtn.style.marginRight = "10px";
        const stopRecordingBtn = document.createElement('button');
        stopRecordingBtn.textContent = 'Detener Grabación';
        stopRecordingBtn.onclick = stopRecordingAllFeeds;
        const recordingStatusDiv = document.createElement('div');
        recordingStatusDiv.id = 'recordingStatus';
        recordingStatusDiv.style.marginTop = "10px";
        recordingStatusDiv.textContent = 'No hay grabaciones activas';
        recordingControlsDiv.appendChild(startRecordingBtn);
        recordingControlsDiv.appendChild(stopRecordingBtn);
        recordingControlsDiv.appendChild(recordingStatusDiv);
        mainAppDiv.appendChild(recordingControlsDiv);
    }

    // Crear el contenedor de GoPro para el profesor antes de inicializar Janus
    if (isTeacher) {
        // Crear un contenedor dedicado para la GoPro
        const goProContainer = document.createElement('div');
        goProContainer.className = 'gopro-teacher-container';
        goProContainer.innerHTML = `
            <h3>Vista de GoPro del Estudiante</h3>
            <div class="video-container">
                <video id="teacher-gopro-video" autoplay playsinline></video>
                <div class="student-info">GoPro (en espera)</div>
            </div>
        `;
        document.getElementById('mainApp').appendChild(goProContainer);
    }

    // Inicializar Janus primero
    initializeJanus();

    // if (!isTeacher) {
    //     startAllAndPublish();
    //   }
}

function connectTeacherToGoProStream() {
    if (!janus || !isTeacher) {
        console.log("Janus no está listo o no es profesor, reintentando en 2 segundos...");
        setTimeout(connectTeacherToGoProStream, 2000);
        return;
    }
    
    console.log("Profesor: intentando conectar a stream de GoPro...");
    
    janus.attach({
        plugin: "janus.plugin.streaming",
        opaqueId: "teacher-gopro-" + Janus.randomString(12),
        success: function(pluginHandle) {
            goProTeacherHandle = pluginHandle; // Guardar la referencia
            console.log("Profesor: adjuntado plugin de streaming para GoPro, ID:", pluginHandle.getId());
            // Solicitar el stream 42 (GoPro)
            pluginHandle.send({ 
                message: { 
                    request: "watch", 
                    id: 42 
                } 
            });
        },
        error: function(error) {
            console.error("Error al adjuntar plugin de streaming para GoPro:", error);
            // Reintentar después de un tiempo
            setTimeout(connectTeacherToGoProStream, 5000);
        },
        onmessage: function(msg, jsep) {
            console.log("Mensaje de GoPro para profesor:", msg);
            
            // Manejar posibles errores en el mensaje
            if (msg.error) {
                console.error("Error en streaming de GoPro:", msg.error);
                document.querySelector('.gopro-teacher-container .student-info').textContent = "Error: " + msg.error;
                return;
            }
            
            if (jsep) {
                goProTeacherHandle.createAnswer({
                    jsep: jsep,
                    media: { audioSend: false, videoSend: false, audioRecv: false, videoRecv: true },
                    success: function(jsep) {
                        console.log("Profesor: respuesta SDP creada para GoPro");
                        goProTeacherHandle.send({ 
                            message: { request: "start" }, 
                            jsep: jsep 
                        });
                    },
                    error: function(error) {
                        console.error("Error al crear respuesta para GoPro:", error);
                        document.querySelector('.gopro-teacher-container .student-info').textContent = "Error de conexión";
                        // Reintentar
                        setTimeout(function() {
                            goProTeacherHandle.send({ message: { request: "watch", id: 42 } });
                        }, 3000);
                    }
                });
            }
            
            // Actualizar estado según mensajes
            if (msg.streaming === "event" && msg.result && msg.result.status) {
                document.querySelector('.gopro-teacher-container .student-info').textContent = "Estado: " + msg.result.status;
            }
        },
        onremotetrack: function(track, mid, on) {
            if (track.kind === "video" && on) {
                console.log("Profesor: recibido track de GoPro");
                const stream = new MediaStream([track]);
                const videoEl = document.getElementById('teacher-gopro-video');
                
                // Asegurar que el elemento existe
                if (videoEl) {
                    Janus.attachMediaStream(videoEl, stream);
                    document.querySelector('.gopro-teacher-container .student-info').textContent = "GoPro conectada";
                    
                    // Intentar reproducir el video
                    videoEl.play().catch(function(e) {
                        console.warn("Error reproduciendo video de GoPro:", e);
                        // Reintentar reproducción automática
                        setTimeout(function() {
                            videoEl.play().catch(function() {
                                console.error("No se pudo reproducir el video de GoPro");
                            });
                        }, 1000);
                    });
                } else {
                    console.error("Elemento de video para GoPro no encontrado");
                }
            }
        },
        oncleanup: function() {
            console.log("Limpieza de stream de GoPro para profesor");
            document.querySelector('.gopro-teacher-container .student-info').textContent = "GoPro desconectada";
        }
    });
}
// FUNCIONES PARA WEBRTC Y PUBLICACIÓN DE STREAMS

function startWebcam() {
    return navigator.mediaDevices.getUserMedia({
    audio: true,
    video: { width: { ideal: 640 }, height: { ideal: 480 } }
    })
    .then(function(stream) {
    mystream = stream;
    Janus.attachMediaStream(myVideoElement, stream);
    localVideoDiv.classList.remove('hidden');
    myInfoElement.textContent = "Webcam (" + myusername + ")";
    statusDiv.textContent = "Webcam iniciada. Preparando transmisión...";
    return stream;
    })
    .catch(function(error) {
    console.error("Error al acceder a la webcam:", error);
    statusDiv.textContent = "Error al iniciar webcam: " + error;
    throw error;
    });
    }

// ————————————— Función actualizada para la GoPro —————————————

function connectGoPro() {
    if (!janus) return Promise.reject("Janus no inicializado");
    
    return new Promise((resolve, reject) => {
      console.log("🔌 Conectando a GoPro...");
      
      goProPublishingStarted = false;
      
      janus.attach({
        plugin: "janus.plugin.streaming",
        opaqueId: goProOpaqueId,
        success: function(streamHandle) {
          goProRoom = streamHandle;
          console.log("🔌 Streaming plugin adjuntado (GoPro):", goProRoom.getId());
          
          goProRoom.send({ 
            message: { 
              request: "watch", 
              id: 42  // Asegúrate de que este ID es correcto
            } 
          });
        },
        onmessage: function(msg, jsep) {
          console.log("📣 GoPro stream mensaje:", msg);
          
          if (jsep) {
            console.log("🔄 GoPro stream recibió JSEP:", jsep.type);
            
            goProRoom.createAnswer({
              jsep: jsep,
              media: { 
                audioSend: false, 
                videoSend: false, 
                audioRecv: true, 
                videoRecv: true 
              },
              tracks: [
                { type: "video", recv: true, capture: false },
                { type: "audio", recv: true, capture: false }
              ],
              success: function(answerJsep) {
                goProRoom.send({ 
                  message: { request: "start" }, 
                  jsep: answerJsep 
                });
              },
              error: function(err) {
                console.error("❌ Error creando respuesta para GoPro:", err);
                reject(err);
              }
            });
          }
        },
        onremotetrack: function(track, mid, on) {
          if (!on || track.kind !== "video") return;
          
          goProStream = new MediaStream([track]);
          const videoEl = document.getElementById("goProVideo");
          if (videoEl) {
            videoEl.srcObject = goProStream;
            videoEl.muted = true;
            videoEl.play().catch(() => {});
            document.getElementById("goProVideoDiv")?.classList.remove("hidden");
            document.getElementById("goProInfo").textContent = "GoPro conectada";
          }
          
          console.log("📺 Mostrando GoPro en vista local", goProStream);
          
          // Resolvemos la promesa con el stream
          resolve(goProStream);
        },
        error: function(error) {
          console.error("❌ Error adjuntando streaming plugin para GoPro:", error);
          reject(error);
        },
        oncleanup: function() {
          console.log("🧹 GoPro stream limpiado");
          goProStream = null;
        }
      });
    });
  }

function startScreenShare() {
    return navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      .then(stream => {
        publishScreenFeed(stream);  // 👈 Aquí publicamos la pantalla
        return stream;
      })
      .catch(err => {
        console.error('Error al compartir pantalla:', err);
      });
  }
  
 
  function publishScreenFeed(stream) {
    if (!stream) {
      console.warn("No hay screen stream");
      return;
    }
    screenPublisher.send({
      message: {
        request: "join",
        room: myroom,
        ptype: "publisher",
        display: myusername + " (Pantalla)"
      }
    });
    screenPublisher.createOffer({
      media: {
        audioSend: false,
        videoSend: true,   // SÓLO vídeo
        audioRecv: false,
        videoRecv: false
      },
      success: jsep => {
        screenPublisher.send({
          message: {
            request: "publish",
            audio: false,
            video: true,
            display: myusername + " (Pantalla)"
          },
          jsep: jsep
        });
        statusDiv.textContent = "Publicando pantalla…";
        updateDebugInfo("Pantalla publicada", ++feedsDetected);
      },
      error: err => {
        console.error("❌ createOffer Pantalla:", err);
        statusDiv.textContent = "Error al publicar pantalla: " + err;
      }
    });
  }
  
//   function attachGoProToContainer(feedId) {
//     const container = document.getElementById("feed-" + feedId);
//     if (!container || !goProStream) return;
//     // Evitamos duplicados
//     if (container.querySelector(".goProVideo")) return;
  
//     // Creamos el video de la GoPro
//     const video = document.createElement("video");
//     video.className = "goProVideo";
//     video.autoplay = true;
//     video.playsinline = true;
//     video.srcObject = goProStream;
  
//     // Creamos la etiqueta informativa
//     const info = document.createElement("div");
//     info.className = "student-info";
//     info.textContent = "GoPro (suya)";
  
//     // Lo añadimos al contenedor de ese alumno
//     container.appendChild(video);
//     container.appendChild(info);
//   }

  

  
function publishGoProFeed(stream) {
    if (!goProPublisher) {
      console.warn("GoProPublisher no inicializado");
      return;
    }
    
    // Usar el stream pasado o el global
    const streamToUse = stream || goProStream;
    
    // Verificar que tenemos un stream válido
    if (!streamToUse || !streamToUse.getVideoTracks().length) {
      console.error("❌ Stream GoPro inválido o no disponible");
      statusDiv.textContent = "Error: No hay video de GoPro disponible";
      return;
    }
    
    goProPublisher.send({
      message: {
        request: "join",
        room: myroom,
        ptype: "publisher",
        display: myusername + " (GoPro)"
      }
    });
    
    goProPublisher.createOffer({
      stream: streamToUse,
      media: {
        audioRecv: false,
        videoRecv: false,
        audioSend: false,
        videoSend: true
      },
      success: function(jsep) {
        goProPublisher.send({
          message: {
            request: "publish",
            audio: false,
            video: true,
            display: myusername + " (GoPro)"
          },
          jsep: jsep
        });
        statusDiv.textContent = "Publicando GoPro…";
        updateDebugInfo("GoPro publicado", ++feedsDetected);
      },
      error: function(err) {
        console.error("❌ createOffer GoPro:", err);
        statusDiv.textContent = "Error al publicar GoPro: " + err;
      }
    });
  }
  
  

  
  


// FUNCIONES DE PUBLICACIÓN (webcam principal)
function publishStream() {
    if (!mystream) {
      alert("No hay stream de webcam disponible");
      return;
    }
    videoroom.createOffer({
      media: {
        audioSend: true,
        videoSend: true,
        audioRecv: false,
        videoRecv: false
      },
      success: jsep => {
        videoroom.send({
          message: {
            request: "publish",
            audio: true,
            video: true,
            display: myusername + " (Webcam)"
          },
          jsep: jsep
        });
        publishBtn.disabled = true;
        statusDiv.textContent = "Publicando webcam…";
        updateDebugInfo("Publicando webcam", feedsDetected);
      },
      error: err => {
        console.error("Error al crear oferta para webcam:", err);
        statusDiv.textContent = "Error al publicar webcam: " + err;
      }
    });
  }
  

// FUNCIONES PARA SALIR Y LIMPIAR
function leaveExam() {
    if (isTeacher && isRecordingAll) {
        stopRecordingAllFeeds();
    }
    for (let id in remoteFeed) {
        if (remoteFeed[id]) { remoteFeed[id].detach(); }
    }

    // Limpiar webcam principal
    if (videoroom) {
        let leaveMsg = { request: "leave" };
        videoroom.send({ message: leaveMsg });
        videoroom.detach();
        videoroom = null;
    }

    // Limpiar GoPro del profesor
    if (goProTeacherHandle) {
        goProTeacherHandle.send({ message: { request: "stop" } });
        goProTeacherHandle.detach();
        goProTeacherHandle = null;
    }

    // Limpiar GoPro si está conectada
    if (goProConnected) {
        disconnectGoPro();
    }

    // Destruir sesión Janus
    if (janus) {
        janus.destroy();
    }

    // Limpiar UI
    mainAppDiv.classList.add('hidden');
    loginDiv.classList.remove('hidden');
    localVideoDiv.classList.add('hidden');
    goProVideoDiv?.classList.add('hidden');
    videosGrid.innerHTML = '';
    statusDiv.textContent = "Desconectado";
    if (startBtn) {
        startBtn.disabled = false;
    }
    if (publishBtn) {
        publishBtn.disabled = true;
    }
    updateDebugInfo("Desconectado", 0);

    // Liberar streams
    if (mystream) {
        mystream.getTracks().forEach(track => track.stop());
        mystream = null;
    }
    
    const info = document.getElementById('goProInfo');
    if (info) info.textContent = "GoPro desconectada";
        
    // Resetear variables
    remoteFeed = {};
    remoteTracks = {};
    remoteVideos = {};
    isTeacher = false;
    goProPublishingStarted = false;
    
    // Limpiar contenedor de GoPro del profesor
    const goProTeacherContainer = document.querySelector('.gopro-teacher-container');
    if (goProTeacherContainer) {
        goProTeacherContainer.remove();
    }
}


// FUNCIONES PARA MANEJAR FEEDS REMOTOS (se mantiene igual)
// FUNCIONES PARA MANEJAR FEEDS REMOTOS
// ————————————— Funciones para manejar feeds remotos —————————————
// function updateRemoteContainer(id, display) {
//     // 1) Asegurarnos de que tenemos video
//     if (!remoteTracks[id] || !remoteTracks[id].video) return;
  
//     // 2) Sacar la clave del estudiante
//     const nameMatch = display.match(/^([^(-]+)/);
//     const studentKey = nameMatch ? nameMatch[1].trim() : 'feed-' + id;
//     const row = getOrCreateStudentRow(studentKey, studentKey);
  
//     // 3) Obtener el tipo REAL del feed
//     const publisher = feedRegistry.publishers[id];
//     const feedType = publisher ? publisher.type : 'webcam'; 
  
//     // 4) Seleccionar la celda concreta
//     //    usamos '.video-cell.' + feedType para mayor especificidad
//     const targetCell = row.querySelector(`.video-cell.${feedType}`);
//     if (!targetCell) {
//       console.error(`No se encontró la celda .video-cell.${feedType} en`, row);
//       return;
//     }
  
//     // 5) Limpiar e incrustar el <video>
//     targetCell.innerHTML = '';
//     const videoEl = document.createElement('video');
//     videoEl.autoplay = true;
//     videoEl.playsInline = true;
//     videoEl.muted = (feedType === 'gopro');
  
//     // Clonamos el track para evitar múltiples referencias al mismo objeto
//     const stream = new MediaStream([ remoteTracks[id].video.clone() ]);
//     if (feedType === 'webcam' && remoteTracks[id].audio) {
//       stream.addTrack(remoteTracks[id].audio.clone());
//     }
//     Janus.attachMediaStream(videoEl, stream);
  
//     // 6) Etiqueta
//     const label = document.createElement('div');
//     label.className = 'feed-label';
//     label.textContent = feedType.toUpperCase();
//     targetCell.appendChild(videoEl);
//     targetCell.appendChild(label);
//   }
  
  

function handleMessage(msg, jsep) {
    if (jsep) {
        console.log("Procesando JSEP:", jsep.type);
        videoroom.handleRemoteJsep({ jsep: jsep });
    }

    if (msg.error_code === 426) {           // Sala no existe
        console.warn("Sala %o no existe, creando...", myroom);
        performCreate();                     // La crea y tras éxito hace performJoin()
        return;
      }

    if (msg["videoroom"] === "joined") {
        myid = msg["id"];
        mypvtid = msg["private_id"];
        statusDiv.textContent = "Unido a la sala de examen";
        updateDebugInfo("Unido a sala", feedsDetected);
    
        // ——— Si soy ESTUDIANTE, auto‑arrancar y publicar ambos flujos ———

        if (!isTeacher) {
            startAllAndPublish();
          } else if (msg.publishers?.length) {
            msg.publishers.forEach(pub => handleNewPublisher(pub));
          }
          
        
        // if (!isTeacher) {
        //     // 1) Webcam
        //     startWebcam()
        //     startScreenShare()
            

        //     .then(() => {
        //                 publishStream();
        //     // Si necesitas el GoPro en alumno, descomenta:
        //                 //connectGoPro();
                        

        //                 publishScreenFeed();

        //                 publishGoProFeed(goProStream);
                        
                        
        //         })

                
            
        //         .catch(err => {
        //                 console.error("No se pudo arrancar la webcam:", err);
        //         });
        //         return;
        // }
    
        if (isTeacher && msg["publishers"] && msg["publishers"].length > 0) {
            console.log("PROFESOR: nuevos publishers =", msg["publishers"]);
            let publishers = msg["publishers"];
            console.log("Encontrados " + publishers.length + " publicadores existentes");
            updateDebugInfo("Detectados " + publishers.length + " publicadores", publishers.length);
            
            // Procesar cada publicador
            for (let i = 0; i < publishers.length; i++) {
              handleNewPublisher(publishers[i]);
            }

            if (isTeacher && !msg["publishers"] && msg["id"] && msg["display"]) {
                console.log("🔔 Nuevo publicador individual detectado:", msg["display"]);
                handleNewPublisher({
                  id:          msg["id"],
                  display:     msg["display"],
                  audio_codec: msg["audio_codec"],
                  video_codec: msg["video_codec"]
                });
              }

          } else {
            console.log("No hay publicadores existentes en la sala o el usuario es estudiante");
          }

          return;

          
        } else if (msg["videoroom"] === "event") {
          if (isTeacher && msg["publishers"] && msg["publishers"].length > 0) {
            let publishers = msg["publishers"];
            console.log("Nuevos publicadores:", publishers);
            updateDebugInfo("Nuevos publicadores: " + publishers.length, feedsDetected + publishers.length);
            
            // Procesar cada nuevo publicador
            for (let i = 0; i < publishers.length; i++) {
              handleNewPublisher(publishers[i]);
            }

            if (isTeacher && !msg["publishers"] && msg["id"] && msg["display"]) {
                console.log("🔔 Nuevo publicador individual detectado:", msg["display"]);
                handleNewPublisher({
                  id:          msg["id"],
                  display:     msg["display"],
                  audio_codec: msg["audio_codec"],
                  video_codec: msg["video_codec"]
                });
              }
          }
          
          // Manejar salidas y despublicaciones...
          if (msg["leaving"]) {
            let leaving = msg["leaving"];
            console.log("Publicador abandonando sala:", leaving);
            unregisterPublisher(leaving);
            removeFeed(leaving);
            updateDebugInfo("Feed desconectado", feedsDetected - 1);
          } else if (msg["unpublished"]) {
            let unpublished = msg["unpublished"];
            if (unpublished === 'ok') {
              console.log("Feed local dejó de publicar");
            } else {
              console.log("Publicador dejó de publicar:", unpublished);
              unregisterPublisher(unpublished);
              removeFeed(unpublished);
              updateDebugInfo("Feed dejó de publicar", feedsDetected - 1);
            }
          }
        if (msg["configured"] === "ok") {
            statusDiv.textContent = "Video publicado exitosamente";
            updateDebugInfo("Publicación exitosa", feedsDetected);

            if (!isTeacher && !goProRequested) {
                console.log("👟 Alumno: webcam OK, ahora conecto y publico GoPro");
                goProRequested = true;      // evita llamadas repetidas
                // connectGoPro();             // attach streaming + publishGoProFeed()
            }

        }
    } else if (msg["error"]) {
        console.error("Error en videoroom:", msg["error"]);
        statusDiv.textContent = "Error: " + msg["error"];
    }
}

// Estructura de datos separada para cada tipo de feed
if (!window.remoteWebcamTracks) window.remoteWebcamTracks = {};
if (!window.remoteGoProTracks) window.remoteGoProTracks = {};
if (!window.remoteScreenTracks) window.remoteScreenTracks = {};


function subscribeToFeed(id, display, audioCodec, videoCodec) {
    janus.attach({
      plugin: "janus.plugin.videoroom",
      opaqueId: `${opaqueId}-sub-${id}`,
      success: function(handle) {
        // 1) Unirte al feed
        handle.send({
          message: {
            request: "join",
            room: myroom,
            ptype: "subscriber",
            feed: id,
            private_id: mypvtid,
            audio_codec: audioCodec,
            video_codec: videoCodec
          }
        });
  
        // 2) Definir aquí onmessage/track/cleanup, donde 'handle' SÍ existe
        handle.onmessage = (msg, jsep) => {
          if (jsep) {
            handle.createAnswer({
              jsep,
              media: { audioSend: false, videoSend: false, audioRecv: true, videoRecv: true },
              success: answer => handle.send({ message: { request: "start" }, jsep: answer }),
              error: e => console.error("Error creando answer:", e)
            });
          }
        };
        handle.onremotetrack = (track, mid, on) => {
            if (!on) return;
            const publisherId = id;
            const publisherInfo = feedRegistry.publishers[publisherId];
            if (!publisherInfo) return;
            const studentName = publisherInfo.studentName;
            const trackKind = track.kind;
            const trackLabel = track.label;
            const trackId = track.id;
            const publisherType = publisherInfo.type;
          
            if (!feedRegistry.streams[studentName]) {
              feedRegistry.streams[studentName] = { webcam: null, gopro: null, screen: null };
            }
          
            let stream = feedRegistry.streams[studentName][publisherType];
            if (!stream) {
              stream = new MediaStream();
              feedRegistry.streams[studentName][publisherType] = stream;
            }
          
            stream.addTrack(track.clone());
          
            console.log(`➕ Track <span class="math-inline">\{trackKind\} \(</span>{trackLabel} - ${trackId}) recibido para <span class="math-inline">\{studentName\} \(</span>{publisherType})`);
            updateStudentCell(getOrCreateStudentRow(studentName, studentName), studentName, publisherType);
          };


        handle.oncleanup = () => {
          console.log(`🧹 Limpieza suscriptor para feed ${id}`);
        };
      },
      error: err => console.error(`❌ Error attach suscriptor ${id}:`, err)
    });
  }
  
  
  
  

function updateSpecificFeedDisplay(id, display, feedType) {
  // Extraer el nombre del estudiante
  const nameMatch = display.match(/^([^(-]+)/);
  const studentKey = nameMatch ? nameMatch[1].trim() : 'feed-' + id;
  const row = getOrCreateStudentRow(studentKey, studentKey);
  
  console.log(`🎬 Actualizando display para ${studentKey} - feed tipo: ${feedType}`);
  
  // Seleccionar la celda según el tipo específico
  let targetCell = null;
  let sourceTrack = null;
  let sourceAudio = null;
  
  if (feedType === "gopro") {
    targetCell = row.querySelector('.gopro');
    if (remoteGoProTracks[id] && remoteGoProTracks[id].video) {
      sourceTrack = remoteGoProTracks[id].video;
    }
  } else if (feedType === "screen") {
    targetCell = row.querySelector('.screen');
    if (remoteScreenTracks[id] && remoteScreenTracks[id].video) {
      sourceTrack = remoteScreenTracks[id].video;
    }
  } else { // webcam
    targetCell = row.querySelector('.webcam');
    if (remoteWebcamTracks[id] && remoteWebcamTracks[id].video) {
      sourceTrack = remoteWebcamTracks[id].video;
      sourceAudio = remoteWebcamTracks[id].audio;
    }
  }
  
  if (!targetCell || !sourceTrack) {
    console.error(`❌ No se pudo actualizar feed ${feedType} - celda o track no disponible`);
    return;
  }
  
  // Limpiar la celda
  targetCell.innerHTML = '';
  
  // Crear video element
  const videoEl = document.createElement('video');
  videoEl.autoplay = true;
  videoEl.playsInline = true;
  videoEl.muted = feedType === "gopro"; // Silenciar GoPro
  
  // Crear stream dedicado para este feed
  const newStream = new MediaStream([sourceTrack.clone()]);
  if (sourceAudio) {
    newStream.addTrack(sourceAudio.clone());
  }
  
  // Attach stream
  Janus.attachMediaStream(videoEl, newStream);
  
  // Agregar a la celda
  targetCell.appendChild(videoEl);
  
  // Agregar label para debug
  const label = document.createElement('div');
  label.className = 'feed-label';
  label.textContent = feedType.toUpperCase();
  targetCell.appendChild(label);
  
  console.log(`✅ Video ${feedType} actualizado para ${studentKey}`);
}

// Función para remover un feed: elimina el elemento DOM y libera el handle en Janus.
function removeFeed(id) {
    const element = document.getElementById('feed-' + id);
    if (element) { element.remove(); }
    if (remoteFeed[id]) { remoteFeed[id].detach(); delete remoteFeed[id]; }
    if (remoteTracks[id]) { delete remoteTracks[id]; }
    if (remoteVideos[id]) { delete remoteVideos[id]; }
    if (feedsDetected > 0) feedsDetected--;
    updateDebugInfo("Eliminado feed " + id, feedsDetected);
}


// FUNCIONES DE GRABACIÓN (para el profesor)
// Se mantiene lo esencial para iniciar/detener grabaciones por feed.
function startRecordingAllFeeds() {
    if (isTeacher && Object.keys(remoteFeed).length > 0) {
        isRecordingAll = true;
        const recordingPromises = Object.keys(remoteFeed).map(feedId => {
            return new Promise((resolve, reject) => {
                const timestamp = Date.now();
                const recordFileName = `examen_estudiante_${feedId}_${timestamp}`;
                remoteFeed[feedId].send({
                    message: { request: "record", action: "start", name: recordFileName, video: true, audio: true },
                    success: () => {
                        recordings[feedId] = { fileName: recordFileName, startTime: timestamp, studentName: getStudentName(feedId) || feedId };
                        resolve(feedId);
                    },
                    error: (error) => reject(error)
                });
            });
        });
        Promise.allSettled(recordingPromises).then(results => {
            const successCount = results.filter(r => r.status === 'fulfilled').length;
            updateRecordingStatus();
            if (successCount > 0) {
                statusDiv.textContent = `Grabación iniciada para ${successCount} estudiantes`;
                alert(`Grabación iniciada para ${successCount} estudiantes`);
            } else {
                alert("No se pudo iniciar la grabación para ningún estudiante");
                isRecordingAll = false;
            }
        });
    } else {
        alert("No hay estudiantes para grabar o no eres profesor");
    }
}

function stopRecordingAllFeeds() {
    if (isTeacher && isRecordingAll) {
        const stopPromises = Object.keys(remoteFeed).map(feedId => {
            if (remoteFeed[feedId] && recordings[feedId]) {
                return new Promise((resolve, reject) => {
                    remoteFeed[feedId].send({
                        message: { request: "record", action: "stop" },
                        success: () => {
                            requestProcessRecording(recordings[feedId].fileName, feedId);
                            delete recordings[feedId];
                            resolve(feedId);
                        },
                        error: (error) => reject(error)
                    });
                });
            }
        }).filter(Boolean);
        Promise.allSettled(stopPromises).then(results => {
            const successCount = results.filter(r => r.status === 'fulfilled').length;
            updateRecordingStatus();
            if (successCount > 0) {
                statusDiv.textContent = `Grabación detenida para ${successCount} estudiantes`;
                alert(`Grabación detenida para ${successCount} estudiantes. Las grabaciones se están procesando.`);
            }
            isRecordingAll = false;
        });
    }
}

function updateRecordingStatus() {
    const recordingStatusDiv = document.getElementById('recordingStatus');
    const recordingCount = Object.keys(recordings).length;
    if (recordingStatusDiv) {
        if (recordingCount > 0) {
            recordingStatusDiv.textContent = `Grabando ${recordingCount} estudiante${recordingCount > 1 ? 's' : ''}`;
            recordingStatusDiv.style.color = 'red';
            Object.keys(recordings).forEach(feedId => {
                const infoElement = document.querySelector(`#feed-${feedId} .student-info`);
                if (infoElement) {
                    const secondsRecording = Math.floor((Date.now() - recordings[feedId].startTime) / 1000);
                    const minutes = Math.floor(secondsRecording / 60);
                    const seconds = secondsRecording % 60;
                    const timeDisplay = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
                    if (!infoElement.querySelector('.recording-indicator')) {
                        infoElement.innerHTML = `${infoElement.textContent} <span class="recording-indicator" style="color:red">⚫ REC ${timeDisplay}</span>`;
                    } else {
                        infoElement.querySelector('.recording-indicator').textContent = `⚫ REC ${timeDisplay}`;
                    }
                }
            });
        } else {
            recordingStatusDiv.textContent = 'No hay grabaciones activas';
            recordingStatusDiv.style.color = 'black';
            document.querySelectorAll('.recording-indicator').forEach(indicator => indicator.remove());
        }
    }
}

function startRecording(feedId) {
    if (remoteFeed[feedId]) {
        const timestamp = Date.now();
        const recordFileName = `examen_estudiante_${feedId}_${timestamp}`;
        remoteFeed[feedId].send({
            message: { request: "record", action: "start", name: recordFileName, video: true, audio: true },
            success: () => {
                recordings[feedId] = { fileName: recordFileName, startTime: timestamp, studentName: getStudentName(feedId) || feedId };
                updateRecordingStatus();
                // Deshabilitar el botón de grabar y habilitar el de detener
                const controlsDiv = document.querySelector(`#feed-${feedId} div`);
                if (controlsDiv) {
                    const recordBtn = controlsDiv.querySelector('button');
                    if (recordBtn) {
                        recordBtn.disabled = true;
                        if (recordBtn.nextElementSibling) { recordBtn.nextElementSibling.disabled = false; }
                    }
                }
                alert(`Grabación iniciada para estudiante ${getStudentName(feedId)}`);
            },
            error: (error) => alert(`Error al iniciar grabación: ${error}`)
        });
    }
}

function stopRecording(feedId) {
    if (remoteFeed[feedId] && recordings[feedId]) {
        remoteFeed[feedId].send({
            message: { request: "record", action: "stop" },
            success: () => {
                requestProcessRecording(recordings[feedId].fileName, feedId);
                delete recordings[feedId];
                updateRecordingStatus();
                const controlsDiv = document.querySelector(`#feed-${feedId} div`);
                if (controlsDiv) {
                    const recordBtn = controlsDiv.querySelector('button');
                    if (recordBtn) {
                        recordBtn.disabled = false;
                        if (recordBtn.nextElementSibling) { recordBtn.nextElementSibling.disabled = true; }
                    }
                }
                alert(`Grabación detenida para estudiante ${getStudentName(feedId)}. La grabación se está procesando.`);
            },
            error: (error) => alert(`Error al detener grabación: ${error}`)
        });
    } else {
        alert("No se encontró el feed o no hay grabación activa");
    }
}

// Se utiliza para notificar al backend que procese el archivo grabado (implementar según tus necesidades)
function requestProcessRecording(fileName, feedId) {
    console.log(`Procesando grabación: ${fileName} para feed ${feedId}`);
    // Implementa aquí la llamada AJAX/fetch al backend si es necesario.
}

// Función auxiliar para obtener el nombre del estudiante
function getStudentName(feedId) {
    return (remoteTracks[feedId] && remoteTracks[feedId].display) ? remoteTracks[feedId].display : feedId;
}


// ===================================================
// CONEXIÓN A JANUS Y UNIÓN A LA SALA
function initializeJanus() {
    Janus.init({
        debug: "all",
        callback: function() {
            if (!Janus.isWebrtcSupported()) {
                alert("Tu navegador no soporta WebRTC. Usa un navegador moderno como Chrome o Firefox.");
                return;
            }
            // startBtn.disabled = false;
             statusDiv.textContent = "Listo para conectar";
            updateDebugInfo("Inicializado");
            connectToJanus();
        }
    });
}
function connectToJanus() {
    updateDebugInfo("Conectando...");
    const serverIP    = window.location.hostname;
    const janusServer = window.JANUS_SERVER || `http://${serverIP}:8088/janus`;
    
    janus = new Janus({
      server: janusServer,
      withCredentials: false,
      success: function() {
        updateDebugInfo("Conectado al servidor Janus");
  
        async function initializePlugins() {
            // 1) Webcam
            videoroom = await attachVideoRoomPlugin(opaqueId, (msg, jsep, handle) => {
              // sólo aquí llamas a tu lógica central
              handleMessage(msg, jsep);
            });

            if(!isTeacher){
          
            // 2) Screen
            screenPublisher = await attachVideoRoomPlugin(screenOpaqueId, (msg, jsep, handle) => {
              console.log("📺 Screen onmessage:", msg);
              // NO uses `handle` aquí si no es necesario, o referéncialo explícitamente:
              // if (jsep) handle.handleRemoteJsep({ jsep });
            });
          
            // 3) GoPro‑publisher
            goProPublisher = await attachVideoRoomPlugin(goProOpaqueId, (msg, jsep, handle) => {
              console.log("🎥 GoProPub onmessage:", msg);
            });
        }
          
            console.log("✅ Todos los plugins VideoRoom adjuntados");
          }
          
      
          // 2) Cuando ya tengamos los 3 plugins, arrancamos la captura/publicación
          (async () => {
            try {
              await initializePlugins();

              joinRoom();

              if (!isTeacher){

                await startAllAndPublish();
                
                return;
              }
            //   if (!isTeacher) {
            //     await startAllAndPublish();  // tu rutina que hace startWebcam(), publishStream(), startScreenShare(), publishScreenFeed(), connectGoPro(), publishGoProFeed()
            //   }
            } catch (e) {
              console.error("Error al inicializar plugins o publicar medios:", e);
              statusDiv.textContent = "Error init: " + e;
            }
          })();
        
  
        if (isTeacher) {
          // Si eres profe, conectamos la GoPro del profesor (streaming) tras un breve retraso
          setTimeout(connectTeacherToGoProStream, 1000);
        }
      },
      error: function(error) {
        console.error("Error al conectar a Janus:", error);
        statusDiv.textContent = "Error al conectar a Janus: " + error;
      },
      destroyed: function() {
        window.location.reload();
      }
    });
  }
  


  function joinRoom() {
    const join = {
      request: "join",
      room:   myroom,
      ptype:   "publisher",
      display: myusername,
      private_id: mypvtid  // sólo necesario si ya lo tienes
    };
    videoroom.send({ message: join });
    updateDebugInfo("Uniendo a sala " + myroom, feedsDetected);
  }
  


function performJoin() {
    const joinMsg = { request: "join", room: myroom, ptype: "publisher", display: myusername };
    videoroom.send({ message: joinMsg });
    updateDebugInfo("Uniendo a sala " + myroom, feedsDetected);
}

function performCreate() {
    const createMsg = {
        request: "create",
        room: myroom,
        publishers: 30,
        bitrate: 500000,
        record: true,
        rec_dir: "/var/recordings",
        record_file_format: "webm",
        record_audio: true,
        record_video: true,
        audio_active_packets: 50,
        video_active_mode: true,
        notify_joining: true,
        audiocodec: "opus",
        videocodec: "vp8,h264",
        description: "Sala de Examen " + myroom,
        permanent: false
    };
    videoroom.send({
        message: createMsg,
        success: function(result) { performJoin(); },
        error: function(error) { console.error("Error al crear la sala:", error); performJoin(); }
    });
}

function enableGoProButton() {
    startGoProBtn.disabled = false;
}

window.feedRegistry = {
    publishers: {},  // Almacena info de publicadores por ID
    streams: {}      // Almacena streams organizados por estudiante y tipo
  };
  
  // Función para registrar un nuevo publicador
  function registerPublisher(id, display, type) {
    const studentName = display.replace(/^(GOPRO-|SCREEN-)?/, '').replace(/ \(.+\)$/, '').trim();
    
    console.log(`🔵 Registrando publicador: ${type} - ID: ${id} - Estudiante: ${studentName}`);
    
    feedRegistry.publishers[id] = {
      id: id,
      studentName: studentName,
      display: display,
      type: type,
      active: true
    };
    
    // Asegurar que existe la estructura para este estudiante
    if (!feedRegistry.streams[studentName]) {
      feedRegistry.streams[studentName] = {
        webcam: null,
        gopro: null,
        screen: null
      };
    }
    
    return studentName;
  }
  
  // Función llamada cuando se detecta un nuevo publicador en el mensaje de Janus
  function handleNewPublisher(publisher) {
    const id = publisher.id;
    const display = publisher.display;
    
    let type = "webcam";
    if (/\(GoPro\)$/i.test(display)) {
      type = "gopro";
    } else if (/\(Pantalla\)$/i.test(display)) {
      type = "screen";
    }
    

    console.log(
        `🔔 Nuevo publisher: id=${publisher.id}, display="${display}", detectado type="${type}"`
      );

    
    // Registrar el publicador
    const studentName = registerPublisher(id, display, type);
    
    console.log(`🔔 Nuevo publicador detectado: ${type} de ${studentName} (ID: ${id})`);
    
    // Suscribirse al feed con un pequeño retraso para GoPro
    if (type === "gopro") {
      setTimeout(() => {
        subscribeToFeed(id, display, publisher.audio_codec, publisher.video_codec);
      }, 200);
    } else {
      subscribeToFeed(id, display, publisher.audio_codec, publisher.video_codec);
    }
  }

  function unregisterPublisher(id) {
    if (feedRegistry.publishers[id]) {
      const publisher = feedRegistry.publishers[id];
      console.log(`🔴 Dando de baja publicador: ${publisher.type} de ${publisher.studentName}`);
      
      // Marcar como inactivo
      publisher.active = false;
      
      // Limpiar el stream correspondiente
      if (feedRegistry.streams[publisher.studentName]) {
        feedRegistry.streams[publisher.studentName][publisher.type] = null;
      }
      
      // Actualizar la UI para este estudiante
      updateStudentRow(publisher.studentName);
    }
  }


// Función para actualizar la visualización de un estudiante
function updateStudentRow(studentName) {
    if (!feedRegistry.streams[studentName]) return;
    
    // Obtener o crear la fila para este estudiante
    const row = getOrCreateStudentRow(studentName, studentName);
    
    // Actualizar cada tipo de celda
    updateStudentCell(row, studentName, "webcam");
    updateStudentCell(row, studentName, "gopro");
    updateStudentCell(row, studentName, "screen");
  }
  
  // Función para actualizar una celda específica
  function updateStudentCell(row, studentName, cellType) {
    const cell = row.querySelector('.' + cellType);
    if (!cell) return;
  
    const stream = feedRegistry.streams[studentName]?.[cellType];
  
    console.log(`🔍 [${cellType}] Stream tracks:`, stream ? stream.getVideoTracks().map(t => ({ label: t.label, id: t.id })) : 'SIN STREAM');
  
    cell.innerHTML = '';
  
    if (!stream || stream.getVideoTracks().length === 0) {
      const placeholder = document.createElement('div');
      placeholder.className = 'feed-placeholder';
      placeholder.textContent = cellType.toUpperCase() + ' (sin señal)';
      cell.appendChild(placeholder);
      return;
    }
  
    const videoEl = document.createElement('video');
    videoEl.autoplay = true;
    videoEl.playsInline = true;
    videoEl.muted = (cellType === 'gopro');
  
    videoEl.srcObject = stream;
    videoEl.onloadedmetadata = () => videoEl.play().catch(() => {});
  
    cell.appendChild(videoEl);
  
    const typeLabel = document.createElement('div');
    typeLabel.className = 'feed-label';
    typeLabel.textContent = cellType.toUpperCase();
    cell.appendChild(typeLabel);
  }

  // Punto único de “boot” para alumnos:
  async function startAllAndPublish() {
    try {
      statusDiv.textContent = "Iniciando medios...";
      
      // 1) Iniciar la webcam y publicarla
      await startWebcam();
      publishStream();  // Publicamos webcam después de iniciarla
      
      // 2) Iniciar pantalla (startScreenShare ya publica internamente)
      await startScreenShare();
      
      // 3) Conectar y obtener GoPro
      await connectGoPro();
      // Publicar GoPro después de conectarla
      publishGoProFeed();
      
      statusDiv.textContent = "Todos los medios publicados";
    } catch (err) {
      console.error("Error iniciando medios:", err);
      statusDiv.textContent = "Error: " + err.message || err;
    }
  }