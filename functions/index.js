/**
 * v13.0 - Server-Side Credit Check
 * - Implements a secure, atomic credit check and decrement using a Firestore transaction.
 * - This prevents any possibility of misuse or race conditions.
 * - A user's credits are now verified and decremented on the server *before* the expensive Gemini API call is made.
 */
import functions from "firebase-functions";
import admin from "firebase-admin";
import { GoogleGenAI, Modality } from "@google/genai";

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();

// Whitelist of allowed origins for CORS.
const allowedOrigins = [
    'https://reimaginephotos.app',
    'https://nanobanana-image-app.web.app'
];


/**
 * Sets up a new user's profile when they sign up.
 */
export const setupNewUser = functions.region('us-west2').auth.user().onCreate(async (user) => {
    const { uid, email } = user;
    console.log(`New user signed up: ${uid}, email: ${email}. Setting up profile.`);
    const userDocRef = db.collection('users').doc(uid);
    try {
        await userDocRef.set({
            email: email,
            credits: 10,
            createdAt: new Date().toISOString(),
        }, { merge: true });
        console.log(`Successfully set initial data (10 credits) for user ${uid}.`);
    } catch (error) {
        console.error(`Error setting up profile for user ${uid}:`, error);
    }
});


/**
 * Processes an image using the Gemini API.
 */
export const processImage = functions
  .region('us-west2') 
  .runWith({
    timeoutSeconds: 300, 
    memory: '2GB', 
    secrets: ["GEMINI_KEY"],
  })
  .https.onRequest(async (request, response) => {
    console.log("Function handler invoked. Version 13.0.");
    
    const origin = request.headers.origin;
    if (allowedOrigins.includes(origin)) {
        response.set('Access-Control-Allow-Origin', origin);
    }

    if (request.method === 'OPTIONS') {
        response.set('Access-control-Allow-Methods', 'POST');
        response.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        response.set('Access-Control-Max-Age', '3600');
        return response.status(204).send('');
    }
    
    let uid;
    try {
      console.log("Attempting to verify ID token...");
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new Error("No Bearer token provided.");
      }
      const idToken = authHeader.split('Bearer ')[1];
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      uid = decodedToken.uid;
      console.log("ID token verified successfully for user:", uid);
    } catch (error) {
      console.error("Token verification failed:", error);
      return response.status(403).json({ error: "Unauthorized: Invalid token." });
    }

    const { base64Data, mimeType, prompt } = request.body;
    if (!base64Data || !mimeType || !prompt) {
        return response.status(400).json({ error: "Bad Request: Missing 'base64Data', 'mimeType', or 'prompt'." });
    }
    console.log("Auth passed. Request data validated for user:", uid);

    try {
        const userDocRef = db.collection('users').doc(uid);

        // --- ATOMIC TRANSACTION FOR CREDIT CHECK ---
        await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userDocRef);
            if (!userDoc.exists) {
                throw new Error("User profile not found.");
            }
            const credits = userDoc.data().credits;
            if (credits < 1) {
                throw new Error("Insufficient credits.");
            }
            // If credits are sufficient, decrement them.
            transaction.update(userDocRef, { credits: admin.firestore.FieldValue.increment(-1) });
        });
        console.log(`Credit check passed and decremented for user ${uid}.`);
        // --- END TRANSACTION ---

    } catch (error) {
        console.error(`Credit check failed for user ${uid}:`, error.message);
        if (error.message === "Insufficient credits.") {
            return response.status(402).json({ error: "Payment Required: You are out of credits." });
        }
        return response.status(400).json({ error: `User validation failed: ${error.message}` });
    }


    try {
        console.log("Attempting to process image with Gemini...");
        const geminiKey = process.env.GEMINI_KEY;
        if (!geminiKey) {
            console.error("FATAL: Gemini API key is not available.");
            return response.status(500).json({ error: "Internal Server Error: Image processing service is not configured." });
        }
        
        const ai = new GoogleGenAI({ apiKey: geminiKey });
        const imagePart = { inlineData: { data: base64Data, mimeType } };
        const textPart = { text: prompt };

        const result = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image-preview',
          contents: { parts: [imagePart, textPart] },
          config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
        });
        
        const imageResultPart = result.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data);
        if (imageResultPart?.inlineData) {
             console.log("Successfully processed image with Gemini.");
             console.log("API_USED: Gemini");
             return response.status(200).json({
                imageData: imageResultPart.inlineData.data,
                imageMimeType: imageResultPart.inlineData.mimeType,
            });
        } else {
             const textResponse = result.text?.trim() || "No image returned. The request may have been blocked for safety reasons.";
             throw new Error(`The AI model responded with text instead of an image: "${textResponse}"`);
        }
    } catch (geminiError) {
        console.error(`FATAL: Gemini processing failed. Error: ${geminiError.message}`);
        // IMPORTANT: Since the API call failed, we should refund the credit.
        const userDocRef = db.collection('users').doc(uid);
        await userDocRef.update({ credits: admin.firestore.FieldValue.increment(1) });
        console.log(`Credit refunded to user ${uid} due to processing error.`);
        return response.status(500).json({ error: "Image processing service is currently unavailable." });
    }
});