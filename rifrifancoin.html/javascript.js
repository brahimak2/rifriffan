// Configuración de Supabase - REEMPLAZA CON TUS PROPIOS DATOS
const SUPABASE_URL = 'https://qxyctxmjjctfmrgdupsb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4eWN0eG1qamN0Zm1yZ2R1cHNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1OTg4NTMsImV4cCI6MjA3MTE3NDg1M30.0Ox8PMlIxqPVs4Y4ne1PIg6-APcCbfohpL3OSRN1xjA';

// Inicializar Supabase
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Variables globales
let currentUser = null;
let miningInterval = null;
const claimInterval = 24 * 60 * 60 * 1000; // 24 horas en milisegundos

// Función para crear partículas flotantes
function createParticles() {
    const particlesContainer = document.getElementById('particles');
    const particleCount = 30;
    
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.classList.add('particle');
        
        // Posición aleatoria
        const posX = Math.random() * 100;
        const posY = Math.random() * 100;
        const size = Math.random() * 3 + 1;
        const duration = Math.random() * 20 + 10;
        const delay = Math.random() * 10;
        
        particle.style.left = `${posX}%`;
        particle.style.top = `${posY}%`;
        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;
        particle.style.animationDuration = `${duration}s`;
        particle.style.animationDelay = `${delay}s`;
        
        particlesContainer.appendChild(particle);
    }
}

// Función para mostrar notificaciones toast
function showToast(message, duration = 3000) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

// Función para generar un código de referido aleatorio
function generateReferralCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Función para procesar referidos
async function processReferral(referralCode, newUserId) {
    try {
        // Buscar usuario por código de referido
        const { data: referrer, error } = await supabaseClient
            .from('users')
            .select('*')
            .eq('referral_code', referralCode)
            .single();
        
        if (error || !referrer) {
            console.log('Código de referido no válido');
            return;
        }
        
        // Registrar la relación de referido
        const { error: refError } = await supabaseClient
            .from('referrals')
            .insert({
                referrer_id: referrer.id,
                referred_id: newUserId,
                created_at: new Date().toISOString()
            });
        
        if (refError) throw refError;
        
        // Actualizar balance del referido (bonificación)
        const { error: updateError } = await supabaseClient
            .from('users')
            .update({ balance: referrer.balance + 50 })
            .eq('id', referrer.id);
        
        if (updateError) throw updateError;
        
        console.log('Referido procesado correctamente');
        
    } catch (error) {
        console.error('Error procesando referido:', error);
    }
}

// Función para registrar un nuevo usuario
async function registerUser() {
    const name = document.getElementById('register-name').value.trim();
    const email = document.getElementById('register-email').value.trim().toLowerCase();
    const password = document.getElementById('register-password').value;
    const referralCode = document.getElementById('register-referral').value.trim().toUpperCase();
    const registerSubmitBtn = document.getElementById('register-submit-btn');

    // Validación mejorada
    if (!name || !email || !password) {
        showToast('Completa todos los campos obligatorios');
        return;
    }

    if (password.length < 6) {
        showToast('La contraseña debe tener al menos 6 caracteres');
        return;
    }

    if (!validateEmail(email)) {
        showToast('Correo electrónico no válido');
        return;
    }

    registerSubmitBtn.disabled = true;
    registerSubmitBtn.innerHTML = '<span class="loading"></span> CREANDO...';
    
    try {
        // Registrar usuario en Supabase Auth
        const { data: authData, error: authError } = await supabaseClient.auth.signUp({
            email: email,
            password: password,
        });

        if (authError) {
            if (authError.message.includes('already registered')) {
                showToast('Este email ya está registrado');
            } else {
                throw authError;
            }
            return;
        }

        const userId = authData.user.id;
        const userReferralCode = generateReferralCode();
        
        // Crear perfil de usuario en la base de datos
        const { error: dbError } = await supabaseClient
            .from('users')
            .insert({
                id: userId,
                name: name,
                email: email,
                balance: 100, // Bonificación de bienvenida
                referral_code: userReferralCode,
                last_claim: null,
                created_at: new Date().toISOString()
            });
        
        if (dbError) throw dbError;
        
        // Procesar referido si existe código
        if (referralCode) {
            await processReferral(referralCode, userId);
        }
        
        // Iniciar sesión automáticamente
        await loginUserAfterRegister(email, password);
        
    } catch (error) {
        console.error('Error al registrar usuario:', error);
        showToast('Error al registrar usuario: ' + error.message);
    } finally {
        registerSubmitBtn.disabled = false;
        registerSubmitBtn.textContent = 'CREAR CUENTA';
    }
}

// Función para iniciar sesión después del registro
async function loginUserAfterRegister(email, password) {
    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password,
        });
        
        if (error) throw error;
        
        // Obtener datos del usuario
        await loadUserData(data.user.id);
        
        // Ocultar pantalla de autenticación y mostrar la app
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app-container').style.display = 'flex';
        
        // Iniciar temporizador de minería
        startMiningTimer();
        
        // Mostrar notificación de bienvenida
        document.getElementById('welcome-notification').classList.add('show');
        setTimeout(() => document.getElementById('welcome-notification').classList.remove('show'), 5000);
        
        // Mostrar sección de minería por defecto
        showSection('mining');
        
        // Mostrar mensaje de éxito
        showToast('¡Registro exitoso!');
        
        // Limpiar formulario
        document.getElementById('register-name').value = '';
        document.getElementById('register-email').value = '';
        document.getElementById('register-password').value = '';
        document.getElementById('register-referral').value = '';
        
    } catch (error) {
        console.error('Error al iniciar sesión después del registro:', error);
        showToast('Error al iniciar sesión automática');
    }
}

// Función para validar email
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

// Función para iniciar sesión
async function loginUser() {
    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value;
    const loginSubmitBtn = document.getElementById('login-submit-btn');

    if (!email || !password) {
        showToast('Completa todos los campos');
        return;
    }

    loginSubmitBtn.disabled = true;
    loginSubmitBtn.innerHTML = '<span class="loading"></span> CARGANDO...';
    
    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password,
        });
        
        if (error) throw error;
        
        // Obtener datos del usuario
        await loadUserData(data.user.id);
        
        // Ocultar pantalla de autenticación y mostrar la app
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app-container').style.display = 'flex';
        
        // Iniciar temporizador de minería
        startMiningTimer();
        
        // Mostrar sección de minería por defecto
        showSection('mining');
        
        // Mostrar mensaje de bienvenida
        showToast('Bienvenido de nuevo, ' + currentUser.name + '!');
        
        // Limpiar formulario
        document.getElementById('login-email').value = '';
        document.getElementById('login-password').value = '';
        
    } catch (error) {
        console.error('Error al iniciar sesión:', error);
        showToast('Email o contraseña incorrectos');
    } finally {
        loginSubmitBtn.disabled = false;
        loginSubmitBtn.textContent = 'INGRESAR';
    }
}

// Función para cargar datos del usuario desde Supabase
async function loadUserData(userId) {
    try {
        // Obtener datos del usuario
        const { data: userData, error: userError } = await supabaseClient
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();
        
        if (userError) throw userError;
        
        // Obtener referidos del usuario
        const { data: referralsData, error: refError } = await supabaseClient
            .from('referrals')
            .select('*')
            .eq('referrer_id', userId);
        
        if (refError) throw refError;
        
        // Establecer usuario actual
        currentUser = {
            id: userData.id,
            name: userData.name,
            email: userData.email,
            balance: userData.balance,
            lastClaim: userData.last_claim,
            referrals: referralsData || [],
            referralCode: userData.referral_code
        };
        
        // Actualizar la UI con el usuario
        updateUserUI();
        
    } catch (error) {
        console.error('Error cargando datos del usuario:', error);
        throw error;
    }
}

// Función para actualizar la UI del usuario
function updateUserUI() {
    if (!currentUser) return;
    
    document.getElementById('user-name').textContent = currentUser.name;
    document.getElementById('balance').textContent = currentUser.balance + ' RIFC';
    document.getElementById('user-avatar').textContent = currentUser.name.substring(0, 2).toUpperCase();
    document.getElementById('account-name').value = currentUser.name;
    document.getElementById('account-email').value = currentUser.email;
    
    // Actualizar enlace de referido
    const referralLink = `${window.location.origin}${window.location.pathname}?ref=${currentUser.referralCode}`;
    document.getElementById('referral-link').value = referralLink;
    
    // Actualizar referidos
    updateReferralsUI();
    
    // Actualizar estado del minero
    updateMiningStatus();
    
    // Actualizar ranking
    updateRanking();
}

// Función para actualizar la UI de referidos
async function updateReferralsUI() {
    if (!currentUser) return;
    
    try {
        // Obtener información detallada de los referidos
        const { data: referralsData, error } = await supabaseClient
            .from('referrals')
            .select(`
                *,
                referred_user:users!referrals_referred_id_fkey (name, email)
            `)
            .eq('referrer_id', currentUser.id);
        
        if (error) throw error;
        
        const referrals = referralsData.map(ref => ({
            id: ref.referred_id,
            name: ref.referred_user?.name || 'Usuario eliminado',
            email: ref.referred_user?.email || 'N/A',
            created_at: ref.created_at
        }));
        
        // Actualizar contadores
        document.getElementById('referral-count').textContent = referrals.length;
        document.getElementById('bonus-referrals').textContent = referrals.length;
        document.getElementById('referral-earnings').textContent = referrals.length * 50;
        
        // Actualizar lista de referidos
        const referralList = document.getElementById('referral-list');
        referralList.innerHTML = '';
        
        referrals.forEach(ref => {
            const referralItem = document.createElement('div');
            referralItem.className = 'referral-item';
            
            referralItem.innerHTML = `
                <div class="referral-avatar">${ref.name.substring(0, 2).toUpperCase()}</div>
                <div class="referral-info">
                    <div class="referral-name">
                        <i class="fas fa-user"></i>
                        ${ref.name}
                    </div>
                    <span class="referral-email">${ref.email}</span>
                    <div class="referral-meta">
                        <span class="referral-earnings">
                            <i class="fas fa-coins"></i>
                            50 RIFC
                        </span>
                        <span class="referral-status status-active">
                            <i class="fas fa-check-circle"></i>
                            Activo
                        </span>
                    </div>
                </div>
            `;
            
            referralList.appendChild(referralItem);
        });
        
    } catch (error) {
        console.error('Error actualizando referidos:', error);
        showToast('Error cargando referidos');
    }
}

// Función para actualizar el ranking
async function updateRanking() {
    try {
        // Obtener usuarios ordenados por balance
        const { data: rankedUsers, error } = await supabaseClient
            .from('users')
            .select('id, name, balance')
            .order('balance', { ascending: false })
            .limit(10);
        
        if (error) throw error;
        
        const rankingList = document.getElementById('ranking-list');
        rankingList.innerHTML = '';
        
        rankedUsers.forEach((user, index) => {
            const rankingItem = document.createElement('div');
            rankingItem.className = 'ranking-item';
            
            const positionClass = index < 3 ? `top-${index + 1}` : '';
            
            rankingItem.innerHTML = `
                <div class="ranking-position ${positionClass}">${index + 1}</div>
                <div class="ranking-avatar">${user.name.substring(0, 2).toUpperCase()}</div>
                <div class="ranking-info">
                    <div class="ranking-name">${user.name}</div>
                    <div class="ranking-balance">
                        <i class="fas fa-coins"></i>
                        ${user.balance} RIFC
                    </div>
                </div>
            `;
            
            rankingList.appendChild(rankingItem);
        });
        
    } catch (error) {
        console.error('Error actualizando ranking:', error);
    }
}

// Función para copiar el enlace de referido
function copyReferralLink() {
    const referralLink = document.getElementById('referral-link');
    referralLink.select();
    document.execCommand('copy');
    
    showToast('¡Enlace copiado!');
}

// Función para iniciar el temporizador de minería
function startMiningTimer() {
    if (miningInterval) {
        clearInterval(miningInterval);
    }
    
    updateMiningStatus();
    miningInterval = setInterval(updateMiningStatus, 1000);
}

// Función para actualizar el estado de minería
function updateMiningStatus() {
    if (!currentUser) return;
    
    const now = new Date();
    const lastClaim = currentUser.lastClaim ? new Date(currentUser.lastClaim) : null;
    const claimBtn = document.getElementById('claim-btn');
    const timer = document.getElementById('timer');
    
    if (!lastClaim || (now - lastClaim) >= claimInterval) {
        // Listo para reclamar
        claimBtn.disabled = false;
        timer.textContent = 'Listo para reclamar';
        return;
    }
    
    // Calcular tiempo restante
    const nextClaim = new Date(lastClaim.getTime() + claimInterval);
    const timeLeft = nextClaim - now;
    
    if (timeLeft <= 0) {
        claimBtn.disabled = false;
        timer.textContent = 'Listo para reclamar';
        return;
    }
    
    // Mostrar cuenta regresiva
    claimBtn.disabled = true;
    const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
    
    timer.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Función para reclamar RIFC minados
async function claimMining() {
    if (!currentUser) return;
    
    const claimBtn = document.getElementById('claim-btn');
    claimBtn.disabled = true;
    claimBtn.innerHTML = '<span class="loading"></span> PROCESANDO...';
    
    try {
        // Calcular recompensa base + bonificación por referidos
        const baseReward = 10;
        const referralBonus = currentUser.referrals.length * 2;
        const totalReward = baseReward + referralBonus;
        
        // Actualizar balance en Supabase
        const { error: updateError } = await supabaseClient
            .from('users')
            .update({ 
                balance: currentUser.balance + totalReward,
                last_claim: new Date().toISOString()
            })
            .eq('id', currentUser.id);
        
        if (updateError) throw updateError;
        
        // Actualizar usuario local
        currentUser.balance += totalReward;
        currentUser.lastClaim = new Date().toISOString();
        
        // Actualizar UI
        updateUserUI();
        
        // Mostrar animación de bonificación
        if (referralBonus > 0) {
            document.getElementById('bonus-coin').textContent = `+${referralBonus}`;
            document.getElementById('bonus-coin').style.display = 'flex';
            
            setTimeout(() => {
                document.getElementById('bonus-coin').style.display = 'none';
            }, 2000);
        }
        
        showToast('¡RIFC reclamados! +' + totalReward);
        
    } catch (error) {
        console.error('Error reclamando RIFC:', error);
        showToast('Error al reclamar RIFC');
    } finally {
        claimBtn.disabled = false;
        claimBtn.textContent = 'RECLAMAR RIFC';
    }
}

// Función para guardar cambios en la cuenta
async function saveAccountChanges() {
    if (!currentUser) return;
    
    const name = document.getElementById('account-name').value.trim();
    const newPassword = document.getElementById('account-password').value;
    const saveBtn = document.getElementById('save-account-btn');
    
    if (!name) {
        showToast('Completa todos los campos obligatorios');
        return;
    }
    
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="loading"></span> GUARDANDO...';
    
    try {
        // Actualizar nombre en Supabase
        const { error: updateError } = await supabaseClient
            .from('users')
            .update({ name: name })
            .eq('id', currentUser.id);
        
        if (updateError) throw updateError;
        
        // Actualizar contraseña si se proporcionó una nueva
        if (newPassword) {
            if (newPassword.length < 6) {
                throw new Error('La contraseña debe tener al menos 6 caracteres');
            }
            
            const { error: passwordError } = await supabaseClient.auth.updateUser({
                password: newPassword
            });
            
            if (passwordError) throw passwordError;
        }
        
        // Actualizar usuario local
        currentUser.name = name;
        
        // Actualizar UI
        updateUserUI();
        
        showToast('Cambios guardados');
        
    } catch (error) {
        console.error('Error guardando cambios:', error);
        showToast(error.message || 'Error guardando cambios');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'GUARDAR CAMBIOS';
    }
}

// Función para cerrar sesión
async function logoutUser() {
    try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) throw error;
        
        currentUser = null;
        
        if (miningInterval) {
            clearInterval(miningInterval);
            miningInterval = null;
        }
        
        // Mostrar pantalla de autenticación
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('app-container').style.display = 'none';
        
        // Restablecer formularios
        document.getElementById('login-form').style.display = 'block';
        document.getElementById('register-form').style.display = 'none';
        document.getElementById('login-email').value = '';
        document.getElementById('login-password').value = '';
        
        showToast('Sesión cerrada');
        
    } catch (error) {
        console.error('Error cerrando sesión:', error);
        showToast('Error al cerrar sesión');
    }
}

// Función para mostrar una sección específica
function showSection(section) {
    // Ocultar todas las secciones
    document.querySelectorAll('.mining-section, .referrals-section, .ranking-section, .account-section').forEach(sec => {
        sec.style.display = 'none';
    });
    
    // Mostrar la sección seleccionada
    const sectionElement = document.getElementById(`${section}-section`);
    if (sectionElement) {
        sectionElement.style.display = 'block';
    }
    
    // Actualizar botones de navegación
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    const navButton = document.getElementById(`nav-${section}`);
    if (navButton) {
        navButton.classList.add('active');
    }
    
    // Cargar datos específicos de la sección si es necesario
    if (section === 'referrals') {
        updateReferralsUI();
    } else if (section === 'ranking') {
        updateRanking();
    }
}

// Función para verificar sesión existente
async function checkSession() {
    try {
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        
        if (error) throw error;
        
        if (session && session.user) {
            // Obtener datos del usuario
            await loadUserData(session.user.id);
            
            document.getElementById('auth-screen').style.display = 'none';
            document.getElementById('app-container').style.display = 'flex';
            startMiningTimer();
            showSection('mining');
        }
    } catch (error) {
        console.error('Error al verificar sesión:', error);
    }
}

// Función para procesar parámetros de URL (para referidos)
function processUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const refCode = urlParams.get('ref');
    
    if (refCode) {
        document.getElementById('register-referral').value = refCode;
    }
}

// Función para alternar visibilidad de contraseña
function togglePasswordVisibility(inputId, toggleId) {
    const passwordInput = document.getElementById(inputId);
    const toggleIcon = document.getElementById(toggleId);
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleIcon.classList.replace('fa-eye', 'fa-eye-slash');
    } else {
        passwordInput.type = 'password';
        toggleIcon.classList.replace('fa-eye-slash', 'fa-eye');
    }
}

// Inicialización al cargar el documento
document.addEventListener('DOMContentLoaded', function() {
    createParticles();
    
    // Verificar sesión existente
    checkSession();
    
    // Procesar parámetros de URL
    processUrlParams();
    
    // Event listeners para alternar visibilidad de contraseña
    document.getElementById('toggle-login-password').addEventListener('click', function() {
        togglePasswordVisibility('login-password', 'toggle-login-password');
    });
    
    document.getElementById('toggle-register-password').addEventListener('click', function() {
        togglePasswordVisibility('register-password', 'toggle-register-password');
    });
    
    document.getElementById('toggle-account-password').addEventListener('click', function() {
        togglePasswordVisibility('account-password', 'toggle-account-password');
    });
    
    // Event listeners mejorados
    document.getElementById('login-submit-btn').addEventListener('click', loginUser);
    document.getElementById('register-submit-btn').addEventListener('click', registerUser);
    
    // Cambiar entre formularios de login y registro
    document.getElementById('switch-to-register').addEventListener('click', () => {
        document.getElementById('login-form').style.display = 'none';
        document.getElementById('register-form').style.display = 'block';
    });
    
    document.getElementById('switch-to-login').addEventListener('click', () => {
        document.getElementById('register-form').style.display = 'none';
        document.getElementById('login-form').style.display = 'block';
    });
    
    // Permitir enviar formularios con Enter
    document.getElementById('login-form').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            loginUser();
        }
    });
    
    document.getElementById('register-form').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            registerUser();
        }
    });
    
    // Botones de la aplicación
    document.getElementById('claim-btn').addEventListener('click', claimMining);
    document.getElementById('copy-btn').addEventListener('click', copyReferralLink);
    document.getElementById('logout-btn').addEventListener('click', logoutUser);
    document.getElementById('save-account-btn').addEventListener('click', saveAccountChanges);
    
    // Navegación
    document.getElementById('nav-mining').addEventListener('click', function(e) {
        e.preventDefault();
        showSection('mining');
    });
    
    document.getElementById('nav-referrals').addEventListener('click', function(e) {
        e.preventDefault();
        showSection('referrals');
    });
    
    document.getElementById('nav-ranking').addEventListener('click', function(e) {
        e.preventDefault();
        showSection('ranking');
    });
    
    document.getElementById('nav-account').addEventListener('click', function(e) {
        e.preventDefault();
        showSection('account');
    });
});