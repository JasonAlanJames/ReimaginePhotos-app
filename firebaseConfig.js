// TODO: Replace with your app's Firebase project configuration
// You can get this from the Firebase Console:
// Project Settings > General > Your apps > Firebase SDK snippet > Config
export const firebaseConfig = {
  apiKey: "XXXXXXXXX",
  authDomain: "nanobanana-image-app.firebaseapp.com",
  projectId: "nanobanana-image-app",
  storageBucket: "nanobanana-image-app.appspot.com",
  messagingSenderId: "485460752686",
  appId: "1:485460752686:web:5f4f892552b0aefd4b62bf"
};

// --- API KEYS ---

// The Gemini API Key is now stored securely on the backend in a Cloud Function.
// It has been removed from this client-side file.

// Get your Stripe Publishable key from the Stripe Dashboard: https://dashboard.stripe.com/apikeys
// You can use your "Test" key (it starts with pk_test_) to test payments.

export const STRIPE_PUBLISHABLE_KEY = "pk_live_w4KxwMA4ARX3WOaBaBVB4vPp";
