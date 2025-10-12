// restrict_access.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getFirestore, doc, getDoc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

// --- Firebase Config ---
const firebaseConfig = {
    apiKey: "AIzaSyDwOb4_vljD6q6-__ZWuzJF-vS3_5zmCqc",
    authDomain: "enscygen.firebaseapp.com",
    projectId: "enscygen",
    storageBucket: "enscygen.firebasestorage.app",
    messagingSenderId: "513868996763",
    appId: "1:513868996763:web:eb14657be98255570b663e",
    measurementId: "G-XL8Z4LDQB5"
};

// --- Initialize Firebase ---
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- Main Access Verification ---
async function restrictAccess(pageId) {
  onAuthStateChanged(auth, async (user) => {
    const currentURL = encodeURIComponent(window.location.href);

    if (!user) {
      console.warn("No user logged in. Redirecting to not-logged-in page...");
      window.location.href = `/ess/auth/not-logged-in.html?return=${currentURL}`;
      return;
    }

    try {
      // Hide page body until access is verified
      document.body.style.visibility = 'hidden';

      // Expose username globally
      window.CURRENT_USERNAME = user.displayName || user.email;

      // Ensure user profile exists in Firestore
      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (!userDocSnap.exists()) {
        await setDoc(userDocRef, {
          name: window.CURRENT_USERNAME,
          email: user.email,
          institution: '',
          place: '',
          gender: 'Prefer not to say',
          createdAt: serverTimestamp()
        });
      }

      // Check access for this page
      const accessDocRef = doc(db, "user_access", user.email);
      const accessDocSnap = await getDoc(accessDocRef);

      if (!accessDocSnap.exists()) {
        console.error("No access info found for this user.");
        window.location.href = "/ess/auth/no-access.html";
        return;
      }

      const pages = accessDocSnap.data().pages || [];
      if (!pages.includes(pageId)) {
        console.warn(`Access denied for page: ${pageId}`);
        window.location.href = "/ess/auth/no-access.html";
        return;
      }

      // Access granted → reveal page
      document.body.style.visibility = 'visible';
      console.log(`Access granted for page: ${pageId}`);

    } catch (error) {
      console.error("Error verifying access:", error);
      alert("Error verifying access. Please try again later.");
    }
  });
}

// --- Auto-run using global variable ---
(function () {
  const pageId = window.PROTECTED_PAGE_ID;
  if (!pageId) {
    console.error("restrict_access.js: Missing window.PROTECTED_PAGE_ID");
    document.body.style.visibility = 'visible'; // fallback
    return;
  }
  restrictAccess(pageId);
})();
