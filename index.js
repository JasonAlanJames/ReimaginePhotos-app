




import { firebaseConfig, STRIPE_PUBLISHABLE_KEY } from './firebaseConfig.js';
import { PRESETS } from './preset-prompts.js';

// --- INITIALIZE FIREBASE ---
let app, auth, db, functions;
// Cloud Function URL
const processImageUrl = "https://us-west2-nanobanana-image-app.cloudfunctions.net/processImage";


// --- DOM ELEMENTS (Error Modal) ---
const errorModal = document.getElementById('error-modal');
const errorModalTitle = document.getElementById('error-modal-title');
const errorModalContent = document.getElementById('error-modal-content');
const closeErrorModalBtn = document.getElementById('close-error-modal-btn');

// --- MODAL UI FUNCTIONS (Moved up to resolve initialization race condition) ---
function showErrorModal(title, contentHTML) {
    errorModalTitle.textContent = title;
    errorModalContent.innerHTML = contentHTML;
    errorModal.classList.remove('hidden');
}

function hideErrorModal() {
    errorModal.classList.add('hidden');
}

// Attach listener early so it works even if the rest of the app fails to init
closeErrorModalBtn.addEventListener('click', hideErrorModal);


try {
    // Initialize Firebase using the global firebase object provided by the script tags.
    app = firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
} catch (error) {
    console.error("Firebase initialization failed:", error);
    showErrorModal("Initialization Error", `<p>Could not initialize Firebase services. Please check the console for details and verify your firebaseConfig.js file.</p><p class="text-gray-500 mt-2 text-sm">Error: ${error.message}</p>`);
}


// --- DOM ELEMENTS ---
const appContainer = document.getElementById('app-container');
const configNeededSection = document.getElementById('config-needed-section');
const geminiKeyPrompt = document.getElementById('gemini-key-prompt');
const stripeKeyPrompt = document.getElementById('stripe-key-prompt');

// Auth
const authView = document.getElementById('auth-view');
const appSection = document.getElementById('app-section');
const authForm = document.getElementById('auth-form');
const emailInput = document.getElementById('email-input');
const passwordInput = document.getElementById('password-input');
const authTitle = document.getElementById('auth-title');
const authButton = document.getElementById('auth-button');
const authToggle = document.getElementById('auth-toggle');
const authError = document.getElementById('auth-error');
const googleSigninBtn = document.getElementById('google-signin-btn');
const orSeparator = document.getElementById('or-separator');
const forgotPasswordLink = document.getElementById('forgot-password-link');

// Main App
const userInfo = document.getElementById('user-info');
const creditsDisplay = document.getElementById('credits-display');
const logoutBtn = document.getElementById('logout-btn');
const welcomeMessage = document.getElementById('welcome-message');
const uploaderSection = document.getElementById('uploader-section');
const editorSection = document.getElementById('editor-section');
const dropzoneFile = document.getElementById('dropzone-file');
const dropzoneLabel = document.getElementById('dropzone-label');
const uploaderError = document.getElementById('uploader-error');
const imageDisplay = document.getElementById('image-display');
const spinnerContainer = document.getElementById('spinner-container');
const loadingMessage = document.getElementById('loading-message');
const changeImageBtn = document.getElementById('change-image-btn');
const downloadBtn = document.getElementById('download-btn');
const presetContainer = document.getElementById('preset-container');
const errorBox = document.getElementById('error-box');
const errorMessage = document.getElementById('error-message');

// Interactive controls
const interactiveControls = document.getElementById('interactive-controls');
const itemRemovalSection = document.getElementById('item-removal-section');
const removalPromptInput = document.getElementById('removal-prompt-input');
const removalSubmitBtn = document.getElementById('removal-submit-btn');
const customPromptSection = document.getElementById('custom-prompt-section');
const customPromptTextarea = document.getElementById('custom-prompt-textarea');
const customSubmitBtn = document.getElementById('custom-submit-btn');


// Pricing Modal
const pricingModal = document.getElementById('pricing-modal');
const purchaseOptions = document.getElementById('purchase-options');
const closeModalBtn = document.getElementById('close-modal-btn');

// --- STATE ---
let currentUser = null;
let userCredits = 0;
let userProfileUnsubscribe = null;
let originalFile = null;
let currentFile = null;
let lastUsedPresetId = null;
let authMode = 'signup'; // 'signup', 'login', or 'reset'
let isProcessing = false;
let stripe;
// The global Stripe object is loaded from a script tag in index.html



// --- AUTH FUNCTIONS ---

function updateAuthView(mode) {
    authMode = mode;
    authError.textContent = '';
    authError.classList.remove('text-green-400', 'text-red-400');
    authError.classList.add('text-red-400');

    if (mode === 'signup') {
        authTitle.textContent = 'Create an Account';
        passwordInput.classList.remove('hidden');
        authButton.textContent = 'Sign Up';
        orSeparator.classList.remove('hidden');
        googleSigninBtn.classList.remove('hidden');
        authToggle.textContent = 'Already have an account? Log In';
        forgotPasswordLink.classList.add('hidden');
    } else if (mode === 'login') {
        authTitle.textContent = 'Log In';
        passwordInput.classList.remove('hidden');
        authButton.textContent = 'Log In';
        orSeparator.classList.remove('hidden');
        googleSigninBtn.classList.remove('hidden');
        authToggle.textContent = 'Need an account? Sign Up';
        forgotPasswordLink.classList.remove('hidden');
    } else if (mode === 'reset') {
        authTitle.textContent = 'Reset Password';
        passwordInput.classList.add('hidden');
        authButton.textContent = 'Send Reset Link';
        orSeparator.classList.add('hidden');
        googleSigninBtn.classList.add('hidden');
        authToggle.textContent = 'Back to Log In';
        forgotPasswordLink.classList.add('hidden');
    }
}


async function handleAuthFormSubmit(event) {
    event.preventDefault();
    const email = emailInput.value;
    authError.textContent = '';
    authError.classList.remove('text-green-400');
    authError.classList.add('text-red-400');

    authButton.disabled = true;
    googleSigninBtn.disabled = true;
    authButton.textContent = '...';

    if (authMode === 'reset') {
        try {
            await auth.sendPasswordResetEmail(email);
            authError.classList.remove('text-red-400');
            authError.classList.add('text-green-400');
            authError.textContent = 'Password reset link sent! Check your inbox.';
        } catch (error) {
            console.error('Password reset failed:', error);
            if (error.code === 'auth/user-not-found') {
                authError.textContent = 'No account found with this email.';
            } else if (error.code === 'auth/invalid-email') {
                authError.textContent = 'Please enter a valid email address.';
            } else {
                authError.textContent = 'An error occurred. Please try again.';
            }
        }
    } else {
        const password = passwordInput.value;
        if (authMode === 'signup') {
            try {
                await auth.createUserWithEmailAndPassword(email, password);
            } catch (error) {
                console.error('Sign up failed:', error);
                if (error.code === 'auth/email-already-in-use') {
                    authError.textContent = 'This email address is already in use.';
                } else if (error.code === 'auth/weak-password') {
                    authError.textContent = 'Password is too weak (min. 6 characters).';
                } else {
                    authError.textContent = 'An error occurred. Please try again.';
                }
            }
        } else { // 'login'
            try {
                await auth.signInWithEmailAndPassword(email, password);
            } catch (error) {
                console.error('Login failed:', error);
                authError.textContent = 'Invalid email or password.';
            }
        }
    }

    authButton.disabled = false;
    googleSigninBtn.disabled = false;
    if (authMode === 'signup') authButton.textContent = 'Sign Up';
    else if (authMode === 'login') authButton.textContent = 'Log In';
    else if (authMode === 'reset') authButton.textContent = 'Send Reset Link';
}

async function handleGoogleSignIn() {
    authButton.disabled = true;
    googleSigninBtn.disabled = true;
    authError.textContent = '';
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
        await auth.signInWithPopup(provider);
        // onAuthStateChanged will handle the UI update
    } catch (error) {
        console.error('Google Sign-In failed:', error);
        if (error.code === 'auth/popup-closed-by-user') {
            authError.textContent = 'Sign-in cancelled.';
        } else if (error.code === 'auth/account-exists-with-different-credential') {
            authError.textContent = 'An account already exists with this email.';
        } else {
            authError.textContent = 'Could not sign in with Google. Please try again.';
        }
    } finally {
        authButton.disabled = false;
        googleSigninBtn.disabled = false;
    }
}


function handleLogout() {
    auth.signOut().catch(error => console.error('Logout failed:', error));
}


// --- UI FUNCTIONS ---

function showApp(user) {
    if (userProfileUnsubscribe) userProfileUnsubscribe();
    userProfileUnsubscribe = listenToUserProfile(user);

    authView.classList.add('hidden');
    appSection.classList.remove('hidden');
    userInfo.classList.remove('hidden');
    resetEditor();
}

function showAuth() {
    if (userProfileUnsubscribe) userProfileUnsubscribe();
    currentUser = null;
    userCredits = 0;
    
    updateAuthView('signup');
    authView.classList.remove('hidden');
    appSection.classList.add('hidden');
    userInfo.classList.add('hidden');
}

function checkApiKeys() {
    let keysMissing = false;
    
    // The Gemini API key check is now handled by the backend.
    // We assume it's configured if the functions can be called.

    if (!STRIPE_PUBLISHABLE_KEY || !STRIPE_PUBLISHABLE_KEY.startsWith('pk_')) {
        stripeKeyPrompt.classList.remove('hidden');
        keysMissing = true;
    }

    if (keysMissing) {
        appContainer.classList.add('hidden');
        configNeededSection.classList.remove('hidden');
        return false;
    }
    
    appContainer.classList.remove('hidden');
    configNeededSection.classList.add('hidden');
    return true;
}

function populatePresets() {
    presetContainer.innerHTML = '';
    PRESETS.forEach(preset => {
        const button = document.createElement('button');
        button.className = 'flex flex-col items-center p-3 text-center bg-gray-700/50 rounded-lg hover:bg-gray-700/80 transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed';
        button.innerHTML = `
            ${preset.iconSvg}
            <span class="text-sm font-semibold text-gray-200">${preset.name}</span>
            <span class="text-xs text-gray-400 mt-1">${preset.description}</span>
        `;
        button.onclick = () => handlePresetClick(preset);
        presetContainer.appendChild(button);
    });
}

function showSpinner(message) {
    loadingMessage.textContent = message;
    spinnerContainer.classList.add('flex');
    spinnerContainer.classList.remove('hidden');
    isProcessing = true;
    toggleUIState(false);
}

function hideSpinner() {
    spinnerContainer.classList.add('hidden');
    spinnerContainer.classList.remove('flex');
    isProcessing = false;
    toggleUIState(true);
}

function resetEditor() {
    originalFile = null;
    currentFile = null;
    lastUsedPresetId = null;
    uploaderError.textContent = '';
    editorSection.classList.add('hidden');
    uploaderSection.classList.remove('hidden');
    welcomeMessage.classList.remove('hidden');
    imageDisplay.src = '';
    downloadBtn.classList.add('hidden');
    errorBox.classList.add('hidden');
    errorMessage.textContent = '';
    hideInteractiveControls();
    // Reset the file input so the 'change' event fires for the next upload
    if (dropzoneFile) {
        dropzoneFile.value = '';
    }
}

function toggleUIState(enabled) {
    const buttons = document.querySelectorAll('#preset-container button, #change-image-btn, #download-btn, #removal-submit-btn, #custom-submit-btn');
    buttons.forEach(btn => btn.disabled = !enabled);
    
    const inputs = document.querySelectorAll('#removal-prompt-input, #custom-prompt-textarea');
    inputs.forEach(input => input.disabled = !enabled);

    if (enabled) {
        dropzoneLabel.classList.remove('cursor-not-allowed', 'opacity-50');
        dropzoneFile.disabled = false;
    } else {
        dropzoneLabel.classList.add('cursor-not-allowed', 'opacity-50');
        dropzoneFile.disabled = true;
    }
}

function showPricingModal() {
    pricingModal.classList.remove('hidden');
}

function hidePricingModal() {
    pricingModal.classList.add('hidden');
}

function hideInteractiveControls() {
    interactiveControls.classList.add('hidden');
    itemRemovalSection.classList.add('hidden');
    customPromptSection.classList.add('hidden');
    removalPromptInput.value = '';
    customPromptTextarea.value = '';
}

// --- FILE & IMAGE HANDLING ---

function handleFileSelect(file) {
    if (isProcessing) return;

    if (!file) {
        uploaderError.textContent = 'No file selected.';
        return;
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        uploaderError.textContent = 'Invalid file type. Please use PNG, JPG, or WEBP.';
        return;
    }
    if (file.size > 15 * 1024 * 1024) { // 15MB
        uploaderError.textContent = 'File is too large. Maximum size is 15MB.';
        return;
    }

    originalFile = file;
    currentFile = file;
    uploaderError.textContent = '';
    
    const reader = new FileReader();
    reader.onload = (e) => {
        imageDisplay.src = e.target.result;
        uploaderSection.classList.add('hidden');
        welcomeMessage.classList.add('hidden');
        editorSection.classList.remove('hidden');
        downloadBtn.classList.add('hidden'); // Hide download button for fresh image
    };
    reader.readAsDataURL(file);
}

// Helper to convert data URL to File object for downloading
function dataURLtoFile(dataUrl, fileName) {
    return new Promise((resolve, reject) => {
        try {
            const arr = dataUrl.split(',');
            const mime = arr[0].match(/:(.*?);/)[1];
            const bstr = atob(arr[1]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while (n--) {
                u8arr[n] = bstr.charCodeAt(n);
            }
            const file = new File([u8arr], fileName, { type: mime });
            resolve(file);
        } catch (error) {
            console.error("Error converting data URL to file:", error);
            reject(error);
        }
    });
}


function downloadImage() {
    if (!imageDisplay.src || !currentFile) return;
    const link = document.createElement('a');
    link.href = imageDisplay.src;
    
    // The file name is now correctly stored in the currentFile object.
    link.download = currentFile.name;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}


// --- CORE LOGIC ---

async function handlePresetClick(preset) {
    if (!imageDisplay.src || isProcessing) return;
    hideInteractiveControls();

    if (userCredits <= 0) {
        showPricingModal();
        return;
    }
    
    if (preset.interactive) {
        interactiveControls.classList.remove('hidden');
        if (preset.id === 'remove-item') {
            itemRemovalSection.classList.remove('hidden');
        } else if (preset.id === 'custom') {
            customPromptSection.classList.remove('hidden');
        }
    } else {
        lastUsedPresetId = preset.id;
        await processImageWithPrompt(preset.prompt);
    }
}

async function processImageWithPrompt(prompt) {
    if (!imageDisplay.src || isProcessing || !prompt || !originalFile) return;

    showSpinner('Your image is being edited by AI...');
    errorBox.classList.add('hidden');

    try {
        const dataUrl = imageDisplay.src;
        if (!dataUrl.startsWith('data:image')) {
            throw new Error("Invalid image source for editing.");
        }

        const mimeType = dataUrl.substring(dataUrl.indexOf(":") + 1, dataUrl.indexOf(";"));
        const base64Data = dataUrl.substring(dataUrl.indexOf(",") + 1);

        const idToken = await currentUser.getIdToken();

        const response = await fetch(processImageUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({
                base64Data: base64Data,
                mimeType: mimeType,
                prompt: prompt
            })
        });

        if (!response.ok) {
            if (response.status === 402) {
                // User is out of credits, show the pricing modal instead of an error message.
                showPricingModal();
                return; // Stop further execution, the 'finally' block will still hide the spinner.
            }
            const errorData = await response.json().catch(() => ({ error: response.statusText }));
            throw new Error(errorData.error || 'An unknown error occurred on the server.');
        }

        const data = await response.json();
        
        const newSrc = `data:${data.imageMimeType};base64,${data.imageData}`;
        imageDisplay.src = newSrc;

        // Update currentFile with new data and the correctly formatted name based on the ORIGINAL file.
        const nameParts = originalFile.name.split('.');
        const extension = nameParts.pop();
        const baseName = nameParts.join('.');
        
        // Ensure lastUsedPresetId has a value before constructing filename
        const presetSlug = lastUsedPresetId || 'edited-image';
        const newFileName = `${baseName}-${presetSlug}.${extension}`;

        currentFile = await dataURLtoFile(newSrc, newFileName);

        downloadBtn.classList.remove('hidden');

    } catch (error) {
        console.error("Error processing image:", error);
        errorMessage.textContent = `Error: ${error.message}`;
        errorBox.classList.remove('hidden');
    } finally {
        hideSpinner();
    }
}


// --- DATABASE & STRIPE ---

async function createUserProfileInFirestore(user) {
    if (!user) return;
    console.log(`Creating profile for new user: ${user.uid}`);
    const userDocRef = db.collection("users").doc(user.uid);
    const newUserProfile = {
        email: user.email,
        credits: 10,
        createdAt: new Date().toISOString(),
    };
    try {
        // Using set with merge prevents overwriting data if the backend function
        // or Stripe extension also creates a document.
        await userDocRef.set(newUserProfile, { merge: true });
        console.log(`Profile created for ${user.uid} with 10 credits.`);
    } catch (error) {
        console.error("Error creating user profile in Firestore:", error);
        showErrorModal("Profile Creation Failed", `<p>We couldn't set up your initial free credits. Please try logging out and back in.</p>`);
    }
}

function listenToUserProfile(user) {
    const userDocRef = db.collection('users').doc(user.uid);
    return userDocRef.onSnapshot((docSnap) => {
        if (docSnap.exists) {
            const data = docSnap.data();
            userCredits = data.credits === undefined ? 0 : data.credits;
            creditsDisplay.textContent = userCredits.toString();
        } else {
            // The backend `setupNewUser` function should create the profile,
            // but as a robust fallback, we create it from the client.
            console.log("User profile not found, creating it from client as a fallback.");
            createUserProfileInFirestore(user);
        }
    }, (error) => {
        console.error("Error listening to user profile:", error);
        creditsDisplay.textContent = 'Error';
    });
}

async function redirectToCheckout(priceId, mode) {
    if (!currentUser) {
        console.error("User not logged in for checkout");
        return;
    }

    try {
        const checkoutSessionRef = db.collection(`users/${currentUser.uid}/checkout_sessions`);
        const docRef = await checkoutSessionRef.add({
            price: priceId,
            mode: mode,
            success_url: window.location.href,
            cancel_url: window.location.href,
        });

        docRef.onSnapshot((snap) => {
            const { error, url } = snap.data();
            if (error) {
                console.error(`An error occurred: ${error.message}`);
                showErrorModal("Payment Error", `<p>${error.message}</p>`);
            }
            if (url) {
                window.location.assign(url);
            }
        });
    } catch (error) {
        console.error("Error creating checkout session:", error);
        showErrorModal("Payment Error", `<p>Could not initiate the payment process. Please try again later.</p>`);
    }
}


// --- EVENT LISTENERS ---

function addEventListeners() {
    authForm.addEventListener('submit', handleAuthFormSubmit);
    
    authToggle.addEventListener('click', (e) => {
        e.preventDefault();
        if (authMode === 'signup') {
            updateAuthView('login');
        } else if (authMode === 'login') {
            updateAuthView('signup');
        } else { // from 'reset'
            updateAuthView('login');
        }
    });

    forgotPasswordLink.addEventListener('click', (e) => {
        e.preventDefault();
        updateAuthView('reset');
    });

    logoutBtn.addEventListener('click', handleLogout);
    googleSigninBtn.addEventListener('click', handleGoogleSignIn);

    // File Uploader
    dropzoneFile.addEventListener('change', (e) => handleFileSelect(e.target.files[0]));
    dropzoneLabel.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzoneLabel.classList.add('bg-gray-700/30');
    });
    dropzoneLabel.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzoneLabel.classList.remove('bg-gray-700/30');
    });
    dropzoneLabel.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzoneLabel.classList.remove('bg-gray-700/30');
        handleFileSelect(e.dataTransfer.files[0]);
    });

    // Editor
    changeImageBtn.addEventListener('click', resetEditor);
    downloadBtn.addEventListener('click', downloadImage);
    
    // Interactive presets
    removalSubmitBtn.addEventListener('click', () => {
        const item = removalPromptInput.value.trim();
        if (item) {
            lastUsedPresetId = 'remove-item';
            // Construct a more descriptive prompt to guide the AI
            const descriptivePrompt = `Please seamlessly remove the following from the image: ${item}. Intelligently fill in the background where the object was removed to make it look natural and unedited.`;
            processImageWithPrompt(descriptivePrompt);
        }
    });
    customSubmitBtn.addEventListener('click', () => {
        const customPrompt = customPromptTextarea.value.trim();
        if (customPrompt) {
            lastUsedPresetId = 'custom';
            // Wrap the user's prompt in a more robust instruction
            const descriptivePrompt = `Apply the following custom edit to the image: "${customPrompt}". Ensure the result is a high-quality, photorealistic modification based on this instruction.`;
            processImageWithPrompt(descriptivePrompt);
        }
    });


    // Modals
    closeModalBtn.addEventListener('click', hidePricingModal);
    purchaseOptions.addEventListener('click', (e) => {
        const button = e.target.closest('button');
        if (button && button.dataset.priceId) {
            redirectToCheckout(button.dataset.priceId, button.dataset.mode);
        }
    });
}

// --- MAIN ---
function main() {
    console.log('Nano Banana Image Editor - v15.2');
    if (!checkApiKeys()) {
        return; // Stop execution if keys are missing
    }

    // Initialize Stripe
    try {
      stripe = Stripe(STRIPE_PUBLISHABLE_KEY);
    } catch (e) {
      console.error("Stripe initialization failed. Make sure the Stripe key is valid.");
      showErrorModal("Configuration Error", "<p>Could not initialize the payment system. Please ensure your Stripe Publishable Key is correct in <em>firebaseConfig.js</em>.</p>");
    }

    populatePresets();
    addEventListeners();
    
    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            showApp(user);
        } else {
            showAuth();
        }
    });
}

// Set copyright year as soon as the script loads to ensure it's always visible.
const copyrightYearEl = document.getElementById('copyright-year');
if (copyrightYearEl) {
    copyrightYearEl.textContent = new Date().getFullYear().toString();
}

main();