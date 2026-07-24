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
  serverTimestamp 
} from 'firebase/firestore';

function App() {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [esRegistro, setEsRegistro] = useState(false);
  const [error, setError] = useState('');

  // Estados del Chat
  const [mensajes, setMensajes] = useState([]);
  const [nuevoMensaje, setNuevoMensaje] = useState('');
  const scrollRef = useRef(null);

  // Escuchar si el usuario inicia o cierra sesión
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (usuarioActual) => {
      setUser(usuarioActual);
    });
    return () => unsubscribe();
  }, []);

  // Escuchar mensajes en tiempo real cuando el usuario está logueado
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'mensajes_chat'),
      orderBy('creadoEn', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = [];
      snapshot.forEach((doc) => {
        docs.push({ id: doc.id, ...doc.data() });
      });
      setMensajes(docs);
    });

    return () => unsubscribe();
  }, [user]);

  // Autoscroll hacia el último mensaje
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes]);

  // Handler de Login / Registro
  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (esRegistro) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      setError("Error: Credenciales inválidas o contraseña muy corta (mínimo 6 caracteres).");
    }
  };

  // Handler para enviar mensaje
  const handleEnviarMensaje = async (e) => {
    e.preventDefault();
    if (!nuevoMensaje.trim()) return;

    try {
      await addDoc(collection(db, 'mensajes_chat'), {
        uid: user.uid,
        email: user.email,
        texto: nuevoMensaje.trim(),
        creadoEn: serverTimestamp()
      });
      setNuevoMensaje('');
    } catch (err) {
      console.error("Error al enviar el mensaje:", err);
    }
  };

  // --- VISTA 1: CHAT (Cuando el usuario inició sesión) ---
  if (user) {
    return (
      <div style={{ maxWidth: '600px', margin: '20px auto', padding: '15px', fontFamily: 'sans-serif' }}>
        {/* Barra Superior */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #0056b3', paddingBottom: '10px', marginBottom: '15px' }}>
          <h3 style={{ margin: 0 }}>💬 Sala de Chat</h3>
          <div>
            <span style={{ fontSize: '13px', marginRight: '10px', fontWeight: 'bold', color: '#555' }}>
              {user.email ? user.email.split('@')[0] : 'Usuario'}
            </span>
            <button 
              onClick={() => signOut(auth)}
              style={{ padding: '6px 12px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
            >
              Cerrar Sesión
            </button>
          </div>
        </div>

        {/* Caja de Mensajes */}
        <div style={{ height: '400px', overflowY: 'auto', border: '1px solid #ccc', borderRadius: '8px', padding: '12px', backgroundColor: '#f8f9fa', marginBottom: '15px' }}>
          {mensajes.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#888', marginTop: '170px', fontSize: '13px' }}>
              No hay mensajes aún. ¡Escribe el primero!
            </p>
          ) : (
            mensajes.map((m) => {
              const esMio = m.uid === user.uid;
              return (
                <div 
                  key={m.id} 
                  style={{ display: 'flex', flexDirection: 'column', alignItems: esMio ? 'flex-end' : 'flex-start', marginBottom: '10px' }}
                >
                  <span style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>
                    {m.email ? m.email.split('@')[0] : 'Usuario'}
                  </span>
                  <div style={{ 
                    backgroundColor: esMio ? '#0056b3' : '#e9ecef', 
                    color: esMio ? 'white' : '#212529', 
                    padding: '8px 12px', 
                    borderRadius: '12px', 
                    maxWidth: '75%', 
                    wordBreak: 'break-word',
                    fontSize: '14px'
                  }}>
                    {m.texto}
                  </div>
                </div>
              );
            })
          )}
          <div ref={scrollRef} />
        </div>

        {/* Formulario de Envío */}
        <form onSubmit={handleEnviarMensaje} style={{ display: 'flex', gap: '8px' }}>
          <input 
            type="text" 
            placeholder="Escribe un mensaje..." 
            value={nuevoMensaje} 
            onChange={(e) => setNuevoMensaje(e.target.value)} 
            style={{ flex: 1, padding: '10px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '14px' }}
          />
          <button 
            type="submit" 
            style={{ padding: '10px 20px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Enviar
          </button>
        </form>
      </div>
    );
  }

  // --- VISTA 2: LOGIN / REGISTRO (Cuando NO hay sesión iniciada) ---
  return (
    <div style={{ maxWidth: '350px', margin: '80px auto', padding: '20px', border: '1px solid #ccc', borderRadius: '8px', fontFamily: 'sans-serif', backgroundColor: '#ffffff' }}>
      <h2 style={{ textAlign: 'center', marginTop: 0 }}>{esRegistro ? 'Crear Cuenta' : 'Iniciar Sesión'}</h2>
      {error && <p style={{ color: 'red', fontSize: '12px', textAlign: 'center' }}>{error}</p>}
      
      <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <input 
          type="email" 
          placeholder="Correo electrónico" 
          value={email} 
          onChange={(e) => setEmail(e.target.value)} 
          required 
          style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }}
        />
        <input 
          type="password" 
          placeholder="Contraseña (mín. 6 caracteres)" 
          value={password} 
          onChange={(e) => setPassword(e.target.value)} 
          required 
          style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }}
        />
        <button 
          type="submit" 
          style={{ padding: '10px', backgroundColor: '#0056b3', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}
        >
          {esRegistro ? 'Registrarse' : 'Entrar'}
        </button>
      </form>

      <p style={{ textAlign: 'center', fontSize: '12px', marginTop: '15px' }}>
        {esRegistro ? '¿Ya tienes una cuenta?' : '¿No tienes cuenta?'} {' '}
        <span 
          onClick={() => { setEsRegistro(!esRegistro); setError(''); }} 
          style={{ color: '#0056b3', cursor: 'pointer', fontWeight: 'bold' }}
        >
          {esRegistro ? 'Inicia sesión' : 'Regístrate aquí'}
        </span>
      </p>
    </div>
  );
}

export default App;