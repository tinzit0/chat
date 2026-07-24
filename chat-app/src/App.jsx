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
  setDoc
} from 'firebase/firestore';

function App() {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [esRegistro, setEsRegistro] = useState(false);
  const [error, setError] = useState('');

  const [usuarios, setUsuarios] = useState([]);
  const [chatActivo, setChatActivo] = useState(null);
  const [mensajes, setMensajes] = useState([]);
  const [nuevoMensaje, setNuevoMensaje] = useState('');
  
  // Nuevos estados para las imágenes
  const [subiendoImagen, setSubiendoImagen] = useState(false);
  const fileInputRef = useRef(null);
  const scrollRef = useRef(null);

  // Tu API KEY de ImgBB (la saqué de tu código original)
  const IMGBB_API_KEY = '2447ec54156a52c2b609cc1ea5d177d8';

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (usuarioActual) => {
      setUser(usuarioActual);
      if (usuarioActual) {
        await setDoc(doc(db, 'usuarios', usuarioActual.uid), {
          uid: usuarioActual.uid,
          email: usuarioActual.email,
          nombre: usuarioActual.email.split('@')[0]
        }, { merge: true });
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(collection(db, 'usuarios'), (snapshot) => {
      const lista = [];
      snapshot.forEach((docSnap) => {
        const datos = docSnap.data();
        if (datos.uid !== user.uid) lista.push(datos);
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
        docs.push({ id: docSnap.id, ...docSnap.data() });
      });
      setMensajes(docs);
    });
    return () => unsubscribe();
  }, [user, chatActivo]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes, subiendoImagen]);

  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (esRegistro) await createUserWithEmailAndPassword(auth, email, password);
      else await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError(err.message);
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
        creadoEn: serverTimestamp()
      });
      setNuevoMensaje('');
    } catch (err) {
      console.error("Error enviando mensaje:", err);
    }
  };

  // NUEVA FUNCIÓN: Subir imagen y enviarla como mensaje
  const handleSubirImagen = async (e) => {
    const file = e.target.files[0];
    if (!file || !chatActivo) return;

    setSubiendoImagen(true);
    try {
      // 1. Preparamos la imagen para enviarla a ImgBB
      const formData = new FormData();
      formData.append('image', file);

      // 2. Subimos la imagen
      const respuesta = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
        method: 'POST',
        body: formData,
      });
      
      const datos = await respuesta.json();

      if (datos.success) {
        const urlImagen = datos.data.url;
        const chatId = [user.uid, chatActivo.uid].sort().join('_');
        
        // 3. Guardamos el mensaje en Firebase con la URL de la imagen
        await addDoc(collection(db, 'chats_privados', chatId, 'mensajes'), {
          deUid: user.uid,
          paraUid: chatActivo.uid,
          texto: '', // Sin texto, solo imagen
          imagenUrl: urlImagen,
          creadoEn: serverTimestamp()
        });
      } else {
        alert("Error al subir la imagen a ImgBB.");
      }
    } catch (error) {
      console.error("Error:", error);
      alert("Hubo un problema de conexión al subir la imagen.");
    }
    setSubiendoImagen(false);
    
    // Limpiamos el input para poder subir la misma foto de nuevo si queremos
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // --- VISTA 1: APLICACIÓN DE CHAT ---
  if (user) {
    return (
      <div style={{ maxWidth: '800px', margin: '20px auto', padding: '10px', fontFamily: 'sans-serif' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0056b3', color: 'white', padding: '12px 20px', borderRadius: '8px 8px 0 0' }}>
          <h3 style={{ margin: 0 }}>💬 mi chat</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold' }}>👤 {user.email.split('@')[0]}</span>
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
                      {u.nombre.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#111' }}>{u.nombre}</div>
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
                <div style={{ padding: '10px 15px', backgroundColor: '#f0f2f5', borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ fontWeight: 'bold', color: '#111', fontSize: '15px' }}>💬 {chatActivo.nombre}</div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '15px', display: 'flex', flexDirection: 'column' }}>
                  {mensajes.length === 0 ? (
                    <p style={{ textAlign: 'center', color: '#888', fontSize: '13px', margin: 'auto' }}>
                      Inicia la conversación con <b>{chatActivo.nombre}</b>.
                    </p>
                  ) : (
                    mensajes.map((m) => {
                      const esMio = m.deUid === user.uid;
                      return (
                        <div key={m.id} style={{ display: 'flex', justifyContent: esMio ? 'flex-end' : 'flex-start', marginBottom: '8px' }}>
                          <div style={{ 
                            backgroundColor: esMio ? '#0056b3' : '#e9ecef', 
                            color: esMio ? 'white' : '#212529', 
                            padding: m.imagenUrl ? '4px' : '8px 12px', 
                            borderRadius: '12px', 
                            maxWidth: '75%', 
                            wordBreak: 'break-word',
                            fontSize: '14px'
                          }}>
                            {/* SI HAY IMAGEN, LA DIBUJAMOS */}
                            {m.imagenUrl && (
                              <img src={m.imagenUrl} alt="Imagen adjunta" style={{ width: '100%', borderRadius: '10px', display: 'block' }} />
                            )}
                            {/* SI HAY TEXTO, LO DIBUJAMOS */}
                            {m.texto && <div style={{ padding: m.imagenUrl ? '8px' : '0' }}>{m.texto}</div>}
                          </div>
                        </div>
                      );
                    })
                  )}
                  {/* Animación de carga si se está subiendo una imagen */}
                  {subiendoImagen && (
                     <div style={{ alignSelf: 'flex-end', marginBottom: '8px', padding: '8px 12px', backgroundColor: '#e9ecef', borderRadius: '12px', fontSize: '12px', color: '#555' }}>
                       <i>Subiendo imagen... 📷</i>
                     </div>
                  )}
                  <div ref={scrollRef} />
                </div>

                <form onSubmit={handleEnviarMensaje} style={{ display: 'flex', gap: '8px', padding: '10px', backgroundColor: '#f0f2f5', alignItems: 'center' }}>
                  
                  {/* INPUT INVISIBLE DE TIPO FILE */}
                  <input 
                    type="file" 
                    accept="image/*" 
                    ref={fileInputRef} 
                    onChange={handleSubirImagen} 
                    style={{ display: 'none' }} 
                  />
                  
                  {/* BOTÓN PARA ABRIR LA CÁMARA O GALERÍA */}
                  <button 
                    type="button" 
                    onClick={() => fileInputRef.current.click()} 
                    disabled={subiendoImagen}
                    style={{ padding: '10px 12px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '50%', cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    title="Enviar Imagen"
                  >
                    📷
                  </button>

                  <input 
                    type="text" 
                    placeholder="Escribe un mensaje..." 
                    value={nuevoMensaje} 
                    onChange={(e) => setNuevoMensaje(e.target.value)} 
                    style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '14px', outline: 'none' }}
                  />
                  <button type="submit" style={{ padding: '10px 20px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                    Enviar
                  </button>
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

  // --- VISTA 2: LOGIN ---
  return (
    <div style={{ maxWidth: '350px', margin: '80px auto', padding: '20px', border: '1px solid #ccc', borderRadius: '8px', fontFamily: 'sans-serif', backgroundColor: '#ffffff' }}>
      <h2 style={{ textAlign: 'center', marginTop: 0, color: '#0056b3' }}>{esRegistro ? 'Crear Cuenta' : 'Iniciar Sesión'}</h2>
      {error && <p style={{ color: 'red', fontSize: '12px', textAlign: 'center' }}>{error}</p>}
      <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <input type="email" placeholder="Correo electrónico" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} />
        <input type="password" placeholder="Contraseña (mín. 6 caracteres)" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} />
        <button type="submit" style={{ padding: '10px', backgroundColor: '#0056b3', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>{esRegistro ? 'Registrarse' : 'Entrar'}</button>
      </form>
      <p style={{ textAlign: 'center', fontSize: '12px', marginTop: '15px' }}>
        {esRegistro ? '¿Ya tienes una cuenta?' : '¿No tienes cuenta?'} {' '}
        <span onClick={() => { setEsRegistro(!esRegistro); setError(''); }} style={{ color: '#0056b3', cursor: 'pointer', fontWeight: 'bold' }}>{esRegistro ? 'Inicia sesión' : 'Regístrate aquí'}</span>
      </p>
    </div>
  );
}

export default App;