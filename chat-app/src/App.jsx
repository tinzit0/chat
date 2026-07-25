// src/App.jsx
import React, { useState, useEffect, useRef } from 'react';
import { auth, db } from './firebase';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut 
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  doc,
  setDoc,
  deleteDoc,
  getDoc,
  getDocs,
  writeBatch,
  updateDoc
} from 'firebase/firestore';

// Servidores STUN y TURN (Crucial para conectar 4G con Wi-Fi)
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { 
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    { 
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ]
};

function App() {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombrePersona, setNombrePersona] = useState('');
  const [esRegistro, setEsRegistro] = useState(false);
  const [editandoNombre, setEditandoNombre] = useState(false);
  const [nuevoNombreInput, setNuevoNombreInput] = useState('');
  const [error, setError] = useState('');

  const [usuarios, setUsuarios] = useState([]);
  const [chatActivo, setChatActivo] = useState(null);
  const [mensajes, setMensajes] = useState([]);
  const [nuevoMensaje, setNuevoMensaje] = useState('');
  
  const [subiendoImagen, setSubiendoImagen] = useState(false);
  
  // ESTADOS Y REFERENCIAS PARA LLAMADAS
  const [llamadaEnCurso, setLlamadaEnCurso] = useState(false);
  const [tipoLlamada, setTipoLlamada] = useState('voz');
  const [micSilenciado, setMicSilenciado] = useState(false);
  const [camApagada, setCamApagada] = useState(false);
  const [estadoConexion, setEstadoConexion] = useState('Conectando...');

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null); 
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null); // Contenedor persistente
  const unsubLlamadaRef = useRef([]);

  const [grabandoAudio, setGrabandoAudio] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const galleryInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const scrollRef = useRef(null);
  
  const notifAudioRef = useRef(new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'));

  const IMGBB_API_KEY = import.meta.env.VITE_IMGBB_API_KEY;
  const ES_ADMIN = user?.email === 'martinub250@gmail.com';

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (usuarioActual) => {
      setUser(usuarioActual);
      if (usuarioActual) {
        const userDocRef = doc(db, 'usuarios', usuarioActual.uid);
        const snapshot = await getDocs(query(collection(db, 'usuarios')));
        let existe = false;
        snapshot.forEach((d) => {
          if (d.id === usuarioActual.uid && d.data().nombre) {
            existe = true;
          }
        });

        if (!existe) {
          const nombreAUsar = nombrePersona.trim() || usuarioActual.email.split('@')[0];
          await setDoc(userDocRef, {
            uid: usuarioActual.uid,
            email: usuarioActual.email,
            nombre: nombreAUsar
          }, { merge: true });
        }
      }
    });
    return () => unsubscribe();
  }, [nombrePersona]);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(collection(db, 'usuarios'), (snapshot) => {
      const lista = [];
      snapshot.forEach((docSnap) => {
        const datos = docSnap.data();
        if (datos.uid !== user.uid) {
          lista.push(datos);
        } else {
          setNuevoNombreInput(datos.nombre || user.email.split('@')[0]);
        }
      });
      setUsuarios(lista);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user || !chatActivo) return;
    const chatId = [user.uid, chatActivo.uid].sort().join('_');
    const q = query(
      collection(db, 'chats_privados', chatId, 'mensajes'),
      orderBy('creadoEn', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        docs.push({ id: docSnap.id, ...data });

        if (data.deUid !== user.uid && !data.leido) {
          updateDoc(doc(db, 'chats_privados', chatId, 'mensajes', docSnap.id), {
            leido: true
          }).catch(() => {});
        }
      });

      if (docs.length > mensajes.length && mensajes.length > 0) {
        const ultimoMensaje = docs[docs.length - 1];
        if (ultimoMensaje.deUid !== user.uid) {
          lanzarNotificacion(
            chatActivo.nombre || 'Nuevo Mensaje', 
            ultimoMensaje.esLlamada ? '📞 Te están llamando...' : (ultimoMensaje.texto || '📷 Foto o 🎤 Audio')
          );
        }
      }

      setMensajes(docs);
    });
    return () => unsubscribe();
  }, [user, chatActivo, mensajes.length]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes, subiendoImagen, grabandoAudio]);

  // Sincronizar reproductores con React
  useEffect(() => {
    if (llamadaEnCurso) {
      if (remoteVideoRef.current && remoteStreamRef.current) {
        remoteVideoRef.current.srcObject = remoteStreamRef.current;
      }
      if (localVideoRef.current && localStreamRef.current && !camApagada) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
    }
  }, [llamadaEnCurso, camApagada]);

  const lanzarNotificacion = (remitente, texto) => {
    try {
      notifAudioRef.current.volume = 0.1;
      notifAudioRef.current.currentTime = 0;
      notifAudioRef.current.play().catch(() => {});
    } catch (e) {}

    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(`💬 ${remitente}`, { body: texto });
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    
    const emailAProcesar = email.trim();
    const passAProcesar = password;

    if (!emailAProcesar || !passAProcesar) {
      setError('Por favor completa todos los campos.');
      return;
    }

    try {
      if (esRegistro) {
        if (!nombrePersona.trim()) {
          setError('Por favor ingresa un nombre para mostrar.');
          return;
        }
        const cred = await createUserWithEmailAndPassword(auth, emailAProcesar, passAProcesar);
        await setDoc(doc(db, 'usuarios', cred.user.uid), {
          uid: cred.user.uid,
          email: cred.user.email,
          nombre: nombrePersona.trim()
        });
      } else {
        await signInWithEmailAndPassword(auth, emailAProcesar, passAProcesar);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const guardarNuevoNombre = async () => {
    if (!user || !nuevoNombreInput.trim()) return;
    try {
      await setDoc(doc(db, 'usuarios', user.uid), {
        nombre: nuevoNombreInput.trim()
      }, { merge: true });
      setEditandoNombre(false);
    } catch (err) {
      console.error("Error al actualizar nombre:", err);
    }
  };

  const handleEnviarMensaje = async (e) => {
    e.preventDefault();
    if (!nuevoMensaje.trim() || !chatActivo) return;
    const chatId = [user.uid, chatActivo.uid].sort().join('_');

    try {
      await addDoc(collection(db, 'chats_privados', chatId, 'mensajes'), {
        deUid: user.uid,
        paraUid: chatActivo.uid,
        texto: nuevoMensaje.trim(),
        leido: false,
        creadoEn: serverTimestamp()
      });
      setNuevoMensaje('');
    } catch (err) {
      console.error("Error enviando mensaje:", err);
    }
  };

  const obtenerStreamMultimedia = async (modoVideo) => {
    try {
      // Pedimos explícitamente acceso a micrófono siempre
      return await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: modoVideo ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } : false
      });
    } catch (e) {
      // Fallback seguro a solo audio
      return await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    }
  };

  // --- ARQUITECTURA TIPO WHATSAPP (CON COLA DE EVENTOS) --- //

  const iniciarLlamadaNativa = async (modo = 'voz') => {
    if (!chatActivo || !user) return;
    const chatId = [user.uid, chatActivo.uid].sort().join('_');
    const callId = `call_${Date.now()}`;
    
    setTipoLlamada(modo);
    setCamApagada(modo === 'voz');
    setEstadoConexion('Iniciando...');
    setLlamadaEnCurso(true);

    try {
      const stream = await obtenerStreamMultimedia(modo === 'video');
      localStreamRef.current = stream;

      const pc = new RTCPeerConnection(ICE_SERVERS);
      peerConnectionRef.current = pc;

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          setEstadoConexion('¡Conectado!');
        } else if (pc.iceConnectionState === 'failed') {
          setEstadoConexion('Fallo de red (Cuelgue e intente de nuevo)');
        } else if (pc.iceConnectionState === 'disconnected') {
          colgarLlamada();
        }
      };

      remoteStreamRef.current = new MediaStream();
      pc.ontrack = (event) => {
        remoteStreamRef.current.addTrack(event.track);
        if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== remoteStreamRef.current) {
          remoteVideoRef.current.srcObject = remoteStreamRef.current;
        }
        // Forzar reproducción para saltar bloqueos de celulares
        remoteVideoRef.current?.play().catch(e => console.warn("Autoplay bloqueado:", e));
      };

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      const callerCandidates = collection(db, 'chats_privados', chatId, 'llamada_activa', callId, 'callerCandidates');
      const calleeCandidates = collection(db, 'chats_privados', chatId, 'llamada_activa', callId, 'calleeCandidates');
      const llamadaDocRef = doc(db, 'chats_privados', chatId, 'llamada_activa', callId);

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          addDoc(callerCandidates, e.candidate.toJSON());
        }
      };

      // SISTEMA DE COLA: Guardar candidatos remotos si llegan antes de tiempo
      const candidatosRemotosQueue = [];
      const unsub2 = onSnapshot(calleeCandidates, (snap) => {
        snap.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const candidate = new RTCIceCandidate(change.doc.data());
            if (pc.remoteDescription) {
              pc.addIceCandidate(candidate).catch(e => console.error("Error ICE:", e));
            } else {
              candidatosRemotosQueue.push(candidate);
            }
          }
        });
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await setDoc(llamadaDocRef, { offer: { type: offer.type, sdp: offer.sdp }, de: user.uid, modo: modo });

      const unsub1 = onSnapshot(llamadaDocRef, async (snap) => {
        const data = snap.data();
        if (!pc.currentRemoteDescription && data?.answer) {
          const answer = new RTCSessionDescription(data.answer);
          await pc.setRemoteDescription(answer);
          // Procesar todos los paquetes atrasados (Método WhatsApp)
          candidatosRemotosQueue.forEach(c => pc.addIceCandidate(c).catch(e => console.error("Error ICE en cola:", e)));
          candidatosRemotosQueue.length = 0; // Limpiar cola
        }
      });

      unsubLlamadaRef.current = [unsub1, unsub2];

      await addDoc(collection(db, 'chats_privados', chatId, 'mensajes'), {
        deUid: user.uid,
        paraUid: chatActivo.uid,
        texto: modo === 'video' ? '📹 Inició una videollamada.' : '📞 Inició una llamada de voz.',
        esLlamada: true,
        modoLlamada: modo,
        callId: callId,
        leido: false,
        creadoEn: serverTimestamp()
      });

    } catch (err) {
      alert(`Error de conexión o permisos. Asegúrate de usar HTTPS. Detalle: ${err.message}`);
      colgarLlamada();
    }
  };

  const responderLlamadaNativa = async (modo = 'voz', callIdParam = null) => {
    if (!chatActivo || !user || !callIdParam) return;
    const chatId = [user.uid, chatActivo.uid].sort().join('_');
    const llamadaDocRef = doc(db, 'chats_privados', chatId, 'llamada_activa', callIdParam);
    const callerCandidates = collection(db, 'chats_privados', chatId, 'llamada_activa', callIdParam, 'callerCandidates');
    const calleeCandidates = collection(db, 'chats_privados', chatId, 'llamada_activa', callIdParam, 'calleeCandidates');

    setTipoLlamada(modo);
    setCamApagada(modo === 'voz');
    setEstadoConexion('Conectando...');
    setLlamadaEnCurso(true);

    try {
      const stream = await obtenerStreamMultimedia(modo === 'video');
      localStreamRef.current = stream;

      const pc = new RTCPeerConnection(ICE_SERVERS);
      peerConnectionRef.current = pc;

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          setEstadoConexion('¡Conectado!');
        } else if (pc.iceConnectionState === 'failed') {
          setEstadoConexion('Fallo de red (Cuelgue e intente de nuevo)');
        } else if (pc.iceConnectionState === 'disconnected') {
          colgarLlamada();
        }
      };

      remoteStreamRef.current = new MediaStream();
      pc.ontrack = (event) => {
        remoteStreamRef.current.addTrack(event.track);
        if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== remoteStreamRef.current) {
          remoteVideoRef.current.srcObject = remoteStreamRef.current;
        }
        // Forzar reproducción para saltar bloqueos de celulares
        remoteVideoRef.current?.play().catch(e => console.warn("Autoplay bloqueado:", e));
      };

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          addDoc(calleeCandidates, e.candidate.toJSON());
        }
      };

      const llamadaSnap = await getDoc(llamadaDocRef);
      if (!llamadaSnap.exists()) {
        alert("La llamada ha finalizado.");
        colgarLlamada();
        return;
      }

      const offerData = llamadaSnap.data().offer;
      await pc.setRemoteDescription(new RTCSessionDescription(offerData));

      // SISTEMA DE COLA: Guardar candidatos del que llama si llegan antes de tiempo
      const candidatosRemotosQueue = [];
      const unsub = onSnapshot(callerCandidates, (snap) => {
        snap.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const candidate = new RTCIceCandidate(change.doc.data());
            if (pc.localDescription) { 
              pc.addIceCandidate(candidate).catch(e => console.error("Error ICE:", e));
            } else {
              candidatosRemotosQueue.push(candidate);
            }
          }
        });
      });

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await updateDoc(llamadaDocRef, { answer: { type: answer.type, sdp: answer.sdp } });
      
      // Procesar paquetes retrasados
      candidatosRemotosQueue.forEach(c => pc.addIceCandidate(c).catch(e => console.error("Error ICE en cola:", e)));
      candidatosRemotosQueue.length = 0;

      unsubLlamadaRef.current = [unsub];

    } catch (err) {
      alert(`No se pudo responder. Asegúrate de usar HTTPS. Detalle: ${err.message}`);
      colgarLlamada();
    }
  };

  const colgarLlamada = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach(track => track.stop());
    }

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    if (unsubLlamadaRef.current && Array.isArray(unsubLlamadaRef.current)) {
      unsubLlamadaRef.current.forEach(u => u && u());
      unsubLlamadaRef.current = [];
    }

    setLlamadaEnCurso(false);
    setMicSilenciado(false);
    setCamApagada(false);
    setEstadoConexion('Finalizada');
  };

  const alternarMic = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setMicSilenciado(!audioTrack.enabled);
      }
    }
  };

  const alternarCam = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setCamApagada(!videoTrack.enabled);
      }
    }
  };

  const subirImagenAPI = async (file) => {
    if (!file || !chatActivo) return;

    setSubiendoImagen(true);
    try {
      const formData = new FormData();
      formData.append('image', file);

      const respuesta = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
        method: 'POST',
        body: formData,
      });
      
      const datos = await respuesta.json();

      if (datos.success) {
        const urlImagen = datos.data.url;
        const chatId = [user.uid, chatActivo.uid].sort().join('_');
        
        await addDoc(collection(db, 'chats_privados', chatId, 'mensajes'), {
          deUid: user.uid,
          paraUid: chatActivo.uid,
          texto: '',
          imagenUrl: urlImagen,
          leido: false,
          creadoEn: serverTimestamp()
        });
      } else {
        alert("Error al subir la imagen.");
      }
    } catch (error) {
      console.error("Error:", error);
      alert("Hubo un problema de conexión al subir la imagen.");
    }
    setSubiendoImagen(false);

    if (galleryInputRef.current) galleryInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const iniciarGrabacionAudio = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      let options = {};
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        options = { mimeType: 'audio/webm;codecs=opus' };
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        options = { mimeType: 'audio/mp4' };
      } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
        options = { mimeType: 'audio/ogg' };
      }

      mediaRecorderRef.current = new MediaRecorder(stream, options);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        const mimeTypeUsado = mediaRecorderRef.current.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeTypeUsado });
        
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = reader.result;
          if (chatActivo && base64Audio) {
            const chatId = [user.uid, chatActivo.uid].sort().join('_');
            await addDoc(collection(db, 'chats_privados', chatId, 'mensajes'), {
              deUid: user.uid,
              paraUid: chatActivo.uid,
              texto: '',
              audioUrl: base64Audio,
              leido: false,
              creadoEn: serverTimestamp()
            });
          }
        };

        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start();
      setGrabandoAudio(true);
    } catch (err) {
      alert("No se pudo acceder al micrófono. Revisa los permisos del navegador.");
    }
  };

  const detenerGrabacionAudio = () => {
    if (mediaRecorderRef.current && grabandoAudio) {
      mediaRecorderRef.current.stop();
      setGrabandoAudio(false);
    }
  };

  const eliminarMensaje = async (mensajeId) => {
    if (!chatActivo || !user) return;
    if (window.confirm("¿Seguro que deseas eliminar este mensaje?")) {
      try {
        const chatId = [user.uid, chatActivo.uid].sort().join('_');
        await deleteDoc(doc(db, 'chats_privados', chatId, 'mensajes', mensajeId));
      } catch (err) {
        console.error("Error al eliminar mensaje:", err);
      }
    }
  };

  const vaciarChat = async () => {
    if (!chatActivo || !user) return;
    if (window.confirm(`¿Estás seguro de vaciar TODO el chat con ${chatActivo.nombre}? Esta acción borrará todos los mensajes.`)) {
      try {
        const chatId = [user.uid, chatActivo.uid].sort().join('_');
        const mensajesRef = collection(db, 'chats_privados', chatId, 'mensajes');
        const snapshot = await getDocs(mensajesRef);
        
        const batch = writeBatch(db);
        snapshot.docs.forEach((docSnap) => {
          batch.delete(docSnap.ref);
        });
        
        await batch.commit();
      } catch (err) {
        console.error("Error al vaciar chat:", err);
      }
    }
  };

  if (user) {
    return (
      <div style={{ maxWidth: '800px', margin: '20px auto', padding: '10px', fontFamily: 'sans-serif' }}>
        
        {/* INTERFAZ FLOTANTE DE LLAMADA / VIDEOLLAMADA */}
        {llamadaEnCurso && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.95)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '15px' }}>
            <div style={{ width: '100%', maxWidth: '750px', height: '80vh', backgroundColor: '#111', borderRadius: '16px', overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative', alignItems: 'center', justifyContent: 'center' }}>
              
              {/* REPRODUCTOR UNIVERSAL */}
              <video 
                ref={remoteVideoRef} 
                autoPlay 
                playsInline 
                style={tipoLlamada === 'video' 
                  ? { width: '100%', height: '100%', objectFit: 'cover', backgroundColor: '#222' } 
                  : { position: 'absolute', width: '2px', height: '2px', opacity: 0.01, zIndex: -1 } 
                } 
              />
              
              {tipoLlamada === 'video' ? (
                !camApagada && (
                  <video ref={localVideoRef} autoPlay playsInline muted style={{ width: '130px', height: '170px', objectFit: 'cover', position: 'absolute', bottom: '80px', right: '20px', borderRadius: '12px', border: '2px solid white', backgroundColor: '#333', zIndex: 5 }} />
                )
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'white', gap: '15px', zIndex: 2 }}>
                  <div style={{ width: '100px', height: '100px', borderRadius: '50%', backgroundColor: '#0056b3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '36px', fontWeight: 'bold' }}>
                    {(chatActivo?.nombre || 'U').charAt(0).toUpperCase()}
                  </div>
                  <h2>{chatActivo?.nombre || 'Usuario'}</h2>
                  <p style={{ color: estadoConexion === '¡Conectado!' ? '#28a745' : estadoConexion.includes('Fallo') ? '#dc3545' : '#ffc107', fontWeight: 'bold', textAlign: 'center', padding: '0 20px' }}>
                    {estadoConexion}
                  </p>
                </div>
              )}

              {/* CONTROLES DE LLAMADA */}
              <div style={{ position: 'absolute', bottom: '20px', left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: '12px', padding: '10px', zIndex: 10 }}>
                <button 
                  onClick={alternarMic} 
                  style={{ padding: '12px 18px', borderRadius: '50%', border: 'none', backgroundColor: micSilenciado ? '#dc3545' : '#6c757d', color: 'white', cursor: 'pointer', fontSize: '18px' }}
                  title={micSilenciado ? "Activar Micrófono" : "Silenciar Micrófono"}
                >
                  {micSilenciado ? '🎙️❌' : '🎙️'}
                </button>
                
                {tipoLlamada === 'video' && (
                  <button 
                    onClick={alternarCam} 
                    style={{ padding: '12px 18px', borderRadius: '50%', border: 'none', backgroundColor: camApagada ? '#dc3545' : '#6c757d', color: 'white', cursor: 'pointer', fontSize: '18px' }}
                    title={camApagada ? "Encender Cámara" : "Apagar Cámara"}
                  >
                    {camApagada ? '📷❌' : '📷'}
                  </button>
                )}

                <button 
                  onClick={colgarLlamada} 
                  style={{ padding: '12px 24px', borderRadius: '30px', border: 'none', backgroundColor: '#dc3545', color: 'white', fontWeight: 'bold', cursor: 'pointer', fontSize: '15px' }}
                >
                  🛑 Colgar
                </button>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0056b3', color: 'white', padding: '12px 20px', borderRadius: '8px 8px 0 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h3 style={{ margin: 0 }}>💬 mi chat</h3>
            {ES_ADMIN && (
              <span style={{ backgroundColor: '#ffc107', color: '#000', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                ADMIN
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {!editandoNombre ? (
              <span 
                onClick={() => setEditandoNombre(true)} 
                style={{ fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', borderBottom: '1px dashed white' }}
                title="Haz clic para cambiar tu nombre visible"
              >
                👤 {nuevoNombreInput || user.email.split('@')[0]} ✏️
              </span>
            ) : (
              <div style={{ display: 'flex', gap: '4px' }}>
                <input 
                  type="text" 
                  value={nuevoNombreInput} 
                  onChange={(e) => setNuevoNombreInput(e.target.value)} 
                  style={{ padding: '2px 6px', borderRadius: '4px', border: 'none', fontSize: '12px' }}
                />
                <button onClick={guardarNuevoNombre} style={{ padding: '2px 6px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
                  ✓
                </button>
                <button onClick={() => setEditandoNombre(false)} style={{ padding: '2px 6px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
                  ✕
                </button>
              </div>
            )}
            <button 
              onClick={() => { setChatActivo(null); signOut(auth); }}
              style={{ padding: '6px 12px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
            >
              Cerrar Sesión
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', border: '1px solid #ccc', borderTop: 'none', height: '550px', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
          
          <div style={{ width: '35%', borderRight: '1px solid #ddd', backgroundColor: '#ffffff', overflowY: 'auto' }}>
            <div style={{ padding: '12px', backgroundColor: '#f0f2f5', borderBottom: '1px solid #ddd', fontWeight: 'bold', fontSize: '14px', color: '#333' }}>
              Usuarios ({usuarios.length})
            </div>
            {usuarios.length === 0 ? (
              <p style={{ padding: '15px', fontSize: '12px', color: '#888', textAlign: 'center' }}>No hay otros usuarios registrados aún.</p>
            ) : (
              usuarios.map((u) => {
                const estaSeleccionado = chatActivo?.uid === u.uid;
                return (
                  <div key={u.uid} onClick={() => setChatActivo(u)} style={{ padding: '12px 15px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', backgroundColor: estaSeleccionado ? '#e6f2ff' : 'white', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '35px', height: '35px', borderRadius: '50%', backgroundColor: '#0056b3', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '14px' }}>
                      {(u.nombre || u.email).charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#111' }}>{u.nombre || u.email.split('@')[0]}</div>
                      <div style={{ fontSize: '11px', color: '#666' }}>{u.email}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div style={{ width: '65%', display: 'flex', flexDirection: 'column', backgroundColor: '#f9f9f9' }}>
            {chatActivo ? (
              <>
                <div style={{ padding: '10px 15px', backgroundColor: '#f0f2f5', borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontWeight: 'bold', color: '#111', fontSize: '15px' }}>💬 {chatActivo.nombre || chatActivo.email.split('@')[0]}</div>
                  
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <button 
                      onClick={() => iniciarLlamadaNativa('voz')}
                      style={{ padding: '6px 10px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}
                      title="Llamada de voz"
                    >
                      📞 Voz
                    </button>

                    <button 
                      onClick={() => iniciarLlamadaNativa('video')}
                      style={{ padding: '6px 10px', backgroundColor: '#0056b3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}
                      title="Videollamada"
                    >
                      📹 Video
                    </button>

                    {mensajes.length > 0 && (
                      <button 
                        onClick={vaciarChat} 
                        style={{ padding: '6px 8px', backgroundColor: '#ffc107', color: '#212529', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                        title="Borrar todos los mensajes del chat"
                      >
                        🧹
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '15px', display: 'flex', flexDirection: 'column' }}>
                  {mensajes.length === 0 ? (
                    <p style={{ textAlign: 'center', color: '#888', fontSize: '13px', margin: 'auto' }}>
                      Inicia la conversación con <b>{chatActivo.nombre || chatActivo.email.split('@')[0]}</b>.
                    </p>
                  ) : (
                    mensajes.map((m) => {
                      const esMio = m.deUid === user.uid;
                      const puedeEliminar = ES_ADMIN || esMio;

                      return (
                        <div key={m.id} style={{ display: 'flex', justifyContent: esMio ? 'flex-end' : 'flex-start', marginBottom: '8px', position: 'relative' }}>
                          <div style={{ 
                            backgroundColor: m.esLlamada ? '#28a745' : (esMio ? '#0056b3' : '#e9ecef'), 
                            color: m.esLlamada || esMio ? 'white' : '#212529', 
                            padding: m.imagenUrl || m.audioUrl ? '6px' : '8px 12px', 
                            borderRadius: '12px', 
                            maxWidth: '85%', 
                            wordBreak: 'break-word',
                            fontSize: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}>
                            <div style={{ flex: 1 }}>
                              {m.imagenUrl && (
                                <img src={m.imagenUrl} alt="Adjunto" style={{ width: '100%', borderRadius: '10px', display: 'block' }} />
                              )}
                              
                              {m.audioUrl && (
                                <audio controls src={m.audioUrl} style={{ maxWidth: '220px', height: '40px' }} />
                              )}

                              {m.esLlamada ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '4px' }}>
                                  <div style={{ fontWeight: 'bold' }}>{m.texto}</div>
                                  {!esMio && (
                                    <button 
                                      onClick={() => responderLlamadaNativa(m.modoLlamada || 'voz', m.callId)}
                                      style={{ padding: '8px 14px', backgroundColor: '#ffffff', color: '#28a745', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}
                                    >
                                      📞 Responder ({m.modoLlamada === 'video' ? 'Video' : 'Voz'})
                                    </button>
                                  )}
                                </div>
                              ) : (
                                m.texto && <div style={{ padding: m.imagenUrl ? '8px' : '0' }}>{m.texto}</div>
                              )}
                            </div>

                            {esMio && (
                              <span 
                                style={{ 
                                  fontSize: '13px', 
                                  color: m.leido ? '#00e676' : '#b0bec5', 
                                  fontWeight: 'bold', 
                                  marginLeft: '4px' 
                                }} 
                                title={m.leido ? "Visto" : "Enviado"}
                              >
                                {m.leido ? '✓✓' : '✓'}
                              </span>
                            )}

                            {puedeEliminar && (
                              <button 
                                onClick={() => eliminarMensaje(m.id)}
                                style={{ 
                                  background: 'none', 
                                  border: 'none', 
                                  cursor: 'pointer', 
                                  fontSize: '13px', 
                                  opacity: 0.7,
                                  padding: '2px',
                                  color: esMio || m.esLlamada ? '#ffdddd' : '#888888'
                                }}
                                title="Eliminar mensaje"
                              >
                                🗑️
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                  {subiendoImagen && (
                     <div style={{ alignSelf: 'flex-end', marginBottom: '8px', padding: '8px 12px', backgroundColor: '#e9ecef', borderRadius: '12px', fontSize: '12px', color: '#555' }}>
                       <i>Subiendo imagen... 📷</i>
                     </div>
                  )}
                  <div ref={scrollRef} />
                </div>

                <form onSubmit={handleEnviarMensaje} style={{ display: 'flex', gap: '6px', padding: '10px', backgroundColor: '#f0f2f5', alignItems: 'center' }}>
                  
                  <input type="file" accept="image/*" ref={galleryInputRef} onChange={(e) => subirImagenAPI(e.target.files[0])} style={{ display: 'none' }} />
                  <input type="file" accept="image/*" capture="environment" ref={cameraInputRef} onChange={(e) => subirImagenAPI(e.target.files[0])} style={{ display: 'none' }} />
                  
                  <button 
                    type="button" 
                    onClick={() => cameraInputRef.current.click()} 
                    disabled={subiendoImagen || grabandoAudio}
                    style={{ padding: '8px 10px', backgroundColor: '#0056b3', color: 'white', border: 'none', borderRadius: '50%', cursor: 'pointer', fontSize: '15px' }}
                    title="Tomar Foto"
                  >
                    📷
                  </button>

                  <button 
                    type="button" 
                    onClick={() => galleryInputRef.current.click()} 
                    disabled={subiendoImagen || grabandoAudio}
                    style={{ padding: '8px 10px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '50%', cursor: 'pointer', fontSize: '15px' }}
                    title="Seleccionar de Galería"
                  >
                    🖼️
                  </button>

                  {!grabandoAudio ? (
                    <button 
                      type="button" 
                      onClick={iniciarGrabacionAudio} 
                      disabled={subiendoImagen}
                      style={{ padding: '8px 10px', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '50%', cursor: 'pointer', fontSize: '15px' }}
                      title="Grabar Nota de Voz"
                    >
                      🎤
                    </button>
                  ) : (
                    <button 
                      type="button" 
                      onClick={detenerGrabacionAudio} 
                      style={{ padding: '8px 12px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '20px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                    >
                      🛑 Detener y Enviar
                    </button>
                  )}

                  {!grabandoAudio && (
                    <>
                      <input 
                        type="text" 
                        placeholder="Escribe un mensaje..." 
                        value={nuevoMensaje} 
                        onChange={(e) => setNuevoMensaje(e.target.value)} 
                        style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '14px', outline: 'none' }}
                      />
                      <button type="submit" style={{ padding: '10px 18px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                        Enviar
                      </button>
                    </>
                  )}
                </form>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#888' }}>
                <span style={{ fontSize: '48px', marginBottom: '10px' }}>💬</span>
                <h3>Selecciona un usuario a la izquierda</h3>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '350px', margin: '80px auto', padding: '20px', border: '1px solid #ccc', borderRadius: '8px', fontFamily: 'sans-serif', backgroundColor: '#ffffff' }}>
      <h2 style={{ textAlign: 'center', marginTop: 0, color: '#0056b3' }}>{esRegistro ? 'Crear Cuenta' : 'Iniciar Sesión'}</h2>
      {error && <p style={{ color: 'red', fontSize: '12px', textAlign: 'center' }}>{error}</p>}
      
      <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {esRegistro && (
          <input 
            type="text" 
            placeholder="Tu Nombre / Apodo visible" 
            value={nombrePersona} 
            onChange={(e) => setNombrePersona(e.target.value)} 
            required 
            style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} 
          />
        )}
        
        <input 
          type="email" 
          name="user_email_input"
          autoComplete="username"
          placeholder="Correo electrónico" 
          value={email} 
          onChange={(e) => setEmail(e.target.value)} 
          required 
          style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} 
        />
        
        <input 
          type="password" 
          name="user_password_input"
          autoComplete="current-password"
          placeholder="Contraseña (mín. 6 caracteres)" 
          value={password} 
          onChange={(e) => setPassword(e.target.value)} 
          required 
          style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} 
        />
        
        <button type="submit" style={{ padding: '10px', backgroundColor: '#0056b3', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>
          {esRegistro ? 'Registrarse' : 'Entrar'}
        </button>
      </form>
      
      <p style={{ textAlign: 'center', fontSize: '12px', marginTop: '15px' }}>
        {esRegistro ? '¿Ya tienes una cuenta?' : '¿No tienes cuenta?'} {' '}
        <span onClick={() => { setEsRegistro(!esRegistro); setError(''); }} style={{ color: '#0056b3', cursor: 'pointer', fontWeight: 'bold' }}>
          {esRegistro ? 'Inicia sesión' : 'Regístrate aquí'}
        </span>
      </p>
    </div>
  );
}

export default App;